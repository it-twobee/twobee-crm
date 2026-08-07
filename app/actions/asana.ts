'use server'

import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { isAdminRole, isSuperAdminRaw } from '@/lib/permissions'
import { boardView, mapTasks, summarize, toCsv, type AsanaTask, type Board, type TaskRow } from '@/lib/asana'

/**
 * §215 — Il travaso da Asana, in **sola lettura**.
 *
 * Non scrive niente: né su Asana né sul database. Legge il workspace, incrocia
 * board e assegnatari con clienti e profili di TwoBee, e restituisce le righe
 * con scritto sopra cosa le blocca. Il file lo si scarica e lo si guarda prima
 * di decidere qualsiasi cosa — che è il motivo per cui questa sezione esiste ed
 * è temporanea.
 */

const API = 'https://app.asana.com/api/1.0'

async function requireAdmin() {
  const profile = await getSessionProfile()
  const isAdmin = isSuperAdminRaw(profile?.email, profile?.app_role)
    || isAdminRole(profile?.app_role) || profile?.role === 'admin'
  if (!isAdmin) throw new Error('Sezione riservata agli admin.')
}

/**
 * Asana risponde 429 quando si va troppo veloci e dice in quanti secondi
 * riprovare. Rispettarlo è più corto che scoprire a metà travaso che mancano
 * trenta board: un errore parziale qui è peggio di un'attesa.
 */
async function get<T>(path: string, token: string, attempt = 0): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (res.status === 429 && attempt < 4) {
    const wait = Number(res.headers.get('Retry-After') ?? 5)
    await new Promise(r => setTimeout(r, (wait + 1) * 1000))
    return get<T>(path, token, attempt + 1)
  }
  if (!res.ok) throw new Error(`Asana ${res.status} su ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

type Page<T> = { data: T[]; next_page?: { offset: string } | null }

/** Segue `next_page` finché ce n'è: 146 board non stanno in una risposta sola. */
async function all<T>(path: string, token: string): Promise<T[]> {
  const out: T[] = []
  let offset: string | undefined
  do {
    const page = await get<Page<T>>(`${path}${path.includes('?') ? '&' : '?'}limit=100${offset ? `&offset=${offset}` : ''}`, token)
    out.push(...page.data)
    offset = page.next_page?.offset
  } while (offset)
  return out
}

/** A gruppi di cinque: una board alla volta ci metterebbe minuti, tutte insieme prende 429. */
async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)))
  }
  return out
}

type RawTask = {
  gid: string; name: string; due_on: string | null; notes: string | null
  resource_subtype: string
  assignee: { email?: string | null } | null
  memberships: { section?: { name?: string } | null }[]
}

export type AsanaScan = {
  workspace: string
  boards: number
  rows: TaskRow[]
  summary: ReturnType<typeof summarize>
  csv: string
  /** board che hanno risposto con un errore: dirlo, non farle sparire */
  failed: { name: string; reason: string }[]
}

export async function scanAsana(includeCommercial = false): Promise<AsanaScan> {
  await requireAdmin()
  const token = process.env.ASANA_PAT
  if (!token) throw new Error('ASANA_PAT non configurato: senza token non c’è niente da leggere.')

  const me = await get<{ data: { workspaces: { gid: string; name: string }[] } }>(
    'users/me?opt_fields=workspaces.name', token)
  const ws = me.data.workspaces[0]
  if (!ws) throw new Error('Il token non vede nessun workspace.')

  const boards = await all<Board>(`projects?workspace=${ws.gid}&archived=false&opt_fields=name`, token)

  /* Le board commerciali e quelle interne si saltano di default: sono ~40
     richieste per righe che poi risulterebbero comunque bloccate. Chi le vuole
     le chiede, e allora si pagano. */
  const wanted = boards.filter(b => {
    const k = boardView(b).kind
    return includeCommercial || (k !== 'prospect' && k !== 'interna')
  })

  const failed: { name: string; reason: string }[] = []
  const fetched = await pool(wanted, 5, async (b): Promise<AsanaTask[]> => {
    try {
      const raw = await all<RawTask>(
        `tasks?project=${b.gid}&completed_since=now&opt_fields=name,due_on,notes,resource_subtype,assignee.email,memberships.section.name`,
        token)
      return raw.map(t => ({
        gid: t.gid,
        name: t.name,
        boardGid: b.gid,
        section: t.memberships?.[0]?.section?.name ?? null,
        assigneeEmail: t.assignee?.email ?? null,
        dueOn: t.due_on,
        notes: t.notes,
        isMilestone: t.resource_subtype === 'milestone',
      }))
    } catch (e) {
      failed.push({ name: b.name, reason: e instanceof Error ? e.message : 'errore' })
      return []
    }
  })

  const tasks = fetched.flat()

  const sb = await createClient()
  const [{ data: clients }, { data: profiles }] = await Promise.all([
    sb.from('clients').select('id, company_name, display_name'),
    sb.from('profiles').select('id, email').eq('is_active', true),
  ])

  /* Un cliente si può chiamare in due modi — «Icura Impresa» in anagrafica,
     «Icura» su Asana — quindi entrambi i nomi entrano nella corrispondenza. */
  const clientNames = (clients ?? []).flatMap(c => {
    const names = [c.company_name, c.display_name].filter(Boolean) as string[]
    return Array.from(new Set(names)).map(name => ({ id: c.id, name }))
  })

  const rows = mapTasks(tasks, boards, clientNames, (profiles ?? []) as { id: string; email: string }[])
  return {
    workspace: ws.name,
    boards: wanted.length,
    rows,
    summary: summarize(rows),
    csv: toCsv(rows),
    failed,
  }
}

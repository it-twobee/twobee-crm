import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { giornoDopo } from '@/lib/calendario'
import { oggiLocale } from '@/lib/calendario-lavorativo'
import { INTERNAL_COARSE_ROLES } from '@/lib/permissions'
import { SOCIAL_SERVICE_TYPE, intervalloGriglia, isMese, meseDi, progettiMiei, settimanaScoperta } from '@/lib/social'
import type { SocialBoardData, SocialContentRow, SocialProjectRow } from '@/lib/social-types'

/* §467 — Quello che serve alla pagina Social e alla tab del cliente, letto
   **con la sessione**: decide la RLS, quindi un esterno vede solo i suoi
   progetti e nessuno passa dal service role per guardare. */

/** Oltre, la pagina lo dice: un calendario tagliato in silenzio mente. */
const LIMITE = 1000

export async function loadSocialBoard(db: SupabaseClient, opts: {
  userId: string
  mese?: string | null
  clientId?: string | null
  /** `clients_workspace` nel workspace: niente economics nel payload (§211). */
  clientsTable: 'clients' | 'clients_workspace'
}): Promise<SocialBoardData> {
  const oggi = oggiLocale()
  const mese = isMese(opts.mese) ? opts.mese : meseDi(oggi)
  const griglia = intervalloGriglia(mese)

  let progettiQ = db.from('projects').select('id, client_id, name, manager_id, status')
    .eq('service_type', SOCIAL_SERVICE_TYPE).is('deleted_at', null).order('name')
  if (opts.clientId) progettiQ = progettiQ.eq('client_id', opts.clientId)
  const progetti = await progettiQ
  if (progetti.error) return vuoto(mese, oggi, 'Non è stato possibile leggere i progetti social.')
  const projectRows = (progetti.data ?? []) as Omit<SocialProjectRow, 'client_name'>[]
  const ids = projectRows.map(p => p.id)
  const clientIds = Array.from(new Set(projectRows.map(p => p.client_id).filter(Boolean)))
  if (!ids.length) return { ...vuoto(mese, oggi), staff: await staff(db) }

  const [clienti, contenuti, prossimi, membri, assegnati, responsabili, milestones, persone] = await Promise.all([
    db.from(opts.clientsTable).select('id, company_name, display_name').in('id', clientIds),
    db.from('social_contents')
      .select('id, client_id, project_id, milestone_id, planned_date, planned_time, channels, format, title, caption, status, owner_id, created_by, updated_at, links:social_content_links(channel, url), media:social_content_media(id, name, mime, size, kind, sort_order)')
      .in('project_id', ids).gte('planned_date', griglia.dal).lt('planned_date', griglia.al)
      .order('planned_date').limit(LIMITE),
    // la settimana da oggi può cadere fuori dal mese che si guarda
    db.from('social_contents').select('project_id, planned_date, status')
      .in('project_id', ids).gte('planned_date', oggi).lt('planned_date', giornoDopo(oggi, 7)).limit(LIMITE),
    db.from('project_members').select('project_id, profile_id').in('project_id', ids),
    db.from('task_assignees').select('task:tasks!inner(project_id)').eq('profile_id', opts.userId).in('task.project_id', ids),
    db.from('social_contents').select('project_id, owner_id').eq('owner_id', opts.userId).in('project_id', ids).limit(LIMITE),
    db.from('milestones').select('id, title, due_date, status, workstream:project_workstreams!inner(project_id)')
      .in('workstream.project_id', ids).order('due_date', { nullsFirst: false }),
    staff(db),
  ])
  const errore = [clienti, contenuti, prossimi, membri, assegnati, responsabili, milestones].find(r => r.error)
  if (errore) return { ...vuoto(mese, oggi, 'Non è stato possibile leggere tutto il calendario. Riprova.'), staff: persone }

  const nomi = new Map((clienti.data ?? []).map(c => [c.id as string, (c.display_name || c.company_name) as string]))
  const projects: SocialProjectRow[] = projectRows.map(p => ({ ...p, client_name: nomi.get(p.client_id) ?? null }))
  const contents = ((contenuti.data ?? []) as unknown as SocialContentRow[]).map(c => ({
    ...c,
    planned_time: c.planned_time ? c.planned_time.slice(0, 5) : null,
    media: [...(c.media ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }))
  const miei = progettiMiei({
    userId: opts.userId,
    progetti: projectRows,
    membri: (membri.data ?? []) as { project_id: string; profile_id: string }[],
    assegnati: ((assegnati.data ?? []) as unknown as { task: { project_id: string } | null }[]).map(a => a.task?.project_id).filter(Boolean) as string[],
    responsabili: (responsabili.data ?? []) as { project_id: string; owner_id: string | null }[],
  })
  const vicini = (prossimi.data ?? []) as { project_id: string; planned_date: string; status: string }[]
  const attivi = projects.filter(p => p.status === 'active')
  return {
    mese, oggi, projects, contents,
    mieiIds: Array.from(miei),
    scopertiIds: attivi.filter(p => settimanaScoperta(vicini.filter(v => v.project_id === p.id), oggi)).map(p => p.id),
    milestones: ((milestones.data ?? []) as unknown as { id: string; title: string; due_date: string | null; status: string; workstream: { project_id: string } }[])
      .map(m => ({ id: m.id, title: m.title, due_date: m.due_date, status: m.status, project_id: m.workstream.project_id })),
    staff: persone,
    parziale: (contenuti.data?.length ?? 0) >= LIMITE,
    errore: null,
  }
}

/** Chi può avere in carico un contenuto: solo «uno di noi», mai un account del portale (§409). */
async function staff(db: SupabaseClient) {
  const r = await db.from('profiles').select('id, full_name, avatar_url')
    .eq('is_active', true).in('role', INTERNAL_COARSE_ROLES).order('full_name')
  return (r.data ?? []) as SocialBoardData['staff']
}

function vuoto(mese: string, oggi: string, errore: string | null = null): SocialBoardData {
  return { mese, oggi, projects: [], contents: [], mieiIds: [], scopertiIds: [], milestones: [], staff: [], parziale: false, errore }
}

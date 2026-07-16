/**
 * Import massivo dei progetti Asana attivi dentro TwoBee OS.
 *
 * Due fasi, perché il legame progetto→cliente non è deducibile in modo affidabile:
 * la fase 1 propone, tu correggi, la fase 2 scrive.
 *
 *   npx tsx scripts/import-asana.ts --dry-run   # genera asana-import-map.json
 *   <apri il file, completa clientId/kind/manager, metti skip:true su cosa non vuoi>
 *   npx tsx scripts/import-asana.ts --apply     # scrive su Supabase (idempotente)
 *
 * Rilanciabile: progetti e task sono agganciati per asana_gid, quindi un secondo
 * --apply aggiorna invece di duplicare.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const MAP_FILE = resolve(process.cwd(), 'asana-import-map.json')
const ASANA_BASE = 'https://app.asana.com/api/1.0'

for (const line of existsSync('.env.local') ? readFileSync('.env.local', 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const pat = process.env.ASANA_PAT
if (!url || !key || !pat) {
  console.error('Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ASANA_PAT in .env.local')
  process.exit(1)
}
const sb = createClient(url, key)

type MapRow = {
  asanaGid: string
  asanaName: string
  clientId: string | null
  clientNameHint: string
  projectKind: 'growth' | 'marketing' | 'digital' | 'ai'
  projectType: 'ecommerce' | 'lead_gen' | 'sito_web' | 'app_ai' | 'campagna' | 'custom'
  managerEmail: string | null
  skip: boolean
}

async function asana<T>(path: string): Promise<{ data: T; next_page: { offset: string } | null }> {
  const res = await fetch(`${ASANA_BASE}${path}`, { headers: { Authorization: `Bearer ${pat}` } })
  if (res.status === 429) {
    const wait = Number(res.headers.get('Retry-After') ?? 5)
    await new Promise(r => setTimeout(r, wait * 1000))
    return asana<T>(path)
  }
  if (!res.ok) throw new Error(`Asana ${res.status} su ${path}: ${await res.text()}`)
  return res.json()
}

async function asanaAll<T>(path: string): Promise<T[]> {
  const out: T[] = []
  let page: string | null = `${path}${path.includes('?') ? '&' : '?'}limit=100`
  while (page) {
    const r: { data: T[]; next_page: { offset: string } | null } = await asana<T[]>(page)
    out.push(...r.data)
    page = r.next_page ? `${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${r.next_page.offset}` : null
  }
  return out
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

// I nomi Asana seguono "Cliente - SERVIZIO" (o "Ad Hoc - Cliente"), con refusi
// ricorrenti ("Sartoria Cpndotti", "Industria Service"): il cliente \u00e8 il pezzo
// prima del trattino, confrontato con tolleranza a un paio di caratteri.
const lev = (a: string, b: string): number => {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

const isProspect = (name: string) => /^\s*pro[ps]{1,2}[es]ct\b/i.test(name.replace(/\s+/g, ' '))

// Board di servizio Asana: non sono lavoro, non diventano progetti.
const isJunk = (name: string) => /^attività già assegnate|^duplicate of|^prospect list$/i.test(name.trim())

const ALIAS: { re: RegExp; client: string }[] = [
  { re: /condotti\s*&\s*co/i, client: 'Sartoria Condotti' },
  { re: /^industria\s+service/i, client: 'Industrial Services & Facility' },
]

function clientCandidates(name: string): string[] {
  const parts = name.split(/\s*[-\u2013]\s*/).map(p => p.trim()).filter(Boolean)
  const out = [name]
  if (/^ad hoc$/i.test(parts[0] ?? '')) out.push(parts.slice(1).join(' - '))
  else if (parts.length > 1) out.push(parts[0])
  return out
}

function matchClient(name: string, clients: { id: string; company_name: string | null; display_name: string | null }[]) {
  for (const a of ALIAS) {
    if (!a.re.test(name)) continue
    const cl = clients.find(c => norm(String(c.display_name ?? c.company_name)) === norm(a.client))
    if (cl) return { id: cl.id, label: String(cl.display_name ?? cl.company_name), score: 999 }
  }
  for (const cand of clientCandidates(name)) {
    const c = norm(cand)
    if (c.length < 3) continue
    let best: { id: string; label: string; score: number } | null = null
    for (const cl of clients) {
      for (const raw of [cl.display_name, cl.company_name].filter(Boolean).map(String)) {
        const cn = norm(raw)
        if (cn.length < 3) continue
        const contains = c.includes(cn) || cn.includes(c)
        const d = lev(c, cn)
        const near = d <= Math.max(1, Math.floor(Math.min(c.length, cn.length) * 0.2))
        // Il prefisso vale solo se \u00e8 un pezzo sostanzioso del nome cliente
        // ("icura" \u2192 "icuraimpresa"), altrimenti "seven" pesca qualsiasi cosa.
        const prefix = cn.startsWith(c) && c.length >= Math.min(5, cn.length * 0.5)
        if (!contains && !near && !prefix) continue
        const score = (contains ? 100 : 0) + (prefix ? 50 : 0) - d
        if (!best || score > best.score) best = { id: cl.id, label: raw, score }
      }
    }
    if (best) return best
  }
  return null
}

async function dryRun() {
  const workspaces = await asanaAll<{ gid: string; name: string }>('/workspaces')
  const projects: { gid: string; name: string }[] = []
  for (const w of workspaces) {
    projects.push(...await asanaAll<{ gid: string; name: string }>(
      `/workspaces/${w.gid}/projects?archived=false&opt_fields=gid,name`))
  }

  const { data: clients } = await sb.from('clients').select('id, company_name, display_name')
  const existing = await sb.from('projects').select('asana_gid').not('asana_gid', 'is', null)
  const already = new Set((existing.data ?? []).map(r => r.asana_gid))

  const rows: MapRow[] = projects.map(p => {
    const prospect = isProspect(p.name)
    const junk = isJunk(p.name)
    const hit = prospect || junk ? null : matchClient(p.name, clients ?? [])
    return {
      asanaGid: p.gid,
      asanaName: p.name,
      clientId: hit?.id ?? null,
      clientNameHint: prospect ? '⏭ prospect (pipeline commerciale, non progetto)'
        : junk ? '⏭ board di servizio Asana'
        : hit ? hit.label : '❓ DA COMPILARE',
      projectKind: 'digital',
      projectType: 'custom',
      managerEmail: null,
      skip: already.has(p.gid) || prospect || junk,
    }
  })

  writeFileSync(MAP_FILE, JSON.stringify(rows, null, 2))
  const todo = rows.filter(r => !r.clientId && !r.skip).length
  console.log(`\n${rows.length} progetti Asana attivi → ${MAP_FILE}`)
  console.log(`  ${rows.filter(r => r.clientId).length} con cliente proposto in automatico`)
  console.log(`  ${todo} SENZA cliente: vanno compilati a mano (clientId), altrimenti li salto`)
  console.log(`  ${rows.filter(r => already.has(r.asanaGid)).length} già importati in passato (skip:true)`)
  console.log(`  ${projects.filter(p => isProspect(p.name)).length} prospect esclusi (skip:true)`)
  console.log(`\nClienti disponibili:`)
  for (const c of clients ?? []) console.log(`  ${c.id}  ${c.display_name ?? c.company_name}`)
}

async function apply() {
  if (!existsSync(MAP_FILE)) {
    console.error(`Manca ${MAP_FILE}. Lancia prima: npx tsx scripts/import-asana.ts --dry-run`)
    process.exit(1)
  }
  const rows: MapRow[] = JSON.parse(readFileSync(MAP_FILE, 'utf8'))

  const { data: profiles } = await sb.from('profiles').select('id, email, full_name')
  const byEmail = new Map((profiles ?? []).map(p => [String(p.email).toLowerCase(), p.id]))
  const importer = byEmail.get('m.lucci@twobee.it') ?? null

  const unmatched = new Set<string>()
  let projOk = 0, tasksNew = 0, tasksUpd = 0

  for (const row of rows) {
    if (row.skip) continue
    if (!row.clientId) {
      console.log(`· salto "${row.asanaName}" — nessun clientId nel mapping`)
      continue
    }

    const fields = 'gid,name,notes,completed,due_on,start_on,assignee.email,resource_subtype,memberships.section.name'
    const tasks = await asanaAll<{
      gid: string; name: string; notes: string; completed: boolean
      due_on: string | null; start_on: string | null
      assignee: { email?: string } | null; resource_subtype: string
      memberships: { section?: { name?: string } }[]
    }>(`/projects/${row.asanaGid}/tasks?opt_fields=${fields}`)

    if (tasks.length === 0) {
      console.log(`· salto "${row.asanaName}" — progetto Asana vuoto`)
      continue
    }

    const projPayload = {
      asana_gid: row.asanaGid,
      name: row.asanaName,
      client_id: row.clientId,
      status: 'attivo',
      project_kind: row.projectKind,
      project_type: row.projectType,
      manager_id: row.managerEmail ? byEmail.get(row.managerEmail.toLowerCase()) ?? null : null,
    }

    // Niente upsert: l'indice unique su asana_gid è parziale (WHERE NOT NULL) e
    // ON CONFLICT non può inferirlo senza ripeterne il predicato, che PostgREST
    // non espone. Stessa strategia dei task.
    const { data: prevProj } = await sb.from('projects').select('id').eq('asana_gid', row.asanaGid).maybeSingle()
    const { data: proj, error: pErr } = prevProj
      ? await sb.from('projects').update(projPayload as never).eq('id', prevProj.id).select('id').single()
      : await sb.from('projects').insert(projPayload as never).select('id').single()
    if (pErr || !proj) { console.error(`✗ progetto "${row.asanaName}": ${pErr?.message}`); continue }
    projOk++

    for (const t of tasks) {
      const email = t.assignee?.email?.toLowerCase() ?? null
      const assigneeId = email ? byEmail.get(email) ?? null : null
      if (email && !assigneeId) unmatched.add(email)

      const payload = {
        project_id: proj.id,
        title: t.name || '(senza titolo)',
        description: t.notes || null,
        status: t.completed ? 'completato' : 'da_fare',
        due_date: t.due_on ?? null,
        start_date: t.start_on ?? null,
        is_milestone: t.resource_subtype === 'milestone',
        // La sezione Asana ("DESIGN", "QA", "SET LIVE!"…) è l'unica struttura a fasi
        // reale che i task hanno: la conservo qui invece di inventare sprint.
        section: t.memberships?.find(m => m.section?.name)?.section?.name ?? null,
        assignee_id: assigneeId,
        priority: 'media',
        asana_gid: t.gid,
      }

      const { data: prev } = await sb.from('tasks').select('id').eq('asana_gid', t.gid).maybeSingle()
      const { data: saved, error: tErr } = prev
        ? await sb.from('tasks').update(payload as never).eq('id', prev.id).select('id').single()
        : await sb.from('tasks').insert(payload as never).select('id').single()
      if (tErr || !saved) { console.error(`  ✗ task "${t.name}": ${tErr?.message}`); continue }
      prev ? tasksUpd++ : tasksNew++

      // task_assignees è la sorgente canonica: va tenuta in sync con assignee_id
      // esattamente come fa setTaskAssignees (non invocabile da script: vuole una sessione).
      const del = sb.from('task_assignees').delete().eq('task_id', saved.id)
      await (assigneeId ? del.neq('profile_id', assigneeId) : del)
      if (assigneeId) {
        await sb.from('task_assignees').upsert({
          task_id: saved.id,
          profile_id: assigneeId,
          is_primary_owner: true,
          role: 'owner',
          assigned_by: importer,
        } as never, { onConflict: 'task_id,profile_id' })
      }
    }
    console.log(`✓ ${row.asanaName} — ${tasks.length} task`)
  }

  console.log(`\nFatto: ${projOk} progetti · ${tasksNew} task nuove · ${tasksUpd} aggiornate`)
  if (unmatched.size) {
    console.log(`\n⚠ Assegnatari Asana senza profilo TwoBee (task lasciate non assegnate):`)
    for (const e of Array.from(unmatched)) console.log(`  ${e}`)
  }
}

const mode = process.argv[2]
if (mode === '--dry-run') dryRun().catch(e => { console.error(e); process.exit(1) })
else if (mode === '--apply') apply().catch(e => { console.error(e); process.exit(1) })
else { console.error('Uso: npx tsx scripts/import-asana.ts --dry-run | --apply'); process.exit(1) }

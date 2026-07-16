/**
 * Import dei progetti Asana attivi dentro TwoBee OS, rispettando la gerarchia
 * progetto → milestone → task → sottotask.
 *
 * Su Asana la struttura è implicita nei nomi delle board, non nell'API:
 *   "Fatima Leo"                 board MASTER  → il progetto del cliente.
 *                                I suoi task sono milestone (una per servizio),
 *                                e ha già una sezione "Ad Hoc".
 *   "Fatima Leo - WEB SITE"      board SERVIZIO → la checklist di quella milestone,
 *                                divisa in fasi (DESIGN, SVILUPPO, QA…).
 *   "Ad Hoc - Fatima Leo"        board AD HOC  → richieste una tantum.
 *
 * Su TwoBee diventa:
 *   progetto ← master · milestone ← task is_milestone del master (senza sprint)
 *   task     ← fase della checklist · sottotask ← task della checklist
 *   milestone "Ad Hoc" ← board Ad Hoc + sezione "Ad Hoc" del master
 *
 *   npx tsx scripts/import-asana.ts --dry-run   # genera/aggiorna asana-import-map.json
 *   npx tsx scripts/import-asana.ts --preview   # stampa l'albero che verrebbe creato
 *   npx tsx scripts/import-asana.ts --apply     # scrive su Supabase (idempotente)
 *
 * Idempotente: ogni riga creata porta un asana_gid (sintetico per i nodi che su
 * Asana non esistono, es. "sec-<gid>-design"), quindi un secondo --apply aggiorna.
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

type AsanaTask = {
  gid: string; name: string; notes: string; completed: boolean
  due_on: string | null; start_on: string | null
  assignee: { email?: string } | null; resource_subtype: string
  memberships: { section?: { gid?: string; name?: string } }[]
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
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

const slug = (s: string) => norm(s).slice(0, 24) || 'x'

// ── Classificazione delle board ────────────────────────────────────────────────
// Il trattino non basta: "Josè Restaurant - Tenuta Villa Guerra" è un master,
// "Elettra -GOOGLE ADS" è un servizio. Decide il vocabolario dei servizi.
const SERVICES: { re: RegExp; canon: string }[] = [
  { re: /(web\s*site|sito\s*web)/i, canon: 'Sito Web' },
  { re: /meta\s*ads/i, canon: 'Meta Ads' },
  { re: /google\s*ads/i, canon: 'Google Ads' },
  { re: /marketing\s*automation/i, canon: 'Marketing Automation' },
  { re: /tracking/i, canon: 'Tracking' },
  { re: /reporting/i, canon: 'Reporting' },
  { re: /(analisi|strategia)/i, canon: 'Analisi & Strategia' },
  { re: /social/i, canon: 'Social Media' },
]

const isProspect = (name: string) => /^\s*pro[ps]{1,2}[es]ct\b/i.test(name.replace(/\s+/g, ' '))
const isJunk = (name: string) => /^attività già assegnate|^duplicate of|^prospect list$/i.test(name.trim())
const isAdHocBoard = (name: string) => /^\s*ad\s*hoc\b/i.test(name.trim())
const isAdHocSection = (name: string | undefined) => !!name && /ad\s*hoc/i.test(name)

function serviceOf(boardName: string): string | null {
  const parts = boardName.split(/\s*[-–]\s*/).map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  for (const part of parts.slice(1)) {
    const hit = SERVICES.find(s => s.re.test(part))
    if (hit) return hit.canon
  }
  return null
}

type Role = 'master' | 'service' | 'adhoc'
const roleOf = (name: string): Role => isAdHocBoard(name) ? 'adhoc' : serviceOf(name) ? 'service' : 'master'

// ── Il piano: cosa verrà creato, prima di toccare il DB ────────────────────────
type PlanTask = { gid: string; title: string; notes: string; done: boolean; due: string | null; email: string | null }
type PlanPhase = { key: string; title: string; tasks: PlanTask[] }
type PlanMilestone = {
  gid: string; title: string; due: string | null; done: boolean; email: string | null
  source: 'master' | 'checklist-nuova' | 'checklist-ambigua'
  phases: PlanPhase[]
  loose: PlanTask[]
}
type PlanProject = {
  clientId: string; clientName: string; projectName: string; masterGid: string
  kind: string; type: string; managerEmail: string | null
  milestones: PlanMilestone[]
  warnings: string[]
}

const toPlanTask = (t: AsanaTask): PlanTask => ({
  gid: t.gid, title: t.name?.trim() || '(senza titolo)', notes: t.notes ?? '',
  done: t.completed, due: t.due_on ?? null, email: t.assignee?.email?.toLowerCase() ?? null,
})

async function buildPlan(): Promise<PlanProject[]> {
  const rows: MapRow[] = JSON.parse(readFileSync(MAP_FILE, 'utf8'))
  const live = rows.filter(r => r.clientId && !r.skip && !isProspect(r.asanaName) && !isJunk(r.asanaName))

  const byClient = new Map<string, MapRow[]>()
  for (const r of live) {
    const k = r.clientId!
    if (!byClient.has(k)) byClient.set(k, [])
    byClient.get(k)!.push(r)
  }

  const plans: PlanProject[] = []
  for (const [clientId, boards] of Array.from(byClient)) {
    const warnings: string[] = []
    const masters = boards.filter(b => roleOf(b.asanaName) === 'master')
    const services = boards.filter(b => roleOf(b.asanaName) === 'service')
    const adhocs = boards.filter(b => roleOf(b.asanaName) === 'adhoc')
    if (masters.length === 0) { warnings.push('nessuna board master: progetto saltato'); continue }

    // Più master (rari): vince quella con più milestone, le altre confluiscono.
    const masterTasks = new Map<string, AsanaTask[]>()
    for (const m of masters) {
      masterTasks.set(m.asanaGid, await asanaAll<AsanaTask>(
        `/projects/${m.asanaGid}/tasks?opt_fields=gid,name,notes,completed,due_on,start_on,assignee.email,resource_subtype,memberships.section.name,memberships.section.gid`))
    }
    const master = masters.sort((a, b) =>
      (masterTasks.get(b.asanaGid)!.filter(t => t.resource_subtype === 'milestone').length) -
      (masterTasks.get(a.asanaGid)!.filter(t => t.resource_subtype === 'milestone').length))[0]
    if (masters.length > 1) warnings.push(`${masters.length} board master, uso "${master.asanaName.trim()}" e ci verso le altre`)

    const allMasterTasks = masters.flatMap(m => masterTasks.get(m.asanaGid)!)
    const milestones: PlanMilestone[] = []

    for (const t of allMasterTasks.filter(t => t.resource_subtype === 'milestone')) {
      milestones.push({ ...toPlanTask(t), source: 'master', phases: [], loose: [] })
    }

    // Ad Hoc: board dedicate + sezione "Ad Hoc" dentro il master.
    const adhocTasks: PlanTask[] = []
    for (const a of adhocs) {
      const ts = await asanaAll<AsanaTask>(`/projects/${a.asanaGid}/tasks?opt_fields=gid,name,notes,completed,due_on,start_on,assignee.email,resource_subtype,memberships.section.name`)
      adhocTasks.push(...ts.map(toPlanTask))
    }
    const adhocInMaster = allMasterTasks.filter(t =>
      t.resource_subtype !== 'milestone' && t.memberships?.some(m => isAdHocSection(m.section?.name)))
    adhocTasks.push(...adhocInMaster.map(toPlanTask))
    if (adhocTasks.length) {
      milestones.push({
        gid: `adhoc-${master.asanaGid}`, title: 'Ad Hoc', due: null, done: false, email: null,
        source: 'master', phases: [], loose: adhocTasks,
      })
    }

    // Task del master né milestone né Ad Hoc: non hanno un posto nel modello.
    const orphans = allMasterTasks.filter(t =>
      t.resource_subtype !== 'milestone' && !t.memberships?.some(m => isAdHocSection(m.section?.name)))
    if (orphans.length) {
      milestones.push({
        gid: `altro-${master.asanaGid}`, title: 'Altro', due: null, done: false, email: null,
        source: 'master', phases: [], loose: orphans.map(toPlanTask),
      })
      warnings.push(`${orphans.length} task del master fuori da milestone e Ad Hoc → milestone "Altro"`)
    }

    // Checklist di servizio → milestone corrispondente (1:1), nuova (0), o propria (>1).
    const createdByCanon = new Map<string, PlanMilestone>()
    for (const s of services) {
      const canon = serviceOf(s.asanaName)!
      const tasks = await asanaAll<AsanaTask>(`/projects/${s.asanaGid}/tasks?opt_fields=gid,name,notes,completed,due_on,start_on,assignee.email,resource_subtype,memberships.section.name,memberships.section.gid`)
      if (tasks.length === 0) continue
      const sections = await asanaAll<{ gid: string; name: string }>(`/projects/${s.asanaGid}/sections?opt_fields=name`)

      const cands = milestones.filter(m => m.source === 'master' && (norm(m.title).includes(norm(canon)) || norm(canon).includes(norm(m.title))))
      let target: PlanMilestone
      if (cands.length === 1) {
        target = cands[0]
      } else if (cands.length === 0) {
        const existing = createdByCanon.get(canon)
        if (existing) { target = existing; warnings.push(`due checklist per "${canon}": unite nella stessa milestone`) }
        else {
          target = { gid: `ms-${s.asanaGid}`, title: canon, due: null, done: false, email: null, source: 'checklist-nuova', phases: [], loose: [] }
          milestones.push(target); createdByCanon.set(canon, target)
        }
      } else {
        // Ambigua (es. 3 milestone "Meta Ads"): la checklist diventa milestone sua,
        // col nome della board, che è l'unica etichetta che la distingue.
        target = { gid: `ms-${s.asanaGid}`, title: s.asanaName.trim(), due: null, done: false, email: null, source: 'checklist-ambigua', phases: [], loose: [] }
        milestones.push(target)
        warnings.push(`"${s.asanaName.trim()}": ${cands.length} milestone candidate (${cands.map(c => c.title).join(', ')}) → milestone a parte`)
      }

      const order = new Map(sections.map((sec, i) => [sec.gid, i]))
      const grouped = new Map<string, { title: string; tasks: PlanTask[] }>()
      for (const t of tasks) {
        if (t.resource_subtype === 'milestone') { target.loose.push(toPlanTask(t)); continue }
        const sec = t.memberships?.find(m => m.section?.gid)?.section
        const gid = sec?.gid ?? 'none'
        const name = sec?.name && !/untitled|senza titolo/i.test(sec.name) ? sec.name.trim() : ''
        if (!name) { target.loose.push(toPlanTask(t)); continue }
        if (!grouped.has(gid)) grouped.set(gid, { title: name, tasks: [] })
        grouped.get(gid)!.tasks.push(toPlanTask(t))
      }
      target.phases.push(...Array.from(grouped)
        .sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
        .map(([gid, v]) => ({ key: `sec-${s.asanaGid}-${slug(v.title)}`, title: v.title, tasks: v.tasks })))
    }

    plans.push({
      clientId, clientName: master.clientNameHint, projectName: master.clientNameHint,
      masterGid: master.asanaGid, kind: master.projectKind, type: master.projectType,
      managerEmail: master.managerEmail, milestones, warnings,
    })
  }
  return plans
}

async function preview() {
  const plans = await buildPlan()
  let nm = 0, nt = 0, ns = 0
  for (const p of plans) {
    console.log(`\n━━━ PROGETTO "${p.projectName}"  (cliente: ${p.clientName})`)
    for (const w of p.warnings) console.log(`    ⚠ ${w}`)
    for (const m of p.milestones) {
      nm++
      const tag = m.source === 'master' ? '' : m.source === 'checklist-nuova' ? '  [milestone creata dalla checklist]' : '  [checklist ambigua]'
      console.log(`   ◆ ${m.title}  ${m.due ?? '(senza data)'}${m.done ? ' ✓' : ''}${tag}`)
      for (const ph of m.phases) {
        ns++; nt += ph.tasks.length
        console.log(`       ▸ ${ph.title}  (${ph.tasks.length} sottotask)`)
      }
      if (m.loose.length) { nt += m.loose.length; console.log(`       · ${m.loose.length} task dirette`) }
    }
  }
  console.log(`\n═══ TOTALE: ${plans.length} progetti · ${nm} milestone · ${ns} task-fase · ${nt} task/sottotask`)
}

// ── Fase 1: mappatura board → cliente ─────────────────────────────────────────
const lev = (a: string, b: string): number => {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

const ALIAS: { re: RegExp; client: string }[] = [
  { re: /condotti\s*&\s*co/i, client: 'Sartoria Condotti' },
  { re: /^industria\s+service/i, client: 'Industrial Services & Facility' },
]

function clientCandidates(name: string): string[] {
  const parts = name.split(/\s*[-–]\s*/).map(p => p.trim()).filter(Boolean)
  const out = [name]
  if (/^ad\s*hoc$/i.test(parts[0] ?? '')) out.push(parts.slice(1).join(' - '))
  else if (parts.length > 1) out.push(parts[0])
  return out
}

type ClientRow = { id: string; company_name: string | null; display_name: string | null }

function matchClient(name: string, clients: ClientRow[]) {
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
  const prev: MapRow[] = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : []
  const prevBy = new Map(prev.map(r => [r.asanaGid, r]))

  const rows: MapRow[] = projects.map(p => {
    const old = prevBy.get(p.gid)
    const prospect = isProspect(p.name)
    const junk = isJunk(p.name)
    const hit = prospect || junk ? null : matchClient(p.name, (clients ?? []) as ClientRow[])
    return {
      asanaGid: p.gid,
      asanaName: p.name,
      // Le correzioni fatte a mano nel file vincono sempre sull'euristica.
      clientId: old?.clientId ?? hit?.id ?? null,
      clientNameHint: prospect ? '⏭ prospect' : junk ? '⏭ board di servizio Asana'
        : old?.clientNameHint ?? (hit ? hit.label : '❓ DA COMPILARE'),
      projectKind: old?.projectKind ?? 'digital',
      projectType: old?.projectType ?? 'custom',
      managerEmail: old?.managerEmail ?? null,
      skip: old?.skip ?? (prospect || junk),
    }
  })
  writeFileSync(MAP_FILE, JSON.stringify(rows, null, 2))
  const live = rows.filter(r => r.clientId && !r.skip)
  console.log(`\n${rows.length} board Asana → ${MAP_FILE}`)
  console.log(`  ${live.length} agganciate a un cliente, per ruolo:`)
  console.log(`     master (= progetto):  ${live.filter(r => roleOf(r.asanaName) === 'master').length}`)
  console.log(`     checklist servizio:   ${live.filter(r => roleOf(r.asanaName) === 'service').length}`)
  console.log(`     ad hoc:               ${live.filter(r => roleOf(r.asanaName) === 'adhoc').length}`)
  console.log(`  ${rows.filter(r => !r.clientId && !r.skip).length} senza cliente (saltate)`)
  console.log(`\nOra: npx tsx scripts/import-asana.ts --preview`)
}

// ── Fase 2: scrittura ─────────────────────────────────────────────────────────
async function apply() {
  const plans = await buildPlan()
  const { data: profiles } = await sb.from('profiles').select('id, email')
  const byEmail = new Map((profiles ?? []).map(p => [String(p.email).toLowerCase(), p.id]))
  const importer = byEmail.get('m.lucci@twobee.it') ?? null
  const unmatched = new Set<string>()

  const idOf = (email: string | null) => {
    if (!email) return null
    const id = byEmail.get(email) ?? null
    if (!id) unmatched.add(email)
    return id
  }

  // asana_gid è unique: identifica la riga anche fra un run e l'altro.
  const writeTask = async (gid: string, payload: Record<string, unknown>) => {
    const { data: prev } = await sb.from('tasks').select('id').eq('asana_gid', gid).maybeSingle()
    const { data, error } = prev
      ? await sb.from('tasks').update(payload as never).eq('id', prev.id).select('id').single()
      : await sb.from('tasks').insert({ ...payload, asana_gid: gid } as never).select('id').single()
    if (error || !data) throw new Error(`task "${payload.title}": ${error?.message}`)
    const aid = payload.assignee_id as string | null
    const del = sb.from('task_assignees').delete().eq('task_id', data.id)
    await (aid ? del.neq('profile_id', aid) : del)
    if (aid) {
      await sb.from('task_assignees').upsert({
        task_id: data.id, profile_id: aid, is_primary_owner: true, role: 'owner', assigned_by: importer,
      } as never, { onConflict: 'task_id,profile_id' })
    }
    return data.id as string
  }

  let np = 0, nm = 0, nt = 0
  for (const p of plans) {
    const projPayload = {
      asana_gid: p.masterGid, name: p.projectName, client_id: p.clientId, status: 'attivo',
      project_kind: p.kind, project_type: p.type,
      manager_id: p.managerEmail ? byEmail.get(p.managerEmail.toLowerCase()) ?? null : null,
    }
    const { data: prevP } = await sb.from('projects').select('id').eq('asana_gid', p.masterGid).maybeSingle()
    const { data: proj, error: pErr } = prevP
      ? await sb.from('projects').update(projPayload as never).eq('id', prevP.id).select('id').single()
      : await sb.from('projects').insert(projPayload as never).select('id').single()
    if (pErr || !proj) { console.error(`✗ progetto "${p.projectName}": ${pErr?.message}`); continue }
    np++

    for (const m of p.milestones) {
      const mi = p.milestones.indexOf(m)
      const msId = await writeTask(m.gid, {
        project_id: proj.id, title: m.title, is_milestone: true,
        sprint_id: null, milestone_id: null, parent_id: null, parent_task_id: null,
        depth: 0, status: m.done ? 'completato' : 'da_fare', due_date: m.due,
        assignee_id: idOf(m.email), priority: 'media', order: mi, position: mi,
      })
      nm++

      let pos = 0
      for (const ph of m.phases) {
        const phId = await writeTask(ph.key, {
          project_id: proj.id, title: ph.title, is_milestone: false,
          milestone_id: msId, parent_id: null, parent_task_id: null, depth: 0, sprint_id: null,
          status: ph.tasks.every((t: PlanTask) => t.done) ? 'completato' : 'da_fare',
          assignee_id: null, priority: 'media', order: pos, position: pos++,
        })
        nt++
        for (const t of ph.tasks) {
          const ti = ph.tasks.indexOf(t)
          // Due colonne per lo stesso legame: parent_id lo legge il board del
          // progetto, parent_task_id il workspace (che senza filtra male e
          // mostrerebbe le sottotask come task di primo livello). Vedi 114.
          await writeTask(t.gid, {
            project_id: proj.id, title: t.title, description: t.notes || null,
            is_milestone: false, milestone_id: msId, parent_id: phId, parent_task_id: phId,
            depth: 1, sprint_id: null,
            status: t.done ? 'completato' : 'da_fare', due_date: t.due,
            assignee_id: idOf(t.email), priority: 'media', order: ti, position: ti,
          })
          nt++
        }
      }
      for (const t of m.loose) {
        await writeTask(t.gid, {
          project_id: proj.id, title: t.title, description: t.notes || null,
          is_milestone: false, milestone_id: msId, parent_id: null, parent_task_id: null,
          depth: 0, sprint_id: null,
          status: t.done ? 'completato' : 'da_fare', due_date: t.due,
          assignee_id: idOf(t.email), priority: 'media', order: pos, position: pos++,
        })
        nt++
      }
    }
    console.log(`✓ ${p.projectName} — ${p.milestones.length} milestone`)
  }
  console.log(`\nFatto: ${np} progetti · ${nm} milestone · ${nt} task/sottotask`)
  if (unmatched.size) {
    console.log(`\n⚠ Assegnatari Asana senza profilo TwoBee (lasciati non assegnati):`)
    for (const e of Array.from(unmatched)) console.log(`  ${e}`)
  }
}

const mode = process.argv[2]
if (mode === '--preview') preview().catch(e => { console.error(e); process.exit(1) })
else if (mode === '--dry-run') dryRun().catch(e => { console.error(e); process.exit(1) })
else if (mode === '--apply') apply().catch(e => { console.error(e); process.exit(1) })
else { console.error('Uso: npx tsx scripts/import-asana.ts --dry-run | --preview | --apply'); process.exit(1) }

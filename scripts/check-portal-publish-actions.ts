/* §395 — Esegui: npx tsx scripts/check-portal-publish-actions.ts
   Le action di pubblicazione con Supabase simulato: un file `'use server'`
   esporta endpoint (§329), quindi si prova che il ruolo, l'azienda visibile e
   il contesto vengano guardati **prima** che nasca un client di servizio. */
import assert from 'node:assert/strict'
import Module from 'node:module'

const actor = 'f2480000-0000-4000-8000-000000000001'
const client = 'f2481000-0000-4000-8000-000000000001'
const hidden = 'f2481000-0000-4000-8000-000000000002'
const lead = 'f2481000-0000-4000-8000-000000000003'
const project = 'f2482000-0000-4000-8000-000000000001'
const otherProject = 'f2482000-0000-4000-8000-000000000002'
const taskOk = 'f2483000-0000-4000-8000-000000000001'
const taskNoWhy = 'f2483000-0000-4000-8000-000000000002'
const taskInternal = 'f2483000-0000-4000-8000-000000000003'
const taskHidden = 'f2483000-0000-4000-8000-000000000004'
const fileOk = 'f2486000-0000-4000-8000-000000000001'
const fileOther = 'f2486000-0000-4000-8000-000000000002'
const fileMisc = 'f2486000-0000-4000-8000-000000000003'
const deliverable = 'f2487000-0000-4000-8000-000000000001'
const otherDeliverable = 'f2487000-0000-4000-8000-000000000002'

let role = 'manager', signedIn = true, active = true, missingSchema = false
let serviceClients = 0, inserted = 0
const calls: string[] = []

const clients = [
  { id: client, client_label: 'stabile', workspace_hidden: false },
  { id: hidden, client_label: 'stabile', workspace_hidden: true },
  { id: lead, client_label: 'lead', workspace_hidden: false },
]
let projects: any[] = []
let tasks: any[] = []
let activities: any[] = []
let deliverables: any[] = []
let versions: any[] = []
const files = [
  { id: fileOk, object_key: 'deliverables/ok.pdf', name: 'ok.pdf', folder: 'deliverables', entity_type: 'project', entity_id: project },
  { id: fileOther, object_key: 'deliverables/altro.pdf', name: 'altro.pdf', folder: 'deliverables', entity_type: 'project', entity_id: otherProject },
  { id: fileMisc, object_key: 'misc/interno.pdf', name: 'interno.pdf', folder: 'misc', entity_type: 'project', entity_id: project },
]

const emptyPortal = {
  portal_title: null, portal_objective: null, portal_scope: null, portal_update: null,
  portal_next_step: null, portal_contact: null, portal_target_date: null,
  portal_date_kind: 'prevista', portal_phase: null, portal_published_at: null, portal_published_by: null,
}
function reset() {
  projects = [
    { id: project, client_id: client, name: 'Sito nuovo', deleted_at: null, ...emptyPortal },
    { id: otherProject, client_id: hidden, name: 'Di un altro', deleted_at: null, ...emptyPortal },
  ]
  tasks = [
    { id: taskOk, client_id: client, task_type: 'cliente', title: 'Inviaci il logo', description: 'Serve per la home', due_date: '2026-10-15', deleted_at: null },
    { id: taskNoWhy, client_id: client, task_type: 'cliente', title: 'Senza perché', description: null, due_date: null, deleted_at: null },
    { id: taskInternal, client_id: client, task_type: 'ad_hoc', title: 'Roba nostra', description: 'Interna', due_date: null, deleted_at: null },
    { id: taskHidden, client_id: hidden, task_type: 'cliente', title: 'Di un’altra azienda', description: 'Motivo', due_date: null, deleted_at: null },
  ]
  activities = []
  deliverables = [
    { id: deliverable, client_id: client, project_id: project, title: 'Progetto grafico' },
    { id: otherDeliverable, client_id: hidden, project_id: otherProject, title: 'Di un altro' },
  ]
  versions = []
  serviceClients = 0
  inserted = 0
  calls.length = 0
}

const rows = (table: string): any[] | null => {
  if (table === 'clients') return clients
  if (table === 'clients_workspace') return clients.filter(c => !c.workspace_hidden)
  if (table === 'projects') return projects
  if (table === 'tasks') return tasks
  if (table === 'portal_activities') return activities
  if (table === 'portal_deliverables') return deliverables
  if (table === 'portal_deliverable_versions') return versions
  if (table === 'files') return files
  if (table === 'profiles') return [{ id: actor, full_name: 'Marta', app_role: role, is_active: active }]
  return null
}

class Query {
  filters: ((row: any) => boolean)[] = []
  one = false
  op = 'read'
  value: any
  constructor(public table: string, public session: boolean) {}
  select(_columns?: string) { return this }
  eq(key: string, value: unknown) { this.filters.push(row => row[key] === value); return this }
  is(key: string, value: unknown) { this.filters.push(row => (row[key] ?? null) === value); return this }
  not(key: string, _op: string, value: unknown) { this.filters.push(row => (row[key] ?? null) !== value); return this }
  in(key: string, values: unknown[]) { this.filters.push(row => values.includes(row[key])); return this }
  order(_key: string, _options?: unknown) { return this }
  limit(_n: number) { return this }
  single() { this.one = true; return this }
  maybeSingle() { this.one = true; return this }
  insert(value: any) { this.op = 'insert'; this.value = value; return this }
  update(value: any) { this.op = 'update'; this.value = value; return this }
  delete() { this.op = 'delete'; return this }
  async then(resolve: (result: any) => unknown, reject?: (e: unknown) => unknown) {
    try {
      calls.push(`${this.session ? 'session' : 'service'}:${this.table}:${this.op}`)
      // Nessuna scrittura passa dal client di sessione: le porte sono le action.
      if (this.op !== 'read') assert.equal(this.session, false, `scrittura con la sessione su ${this.table}`)
      if (missingSchema && this.table.startsWith('portal_')) {
        return resolve({ data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${this.table}'` } })
      }
      const table = rows(this.table)
      assert.ok(table, `tabella inattesa: ${this.table}`)
      const matched = table.filter(row => this.filters.every(filter => filter(row)))
      if (this.op === 'insert') {
        const row = { id: `f248f000-0000-4000-8000-${String(++inserted).padStart(12, '0')}`, ...this.value }
        table.push(row)
        return resolve({ data: this.one ? row : [row], error: null })
      }
      if (this.op === 'update') {
        for (const row of matched) Object.assign(row, this.value)
        return resolve({ data: null, error: null })
      }
      if (this.op === 'delete') {
        for (const row of matched) table.splice(table.indexOf(row), 1)
        return resolve({ data: null, error: null })
      }
      const copy = matched.map(row => ({ ...row }))
      return resolve({ data: this.one ? copy[0] ?? null : copy, error: null })
    } catch (e) { if (reject) return reject(e); throw e }
  }
}

const internal = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown }
const original = internal._load
internal._load = function (name, ...args) {
  // `server-only` esiste solo dentro il bundler di Next.
  if (name === 'server-only') return {}
  if (name === '@/lib/auth') {
    return { getViewer: async () => ({
      user: signedIn ? { id: actor } : null,
      profile: { id: actor, full_name: 'Marta', email: 'marta@example.invalid', role: 'team', app_role: role, is_active: active },
    }) }
  }
  if (name === '@/lib/supabase/server') return { createClient: async () => ({ from: (table: string) => new Query(table, true) }) }
  if (name === '@/lib/supabase/admin') {
    return { createActorClient: (id: string) => { assert.equal(id, actor); serviceClients++; return { from: (table: string) => new Query(table, false) } } }
  }
  if (name === 'next/cache') return { revalidatePath: () => {} }
  return original.call(this, name, ...args)
}

const fields = { title: 'Sito nuovo', objective: 'Vendere online', next_step: 'Rivedere la home', contact: 'Marta' }

async function main() {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only'
  const actions = require('../app/actions/portal-publish') as typeof import('../app/actions/portal-publish')
  reset()

  // ── La porta ──────────────────────────────────────────────────────────────
  for (const denied of ['client', 'guest', 'junior', 'senior', 'stage', 'freelance', 'partner', 'viewer']) {
    role = denied
    assert.ok((await actions.publishProject(project, fields)).error, `${denied} non pubblica`)
    assert.ok((await actions.publishClientTask(taskOk, { kind: 'materiale', contactName: 'Marta' })).error)
  }
  role = 'manager'; active = false
  assert.ok((await actions.publishProject(project, fields)).error, 'profilo disattivato')
  active = true; signedIn = false
  assert.ok((await actions.withdrawProject(project)).error, 'senza sessione')
  signedIn = true
  assert.equal(serviceClients, 0, 'nessun client di servizio prima del controllo di ruolo')
  assert.equal(calls.filter(c => c.startsWith('service')).length, 0)

  // Azienda nascosta al workspace (§213) e lead non ancora acquisito (§321).
  assert.ok((await actions.publishProject(otherProject, fields)).error)
  projects.push({ id: 'f2482000-0000-4000-8000-000000000003', client_id: lead, name: 'Lead', deleted_at: null, ...emptyPortal })
  assert.match((await actions.publishProject('f2482000-0000-4000-8000-000000000003', fields)).error!, /lead/i)
  assert.equal(serviceClients, 0)
  assert.ok((await actions.publishProject('non-un-uuid', fields)).error)
  assert.ok((await actions.publishClientTask(taskHidden, { kind: 'materiale', contactName: 'Marta' })).error, 'task di un’azienda nascosta')

  // Schema non applicato: lo dichiara, non finge un invio riuscito.
  missingSchema = true
  assert.match((await actions.createDeliverable(project, 'Consegna')).error!, /249/)
  missingSchema = false

  // ── Progetto ──────────────────────────────────────────────────────────────
  reset()
  for (const bad of [{}, { title: '   ' }, { ...fields, date_kind: 'domani' }, { ...fields, phase: 'qualsiasi' }, { ...fields, target_date: 'domani' }]) {
    assert.ok((await actions.publishProject(project, bad as never)).error)
  }
  assert.equal(projects.find(p => p.id === project).portal_published_at, null, 'un campo non valido non pubblica niente')

  assert.equal((await actions.saveProjectPortalDraft(project, fields)).error, undefined)
  assert.equal(projects.find(p => p.id === project).portal_title, 'Sito nuovo')
  assert.equal(projects.find(p => p.id === project).portal_published_at, null, 'la bozza non è pubblicazione')

  assert.equal((await actions.publishProject(project, { ...fields, update: 'Home chiusa', date_kind: 'confermata' })).error, undefined)
  const published = projects.find(p => p.id === project)
  assert.ok(published.portal_published_at)
  assert.equal(published.portal_published_by, actor)
  assert.equal(published.portal_update, 'Home chiusa')
  assert.equal(published.portal_date_kind, 'confermata')
  assert.match((await actions.saveProjectPortalDraft(project, fields)).error!, /ripubblic/i)

  assert.equal((await actions.withdrawProject(project)).error, undefined)
  assert.equal(projects.find(p => p.id === project).portal_published_at, null)
  assert.equal(projects.find(p => p.id === project).portal_published_by, null)
  assert.equal(projects.find(p => p.id === project).portal_title, 'Sito nuovo', 'il ritiro non cancella i contenuti')

  // ── Attività al cliente ───────────────────────────────────────────────────
  reset()
  assert.match((await actions.publishClientTask(taskInternal, { kind: 'materiale', contactName: 'Marta' })).error!, /task al cliente/)
  assert.match((await actions.publishClientTask(taskNoWhy, { kind: 'materiale', contactName: 'Marta' })).error!, /perché/)
  assert.ok((await actions.publishClientTask(taskOk, { kind: 'approvazione' as never, contactName: 'Marta' })).error, 'l’approvazione nasce da una versione, non da una task')
  assert.ok((await actions.publishClientTask(taskOk, { kind: 'materiale', contactName: '  ' })).error)
  assert.equal(activities.length, 0)

  assert.equal((await actions.publishClientTask(taskOk, { kind: 'materiale', contactName: 'Marta' })).error, undefined)
  assert.equal(activities.length, 1)
  assert.equal(activities[0].source_task_id, taskOk)
  assert.equal(activities[0].client_id, client)
  assert.equal(activities[0].project_id, undefined, 'una task al cliente non ha progetto: l’attività è dell’azienda')
  assert.equal(activities[0].reason, 'Serve per la home')
  assert.equal(activities[0].contact_name, 'Marta')
  assert.ok(activities[0].published_at)

  tasks.find(t => t.id === taskOk).title = 'Inviaci il logo in vettoriale'
  assert.equal((await actions.publishClientTask(taskOk, { kind: 'risposta', contactName: 'Nuovo referente' })).error, undefined)
  assert.equal(activities.length, 1, 'ripubblicare non crea un doppione')
  assert.equal(activities[0].title, 'Inviaci il logo in vettoriale')
  assert.equal(activities[0].kind, 'materiale', 'il tipo è immutabile: non si riscrive dal client')

  assert.equal((await actions.withdrawClientActivity(activities[0].id)).error, undefined)
  assert.equal(activities[0].published_at, null)
  assert.equal(activities[0].published_by, null)

  // ── Consegne ──────────────────────────────────────────────────────────────
  reset()
  for (const bad of ['', '   ', 'x'.repeat(241)]) assert.ok((await actions.createDeliverable(project, bad)).error)
  const created = await actions.createDeliverable(project, ' Progetto grafico 2 ')
  assert.equal(created.error, undefined)
  assert.equal(deliverables.find(d => d.id === created.data!.id).title, 'Progetto grafico 2')

  assert.match((await actions.addDeliverableVersion(project, deliverable, fileMisc, {})).error!, /consegne di questo progetto/)
  assert.match((await actions.addDeliverableVersion(project, deliverable, fileOther, {})).error!, /consegne di questo progetto/)
  assert.ok((await actions.addDeliverableVersion(project, otherDeliverable, fileOk, {})).error, 'consegna di un altro progetto')
  assert.equal(versions.length, 0)

  const v1 = await actions.addDeliverableVersion(project, deliverable, fileOk, { approvalRequired: true })
  assert.equal(v1.error, undefined)
  const first = versions.find(v => v.id === v1.data!.id)
  assert.equal(first.version, 1)
  assert.equal(first.published_at, undefined, 'la versione nasce in bozza')
  assert.equal(first.storage_key, 'deliverables/ok.pdf')
  assert.equal(first.author_name, 'Marta')
  assert.equal(first.approval_required, true)

  const v2 = await actions.addDeliverableVersion(project, deliverable, fileOk, {})
  assert.equal(versions.find(v => v.id === v2.data!.id).version, 2)
  assert.equal(versions.find(v => v.id === v2.data!.id).approval_required, false, 'l’approvazione si chiede, non si eredita')

  assert.equal((await actions.publishDeliverableVersion(project, first.id)).error, undefined)
  assert.ok(first.published_at)
  assert.equal(first.published_by, actor)
  assert.equal((await actions.retireDeliverableVersion(project, first.id)).error, undefined)
  assert.ok(first.retired_at)
  assert.equal(first.retired_by, actor)

  await actions.deleteDeliverableDraft(project, first.id)
  assert.ok(versions.some(v => v.id === first.id), 'una versione pubblicata non si elimina')
  await actions.deleteDeliverableDraft(project, v2.data!.id)
  assert.equal(versions.some(v => v.id === v2.data!.id), false, 'la bozza si elimina')

  assert.ok(serviceClients > 0)
  assert.ok(calls.includes('service:portal_deliverable_versions:insert'))
  // Il file si legge con la sessione e la RLS, la versione la scrive il servizio.
  assert.ok(calls.includes('session:files:read'))
  console.log('Tutti i controlli passano: ruoli, aziende nascoste e lead, schema assente, bozza e ripubblicazione, attività senza doppioni, consegne legate al progetto e ritiro.')
}

main().catch(error => { console.error(error); process.exit(1) })

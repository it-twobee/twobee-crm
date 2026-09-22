/* §395 — Esegui: npx tsx lib/portal/publish.check.ts
   Le regole stanno anche qui perché il database risponde con un'eccezione, e
   «operazione non riuscita» non dice a nessuno quale campo manca. */
import assert from 'node:assert/strict'
import {
  EMPTY_PROJECT_FIELDS, activityFromTask, blockedReason, deliverableDownloadHref,
  latestPublished, missingForPublication, needsRepublish, nextVersion,
  parseDeliverableTitle, parsePortalProject,
} from './publish'
import type { ClientTask, PortalProjectFields } from './publish'

const client = 'f2471000-0000-4000-8000-000000000001'
const taskId = 'f2473000-0000-4000-8000-000000000001'

const draft: Partial<PortalProjectFields> = {
  title: '  Sito nuovo  ', objective: ' Vendere online ', next_step: 'Rivedere la home',
  contact: 'Marta', target_date: '2026-10-20', date_kind: 'confermata', phase: 'lavorazione',
}
const parsed = parsePortalProject(draft)
assert.equal(parsed.title, 'Sito nuovo')
assert.equal(parsed.objective, 'Vendere online')
assert.equal(parsed.scope, null, 'un campo vuoto resta vuoto: non si riempie con il lavoro interno')
assert.equal(parsed.date_kind, 'confermata')
for (const patch of [
  { title: '   ' }, { title: 'x'.repeat(241) }, { date_kind: 'domani' }, { phase: 'qualsiasi' },
  { phase: '__proto__' }, { target_date: '20 ottobre' }, { target_date: '2026-13-40' },
  { objective: 'x'.repeat(5001) },
]) assert.throws(() => parsePortalProject({ ...draft, ...patch } as Partial<PortalProjectFields>))

assert.deepEqual(missingForPublication(EMPTY_PROJECT_FIELDS), ['titolo pubblico', 'obiettivo', 'prossimo passo', 'referente'])
assert.deepEqual(missingForPublication(parsed), [])

// Il trigger rifiuta una modifica ai campi condivisi senza una nuova pubblicazione.
assert.equal(needsRepublish(parsed, parsed), false)
assert.equal(needsRepublish(parsed, { ...parsed, update: 'Abbiamo chiuso la home' }), true)
assert.equal(needsRepublish(parsed, { ...parsed, date_kind: 'prevista' }), true)

const task: ClientTask = {
  id: taskId, client_id: client, task_type: 'cliente', title: ' Inviaci il logo ',
  description: ' Serve per chiudere la home ', due_date: '2026-10-15', deleted_at: null,
}
assert.equal(blockedReason(task), null)
assert.match(blockedReason({ ...task, description: null })!, /perché/)
assert.match(blockedReason({ ...task, description: '   ' })!, /perché/)
assert.match(blockedReason({ ...task, task_type: 'ad_hoc' })!, /task al cliente/)
assert.match(blockedReason({ ...task, client_id: null })!, /azienda/)
assert.match(blockedReason({ ...task, deleted_at: '2026-09-22' })!, /eliminata/)

const activity = activityFromTask(task, { kind: 'materiale', contactName: ' Marta ' })
assert.equal(activity.title, 'Inviaci il logo')
assert.equal(activity.reason, 'Serve per chiudere la home')
assert.equal(activity.contact_name, 'Marta')
assert.equal(activity.source_task_id, taskId)
assert.equal(activity.due_date, '2026-10-15')
assert.throws(() => activityFromTask(task, { kind: 'approvazione' as never, contactName: 'Marta' }))
assert.throws(() => activityFromTask(task, { kind: 'materiale', contactName: '  ' }))
assert.throws(() => activityFromTask({ ...task, description: null }, { kind: 'risposta', contactName: 'Marta' }))

assert.equal(nextVersion([]), 1)
assert.equal(nextVersion([{ version: 1 }, { version: 3 }, { version: 2 }]), 4)
const versions = [
  { version: 1, published_at: '2026-09-01T10:00:00Z' },
  { version: 3, published_at: null },
  { version: 2, published_at: '2026-09-10T10:00:00Z' },
]
assert.equal(latestPublished(versions)?.version, 2, 'una bozza non è l’ultima consegna')
assert.equal(latestPublished([{ version: 1, published_at: null }]), null)

assert.equal(deliverableDownloadHref('f2478000-0000-4000-8000-000000000001'), '/api/portale/consegne/f2478000-0000-4000-8000-000000000001')
assert.equal(parseDeliverableTitle(' Progetto grafico '), 'Progetto grafico')
for (const bad of ['', '   ', null, 'x'.repeat(241), 42]) assert.throws(() => parseDeliverableTitle(bad))

console.log('Tutti i controlli passano: campi pubblici, ripubblicazione esplicita, attività senza perché rifiutata, versioni e download.')

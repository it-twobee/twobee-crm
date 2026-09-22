/* §398 — Esegui: npx tsx scripts/check-area-cliente-routes.ts
   Il verso nostro dell'area cliente. La cosa da non sbagliare è una sola:
   quello che carichiamo noi nasce `source='team'`, e il cliente non lo legge.
   E poi chi può togliere cosa — archiviare è nostro, eliminare un file suo no. */
import assert from 'node:assert/strict'
import Module from 'node:module'

const client = 'f2511000-0000-4000-8000-000000000001'
const hidden = 'f2511000-0000-4000-8000-000000000009'
const admin = 'f2510000-0000-4000-8000-000000000001'
const junior = 'f2510000-0000-4000-8000-000000000005'
const suoFile = 'f2518000-0000-4000-8000-000000000001'
const nostroFile = 'f2518000-0000-4000-8000-000000000002'
const altruiFile = 'f2518000-0000-4000-8000-000000000003'
const key = 'f2517000-0000-4000-8000-000000000001'

let userId: string | null = admin
const profiles: Record<string, { role: string; app_role: string; email: string; full_name: string; is_active: boolean }> = {
  [admin]: { role: 'admin', app_role: 'super_admin', email: 'admin@example.invalid', full_name: 'Admin', is_active: true },
  [junior]: { role: 'team', app_role: 'junior', email: 'junior@example.invalid', full_name: 'Junior', is_active: true },
  cliente: { role: 'client', app_role: 'client', email: 'cliente@example.invalid', full_name: 'Referente', is_active: true },
  viewer: { role: 'team', app_role: 'viewer', email: 'viewer@example.invalid', full_name: 'Viewer', is_active: true },
}
class StorageTooLarge extends Error {}
let materials: any[] = [], files: any[] = [], objects: string[] = []
function reset() {
  files = []; objects = []
  materials = [
    { id: suoFile, client_id: client, source: 'cliente', uploaded_by: 'cliente', storage_key: 'materiali/logo.png', file_id: 'f1', deleted_at: null, archived_at: null, size: 10 },
    { id: nostroFile, client_id: client, source: 'team', uploaded_by: junior, storage_key: 'materiali/ds.pdf', file_id: 'f2', deleted_at: null, archived_at: null, size: 20 },
    { id: altruiFile, client_id: client, source: 'team', uploaded_by: admin, storage_key: 'materiali/altro.pdf', file_id: 'f3', deleted_at: null, archived_at: null, size: 30 },
  ]
}

class Query {
  filters: ((r: any) => boolean)[] = []
  one = false; op = 'read'; value: any
  constructor(public table: string) {}
  select(_c?: string) { return this }
  eq(k: string, v: unknown) { this.filters.push(r => r[k] === v); return this }
  is(k: string, v: unknown) { this.filters.push(r => (r[k] ?? null) === v); return this }
  order() { return this }
  limit() { return this }
  single() { this.one = true; return this }
  maybeSingle() { this.one = true; return this }
  insert(v: any) { this.op = 'insert'; this.value = v; return this }
  update(v: any) { this.op = 'update'; this.value = v; return this }
  delete() { this.op = 'delete'; return this }
  async then(resolve: (r: any) => unknown) {
    if (this.table === 'profiles') {
      const p = userId ? profiles[userId] : null
      return resolve({ data: p ? { ...p, id: userId } : null, error: p ? null : { code: 'PGRST116' } })
    }
    const table = this.table === 'files' ? files : this.table === 'portal_materials' ? materials : null
    assert.ok(table, `tabella inattesa: ${this.table}`)
    const matched = table.filter(r => this.filters.every(f => f(r)))
    if (this.op === 'insert') {
      const row = { id: `f251a000-0000-4000-8000-${String(table.length + 1).padStart(12, '0')}`, deleted_at: null, archived_at: null, ...this.value }
      table.push(row)
      return resolve({ data: this.one ? row : [row], error: null })
    }
    if (this.op === 'update') {
      for (const r of matched) Object.assign(r, this.value)
      return resolve({ data: this.one ? matched[0] ?? null : null, error: null })
    }
    if (this.op === 'delete') {
      for (const r of matched) table.splice(table.indexOf(r), 1)
      return resolve({ data: null, error: null })
    }
    const copy = matched.map(r => ({ ...r }))
    return resolve({ data: this.one ? copy[0] ?? null : copy, error: null })
  }
}

const internal = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown }
const original = internal._load
internal._load = function (name, ...args) {
  if (name === 'server-only') return {}
  if (name === '@/lib/supabase/server') {
    return { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
      from: (t: string) => new Query(t),
      rpc: async (_fn: string, params: { p_entity_id?: string }) => ({ data: params?.p_entity_id !== hidden, error: null }),
    }) }
  }
  if (name === '@/lib/supabase/admin') {
    return {
      createAdminClient: () => ({ from: (t: string) => new Query(t) }),
      createActorClient: (id: string) => { assert.equal(id, userId); return { from: (t: string) => new Query(t) } },
    }
  }
  if (name === '@/lib/storage/s3') {
    return {
      S3_BUCKET: 'twobee-crm', StorageTooLarge,
      isStorageConfigured: () => true,
      buildObjectKey: (folder: string, filename: string, scope?: string) => `${folder}/${scope}/${filename}`,
      deleteObject: async (k: string) => { objects = objects.filter(o => o !== k) },
      putObjectStream: async (k: string, stream: ReadableStream<Uint8Array>) => {
        let total = 0
        const reader = stream.getReader()
        for (;;) { const { done, value } = await reader.read(); if (value) total += value.length; if (done) break }
        objects.push(k)
        return { size: total }
      },
    }
  }
  return original.call(this, name, ...args)
}

const upload = (query: string, headers: Record<string, string>, body = 'ciao') =>
  new Request(`https://os.example.test/api/area-cliente/file?${query}`, { method: 'POST', body, headers })
const good = { 'content-type': 'application/pdf', 'x-file-name': 'design-system.pdf', 'x-idempotency-key': key }
const patch = (azione: string) => new Request('https://os.example.test/', {
  method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ azione }),
})

async function main() {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only'
  const route = require('../app/api/area-cliente/file/route') as typeof import('../app/api/area-cliente/file/route')
  const one = require('../app/api/area-cliente/file/[id]/route') as typeof import('../app/api/area-cliente/file/[id]/route')
  reset()

  // ── La porta ──────────────────────────────────────────────────────────────
  userId = null
  assert.equal((await route.POST(upload(`client=${client}`, good))).status, 401)
  userId = 'cliente'
  assert.equal((await route.POST(upload(`client=${client}`, good))).status, 401, 'un account cliente non è staff')
  userId = 'viewer'
  assert.equal((await route.POST(upload(`client=${client}`, good))).status, 403, 'il viewer legge e basta')
  userId = junior
  assert.equal((await route.POST(upload(`client=${hidden}`, good))).status, 403, 'azienda nascosta al workspace')
  assert.equal((await route.POST(upload('client=non-un-uuid', good))).status, 400)
  assert.equal(objects.length, 0, 'nessun accesso allo storage prima dei permessi')

  // ── Cosa si carica, e come nasce ─────────────────────────────────────────
  for (const [q, h, why] of [
    [`client=${client}&percorso=../fuori`, good, 'risalita nel percorso'],
    [`client=${client}&percorso=brand/./qui`, good, 'segmento «.»'],
    [`client=${client}&percorso=${'a/'.repeat(11)}`, good, 'annidamento senza fine'],
    [`client=${client}`, { ...good, 'x-file-name': 'pagina.html', 'content-type': 'text/html' }, 'contenuto attivo'],
    [`client=${client}`, { ...good, 'x-idempotency-key': 'non-un-uuid' }, 'chiave non valida'],
  ] as [string, Record<string, string>, string][]) {
    assert.equal((await route.POST(upload(q, h))).status, 400, why)
  }
  assert.equal(objects.length, 0)

  // Una barra iniziale non è un attacco: si normalizza, non si rifiuta.
  const normalised = await route.POST(upload(`client=${client}&percorso=/assoluto/`, { ...good, 'x-idempotency-key': 'f2517000-0000-4000-8000-000000000099' }))
  assert.equal(normalised.status, 200)
  assert.equal(materials.find(m => m.idempotency_key === 'f2517000-0000-4000-8000-000000000099').path, 'assoluto')

  const created = await route.POST(upload(`client=${client}&percorso=progettazione/design system`, good))
  assert.equal(created.status, 200)
  const added = materials.find(m => m.idempotency_key === key)
  assert.ok(added)
  assert.equal(added.source, 'team', 'un file nostro nasce nostro')
  assert.equal(added.path, 'progettazione/design system')
  assert.equal(added.client_id, client)
  assert.equal(added.uploaded_by, junior)
  assert.equal(added.uploaded_by_name, 'Junior')
  assert.equal(added.activity_id, null, 'un file nostro non risponde a un’attività')
  assert.equal(files.length, 2, 'due caricamenti, due metadati')
  assert.ok(files.every(f => f.folder === 'materiali' && f.entity_type === 'client' && f.entity_id === client))
  reset()

  // ── Archiviare, rimettere in vista ───────────────────────────────────────
  userId = junior
  assert.equal((await one.PATCH(patch('archivia'), { params: { id: suoFile } })).status, 200)
  assert.ok(materials.find(m => m.id === suoFile).archived_at, 'archiviare un file del cliente si può')
  assert.equal((await one.PATCH(patch('ripristina'), { params: { id: suoFile } })).status, 200)
  assert.equal(materials.find(m => m.id === suoFile).archived_at, null)
  assert.equal((await one.PATCH(patch('qualsiasi'), { params: { id: suoFile } })).status, 400)
  assert.equal((await one.PATCH(patch('archivia'), { params: { id: 'non-un-uuid' } })).status, 404)

  // ── Eliminare ────────────────────────────────────────────────────────────
  assert.equal((await one.PATCH(patch('elimina'), { params: { id: suoFile } })).status, 403, 'un file del cliente non lo elimina il team')
  assert.equal((await one.PATCH(patch('elimina'), { params: { id: altruiFile } })).status, 403, 'né il file di un collega')
  assert.equal((await one.PATCH(patch('elimina'), { params: { id: nostroFile } })).status, 200, 'il proprio sì')
  assert.ok(materials.find(m => m.id === nostroFile).deleted_at)
  assert.equal(files.length, 0)

  userId = admin
  assert.equal((await one.PATCH(patch('elimina'), { params: { id: suoFile } })).status, 200, 'l’amministratore sì')
  assert.ok(materials.find(m => m.id === suoFile).deleted_at)
  assert.equal((await one.PATCH(patch('archivia'), { params: { id: suoFile } })).status, 404, 'un file rimosso non si tocca più')

  console.log('Tutti i controlli passano: solo staff attivo, azienda nascosta esclusa, percorsi e tipi rifiutati prima dello storage, file nostri che nascono nostri, archiviazione reversibile e cancellazioni per ruolo.')
}

main().catch(error => { console.error(error); process.exit(1) })

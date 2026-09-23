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
const nascostoFile = 'f2518000-0000-4000-8000-000000000004'
const key = 'f2517000-0000-4000-8000-000000000001'

let userId: string | null = admin
const profiles: Record<string, { role: string; app_role: string; email: string; full_name: string; is_active: boolean }> = {
  [admin]: { role: 'admin', app_role: 'super_admin', email: 'admin@example.invalid', full_name: 'Admin', is_active: true },
  [junior]: { role: 'team', app_role: 'junior', email: 'junior@example.invalid', full_name: 'Junior', is_active: true },
  cliente: { role: 'client', app_role: 'client', email: 'cliente@example.invalid', full_name: 'Referente', is_active: true },
  viewer: { role: 'team', app_role: 'viewer', email: 'viewer@example.invalid', full_name: 'Viewer', is_active: true },
  freelance: { role: 'team', app_role: 'freelance', email: 'freelance@example.invalid', full_name: 'Freelance', is_active: true },
}
class StorageTooLarge extends Error {}
let materials: any[] = [], files: any[] = [], objects: string[] = []
let memberships: any[] = [], folders: any[] = []
// §413 — le funzioni del database: si registra chi le chiama e con cosa.
let rpcCalls: { fn: string; args: any; actor: boolean }[] = []
let rpcResult: { data: unknown; error: { code: string; message?: string } | null } = { data: 1, error: null }
let foldersMissing = false
function reset() {
  files = []; objects = []; memberships = []; folders = []; rpcCalls = []; rpcResult = { data: 1, error: null }; foldersMissing = false
  materials = [
    { id: suoFile, client_id: client, source: 'cliente', uploaded_by: 'cliente', storage_key: 'materiali/logo.png', file_id: 'f1', deleted_at: null, archived_at: null, size: 10 },
    { id: nostroFile, client_id: client, source: 'team', uploaded_by: junior, storage_key: 'materiali/ds.pdf', file_id: 'f2', deleted_at: null, archived_at: null, size: 20 },
    { id: altruiFile, client_id: client, source: 'team', uploaded_by: admin, storage_key: 'materiali/altro.pdf', file_id: 'f3', deleted_at: null, archived_at: null, size: 30 },
    { id: nascostoFile, client_id: hidden, source: 'team', uploaded_by: junior, storage_key: 'materiali/gav.pdf', file_id: 'f4', deleted_at: null, archived_at: null, size: 40 },
  ]
}

class Query {
  filters: ((r: any) => boolean)[] = []
  one = false; op = 'read'; value: any; window: [number, number] | null = null
  constructor(public table: string, public actor = false) {}
  select(_c?: string) { return this }
  eq(k: string, v: unknown) { this.filters.push(r => r[k] === v); return this }
  is(k: string, v: unknown) { this.filters.push(r => (r[k] ?? null) === v); return this }
  in(k: string, v: unknown[]) { this.filters.push(r => v.includes(r[k])); return this }
  order() { return this }
  range(from: number, to: number) { this.window = [from, to]; return this }
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
    if (this.table === 'clients' || this.table === 'clients_workspace') {
      const rows = [{ id: client }, ...(this.table === 'clients' ? [{ id: hidden }] : [])]
      const found = rows.filter(r => this.filters.every(f => f(r)))
      return resolve({ data: this.one ? found[0] ?? null : found, error: null })
    }
    if (this.table === 'portal_memberships') {
      const found = memberships.filter(r => this.filters.every(f => f(r)))
      return resolve({ data: this.one ? found[0] ?? null : found, error: null })
    }
    if (this.table === 'portal_material_folders') {
      if (foldersMissing) return resolve({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.portal_material_folders'" } })
      if (this.op === 'insert') {
        assert.ok(this.actor, 'una cartella si crea con l’attore')
        if (folders.some(f => f.client_id === this.value.client_id && f.source === this.value.source && f.path === this.value.path)) {
          return resolve({ data: null, error: { code: '23505' } })
        }
        folders.push({ id: `cartella-${folders.length + 1}`, ...this.value })
        return resolve({ data: { id: `cartella-${folders.length}` }, error: null })
      }
      const found = folders.filter(r => this.filters.every(f => f(r)))
      return resolve({ data: this.one ? found[0] ?? null : found, error: null })
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
      // Come nel database: staccare il file da un materiale passa dalla cronologia, che vuole un autore.
      if (this.table === 'files' && !this.actor && matched.some(f => materials.some(m => m.file_id === f.id))) {
        return resolve({ data: null, error: { code: 'P0001' } })
      }
      for (const r of matched) table.splice(table.indexOf(r), 1)
      return resolve({ data: null, error: null })
    }
    const copy = (this.window ? matched.slice(this.window[0], this.window[1] + 1) : matched).map(r => ({ ...r }))
    return resolve({ data: this.one ? copy[0] ?? null : copy, error: null })
  }
}

const internal = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown }
const original = internal._load
internal._load = function (name, ...args) {
  if (name === 'server-only') return {}
  if (name === '@/lib/auth') {
    return { getViewer: async () => ({
      user: userId ? { id: userId } : null,
      profile: userId ? { id: userId, ...profiles[userId] } : null,
    }) }
  }
  if (name === '@/lib/supabase/server') {
    return { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
      from: (t: string) => new Query(t),
      rpc: async (_fn: string, params: { p_entity_id?: string }) => ({ data: params?.p_entity_id !== hidden, error: null }),
    }) }
  }
  if (name === '@/lib/supabase/admin') {
    return {
      createAdminClient: () => ({
        from: (t: string) => new Query(t),
        rpc: async (fn: string, args: any) => { rpcCalls.push({ fn, args, actor: false }); return { data: null, error: { code: 'PGRST202' } } },
      }),
      createActorClient: (id: string) => {
        assert.equal(id, userId)
        return {
          from: (t: string) => new Query(t, true),
          rpc: async (fn: string, args: any) => {
            rpcCalls.push({ fn, args, actor: true })
            // La quota: senza la funzione si somma a pagine.
            if (fn === 'portal_material_usage') return { data: null, error: { code: 'PGRST202' } }
            return rpcResult
          },
        }
      },
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
  // La PATCH aveva mezza porta: il ruolo sì, l'azienda no.
  assert.equal((await one.PATCH(patch('archivia'), { params: { id: nascostoFile } })).status, 404, 'un file di un’azienda nascosta non si tocca')
  assert.equal(materials.find(m => m.id === nascostoFile).archived_at, null)
  userId = 'viewer'
  assert.equal((await one.PATCH(patch('archivia'), { params: { id: suoFile } })).status, 403, 'il viewer non archivia')
  userId = 'freelance'
  assert.equal((await one.PATCH(patch('archivia'), { params: { id: suoFile } })).status, 403, 'un freelance non entra nell’area dei clienti')
  assert.equal((await route.POST(upload(`client=${client}`, good))).status, 403)
  userId = junior

  // ── Eliminare ────────────────────────────────────────────────────────────
  assert.equal((await one.PATCH(patch('elimina'), { params: { id: suoFile } })).status, 403, 'un file del cliente non lo elimina il team')
  assert.equal((await one.PATCH(patch('elimina'), { params: { id: altruiFile } })).status, 403, 'né il file di un collega')
  files = [{ id: 'f2', object_key: 'materiali/ds.pdf' }]
  assert.equal((await one.PATCH(patch('elimina'), { params: { id: nostroFile } })).status, 200, 'il proprio sì')
  assert.ok(materials.find(m => m.id === nostroFile).deleted_at)
  assert.equal(files.length, 0, 'e il metadato dello storage si stacca')

  userId = admin
  assert.equal((await one.PATCH(patch('elimina'), { params: { id: suoFile } })).status, 200, 'l’amministratore sì')
  assert.ok(materials.find(m => m.id === suoFile).deleted_at)
  assert.equal((await one.PATCH(patch('archivia'), { params: { id: suoFile } })).status, 404, 'un file rimosso non si tocca più')

  // ── §403 La scheda cliente: lo spazio c'è prima del portale ──────────────
  reset()
  const { getClientFiles } = require('../app/actions/client-files') as typeof import('../app/actions/client-files')
  userId = 'cliente'
  assert.ok((await getClientFiles(client)).error, 'un account cliente non apre l’area dalla scheda')
  userId = null
  assert.ok((await getClientFiles(client)).error)
  userId = junior
  assert.ok((await getClientFiles('non-un-uuid')).error)
  assert.ok((await getClientFiles(hidden)).error, 'azienda nascosta al workspace')

  const senzaPortale = await getClientFiles(client)
  assert.equal(senzaPortale.error, undefined)
  assert.equal(senzaPortale.data!.portalActive, false, 'senza referente il mezzo spazio del cliente è spento')
  assert.equal(senzaPortale.data!.canWrite, true, 'ma il nostro c’è da subito')
  assert.equal(senzaPortale.data!.canDeleteClientFiles, false, 'un junior non elimina i file del cliente')
  assert.equal(senzaPortale.data!.materials.length, 3)

  memberships = [{ id: 'membership', client_id: client, revoked_at: null }]
  const conPortale = await getClientFiles(client)
  assert.equal(conPortale.data!.portalActive, true, 'invitato un referente, si accende')

  userId = admin
  assert.equal((await getClientFiles(client)).data!.canDeleteClientFiles, true)
  // La RLS dei materiali (`portal_is_staff`) esclude viewer, freelance e
  // partner: per loro l'area era vuota e diceva «nessuno ancora». Adesso lo dice.
  for (const who of ['viewer', 'freelance']) {
    userId = who
    const fuori = await getClientFiles(client)
    assert.match(fuori.error ?? '', /riservata al team interno/, `${who}: una frase, non un'area vuota`)
  }

  // Mille righe erano il tetto di PostgREST, non dell'area.
  userId = junior
  for (let i = 0; i < 2345; i++) {
    materials.push({ id: `f251b000-0000-4000-8000-${String(i).padStart(12, '0')}`, client_id: client, source: 'team', uploaded_by: junior, storage_key: `materiali/${i}.pdf`, file_id: `m${i}`, deleted_at: null, archived_at: null, size: 1 })
  }
  const molti = await getClientFiles(client)
  assert.equal(molti.data!.materials.length, 2348, 'tutte le righe, non le prime mille')
  assert.equal(molti.data!.truncated, false)

  // ── §413 Organizzare: cartelle, spostamenti, rinomina ─────────────────────
  reset()
  const cartelle = require('../app/api/area-cliente/cartelle/route') as typeof import('../app/api/area-cliente/cartelle/route')
  const sposta = require('../app/api/area-cliente/file/sposta/route') as typeof import('../app/api/area-cliente/file/sposta/route')
  const json = (method: string, body: unknown) => new Request('https://os.example.test/', {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const fns = () => rpcCalls.filter(c => c.fn !== 'portal_material_usage').map(c => c.fn)

  userId = 'viewer'
  assert.equal((await cartelle.POST(json('POST', { client, spazio: 'team', percorso: 'Nuova' }))).status, 403, 'il viewer non organizza')
  userId = junior
  assert.equal((await cartelle.POST(json('POST', { client: hidden, spazio: 'team', percorso: 'Nuova' }))).status, 403, 'azienda nascosta')
  assert.equal((await cartelle.POST(json('POST', { client, spazio: 'altrui', percorso: 'Nuova' }))).status, 400)
  assert.equal((await cartelle.POST(json('POST', { client, spazio: 'team', percorso: '../fuori' }))).status, 400)
  assert.equal((await cartelle.POST(json('POST', { client, spazio: 'team', percorso: '' }))).status, 400)
  assert.equal(folders.length, 0, 'niente scritto prima dei controlli')
  assert.equal((await cartelle.POST(json('POST', { client, spazio: 'team', percorso: 'Brand/Nuova' }))).status, 200)
  assert.deepEqual(folders.map(f => [f.source, f.path, f.created_by]), [['team', 'Brand/Nuova', junior]], 'firmata da chi la crea')
  assert.equal((await cartelle.POST(json('POST', { client, spazio: 'team', percorso: 'Brand/Nuova' }))).status, 409, 'due volte no')
  assert.equal((await cartelle.POST(json('POST', { client, spazio: 'cliente', percorso: 'Foto' }))).status, 200, 'anche nello spazio del cliente, per mettere in ordine i suoi file')

  const patchFolder = (body: Record<string, unknown>) => cartelle.PATCH(json('PATCH', { client, spazio: 'team', percorso: 'Brand', ...body }))
  assert.equal((await patchFolder({ azione: 'rinomina', nome: 'Marchio' })).status, 200)
  assert.deepEqual(rpcCalls.at(-1), { fn: 'portal_material_folder_move', args: { p_client: client, p_source: 'team', p_from: 'Brand', p_to: 'Marchio' }, actor: true })
  assert.equal((await patchFolder({ azione: 'rinomina', nome: 'a/b' })).status, 400, 'una barra farebbe due cartelle')
  assert.equal((await patchFolder({ azione: 'rinomina', nome: 'Brand' })).status, 400, 'lo stesso nome')
  assert.equal((await patchFolder({ azione: 'sposta', destinazione: 'Brand/Loghi' })).status, 400, 'dentro sé stessa')
  assert.equal((await patchFolder({ azione: 'sposta', destinazione: '' })).status, 400, 'è già nella radice')
  const before = rpcCalls.length
  assert.equal((await patchFolder({ azione: 'sposta', destinazione: '../fuori' })).status, 400)
  assert.equal(rpcCalls.length, before, 'le mosse impossibili non arrivano al database')
  assert.equal((await patchFolder({ azione: 'sposta', destinazione: 'Archivio', percorso: 'Brand/Loghi' })).status, 200)
  assert.equal(rpcCalls.at(-1)!.args.p_to, 'Archivio/Loghi')
  assert.equal((await patchFolder({ azione: 'archivia' })).status, 200)
  assert.deepEqual(rpcCalls.at(-1)!.args, { p_client: client, p_source: 'team', p_path: 'Brand', p_archive: true })
  assert.equal((await patchFolder({ azione: 'elimina' })).status, 200)
  assert.equal(rpcCalls.at(-1)!.fn, 'portal_material_folder_delete')
  assert.equal((await patchFolder({ azione: 'boh' })).status, 400)
  rpcResult = { data: null, error: { code: '22023', message: 'Dentro ci sono ancora 2 file, anche archiviati: spostali o eliminali prima' } }
  const nonVuota = await patchFolder({ azione: 'elimina' })
  assert.equal(nonVuota.status, 400)
  assert.match((await nonVuota.json()).error, /Dentro ci sono ancora 2 file/, 'la frase del database arriva a chi ha chiesto')
  rpcResult = { data: null, error: { code: '42501' } }
  assert.equal((await patchFolder({ azione: 'archivia' })).status, 403)
  rpcResult = { data: null, error: { code: 'PGRST202' } }
  const senza254 = await patchFolder({ azione: 'archivia' })
  assert.equal(senza254.status, 503)
  assert.match((await senza254.json()).error, /migration 254/, 'senza la migration lo si dice, non è un guasto')
  rpcResult = { data: 2, error: null }

  const move = (body: Record<string, unknown>) => sposta.POST(json('POST', { client, ...body }))
  assert.equal((await move({ ids: [], destinazione: 'Brand' })).status, 400)
  assert.equal((await move({ ids: ['non-un-uuid'], destinazione: 'Brand' })).status, 400)
  assert.equal((await move({ ids: [nostroFile], destinazione: '../fuori' })).status, 400)
  assert.equal((await move({ ids: [nostroFile, nascostoFile], destinazione: 'Brand' })).status, 404, 'un file di un’altra azienda non si porta dietro')
  userId = 'viewer'
  assert.equal((await move({ ids: [nostroFile], destinazione: 'Brand' })).status, 403)
  userId = junior
  const calls = fns().length
  assert.equal((await move({ ids: [nostroFile, altruiFile], destinazione: 'Brand/Loghi' })).status, 200)
  assert.equal(fns().length, calls + 1)
  assert.deepEqual(rpcCalls.at(-1), { fn: 'portal_material_move', args: { p_ids: [nostroFile, altruiFile], p_path: 'Brand/Loghi' }, actor: true })
  assert.equal((await move({ ids: [nostroFile], destinazione: '' })).status, 200)
  assert.equal(rpcCalls.at(-1)!.args.p_path, '', 'nella radice')

  materials.find(m => m.id === nostroFile).name = 'ds.pdf'
  assert.equal((await one.PATCH(json('PATCH', { azione: 'rinomina', nome: ' Design system ' }), { params: { id: nostroFile } })).status, 200)
  assert.deepEqual(rpcCalls.at(-1), { fn: 'portal_material_rename', args: { p_id: nostroFile, p_name: 'Design system.pdf' }, actor: true }, 'il tipo resta quello di prima')
  assert.equal((await one.PATCH(json('PATCH', { azione: 'rinomina', nome: 'su/giu' }), { params: { id: nostroFile } })).status, 400)
  assert.equal((await one.PATCH(json('PATCH', { azione: 'rinomina', nome: 'x' }), { params: { id: nascostoFile } })).status, 404, 'azienda nascosta')

  // La scheda sa se si può organizzare: c'è la 254, e chi guarda scrive.
  folders = [{ client_id: client, source: 'team', path: 'Vuota' }]
  const conCartelle = await getClientFiles(client)
  assert.deepEqual(conCartelle.data!.folders, [{ client_id: client, source: 'team', path: 'Vuota' }])
  assert.equal(conCartelle.data!.canOrganize, true)
  foldersMissing = true
  const senzaCartelle = await getClientFiles(client)
  assert.equal(senzaCartelle.error, undefined, 'senza la 254 l’area si apre lo stesso')
  assert.equal(senzaCartelle.data!.canOrganize, false, 'ma non promette di spostare niente')

  console.log('Tutti i controlli passano: solo staff attivo, azienda nascosta esclusa, percorsi e tipi rifiutati prima dello storage, file nostri che nascono nostri, archiviazione reversibile, cancellazioni per ruolo e area della scheda cliente attiva prima del portale, porta unica con l’azienda nascosta anche sulla PATCH, letture a pagine, cartelle create con l’attore, spostamenti e rinomina che arrivano al database solo se possibili, e la 254 mancante detta a parole.')
}

main().catch(error => { console.error(error); process.exit(1) })

/* §397 — Esegui: npx tsx scripts/check-portal-materials-routes.ts
   Lo spazio file del cliente è la **prima scrittura** che arriva dal portale:
   fin qui il cliente poteva solo leggere. Qui si prova che la porta regga
   prima che un byte tocchi lo storage, e che un errore non lasci un file
   senza riga o una riga senza file. */
import assert from 'node:assert/strict'
import Module from 'node:module'

const client = 'f2501000-0000-4000-8000-000000000001'
const other = 'f2501000-0000-4000-8000-000000000002'
const project = 'f2502000-0000-4000-8000-000000000001'
const outOfScope = 'f2502000-0000-4000-8000-000000000002'
const referente = 'f2500000-0000-4000-8000-000000000002'
const collega = 'f2500000-0000-4000-8000-000000000003'
const materialId = 'f2508000-0000-4000-8000-000000000001'
const key = 'f2507000-0000-4000-8000-000000000001'

let userId: string | null = referente
let role = 'client', appRole = 'client', active = true
let portalRole = 'referente', scope: 'all' | 'selected' = 'all'
let scopedProjects = [project]
let missingSchema = false, insertDenied = false, tooLarge = false
let usedBytes = 0
class StorageTooLarge extends Error {}

let files: any[] = [], materials: any[] = [], objects: string[] = []
let png = Buffer.alloc(0)
const stream = (buffer: Buffer) => new ReadableStream<Uint8Array>({
  start(controller) { controller.enqueue(new Uint8Array(buffer)); controller.close() },
})
let thumbs: Record<string, Buffer> = {}
let sourceBroken = false, generated = 0
const calls: string[] = []
function reset() {
  files = []; objects = []; calls.length = 0; usedBytes = 0
  thumbs = {}; sourceBroken = false; generated = 0
  materials = [{
    id: materialId, client_id: client, project_id: null, file_id: 'f2506000-0000-4000-8000-000000000001',
    storage_key: 'materiali/logo.png', name: 'logo.png', mime: 'image/png', size: 1000, kind: 'immagine',
    uploaded_by: referente, uploaded_by_name: 'Referente', deleted_at: null, idempotency_key: 'f2507000-0000-4000-8000-000000000099',
  }]
  insertDenied = false; tooLarge = false; missingSchema = false
}

class Query {
  filters: ((row: any) => boolean)[] = []
  one = false; op = 'read'; value: any
  constructor(public table: string, public session: boolean) {}
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
  async then(resolve: (r: any) => unknown, reject?: (e: unknown) => unknown) {
    try {
      calls.push(`${this.session ? 'session' : 'service'}:${this.table}:${this.op}`)
      if (this.op !== 'read') assert.equal(this.session, false, `scrittura con la sessione su ${this.table}`)
      if (missingSchema && this.table.startsWith('portal_')) {
        return resolve({ data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${this.table}'` } })
      }
      if (this.table === 'portal_memberships') {
        const rows = userId && portalRole ? [{ id: 'membership', portal_role: portalRole, project_scope: scope }] : []
        const ok = this.filters.every(f => f({ client_id: client, revoked_at: null }))
        return resolve({ data: ok ? rows[0] ?? null : null, error: null })
      }
      if (this.table === 'portal_project_access') {
        return resolve({ data: scopedProjects.map(project_id => ({ project_id })), error: null })
      }
      const table = this.table === 'files' ? files : this.table === 'portal_materials' ? materials : null
      assert.ok(table, `tabella inattesa: ${this.table}`)
      const matched = table.filter(r => this.filters.every(f => f(r)))
      if (this.op === 'insert') {
        if (insertDenied && this.table === 'portal_materials') return resolve({ data: null, error: { code: '42501' } })
        const row = { id: `f2509000-0000-4000-8000-${String(table.length + 1).padStart(12, '0')}`, deleted_at: null, ...this.value }
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
      if (this.table === 'portal_materials' && !this.one && usedBytes) {
        return resolve({ data: [{ size: usedBytes }], error: null })
      }
      const copy = matched.map(r => ({ ...r }))
      return resolve({ data: this.one ? copy[0] ?? null : copy, error: null })
    } catch (e) { if (reject) return reject(e); throw e }
  }
}

const internal = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown }
const original = internal._load
internal._load = function (name, ...args) {
  if (name === 'server-only') return {}
  if (name === '@/lib/auth') {
    return { getViewer: async () => ({
      user: userId ? { id: userId } : null,
      profile: userId ? { id: userId, full_name: 'Referente', role, app_role: appRole, is_active: active } : null,
    }) }
  }
  if (name === '@/lib/supabase/server') {
    return { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
      from: (t: string) => new Query(t, true),
    }) }
  }
  if (name === '@/lib/supabase/admin') {
    return {
      createAdminClient: () => ({ from: (t: string) => new Query(t, false) }),
      createActorClient: (id: string) => { assert.equal(id, userId); return { from: (t: string) => new Query(t, false) } },
    }
  }
  if (name === '@/lib/storage/s3') {
    return {
      S3_BUCKET: 'twobee-crm',
      StorageTooLarge,
      isStorageConfigured: () => true,
      buildObjectKey: (folder: string, filename: string, scopeId?: string) => `${folder}/${scopeId}/${filename}`,
      deleteObject: async (k: string) => { calls.push('s3:delete'); objects = objects.filter(o => o !== k) },
      putObject: async (k: string, body: Buffer) => { thumbs[k] = body; generated += 1 },
      getObject: async (k: string, range?: string) => {
        const size = 1000
        if (k.startsWith('materiali/miniature/')) {
          if (!thumbs[k]) throw new Error('assente')
          return { body: stream(thumbs[k]), contentType: 'image/webp', contentLength: thumbs[k].length }
        }
        if (sourceBroken) throw new Error('storage giù')
        if (!range) return { body: stream(png), contentType: 'image/png', contentLength: size }
        const [start, end] = range.replace('bytes=', '').split('-').map(Number)
        return { body: 'byte', contentType: 'image/png', contentLength: end - start + 1, contentRange: `bytes ${start}-${end}/${size}` }
      },
      putObjectStream: async (k: string, stream: ReadableStream<Uint8Array>, options: { limitBytes: number }) => {
        calls.push('s3:put')
        if (tooLarge) throw new StorageTooLarge('troppo grande')
        let total = 0
        const reader = stream.getReader()
        for (;;) { const { done, value } = await reader.read(); if (value) total += value.length; if (done) break }
        assert.ok(options.limitBytes > 0)
        objects.push(k)
        return { size: total }
      },
    }
  }
  return original.call(this, name, ...args)
}

const upload = (body: string, headers: Record<string, string>, query = `client=${client}`) =>
  new Request(`https://os.example.test/api/portale/materiali?${query}`, { method: 'POST', body, headers })
const good = { 'content-type': 'image/png', 'x-file-name': 'logo.png', 'x-idempotency-key': key }

async function main() {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only'
  // Un PNG vero, piccolo: la miniatura la genera sharp per davvero.
  const sharp = (await import('sharp')).default
  png = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer()
  const route = require('../app/api/portale/materiali/route') as typeof import('../app/api/portale/materiali/route')
  const one = require('../app/api/portale/materiali/[id]/route') as typeof import('../app/api/portale/materiali/[id]/route')
  reset()

  // ── La porta, prima che un byte tocchi lo storage ─────────────────────────
  userId = null
  assert.equal((await route.POST(upload('x', good))).status, 401)
  userId = referente; active = false
  assert.equal((await route.POST(upload('x', good))).status, 403, 'profilo disattivato')
  active = true; role = 'team'; appRole = 'manager'
  assert.equal((await route.POST(upload('x', good))).status, 403, 'lo staff non carica al posto del cliente')
  role = 'client'; appRole = 'client'; portalRole = 'lettore'
  assert.equal((await route.POST(upload('x', good))).status, 403, 'il lettore consulta')
  portalRole = 'referente'
  assert.equal((await route.POST(upload('x', good, `client=${other}`))).status, 404, 'azienda senza membership')
  assert.equal((await route.POST(upload('x', good, 'client=non-un-uuid'))).status, 404)
  // Sei rifiuti, e lo storage non è stato nemmeno aperto.
  assert.equal(objects.length, 0)
  assert.equal(calls.filter(c => c.startsWith('s3:')).length, 0, 'nessun accesso allo storage prima dei permessi')
  assert.equal((await route.POST(upload('x', good))).status, 200, 'il referente carica')
  reset()

  // ── Cosa si può caricare ─────────────────────────────────────────────────
  for (const [headers, why] of [
    [{ ...good, 'x-idempotency-key': 'non-un-uuid' }, 'chiave di idempotenza'],
    [{ ...good, 'x-file-name': '' }, 'nome mancante'],
    [{ ...good, 'x-file-name': 'pagina.html', 'content-type': 'text/html' }, 'contenuto attivo'],
    [{ ...good, 'x-file-name': 'logo.svg', 'content-type': 'image/svg+xml' }, 'svg'],
    [{ ...good, 'x-file-name': 'installa.exe', 'content-type': 'application/octet-stream' }, 'eseguibile'],
    [{ ...good, 'content-type': 'application/x-sh' }, 'tipo non ammesso'],
  ] as [Record<string, string>, string][]) {
    const response = await route.POST(upload('x', headers))
    assert.equal(response.status, 400, why)
  }
  assert.equal(calls.filter(c => c === 's3:put').length, 0, 'un tipo rifiutato non apre lo storage')

  assert.equal((await route.POST(upload('x', good, `client=${client}&progetto=${outOfScope}`))).status, 200, 'scope totale: ogni progetto va bene')
  reset(); scope = 'selected'; scopedProjects = [project]
  assert.equal((await route.POST(upload('x', good, `client=${client}&progetto=${outOfScope}`))).status, 403, 'progetto fuori dai suoi')
  assert.equal((await route.POST(upload('x', good, `client=${client}&progetto=${project}`))).status, 200)
  scope = 'all'; reset()

  // ── Spazio e dimensione ──────────────────────────────────────────────────
  usedBytes = 20 * 1024 * 1024 * 1024
  assert.equal((await route.POST(upload('x', good))).status, 507, 'spazio pieno')
  assert.equal(calls.filter(c => c === 's3:put').length, 0)
  usedBytes = 0; tooLarge = true
  assert.equal((await route.POST(upload('x', good))).status, 413, 'oltre il limite si interrompe')
  assert.equal(objects.length, 0, 'il file troppo grande non resta sullo storage')
  tooLarge = false; reset()

  // ── Il caso normale, e il ritorno indietro ───────────────────────────────
  const created = await route.POST(upload('ciao', good))
  assert.equal(created.status, 200)
  assert.equal(files.length, 1)
  assert.equal(files[0].folder, 'materiali')
  assert.equal(files[0].entity_type, 'client')
  assert.equal(files[0].entity_id, client)
  assert.equal(files[0].uploaded_by, referente)
  const added = materials.find(m => m.idempotency_key === key)
  assert.ok(added)
  assert.equal(added.kind, 'immagine')
  assert.equal(added.size, 4)
  assert.equal(added.storage_key, files[0].object_key)
  assert.equal(added.uploaded_by_name, 'Referente')
  assert.equal(objects.length, 1)

  // Reinvio: nessuna seconda copia, nessun secondo caricamento.
  const before = calls.filter(c => c === 's3:put').length
  const again = await route.POST(upload('ciao', good))
  assert.equal(again.status, 200)
  assert.equal((await again.json()).ripetuto, true)
  assert.equal(calls.filter(c => c === 's3:put').length, before, 'il reinvio non ricarica')
  assert.equal(materials.filter(m => m.idempotency_key === key).length, 1)

  reset(); insertDenied = true
  const denied = await route.POST(upload('ciao', good))
  assert.equal(denied.status, 403)
  assert.equal(objects.length, 0, 'niente file orfano se la riga non passa')
  assert.equal(files.length, 0, 'niente metadato orfano')
  insertDenied = false; reset()

  missingSchema = true
  assert.equal((await route.POST(upload('x', good))).status, 503, 'schema assente: lo dichiara, non finge')
  missingSchema = false; reset()

  // ── Scaricare: Range, e la riga che non torna è un 404 ────────────────────
  const params = { params: { id: materialId } }
  userId = null
  assert.equal((await one.GET(new Request('https://os.example.test/'), params)).status, 401)
  userId = referente
  assert.equal((await one.GET(new Request('https://os.example.test/'), { params: { id: 'non-un-uuid' } })).status, 404)
  const full = await one.GET(new Request('https://os.example.test/'), params)
  assert.equal(full.status, 200)
  assert.equal(full.headers.get('Accept-Ranges'), 'bytes')
  assert.equal(full.headers.get('Cache-Control'), 'private, no-store')
  const ranged = await one.GET(new Request('https://os.example.test/', { headers: { range: 'bytes=0-99' } }), params)
  assert.equal(ranged.status, 206)
  assert.equal(ranged.headers.get('Content-Range'), 'bytes 0-99/1000')
  const outside = await one.GET(new Request('https://os.example.test/', { headers: { range: 'bytes=5000-6000' } }), params)
  assert.equal(outside.status, 416)

  // ── Rimuovere: solo i propri file ────────────────────────────────────────
  const del = (id: string) => new Request(`https://os.example.test/api/portale/materiali/${id}?client=${client}`, { method: 'DELETE' })
  userId = collega
  assert.equal((await one.DELETE(del(materialId), params)).status, 403, 'non si rimuove il file di un collega')
  userId = referente
  assert.equal((await one.DELETE(del(materialId), params)).status, 200)
  assert.ok(materials[0].deleted_at && materials[0].deleted_by === referente)
  assert.equal((await one.DELETE(del(materialId), params)).status, 404, 'due volte no')

  // ── §401 Miniature: generate una volta, e mai promesse a vuoto ───────────
  reset()
  // sharp è quello vero: la rotta lo importa dal caricatore ESM, non dal mock.
  // Meglio — così si prova che un PNG diventi davvero una webp più piccola.
  const thumb = require('../app/api/portale/materiali/[id]/miniatura/route') as typeof import('../app/api/portale/materiali/[id]/miniatura/route')
  const ask = (id = materialId) => thumb.GET(new Request('https://os.example.test/'), { params: { id } })
  userId = null
  assert.equal((await ask()).status, 401)
  userId = referente
  assert.equal((await ask('non-un-uuid')).status, 404)
  assert.equal(generated, 0, 'niente immagini aperte prima dei permessi')

  const first = await ask()
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('Content-Type'), 'image/webp')
  assert.equal(first.headers.get('Cache-Control'), 'private, max-age=300', 'la copia resta nel browser di chi guarda, e scade presto')
  assert.equal(first.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(generated, 1)
  const stored = thumbs[`materiali/miniature/${materialId}.webp`]
  assert.ok(stored, 'la miniatura resta accanto all’originale')
  assert.ok(stored.length < png.length, 'e pesa meno dell’originale')
  assert.equal(stored.subarray(8, 12).toString(), 'WEBP', 'ed è davvero una webp')

  const second = await ask()
  assert.equal(second.status, 200)
  assert.equal(generated, 1, 'la seconda visita la trova già fatta')

  // Un file che non è un'immagine non ha miniatura, e non la promette.
  materials[0].mime = 'application/pdf'; materials[0].name = 'contratto.pdf'
  assert.equal((await ask()).status, 404)
  materials[0].mime = 'image/vnd.adobe.photoshop'; materials[0].name = 'logo.psd'
  assert.equal((await ask()).status, 404, 'un psd non è un’immagine che il browser disegna')
  materials[0].mime = 'image/png'; materials[0].name = 'logo.png'
  materials[0].size = 200 * 1024 * 1024
  assert.equal((await ask()).status, 404, 'un originale enorme non si apre per farne un francobollo')
  materials[0].size = 1000

  // Se la generazione fallisce — storage giù, binario assente, formato strano —
  // si risponde 404 e l'elenco torna alle icone: una miniatura mancante non è
  // un guasto.
  reset(); sourceBroken = true
  assert.equal((await ask()).status, 404, 'generazione fallita: nessun guasto, nessuna miniatura')

  console.log('Tutti i controlli passano: ruoli e membership prima dello storage, tipi rifiutati, scope progetto, spazio pieno, limite, idempotenza, ritorno indietro, Range, rimozione e miniature generate una volta sola.')
}

main().catch(error => { console.error(error); process.exit(1) })

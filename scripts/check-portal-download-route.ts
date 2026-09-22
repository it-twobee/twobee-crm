/* §395 — Esegui: npx tsx scripts/check-portal-download-route.ts
   Il download di una consegna non passa da `/api/files/:id/download`: quello è
   dello staff e aggirerebbe pubblicazione, scope progetto e revoca. Qui si
   prova che l'autorizzazione **sia** la RLS e che il client di servizio nasca
   solo dopo, per leggere una chiave che al browser non è concessa. */
import assert from 'node:assert/strict'
import Module from 'node:module'

const version = 'f2478000-0000-4000-8000-000000000001'
const fileId = 'f2476000-0000-4000-8000-000000000001'

let signedIn = true, visible = true, readError = false
let storedKey = 'deliverables/consegna.pdf'
const baseFile = { id: fileId, bucket: 'twobee-crm', folder: 'deliverables', object_key: 'deliverables/consegna.pdf', name: 'Consegna.pdf', mime: 'application/pdf', size: 1000 }
let fileRow: any = { ...baseFile }
let storageFails = false
let adminClients = 0
const sessionFilters: string[] = []

class SessionQuery {
  one = false
  select(_c: string) { return this }
  eq(key: string, value: unknown) { sessionFilters.push(`eq:${key}:${value}`); return this }
  is(key: string, value: unknown) { sessionFilters.push(`is:${key}:${value}`); return this }
  not(key: string, op: string, value: unknown) { sessionFilters.push(`not:${key}:${op}:${value}`); return this }
  maybeSingle() { this.one = true; return this }
  async then(resolve: (r: any) => unknown) {
    if (readError) return resolve({ data: null, error: { code: '08006' } })
    return resolve({ data: visible ? { id: version } : null, error: null })
  }
}
class AdminQuery {
  constructor(public table: string) {}
  select(_c: string) { return this }
  eq() { return this }
  maybeSingle() { return this }
  async then(resolve: (r: any) => unknown) {
    if (this.table === 'portal_deliverable_versions') return resolve({ data: { storage_key: storedKey, file_id: fileId }, error: null })
    return resolve({ data: fileRow, error: null })
  }
}

const internal = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown }
const original = internal._load
internal._load = function (name, ...args) {
  // `server-only` esiste solo dentro il bundler di Next.
  if (name === 'server-only') return {}
  if (name === '@/lib/supabase/server') {
    return { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'f2470000-0000-4000-8000-000000000002' } : null } }) },
      from: (table: string) => { assert.equal(table, 'portal_deliverable_versions'); return new SessionQuery() },
    }) }
  }
  if (name === '@/lib/supabase/admin') {
    return { createAdminClient: () => { adminClients++; return { from: (table: string) => new AdminQuery(table) } } }
  }
  if (name === '@/lib/storage/s3') {
    return {
      S3_BUCKET: 'twobee-crm',
      getObject: async (key: string, range?: string) => {
        if (storageFails) throw new Error('MinIO giù')
        assert.equal(key, fileRow.object_key)
        if (!range) return { body: 'byte', contentType: fileRow.mime, contentLength: fileRow.size }
        const [start, end] = range.replace('bytes=', '').split('-').map(Number)
        return { body: 'byte', contentType: fileRow.mime, contentLength: end - start + 1, contentRange: `bytes ${start}-${end}/${fileRow.size}` }
      },
    }
  }
  return original.call(this, name, ...args)
}

async function main() {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only'
  const route = require('../app/api/portale/consegne/[versionId]/route') as typeof import('../app/api/portale/consegne/[versionId]/route')
  const call = (id = version) => route.GET(new Request('https://os.example.test/'), { params: { versionId: id } })

  signedIn = false
  assert.equal((await call()).status, 401)
  assert.equal(adminClients, 0, 'nessun client di servizio per un anonimo')
  signedIn = true

  assert.equal((await call('../../etc/passwd')).status, 404)
  assert.equal((await call('non-un-uuid')).status, 404)
  assert.equal(adminClients, 0)

  visible = false
  assert.equal((await call()).status, 404, 'la RLS non torna la riga: non esiste, per chi chiede')
  assert.equal(adminClients, 0, 'la chiave non si legge prima dell’autorizzazione')
  visible = true

  readError = true
  assert.equal((await call()).status, 503, 'un errore di lettura non è un «non esiste»')
  assert.equal(adminClients, 0)
  readError = false

  // La query di autorizzazione chiede pubblicata e non ritirata: sempre.
  sessionFilters.length = 0
  await call()
  assert.ok(sessionFilters.includes(`eq:id:${version}`))
  assert.ok(sessionFilters.includes('not:published_at:is:null'))
  assert.ok(sessionFilters.includes('is:retired_at:null'))

  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  assert.equal((await call()).status, 503)
  process.env.SUPABASE_SERVICE_ROLE_KEY = previous

  storedKey = 'deliverables/un-altro.pdf'
  assert.equal((await call()).status, 409, 'la chiave pubblicata non coincide col file: non si serve')
  storedKey = 'deliverables/consegna.pdf'

  fileRow = { ...baseFile, bucket: 'un-altro-bucket' }
  assert.equal((await call()).status, 409)
  fileRow = { ...baseFile, object_key: 'deliverables/../payslips/busta.pdf' }
  storedKey = fileRow.object_key
  assert.equal((await call()).status, 409, 'nessun alias fuori dal prefisso della cartella')
  fileRow = { ...baseFile }
  storedKey = fileRow.object_key

  storageFails = true
  assert.equal((await call()).status, 502)
  storageFails = false

  const ok = await call()
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(ok.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.match(ok.headers.get('Content-Disposition')!, /^inline;/)

  // §397 — un video si fa scorrere solo se rispondiamo al Range.
  const ranged = await route.GET(new Request('https://os.example.test/', { headers: { range: 'bytes=0-99' } }), { params: { versionId: version } })
  assert.equal(ranged.status, 206)
  assert.equal(ranged.headers.get('Content-Range'), 'bytes 0-99/1000')
  assert.equal(ranged.headers.get('Accept-Ranges'), 'bytes')
  assert.equal((await call()).headers.get('Accept-Ranges'), 'bytes', 'lo dichiariamo anche senza Range')
  const outside = await route.GET(new Request('https://os.example.test/', { headers: { range: 'bytes=5000-6000' } }), { params: { versionId: version } })
  assert.equal(outside.status, 416, 'un intervallo fuori dal file non si serve come se fosse tutto')
  assert.equal(outside.headers.get('Content-Range'), 'bytes */1000')

  fileRow = { ...baseFile, name: 'consegna.html', mime: 'text/html' }
  const active = await call()
  assert.match(active.headers.get('Content-Disposition')!, /^attachment;/, 'niente contenuti attivi nell’origine autenticata')
  assert.match(active.headers.get('Content-Security-Policy')!, /sandbox/)

  console.log('Tutti i controlli passano: anonimo, id non valido, revoca come 404, errore distinto dal vuoto, chiave verificata, storage giù, Range e contenuti attivi scaricati.')
}

main().catch(error => { console.error(error); process.exit(1) })

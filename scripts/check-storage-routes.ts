import assert from 'node:assert/strict'
import Module from 'node:module'
import { canReadFile, canReadFolder, isStorageStaff } from '../lib/storage/access'

const uid = (kind: number, n: number) => `f246${kind}000-0000-4000-8000-${String(n).padStart(12, '0')}`
const actor = uid(0, 1), other = uid(0, 2), clientA = uid(1, 1), clientB = uid(1, 2), feedback = uid(6, 1)
const fileA = uid(3, 1), fileB = uid(3, 2), general = uid(3, 3), otherFile = uid(3, 4)
const root = uid(2, 1), miscRoot = uid(2, 2), child = uid(2, 3)
const profile = { id: actor, role: 'team', app_role: 'manager', is_active: true, email: 'manager@example.invalid' }
let authenticated = true, profileError = false, contextError = false, insertError = false, shareError = false, s3Error = false
let serviceClients = 0, puts = 0, gets = 0, deletes = 0
let shareArgs: any = null
const actorShape = () => ({ userId: actor, role: profile.role, appRole: profile.app_role, active: profile.is_active })
const newFile = (id: string, folder: string, owner: string, entity_type: string | null = null, entity_id: string | null = null, folder_id: string | null = null) => ({
  id, folder, uploaded_by: owner, entity_type, entity_id, folder_id, bucket: 'test-bucket', object_key: `${folder}/${id}.pdf`, name: 'Documento.pdf', mime: 'application/pdf', size: 2,
})
let files: any[] = [], folders: any[] = [], shares: any[] = []
function resetRows() {
  files = [newFile(fileA, 'clients', actor, 'client', clientA), newFile(fileB, 'clients', other, 'client', clientB), newFile(general, 'misc', actor), newFile(otherFile, 'misc', other)]
  folders = [
    { id: root, parent_id: null, folder: 'clients', entity_type: 'client', entity_id: clientA, created_by: actor },
    { id: miscRoot, parent_id: null, folder: 'misc', entity_type: null, entity_id: null, created_by: actor },
  ]
  shares = []
}
resetRows()

class Query {
  filters: ((row: any) => boolean)[] = []
  one = false
  op = 'read'
  value: any
  slice: [number, number] | null = null
  constructor(public table: string, public admin: boolean) {}
  select(_columns: string) { return this }
  eq(key: string, value: unknown) { this.filters.push(row => row[key] === value); return this }
  is(key: string, value: unknown) { this.filters.push(row => (row[key] ?? null) === value); return this }
  in(key: string, values: unknown[]) { this.filters.push(row => values.includes(row[key])); return this }
  order(_key: string) { return this }
  range(from: number, to: number) { this.slice = [from, to]; return this }
  single() { this.one = true; return this }
  maybeSingle() { this.one = true; return this }
  insert(value: any) { assert.ok(this.admin); this.op = 'insert'; this.value = value; return this }
  delete() { assert.ok(this.admin); this.op = 'delete'; return this }
  async then(resolve: (result: any) => unknown, reject?: (error: unknown) => unknown) {
    try {
      if (profileError && this.table === 'profiles') return resolve({ data: null, error: { code: 'offline' } })
      if (insertError && this.op === 'insert') return resolve({ data: null, error: { message: 'PRIVATE DB DETAILS' } })
      let rows = this.table === 'profiles' ? [profile] : this.table === 'files' ? files : this.table === 'file_folders' ? folders
        : this.table === 'file_shares' ? shares : this.table === 'feedback' ? [{ id: feedback, author_id: actor }] : null
      assert.ok(rows, `Unexpected table: ${this.table}`)
      let selected = rows.filter(row => this.filters.every(filter => filter(row)))
      if (!this.admin && this.table !== 'profiles') {
        assert.ok(isStorageStaff(actorShape()), 'nessuna lettura file per ruolo cliente/inattivo')
        selected = selected.filter(row => row.entity_id !== clientB)
        if (this.table === 'files') selected = selected.filter(row => canReadFile(actorShape(), row))
        if (this.table === 'file_folders') selected = selected.filter(row => canReadFolder(actorShape(), row))
      }
      if (this.op === 'insert') {
        const row = { id: uid(this.table === 'files' ? 3 : 2, 90), ...this.value }
        assert.equal(row.uploaded_by ?? row.created_by, actor)
        rows.push(row); selected = [row]
      }
      if (this.op === 'delete') {
        for (const row of selected) rows.splice(rows.indexOf(row), 1)
      }
      if (this.slice) selected = selected.slice(this.slice[0], this.slice[1] + 1)
      return resolve({ data: this.one ? selected[0] ?? null : selected.map(row => ({ ...row })), error: null })
    } catch (error) { if (reject) return reject(error); throw error }
  }
}

const session = {
  auth: { getUser: async () => ({ data: { user: authenticated ? { id: actor } : null }, error: null }) },
  from: (table: string) => new Query(table, false),
  rpc: async (name: string, args: any) => {
    assert.equal(name, 'storage_context_access'); assert.equal(args.p_write, true)
    return { data: args.p_entity_id !== clientB, error: contextError ? { code: 'PGRST202' } : null }
  },
}
const admin = {
  from: (table: string) => new Query(table, true),
  rpc: async (name: string, args: any) => {
    assert.equal(name, 'storage_replace_share'); shareArgs = args
    if (shareError) return { data: null, error: { message: 'PRIVATE SQL DETAILS' } }
    shares.filter(s => s.file_id === args.p_file).forEach(s => { s.revoked = true })
    if (!args.p_token) return { data: [], error: null }
    const share = { id: uid(4, shares.length + 1), file_id: args.p_file, token: args.p_token, created_by: actor, expires_at: args.p_expires_at, revoked: false }
    shares.push(share); return { data: [share], error: null }
  },
}
const modules = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown }
const original = modules._load
modules._load = function (name, ...args) {
  if (name === '@/lib/supabase/server') return { createClient: async () => session }
  if (name === '@/lib/supabase/admin') return {
    createActorClient: (id: string) => { assert.equal(id, actor); serviceClients++; return admin },
    createAdminClient: () => { serviceClients++; return admin },
  }
  if (name === '@/lib/storage/s3') return {
    S3_BUCKET: 'test-bucket', buildObjectKey: (folder: string) => `${folder}/new-file.pdf`,
    putObject: async () => { puts++; if (s3Error) throw new Error('PRIVATE STORAGE DETAILS') },
    deleteObject: async () => { deletes++; if (s3Error) throw new Error('PRIVATE STORAGE DETAILS') },
    getObject: async () => { gets++; if (s3Error) throw new Error('PRIVATE STORAGE DETAILS'); return { body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('OK')); controller.close() } }), contentLength: 2 } },
  }
  return original.call(this, name, ...args)
}

async function main() {
  process.env.NEXT_PUBLIC_APP_URL = 'https://os.example.test'
  const list = require('../app/api/files/route') as typeof import('../app/api/files/route')
  const folder = require('../app/api/files/folders/route') as typeof import('../app/api/files/folders/route')
  const upload = require('../app/api/files/upload/route') as typeof import('../app/api/files/upload/route')
  const download = require('../app/api/files/[id]/download/route') as typeof import('../app/api/files/[id]/download/route')
  const remove = require('../app/api/files/[id]/route') as typeof import('../app/api/files/[id]/route')
  const removeFolder = require('../app/api/files/folders/[id]/route') as typeof import('../app/api/files/folders/[id]/route')
  const share = require('../app/api/files/[id]/share/route') as typeof import('../app/api/files/[id]/share/route')
  const publicDownload = require('../app/api/public/files/[token]/route') as typeof import('../app/api/public/files/[token]/route')
  const request = (body?: unknown) => new Request('http://localhost/api/files', body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const fileParams = { params: { id: fileA } }
  const folderParams = { params: { id: root } }
  const storageCalls = () => puts + gets + deletes
  const internalCalls = () => [
    () => list.GET(request()), () => folder.GET(request()), () => folder.POST(request({ name: 'Unsafe' })),
    () => upload.POST(request()), () => download.GET(request(), fileParams), () => remove.DELETE(request(), fileParams),
    () => removeFolder.DELETE(request(), folderParams), () => share.GET(request(), fileParams),
    () => share.POST(request({}), fileParams), () => share.DELETE(request(), fileParams),
  ]
  for (const denied of ['client', 'guest', 'inactive', 'anonymous', 'missing-profile']) {
    Object.assign(profile, { role: denied === 'client' || denied === 'guest' ? denied : 'team', app_role: denied === 'client' || denied === 'guest' ? denied : 'manager', is_active: denied !== 'inactive' })
    authenticated = denied !== 'anonymous'; profileError = denied === 'missing-profile'
    for (const call of internalCalls()) assert.equal((await call()).status, 401, denied)
  }
  assert.equal(serviceClients, 0); assert.equal(storageCalls(), 0)
  Object.assign(profile, { role: 'team', app_role: 'manager', is_active: true }); authenticated = true; profileError = false
  const visible = await (await list.GET(request())).json()
  assert.ok(visible.files.some((f: any) => f.id === fileA)); assert.ok(!visible.files.some((f: any) => f.id === fileB))
  assert.equal((await download.GET(request(), { params: { id: fileB } })).status, 404)
  assert.equal(gets, 0)
  const bytes = await download.GET(request(), fileParams)
  assert.equal(bytes.status, 200); assert.equal(await bytes.text(), 'OK'); assert.equal(bytes.headers.get('X-Content-Type-Options'), 'nosniff')
  files.find(f => f.id === general).object_key = 'payslips/another-person.pdf'
  const beforeAlias = gets
  assert.equal((await download.GET(request(), { params: { id: general } })).status, 404)
  assert.equal(gets, beforeAlias); resetRows()
  assert.equal((await remove.DELETE(request(), { params: { id: otherFile } })).status, 403)
  assert.equal((await share.POST(request({}), { params: { id: otherFile } })).status, 403)
  assert.equal((await share.POST(request({}), fileParams)).status, 403)
  assert.deepEqual(await (await share.GET(request(), fileParams)).json(), { share: null, sharingAllowed: false })

  function uploadRequest(entityId = clientA, folderId: string | null = null, feedbackMode = false) {
    const form = new FormData()
    form.set('file', new File(['sample'], 'test.pdf', { type: 'application/pdf' }))
    form.set('folder', feedbackMode ? 'feedback' : 'clients')
    form.set('entityType', feedbackMode ? 'feedback' : 'client'); form.set('entityId', feedbackMode ? feedback : entityId)
    if (folderId) form.set('folderId', folderId)
    return new Request('http://localhost/api/files/upload', { method: 'POST', body: form })
  }
  assert.equal((await upload.POST(uploadRequest(clientB))).status, 403)
  assert.equal((await upload.POST(uploadRequest(clientA, miscRoot))).status, 403)
  assert.equal(puts, 0)
  contextError = true
  assert.equal((await upload.POST(uploadRequest())).status, 403); assert.equal(puts, 0)
  contextError = false
  assert.equal((await upload.POST(uploadRequest(clientA, root))).status, 200)
  assert.equal((await upload.POST(uploadRequest(clientA, null, true))).status, 200)
  const beforeRollback = deletes
  insertError = true
  assert.equal((await upload.POST(uploadRequest())).status, 500)
  assert.equal(deletes, beforeRollback + 1); insertError = false
  assert.equal((await folder.POST(request({ name: 'Cartella', folder: 'clients', entityType: 'client', entityId: clientA, parentId: miscRoot }))).status, 403)
  assert.equal((await folder.POST(request({ name: 'Cartella', folder: 'clients', entityType: 'client', entityId: clientA, parentId: root }))).status, 200)
  profile.app_role = 'viewer'
  assert.equal((await list.GET(request())).status, 200)
  assert.equal((await upload.POST(uploadRequest())).status, 403)
  assert.equal((await remove.DELETE(request(), fileParams)).status, 403)
  assert.equal((await folder.POST(request({ name: 'Folder' }))).status, 403)
  profile.app_role = 'manager'; resetRows()

  folders.push({ ...folders[0], id: child, parent_id: root, created_by: other })
  const beforeTree = deletes
  assert.equal((await removeFolder.DELETE(request(), folderParams)).status, 403)
  assert.equal(deletes, beforeTree)
  const originalFolders = [...folders]
  folders = [folders[0], ...Array.from({ length: 500 }, (_, i) => ({ ...folders[0], id: uid(2, i + 100), parent_id: null })), folders.at(-1)]
  assert.equal((await removeFolder.DELETE(request(), folderParams)).status, 403, 'figlio non autorizzato oltre la prima pagina')
  assert.equal(deletes, beforeTree); folders = originalFolders
  folders.pop(); files.push(newFile(uid(3, 10), 'clients', other, 'client', clientA, root))
  assert.equal((await removeFolder.DELETE(request(), folderParams)).status, 403)
  assert.equal(deletes, beforeTree)
  files.pop(); files.push(newFile(uid(3, 10), 'clients', actor, 'client', clientA, root))
  assert.equal((await removeFolder.DELETE(request(), folderParams)).status, 200)
  assert.equal(deletes, beforeTree + 1); resetRows()

  const generalParams = { params: { id: general } }
  assert.equal((await share.POST(request({ expiresIn: '__proto__' }), generalParams)).status, 200)
  assert.match(shareArgs.p_token, /^[A-Za-z0-9_-]{32}$/)
  assert.ok(Date.parse(shareArgs.p_expires_at) > Date.now())
  const token = shareArgs.p_token
  shareError = true
  const rejectedShare = await share.POST(request({}), generalParams)
  assert.equal(rejectedShare.status, 500); assert.doesNotMatch(await rejectedShare.text(), /PRIVATE/)
  shareError = false
  const publicParams = { params: { token } }
  assert.equal((await publicDownload.GET(request(), publicParams)).status, 200)
  const beforeRevoked = gets
  profile.is_active = false
  assert.equal((await publicDownload.GET(request(), publicParams)).status, 404)
  profile.is_active = true; profile.app_role = 'viewer'
  assert.equal((await publicDownload.GET(request(), publicParams)).status, 404)
  profile.app_role = 'manager'
  shares[0].expires_at = '2000-01-01'
  assert.equal((await publicDownload.GET(request(), publicParams)).status, 410)
  shares[0].expires_at = null; shares[0].file_id = fileA
  assert.equal((await publicDownload.GET(request(), publicParams)).status, 404, 'vecchio link pubblico a file cliente non aggira le membership')
  shares[0].file_id = general
  assert.equal((await share.DELETE(request(), generalParams)).status, 200)
  assert.equal((await publicDownload.GET(request(), publicParams)).status, 404)
  assert.equal(gets, beforeRevoked)
  s3Error = true
  const unavailable = await download.GET(request(), fileParams)
  assert.equal(unavailable.status, 502); assert.doesNotMatch(await unavailable.text(), /PRIVATE/)
  s3Error = false

  // Lo spazio file del cliente ha le sue porte: da qui non si legge, non si
  // cancella — la DELETE toglieva i byte e poi il trigger rifiutava il metadato —
  // e non si carica.
  const materiale = uid(3, 9)
  files.push(newFile(materiale, 'materiali', actor, 'client', clientA))
  Object.assign(profile, { role: 'admin', app_role: 'founder', is_active: true })
  const beforeMaterial = storageCalls()
  const listed = await (await list.GET(request())).json()
  assert.ok(!listed.files.some((f: any) => f.id === materiale), 'l’elenco generico non mostra i materiali')
  assert.equal((await download.GET(request(), { params: { id: materiale } })).status, 404)
  assert.notEqual((await remove.DELETE(request(), { params: { id: materiale } })).status, 200)
  assert.ok(files.some(f => f.id === materiale), 'il materiale resta intero')
  const materialUpload = new FormData()
  materialUpload.set('file', new File(['sample'], 'logo.png', { type: 'image/png' }))
  materialUpload.set('folder', 'materiali'); materialUpload.set('entityType', 'client'); materialUpload.set('entityId', clientA)
  assert.equal((await upload.POST(new Request('http://localhost/api/files/upload', { method: 'POST', body: materialUpload }))).status, 400)
  assert.equal((await folder.POST(request({ name: 'Cartella', folder: 'materiali', entityType: 'client', entityId: clientA }))).status, 400)
  assert.equal(storageCalls(), beforeMaterial, 'nessun accesso allo storage per i materiali dalle API generiche')
  console.log('Tutti i controlli passano: 10 endpoint interni, guard reali, RLS letture, contesti/parent, rollback upload, cartelle condivise, viewer, token privati/revocati/scaduti, materiali fuori dalle API generiche e zero accessi S3 prima dei permessi.')
}
main().finally(() => { modules._load = original }).catch(error => { console.error(error); process.exitCode = 1 })

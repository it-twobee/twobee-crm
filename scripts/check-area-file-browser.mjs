// §416 — L'esploratore dell'area file, in un browser vero.
// Supabase simulato solo su loopback, nessun DB reale, nessuna scrittura: i
// caricamenti si intercettano prima che escano dal browser.
// NODE_PATH=<cartella con playwright> node scripts/check-area-file-browser.mjs
// NODE_PATH=… AREA_FILE_BUILD=.next-prod node scripts/check-area-file-browser.mjs   (dopo un build lì)
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdir, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { chromium } = createRequire(import.meta.url)('playwright')
const output = join(tmpdir(), 'opencode', 'area-file-browser')
await mkdir(output, { recursive: true })
const PORT = 3101, MOCK = 54331
const a = 'f2411000-0000-4000-8000-000000000001'
const ids = { manager: 'f2410000-0000-4000-8000-000000000001', freelance: 'f2410000-0000-4000-8000-000000000002' }
const m = (n, name, path, day, extra = {}) => ({
  id: `f2418000-0000-4000-8000-${String(n).padStart(12, '0')}`, client_id: a, project_id: null, name,
  mime: name.endsWith('.png') || name.endsWith('.jpg') ? 'image/png' : 'application/pdf', size: 1000 * n,
  kind: name.endsWith('.png') || name.endsWith('.jpg') ? 'immagine' : 'documento', path, source: 'team',
  uploaded_by: 'altro', uploaded_by_name: 'Collega', created_at: `2026-09-${String(day).padStart(2, '0')}T10:00:00Z`,
  archived_at: null, deleted_at: null, ...extra,
})
const materials = [
  m(1, 'Logo_Bianco_2025.png', 'Brand/Loghi', 20),
  m(2, 'logo nero.png', 'Brand/Loghi', 10),
  m(3, 'manuale.pdf', 'Brand', 5),
  m(4, 'preventivo 10.pdf', null, 22, { uploaded_by: ids.manager, uploaded_by_name: 'Manager di prova' }),
  m(5, 'preventivo 9.pdf', null, 21),
  m(6, 'copertina.psd', 'Grafica', 3, { mime: 'image/vnd.adobe.photoshop' }),
  m(7, 'vecchio.pdf', null, 1, { archived_at: '2026-09-02T10:00:00Z' }),
  m(8, 'foto-evento.jpg', 'Brand', 15, { source: 'cliente', uploaded_by_name: 'Referente' }),
  m(9, 'brief.pdf', null, 18, { source: 'cliente', uploaded_by_name: 'Referente' }),
]
const folders = []
const writes = []
let requests = 0
const identity = id => ({ id, email: 'staff@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' })
const token = id => {
  const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`
}
const client = { id: a, company_name: 'Azienda di prova A', display_name: null, client_type: 'growth', client_label: 'stabile', created_at: '2026-01-01', active_channels: [], is_internal: false, workspace_hidden: false }

const mock = createServer((req, res) => {
  requests++
  const url = new URL(req.url, 'http://127.0.0.1')
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST')
  const reply = (code, value) => { res.statusCode = code; res.end(JSON.stringify(value)) }
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  if (req.method === 'HEAD') { res.setHeader('Content-Range', '*/0'); res.statusCode = 200; return res.end() }
  let userId
  try { userId = JSON.parse(Buffer.from(req.headers.authorization?.split('.')[1] ?? '', 'base64url').toString()).sub } catch { /* anon */ }
  if (url.pathname === '/auth/v1/user') return userId ? reply(200, identity(userId)) : reply(401, { message: 'No session' })
  const table = url.pathname.split('/').pop()
  if (req.method !== 'GET') {
    // Il contesto azienda: visibile. Le altre funzioni qui non servono.
    if (url.pathname === '/rest/v1/rpc/storage_context_access') return reply(200, true)
    if (url.pathname.startsWith('/rest/v1/rpc/')) return reply(200, null)
    if (table.startsWith('portal_') || table === 'files') writes.push(`${req.method} ${table}`)
    return reply(201, [])
  }
  const eq = key => url.searchParams.get(key)?.replace(/^eq\./, '')
  let rows = []
  if (table === 'profiles') {
    const freelance = userId === ids.freelance
    rows = [{ ...identity(userId), full_name: freelance ? 'Freelance di prova' : 'Manager di prova', role: 'team', app_role: freelance ? 'freelance' : 'manager', is_active: true }]
  } else if (table === 'clients' || table === 'clients_workspace') {
    rows = [client].filter(c => !eq('id') || c.id === eq('id'))
  } else if (table === 'portal_materials') {
    // La RLS dei materiali (`portal_is_staff`) al freelance non passa niente.
    rows = userId === ids.freelance ? [] : materials.filter(x => (!eq('client_id') || x.client_id === eq('client_id')) && !x.deleted_at)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? rows.length)
    rows = rows.slice(offset, offset + limit)
  } else if (table === 'portal_memberships') {
    rows = [{ id: 'membership' }]
  } else if (table === 'portal_material_folders') {
    rows = folders.filter(f => f.client_id === eq('client_id'))
  }
  return reply(200, req.headers.accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows)
})
await new Promise(resolve => mock.listen(MOCK, '127.0.0.1', resolve))
// Il worker di pdf.js lo copia `npm run dev`; qui si lancia `next` direttamente.
await import('./copia-pdfjs.mjs')
const log = await open(join(output, 'next.log'), 'w')
// Con AREA_FILE_BUILD=<cartella> si prova una build di produzione già fatta
// (`next start`): pdf.js si impacchetta diverso in produzione, e va visto lì.
const built = process.env.AREA_FILE_BUILD
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', built ? 'start' : 'dev', '-p', String(PORT), '--hostname', '127.0.0.1'], {
  cwd: process.cwd(), detached: true, stdio: ['ignore', log.fd, log.fd],
  env: { ...process.env, NEXT_BUILD_DIR: built || '.next-build', NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${MOCK}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'area-file-test-only',
    // Finta, verso il mock: le rotte creano il client con l'attore appena passata la guard.
    SUPABASE_SERVICE_ROLE_KEY: 'area-file-test-only' },
})
let browser
try {
  for (let i = 0; i < 180; i++) {
    if (server.exitCode !== null) throw new Error('Server di test non avviato: vedere next.log')
    try { if ((await fetch(`http://127.0.0.1:${PORT}/login`)).ok) break } catch { /* avvio */ }
    if (i === 179) throw new Error('Timeout avvio localhost')
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  browser = await chromium.launch({ headless: true })
  async function session(name, width = 1440) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    const id = ids[name]
    const data = { access_token: token(id), refresh_token: 'test-only', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: identity(id) }
    const value = `base64-${Buffer.from(JSON.stringify(data)).toString('base64url')}`
    await context.addCookies(['127.0.0.1', 'localhost'].map(domain => ({ name: 'sb-127-auth-token', value, domain, path: '/' })))
    const page = await context.newPage()
    // Un errore nella pagina si legge qui, invece di indovinarlo da un timeout.
    page.on('pageerror', e => console.log(`[pagina] ${e.message}`))
    page.on('console', m => { if (m.type() === 'error') console.log(`[console] ${m.text()}`) })
    return { context, page }
  }
  const at = path => `http://127.0.0.1:${PORT}${path}`
  const area = page => page.getByRole('region', { name: /^Contenuto di / })
  const names = async page => (await area(page).locator('li .truncate.text-sm, li .truncate.text-2xs.font-semibold').allTextContents())
    .map(t => t.replace(' · archiviato', '').trim())
  async function checkContrast(page) {
    const failures = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d')
      const rgb = value => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return Array.from(ctx.getImageData(0, 0, 1, 1).data).map((v, i) => i === 3 ? v / 255 : v) }
      const blend = (front, back) => front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3]))
      const luminance = c => c.slice(0, 3).map(x => x / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0)
      const out = []
      for (const el of document.querySelectorAll('main section *, main nav *, main p, main label, main select, main button')) {
        if (!el.getBoundingClientRect().height || el.disabled || !el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue
        const style = getComputedStyle(el)
        let background = [255, 255, 255]
        const chain = []
        for (let x = el; x; x = x.parentElement) chain.unshift(x)
        for (const x of chain) background = blend(rgb(getComputedStyle(x).backgroundColor), background)
        const foreground = blend(rgb(style.color), background)
        const l1 = luminance(foreground), l2 = luminance(background)
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        if (ratio < 4.5) out.push({ text: el.textContent.trim().slice(0, 50), ratio: ratio.toFixed(2) })
      }
      return out
    })
    assert.deepEqual(failures, [], 'contrasto WCAG AA sul DOM renderizzato')
  }

  const { context, page } = await session('manager')
  const posted = []
  const uploadedNames = []
  await page.route('**/api/area-cliente/file?**', async route => {
    posted.push(new URL(route.request().url()).searchParams.get('percorso'))
    uploadedNames.push(decodeURIComponent(route.request().headers()['x-file-name'] ?? ''))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ material: { id: 'nuovo' } }) })
  })
  await page.goto(at(`/workspace/clienti/${a}?tab=11`), { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'File', exact: true }).waitFor()
  await page.getByRole('radio', { name: 'Nostri · 6' }).waitFor()
  assert.equal(await page.getByRole('radio', { name: 'Dal cliente · 2' }).count(), 1, 'gli archiviati non contano')

  // ── Cartelle ──────────────────────────────────────────────────────────────
  assert.deepEqual(await names(page), ['Brand', 'Grafica', 'preventivo 10.pdf', 'preventivo 9.pdf'], 'prima le cartelle, poi i file: i più recenti prima')
  await area(page).getByRole('button', { name: /^Brand/ }).click()
  await page.getByRole('navigation', { name: 'Cartella corrente' }).getByText('Brand', { exact: true }).waitFor()
  assert.match(page.url(), /cartella=Brand/, 'la cartella sta nell’indirizzo')
  await area(page).getByRole('button', { name: /^Loghi/ }).click()
  assert.deepEqual(await names(page), ['Logo_Bianco_2025.png', 'logo nero.png'])
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('navigation', { name: 'Cartella corrente' }).getByText('Loghi', { exact: true }).waitFor()
  assert.deepEqual(await names(page), ['Logo_Bianco_2025.png', 'logo nero.png'], 'un ricarico riapre la stessa cartella')
  await page.getByRole('navigation', { name: 'Cartella corrente' }).getByRole('button', { name: 'Nostri' }).click()
  assert.doesNotMatch(page.url(), /cartella=/)

  // ── Ordine, griglia, recenti, archiviati ─────────────────────────────────
  await page.getByLabel('Ordina').selectOption('nome:asc')
  assert.deepEqual(await names(page), ['Brand', 'Grafica', 'preventivo 9.pdf', 'preventivo 10.pdf'], 'i numeri contano come numeri')
  await page.getByRole('button', { name: 'Griglia', exact: true }).click()
  assert.equal(await area(page).locator('ul.grid > li').count(), 4, 'in griglia, una scheda per voce')
  await page.screenshot({ path: join(output, 'griglia.png'), fullPage: true })
  await page.getByRole('button', { name: 'Elenco', exact: true }).click()
  await page.getByRole('radio', { name: 'Recenti' }).click()
  assert.deepEqual(await names(page), ['preventivo 10.pdf', 'preventivo 9.pdf', 'Logo_Bianco_2025.png', 'logo nero.png', 'manuale.pdf', 'copertina.psd'], 'tutti i file dello spazio, dall’ultimo arrivato')
  await page.getByLabel('Mostra archiviati').check()
  assert.ok((await names(page)).includes('vecchio.pdf'), 'gli archiviati si vedono solo a richiesta')
  await page.getByLabel('Mostra archiviati').uncheck()
  await page.getByRole('radio', { name: 'Cartelle' }).click()

  // ── Ricerca in tutti e due gli spazi ─────────────────────────────────────
  await page.getByLabel('Cerca file e cartelle').fill('brand')
  const results = page.getByRole('region', { name: 'Risultati della ricerca' })
  await results.getByText('Cartelle · 2').waitFor()
  assert.equal(await results.getByText('File · ', { exact: false }).count(), 0, 'il nome di una cartella non trascina i file')
  await page.getByLabel('Cerca file e cartelle').fill('logo bianco')
  await results.getByText('File · 1').waitFor()
  await results.getByText(/Nostri › Brand › Loghi/).waitFor()
  await page.getByLabel('Cerca file e cartelle').fill('evento')
  await results.getByText(/Dal cliente › Brand/).waitFor()
  await page.getByRole('button', { name: /Altre azioni per foto-evento\.jpg/ }).click()
  await page.getByRole('menuitem', { name: 'Apri la cartella' }).click()
  await page.getByRole('radio', { name: 'Dal cliente · 2', checked: true }).waitFor()
  assert.equal(await page.getByLabel('Cerca file e cartelle').inputValue(), '')

  // ── Nello spazio del cliente non si carica ───────────────────────────────
  assert.equal(await page.getByRole('button', { name: 'Carica file' }).count(), 0)
  await page.getByText(/Qui non si carica: quello che carichi tu va in «Nostri»/).waitFor()

  // ── Trascinare dal computer: finisce nella cartella che si guarda ────────
  await page.getByRole('radio', { name: /^Nostri/ }).click()
  await area(page).getByRole('button', { name: /^Brand/ }).click()
  const drop = async (selector) => page.evaluate(({ selector }) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['ciao'], 'nuovo.pdf', { type: 'application/pdf' }))
    const target = document.querySelector(selector)
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, { selector })
  await drop('section[aria-label="Contenuto di Brand"]')
  await page.getByText('Caricati 1 di 1').waitFor()
  await drop('section[aria-label="Contenuto di Brand"] li')
  await page.waitForFunction(() => document.body.innerText.includes('Caricati 1 di 1'))
  assert.deepEqual(posted, ['Brand', 'Brand/Loghi'], 'nell’area va nella cartella corrente, su una cartella va dentro di lei')
  assert.deepEqual(uploadedNames, ['nuovo.pdf', 'nuovo.pdf'])

  // ── Eliminare chiede conferma nella pagina ───────────────────────────────
  await page.getByRole('navigation', { name: 'Cartella corrente' }).getByRole('button', { name: 'Nostri' }).click()
  await page.getByRole('button', { name: 'Altre azioni per preventivo 10.pdf' }).click()
  await page.getByRole('menuitem', { name: 'Elimina' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Eliminare il file?' })
  await dialog.waitFor()
  await dialog.getByRole('button', { name: 'Annulla' }).click()
  await dialog.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Altre azioni per preventivo 9.pdf' }).click()
  assert.equal(await page.getByRole('menuitem', { name: 'Elimina' }).count(), 0, 'il file di un collega non lo elimina un manager')
  await page.keyboard.press('Escape')

  // ── §413 Organizzare: le richieste si simulano qui, sugli stessi dati del mock ──
  const organize = []
  const under = (p, prefix) => p === prefix || (p ?? '').startsWith(`${prefix}/`)
  const rewrite = (from, to) => {
    for (const x of materials) if (x.source === 'team' && under(x.path, from)) x.path = to + x.path.slice(from.length)
    for (const f of folders) if (f.source === 'team' && under(f.path, from)) f.path = to + f.path.slice(from.length)
  }
  await page.route('**/api/area-cliente/cartelle', async route => {
    const body = route.request().postDataJSON()
    organize.push({ method: route.request().method(), ...body })
    if (route.request().method() === 'POST') folders.push({ client_id: a, source: body.spazio, path: body.percorso })
    else if (body.azione === 'rinomina') rewrite(body.percorso, [body.percorso.split('/').slice(0, -1).join('/'), body.nome].filter(Boolean).join('/'))
    else if (body.azione === 'sposta') rewrite(body.percorso, [body.destinazione, body.percorso.split('/').pop()].filter(Boolean).join('/'))
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.route('**/api/area-cliente/file/sposta', async route => {
    const body = route.request().postDataJSON()
    organize.push({ method: 'POST', sposta: true, ...body })
    for (const x of materials) if (body.ids.includes(x.id)) x.path = body.destinazione || null
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.route('**/api/area-cliente/file/f2418000-*', async route => {
    const body = route.request().postDataJSON()
    const id = route.request().url().split('/').pop()
    organize.push({ method: 'PATCH', id, ...body })
    if (body.azione === 'rinomina') { const x = materials.find(y => y.id === id); x.name = body.nome + x.name.slice(x.name.lastIndexOf('.')) }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })

  // Una cartella nuova, anche vuota.
  await page.getByRole('button', { name: 'Nuova cartella' }).click()
  const nuova = page.getByRole('dialog', { name: 'Nuova cartella' })
  await nuova.getByLabel(/Dentro «Nostri»/).fill('Brand')
  await nuova.getByText('Qui c’è già una cartella con questo nome.').waitFor()
  await nuova.getByLabel(/Dentro «Nostri»/).fill('Consegne')
  await nuova.getByRole('button', { name: 'Crea' }).click()
  await nuova.waitFor({ state: 'detached' })
  await area(page).getByRole('button', { name: /^Consegne\s*Vuota/ }).waitFor()
  assert.deepEqual(organize.at(-1), { method: 'POST', client: a, spazio: 'team', percorso: 'Consegne' })

  // Un file trascinato su una cartella ci finisce dentro.
  await area(page).locator('li', { hasText: 'preventivo 9.pdf' }).dragTo(area(page).locator('li', { hasText: 'Consegne' }))
  await page.waitForFunction(() => !document.querySelector('section[aria-label="Contenuto di Nostri"]')?.textContent?.includes('preventivo 9.pdf'))
  assert.deepEqual(organize.at(-1), { method: 'POST', sposta: true, client: a, ids: [materials[4].id], destinazione: 'Consegne' })
  await area(page).getByRole('button', { name: /^Consegne\s*1 file/ }).waitFor()

  // Selezione multipla e «Sposta in…», con la cartella di partenza esclusa.
  await area(page).getByRole('button', { name: /^Brand/ }).click()
  await page.getByLabel('Seleziona manuale.pdf').check()
  await page.getByRole('region', { name: 'Selezione' }).getByText('1 file selezionato').waitFor()
  await page.getByRole('region', { name: 'Selezione' }).getByRole('button', { name: 'Sposta in…' }).click()
  const spostaDialog = page.getByRole('dialog', { name: 'Sposta il file' })
  assert.equal(await spostaDialog.getByRole('radio', { name: /Brand\s*È già qui/ }).isDisabled(), true, 'dov’è già non si sceglie')
  await spostaDialog.getByRole('radio', { name: 'Consegne' }).click()
  await spostaDialog.getByRole('button', { name: 'Sposta qui' }).click()
  await spostaDialog.waitFor({ state: 'detached' })
  assert.deepEqual(organize.at(-1).ids, [materials[2].id])
  assert.equal(organize.at(-1).destinazione, 'Consegne')
  assert.equal(await page.getByRole('region', { name: 'Selezione' }).count(), 0, 'fatto lo spostamento, la selezione si svuota')

  // Rinominare un file: si cambia il nome, non il tipo.
  await page.getByRole('navigation', { name: 'Cartella corrente' }).getByRole('button', { name: 'Nostri' }).click()
  await page.getByRole('button', { name: 'Altre azioni per preventivo 10.pdf' }).click()
  await page.getByRole('menuitem', { name: 'Rinomina' }).click()
  const rinomina = page.getByRole('dialog', { name: 'Rinomina il file' })
  assert.equal(await rinomina.getByLabel('Nome').inputValue(), 'preventivo 10')
  await rinomina.getByText('.pdf', { exact: true }).waitFor()
  await rinomina.getByLabel('Nome').fill('offerta')
  await rinomina.getByRole('button', { name: 'Rinomina' }).click()
  await rinomina.waitFor({ state: 'detached' })
  assert.deepEqual(organize.at(-1), { method: 'PATCH', id: materials[3].id, azione: 'rinomina', nome: 'offerta' })
  await area(page).getByTitle('offerta.pdf').waitFor()

  // Rinominare una cartella, e poi trascinarla dentro un'altra.
  await page.getByRole('button', { name: 'Altre azioni per Grafica' }).click()
  await page.getByRole('menuitem', { name: 'Rinomina' }).click()
  const cartella = page.getByRole('dialog', { name: 'Rinomina la cartella' })
  await cartella.getByLabel('Nome').fill('Design')
  await cartella.getByRole('button', { name: 'Rinomina' }).click()
  await cartella.waitFor({ state: 'detached' })
  assert.deepEqual(organize.at(-1), { method: 'PATCH', client: a, spazio: 'team', percorso: 'Grafica', azione: 'rinomina', nome: 'Design' })
  await area(page).locator('li', { hasText: 'Design' }).dragTo(area(page).locator('li', { hasText: 'Brand' }).first())
  await page.waitForFunction(() => !/Design/.test(document.querySelector('section[aria-label="Contenuto di Nostri"]')?.textContent ?? ''))
  assert.deepEqual(organize.at(-1), { method: 'PATCH', client: a, spazio: 'team', percorso: 'Design', azione: 'sposta', destinazione: 'Brand' })
  assert.equal(materials[5].path, 'Brand/Design')

  // ── §415 Anteprime: il PDF disegnato nella pagina, e le frecce ───────────
  const pdf = Buffer.from(['%PDF-1.4', '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj', '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Contents 4 0 R>>endobj', '4 0 obj<</Length 27>>stream',
    '0 0 1 rg 20 20 160 60 re f', 'endstream endobj', 'trailer<</Root 1 0 R>>', '%%EOF'].join('\n'))
  await page.route('**/api/portale/materiali/f2418000-*', route => route.fulfill({
    status: 200, body: pdf,
    headers: { 'Content-Type': 'application/pdf', 'Content-Security-Policy': "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff' },
  }))
  await page.getByRole('button', { name: 'Apri l’anteprima di offerta.pdf' }).click()
  const anteprima = page.getByRole('dialog', { name: 'Anteprima di offerta.pdf' })
  await anteprima.getByRole('img', { name: 'offerta.pdf, pagina 1 di 1' }).waitFor({ timeout: 30000 }).catch(async error => {
    await page.screenshot({ path: join(output, 'pdf-errore.png') })
    console.log('[anteprima]', await anteprima.innerText())
    throw error
  })
  assert.ok(await anteprima.locator('canvas').evaluate(c => c.width > 0), 'la pagina è disegnata, non un riquadro vuoto')
  await anteprima.getByRole('button', { name: 'Ingrandisci' }).click()
  await anteprima.getByText('125%').waitFor()
  await page.keyboard.press('Escape')
  await anteprima.waitFor({ state: 'detached' })
  await area(page).getByRole('button', { name: /^Consegne/ }).click()
  const primo = (await names(page))[0]
  await page.getByRole('button', { name: `Apri l’anteprima di ${primo}` }).click()
  await page.getByRole('dialog', { name: `Anteprima di ${primo}` }).getByText('1 di 2', { exact: false }).waitFor()
  await page.keyboard.press('ArrowRight')
  const secondo = (await names(page))[1]
  await page.getByRole('dialog', { name: `Anteprima di ${secondo}` }).getByText('2 di 2', { exact: false }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('navigation', { name: 'Cartella corrente' }).getByRole('button', { name: 'Nostri' }).click()

  // ── §421 Uno zip trascinato si apre, e diventa una cartella ──────────────
  const yazl = createRequire(import.meta.url)('yazl')
  const zipBytes = await new Promise(resolve => {
    const zip = new yazl.ZipFile()
    zip.addBuffer(Buffer.from('png finto'), 'logo.png')
    zip.addBuffer(Buffer.from('ciao'), 'sub/testo.txt')
    zip.addBuffer(Buffer.from('mac'), '__MACOSX/._logo.png')
    zip.addBuffer(Buffer.from('mac'), 'sub/.DS_Store')
    zip.addBuffer(Buffer.from('MZ'), 'script.exe')
    zip.end()
    const chunks = []
    zip.outputStream.on('data', c => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks)))
  })
  await area(page).getByRole('button', { name: /^Brand/ }).click()
  posted.length = 0; uploadedNames.length = 0
  await page.evaluate(({ bytes }) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array(bytes)], 'consegna.zip', { type: 'application/zip' }))
    const target = document.querySelector('section[aria-label="Contenuto di Brand"]')
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, { bytes: Array.from(zipBytes) })
  await page.getByText(/Caricati 2 di 3 · 1 non caricati/).waitFor()
  assert.deepEqual(posted.map((p, i) => `${p}/${uploadedNames[i]}`).sort(), ['Brand/consegna/logo.png', 'Brand/consegna/sub/testo.txt'],
    'i file dello zip finiscono nella cartella col suo nome, dentro quella che si guardava; lo zip no')
  await page.getByText('script.exe (da consegna.zip)').waitFor()
  await page.getByRole('button', { name: 'Chiudi il riepilogo' }).click()

  // Lo zip di una cartella: se la rotta dice di no, la pagina lo dice a parole.
  await page.getByRole('button', { name: 'Scarica la cartella' }).click()
  await page.getByRole('alert').getByText('Storage non configurato').waitFor({ timeout: 15000 }).catch(async error => {
    console.log('[zip]', await page.evaluate(() => ({
      frame: document.querySelector('iframe[title="Scarico degli zip"]')?.contentDocument?.body?.innerText,
      src: document.querySelector('iframe[title="Scarico degli zip"]')?.getAttribute('src'),
      alerts: Array.from(document.querySelectorAll('[role=alert]')).map(a => a.textContent),
    })))
    throw error
  })
  await page.getByRole('navigation', { name: 'Cartella corrente' }).getByRole('button', { name: 'Nostri' }).click()

  // ── Tema e telefono ──────────────────────────────────────────────────────
  await page.addStyleTag({ content: '*{transition:none!important}' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme)
    await checkContrast(page)
    await page.screenshot({ path: join(output, `elenco-${theme}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 400, height: 900 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'nessuno scroll orizzontale a 400 px')
  await page.screenshot({ path: join(output, 'telefono.png'), fullPage: true })
  await context.close()

  // ── Chi la RLS esclude riceve una frase, non un'area vuota ───────────────
  const outsider = await session('freelance')
  await outsider.page.goto(at(`/workspace/clienti/${a}?tab=11`), { waitUntil: 'networkidle' })
  await outsider.page.getByText('L’area file dei clienti è riservata al team interno.').waitFor()
  assert.equal(await outsider.page.getByRole('radio', { name: /^Nostri/ }).count(), 0, 'un freelance non vede l’esploratore')
  await outsider.context.close()

  assert.deepEqual(writes, [], 'nessuna scrittura verso le tabelle dell’area file')
  console.log(`Tutti i controlli passano: cartelle, indirizzo, ordine, griglia, recenti, archiviati, ricerca nei due spazi, spazio del cliente in sola lettura, trascinamento nella cartella giusta, conferma nella pagina, cartella nuova, file e cartelle spostati trascinandoli o da «Sposta in…», rinomina che tiene il tipo, PDF disegnato nella pagina con zoom, frecce fra i file, zip trascinato che diventa cartella (senza __MACOSX né eseguibili), errore dello zip detto nella pagina, contrasto nei due temi e telefono. ${requests} richieste al mock, zero scritture. Screenshot: ${output}`)
} finally {
  await browser?.close()
  try { process.kill(-server.pid, 'SIGTERM') } catch { /* già terminato */ }
  await new Promise(resolve => mock.close(resolve))
  await log.close()
}

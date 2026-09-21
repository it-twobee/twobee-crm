// E2E applicativo isolato: Supabase simulato solo su loopback, nessun DB reale.
// NODE_PATH=<cartella con playwright> node scripts/check-portal-browser.mjs
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdir, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { chromium } = createRequire(import.meta.url)('playwright')
const output = join(tmpdir(), 'opencode', 'portal-browser')
await mkdir(output, { recursive: true })
const a = 'f2331000-0000-4000-8000-000000000001'
const b = 'f2331000-0000-4000-8000-000000000002'
const hidden = 'f2331000-0000-4000-8000-000000000003'
const pa = 'f2332000-0000-4000-8000-000000000001'
const pb = 'f2332000-0000-4000-8000-000000000002'
const ids = Object.fromEntries(['client', 'other', 'super', 'unassigned', 'revoked', 'broken', 'inactive', 'manager', 'junior'].map((name, i) => [name, `f2330000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]))
const companies = [{ id: a, company_name: 'Azienda di prova A', display_name: null }, { id: b, company_name: 'Azienda di prova B', display_name: null }, { id: hidden, company_name: 'Società riservata', display_name: null }]
const projects = [
  { id: pa, client_id: a, name: 'Sito web · esperienza e contenuti', area: 'digital', status: 'active' },
  { id: pb, client_id: b, name: 'Progetto riservato azienda B', area: 'growth', status: 'active' },
]
let schema = 'legacy'
let emptyHome = false
const writes = []
const violations = []
let requests = 0
function identity(id) {
  return { id, email: id === ids.super ? 'preview@example.invalid' : 'cliente@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
}
function token(id) {
  const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`
}
const mock = createServer((req, res) => {
  requests++
  const url = new URL(req.url, 'http://127.0.0.1')
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  const reply = (code, value) => { res.statusCode = code; res.end(JSON.stringify(value)) }
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  if (req.method === 'HEAD' && url.pathname === '/rest/v1/tickets') { res.setHeader('Content-Range', '*/0'); res.statusCode = 200; return res.end() }
  if (req.method !== 'GET') { writes.push(`${req.method} ${url.pathname}`); return reply(405, { message: 'No writes in portal checks' }) }
  if (url.pathname === '/realtime/v1/websocket') return reply(426, { message: 'Realtime workspace non simulato' })
  let userId
  try { userId = JSON.parse(Buffer.from(req.headers.authorization?.split('.')[1] ?? '', 'base64url').toString()).sub } catch { /* anon */ }
  if (url.pathname === '/auth/v1/user') return userId ? reply(200, identity(userId)) : reply(401, { message: 'No session' })
  const table = url.pathname.split('/').pop()
  const eq = key => url.searchParams.get(key)?.replace(/^eq\./, '')
  const allowed = userId === ids.super ? [a, b, hidden] : userId === ids.manager ? [a, b] : userId === ids.other ? [b] : [a]
  let rows = []
  if (table === 'profiles') {
    const staffRole = userId === ids.manager ? 'manager' : userId === ids.junior ? 'junior' : null
    rows = [{ ...identity(userId), full_name: 'Referente di prova', role: userId === ids.super ? 'admin' : staffRole ? 'team' : 'client', app_role: userId === ids.super ? 'super_admin' : staffRole ?? 'client', is_active: userId !== ids.inactive }]
  } else if (table === 'portal_memberships') {
    if (userId === ids.broken) return reply(403, { code: '42501', message: 'portal_memberships permission denied' })
    if (schema === 'legacy') return reply(404, { code: 'PGRST205', message: "Could not find the table 'public.portal_memberships' in the schema cache" })
    rows = [ids.revoked, ids.unassigned].includes(userId) ? [] : allowed.map(client_id => ({ client_id, portal_role: 'referente' }))
  } else if (table === 'client_assignments') {
    const detail = url.searchParams.get('select') === 'profile_id,profiles(*)'
    if (!detail && schema !== 'legacy') violations.push('Fallback legacy dopo attivazione schema')
    rows = detail || userId === ids.unassigned ? [] : allowed.map(client_id => ({ client_id }))
  } else if (table === 'clients' || table === 'clients_workspace') {
    const detail = table === 'clients_workspace' && userId === ids.manager && eq('id') === a
    if (!['id,company_name,display_name', 'id,company_name', 'id,company_name,client_label'].includes(url.searchParams.get('select')) && !(detail && ['*', 'id,client_label'].includes(url.searchParams.get('select')))) violations.push('Proiezione aziende non sicura')
    if (userId === ids.manager && table === 'clients') violations.push('Anteprima manager fuori da clients_workspace')
    rows = companies.filter(c => allowed.includes(c.id) && (!url.searchParams.get('id')?.startsWith('eq.') || c.id === eq('id')))
    if (detail) rows = rows.map(c => ({ ...c, client_type: 'digital', client_label: 'stabile', created_at: '2026-01-01', active_channels: [] }))
  } else if (table === 'projects') {
    if (url.searchParams.get('select') !== 'id,client_id,name,area,status' || eq('visibility') !== 'client_visible' || url.searchParams.get('deleted_at') !== 'is.null') violations.push('Proiezione progetti non sicura')
    rows = projects.filter(p => allowed.includes(p.client_id) && p.client_id === eq('client_id'))
  } else if (table === 'portal_companies') {
    rows = userId === ids.revoked ? [] : companies.filter(c => allowed.includes(c.id)).map(c => ({ id: c.id, name: c.company_name }))
  } else if (table === 'portal_projects') {
    rows = projects.filter(p => allowed.includes(p.client_id) && p.client_id === eq('client_id')).map(p => ({
      id: p.id, client_id: p.client_id, title: p.name, area: p.area, status: p.status,
      objective: 'Rendere più semplice trovare il servizio giusto.', scope: 'Architettura, contenuti e interfaccia del sito.',
      update: 'La prima proposta è disponibile per la verifica.', next_step: 'Rivedere insieme la proposta di navigazione.',
      contact: 'Il team di progetto', published_at: '2026-09-19T10:00:00Z', target_date: '2026-09-25', date_kind: 'prevista', phase: 'verifica',
    }))
  } else if (table === 'portal_activities') {
    rows = [{ id: 'activity-a', project_id: pa, title: 'Rivedi la proposta di navigazione', reason: 'Il tuo riscontro ci aiuta a confermare la struttura del sito.', kind: 'approvazione', due_date: '2026-09-25', contact_name: 'Il team di progetto', status: 'da_fare', version_id: 'version-a' }]
  } else if (table === 'portal_deliverable_versions') {
    rows = [{ id: 'version-a', project_id: pa, title: 'Proposta di navigazione', version: 2, author_name: 'Il team di progetto', published_at: '2026-09-19T10:00:00Z', approval_required: true }]
  } else if (table === 'portal_requests') {
    if (schema === 'legacy') return reply(404, { code: 'PGRST205', message: "Could not find the table 'public.portal_requests' in the schema cache" })
    rows = [{ id: 'request-a', project_id: pa, title: 'Chiarimento sui contenuti', body: 'Quali contenuti prepariamo per la prossima revisione?', kind: 'supporto', status: 'in_valutazione', created_at: '2026-09-19T10:00:00Z' }]
  } else if (!['workspace_sections', 'workspace_section_permissions', 'notifications', 'profile_permissions', 'tickets', 'person_copy', 'client_contacts', 'client_stakeholders', 'client_kpis', 'client_interactions'].includes(table)) {
    violations.push(`Query inattesa: ${table}`)
  }
  if (emptyHome && ['projects', 'portal_projects', 'portal_activities', 'portal_deliverable_versions', 'portal_requests'].includes(table)) rows = []
  return reply(200, req.headers.accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows)
})
await new Promise(resolve => mock.listen(54329, '127.0.0.1', resolve))
const log = await open(join(output, 'next.log'), 'w')
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', '3100', '--hostname', '127.0.0.1'], {
  cwd: process.cwd(), detached: true, stdio: ['ignore', log.fd, log.fd],
  env: { ...process.env, NEXT_BUILD_DIR: '.next-build', NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'portal-test-only', SUPABASE_SERVICE_ROLE_KEY: '' },
})
let browser
try {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error('Server di test non avviato: vedere next.log')
    try { if ((await fetch('http://127.0.0.1:3100/login')).ok) break } catch { /* startup */ }
    if (i === 119) throw new Error('Timeout avvio localhost')
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  browser = await chromium.launch({ headless: true })
  async function session(name, width = 1440) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    if (name) {
      const id = ids[name]
      const data = { access_token: token(id), refresh_token: 'test-only', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: identity(id) }
      const value = `base64-${Buffer.from(JSON.stringify(data)).toString('base64url')}`
      await context.addCookies(['127.0.0.1', 'localhost'].map(domain => ({ name: 'sb-127-auth-token', value, domain, path: '/' })))
    }
    return { context, page: await context.newPage() }
  }
  async function open(page, path) {
    const response = await page.goto(`http://127.0.0.1:3100${path}`, { waitUntil: 'networkidle' })
    return response
  }
  async function checkContrast(page) {
    const failures = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d')
      const rgb = value => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = value
        ctx.fillRect(0, 0, 1, 1)
        return Array.from(ctx.getImageData(0, 0, 1, 1).data).map((v, i) => i === 3 ? v / 255 : v)
      }
      const blend = (front, back) => front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3]))
      const luminance = color => color.slice(0, 3).map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
      const out = []
      for (const el of document.querySelectorAll('main h1, main h2, main p, main a, main label, main input, main select, nav a, header button, a.bg-gold')) {
        if (!el.getBoundingClientRect().height || el.disabled) continue
        const style = getComputedStyle(el)
        let background = [255, 255, 255]
        const ancestors = []
        for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) ancestors.unshift(ancestor)
        for (const ancestor of ancestors) background = blend(rgb(getComputedStyle(ancestor).backgroundColor), background)
        const foreground = blend(rgb(style.color), background)
        const l1 = luminance(foreground), l2 = luminance(background)
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseFloat(style.fontWeight) >= 700)
        if (ratio < (large ? 3 : 4.5)) out.push({ text: (el.textContent || el.getAttribute('aria-label') || '').slice(0, 60), ratio: ratio.toFixed(2) })
      }
      return out
    })
    assert.deepEqual(failures, [], 'contrasto WCAG AA sul DOM renderizzato')
  }
  const anon = await session()
  await open(anon.page, '/portale')
  assert.match(anon.page.url(), /\/login/)
  await open(anon.page, `/portale?client=${a}`)
  assert.equal(new URL(anon.page.url()).searchParams.get('client'), a)
  assert.equal((await open(anon.page, '/ticket-portal/old-token')).status(), 200)
  await anon.page.getByRole('heading', { name: 'Il portale cliente ha un nuovo accesso' }).waitFor()
  await anon.context.close()
  console.log('OK anonimo → login')

  const client = await session('client')
  await open(client.page, '/dashboard')
  assert.match(client.page.url(), /\/portale/, `Mock requests: ${requests}; violations: ${violations}`)
  assert.equal(await client.page.getByRole('combobox', { name: 'Azienda', exact: true }).count(), 0)
  for (const [label, path] of [['Progetti','/portale/progetti'], ['Da fare','/portale/da-fare'], ['Richieste','/portale/richieste'], ['Home','/portale']]) {
    await client.page.getByRole('navigation', { name: 'Portale cliente' }).getByRole('link', { name: label, exact: true }).click()
    await client.page.waitForURL(url => url.pathname === path)
    assert.ok(await client.page.locator('h1').textContent())
  }
  await open(client.page, `/portale/progetti/${pa}?client=${a}`)
  await client.page.getByText('Aggiornamento condiviso non ancora disponibile.', { exact: false }).waitFor()
  assert.equal((await client.page.content()).includes('Progetto riservato azienda B'), false)
  await open(client.page, `/portale?client=${b}`)
  assert.match(await client.page.locator('body').innerText(), /Contenuto non disponibile\.|404/, 'azienda non autorizzata')
  await open(client.page, `/portale/progetti/${pb}?client=${a}`)
  await client.page.getByText('Contenuto non disponibile.').waitFor()
  console.log('OK quattro sezioni, progetto legacy, URL azienda/progetto estraneo rifiutato')

  await open(client.page, `/portale/richieste?client=${a}&nuova=1&progetto=${pa}`)
  await client.page.getByLabel('In poche parole').fill('Bozza conservata')
  await client.page.getByLabel('Tipo di richiesta').selectOption('bug')
  await client.page.getByLabel('Pagina in cui accade').fill('/esempio')
  await client.page.reload({ waitUntil: 'networkidle' })
  assert.equal(await client.page.getByLabel('In poche parole').inputValue(), 'Bozza conservata')
  assert.equal(await client.page.getByLabel('Pagina in cui accade').inputValue(), '/esempio')
  assert.equal(await client.page.getByRole('button', { name: 'Invio non ancora attivo' }).isDisabled(), true)
  await client.page.keyboard.press('Tab')
  const focus = await client.page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)
  assert.notEqual(focus, 'none')
  console.log('OK bozza dopo ricarica, campi contestuali, invio disabilitato, focus tastiera')
  await client.page.evaluate(() => document.activeElement.blur())

  for (const width of [390, 1440]) {
    await client.page.setViewportSize({ width, height: 1000 })
    for (const theme of ['light', 'dark']) {
      await client.page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme)
      await client.page.addStyleTag({ content: '*{transition:none!important}' })
      assert.ok(await client.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${width}/${theme}`)
      await checkContrast(client.page)
      await client.page.screenshot({ path: join(output, `richiesta-${width}-${theme}.png`), fullPage: true })
    }
  }
  await client.context.close()
  console.log('OK mobile/desktop nei due temi, contrasto WCAG AA misurato, nessun overflow')

  const noCompany = await session('unassigned')
  await open(noCompany.page, '/portale')
  await noCompany.page.getByText('Il tuo accesso è da collegare a un’azienda.').waitFor()
  await noCompany.context.close()
  const broken = await session('broken')
  await open(broken.page, '/portale')
  await broken.page.getByText('Non riusciamo a caricare il tuo spazio.').waitFor()
  await broken.context.close()
  const inactive = await session('inactive')
  await open(inactive.page, '/portale')
  assert.match(inactive.page.url(), /\/login/)
  await inactive.context.close()
  console.log('OK account senza associazione, errore permessi senza fallback, account disattivo')

  const preview = await session('super')
  await open(preview.page, '/portale')
  await preview.page.getByLabel('Azienda in anteprima').selectOption(b)
  await preview.page.getByText('Progetto riservato azienda B', { exact: true }).waitFor()
  await open(preview.page, '/workspace/customer-care?vista=da-gestire')
  await preview.page.getByText('La coda del portale è in preparazione.').waitFor()
  assert.equal(await preview.page.getByRole('navigation', { name: 'Customer Care', exact: true }).getByRole('link', { name: 'Conversazioni' }).count(), 1)
  await preview.context.close()
  console.log('OK anteprima super admin, selezione azienda e coda integrata nel workspace')

  const manager = await session('manager')
  await open(manager.page, '/workspace/customer-care/tickets')
  await manager.page.getByRole('button', { name: 'Portale cliente', exact: true }).click()
  assert.equal(await manager.page.getByRole('link', { name: 'Gestisci portale', exact: true }).first().getAttribute('href'), `/workspace/clienti/${a}?tab=10`)
  assert.equal(await manager.page.getByRole('button', { name: 'Genera link', exact: true }).count(), 0)
  await manager.page.getByRole('link', { name: 'Gestisci portale', exact: true }).first().click()
  await manager.page.waitForURL(url => url.pathname === `/workspace/clienti/${a}` && url.searchParams.get('tab') === '10')
  await manager.page.getByRole('heading', { name: 'Portale cliente', exact: true }).waitFor()
  await manager.page.getByText('Gestione accessi non configurata in questo ambiente.', { exact: true }).waitFor()
  const tabs = await manager.page.locator('button').allTextContents()
  assert.ok(tabs.indexOf('Portale cliente') > tabs.indexOf('Accessi'), 'la scheda portale segue Tracking, Report, Chiavi e Accessi')
  await open(manager.page, '/workspace/customer-care/tickets')
  await manager.page.getByRole('link', { name: 'Apri portale cliente', exact: false }).click()
  await manager.page.waitForURL(url => url.pathname === '/portale')
  await manager.page.getByLabel('Azienda in anteprima').waitFor()
  assert.equal(await manager.page.getByRole('option', { name: 'Società riservata' }).count(), 0)
  await manager.page.getByRole('button', { name: 'Cambia portale', exact: true }).click()
  assert.equal(await manager.page.getByRole('button', { name: 'Portale Admin', exact: false }).count(), 0)
  assert.equal(await manager.page.getByRole('button', { name: 'Workspace Vista risorsa' }).count(), 1)
  await manager.page.getByRole('button', { name: 'Cambia portale', exact: true }).click()
  const adminRedirect = await manager.context.request.get('http://127.0.0.1:3100/dashboard', { maxRedirects: 0 })
  assert.equal(adminRedirect.status(), 307)
  assert.match(adminRedirect.headers().location, /\/workspace/)
  await open(manager.page, `/portale?client=${hidden}`)
  assert.match(await manager.page.locator('body').innerText(), /Contenuto non disponibile\.|404/)
  await manager.context.close()
  const junior = await session('junior')
  const denied = await junior.context.request.get('http://127.0.0.1:3100/portale', { maxRedirects: 0 })
  assert.equal(denied.status(), 307)
  assert.match(denied.headers().location, /\/workspace/)
  await junior.context.close()
  console.log('OK manager dai ticket al portale, aziende workspace, nessun accesso admin; junior escluso; gestione accessi nella scheda cliente')

  emptyHome = true
  const emptyDashboard = await session('super', 1280)
  await emptyDashboard.page.setViewportSize({ width: 1280, height: 720 })
  await open(emptyDashboard.page, `/portale?client=${a}`)
  for (const theme of ['light', 'dark']) {
    await emptyDashboard.page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme)
    await emptyDashboard.page.addStyleTag({ content: '*{transition:none!important}' })
    await checkContrast(emptyDashboard.page)
    await emptyDashboard.page.screenshot({ path: join(output, `home-vuota-laptop-${theme}.png`), fullPage: true })
    const dimensions = await emptyDashboard.page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: innerHeight, width: document.documentElement.scrollWidth, viewportWidth: innerWidth }))
    assert.ok(dimensions.height <= dimensions.viewport + 1, `Home vuota senza scroll iniziale: ${JSON.stringify(dimensions)}`)
    assert.ok(dimensions.width <= dimensions.viewportWidth + 1)
  }
  await emptyDashboard.context.close()
  emptyHome = false
  console.log('OK Home vuota su laptop 1280×720: tutte le card visibili senza scroll, nei due temi')

  schema = 'ready'
  const revoked = await session('revoked')
  await open(revoked.page, '/portale')
  await revoked.page.getByText('Il tuo accesso è da collegare a un’azienda.').waitFor()
  await revoked.context.close()
  const populated = await session('client', 390)
  await open(populated.page, '/portale')
  await populated.page.getByText('Rivedi la proposta di navigazione', { exact: true }).waitFor()
  await populated.page.getByText('versione 2', { exact: false }).waitFor()
  assert.ok(await populated.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await populated.page.addStyleTag({ content: '*{transition:none!important}' })
  await checkContrast(populated.page)
  await populated.page.screenshot({ path: join(output, 'home-fixture-mobile.png'), fullPage: true })
  await populated.page.setViewportSize({ width: 1440, height: 1100 })
  await populated.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await checkContrast(populated.page)
  await populated.page.screenshot({ path: join(output, 'home-fixture-desktop.png'), fullPage: true })
  await populated.context.close()
  assert.deepEqual(writes, [], 'nessuna scrittura verso il mock')
  assert.deepEqual(violations, [], 'nessuna query non prevista o fallback aperto')
  console.log(`Tutti i controlli passano. ${requests} richieste HTTP al mock locale, zero scritture. Screenshot: ${output}`)
} finally {
  await browser?.close()
  try { process.kill(-server.pid, 'SIGTERM') } catch { /* già terminato */ }
  await new Promise(resolve => mock.close(resolve))
  await log.close()
}

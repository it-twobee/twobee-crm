import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { build } = require('esbuild')
const { chromium } = require('playwright')
const temp = await mkdtemp('/tmp/opencode/portal-access-')
const client = 'f2451000-0000-4000-8000-000000000001'
const project = 'f2452000-0000-4000-8000-000000000001'
let browser, server
try {
  await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {Toaster} from 'sonner'; import {ClientPortalTab} from './components/clients/tabs/ClientPortalTab'; import Reset from './app/(auth)/reset-password/page';
    createRoot(document.getElementById('root')).render(<><Toaster/>{location.pathname==='/reset-password'?<Reset/>:<ClientPortalTab clientId="${client}" contacts={[{id:'contact',full_name:'Referente prova',email:'referente@example.test'}]}/>}</>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, outfile: join(temp, 'app.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'isolated-boundaries', setup(b) {
      b.onResolve({ filter: /^(@\/app\/actions\/portal-access|next\/link|next\/navigation|@\/lib\/supabase\/client|@\/components\/shared\/Logo)$/ }, args => ({ path: args.path, namespace: 'mock' }))
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => {
        if (args.path === 'next/link') return { contents: `import React from 'react'; export default function Link(props){return React.createElement('a',props)}`, loader: 'js', resolveDir: process.cwd() }
        if (args.path === 'next/navigation') return { contents: `export const useRouter=()=>({replace:path=>window.__redirect=path,refresh:()=>{}})`, loader: 'js' }
        if (args.path.includes('Logo')) return { contents: `export const Logo=()=>null`, loader: 'js' }
        if (args.path.includes('supabase')) return { contents: `export const createClient=()=>({auth:{
          onAuthStateChange:fn=>{queueMicrotask(()=>fn('INITIAL_SESSION',window.__existingSession?{user:{id:'someone-else'}}:null));return {data:{subscription:{unsubscribe(){}}}}},
          verifyOtp:async input=>{window.__authCalls.push(['verify',input]);return window.__authError?{error:{message:'expired'},data:{}}:{error:null,data:{user:{id:'invited-user'}}}},
          updateUser:async input=>{window.__authCalls.push(['update',input]);return {error:null}}
        }})`, loader: 'js' }
        return { contents: ['getClientPortalAccess', 'inviteClientPortal', 'resetClientPortalPassword', 'revokeClientPortalAccess', 'updateClientPortalAccess'].map(name => `export const ${name}=async(...args)=>(await fetch('/test/${name}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)})).json();`).join('\n'), loader: 'js' }
      })
    } }] })
  execFileSync(process.execPath, [resolve('node_modules/tailwindcss/lib/cli.js'), '-i', resolve('app/globals.css'), '-o', join(temp, 'style.css')], { stdio: 'pipe' })
  const html = '<!doctype html><html lang="it"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>:root{--font-body:Arial,sans-serif;--font-heading:Arial,sans-serif}*{transition:none!important}body{margin:0;font-family:Arial,sans-serif;background:var(--color-background)}#root{padding:16px;max-width:1100px;margin:auto}</style></head><body><div id="root"></div><script>window.__authCalls=[];window.__authError=false;</script><script src="/app.js"></script></body></html>'
  server = createServer(async (req, res) => {
    const asset = req.url === '/app.js' ? 'app.js' : req.url === '/style.css' ? 'style.css' : null
    res.setHeader('Content-Type', asset === 'app.js' ? 'application/javascript' : asset ? 'text/css' : 'text/html')
    res.end(asset ? await readFile(join(temp, asset)) : html)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()
  const errors = [], calls = []
  page.on('pageerror', error => errors.push(error.message))
  let members = [], failedInvite = true, missingSchema = false
  await page.route('**/test/*', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    const args = route.request().postDataJSON(); calls.push({ name, args })
    assert.equal(args[0], client)
    if (name === 'getClientPortalAccess') return route.fulfill({ json: missingSchema ? { error: 'Gestione accessi non ancora attiva: occorre applicare le migration 244 e 245 del portale.' } : { data: { members, projects: [{ id: project, name: 'Progetto condiviso A' }], portalPath: `/portale?client=${client}` } } })
    if (name === 'inviteClientPortal') {
      if (failedInvite) { failedInvite = false; return route.fulfill({ json: { error: 'Errore temporaneo. Riprova.' } }) }
      members = [{ id: 'member', profileId: 'person', name: args[1].name, email: args[1].email, role: args[1].role, scope: args[1].scope, projectIds: args[1].projectIds, revision: 1, revokedAt: null, active: true, activated: false }]
      return route.fulfill({ json: { data: { kind: 'invite', url: `${origin}/reset-password?client=${client}#token_hash=invite-token&type=invite` } } })
    }
    if (name === 'resetClientPortalPassword') return route.fulfill({ json: { data: { kind: 'recovery', url: `${origin}/reset-password?client=${client}#token_hash=recovery-token&type=recovery` } } })
    if (name === 'updateClientPortalAccess') {
      assert.equal(args[2], members[0].revision)
      members[0] = { ...members[0], role: args[3].role, scope: args[3].scope, projectIds: args[3].projectIds, revision: members[0].revision + 1, revokedAt: null }
    } else if (name === 'revokeClientPortalAccess') {
      assert.equal(args[2], members[0].revision)
      members[0] = { ...members[0], revokedAt: '2026-09-21', revision: members[0].revision + 1 }
    } else throw new Error(`Unexpected action ${name}`)
    return route.fulfill({ json: { data: null } })
  })
  await page.goto(origin)
  await page.getByText('Nessun referente abilitato.', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Copia link portale', exact: true }).click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${origin}/portale?client=${client}`)
  await page.getByRole('button', { name: 'Invita referente', exact: true }).click()
  await page.getByLabel('Compila da un contatto').selectOption('contact')
  assert.equal(await page.getByLabel('Email personale').inputValue(), 'referente@example.test')
  await page.getByLabel('Accesso ai progetti').selectOption('selected')
  await page.getByLabel('Progetto condiviso A').check()
  await page.getByRole('button', { name: 'Genera invito', exact: true }).click()
  await page.getByText('Errore temporaneo. Riprova.', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Email personale').inputValue(), 'referente@example.test')
  assert.equal(await page.getByLabel('Progetto condiviso A').isChecked(), true)
  await page.getByRole('button', { name: 'Genera invito', exact: true }).click()
  await page.getByRole('heading', { name: 'Invito personale', exact: true }).waitFor()
  const invitation = await page.getByLabel('Link da condividere').inputValue()
  await page.getByRole('button', { name: 'Copia link', exact: true }).click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), invitation)
  await page.getByRole('button', { name: 'Chiudi', exact: true }).click()
  await page.getByRole('button', { name: 'Modifica permessi', exact: true }).click()
  await page.getByLabel('Ruolo nel portale').selectOption('lettore')
  await page.getByLabel('Accesso ai progetti').selectOption('all')
  await page.getByRole('button', { name: 'Salva accesso', exact: true }).click()
  await page.getByText('Lettore · Tutti i progetti condivisi', { exact: true }).waitFor()
  members[0].activated = true
  await page.getByRole('button', { name: 'Aggiorna', exact: true }).click()
  await page.getByRole('button', { name: 'Reimposta password', exact: true }).click()
  await page.getByRole('heading', { name: 'Reimpostazione password', exact: true }).waitFor()
  const recovery = await page.getByLabel('Link da condividere').inputValue()

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${theme}: overflow`)
      const contrast = await page.evaluate(() => {
        const rgb = color => (color.match(/[\d.]+/g) ?? []).map(Number)
        const lum = c => c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
        return Array.from(document.querySelectorAll('h2,h3,h4,p,button,a,label,span')).filter(el => el.textContent.trim() && !el.closest('[data-sonner-toaster]') && !el.disabled && el.getClientRects().length).flatMap(el => {
          const parents = []; for (let p = el; p; p = p.parentElement) parents.unshift(p)
          let bg = [255, 255, 255]
          for (const p of parents) { const c = rgb(getComputedStyle(p).backgroundColor); const a = c[3] ?? 1; bg = bg.map((v, i) => c[i] * a + v * (1 - a)) }
          const a = lum(rgb(getComputedStyle(el).color)), b = lum(bg), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
          return ratio < 4.5 ? [{ text: el.textContent, ratio }] : []
        })
      })
      assert.deepEqual(contrast, [], `${width} ${theme}: contrasto AA`)
      await page.screenshot({ path: join(temp, `accessi-${width}-${theme}.png`), fullPage: true })
    }
  }
  await page.getByRole('button', { name: 'Revoca accesso', exact: true }).click()
  await page.getByRole('button', { name: 'Conferma revoca', exact: true }).click()
  await page.getByText('Revocato', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Reimposta password', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Riattiva accesso', exact: true }).click()
  await page.getByRole('button', { name: 'Salva accesso', exact: true }).click()
  await page.getByRole('button', { name: 'Reimposta password', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Copia link portale', exact: true }).focus()
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement.textContent), ' Apri anteprima')
  assert.ok(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'))
  missingSchema = true
  await page.getByRole('button', { name: 'Aggiorna', exact: true }).click()
  await page.getByText('Gestione accessi non ancora attiva:', { exact: false }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Invita referente', exact: true }).isEnabled(), false)

  const passwordPage = await context.newPage()
  passwordPage.on('pageerror', error => errors.push(error.message))
  for (const link of [invitation, recovery]) {
    await passwordPage.goto('about:blank')
    await passwordPage.goto(link)
    await passwordPage.getByRole('button', { name: 'Aggiorna Password', exact: true }).waitFor()
    assert.equal(new URL(passwordPage.url()).hash, '')
    assert.deepEqual(await passwordPage.evaluate(() => window.__authCalls), [])
    await passwordPage.getByLabel('Nuova password', { exact: true }).fill('test-password-only')
    await passwordPage.getByLabel('Conferma password', { exact: true }).fill('test-password-only')
    await passwordPage.getByRole('button', { name: 'Aggiorna Password', exact: true }).click()
    await passwordPage.getByText('Password aggiornata!', { exact: true }).waitFor()
    await passwordPage.waitForFunction(() => window.__redirect)
    assert.equal(await passwordPage.evaluate(() => window.__redirect), `/portale?client=${client}`)
    const auth = await passwordPage.evaluate(() => window.__authCalls)
    assert.equal(auth[0][0], 'verify'); assert.equal(auth[1][0], 'update')
    assert.equal(auth[0][1].type, link === invitation ? 'invite' : 'recovery')
  }
  await passwordPage.goto('about:blank')
  await passwordPage.goto(recovery)
  await passwordPage.evaluate(() => window.__authError = true)
  await passwordPage.getByLabel('Nuova password', { exact: true }).fill('test-password-only')
  await passwordPage.getByLabel('Conferma password', { exact: true }).fill('test-password-only')
  await passwordPage.getByRole('button', { name: 'Aggiorna Password', exact: true }).click()
  await passwordPage.getByRole('alert').waitFor()
  assert.equal(await passwordPage.evaluate(() => window.__authCalls.filter(c => c[0] === 'update').length), 0)
  await passwordPage.evaluate(() => window.__authError = false)
  await passwordPage.goto(recovery.replace('recovery-token', 'replacement-token'))
  await passwordPage.getByRole('button', { name: 'Aggiorna Password', exact: true }).waitFor()
  assert.equal(await passwordPage.getByRole('alert').count(), 0)
  await passwordPage.getByLabel('Nuova password', { exact: true }).fill('replacement-password')
  await passwordPage.getByLabel('Conferma password', { exact: true }).fill('replacement-password')
  await passwordPage.getByRole('button', { name: 'Aggiorna Password', exact: true }).click()
  await passwordPage.getByText('Password aggiornata!', { exact: true }).waitFor()
  assert.equal(await passwordPage.evaluate(() => window.__authCalls.filter(c => c[0] === 'verify').at(-1)[1].token_hash), 'replacement-token')
  await passwordPage.addInitScript(() => { window.__existingSession = true })
  for (const fragment of ['token_hash=broken&type=unknown', 'error=access_denied&error_code=otp_expired']) {
    await passwordPage.goto('about:blank')
    await passwordPage.goto(`${origin}/reset-password?client=${client}#${fragment}`)
    await passwordPage.getByRole('alert').waitFor()
    assert.equal(await passwordPage.getByRole('button', { name: 'Link non valido', exact: true }).isEnabled(), false)
    assert.deepEqual(await passwordPage.evaluate(() => window.__authCalls), [])
  }
  assert.deepEqual(errors, [])
  console.log(`Tutti i controlli passano: invito, errore/retry, copia, scope, reset, revoca/riattivazione, schema assente, token scaduto, primo accesso, temi, mobile e tastiera. Screenshot: ${temp}`)
} finally {
  await browser?.close()
  if (server) await new Promise(resolve => server.close(resolve))
}

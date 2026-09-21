import { createRequire } from 'node:module'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

// Dipendenze di collaudo esterne al prodotto: NODE_PATH=/tmp/opencode/node_modules.
const require = createRequire(import.meta.url)
const { build } = require('esbuild')
const { chromium } = require('playwright')
const root = process.cwd()
const temp = await mkdtemp('/tmp/opencode/sales-follow-up-')
let browser, server
try {
  await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {SalesFollowUps} from './components/sales/SalesFollowUps'; createRoot(document.getElementById('root')).render(<SalesFollowUps dealId="00000000-0000-4000-8000-000000000002" company="Azienda dimostrativa" email="lead@example.test"/>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, outfile: join(temp, 'app.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'navigation', setup(b) {
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'mock' }))
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `export const usePathname=()=>'/commerciale'`, loader: 'js' }))
    } }] })
  execFileSync(process.execPath, [resolve('node_modules/tailwindcss/lib/cli.js'), '-i', resolve('app/globals.css'), '-o', join(temp, 'style.css')], { cwd: root, stdio: 'pipe' })
  const html = '<!doctype html><html lang="it"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>:root{--font-body:Arial,sans-serif;--font-heading:Arial,sans-serif}*{transition:none!important}body{margin:0;font-family:Arial,sans-serif;background:var(--color-background)}#root{max-width:440px;padding:12px;margin:auto}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>'
  server = createServer(async (req, res) => {
    const asset = req.url === '/app.js' ? 'app.js' : req.url === '/style.css' ? 'style.css' : null
    res.setHeader('Content-Type', asset === 'app.js' ? 'application/javascript' : asset ? 'text/css' : 'text/html')
    res.end(asset ? await readFile(join(temp, asset)) : html)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Rome' })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  let events = [], writes = [], failNext = true, unavailable = false
  await page.route('**/api/sales/follow-up**', async route => {
    const req = route.request()
    if (req.method() === 'GET') return route.fulfill({ status: unavailable ? 403 : 200, json: unavailable
      ? { error: 'Collega il tuo Google Calendar', code: 'not_connected' } : { events } })
    const body = req.postDataJSON(); writes.push({ method: req.method(), body })
    if (failNext) { failNext = false; return route.fulfill({ status: 502, json: { error: 'Errore temporaneo. Riprova.' } }) }
    if (req.method() === 'DELETE') { events = []; return route.fulfill({ json: { ok: true } }) }
    const event = { id: 'tb12345', etag: 'v2', title: body.title, start: body.start, end: new Date(Date.parse(body.start) + body.duration * 60000).toISOString(),
      invitedEmail: body.inviteContact ? 'lead@example.test' : null, url: 'https://calendar.google.com/calendar/event?eid=test', editable: true }
    events = [event]; return route.fulfill({ json: { event } })
  })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.getByRole('button', { name: 'Pianifica follow-up' }).click()
  assert.equal(await page.getByLabel('Invita il contatto').isChecked(), false)
  await page.getByLabel('Data e ora').fill('2026-11-10T10:30')
  await page.getByRole('button', { name: 'Salva follow-up', exact: true }).click()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.getByLabel('Data e ora').inputValue(), '2026-11-10T10:30')
  await page.getByRole('button', { name: 'Salva follow-up', exact: true }).click()
  await page.getByRole('button', { name: 'Modifica', exact: true }).waitFor()
  assert.equal(writes[0].body.requestId, writes[1].body.requestId)
  assert.equal(writes[1].body.inviteContact, false)
  assert.equal(writes[1].body.start, '2026-11-10T09:30:00.000Z')
  await page.getByRole('button', { name: 'Modifica', exact: true }).click()
  await page.getByLabel('Invita il contatto').check()
  await page.getByLabel('Durata in minuti').fill('60')
  await page.getByRole('button', { name: 'Salva modifiche' }).click()
  await page.getByText('Invitato: lead@example.test').waitFor()
  assert.equal(writes[2].method, 'PATCH')
  assert.equal(writes[2].body.eventId, 'tb12345')
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${theme}: overflow`)
      const contrastFailures = await page.evaluate(() => {
        const rgb = color => (color.match(/[\d.]+/g) ?? []).map(Number)
        const luminance = c => c.slice(0, 3).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
        return Array.from(document.querySelectorAll('h3,p,button,a')).filter(el => el.textContent.trim()).flatMap(el => {
          const parents = []; for (let p = el; p; p = p.parentElement) parents.unshift(p)
          let bg = [255, 255, 255]
          for (const p of parents) { const c = rgb(getComputedStyle(p).backgroundColor); const a = c[3] ?? 1; bg = bg.map((v, i) => c[i] * a + v * (1 - a)) }
          const fg = rgb(getComputedStyle(el).color)
          const a = luminance(fg), b = luminance(bg)
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
          return ratio < 4.5 ? [{ text: el.textContent, ratio }] : []
        })
      })
      assert.deepEqual(contrastFailures, [], `${width} ${theme}: contrasto AA`)
      await page.screenshot({ path: join(temp, `follow-up-${width}-${theme}.png`), fullPage: true })
    }
  }
  await page.getByRole('button', { name: 'Annulla appuntamento' }).click()
  await page.getByRole('button', { name: 'Conferma annullamento' }).click()
  await page.getByText('Nessun prossimo follow-up.').waitFor()
  unavailable = true
  await page.getByRole('button', { name: 'Aggiorna i follow-up' }).click()
  await page.getByRole('link', { name: 'Collega Google Calendar' }).waitFor()
  assert.equal(await page.getByRole('link', { name: 'Collega Google Calendar' }).getAttribute('href'), '/api/google/auth?returnTo=%2Fcommerciale')
  await page.getByRole('button', { name: 'Aggiorna i follow-up' }).focus()
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Collega Google Calendar')
  assert.ok(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'))
  assert.deepEqual(errors, [])
  console.log(`Browser OK: creazione, retry, modifica/invito, annullamento, account scollegato, mobile e temi. Screenshot: ${temp}`)
} finally {
  await browser?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  // Si conservano gli screenshot; i bundle temporanei non contengono dati reali.
}

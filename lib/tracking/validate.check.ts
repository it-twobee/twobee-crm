/* Verifica della validazione dei campi tracking. Esegui: npx tsx lib/tracking/validate.check.ts */
import { parseGa4MeasurementId, parseGa4PropertyId, parseGtmContainerId, parseMetaPixelId } from '@/lib/tracking/validate'
import { isTrackingError } from '@/lib/tracking/errors'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(64)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const rejects = (label: string, fn: () => unknown, needle: string) => {
  let got: unknown = null
  try { fn() } catch (e) { got = isTrackingError(e) && e.status === 400 && e.message.includes(needle) }
  is(label, got, true)
}

// --- ID misurazione GA4
is('vuoto resta vuoto', parseGa4MeasurementId(''), '')
is('null resta vuoto', parseGa4MeasurementId(null), '')
is('G-ABC123DEF4 passa', parseGa4MeasurementId('G-ABC123DEF4'), 'G-ABC123DEF4')
is('minuscolo → maiuscolo', parseGa4MeasurementId('g-abc123def4'), 'G-ABC123DEF4')
is('spazi tolti anche in mezzo', parseGa4MeasurementId('  G- ABC123DEF4 '), 'G-ABC123DEF4')
rejects('property numerica → dice che è il Property ID', () => parseGa4MeasurementId('123456789'), 'Property ID')
rejects('properties/123 → dice che è il Property ID', () => parseGa4MeasurementId('properties/123456789'), 'Property ID')
rejects('GTM al posto di GA4 → formato', () => parseGa4MeasurementId('GTM-ABC1234'), 'G-XXXXXXXXXX')
rejects('Universal Analytics UA- → formato', () => parseGa4MeasurementId('UA-12345-1'), 'G-XXXXXXXXXX')
rejects('troppo corto → formato', () => parseGa4MeasurementId('G-AB1'), 'G-XXXXXXXXXX')

// --- gli altri identificativi restano come prima
is('Property ID da properties/…', parseGa4PropertyId('properties/123456789'), '123456789')
rejects('Property ID con G- → rimanda al Measurement ID', () => parseGa4PropertyId('G-ABC123DEF4'), 'Measurement ID')
is('GTM in maiuscolo', parseGtmContainerId('gtm-abc1234'), 'GTM-ABC1234')
is('Pixel senza spazi', parseMetaPixelId('1234 5678 9012 3456'), '1234567890123456')

console.log(fail ? `\n${fail} controlli falliti` : '\nTutti i controlli passano')
process.exit(fail ? 1 : 0)

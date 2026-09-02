/* Verifica del riepilogo QA. Esegui: npx tsx lib/tracking/qa.check.ts */
import { summarize } from '@/lib/tracking/qa'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

type R = Parameters<typeof summarize>[0][number]
const r = (client_id: string, check_key: R['check_key'], status: R['status'], checked_at = '2026-09-01T07:00:00Z'): R =>
  ({ client_id, check_key, status, detail: `${check_key}:${status}`, checked_at })

const s = summarize([
  r('a', 'gtm', 'ok'), r('a', 'ga4', 'ok'), r('a', 'meta_pixel', 'indeterminato'),
  r('b', 'gtm', 'ok'), r('b', 'ga4', 'problema'), r('b', 'meta_pixel', 'na', '2026-09-02T07:00:00Z'),
  r('c', 'gtm', 'na'), r('c', 'ga4', 'na'), r('c', 'meta_pixel', 'na'),
  r('d', 'gtm', 'indeterminato'), r('d', 'ga4', 'na'), r('d', 'meta_pixel', 'indeterminato'),
])

is('a: ok + indeterminato → ok', s.get('a')?.status, 'ok')
is('a: due verificati', s.get('a')?.verified, 2)
is('b: un problema → problema', s.get('b')?.status, 'problema')
is('b: dettaglio del problema', s.get('b')?.problems, [{ key: 'ga4', detail: 'ga4:problema' }])
is('b: data più recente', s.get('b')?.checkedAt, '2026-09-02T07:00:00Z')
is('c: tutto na → na, non verde', s.get('c')?.status, 'na')
is('d: solo indeterminati → na', s.get('d')?.status, 'na')
is('cliente mai controllato assente', s.has('e'), false)

console.log(fail ? `\n${fail} controlli falliti` : '\nTutti i controlli passano')
process.exit(fail ? 1 : 0)

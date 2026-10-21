/* §491 — Quali richieste del browser svuotano la memoria delle pagine. Esegui: npx tsx lib/router-cache.check.ts */
import { eScrittura } from '@/lib/router-cache'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(60)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const B = 'https://x.supabase.co'
is('una modifica a una tabella: sì', eScrittura(`${B}/rest/v1/tickets?id=eq.1`, 'PATCH'), true)
is('un inserimento: sì', eScrittura(`${B}/rest/v1/chat_messages`, 'POST'), true)
is('una cancellazione: sì', eScrittura(`${B}/rest/v1/tasks?id=eq.1`, 'delete'), true)
is('una lettura: no', eScrittura(`${B}/rest/v1/tasks?select=*`, 'GET'), false)
is('un conteggio (HEAD): no', eScrittura(`${B}/rest/v1/tasks`, 'HEAD'), false)
is('una RPC, anche in POST: no — legge spesso, e farebbe un giro senza fine', eScrittura(`${B}/rest/v1/rpc/get_x`, 'POST'), false)
is('l\'autenticazione: no', eScrittura(`${B}/auth/v1/token?grant_type=refresh_token`, 'POST'), false)
is('lo storage: no', eScrittura(`${B}/storage/v1/object/avatars/u1/1.webp`, 'POST'), false)

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)

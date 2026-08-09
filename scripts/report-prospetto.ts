/**
 * Il report del mese, generato su file per guardarlo prima di mandarlo.
 *
 *   npx tsx scripts/report-prospetto.ts 2026-08-01 [percorso.html]
 *
 * Stessa composizione della route (`/api/prospetto`): legge dal database col
 * service role e passa a `reportHtml`. Serve a vedere il documento senza
 * autenticarsi — una colonna che va a capo o un numero vuoto si notano solo
 * guardando il foglio, non compilandolo.
 */
import { readFileSync, writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { monthKey } from '@/lib/pl'
import { loadProspetto } from '@/lib/prospetto-load'
import { reportHtml } from '@/lib/prospetto-report'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const month = process.argv[2] ? monthKey(new Date(process.argv[2])) : monthKey(new Date())
  const out = process.argv[3] ?? `/tmp/prospetto-${month}.html`

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } })
  const d = await loadProspetto(sb, month, today)
  if (d.setupNeeded) throw new Error('Conto economico non configurato')
  writeFileSync(out, reportHtml(d, month, today, 'Marco Lucci'))
  console.log(`${out} — ${month}, ${d.plan.length} mesi in catena`)
}
main().catch(e => { console.error(e); process.exit(1) })

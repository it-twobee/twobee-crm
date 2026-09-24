/* §434 — la prova a secco del ritorno sul foglio: calcola le celle che il giro
   scriverebbe, **senza scriverne nessuna**. Legge il foglio dal CSV pubblico
   (lo stesso dell'ingresso) e i lead dal database.

   npx tsx scripts/check-sales-ritorno.ts ['<url CSV del foglio>']

   Serve prima di attivare la chiave, e ogni volta che il ritorno fa qualcosa
   che non ci si aspetta: dice quante righe abbina, quali colonne aggiungerebbe
   e le prime celle, con il valore che c'è adesso e quello che ci metterebbe. */

import { createClient } from '@supabase/supabase-js'
import { leggiCsv } from '@/lib/sales-import'
import { scaricaFoglio, URL_FOGLIO } from '@/lib/sales-sync'
import { pianoRitorno, lettera } from '@/lib/sales-foglio-ritorno'
import { fasiVere, leadDelTool } from '@/lib/sales-foglio-dati'

;(async () => {
  const url = process.argv[2] || URL_FOGLIO
  if (!url) throw new Error('Manca l\'indirizzo CSV del foglio (argomento o SALES_SHEET_CSV_URL)')
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const valori = leggiCsv(await scaricaFoglio(url))
  const lead = await leadDelTool(admin, await fasiVere(admin))
  const piano = pianoRitorno(valori, lead)

  console.log(`righe nel foglio: ${valori.length - 1} · lead dal foglio nel tool: ${lead.length} · abbinate: ${piano.abbinate}`)
  console.log(`colonne da aggiungere: ${piano.nuoveColonne.join(', ') || 'nessuna'}`)
  console.log(`celle da scrivere: ${piano.celle.length}`)
  for (const c of piano.celle.filter(c => c.riga > 0).slice(0, 15)) {
    const ora = valori[c.riga]?.[c.colonna] ?? ''
    console.log(`  ${lettera(c.colonna)}${c.riga + 1}: «${ora}» → «${c.valore}»`)
  }
  console.log('\nNiente è stato scritto.')
})().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })

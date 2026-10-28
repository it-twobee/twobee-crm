import { analizzaFoglio } from '../lib/sales-import'
import { scaricaFoglio } from '../lib/sales-sync'
import { schedeDa } from '../lib/sales-schede'

/* §494 — una voce o l'elenco intero (`Etichetta|url; Etichetta|url`), come in SALES_SHEET_CSV_URL */
async function main() {
  const schede = schedeDa(process.argv[2] || process.env.SALES_SHEET_CSV_URL)
  if (!schede.length) throw new Error('Uso: npx tsx scripts/check-sales-sheet.ts "<URL CSV>" oppure "Etichetta|url; Etichetta|url"')
  for (const s of schede) {
    try {
      const { lead, ...analisi } = analizzaFoglio(await scaricaFoglio(s.url), s.etichetta)
      console.log(JSON.stringify({ scheda: s.etichetta, ...analisi, leadValidi: lead.length, scritture: 0 }, null, 2))
    } catch (e) {
      console.log(JSON.stringify({ scheda: s.etichetta, errore: e instanceof Error ? e.message : 'Verifica fallita' }, null, 2))
      process.exitCode = 1
    }
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Verifica fallita'); process.exitCode = 1 })

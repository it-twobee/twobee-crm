import { analizzaFoglio } from '../lib/sales-import'
import { scaricaFoglio } from '../lib/sales-sync'

async function main() {
  const url = process.argv[2] || process.env.SALES_SHEET_CSV_URL
  if (!url) throw new Error('Uso: npx tsx scripts/check-sales-sheet.ts "<URL CSV>"')
  const { lead, ...analisi } = analizzaFoglio(await scaricaFoglio(url))
  console.log(JSON.stringify({ ...analisi, leadValidi: lead.length, scritture: 0 }, null, 2))
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Verifica fallita'); process.exitCode = 1 })

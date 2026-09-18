/* Con quale area si apre il calendario (§358).
   Esegui: npx tsx lib/area-persona.check.ts */
import { areaDiPartenza, vedeTutto, AREE } from '@/lib/area-persona'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Chi governa vede tutto —')
for (const r of ['admin', 'founder', 'super_admin']) {
  is(`${r} parte da «Tutte»`, areaDiPartenza({ appRole: r, areeDeiProgetti: ['growth', 'growth'] }), '')
  is(`  e ${r} vede tutto`, vedeTutto(r), true)
}
is('un manager no', vedeTutto('manager'), false)
is('e nemmeno un junior', vedeTutto('junior'), false)

console.log('\n— L\'area si deduce dal lavoro —')
/* `profiles.area` è nulla per tutte e sette le persone attive: un default
   costruito su quella colonna non avrebbe selezionato niente per nessuno. */
is('sei marketing e cinque growth → marketing',
  areaDiPartenza({ appRole: 'manager', areeDeiProgetti: [...Array(6).fill('marketing'), ...Array(5).fill('growth')] }), 'marketing')
is('quattro growth e uno marketing → growth',
  areaDiPartenza({ appRole: 'manager', areeDeiProgetti: ['growth', 'growth', 'growth', 'growth', 'marketing'] }), 'growth')
is('solo digital → digital',
  areaDiPartenza({ appRole: 'senior', areeDeiProgetti: ['digital'] }), 'digital')

console.log('\n— La scelta esplicita batte la deduzione —')
is('`profiles.area` vince sui progetti',
  areaDiPartenza({ appRole: 'manager', areaProfilo: 'digital', areeDeiProgetti: ['growth', 'growth'] }), 'digital')
is('ma un valore fuori elenco non vale niente',
  areaDiPartenza({ appRole: 'manager', areaProfilo: 'vendite', areeDeiProgetti: ['growth'] }), 'growth')
is('maiuscole e spazi non contano',
  areaDiPartenza({ appRole: 'manager', areaProfilo: '  Growth ' }), 'growth')

console.log('\n— Quando non c\'è niente da dedurre —')
is('nessun progetto → Tutte', areaDiPartenza({ appRole: 'junior', areeDeiProgetti: [] }), '')
is('progetti senza area → Tutte',
  areaDiPartenza({ appRole: 'junior', areeDeiProgetti: [null, undefined, ''] }), '')
is('e senza niente del tutto → Tutte', areaDiPartenza({ appRole: 'stage' }), '')

console.log('\n— A parità, la stessa risposta ogni volta —')
/* Un default che cambia da solo a ogni ricarico è peggio di nessun default:
   a parità vince l'ordine con cui le aree sono scritte. */
const pari = { appRole: 'manager', areeDeiProgetti: ['marketing', 'growth', 'digital'] }
is('tre a uno pari → la prima dell\'elenco', areaDiPartenza(pari), AREE[0])
is('e non cambia rileggendo', areaDiPartenza(pari), areaDiPartenza(pari))
is('l\'ordine è growth, digital, marketing', [...AREE], ['growth', 'digital', 'marketing'])

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)

/* Le tracce di una persona, dette in italiano. Esegui: npx tsx lib/tracce-membro.check.ts */
import { etichettaTraccia, TABELLE_TRADOTTE } from '@/lib/tracce-membro'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Singolare e plurale —')
is('una task', etichettaTraccia('tasks', 1), '1 task assegnata')
is('tre task', etichettaTraccia('tasks', 3), '3 task assegnate')
is('un file del portale', etichettaTraccia('portal_materials', 1), '1 file caricato nell’area di un cliente')
is('due movimenti', etichettaTraccia('portal_events', 2), '2 movimenti nel portale cliente')

console.log('\n— Quello che non conosciamo esce col suo nome —')
/* Travestire una tabella sconosciuta da «altri dati» è il modo migliore per far
   cancellare a qualcuno una cosa che non ha capito. Meglio un nome tecnico
   davanti agli occhi che una parola rassicurante. */
is('tabella nuova', etichettaTraccia('tabella_di_domani', 4), '4 in tabella_di_domani')
is('tabella nuova, una riga', etichettaTraccia('tabella_di_domani', 1), '1 in tabella_di_domani')

console.log('\n— Le tabelle che compaiono davvero nel dominio —')
/* Non è l'elenco completo delle chiavi verso `profiles` (sono quarantotto e
   cambiano): sono quelle che si sono viste davvero in una cancellazione. Se ne
   manca una, la frase non mente — mostra il nome vero. */
for (const t of ['tasks', 'portal_materials', 'portal_events', 'portal_memberships', 'notifications', 'files', 'activity_log']) {
  is(`${t} è tradotta`, TABELLE_TRADOTTE.includes(t), true)
}

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)

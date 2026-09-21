/* Le dodici fasi del CRM commerciale (§367).
   Esegui: npx tsx lib/sales-stages.check.ts

   Questo elenco esiste per combaciare con Notion, quindi il controllo che
   conta non è «è coerente» ma «è ancora quello di là»: dodici fasi, quei nomi,
   quei gruppi, quell'ordine. Se qualcuno ne aggiunge una senza aggiungerla
   anche su Notion, i due elenchi cominciano a divergere — e il primo giorno
   nessuno se ne accorge. */

import {
  FASI, GRUPPI, CHIAVI_FASE, FASI_APERTE, FASE_INGRESSO, CLASSI_TINTA,
  faseDi, etichettaFase, fasiDelGruppo, classiFase, ETICHETTA_GRUPPO,
} from '@/lib/sales-stages'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Le dodici di Notion, in quell\'ordine —')
/* Le etichette sono copiate dalla colonna: maiuscole, inglese e italiano
   mescolati, il «+» in mezzo. Non si normalizzano — è il nome che il
   commerciale legge da mesi, e «Strategia e Preventivo» sarebbe un'altra cosa. */
is('sono dodici', FASI.length, 12)
is('nell\'ordine della colonna', FASI.map(f => f.etichetta), [
  'Lost', 'Inactive Client', 'New Lead', 'Contacting',
  'In Conversation', 'Evento OSM', 'Audit richiesto', 'Qualified',
  'Pending', 'Strategia + Preventivo', 'Contratto',
  'Active Client',
])
is('quattro da fare', fasiDelGruppo('todo').length, 4)
is('sette in corso', fasiDelGruppo('in_progress').length, 7)
is('una chiusa', fasiDelGruppo('complete').length, 1)
is('e i gruppi coprono tutto', GRUPPI.flatMap(g => fasiDelGruppo(g)).length, FASI.length)

console.log('\n— Le chiavi stanno nel database, le etichette sullo schermo —')
is('nessuna chiave doppia', new Set(CHIAVI_FASE).size, 12)
is('nessuna etichetta doppia', new Set(FASI.map(f => f.etichetta)).size, 12)
is('chiavi sempre minuscole, senza spazi',
  CHIAVI_FASE.filter(k => !/^[a-z][a-z0-9_]*$/.test(k)), [])
is('il «+» diventa un underscore, non sparisce',
  faseDi('strategia_preventivo')?.etichetta, 'Strategia + Preventivo')

console.log('\n— Le uscite —')
/* Su Notion `Lost` e `Inactive Client` stanno in «To-do», che per una pipeline
   è strano: sono uscite, non cose da fare. Si replica com'è — ma restano fuori
   dalla pipeline attiva, o il conteggio delle trattative vive conterebbe anche
   i persi. */
is('tre fasi sono uscite', FASI.filter(f => f.chiusa).map(f => f.chiave),
  ['lost', 'inactive_client', 'active_client'])
is('e non contano come aperte', FASI_APERTE.includes('lost'), false)
is('le aperte sono nove', FASI_APERTE.length, 9)
is('un perso resta nel gruppo «da fare», come su Notion', faseDi('lost')?.gruppo, 'todo')

console.log('\n— Dal foglio si entra da una porta sola —')
is('la porta è New Lead', FASE_INGRESSO, 'new_lead')
is('ed è una fase vera', CHIAVI_FASE.includes(FASE_INGRESSO), true)
is('e non è un\'uscita', FASI_APERTE.includes(FASE_INGRESSO), true)

console.log('\n— I colori passano dai token —')
/* La regola più vecchia del progetto: un hex non reagisce al tema e rompe il
   contrasto. Sette token per dodici fasi vuol dire che qualcuna li condivide,
   ed è dichiarato — ma nessuna deve restare senza. */
is('ogni fase ha una classe', FASI.filter(f => !classiFase(f.chiave)).length, 0)
is('nessun hex, nessun colore Tailwind grezzo',
  Object.values(CLASSI_TINTA).filter(c => /#|bg-(red|green|blue|gray|slate|amber)-/.test(c)), [])
is('ogni tinta usata è definita',
  FASI.filter(f => !CLASSI_TINTA[f.tinta]).length, 0)
/* Le coppie che condividono un colore devono stare lontane nel percorso: due
   fasi adiacenti dello stesso colore sono due fasi che si confondono. */
const vicineUguali = FASI.slice(1).filter((f, i) => f.tinta === FASI[i].tinta && f.tinta !== 'neutro')
is('nessuna coppia adiacente dello stesso colore', vicineUguali.map(f => f.etichetta), [])

console.log('\n— Quello che non conosciamo non si inventa —')
is('una fase sconosciuta non ha una scheda', faseDi('vinta'), null)
is('ma la sua etichetta resta leggibile', etichettaFase('vecchia_fase'), 'vecchia_fase')
is('e senza fase si dichiara', etichettaFase(null), '—')
is('con un colore neutro, non uno a caso', classiFase('vinta'), CLASSI_TINTA.neutro)
is('i gruppi hanno tutti un nome', GRUPPI.filter(g => !ETICHETTA_GRUPPO[g]).length, 0)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)

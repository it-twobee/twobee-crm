/* Ordinamento e filtri dei lead (§376).
   Esegui: npx tsx lib/sales-filtri.check.ts

   L'ordinamento è la cosa che sbaglia in silenzio: una data confrontata come
   stringa funziona per caso, un numero confrontato come testo mette
   «1.500.000» prima di «900.000», e nessuno dei due errori si vede guardando
   la pagina — si vede quando qualcuno chiama il lead sbagliato perché stava
   in cima. Qui si provano con dei dati. */

import { FASI_SEME as F } from '@/lib/sales-stages'
import {
  ordina, confronta, opzioni, applica, valoriDi, cerca, quantiFiltri,
  ORDINABILI, FILTRABILI, SENZA_OWNER, type Riga,
} from '@/lib/sales-filtri'
import { COLONNE } from '@/lib/sales-table'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const nomi = (rs: Riga[]) => rs.map(r => r.company_name)

console.log('\n— I numeri si ordinano da numeri —')
/* Come testo, «1.500.000» starebbe prima di «900.000»: è il difetto classico
   e non si vede finché qualcuno non guarda i primi tre. */
const soldi: Riga[] = [
  { company_name: 'media', fatturato: 900000 },
  { company_name: 'grande', fatturato: 1500000 },
  { company_name: 'piccola', fatturato: 80000 },
]
is('in salita', nomi(ordina(F, soldi, 'fatturato', 'su')), ['piccola', 'media', 'grande'])
is('in discesa', nomi(ordina(F, soldi, 'fatturato', 'giu')), ['grande', 'media', 'piccola'])

console.log('\n— Le date si ordinano da date —')
const date: Riga[] = [
  { company_name: 'b', created_at: '2026-09-02T10:00:00Z' },
  { company_name: 'c', created_at: '2026-09-20T09:00:00Z' },
  { company_name: 'a', created_at: '2026-08-30T23:00:00Z' },
]
is('la più vecchia per prima', nomi(ordina(F, date, 'created_at', 'su')), ['a', 'b', 'c'])
is('e la più recente in cima al contrario', nomi(ordina(F, date, 'created_at', 'giu')), ['c', 'b', 'a'])

console.log('\n— I vuoti stanno in fondo, sempre —')
/* Ordinare per «ultimo contatto» mettendo davanti chi non è mai stato
   contattato è vero e inutile: la domanda era «chi ho lasciato più
   indietro», non «di chi non so niente». */
const buchi: Riga[] = [
  { company_name: 'senza', last_interaction_at: null },
  { company_name: 'vecchio', last_interaction_at: '2026-01-01' },
  { company_name: 'nuovo', last_interaction_at: '2026-09-01' },
]
is('in salita', nomi(ordina(F, buchi, 'last_interaction_at', 'su')), ['vecchio', 'nuovo', 'senza'])
is('e anche in discesa', nomi(ordina(F, buchi, 'last_interaction_at', 'giu')), ['nuovo', 'vecchio', 'senza'])
is('la stringa vuota conta come vuoto, non come primo alfabetico',
  confronta(F, { company_name: '' }, { company_name: 'Acme' }, 'company_name', 'su') > 0, true)
is('e resta in fondo anche al contrario',
  confronta(F, { company_name: '' }, { company_name: 'Acme' }, 'company_name', 'giu') > 0, true)

console.log('\n— Le fasi seguono la pipeline, non l\'alfabeto —')
/* `Contacting` viene prima di `Qualified` perché viene prima nel percorso.
   In alfabetico `Active Client` starebbe in cima, che è il contrario. */
const fasi: Riga[] = [
  { company_name: 'q', stage: 'in_contatto' },
  { company_name: 'n', stage: 'nuovo_lead' },
  { company_name: 'a', stage: 'cliente_acquisito' },
  { company_name: 'c', stage: 'in_contatto' },
]
/* §424 — l'ordine è quello del percorso: nuovo, poi i due in contatto (fra
   loro resta l'ordine di partenza), poi la vinta. */
is('nell\'ordine del percorso', nomi(ordina(F, fasi, 'stage', 'su')), ['n', 'q', 'c', 'a'])

console.log('\n— Le scelte si ordinano per urgenza —')
const prio: Riga[] = [
  { company_name: 'bassa', priority: 'Low' },
  { company_name: 'alta', priority: 'High' },
  { company_name: 'media', priority: 'Medium' },
]
is('High, Medium, Low — non in alfabetico', nomi(ordina(F, prio, 'priority', 'su')), ['alta', 'media', 'bassa'])

console.log('\n— Su cosa si può ordinare —')
is('quasi tutte le colonne', ORDINABILI.length >= COLONNE.length - 3, true)
is('ma non i tag: un elenco non ha un ordine',
  ORDINABILI.some(c => c.tipo === 'etichette'), false)
is('e ogni ordinabile è una colonna vera',
  ORDINABILI.filter(c => !COLONNE.includes(c)), [])

console.log('\n— I filtri: OR dentro, AND fra —')
/* La regola che la gente si aspetta senza saperla dire. AND dentro darebbe
   zero risultati ogni volta che si spuntano due valori della stessa cosa. */
const lead: Riga[] = [
  { company_name: 'a', stage: 'perso', priority: 'High', lead_origine: { piattaforma: 'fb' } },
  { company_name: 'b', stage: 'in_contatto', priority: 'High', lead_origine: { piattaforma: 'ig' } },
  { company_name: 'c', stage: 'in_contatto', priority: 'Low', lead_origine: { piattaforma: 'fb' } },
]
is('due valori della stessa variabile: OR',
  nomi(applica(lead, { stage: ['perso', 'in_contatto'] })), ['a', 'b', 'c'])
is('due variabili diverse: AND',
  nomi(applica(lead, { stage: ['in_contatto'], priority: ['High'] })), ['b'])
is('nessun filtro, nessun taglio', applica(lead, {}).length, 3)
is('un filtro vuoto non taglia', applica(lead, { stage: [] }).length, 3)
is('si filtra anche dentro la provenienza',
  nomi(applica(lead, { piattaforma: ['fb'] })), ['a', 'c'])
is('e i filtri attivi si contano', quantiFiltri({ stage: ['perso'], priority: ['High', 'Low'] }), 3)

console.log('\n— Le opzioni sono quelle che esistono —')
/* Offrire un valore che nessuna riga ha è un filtro che porta a zero
   risultati: si impara a non usarli. */
const op = opzioni(lead, { campo: 'stage' })
is('solo i valori presenti', op.map(o => o.valore), ['in_contatto', 'perso'])
is('col conteggio, dal più frequente', op.map(o => o.quante), [2, 1])
is('i tag valgono uno per etichetta',
  opzioni([{ tags: ['Beauty', 'Marketing'] }, { tags: ['Beauty'] }], { campo: 'tags' }),
  [{ valore: 'Beauty', quante: 2 }, { valore: 'Marketing', quante: 1 }])
is('una riga senza valore non produce un\'opzione vuota',
  opzioni([{ priority: null }, { priority: 'High' }], { campo: 'priority' }).length, 1)
is('ogni filtrabile sa dove guardare',
  FILTRABILI.filter(f => f.da && f.da !== 'lead_origine'), [])
is('e valoriDi regge un campo assente', valoriDi({}, { campo: 'stage' }), [])

console.log('\n— La ricerca guarda tutti i testi —')
const testi: Riga[] = [
  { company_name: 'Acme', contact_name: 'Ada', contact_email: 'ada@acme.it', contact_phone: '+39333', notes: null },
  { company_name: 'Beta', contact_name: 'Bruno', contact_email: null, contact_phone: null, notes: 'richiamare Ada' },
]
is('per azienda', nomi(cerca(testi, 'acme')), ['Acme'])
is('per referente', nomi(cerca(testi, 'ada')).length, 2)
is('per email', nomi(cerca(testi, '@acme')), ['Acme'])
is('per telefono', nomi(cerca(testi, '333')), ['Acme'])
is('e dentro le note', nomi(cerca(testi, 'richiamare')), ['Beta'])
is('senza testo non taglia', cerca(testi, '  ').length, 2)

console.log('\n— Chi segue il lead, anche quando non lo segue nessuno (§430) —')
const seguiti: Riga[] = [
  { company_name: 'Acme', owners: ['anna', 'bruno'] },
  { company_name: 'Beta', owners: ['anna'] },
  { company_name: 'Gamma', owners: [] },
  { company_name: 'Delta' },
]
const fOwner = FILTRABILI.find(f => f.campo === 'owners')!
is('owner è filtrabile', !!fOwner, true)
is('qualifica è filtrabile', FILTRABILI.some(f => f.campo === 'qualifica'), true)
is('lista vuota e campo assente sono «nessuno»', [valoriDi(seguiti[2], fOwner), valoriDi(seguiti[3], fOwner)], [[SENZA_OWNER], [SENZA_OWNER]])
is('i senza owner si contano, e stanno in fondo', opzioni(seguiti, fOwner), [
  { valore: 'anna', quante: 2 }, { valore: 'bruno', quante: 1 }, { valore: SENZA_OWNER, quante: 2 },
])
is('i lead di Anna, due owner compresi', nomi(applica(seguiti, { owners: ['anna'] })), ['Acme', 'Beta'])
is('quelli che non segue nessuno', nomi(applica(seguiti, { owners: [SENZA_OWNER] })), ['Gamma', 'Delta'])
is('il vuoto non si inventa dove non è chiesto',
  valoriDi({ source: '' }, FILTRABILI.find(f => f.campo === 'source')!), [])

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)

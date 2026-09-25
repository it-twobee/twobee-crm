/* §428 — cosa serve adesso su un lead. Esegui: npx tsx lib/sales-scheda.check.ts */
import { campiCheServono, giorniDa, prossimaAzione, soloNumero, suggerimenti, type RigaScheda } from '@/lib/sales-scheda'
import { FASI_SEME as F } from '@/lib/sales-stages'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const OGGI = Date.parse('2026-09-23T12:00:00Z')
const gg = (n: number) => new Date(OGGI - n * 86_400_000).toISOString()
const r = (x: Partial<RigaScheda> = {}): RigaScheda =>
  ({ stage: 'in_contatto', contact_phone: '+3933', qualifica: 'in_target', last_interaction_at: gg(1), ...x })

console.log('\n— Una cosa sola da fare, e la più urgente —')
/* L'ordine è quello del danno: un lead senza recapito non si lavora affatto, e
   dirgli «qualificalo» prima sarebbe un consiglio che non si può seguire. */
is('senza recapito viene prima di tutto',
  prossimaAzione(F, r({ contact_phone: null, contact_email: null, qualifica: 'da_valutare' }), OGGI)?.campo, 'contact_phone')
is('ed è urgente', prossimaAzione(F, r({ contact_phone: null, contact_email: null }), OGGI)?.urgente, true)
is('una mail basta a non essere urgente',
  prossimaAzione(F, r({ contact_phone: null, contact_email: 'a@b.it' }), OGGI)?.urgente, undefined)

console.log('\n— Le uscite chiedono la loro cosa, e poi tacciono —')
is('un perso senza motivo', prossimaAzione(F, r({ stage: 'perso' }), OGGI)?.campo, 'motivo_perso')
is('un perso col motivo non chiede più niente',
  prossimaAzione(F, r({ stage: 'perso', motivo_perso: 'prezzo' }), OGGI), null)
/* Su una chiusa non si chiede la qualifica: la riga è finita, e riempirla di
   campi obbligatori è il modo di far smettere di segnare i persi. */
is('e nemmeno se non è qualificato',
  prossimaAzione(F, r({ stage: 'perso', motivo_perso: 'prezzo', qualifica: 'da_valutare' }), OGGI), null)
is('un vinto senza anagrafica', prossimaAzione(F, r({ stage: 'cliente_acquisito' }), OGGI)?.urgente, true)
is('un vinto con anagrafica tace',
  prossimaAzione(F, r({ stage: 'cliente_acquisito', client_id: 'c1' }), OGGI), null)

console.log('\n— Le fasi vive —')
/* §438 — i tentativi non si scrivono più: il campo da toccare è l'ultimo
   contatto, dove sta il bottone «Oggi» che li registra */
is('un lead nuovo si chiama', prossimaAzione(F, r({ stage: 'nuovo_lead' }), OGGI)?.campo, 'last_interaction_at')
is('un lead nuovo cercato a vuoto lo dice', prossimaAzione(F, r({ stage: 'nuovo_lead', tentativi: 2 }), OGGI)?.testo,
  'L’hai cercato 2 volte senza risposta: riprova.')
is('tre a vuoto: un altro canale', prossimaAzione(F, r({ qualifica: 'in_target', tentativi: 3 }), OGGI)?.testo.startsWith('3 tentativi'), true)
is('senza qualifica si qualifica',
  prossimaAzione(F, r({ qualifica: 'da_valutare' }), OGGI)?.campo, 'qualifica')
is('senza ultimo contatto lo si segna',
  prossimaAzione(F, r({ last_interaction_at: null }), OGGI)?.campo, 'last_interaction_at')
is('fermo da tanto, si richiama',
  prossimaAzione(F, r({ last_interaction_at: gg(30) }), OGGI)?.testo, 'Sono passati 30 giorni dall’ultimo contatto: fatti sentire.')
is('sentito ieri: niente da dire', prossimaAzione(F, r(), OGGI), null)
is('il sospeso dice da quanto',
  prossimaAzione(F, r({ stage: 'pending', last_interaction_at: gg(9) }), OGGI)?.testo,
  'Ferma da 9 giorni: richiamalo, o segnala persa.')
is('e al singolare lo dice giusto',
  prossimaAzione(F, r({ stage: 'pending', last_interaction_at: gg(1) }), OGGI)?.testo,
  'Ferma da 1 giorno: richiamalo, o segnala persa.')

console.log('\n— Il ruolo, non la chiave —')
const rinominata = F.map(f => f.chiave === 'perso' ? { ...f, chiave: 'ko', etichetta: 'KO' } : f)
is('una persa rinominata chiede lo stesso il motivo',
  prossimaAzione(rinominata, r({ stage: 'ko' }), OGGI)?.campo, 'motivo_perso')

console.log('\n— I campi che contano adesso —')
is('a un perso si chiede solo il motivo e i recapiti',
  campiCheServono(F, r({ stage: 'perso' })).includes('qualifica'), false)
is('e il motivo sì', campiCheServono(F, r({ stage: 'perso' })), ['contact_email', 'contact_name', 'motivo_perso'])
is('a uno in corso si chiede la qualifica',
  campiCheServono(F, r({ qualifica: 'da_valutare', contact_email: 'a@b.it', contact_name: 'Anna' })), ['qualifica'])
is('una riga completa non chiede niente',
  campiCheServono(F, r({ contact_email: 'a@b.it', contact_name: 'Anna' })), [])
is('senza nessun recapito li chiede tutti e due',
  campiCheServono(F, r({ contact_phone: null, contact_email: null, contact_name: 'Anna' })), ['contact_phone', 'contact_email'])

console.log('\n— Quello che sappiamo già, proposto e non scritto —')
const org = { piattaforma: 'Facebook', fatturato_dichiarato: 'circa 500.000 €', tempistica: 'Subito' }
is('propone la piattaforma come fonte',
  suggerimenti({ lead_origine: org }, {}).find(s => s.campo === 'source')?.valore, 'Facebook')
is('e il fatturato ridotto a numero',
  suggerimenti({ lead_origine: org }, {}).find(s => s.campo === 'fatturato')?.valore, '500000')
/* Non si propone dove c'è già qualcosa: sovrascrivere quello che una persona ha
   scritto è il modo di far perdere fiducia in un suggerimento. */
is('non propone dove il campo è già pieno',
  suggerimenti({ lead_origine: org }, { source: 'Passaparola' }).find(s => s.campo === 'source'), undefined)
is('senza provenienza non propone niente', suggerimenti({}, {}), [])

console.log('\n— Il fatturato dichiarato a parole —')
is('con le migliaia', soloNumero('circa 500.000 €'), '500000')
is('un numero corto non è un fatturato', soloNumero('12'), null)
is('e una frase senza cifre nemmeno', soloNumero('non saprei'), null)
is('niente resta niente', soloNumero(null), null)

console.log('\n— I giorni —')
is('ieri', giorniDa(gg(1), OGGI), 1)
is('oggi', giorniDa(gg(0), OGGI), 0)
is('mai', giorniDa(null, OGGI), null)
is('illeggibile', giorniDa('boh', OGGI), null)

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)

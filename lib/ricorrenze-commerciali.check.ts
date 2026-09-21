/* §393 — le ricorrenze commerciali nel wizard.
   Esegui: npx tsx lib/ricorrenze-commerciali.check.ts

   L'errore di questo modulo è proporre l'anno sbagliato: il Black Friday
   del 2027 mentre quello del 2026 è fra due mesi, o quello del 2026 il 5
   dicembre, quando è passato. Chi crea un progetto non lo controlla — lo
   spunta e basta. */
import {
  prossimaOccorrenza, daProporre, quandoDice, type Ricorrenza,
} from '@/lib/ricorrenze-commerciali'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const r = (o: Partial<Ricorrenza> & { slug: string }): Ricorrenza => ({
  id: o.slug, name: o.slug, date_rule: 'fisso:12-25', lead_days: 30, areas: ['growth'], ...o,
})

const BF = r({ slug: 'black-friday', name: 'Black Friday', date_rule: 'ultimo:5:11', lead_days: 60 })
const NATALE = r({ slug: 'natale', name: 'Natale', date_rule: 'fisso:12-25', lead_days: 75 })
const SANV = r({ slug: 'san-valentino', name: 'San Valentino', date_rule: 'fisso:02-14', lead_days: 45 })
const SALDI = r({ slug: 'saldi', name: 'Saldi invernali', date_rule: 'manuale', lead_days: 30 })

console.log('\n— Quale occorrenza è la prossima —')
{
  /* Il 21 settembre: il Black Friday è davanti, San Valentino è passato da
     sette mesi e quello che interessa è quello dell'anno dopo. */
  is('a settembre il Black Friday è quello di quest\'anno',
    prossimaOccorrenza(BF, '2026-09-21').anno, 2026)
  is('e San Valentino è quello dell\'anno dopo',
    prossimaOccorrenza(SANV, '2026-09-21').anno, 2027)
  is('con la data giusta', prossimaOccorrenza(SANV, '2026-09-21').data, '2027-02-14')

  /* Il giorno dopo l'evento si passa all'anno successivo, non prima: il 27
     novembre il Black Friday è oggi, e proporre il 2027 sarebbe sbagliato. */
  is('il giorno stesso vale ancora quest\'anno',
    prossimaOccorrenza(BF, '2026-11-27').anno, 2026)
  is('il giorno dopo si passa all\'anno prossimo',
    prossimaOccorrenza(BF, '2026-11-28').anno, 2027)
  is('e la data del 2027 è il 26 novembre',
    prossimaOccorrenza(BF, '2026-11-28').data, '2027-11-26')
}

console.log('\n— Quando si comincia a lavorarci —')
{
  const o = prossimaOccorrenza(BF, '2026-09-21')
  is('il Black Friday 2026 cade il 27 novembre', o.data, '2026-11-27')
  is('e si comincia sessanta giorni prima', o.dal, '2026-09-28')
  is('l\'etichetta porta l\'anno', o.etichetta, 'Black Friday 2026')

  /* Il Natale ha settantacinque giorni di anticipo: il 20 ottobre il lavoro
     è già cominciato ma l'evento è davanti, e proporre il 2027 sarebbe
     assurdo. Si guarda l'evento, non l'inizio. */
  is('a ottobre il Natale è ancora quello di quest\'anno',
    prossimaOccorrenza(NATALE, '2026-10-20').anno, 2026)
  is('anche se la finestra è aperta da un mese',
    prossimaOccorrenza(NATALE, '2026-10-20').dal, '2026-10-11')
}

console.log('\n— I saldi: nessuno li calcola —')
{
  const senza = prossimaOccorrenza(SALDI, '2026-09-21')
  is('senza data scritta, la data non c\'è', senza.data, null)
  is('e nemmeno l\'inizio del lavoro', senza.dal, null)
  /* Non si salta all'anno dopo per una data che non si sa: sarebbe una
     scelta travestita da calcolo. */
  is('ma resta sull\'anno in corso', senza.anno, 2026)
  is('e lo dice con parole', quandoDice(senza), 'data da confermare: la fissano le Regioni')

  const con = prossimaOccorrenza(SALDI, '2026-09-21',
    [{ event_id: 'saldi', year: 2027, event_date: '2027-01-05' }])
  is('con la data scritta per il 2027, resta il 2026 che non si sa', con.anno, 2026)
  const passata = prossimaOccorrenza(SALDI, '2026-09-21',
    [{ event_id: 'saldi', year: 2026, event_date: '2026-01-05' },
     { event_id: 'saldi', year: 2027, event_date: '2027-01-03' }])
  is('se quella del 2026 è passata, prende il 2027', passata.data, '2027-01-03')
}

console.log('\n— Cosa si propone, e in che ordine —')
{
  const tutte = [BF, NATALE, SANV, SALDI,
    r({ slug: 'solo-marketing', name: 'Solo marketing', areas: ['marketing'] })]
  const g = daProporre(tutte, 'growth', '2026-09-21')
  is('solo quelle dell\'area', g.map(x => x.ricorrenza.slug),
    ['black-friday', 'natale', 'san-valentino', 'saldi'])
  /* L'ordine è per **inizio del lavoro**: quello che va aperto prima viene
     prima, che è l'unica cosa che interessa a chi sta creando il progetto. */
  is('in ordine di quando si comincia', g.filter(x => x.dal).map(x => x.dal),
    ['2026-09-28', '2026-10-11', '2026-12-31'])
  is('e quelle senza data vanno in fondo', g.at(-1)?.ricorrenza.slug, 'saldi')

  is('un\'area senza ricorrenze non ne propone',
    daProporre(tutte, 'digital', '2026-09-21').length, 0)
  is('e quelle spente nemmeno',
    daProporre([{ ...BF, active: false }], 'growth', '2026-09-21').length, 0)
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)

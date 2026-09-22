/* §389 — chi decide quali periodi aprire. Esegui: npx tsx lib/generatore-periodi.check.ts

   L'errore costoso di questo modulo è uno: aprire una corsia per un
   trimestre che sul progetto c'è già con un altro nome. Succederebbe su
   nove progetti veri il giorno in cui si accende, e chi ci lavora si
   troverebbe due corsie per lo stesso periodo senza sapere in quale mettere
   le task. Metà di queste prove sono lì. */
import { decidi, giaCoperto, riassumi, ORIZZONTE, type CorsiaEsistente } from '@/lib/generatore-periodi'
import { trimestre } from '@/lib/periodi'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const c = (name: string, dal: string | null, al: string | null): CorsiaEsistente => ({ id: name, name, dal, al })
const chiavi = (d: ReturnType<typeof decidi>, fare: 'crea' | 'salta') =>
  d.filter(x => x.fare === fare).map(x => x.periodo.chiave)

const OGGI = '2026-09-21'

console.log('\n— Il caso vero: le nove corsie «Set-Dic 2026» —')
{
  /* Tre dei nove progetti hanno esattamente le date di Q4: 1 settembre →
     31 dicembre. Sono Q4 con un altro nome, e aprirne un secondo sarebbe il
     danno che questo modulo esiste per evitare. */
  const setDic = [c('Meta - Campagne Set-Dic 2026', '2026-09-01', '2026-12-31')]
  const d = decidi({ oggi: OGGI, forma: 'quarter', chiaviAperte: [], corsie: setDic })
  is('non apre Q4: c\'è già con un altro nome', chiavi(d, 'crea'), [])
  is('e dice quale corsia lo copriva',
    d[0].fare === 'salta' ? d[0].corsia : null, 'Meta - Campagne Set-Dic 2026')

  /* Le altre hanno date sballate — una arriva al 2027 — e coprono Q4 lo
     stesso: la sovrapposizione basta, non serve che coincidano. */
  const lunga = [c('Instagram/TikTok Set-Dic 2026', '2026-04-01', '2027-04-30')]
  is('anche una corsia lunga due anni copre il trimestre',
    chiavi(decidi({ oggi: OGGI, forma: 'quarter', chiaviAperte: [], corsie: lunga }), 'crea'), [])
}

console.log('\n— Il progetto appena creato (§400) —')
{
  /* Le corsie di un progetto appena nato hanno le date del progetto:
     «Advertising» da gennaio a dicembre copre il trimestre al cento per cento
     senza essere quel trimestre, e il primo periodo non nascerebbe mai. Alla
     creazione la copertura non si guarda: quello da cui difende — le nove
     corsie in archivio — per definizione non esiste ancora. */
  const annuale = [c('ACME · Lead Generation — Advertising', '2026-01-01', '2026-12-31')]
  is('di norma una corsia annuale copre il trimestre',
    chiavi(decidi({ oggi: OGGI, forma: 'quarter', chiaviAperte: [], corsie: annuale }), 'crea'), [])
  is('ma alla creazione il periodo nasce lo stesso',
    chiavi(decidi({ oggi: OGGI, forma: 'quarter', chiaviAperte: [], corsie: annuale, coperture: false }), 'crea'),
    ['2026-Q4'])
  /* Quello che abbiamo aperto noi resta escluso anche alla creazione: la
     chiave è certa, e riaprire un periodo che c'è sarebbe un doppione vero. */
  is('il registro vale comunque',
    chiavi(decidi({ oggi: OGGI, forma: 'quarter', chiaviAperte: ['2026-Q4'], corsie: [], coperture: false }), 'crea'), [])
}

console.log('\n— E soprattutto: non salta dove non deve —')
{
  /* Una campagna di dieci giorni dentro il trimestre non è il trimestre. Se
     bastasse toccarlo, qualunque progetto con una campagna attiva non
     riceverebbe mai il suo periodo — e il generatore sembrerebbe rotto. */
  const breve = [c('Campagna Q4 Lancio Jose - Meta', '2026-09-14', '2026-11-30')]
  const d = decidi({ oggi: OGGI, forma: 'quarter', chiaviAperte: [], corsie: breve })
  is('una campagna di due mesi e mezzo su quattro copre',
    chiavi(d, 'crea'), [])
  const dieci = [c('Lancio breve', '2026-09-14', '2026-09-24')]
  is('ma una di dieci giorni no',
    chiavi(decidi({ oggi: OGGI, forma: 'quarter', chiaviAperte: [], corsie: dieci }), 'crea'), ['2026-Q4'])
  /* Una corsia senza date non può coprire niente: metà delle corsie in
     archivio non ce le ha, e trattarle come coperture spegnerebbe il
     generatore su mezza anagrafica. */
  is('una corsia senza date non copre',
    chiavi(decidi({ oggi: OGGI, forma: 'quarter', chiaviAperte: [], corsie: [c('Branding', null, null)] }), 'crea'),
    ['2026-Q4'])
  /* Una corsia dell'anno prima tocca il periodo con zero giorni. */
  is('e nemmeno una finita prima che il periodo cominci',
    chiavi(decidi({ oggi: OGGI, forma: 'quarter', chiaviAperte: [], corsie: [c('Vecchia', '2026-01-01', '2026-06-30')] }), 'crea'),
    ['2026-Q4'])
}

console.log('\n— Quello che abbiamo già aperto noi —')
{
  /* Per chiave, non per date: è certo, e va guardato per primo. Se si
     guardassero prima le date, un periodo aperto da noi il mese scorso
     verrebbe segnalato come «coperto da una corsia» — e manderebbe a
     cercare un doppione che non esiste. */
  const d = decidi({
    oggi: OGGI, forma: 'quarter', chiaviAperte: ['2026-Q4'],
    corsie: [c('Q4 2026', '2026-09-01', '2026-12-31')],
  })
  is('non lo riapre', chiavi(d, 'crea'), [])
  is('e il motivo è «già aperto», non «coperto»',
    d[0].fare === 'salta' ? d[0].perche : null, 'già aperto')
}

console.log('\n— L\'orizzonte —')
{
  const vuoto = { chiaviAperte: [], corsie: [] as CorsiaEsistente[] }
  is('a settembre i trimestri da aprire sono solo quello in corso',
    chiavi(decidi({ oggi: OGGI, forma: 'quarter', ...vuoto }), 'crea'), ['2026-Q4'])
  is('a metà novembre entra anche Q1 2027',
    chiavi(decidi({ oggi: '2026-11-20', forma: 'quarter', ...vuoto }), 'crea'), ['2026-Q4', '2027-Q1'])
  is('i mesi guardano più avanti dei trimestri', [ORIZZONTE.month, ORIZZONTE.quarter], [90, 45])
  is('i mesi da aprire oggi sono quattro',
    chiavi(decidi({ oggi: OGGI, forma: 'month', ...vuoto }), 'crea').length, 4)
  /* Un mese è una tappa dentro una corsia continuativa: non c'è niente che
     possa coprirlo per sovrapposizione, e guardare le corsie lo bloccherebbe
     su ogni progetto che ne ha una lunga. */
  is('e una corsia lunga non blocca i mesi',
    chiavi(decidi({ oggi: OGGI, forma: 'month', chiaviAperte: [],
      corsie: [c('Piano editoriale', '2026-01-01', '2027-12-31')] }), 'crea').length, 4)
  is('con forma «none» non si decide niente',
    decidi({ oggi: OGGI, forma: 'none', ...vuoto }), [])
}

console.log('\n— Il riepilogo dice anche cosa NON ha fatto —')
{
  const vuoto = { chiaviAperte: [], corsie: [] as CorsiaEsistente[] }
  is('quando apre, e al singolare', riassumi(decidi({ oggi: OGGI, forma: 'quarter', ...vuoto })), '1 periodo aperto')
  is('e al plurale', riassumi(decidi({ oggi: '2026-11-20', forma: 'quarter', ...vuoto })), '2 periodi aperti')
  is('quando c\'è già tutto',
    riassumi(decidi({ oggi: OGGI, forma: 'quarter', chiaviAperte: ['2026-Q4'], corsie: [] })),
    'Niente da aprire: ci sono già tutti')
  /* La differenza che conta: «non c'era niente da fare» e «c'era ma l'ho
     saltato» sono due esiti diversi, e uno dei due vuole che tu vada a
     guardare. */
  is('quando è coperto da una corsia lo dice diverso',
    riassumi(decidi({ oggi: OGGI, forma: 'quarter', chiaviAperte: [],
      corsie: [c('Set-Dic 2026', '2026-09-01', '2026-12-31')] })),
    'Niente da aprire: 1 già coperti da corsie esistenti')
  is('e su un servizio senza periodi lo dice',
    riassumi(decidi({ oggi: OGGI, forma: 'none', ...vuoto })), 'Questo servizio non ha periodi')
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)

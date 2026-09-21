/* Le colonne del CRM commerciale (§371).
   Esegui: npx tsx lib/sales-table.check.ts

   Due cose si controllano più delle altre. La prima: che le colonne siano
   ancora quelle di Notion — questo elenco esiste per combaciare con l'export,
   e una colonna che sparisce è una riga di dati che nessuno vede più. La
   seconda: che `CAMPI_SCRIVIBILI` non lasci passare niente di strutturale.
   Un'azione `'use server'` esporta un endpoint, e chi ha il codice davanti
   conosce i nomi delle colonne (§329). */

import {
  COLONNE, COLONNE_PRINCIPALI, CAMPI_SCRIVIBILI, CAMPI_RIGA, PRIORITA, MEMBERSHIP,
  colonnaDi, modificabile, validaCella, GRUPPI_SCHEDA, TITOLO_GRUPPO,
} from '@/lib/sales-table'
import { CHIAVI_FASE } from '@/lib/sales-stages'
import { FILTRABILI, ORDINABILI } from '@/lib/sales-filtri'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Le colonne di Notion ci sono tutte —')
/* L'export ha ventiquattro colonne. Tre non arrivano e il motivo sta nella
   migration 236: `Contacted button` è un pulsante, `Interactions` un rollup
   calcolato, `Deals` una relazione interna a Notion. Restano ventuno, più
   due nostre: lo status grezzo del foglio e la data di arrivo. */
const DA_NOTION = [
  'Company', 'Status', 'Priority', 'Contact Person', 'Phone', 'Email',
  'Account Owner', 'Membership', 'Tags', 'Services', 'Referral', 'Lead Source',
  'Last Contact', 'Start', 'Fatturato', 'Owner', 'Sito web', 'Address',
  'Drive', 'Richiesta Audit', 'Added',
]
const etichette = COLONNE.map(c => c.etichetta)
is('nessuna colonna di Notion è sparita', DA_NOTION.filter(n => !etichette.includes(n)), [])
is('«Owner» e «Account Owner» restano due colonne diverse',
  [etichette.includes('Owner'), etichette.includes('Account Owner')], [true, true])
is('nessuna etichetta doppia', new Set(etichette).size, etichette.length)
is('nessun campo doppio', new Set(COLONNE.map(c => c.campo)).size, COLONNE.length)
is('ogni colonna ha una larghezza', COLONNE.filter(c => !(c.largh > 0)).length, 0)
is('la vista stretta è una vista, non tutta la tabella',
  COLONNE_PRINCIPALI.length < COLONNE.length && COLONNE_PRINCIPALI.length >= 8, true)
is('e contiene le cose per cui si apre la pagina',
  ['company_name', 'stage', 'contact_phone'].filter(f => !COLONNE_PRINCIPALI.some(c => c.campo === f)), [])

console.log('\n— Scrivere è un permesso, non un dettaglio grafico —')
/* Se uno di questi entrasse nell'elenco, si potrebbe riscriverlo mandando il
   campo giusto nel corpo della richiesta: nascondere una cella non è una
   barriera (§329). */
const MAI = ['id', 'client_id', 'revision', 'sheet_row_id', 'imported_at', 'lead_origine',
  'created_by', 'updated_at', 'created_at', 'sheet_status']
is('niente di strutturale è scrivibile', MAI.filter(f => CAMPI_SCRIVIBILI.includes(f)), [])
is('lo status grezzo del foglio si legge e basta', modificabile(colonnaDi('sheet_status')!), false)
is('e la data del lead pure', modificabile(colonnaDi('created_at')!), false)
is('gli owner non passano da qui: sono una tabella a parte',
  CAMPI_SCRIVIBILI.includes('owners'), false)
is('ma le colonne vere sì',
  ['company_name', 'stage', 'priority', 'tags', 'fatturato'].filter(f => !CAMPI_SCRIVIBILI.includes(f)), [])

console.log('\n— Quello che arriva dal browser si controlla —')
is('una colonna inventata non passa', validaCella('password', 'x').ok, false)
is('una sola lettura nemmeno', validaCella('sheet_status', 'Chiuso').ok, false)
is('una fase vera passa', validaCella('stage', 'qualified'), { ok: true, valore: 'qualified' })
is('una fase inventata no', validaCella('stage', 'vinta').ok, false)
is('ogni fase reale è accettata', CHIAVI_FASE.filter(f => !validaCella('stage', f).ok), [])
is('una priorità fuori elenco no', validaCella('priority', 'Urgentissima').ok, false)
is('ogni priorità vera sì', PRIORITA.filter(p => !validaCella('priority', p).ok), [])
is('e ogni membership', MEMBERSHIP.filter(m => !validaCella('membership', m).ok), [])
is('svuotare una scelta si può', validaCella('priority', ''), { ok: true, valore: null })

console.log('\n— I tipi convertono, non tirano a indovinare —')
is('il fatturato con € e punti', validaCella('fatturato', '€ 1.500.000'), { ok: true, valore: 1500000 })
is('e con la virgola decimale', validaCella('fatturato', '1500,50'), { ok: true, valore: 1500.5 })
/* «tremila» come numero diventerebbe `null` in silenzio, e un campo che si
   svuota da solo è peggio di un errore: nessuno lo va a ricontrollare. */
is('ma «tremila» viene respinto, non azzerato', validaCella('fatturato', 'tremila').ok, false)
is('una data nel formato giusto', validaCella('started_on', '2026-03-10'), { ok: true, valore: '2026-03-10' })
is('«domani» no', validaCella('started_on', 'domani').ok, false)
is('un\'email storta no', validaCella('contact_email', 'pippo@').ok, false)
is('una buona sì', validaCella('contact_email', ' a@b.it ').ok, true)
is('un sito senza protocollo no', validaCella('website', 'twobee.it').ok, false)
is('con https sì', validaCella('website', 'https://twobee.it').ok, true)
is('le etichette si spezzano e si ripuliscono',
  validaCella('tags', 'Beauty, , Marketing , Beauty'), { ok: true, valore: ['Beauty', 'Marketing'] })
is('e accettano già un elenco', validaCella('services', ['Meta ads', 'Tracking']), { ok: true, valore: ['Meta ads', 'Tracking'] })
is('il sì/no è sempre un booleano', validaCella('audit_requested', 'true'), { ok: true, valore: true })
is('e «vuoto» vuol dire no', validaCella('audit_requested', ''), { ok: true, valore: false })

console.log('\n— Svuotare si può, tranne dove la riga sparirebbe —')
is('un telefono si può togliere', validaCella('contact_phone', ''), { ok: true, valore: null })
is('una nota pure', validaCella('notes', '  '), { ok: true, valore: null })
is('il nome azienda no: senza, la riga non è una riga',
  validaCella('company_name', '').ok, false)

console.log('\n— §378 · quello che la pagina legge, la query lo chiede —')
/* Il difetto che questo blocco esiste per non far tornare: la `select` si
   costruiva da `COLONNE`, e `lead_origine` non è una colonna — è un `jsonb`
   di sola lettura. Risultato: riquadro «Da dove arriva» vuoto, quattro
   filtri di provenienza con zero opzioni e il raggruppamento per campagna
   nei numeri tutto a niente, **senza un errore da nessuna parte**. Leggere
   un campo che non si è chiesto non rompe: restituisce `undefined`, ed è la
   categoria di errore che nessuno va a controllare. */
is('la provenienza Meta si chiede al database', CAMPI_RIGA.includes('lead_origine'), true)
is('e con lei le chiavi della riga',
  ['id', 'client_id'].filter(f => !CAMPI_RIGA.includes(f)), [])
is('ogni colonna mostrata è anche chiesta',
  COLONNE.filter(c => c.campo !== 'owners' && !CAMPI_RIGA.includes(c.campo)).map(c => c.campo), [])
/* `owners` non è una colonna di `deals`: sta in `deal_owners` (236), e
   chiederla al database farebbe fallire la query intera — la pagina non
   mostrerebbe una colonna in meno, mostrerebbe l'avviso rosso. */
is('gli owner no: non sono una colonna di `deals`', CAMPI_RIGA.includes('owners'), false)
is('nessun doppione nella select', new Set(CAMPI_RIGA).size, CAMPI_RIGA.length)
/* La regola vera, quella che vale anche per il filtro che qualcuno
   aggiungerà: un filtro che legge da una colonna non chiesta non filtra —
   offre zero opzioni e sembra che i dati non ci siano. */
is('ogni filtro legge da una colonna chiesta',
  FILTRABILI.filter(f => !CAMPI_RIGA.includes(f.da ?? f.campo)).map(f => f.campo), [])
is('e ogni ordinamento pure',
  ORDINABILI.filter(o => !CAMPI_RIGA.includes(o.campo)).map(o => o.campo), [])

console.log('\n— §374 · i riquadri della scheda —')
/* Ventitré campi in fila sono un modulo del catasto. Il controllo che conta
   è che **nessuno resti fuori**: un campo senza gruppo non comparirebbe in
   nessun riquadro, e sparirebbe dalla scheda senza che nessuno lo noti —
   è la stessa classe di errore di una colonna di Notion lasciata indietro. */
is('ogni colonna sta in un riquadro',
  COLONNE.filter(c => !GRUPPI_SCHEDA.includes(c.gruppo)).map(c => c.campo), [])
is('ogni riquadro ha almeno un campo',
  GRUPPI_SCHEDA.filter(g => !COLONNE.some(c => c.gruppo === g)), [])
is('e un titolo', GRUPPI_SCHEDA.filter(g => !TITOLO_GRUPPO[g]?.trim()), [])
is('la provenienza è tutta in sola lettura',
  COLONNE.filter(c => c.gruppo === 'provenienza' && modificabile(c)).map(c => c.campo), [])
/* Il primo riquadro è quello per cui si apre la scheda: il telefono. */
is('«chi chiamare» ha azienda, referente e telefono',
  ['company_name', 'contact_name', 'contact_phone'].filter(f =>
    colonnaDi(f)?.gruppo !== 'contatto'), [])
is('e la fase sta in «a che punto è»', colonnaDi('stage')?.gruppo, 'trattativa')

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)

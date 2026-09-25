/* L'export dei lead e dei contatti (§441).
   Esegui: npx tsx lib/sales-export.check.ts

   Le cose da non sbagliare: una cella che Excel esegue come formula, un CSV
   che Excel italiano apre in una colonna sola o con le accentate rotte, un
   valore scritto come sta nel database invece che come lo legge una persona,
   e un manager o un senior che esporta tutti i recapiti. */

import { FASI_SEME as F } from '@/lib/sales-stages'
import { SCELTE_SEME } from '@/lib/sales-scelte'
import {
  csv, disinnesca, foglioXml, nomeFile, puoEsportare, rigaVoce, tabellaContatti, tabellaInterazioni, tabellaLead, validaRichiesta, valoreCella,
  type Contesto, type VoceExport,
} from '@/lib/sales-export'
import { righeFoglio } from '@/lib/sales-xlsx'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(64)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const ctx: Contesto = {
  fasi: F, scelte: SCELTE_SEME, motivi: new Map([['prezzo', 'Prezzo troppo alto']]),
  persone: new Map([['p1', 'Anna Rossi'], ['p2', 'Luca Bianchi']]), campi: [],
}
const d = {
  id: '11111111-1111-4111-8111-111111111111', company_name: 'Acme; srl', contact_name: 'Mario "Mà" Verdi', contact_email: 'mario@acme.it',
  contact_phone: '+39 333 1234567', stage: 'call_fissata', qualifica: 'in_target', motivo_perso: 'prezzo', owners: ['p2', 'p1'],
  last_interaction_at: '2026-09-24T12:32:00Z', last_interaction_has_time: true, tentativi: 2, next_followup_at: '2026-09-26T07:30:00Z',
  created_at: '2026-09-01T08:00:00Z', fatturato: 500000, audit_requested: true, notes: 'Richiamare\nlunedì',
}

console.log('\n— Come lo legge una persona —')
is('la fase col suo nome', valoreCella('stage', d.stage, d, ctx), 'Call fissata')
is('la qualifica in parole', valoreCella('qualifica', d.qualifica, d, ctx), 'In target')
is('il motivo del perso dalla sua tabella', valoreCella('motivo_perso', d.motivo_perso, d, ctx), 'Prezzo troppo alto')
is('gli Account Owner per nome', valoreCella('owners', null, d, ctx), 'Luca Bianchi, Anna Rossi')
is('l\'ultimo contatto a Roma, con l\'ora', valoreCella('last_interaction_at', d.last_interaction_at, d, ctx), '24/09/2026 14:32')
is('senza ora registrata, solo il giorno', valoreCella('last_interaction_at', '2026-09-24T00:00:00Z', { ...d, last_interaction_has_time: false }, ctx), '24/09/2026')
is('il fatturato in euro', valoreCella('fatturato', d.fatturato, d, ctx).replace(/\s/g, ' '), '500.000 €')
is('sì e no', valoreCella('audit_requested', true, d, ctx), 'Sì')
is('il vuoto resta vuoto, non «null»', valoreCella('referral', null, d, ctx), '')

console.log('\n— Le tabelle —')
const contatti = tabellaContatti([d], ctx)
is('rubrica: sei colonne', contatti.intestazioni, ['Nome', 'Azienda', 'Email', 'Telefono', 'Account Owner', 'Fase'])
is('rubrica: la riga', contatti.righe[0], ['Mario "Mà" Verdi', 'Acme; srl', 'mario@acme.it', '+39 333 1234567', 'Luca Bianchi, Anna Rossi', 'Call fissata'])
const voci = new Map<string, VoceExport[]>([[d.id, [
  { deal_id: d.id, type: 'chiamata', outcome: 'non_risposto', direction: null, stato: 'fatta', occurred_at: '2026-09-24T12:32:00Z', has_time: true, content: 'segreteria\npiena', autore: 'Anna Rossi' },
  { deal_id: d.id, type: 'contatto', outcome: null, direction: null, stato: 'fatta', occurred_at: '2026-09-20T00:00:00Z', has_time: false, content: null, autore: null },
]]])
const lead = tabellaLead([d], ctx, voci)
is('lead completo: prossimo follow-up e interazioni in fondo', lead.intestazioni.slice(-2), ['Prossimo follow-up', 'Interazioni'])
is('il diario in una colonna, una voce per riga', lead.righe[0].at(-1), '24/09/2026 14:32 · Chiamata · Non risposto — segreteria piena\n20/09/2026 · Contatto')
is('le note ci sono', lead.intestazioni.includes('Note') && lead.righe[0][lead.intestazioni.indexOf('Note')], 'Richiamare\nlunedì')
const inter = tabellaInterazioni([d], voci)
is('il foglio delle interazioni: chi, e il contatto storico', inter.righe.map(r => r[4]), ['Anna Rossi', 'Prima della timeline'])
is('una voce in una riga', rigaVoce(voci.get(d.id)![0]), '24/09/2026 14:32 · Chiamata · Non risposto — segreteria piena')

console.log('\n— CSV all\'italiana —')
const c = csv(contatti)
is('BOM, per le accentate in Excel', c.charCodeAt(0), 0xFEFF)
is('punto e virgola, virgolette dove servono', c.slice(1).split('\r\n')[1], '"Mario ""Mà"" Verdi";"Acme; srl";mario@acme.it;+39 333 1234567;Luca Bianchi, Anna Rossi;Call fissata')
is('una formula resta testo', [disinnesca('=HYPERLINK("x")'), disinnesca('+SUM(A1)'), disinnesca('-2+3*cmd'), disinnesca('Acme')], ['\'=HYPERLINK("x")', '\'+SUM(A1)', '\'-2+3*cmd', 'Acme'])
is('un telefono non è una formula', [disinnesca('+39 333 1234567'), disinnesca('-'), disinnesca('+39 (02) 123-45')], ['+39 333 1234567', '-', '+39 (02) 123-45'])
is('anche nel CSV', csv({ intestazioni: ['a'], righe: [['@SUM(A1)']] }).split('\r\n')[1], '\'@SUM(A1)')

console.log('\n— Il foglio Excel, riletto dal nostro lettore —')
const xml = foglioXml(contatti)
is('andata e ritorno: la stessa tabella, senza apostrofi', righeFoglio(xml, []), [contatti.intestazioni, contatti.righe[0]])
is('caratteri di controllo tolti, & e < scappati', righeFoglio(foglioXml({ intestazioni: ['x'], righe: [['a & <b>\u0007']] }), [])[1], ['a & <b>'])

console.log('\n— Il nome del file e la richiesta —')
is('il giorno di Roma', nomeFile('lead', 'xlsx', Date.parse('2026-09-24T22:30:00Z')), 'lead-twobee-2026-09-25.xlsx')
is('contatti', nomeFile('contatti', 'pdf', Date.parse('2026-09-25T09:00:00Z')), 'contatti-twobee-2026-09-25.pdf')
const ok = validaRichiesta({ tipo: 'lead', formato: 'csv', ids: [d.id, d.id], filtri: '  Fase:   Call fissata ' })
is('buona, senza doppioni, filtri ripuliti', ok.ok && [ok.ids.length, ok.filtri], [1, 'Fase: Call fissata'])
is('formato inventato', validaRichiesta({ tipo: 'lead', formato: 'docx', ids: [d.id] }).ok, false)
is('id che non è un id', validaRichiesta({ tipo: 'lead', formato: 'csv', ids: ['1 OR 1=1'] }).ok, false)
is('niente da esportare', validaRichiesta({ tipo: 'contatti', formato: 'csv', ids: [] }).ok, false)

console.log('\n— Chi esporta —')
const SA = ['m.lucci@twobee.it']
is('super admin, founder e admin sì', [puoEsportare('super_admin', null, SA), puoEsportare('founder', null, SA), puoEsportare('admin', null, SA)], [true, true, true])
is('manager, senior e cliente no', [puoEsportare('manager', null, SA), puoEsportare('senior', null, SA), puoEsportare('client', null, SA)], [false, false, false])
is('l\'elenco dei super admin vale anche senza ruolo', puoEsportare('manager', 'm.lucci@twobee.it', SA), true)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)

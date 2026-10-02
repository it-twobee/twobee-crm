import { FASI_SEME } from './sales-stages'
import { fasiDiArrivo, problemiRegole, type RegolaStato } from './sales-regole-stato'

let ko = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) ko++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(60)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const r = (chiave: string, fase: string | null, avvisa = false): RegolaStato => ({ chiave, etichetta: chiave, fase, avvisa, ordine: 1 })
const note = ['chiamata:risposto', 'chiamata:non_risposto']

is('si arriva solo su trattative vive, mai su ingresso o uscite',
  fasiDiArrivo(FASI_SEME).map(f => f.chiave),
  ['non_raggiunto', 'in_contatto', 'call_fissata', 'preventivo_inviato', 'contratto_inviato'])
is('regole valide: nessun problema', problemiRegole([r('chiamata:risposto', 'in_contatto'), r('chiamata:non_risposto', 'non_raggiunto', true)], FASI_SEME, note), [])
is('«nessun cambio» è ammesso', problemiRegole([r('chiamata:risposto', null)], FASI_SEME, note), [])
is('non si torna a «Nuovo lead»', problemiRegole([r('chiamata:risposto', 'nuovo_lead')], FASI_SEME, note).length, 1)
is('né si chiude da sola', problemiRegole([r('chiamata:risposto', 'perso')], FASI_SEME, note).length, 1)
is('né si mette in Pending', problemiRegole([r('chiamata:risposto', 'pending')], FASI_SEME, note).length, 1)
is('una fase ritirata non è una destinazione',
  problemiRegole([r('chiamata:risposto', 'in_contatto')], FASI_SEME.map(f => f.chiave === 'in_contatto' ? { ...f, attiva: false } : f), note).length, 1)
is('una regola inventata si rifiuta', problemiRegole([r('chiamata:mai_vista', 'in_contatto')], FASI_SEME, note).length, 1)
is('doppia', problemiRegole([r('chiamata:risposto', null), r('chiamata:risposto', null)], FASI_SEME, note).length, 1)
is('avvisare senza fase non ha senso', problemiRegole([r('chiamata:risposto', null, true)], FASI_SEME, note).length, 1)

if (ko) { console.log(`\n${ko} controlli falliti`); process.exit(1) }
console.log('\nTutti i controlli passano.')

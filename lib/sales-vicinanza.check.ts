import { FASI_SEME } from './sales-stages'
import { coloreLivello, fattoreRecenza, vicinanza, LIVELLO_FERMO } from './sales-vicinanza'
import { rigaUltima, unaPerLead, type UltimaVoce } from './sales-ultima'

let ko = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) ko++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(62)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const ADESSO = Date.parse('2026-10-02T10:00:00Z')
const v = (stage: string, ultimo: string | null = '2026-10-01T10:00:00Z', arrivo: string | null = '2026-09-01T10:00:00Z') =>
  vicinanza({ fasi: FASI_SEME, stage, ultimoContatto: ultimo, arrivo, adessoMs: ADESSO })

is('il livello cresce lungo il percorso',
  ['nuovo_lead', 'non_raggiunto', 'in_contatto', 'call_fissata', 'preventivo_inviato', 'contratto_inviato'].map(s => v(s)!.livello),
  [8, 24, 40, 56, 72, 88])
is('cliente acquisito: 100 e vinto', [v('cliente_acquisito')!.livello, v('cliente_acquisito')!.tono], [100, 'vinto'])
is('perso: zero, grigio', [v('perso')!.livello, v('perso')!.tono], [0, 'perso'])
is('la spiegazione: base, fattore e prossima fase', [v('call_fissata')!.base, v('call_fissata')!.fattore, v('call_fissata')!.prossima], [56, 1, 'Preventivo inviato'])
is('l’ultima fase del percorso non ha una prossima', v('contratto_inviato')!.prossima, null)
is('pending: fermo, a un livello fisso', v('pending')!.livello, LIVELLO_FERMO)
is('una fase che non esiste più non inventa un numero', v('mai_vista'), null)
is('fino a 7 giorni nessuna perdita', fattoreRecenza(7), 1)
is('a 45 giorni metà', fattoreRecenza(45), 0.5)
is('oltre il tetto non scende ancora', fattoreRecenza(400), 0.5)
is('a metà strada, a metà perdita', Math.round(fattoreRecenza(26) * 100), 75)
is('fermo da 60 giorni: preventivo vale la metà', v('preventivo_inviato', '2026-08-03T10:00:00Z')!.livello, 36)
is('mai sentito conta dall’arrivo', v('call_fissata', null, '2026-07-01T10:00:00Z')!.livello, 28)
is('un cliente non decade mai', v('cliente_acquisito', '2025-01-01T10:00:00Z')!.livello, 100)
is('lo scatto di colore: rosso a zero', coloreLivello(0), 'color-mix(in srgb, var(--color-warning) 0%, var(--color-error))')
is('giallo a metà', coloreLivello(50), 'color-mix(in srgb, var(--color-success) 0%, var(--color-warning))')
is('verde a cento', coloreLivello(100), 'color-mix(in srgb, var(--color-success) 100%, var(--color-warning))')
is('mai fuori scala', coloreLivello(250), coloreLivello(100))

const voce = (o: Partial<UltimaVoce>): UltimaVoce => ({ deal_id: 'a', type: 'chiamata', outcome: 'risposto', direction: null, content: null, occurred_at: '2026-10-01T08:00:00Z', has_time: true, ...o })
is('senza testo: tipo, esito e quando', rigaUltima(voce({}), ADESSO)?.testo, null)
is('il titolo dice cosa è successo', rigaUltima(voce({ outcome: 'non_risposto' }), ADESSO)?.titolo.startsWith('Chiamata · Non risposto · Ieri'), true)
is('il testo si appiattisce su una riga', rigaUltima(voce({ content: 'vuole\n un   preventivo' }), ADESSO)?.testo, 'vuole un preventivo')
is('nessuna voce, nessuna riga', rigaUltima(null, ADESSO), null)
is('una voce per lead, la più recente',
  Array.from(unaPerLead([voce({ occurred_at: '2026-09-01T00:00:00Z', content: 'vecchia' }), voce({ content: 'nuova' }), voce({ deal_id: 'b' })]).values()).map(x => x.content),
  ['nuova', null])

if (ko) { console.log(`\n${ko} controlli falliti`); process.exit(1) }
console.log('\nTutti i controlli passano.')

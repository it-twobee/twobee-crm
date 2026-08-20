/**
 * Gate di `lib/month-intake.ts`. I casi sono le doppie vere di questa estate:
 * «Affinity (2 addebiti)» e «Beneficiari Vari Distinta», più i ventisei addebiti
 * Meta su una riga sola.
 *
 *   npx tsx lib/month-intake.check.ts
 */
import { intakeOf, intake, type IntakeTx, type IntakeLine } from './month-intake'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}
const has = (label: string, s: string | undefined, needle: string) => {
  if (s?.toLowerCase().includes(needle.toLowerCase())) { ok++; return }
  fails.push(`${label}\n    «${needle}» non compare in: ${JSON.stringify(s)}`)
}

const tx = (o: Partial<IntakeTx> & { amount: number }): IntakeTx => ({
  id: 't', booked_on: '2026-08-11', description: '', counterparty: null, kind: 'pagamento', ...o,
})
const li = (id: string, label: string, gross: number, o: Partial<IntakeLine> = {}): IntakeLine => ({
  id, label, gross, ...o,
});

// ── niente da spiegare ──────────────────────────────────────────────────────
{
  eq('un giroconto si ignora',
     intakeOf(tx({ amount: -550, kind: 'giroconto' }), []).action, 'ignora')
  has('e dice che i due lati sono un fatto solo',
      intakeOf(tx({ amount: -550, kind: 'giroconto' }), []).why, 'un fatto solo')
  /* §298 — chi ha già detto «niente da abbinare» ha deciso: riproporlo è il modo
     di far riconfermare la stessa cosa finché qualcuno sbaglia. */
  eq('e chi ha già deciso resta deciso',
     intakeOf(tx({ amount: -3000, no_match_needed: true }), []).action, 'ignora')
  eq('un movimento già allocato per intero pure',
     intakeOf(tx({ amount: -2989, allocated: 2989 }), []).action, 'ignora')
}

// ── il caso che ha creato le doppie: la riga c'è già ─────────────────────────
{
  /* «Affinity (2 addebiti) 5.100 €» è nata perché il gesto sapeva dare una sola
     risposta — una riga nuova — mentre i due subappalti che quei bonifici
     pagavano erano già nel mese. */
  const bonifico = tx({ amount: -2989, counterparty: 'Affinity S.r.l.' })
  const righe = [
    li('sub1', 'Subappalto Affinity — CRM ISF — 35% al 50%', 2989, { who: 'Affinity S.r.l.' }),
    li('altro', 'Google Cloud', 170),
  ]
  const r = intakeOf(bonifico, righe)
  eq('si accorpa, non si crea', r.action, 'accorpa')
  eq('sulla riga giusta', r.line?.id, 'sub1')
  eq('per il suo intero', r.line?.amount, 2989)
  eq('e la chiude', r.line?.closes, true)
  eq('senza niente da giudicare', r.sure, true)
  has('la ragione nomina le due prove', r.why, 'controparte')
}

// ── importo esatto ma nome che non torna: non è certo ────────────────────────
{
  const r = intakeOf(tx({ amount: -170.21, counterparty: 'Google Cloud Italy' }),
    [li('x', 'Un fornitore qualsiasi', 170.21)])
  eq('si propone comunque', r.action, 'accorpa')
  eq('ma non si conferma in blocco', r.sure, false)
  has('e si dice perché', r.why, 'il nome non lo conferma')
}

// ── due righe con lo stesso importo: la scelta è di una persona ──────────────
{
  const r = intakeOf(tx({ amount: -2450, counterparty: 'Affinity S.r.l.' }), [
    li('a', 'Subappalto Affinity — 35% al 50%', 2450, { who: 'Affinity S.r.l.' }),
    li('b', 'Subappalto Affinity — 35% alla consegna', 2450, { who: 'Affinity S.r.l.' }),
  ])
  eq('non si decide', r.sure, false)
  has('e si dice quante sono', r.why, '2 righe')
}

// ── §307 · il fornitore, non solo l'etichetta ───────────────────────────────
{
  /* Il caso vero di luglio: due subappalti dello stesso fornitore, e **uno dei
     due non ha il suo nome nell'etichetta** — «Subappalto — Digitalizzazione —
     CRM — Acconto» è di Affinity ma non lo dice. Senza il fornitore in `who` il
     bonifico finiva sull'unica riga che conteneva «Affinity», con la frase «la
     controparte torna e questo movimento la chiude»: una risposta sicura e
     sbagliata, che è la sola categoria che nessuno va a controllare. */
  const senzaFornitore = intakeOf(tx({ amount: -3000, counterparty: 'Affinity S.r.l.' }), [
    li('seven', 'Subappalto — Digitalizzazione — CRM — Acconto', 3000.38),
    li('isf', 'Subappalto Affinity — CRM ISF — 30%', 2562, { who: 'Affinity S.r.l.' }),
  ])
  eq('senza il fornitore ne trova una sola', senzaFornitore.line?.id, 'isf')

  const conFornitore = intakeOf(tx({ amount: -3000, counterparty: 'Affinity S.r.l.' }), [
    li('seven', 'Subappalto — Digitalizzazione — CRM — Acconto', 3000.38, { who: 'Affinity S.r.l.' }),
    li('isf', 'Subappalto Affinity — CRM ISF — 30%', 2562, { who: 'Affinity S.r.l.' }),
  ])
  eq('col fornitore diventano due e non si decide', conFornitore.sure, false)
  has('e si dice quante sono', conFornitore.why, '2 righe')
}

// ── i ventisei Meta su una riga sola: il movimento non vale quanto lei ───────
{
  /* §254 — il conto economico è fatto di voci mensili e la banca di addebiti
     singoli. Un movimento da 32,94 € non vale quanto la riga della pubblicità, e
     non deve: le dà quello che può. */
  const r = intakeOf(tx({ amount: -32.94, counterparty: 'Meta Ads' }),
    [li('ads', 'Meta Ads', 211.64, { allocated: 100 })])
  eq('si accorpa per la quota', r.action, 'accorpa')
  eq('e la quota è quello che il movimento vale', r.line?.amount, 32.94)
  eq('non la chiude', r.line?.closes, false)
  has('e dice quanto le resta', r.why, '111.64')

  /* Una riga già coperta non riceve un'allocazione in più: la porterebbe oltre
     il dovuto, ed è la sola forma in cui il registro può mentire al saldo. Ma la
     risposta giusta non è «riga nuova» — è che **la riga dice meno del vero**. */
  const piena = intakeOf(tx({ amount: -32.94, counterparty: 'Meta Ads' }),
    [li('ads', 'Meta Ads', 211.64, { allocated: 211.64 })])
  eq('una riga coperta si corregge, non si duplica', piena.action, 'correggi')
  eq('e si dice a quanto va portata', piena.line?.newGross, 244.58)
  has('col perché', piena.why, 'due volte')
  eq('non è mai una decisione automatica', piena.sure, false)

  /* Il caso vero di agosto: la riga dice 109,12 e dal conto sono usciti 166,01
     — cinque addebiti Meta, non tre. Un secondo «Meta Ads» accanto al primo è
     esattamente la doppia da cui questa funzione nasce. */
  const agosto = intakeOf(tx({ amount: -5.4, counterparty: 'Meta Ads' }),
    [li('ads', 'Meta Ads (3 addebiti)', 109.12, { allocated: 109.12 })])
  eq('agosto: si corregge', agosto.action, 'correggi')
  eq('a 114,52', agosto.line?.newGross, 114.52)
}

// ── quando davvero non c'è, e solo dove non ci sarà mai ──────────────────────
{
  const comm = intakeOf(tx({ amount: -1.5, kind: 'commissione', counterparty: 'Banca' }), [])
  eq('una commissione si crea', comm.action, 'aggiungi')
  eq('nell\'area «Banca»', comm.draft?.category, 'Banca')
  /* §255 — a piano non ci sono e non ci saranno: trentaquattro addebiti da un
     euro e mezzo non sono una voce che qualcuno preventiva. */
  has('e lo dice', comm.why, 'non sta a piano')

  const imposta = intakeOf(tx({ amount: -10547.24, kind: 'imposta' }), [])
  eq('un\'imposta va in Amministrazione', imposta.draft?.category, 'Amministrazione')

  /* Per tutto il resto la riga nuova è una scommessa, e la funzione lo scrive:
     è la frase che le doppie di questa estate non avevano. */
  const ignoto = intakeOf(tx({ amount: -500, counterparty: 'Qualcuno di nuovo' }), [])
  eq('un fornitore sconosciuto si aggiunge', ignoto.action, 'aggiungi')
  eq('ma non è mai certo', ignoto.sure, false)
  has('e avvisa del doppio conteggio', ignoto.why, 'contato due volte')
}

// ── il giro completo: le righe si consumano ─────────────────────────────────
{
  /* §300 — due movimenti che guardano la stessa fotografia trovano la stessa
     riga scoperta e la coprono entrambi. È successo sul canone di aprile di
     Fatima, e la causa era esattamente questa. */
  const due = [
    tx({ id: 'a', booked_on: '2026-08-01', amount: -100, counterparty: 'Slack' }),
    tx({ id: 'b', booked_on: '2026-08-02', amount: -100, counterparty: 'Slack' }),
  ]
  const { rows, summary } = intake(due, [li('s', 'Slack', 100, { who: 'Slack' })])
  eq('il primo la prende', rows[0].line?.amount, 100)
  /* E il secondo non trova una riga da creare: trova che **quella riga dice
     metà del vero**. Due addebiti Slack da 100 sono 200 di Slack, non 100 di
     Slack più una voce nuova che si chiama uguale. */
  eq('il secondo dice che la riga è sottostimata', rows[1].action, 'correggi')
  eq('e a quanto va portata', rows[1].line?.newGross, 200)
  eq('e uno solo è certo', summary.certi, 1)

  /* **Due correzioni sulla stessa riga si sommano.** Il caso vero di agosto: la
     riga «Meta Ads (3 addebiti)» dice 109,12 e dal conto sono usciti anche 5,40
     e 51,49 — cinque addebiti, non tre. Se la seconda correzione partisse
     dall'importo di partenza la riga finirebbe a 160,61 e i 5,40 della prima si
     perderebbero: la somma vera è 166,01. */
  const meta = intake([
    tx({ id: 'm1', booked_on: '2026-08-04', amount: -5.4, counterparty: 'Meta Ads' }),
    tx({ id: 'm2', booked_on: '2026-08-05', amount: -51.49, counterparty: 'Meta Ads' }),
  ], [li('ads', 'Meta Ads (3 addebiti)', 109.12, { allocated: 109.12, who: 'Meta Ads' })])
  eq('la prima porta la riga a 114,52', meta.rows[0].line?.newGross, 114.52)
  eq('e la seconda riparte da lì, non da 109,12', meta.rows[1].line?.newGross, 166.01)
  eq('due correzioni, nessuna riga nuova', meta.summary.aggiungi, 0)

  const { summary: s2 } = intake([
    tx({ id: 'x', amount: -550, kind: 'giroconto' }),
    tx({ id: 'y', amount: -2989, counterparty: 'Affinity S.r.l.' }),
    tx({ id: 'z', amount: -1.5, kind: 'commissione' }),
  ], [li('sub', 'Subappalto Affinity', 2989, { who: 'Affinity S.r.l.' })])
  eq('il riassunto conta le quattro risposte',
     { a: s2.accorpa, c: s2.correggi, n: s2.aggiungi, i: s2.ignora }, { a: 1, c: 0, n: 1, i: 1 })
  eq('i certi sono quelli da confermare in blocco', s2.certi, 1)
  eq('e valgono quello che allocano', s2.certiTotale, 2989)
  /* Lo scoperto non conta quelli ignorati: un giroconto non è denaro da
     spiegare, è denaro che si è solo spostato. */
  eq('lo scoperto lascia fuori gli ignorati', s2.scoperto, 2990.5)
}

console.log(fails.length === 0
  ? `\n${ok} controlli. Tutti i controlli passano.\n`
  : `\n${fails.length} controlli falliti su ${ok + fails.length}:\n\n  ✗ ${fails.join('\n\n  ✗ ')}\n`)
process.exit(fails.length === 0 ? 0 : 1)

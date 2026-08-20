/* Gate di `lib/stream-validation.ts`. Esegui: npx tsx lib/stream-validation.check.ts */
import { canValidate, canUnvalidate, stateNote, type ValidationInput } from './stream-validation'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
};
const has = (label: string, s: string | undefined, needle: string) => {
  if (s?.toLowerCase().includes(needle.toLowerCase())) { ok++; return }
  fails.push(`${label}\n    «${needle}» non compare in: ${JSON.stringify(s)}`)
};
const s = (o: Partial<ValidationInput> = {}): ValidationInput =>
  ({ status: 'bozza', amount: 1500, ...o })

// ── validare ────────────────────────────────────────────────────────────────
eq('una bozza con un importo si valida', canValidate(s()), { can: true })
{
  /* Il difetto da cui questo file nasce: **ogni contratto nasce in bozza**, e
     senza un gesto per uscirne restava invisibile a tutto l'economics per
     sempre — importo scritto nella scheda, conto economico che non ne sa
     niente, e nessuno dei due che dice perché. */
  const zero = canValidate(s({ amount: 0 }))
  eq('senza importo no', zero.can, false)
  has('e si dice cosa scrivere', zero.can === false ? zero.how : undefined, 'quanto paga il cliente')

  eq('un già validato non si rivalida', canValidate(s({ status: 'attivo' })).can, false)
  const sosp = canValidate(s({ status: 'sospeso' }))
  eq('un sospeso non si valida', sosp.can, false)
  has('si riprende', sosp.can === false ? sosp.how : undefined, 'si riprende')
}

// ── §169 · la manutenzione aspetta il lavoro che la genera ──────────────────
{
  const attesa = canValidate(s({ parent: { label: 'CRM Adamo', status: 'attivo' } }))
  eq('con il padre in corso no', attesa.can, false)
  has('e si nomina il padre', attesa.can === false ? attesa.why : undefined, 'CRM Adamo')
  has('col motivo vero', attesa.can === false ? attesa.how : undefined, 'nessuno sta erogando')
  eq('con il padre concluso sì',
     canValidate(s({ parent: { label: 'CRM Adamo', status: 'concluso' } })), { can: true })
}

// ── tornare in bozza ────────────────────────────────────────────────────────
{
  eq('un accordo che non ha prodotto niente torna indietro',
     canUnvalidate(s({ status: 'attivo' })), { can: true })

  /* L'ordine dei rifiuti: si dice sempre l'ostacolo più a monte. A chi ha
     davanti una rata incassata dentro un mese chiuso non serve sapere della
     materializzazione — quei soldi sono arrivati. */
  const incassata = canUnvalidate(s({ status: 'attivo', paid: 2, materialized: 4, closedMonth: 'luglio' }))
  eq('una rata incassata blocca', incassata.can, false)
  has('e vince sugli altri ostacoli', incassata.can === false ? incassata.why : undefined, 'incassate')

  const chiuso = canUnvalidate(s({ status: 'attivo', materialized: 3, closedMonth: 'luglio' }))
  eq('un mese chiuso blocca', chiuso.can, false)
  has('e dice quale', chiuso.can === false ? chiuso.why : undefined, 'luglio')
  has('col perché', chiuso.can === false ? chiuso.how : undefined, 'fotografia')

  /* Le rate già nel mese non bloccano ma **vanno dette**: restano lì, e senza
     l'avviso il mese continua a fatturare un contratto che non è più venduto. */
  const mater = canUnvalidate(s({ status: 'attivo', materialized: 2 }))
  eq('rate nel mese: si può, ma si avvisa', mater.can, true)
  has('e l\'avviso dice cosa resta', mater.can ? mater.warn : undefined, 'restano lì')
  eq('una sola rata si dice al singolare',
     canUnvalidate(s({ status: 'attivo', materialized: 1 })).can === true
       && (canUnvalidate(s({ status: 'attivo', materialized: 1 })) as { warn: string }).warn.includes('rata è'), true)

  eq('una bozza non si riporta in bozza', canUnvalidate(s({ status: 'bozza' })).can, false)
}

// ── cosa uno stato non fa, detto a chi guarda ──────────────────────────────
{
  has('la bozza dichiara cosa non fa', stateNote('bozza') ?? undefined, 'non genera righe')
  has('e cosa serve per uscirne', stateNote('bozza') ?? undefined, 'validalo')
  eq('un attivo non ha niente da dichiarare', stateNote('attivo'), null)
  has('un sospeso lo dice', stateNote('sospeso') ?? undefined, 'non genera più')
}

console.log(fails.length === 0
  ? `\n${ok} controlli. Tutti i controlli passano.\n`
  : `\n${fails.length} controlli falliti su ${ok + fails.length}:\n\n  ✗ ${fails.join('\n\n  ✗ ')}\n`)
process.exit(fails.length === 0 ? 0 : 1)

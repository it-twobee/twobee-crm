/**
 * Gate di `lib/f24.ts`. I due modelli sono quelli veri: il 16 luglio (941,42 €,
 * solo costo del lavoro) e il 20 agosto (10.547,24 €, IVA più ritenute).
 *
 *   npx tsx lib/f24.check.ts
 */
import { debits, credits, netDue, split, check, findings, costOf, type F24Doc, type F24Line } from './f24'

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

const l = (codice: string, kind: F24Line['kind'], amount: number, label = codice): F24Line =>
  ({ codice, kind, amount, label })

/* ── Il modello del 16 luglio: le ritenute e i contributi di giugno ──────────
   erario 246,46 · credito 107,04 · INPS 802 → 941,42 versati. Nessuna IVA: il
   1º trimestre scadeva il 16 maggio. */
const LUGLIO: F24Doc = {
  dueDate: '2026-07-16', paidOn: '2026-07-17', total: 941.42,
  lines: [
    l('1001', 'ritenute', 246.46, 'Ritenute su redditi di lavoro dipendente'),
    l('1701', 'credito', 107.04, 'Indennità L. 207/2024 recuperata'),
    l('DM10', 'inps', 802, 'Contributi INPS'),
  ],
}

/* ── Il modello del 20 agosto: due mondi nello stesso foglio ────────────────
   9.669,33 di IVA del 2º trimestre (cod. 6032) più 877,91 di ritenute e
   contributi di luglio. Dal conto sono usciti 10.547,24 al centesimo, e non
   esisteva una riga del tool che valesse quella cifra. */
const AGOSTO: F24Doc = {
  dueDate: '2026-08-20', paidOn: '2026-08-20', total: 10547.24, docRef: 'F24 20/08/2026',
  lines: [
    l('6032', 'iva', 9669.33, 'IVA 2º trimestre 2026'),
    l('1001', 'ritenute', 239.48, 'Ritenute su redditi di lavoro dipendente'),
    l('1701', 'credito', 217.57, 'Indennità L. 207/2024 recuperata'),
    l('DM10', 'inps', 856, 'Contributi INPS'),
  ],
}

// ── i totali ────────────────────────────────────────────────────────────────
eq('i debiti di luglio', debits(LUGLIO.lines), 1048.46)
eq('il credito si conta a parte', credits(LUGLIO.lines), 107.04)
eq('e il versato è la differenza', netDue(LUGLIO.lines), 941.42)
eq('il modello di agosto torna al centesimo', netDue(AGOSTO.lines), 10547.24)
eq('luglio quadra', check(LUGLIO), { ok: true })
eq('agosto quadra', check(AGOSTO), { ok: true })

// ── la divisione fra i due mondi ────────────────────────────────────────────
{
  /* È la ragione per cui il documento esiste: un movimento da 10.547,24 € non è
     un costo da 10.547,24. Contarlo intero farebbe costare diecimila euro un
     mese di stipendi (§242). */
  const s = split(AGOSTO.lines)
  eq('l\'IVA di agosto', s.vat, 9669.33)
  eq('il costo del lavoro di agosto', s.payroll, 877.91)
  eq('e insieme fanno il versato', Math.round((s.vat + s.payroll) * 100) / 100, 10547.24)
  /* Il credito abbatte il costo del lavoro, non l'IVA: è l'indennità che esce in
     busta e rientra nel modello (§235). Imputarla all'IVA farebbe pagare due
     volte una cosa che torna indietro. */
  eq('il credito scende dal costo del lavoro', split(LUGLIO.lines).payroll, 941.42)
  eq('nel modello di luglio non c\'è IVA', split(LUGLIO.lines).vat, 0)
  eq('e il costo che entra nel conto economico è solo quello', costOf(AGOSTO), 877.91)
}

// ── il totale che non torna: una riga non trascritta ────────────────────────
{
  const mutilo: F24Doc = { ...AGOSTO, lines: AGOSTO.lines.filter(x => x.codice !== 'DM10') }
  const c = check(mutilo)
  eq('senza l\'INPS non quadra', c.ok, false)
  eq('e dice di quanto', c.ok === false ? c.gap : null, 856)
  has('con la ragione', c.ok === false ? c.why : undefined, 'non sono stati trascritti')

  const vuoto = check({ dueDate: '2026-08-20', total: 100, lines: [] })
  eq('un modello senza righe non si usa', vuoto.ok, false)
  has('e lo dice', vuoto.ok === false ? vuoto.why : undefined, 'per cosa')

  /* Una riga di troppo si dice al contrario, o il messaggio manda a cercare
     qualcosa che non manca. */
  const gonfio = check({ ...AGOSTO, total: 10000 })
  has('una riga di troppo', gonfio.ok === false ? gonfio.why : undefined, 'di troppo')
}

// ── i tre confronti ─────────────────────────────────────────────────────────
{
  eq('un modello coerente non dice niente',
     findings({ doc: AGOSTO, vatDeclared: 9669.33, payrollDeclared: 877.91, moved: 10547.24 }).length, 0)

  /* §242 — la liquidazione stimata sarà **sempre** diversa dal modello: il
     registro IVA del commercialista contiene fatture che il conto economico non
     ha. Il modello vince, e la differenza resta scritta. */
  const f = findings({ doc: AGOSTO, vatDeclared: 8399.87 })
  eq('lo scarto con la stima è un\'attenzione, non un errore',
     f.find(x => x.id === 'f24-iva')?.severity, 'attenzione')
  has('e dice dove cercarlo', f.find(x => x.id === 'f24-iva')?.detail, 'fatturato del trimestre')

  /* Il conto non mente: se è uscito più del modello, quel movimento paga anche
     altro — o il modello è incompleto, e in entrambi i casi è grave. */
  eq('uscito più del modello è critico',
     findings({ doc: AGOSTO, moved: 12000 }).find(x => x.id === 'f24-banca')?.severity, 'critico')
  eq('uscito meno è un\'attenzione',
     findings({ doc: AGOSTO, moved: 9000 }).find(x => x.id === 'f24-banca')?.severity, 'attenzione')
  eq('e senza movimento non si dice niente',
     findings({ doc: AGOSTO, moved: null }).some(x => x.id === 'f24-banca'), false)

  const p = findings({ doc: AGOSTO, payrollDeclared: 941.42 })
  has('ritenute che non combaciano rimandano al cedolino',
      p.find(x => x.id === 'f24-payroll')?.detail, 'documento batte la stima')
}

console.log(fails.length === 0
  ? `\n${ok} controlli. Tutti i controlli passano.\n`
  : `\n${fails.length} controlli falliti su ${ok + fails.length}:\n\n  ✗ ${fails.join('\n\n  ✗ ')}\n`)
process.exit(fails.length === 0 ? 0 : 1)

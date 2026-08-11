'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Check, Info, Lightbulb, Lock, Clock, ArrowDownRight, ArrowUpRight, Landmark, FileDown,
  Wallet, ChevronDown, RotateCcw,
} from 'lucide-react'
import { eur } from '@/lib/money'
import { monthLabel } from '@/lib/pl'
import {
  simulate, outcomes, advice, GROUPS,
  type PlanMonth, type PlanItem, type GroupKey,
} from '@/lib/cash-plan'

/**
 * §262 — Il piano di cassa del mese.
 *
 * La tenuta di cassa dice **se** il mese regge. Questa dice **da cosa dipende**:
 * ogni fatto atteso è una riga con la sua data, e ogni riga si può spegnere.
 * Spegnere non cancella niente — dice «e se questo non succedesse» — e il saldo
 * finale si muove mentre si sceglie. È l'unico modo di rispondere alla domanda
 * vera di un mese difficile, che non è «quanto manca» ma «cosa devo far
 * succedere».
 *
 * Tre scelte di lettura, e nessuna è estetica:
 *
 *   · **Prima gli esiti, poi la lista.** Tre numeri in testa — se non incassi
 *     niente, se pagano i puntuali, se rientrano gli scaduti — perché le uscite
 *     sono certe e gli incassi no, e un totale solo farebbe sembrare un fatto
 *     una speranza (§233).
 *   · **Le leve stanno accanto al numero che cambiano.** «Rimanda i compensi»
 *     non è un consiglio in fondo alla pagina: è un pulsante che sposta il
 *     saldo di fine mese sotto gli occhi di chi lo preme.
 *   · **Quello che è già in banca non si spegne.** Ha un segno di spunta e non
 *     una casella: è un fatto, e trattarlo come un'ipotesi insegnerebbe a
 *     dubitare dei numeri veri.
 */
export function CashPlan({
  plan, month, vatHeld = 0, vatLabel = '', vatDeadline = null, bankReady, bank,
}: {
  plan: PlanMonth[]
  month: string
  vatHeld?: number
  vatLabel?: string
  vatDeadline?: string | null
  bankReady: boolean
  /** §265 — i movimenti **veri** del mese: entrato, uscito, e il saldo di adesso */
  bank?: { inflow: number; outflow: number; balance: number } | null
}) {
  const [off, setOff] = useState<Set<string>>(new Set())
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  const idx = Math.max(0, plan.findIndex(m => m.month === month))
  const cur = plan[idx]
  const sim = useMemo(() => simulate(plan, off), [plan, off])
  const t = sim[idx]
  const opening = t?.opening ?? cur?.opening ?? 0
  const o = useMemo(() => (cur ? outcomes(cur, off, opening) : null), [cur, off, opening])
  const tips = useMemo(
    () => (cur ? advice(cur, off, { vatHeld, vatLabel, opening }) : []),
    [cur, off, vatHeld, vatLabel, opening])

  if (!cur || !t || !o) return null

  const toggle = (id: string) => setOff(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const setMany = (ids: string[], spegni: boolean) => setOff(s => {
    const n = new Set(s)
    for (const id of ids) spegni ? n.add(id) : n.delete(id)
    return n
  })

  const entrate = cur.items.filter(i => i.side === 'entrata')
  const uscite = cur.items.filter(i => i.side === 'uscita')
  const attesi = entrate.filter(i => !i.inBalance && i.state !== 'mosso').map(i => i.id)
  const compensi = uscite.filter(i => i.movable).map(i => i.id)
  const touched = off.size > 0

  /* Le classi si scrivono per intero: Tailwind legge il sorgente, e una classe
     composta a runtime non finisce nel foglio di stile. */
  const tone = t.end < 0 ? 'text-error' : t.end < 2000 ? 'text-warning' : 'text-success'

  return (
    <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Wallet className="w-4 h-4 text-gold-text" />
            Piano di cassa · {monthLabel(cur.month)}
          </h2>
          <p className="text-2xs text-text-tertiary mt-0.5 max-w-xl">
            Tutto quello che in questo mese deve entrare e uscire, voce per voce.
            Spegni una riga per vedere cosa succede senza: il saldo di fine mese si muove,
            e i mesi dopo con lui.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* §268 — il report per il consiglio. Si apre in una scheda e da lì il
              browser lo salva in PDF: un documento identico su ogni macchina,
              senza portarsi dietro un motore di stampa. */}
          <a href={`/api/prospetto?m=${cur.month}`} target="_blank" rel="noopener"
            className="flex items-center gap-1.5 text-2xs font-bold bg-gold text-on-gold rounded-xl px-3 py-2 press">
            <FileDown className="w-3.5 h-3.5" />Report per il board
          </a>
        {touched && (
          <button onClick={() => setOff(new Set())}
            className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2
                       text-text-secondary hover:text-text-primary hover:bg-surface-hover press shrink-0">
            <RotateCcw className="w-3.5 h-3.5" />Rimetti tutto
          </button>
        )}
        </div>
      </div>

      {/* ── i tre esiti, prima della lista ────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border border-b border-border">
        <Esito title="Se non incassi niente" value={o.floor}
          hint="quello che è già in banca meno tutto quello che esce: l'unico numero che dipende da te" />
        <Esito title="Se pagano i puntuali" value={o.expected}
          hint="le fatture ancora nei termini: chi paga di solito paga" />
        <Esito title="Se rientrano gli scaduti" value={o.best}
          hint="quelli non arrivano da soli: è una telefonata, non una previsione" />
      </div>

      {/* ── il saldo del modello ──────────────────────────────────────────── */}
      <div className="px-5 py-4 flex items-end justify-between gap-4 flex-wrap bg-surface-hover/40">
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-2xs text-text-tertiary">
          {/* §263 — il punto di partenza è il **saldo vero**, quello che si legge
              in Banca: contiene anche i movimenti che nessuna riga giustifica, ed
              è per questo che è quello giusto. Da lì si somma solo quello che
              deve ancora succedere. */}
          <span className="inline-flex items-baseline gap-1.5">
            <Landmark className="w-3.5 h-3.5 self-center text-text-tertiary" />
            {cur.anchor ? 'In banca adesso' : 'Saldo a inizio mese'}
            <strong className="text-text-primary tabular text-sm">{eur(opening)}</strong>
          </span>
          {/* §284 — quello che è stato spuntato e che l'estratto conto non ha
              ancora visto. Non è una speranza: il bonifico l'ha visto una
              persona sull'home banking. Sta accanto al saldo perché è il numero
              che spiega la differenza fra i due. */}
          {(t.declaredIn > 0 || t.declaredOut > 0) && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-text-tertiary">·</span>
              spuntati e non ancora in estratto conto
              {t.declaredIn > 0 && <span className="text-success">+{eur(t.declaredIn)}</span>}
              {t.declaredOut > 0 && <span className="text-error">−{eur(t.declaredOut)}</span>}
              <span className="text-text-tertiary">→ contati come</span>
              <strong className="text-text-primary tabular">
                {eur(opening + t.declaredIn - t.declaredOut)}
              </strong>
            </span>
          )}
          <span className="text-success">+ {eur(t.inflow)} da incassare</span>
          <span className="text-error">− {eur(t.outflow)} da pagare</span>
          {touched && (
            <span className="text-warning">
              fuori dal modello: {eur(t.offIn)} in entrata · {eur(t.offOut)} in uscita
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xs text-text-tertiary">Saldo a fine mese</p>
          <p className={`text-2xl font-bold tabular leading-tight ${tone}`}>{eur(t.end)}</p>
        </div>
      </div>

      {/* ── le leve: stanno accanto al numero che cambiano ────────────────── */}
      <div className="px-5 py-3 border-y border-border flex items-center gap-2 flex-wrap">
        <span className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider mr-1">Prova a</span>
        {compensi.length > 0 && (
          <Leva on={compensi.every(id => off.has(id))}
            onClick={() => setMany(compensi, !compensi.every(id => off.has(id)))}
            label="rimandare i compensi"
            amount={uscite.filter(i => i.movable).reduce((s, i) => s + i.gross, 0)} />
        )}
        {attesi.length > 0 && (
          <Leva on={attesi.every(id => off.has(id))}
            onClick={() => setMany(attesi, !attesi.every(id => off.has(id)))}
            label="non incassare niente"
            amount={entrate.filter(i => !i.inBalance && i.state !== 'mosso').reduce((s, i) => s + i.gross, 0)} />
        )}
        {entrate.some(i => i.state === 'scaduto') && (
          <Leva on={entrate.filter(i => i.state === 'scaduto').every(i => off.has(i.id))}
            onClick={() => {
              const ids = entrate.filter(i => i.state === 'scaduto').map(i => i.id)
              setMany(ids, !ids.every(id => off.has(id)))
            }}
            label="perdere gli scaduti"
            amount={entrate.filter(i => i.state === 'scaduto').reduce((s, i) => s + i.gross, 0)} />
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] divide-y lg:divide-y-0 lg:divide-x divide-border">
        <div>
          <Side title="Entrate" side="entrata" items={entrate} off={off} onToggle={toggle}
            open={openGroups} setOpen={setOpenGroups} total={t.inflow} accrual={t.accrualIn} />
          <Side title="Uscite" side="uscita" items={uscite} off={off} onToggle={toggle}
            open={openGroups} setOpen={setOpenGroups} total={t.outflow} accrual={t.accrualOut} />
        </div>

        <div className="p-4 space-y-3 bg-surface-hover/30">
          <h3 className="text-2xs font-bold uppercase tracking-wider text-text-tertiary flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" />Cosa puoi fare
          </h3>
          {tips.map(a => (
            <div key={a.key} className={`rounded-xl border p-3 ${
              a.kind === 'leva' ? 'border-gold/40 bg-gold-dim/20'
                : a.kind === 'vincolo' ? 'border-warning/40 bg-warning/10'
                : 'border-border bg-surface'}`}>
              <p className="text-2xs font-bold text-text-primary">{a.title}</p>
              <p className="text-2xs text-text-secondary mt-1 leading-relaxed">{a.detail}</p>
            </div>
          ))}

          {/* Il mese non finisce col mese: se agosto si chiude togliendo qualcosa,
              quel qualcosa ricompare a settembre. La striscia lo mostra invece di
              lasciarlo scoprire fra trenta giorni. */}
          {plan.length > 1 && (
            <div className="pt-1">
              <h3 className="text-2xs font-bold uppercase tracking-wider text-text-tertiary mb-2">
                Come prosegue sul conto
              </h3>
              {/* §266 — il previsionale è **sul conto**, non sul margine: parte
                  dal saldo vero e mese per mese somma quello che si muove. Il
                  margine di competenza è un'altra domanda e sta nel prospetto,
                  qui sotto. */}
              <ul className="space-y-1">
                {sim.map(s2 => (
                  <li key={s2.month} className={`px-2 py-1 rounded-lg ${
                    s2.month === month ? 'bg-surface border border-border' : ''}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-2xs text-text-secondary truncate">{monthLabel(s2.month)}</span>
                      <span className={`text-2xs tabular font-semibold ${
                        s2.end < 0 ? 'text-error' : 'text-text-primary'}`}>{eur(s2.end)}</span>
                    </div>
                    <div className="flex items-baseline gap-2 text-2xs text-text-tertiary tabular">
                      <span className="text-success">+{eur(s2.inflow)}</span>
                      <span className="text-error">−{eur(s2.outflow)}</span>
                      <span className={s2.net < 0 ? 'text-error' : 'text-success'}>
                        {s2.net < 0 ? '' : '+'}{eur(s2.net)} nel mese
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* §265 — il riscontro con la banca sta **qui**, dove c'è il saldo.
              Era in due blocchi a parte che dicevano «saldo a inizio mese 0 €» e
              «sul conto adesso 10.568 €» — numeri calcolati sulla sola finestra
              del prospetto, quindi diversi da quelli veri: due cose con lo stesso
              nome e valori diversi sono peggio di una cosa sola. */}
          {bank && (
            <div className="pt-1">
              <h3 className="text-2xs font-bold uppercase tracking-wider text-text-tertiary mb-2">
                E in banca, in questo mese
              </h3>
              <ul className="space-y-1 text-2xs">
                <li className="flex items-baseline justify-between gap-2">
                  <span className="text-text-secondary">Entrato davvero</span>
                  <span className="tabular text-success">{eur(bank.inflow)}</span>
                </li>
                <li className="flex items-baseline justify-between gap-2">
                  <span className="text-text-secondary">Uscito davvero</span>
                  <span className="tabular text-error">−{eur(bank.outflow)}</span>
                </li>
                <li className="flex items-baseline justify-between gap-2 pt-1 border-t border-border">
                  <span className="text-text-secondary">Le righe spuntate dicono</span>
                  <span className="tabular text-text-primary">
                    {eur(t.alreadyIn)} · −{eur(t.alreadyOut)}
                  </span>
                </li>
                {(() => {
                  /* La differenza non è un arrotondamento: è un movimento che
                     nessuna riga giustifica, o una spunta su qualcosa che dal
                     conto non è uscito. Il ponte (§199) dice quale delle due. */
                  const gap = Math.round((
                    (bank.inflow - bank.outflow) - (t.alreadyIn - t.alreadyOut)) * 100) / 100
                  if (Math.abs(gap) < 1) {
                    return (
                      <li className="text-success flex items-start gap-1.5">
                        <Check className="w-3 h-3 shrink-0 mt-0.5" />
                        Tutto quello che si è mosso ha una riga dietro.
                      </li>
                    )
                  }
                  return (
                    <li className="text-warning flex items-start gap-1.5">
                      <Info className="w-3 h-3 shrink-0 mt-0.5" />
                      <span>
                        <strong>{eur(Math.abs(gap))}</strong> non hanno un nome: movimenti che
                        nessuna riga giustifica, o spunte che dal conto non sono uscite.
                        {' '}<Link href="/economics/banca" className="text-gold-text hover:underline">
                          Il ponte, in Banca
                        </Link>, dice quale delle due.
                      </span>
                    </li>
                  )
                })()}
              </ul>
            </div>
          )}

          {!bankReady && (
            <p className="flex items-start gap-2 text-2xs text-text-tertiary">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Senza le tabelle di banca il saldo di partenza è zero: il piano dice
              quanto entra e quanto esce, non dove arrivi.
            </p>
          )}
          {vatHeld > 0 && vatDeadline && (
            <p className="flex items-start gap-2 text-2xs text-text-tertiary">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {vatLabel}: {eur(vatHeld)} da versare il{' '}
              {new Date(vatDeadline + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}.
              Sono soldi dei clienti che stanno sul conto, non capitale.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function Esito({ title, value, hint }: { title: string; value: number; hint: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-2xs text-text-tertiary">{title}</p>
      <p className={`text-xl font-bold tabular leading-tight mt-0.5 ${
        value < 0 ? 'text-error' : 'text-text-primary'}`}>{eur(value)}</p>
      <p className="text-2xs text-text-tertiary mt-1 leading-snug">{hint}</p>
    </div>
  )
}

function Leva({ on, onClick, label, amount }: {
  on: boolean; onClick: () => void; label: string; amount: number
}) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`text-2xs font-semibold rounded-xl px-3 py-1.5 border press whitespace-nowrap ${
        on ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:bg-surface-hover'}`}>
      {label} <span className="tabular opacity-70">{eur(amount)}</span>
    </button>
  )
}

/**
 * Un lato della cassa. Le voci stanno **raggruppate per macro** e ordinate per
 * data: la domanda che si fa scorrendo è «cosa mi aspetta il 20», non «quanto
 * pesa il software».
 */
/**
 * §266 — L'elenco è **quello che resta da fare in questo mese**.
 *
 * Con tutte le righe del conto economico dentro, agosto ne aveva sessanta e
 * quaranta erano già in banca: per trovare le cinque su cui si può ancora agire
 * bisognava leggerle tutte. La lista di default mostra solo quelle che devono
 * ancora muoversi — **ritardi compresi**, che sono le prime da guardare — e le
 * altre restano dietro una riga che dice quante sono e perché non ci sono.
 *
 * I **totali** invece non si alleggeriscono: quello di competenza deve
 * continuare a combaciare col conto economico del mese (§264), o la sezione
 * direbbe un numero che quella pagina non conferma.
 */
function Side({ title, side, items, off, onToggle, open, setOpen, total, accrual }: {
  title: string
  side: 'entrata' | 'uscita'
  items: PlanItem[]
  off: Set<string>
  onToggle: (id: string) => void
  open: Set<string>
  setOpen: (s: Set<string>) => void
  /** quello che si muove **in questo mese**: è la cassa */
  total: number
  /** §264 — le righe del conto economico di questo mese, pagate o no */
  accrual: number
}) {
  const [tutte, setTutte] = useState(false)
  /* §267 — quello che è già nel saldo **non si mostra**. È un fatto chiuso: sta
     in banca, non si può spegnere e non c'è niente da farci. Tenerlo in elenco
     allungava agosto di trentaquattro righe per nascondere le cinque su cui si
     può ancora agire. Resta nei **totali** di competenza, che devono continuare
     a combaciare col conto economico (§264): quello che sparisce è la riga, non
     il numero. */
  const resta = items.filter(i => i.movesIn && !i.inBalance)
  /* Di questo mese ma in scadenza dopo: non fa cassa adesso, però è nel totale
     di competenza — e allora deve poterla vedere chi si chiede da dove esce. */
  const fuori = items.filter(i => !i.inBalance && !i.movesIn)
  const mostrati = tutte ? [...resta, ...fuori] : resta
  const groups = Array.from(new Set(mostrati.map(i => i.group))) as GroupKey[]
  const sumOf = (g: GroupKey) => items
    .filter(i => i.group === g && !off.has(i.id) && !i.inBalance && i.movesIn)
    .reduce((s, i) => s + i.gross, 0)


  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-surface-hover/60">
        <h3 className="text-2xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
          {side === 'entrata'
            ? <ArrowDownRight className="w-3.5 h-3.5 text-success" />
            : <ArrowUpRight className="w-3.5 h-3.5 text-error" />}
          {title}
        </h3>
        {/* §264 — due numeri, perché sono due domande. «Di competenza» è quello
            che si legge nel conto economico di questo mese, pagato o no, e deve
            combaciare riga per riga. «Si muove adesso» è la cassa, e comprende
            gli arretrati e non comprende quello che esce il mese prossimo. */}
        <span className="flex items-baseline gap-4 text-right">
          <span className="text-text-tertiary text-2xs">
            di competenza
            <span className="block text-sm font-semibold text-text-primary tabular">{eur(accrual)}</span>
          </span>
          <span className={`text-2xs ${side === 'entrata' ? 'text-success' : 'text-error'}`}>
            si muove adesso
            <span className="block text-sm font-bold tabular">{eur(total)}</span>
          </span>
        </span>
      </div>

      {mostrati.length === 0 ? (
        <p className="px-5 py-4 text-2xs text-text-tertiary">
          Niente da {side === 'entrata' ? 'incassare' : 'pagare'} in questo mese: quello che c&apos;era
          è già passato dal conto ed è dentro il saldo qui sopra.
        </p>
      ) : groups.map(g => {
        const own = mostrati.filter(i => i.group === g)
        const chiuso = open.has(`${side}:${g}`)
        return (
          <div key={g} className="border-t border-border/60">
            <button type="button"
              onClick={() => {
                const n = new Set(open); const k = `${side}:${g}`
                n.has(k) ? n.delete(k) : n.add(k); setOpen(n)
              }}
              className="w-full flex items-center justify-between gap-3 px-5 py-2 hover:bg-surface-hover text-left">
              <span className="flex items-center gap-1.5 text-2xs font-semibold text-text-secondary">
                <ChevronDown className={`w-3 h-3 transition-transform ${chiuso ? '-rotate-90' : ''}`} />
                {GROUPS[g]}
                <span className="text-text-tertiary font-normal">· {own.length}</span>
              </span>
              <span className="text-2xs tabular font-semibold text-text-primary">{eur(sumOf(g))}</span>
            </button>
            {!chiuso && (
              <ul>
                {own.map(i => <Row key={i.id} item={i} off={off.has(i.id)} onToggle={onToggle} />)}
              </ul>
            )}
          </div>
        )
      })}

      {/* Quello che non è nell'elenco si dice, con quante sono e perché: una
          riga che sparisce senza spiegazione è una riga che qualcuno va a
          cercare da un'altra parte. */}
      {fuori.length > 0 && (
        <button type="button" onClick={() => setTutte(t2 => !t2)}
          className="w-full text-left px-5 py-2 border-t border-border/60 text-2xs text-text-tertiary
                     hover:bg-surface-hover hover:text-text-secondary">
          {tutte
            ? `Nascondi le ${fuori.length} voci che in questo mese non si muovono`
            : <>
                Altre <strong className="text-text-secondary">{fuori.length}</strong> voci di questo mese
                {' '}per <strong className="text-text-secondary">
                  {eur(fuori.reduce((n, i) => n + i.gross, 0))}</strong>: sono nel totale di competenza
                {' '}ma escono più avanti — mostrale
              </>}
        </button>
      )}
    </div>
  )
}

const STATE_CHIP: Record<PlanItem['state'], { label: string; cls: string }> = {
  mosso: { label: 'in banca', cls: 'text-success bg-success-dim' },
  atteso: { label: 'in scadenza', cls: 'text-info bg-info-dim' },
  scaduto: { label: 'scaduto', cls: 'text-error bg-error-dim' },
  stimato: { label: 'stimato', cls: 'text-warning bg-warning-dim' },
}

function Row({ item, off, onToggle }: { item: PlanItem; off: boolean; onToggle: (id: string) => void }) {
  const chip = STATE_CHIP[item.state]
  /* Quello che è già passato dal conto non è un'ipotesi: ha una spunta, non una
     casella. Renderlo spegnibile insegnerebbe a dubitare dei numeri veri, e
     spegnerlo non cambierebbe niente — è già dentro il saldo (§263). */
  /* Una voce che in questo mese non muove un euro non si spegne: spegnerla non
     cambierebbe il saldo, e una casella che non fa niente è peggio di nessuna. */
  /* Una dichiarata **si può spegnere**: è l'unica «mossa» che potrebbe non
     essere vera, ed è esattamente la domanda che questo modello serve a fare. */
  const fisso = (item.state === 'mosso' && !item.declared) || (!item.movesIn && !item.declared)

  return (
    <li className={`flex items-baseline gap-3 px-5 py-2 hover:bg-surface-hover ${off ? 'opacity-45' : ''}`}>
      {fisso ? (
        <span className="w-4 h-4 shrink-0 self-center rounded-md bg-success-dim flex items-center justify-center"
          title="già passato dal conto: non è un'ipotesi">
          <Check className="w-3 h-3 text-success" />
        </span>
      ) : (
        <button type="button" onClick={() => onToggle(item.id)} role="checkbox" aria-checked={!off}
          aria-label={`${off ? 'Rimetti' : 'Togli'} ${item.label} dal modello`}
          className={`w-4 h-4 shrink-0 self-center rounded-md border press flex items-center justify-center ${
            off ? 'border-border-strong' : 'bg-gold border-gold'}`}>
          {!off && <Check className="w-3 h-3 text-on-gold" />}
        </button>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-2xs font-semibold text-text-primary truncate">
          {item.label}
          {item.who && <span className="font-normal text-text-tertiary"> · {item.who}</span>}
        </p>
        <p className="text-2xs text-text-tertiary flex items-center gap-1.5 flex-wrap">
          <span className={`px-1.5 py-0.5 rounded-md ${
            item.declared ? 'text-warning bg-warning-dim'
              : !item.movesIn && !item.inBalance ? 'text-text-tertiary bg-surface-active' : chip.cls}`}>
            {item.inBalance ? 'già nel saldo'
              /* §284 — spuntata da una persona, non ancora vista dalla banca:
                 conta nel saldo e resta riconoscibile finché l'estratto conto
                 non la conferma (§226). */
              : item.declared ? 'spuntata, non in estratto conto'
              : !item.movesIn ? 'non in questo mese' : chip.label}
          </span>
          <span>{giorno(item.due)}</span>
          <span>· {item.why}</span>
          {item.movable && (
            <span className="inline-flex items-center gap-1 text-gold-text">
              <Clock className="w-3 h-3" />si può spostare
            </span>
          )}
          {item.group === 'iva' && (
            <span className="inline-flex items-center gap-1 text-warning">
              <Lock className="w-3 h-3" />non si sposta
            </span>
          )}
        </p>
      </div>

      <span className={`text-2xs tabular font-semibold shrink-0 ${
        off ? 'line-through text-text-tertiary'
          : item.side === 'entrata' ? 'text-success' : 'text-text-primary'}`}>
        {eur(item.gross)}
      </span>
    </li>
  )
}

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const giorno = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESI[(m ?? 1) - 1]}`
}

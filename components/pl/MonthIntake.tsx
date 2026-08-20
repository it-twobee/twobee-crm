'use client'

/**
 * I movimenti che il mese non spiega, uno per uno. (§303)
 *
 * «Porta le spese del conto nel mese» scriveva righe **senza chiedere niente**,
 * e le doppie di questa estate sono nate tutte lì: «Affinity (2 addebiti)
 * 5.100 €» accanto ai due subappalti che quei bonifici pagavano, «Beneficiari
 * Vari Distinta» accanto alle tre righe del personale.
 *
 * Non era disattenzione: **una riga nuova era l'unica risposta che quel gesto
 * sapeva dare.** Qui le risposte sono tre e la prima è quella giusta quasi
 * sempre — *accorpa* a una riga che c'è, *aggiungi* solo dove a piano non ci
 * sarà mai, *ignora* quando non c'è niente da spiegare.
 *
 * Due regole nell'interfaccia, e sono la stessa cosa vista da due lati:
 *
 *   · **quelli senza dubbio si confermano in blocco** — importo esatto e
 *     controparte che torna, una riga sola possibile: chiederne venti conferme
 *     separate è il modo in cui non se ne conferma nessuna;
 *   · **gli altri no, e ognuno porta il perché** — «due righe hanno questo
 *     importo», «il nome non lo conferma». Una conferma in blocco su casi ambigui
 *     è il modo in cui si sbaglia venti volte (§276).
 */

import { useMemo, useState } from 'react'
import { X, Check, Plus, Link2, EyeOff, AlertTriangle, Loader2, Pencil, Lock } from 'lucide-react'
import { eur2 } from '@/lib/money'
import { monthLabel } from '@/lib/pl'
import type { Intake, IntakeSummary } from '@/lib/month-intake'
import type { IntakeDecision } from '@/app/actions/month-intake'

type Scelta = 'accorpa' | 'correggi' | 'aggiungi' | 'ignora' | 'dopo'

const AZIONE: Record<Exclude<Scelta, 'dopo'>, { label: string; icon: typeof Link2 }> = {
  accorpa: { label: 'accorpa', icon: Link2 },
  correggi: { label: 'correggi', icon: Pencil },
  aggiungi: { label: 'riga nuova', icon: Plus },
  ignora: { label: 'ignora', icon: EyeOff },
}

export function MonthIntake({ rows, summary, month, pending, onClose, onApply, months, onMonth }: {
  rows: Intake[]
  summary: IntakeSummary
  month: string
  pending: boolean
  onClose: () => void
  onApply: (d: IntakeDecision[]) => void
  /** §307 — quanti movimenti non spiega ogni mese: il lavoro arretrato si vede da qui */
  months?: { month: string; status: string; movimenti: number; importo: number }[]
  onMonth?: (m: string) => void
}) {
  /* Si parte da quello che il motore propone, non da «niente scelto»: la
     proposta è il lavoro già fatto, e farla riconfermare voce per voce
     equivarrebbe a non averla. Quello che una persona cambia, resta cambiato. */
  const [scelte, setScelte] = useState<Record<string, Scelta>>({})
  const [soloDubbi, setSoloDubbi] = useState(false)

  const sceltaDi = (r: Intake): Scelta => scelte[r.tx.id] ?? r.action
  const visibili = useMemo(
    () => soloDubbi ? rows.filter(r => !r.sure) : rows, [rows, soloDubbi])

  const decisioni = useMemo((): IntakeDecision[] => {
    const out: IntakeDecision[] = []
    for (const r of rows) {
      const s = sceltaDi(r)
      if (s === 'dopo') continue
      if (s === 'ignora') { out.push({ txId: r.tx.id, action: 'ignora' }); continue }
      if (s === 'accorpa') {
        if (r.line) out.push({ txId: r.tx.id, action: 'accorpa', lineId: r.line.id, amount: r.line.amount })
        continue
      }
      if (s === 'correggi') {
        if (r.line?.newGross != null) {
          out.push({ txId: r.tx.id, action: 'correggi', lineId: r.line.id,
            amount: r.line.amount, newGross: r.line.newGross })
        }
        continue
      }
      out.push({
        txId: r.tx.id, action: 'aggiungi',
        label: r.draft?.label ?? r.tx.description.slice(0, 40),
        category: r.draft?.category ?? 'Spese fuori piano',
      })
    }
    return out
  }, [rows, scelte])

  const quanti = (s: Scelta) => decisioni.filter(d => d.action === s).length

  return (
    <div className="fixed inset-0 z-50 bg-scrim flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      role="dialog" aria-modal="true" aria-labelledby="intake-title">
      <div className="bg-surface border border-border rounded-2xl shadow-soft w-full max-w-3xl my-auto">

        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="intake-title" className="text-sm font-bold text-text-primary">
                {rows.length} movimenti che questo mese non spiega
              </h2>
              <p className="text-2xs text-text-tertiary mt-0.5 max-w-xl leading-relaxed">
                Per ognuno c&apos;è già una proposta. <strong className="text-text-secondary">Accorpa</strong> quando
                una riga esiste e questo movimento la paga — è la risposta giusta quasi sempre, e prima non
                c&apos;era: una riga nuova era l&apos;unica cosa che il tool sapeva fare, ed è così che i
                costi si sono contati due volte.
              </p>
            </div>
            <button onClick={onClose} aria-label="Chiudi"
              className="text-text-tertiary hover:text-text-primary shrink-0">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* §307 — **gli altri mesi.** Il dialogo apriva su uno e taceva sugli
              altri, quindi il lavoro arretrato di luglio non si vedeva da
              agosto: bisognava cambiare mese in cima alla pagina per scoprire se
              ce n'era. I mesi chiusi ci sono e sono spenti — non si toccano, ma
              sapere che contengono qualcosa è il motivo per cui uno decide di
              riaprirli. */}
          {months && months.filter(m => m.movimenti > 0).length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-3">
              <span className="text-2xs text-text-tertiary shrink-0">mesi:</span>
              {months.filter(m => m.movimenti > 0 || m.month === month).map(m => {
                const on = m.month === month
                const chiuso = m.status === 'chiuso'
                return (
                  <button key={m.month} disabled={chiuso || on || pending}
                    onClick={() => onMonth?.(m.month)}
                    title={chiuso
                      ? `${monthLabel(m.month)} è chiuso: è una fotografia. Riaprilo per lavorarci.`
                      : `${m.movimenti} da spiegare per ${eur2(m.importo)}`}
                    className={`inline-flex items-baseline gap-1 text-2xs font-semibold px-2 py-0.5 rounded-lg border
                      press disabled:cursor-not-allowed ${on
                        ? 'border-gold bg-gold text-on-gold'
                        : chiuso ? 'border-border text-text-tertiary opacity-60'
                        : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}>
                    {chiuso && <Lock className="w-2.5 h-2.5 self-center" aria-hidden="true" />}
                    {monthLabel(m.month).split(' ')[0].toLowerCase()}
                    <span className={on ? 'opacity-80' : 'text-text-tertiary'}>{m.movimenti}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap mt-3">
            <span className="text-2xs px-2 py-0.5 rounded-lg border border-border text-text-secondary">
              da spiegare <b className="tabular text-text-primary">{eur2(summary.scoperto)}</b>
            </span>
            {summary.certi > 0 && (
              <span className="text-2xs px-2 py-0.5 rounded-lg border border-success text-success bg-success-dim">
                <b className="tabular">{summary.certi}</b> senza dubbio · {eur2(summary.certiTotale)}
              </span>
            )}
            {rows.some(r => !r.sure) && (
              <button onClick={() => setSoloDubbi(v => !v)}
                className={`text-2xs px-2 py-0.5 rounded-lg border press ${soloDubbi
                  ? 'border-gold text-gold-text bg-gold-dim' : 'border-border text-text-secondary'}`}>
                {soloDubbi ? 'mostra tutti' : `guarda solo i ${rows.filter(r => !r.sure).length} da decidere`}
              </button>
            )}
          </div>
        </div>

        <ul className="max-h-[26rem] overflow-y-auto divide-y divide-border/60">
          {visibili.map(r => {
            const s = sceltaDi(r)
            return (
              <li key={r.tx.id} className={s === 'dopo' ? 'opacity-50' : ''}>
                <div className="px-5 py-2.5">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-2xs text-text-tertiary tabular shrink-0">
                      {r.tx.booked_on.slice(8, 10)}/{r.tx.booked_on.slice(5, 7)}
                    </span>
                    <span className="text-2xs font-semibold text-text-primary flex-1 min-w-[160px] truncate">
                      {r.tx.counterparty ?? r.tx.description.slice(0, 48)}
                    </span>
                    <span className="text-2xs font-bold tabular text-text-primary shrink-0">
                      {eur2(r.free)}
                    </span>
                    {r.sure && (
                      <span className="text-2xs text-success shrink-0" title="Nessun dubbio: si conferma in blocco">
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      </span>
                    )}
                  </div>

                  {/* la proposta, e cosa diventa se la si cambia */}
                  <div className="flex items-baseline gap-2 flex-wrap mt-1">
                    <span className="flex gap-1 shrink-0">
                      {(['accorpa', 'correggi', 'aggiungi', 'ignora'] as const).map(k => {
                        const on = s === k
                        const Icona = AZIONE[k].icon
                        const puo = k === 'accorpa' ? !!r.line
                          : k === 'correggi' ? r.line?.newGross != null
                          : true
                        return (
                          <button key={k} disabled={!puo}
                            onClick={() => setScelte(p => ({ ...p, [r.tx.id]: k }))}
                            aria-pressed={on}
                            title={!puo ? (k === 'accorpa'
                              ? 'Nessuna riga che questo movimento possa pagare'
                              : 'Nessuna riga da correggere: non ce n\'è una con questa controparte') : undefined}
                            className={`inline-flex items-center gap-1 text-2xs font-semibold px-1.5 py-0.5 rounded border press
                              disabled:opacity-30 disabled:cursor-not-allowed ${on
                                ? 'border-gold bg-gold text-on-gold'
                                : 'border-border text-text-secondary hover:text-text-primary'}`}>
                            <Icona className="w-3 h-3" aria-hidden="true" />{AZIONE[k].label}
                          </button>
                        )
                      })}
                      <button onClick={() => setScelte(p => ({ ...p, [r.tx.id]: 'dopo' }))}
                        aria-pressed={s === 'dopo'}
                        title="Lascialo dov'è: tornerà in questa lista la prossima volta"
                        className={`text-2xs font-semibold px-1.5 py-0.5 rounded border press ${s === 'dopo'
                          ? 'border-border-strong bg-surface-active text-text-primary'
                          : 'border-border text-text-tertiary hover:text-text-secondary'}`}>
                        dopo
                      </button>
                    </span>

                    <span className="text-2xs text-text-tertiary flex-1 min-w-[200px]">
                      {s === 'accorpa' && r.line && (
                        <>
                          → <b className="text-text-secondary">{r.line.label}</b>
                          {' '}per {eur2(r.line.amount)}
                          {!r.line.closes && <span className="text-warning"> · non la chiude</span>}
                        </>
                      )}
                      {s === 'correggi' && r.line?.newGross != null && (
                        <>
                          → <b className="text-text-secondary">{r.line.label}</b>
                          {' '}sale a {eur2(r.line.newGross)} e prende {eur2(r.line.amount)}
                        </>
                      )}
                      {s === 'aggiungi' && (
                        <>→ riga nuova in <b className="text-text-secondary">{r.draft?.category}</b></>
                      )}
                      {s === 'ignora' && <>→ fuori dalla lista, niente da abbinare</>}
                      {s === 'dopo' && <>→ resta qui, lo guardi la prossima volta</>}
                    </span>
                  </div>

                  {/* Il perché sta sotto la proposta, non in un aiuto: è quello che
                      distingue un caso certo da uno che va guardato. */}
                  {!r.sure && (
                    <p className="flex items-start gap-1.5 text-2xs text-text-tertiary mt-1">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-warning" aria-hidden="true" />
                      {r.why}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <div className="px-5 py-4 border-t border-border flex items-center gap-3 flex-wrap">
          <p className="text-2xs text-text-secondary flex-1 min-w-[220px]">
            {quanti('accorpa')} da accorpare · {quanti('correggi')} da correggere
            {' · '}{quanti('aggiungi')} righe nuove · {quanti('ignora')} ignorati
            {rows.length - decisioni.length > 0 && (
              <span className="text-text-tertiary"> · {rows.length - decisioni.length} lasciati a dopo</span>
            )}
          </p>
          <div className="flex items-center gap-2 ml-auto">
            {summary.certi > 0 && summary.certi < rows.length && (
              <button disabled={pending}
                onClick={() => onApply(rows.filter(r => r.sure && r.line)
                  .map(r => ({ txId: r.tx.id, action: 'accorpa' as const, lineId: r.line!.id, amount: r.line!.amount })))}
                className="text-2xs font-semibold px-3 py-2 rounded-xl border border-success text-success
                           hover:bg-success-dim press disabled:opacity-40 whitespace-nowrap">
                Solo i {summary.certi} senza dubbio
              </button>
            )}
            <button onClick={onClose}
              className="text-2xs font-semibold px-3 py-2 rounded-xl border border-border
                         text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              Annulla
            </button>
            <button disabled={pending || !decisioni.length}
              onClick={() => onApply(decisioni)}
              className="inline-flex items-center gap-1.5 text-2xs font-semibold px-3.5 py-2 rounded-xl
                         bg-gold text-on-gold press disabled:opacity-40 whitespace-nowrap">
              {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              Applica {decisioni.length}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

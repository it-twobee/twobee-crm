'use client'

/**
 * Spartire un movimento fra più righe. (§297)
 *
 * È la porta che mancava. Con un campo solo, un bonifico cumulativo aveva una
 * sola risposta possibile — «niente da abbinare» — e da lì i 6.029 € che il
 * ponte (§199) non sa spiegare. Qui si sceglie riga per riga e si vede
 * **mentre** si sceglie quanto del movimento resta da spiegare: scoprire di aver
 * sforato dopo aver premuto è scoprirlo troppo tardi, perché a quel punto la
 * decisione è già stata presa e va disfatta.
 *
 * Tre cose che l'interfaccia deve dire, e sono le tre che un elenco di caselle
 * non direbbe:
 *
 *   · **quanto resta** del movimento, in cima e sempre visibile;
 *   · **quanto manca** a una riga che il movimento non copre — l'acconto
 *     Affinity di luglio prende 2.100 su 2.562, e senza quel numero sembra
 *     saldato;
 *   · **cosa avanza**, se avanza. Inventare una destinazione per far tornare il
 *     conto è il modo in cui un registro smette di servire.
 */

import { useMemo, useState } from 'react'
import { X, Check, AlertTriangle } from 'lucide-react'
import { grossOf, type BankTx, type PlLineRef } from '@/lib/bank'
import { propose, validate, type AllocDraft, type Candidate } from '@/lib/allocations'
import { eur2 } from '@/lib/money'

export function AllocateDialog({ tx, lines, monthLabel, pending, onClose, onConfirm }: {
  tx: BankTx
  /** le righe aperte del verso giusto: un'uscita non paga un ricavo */
  lines: PlLineRef[]
  monthLabel: (m: string) => string
  pending: boolean
  onClose: () => void
  onConfirm: (drafts: AllocDraft[]) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [manual, setManual] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')

  const verso = tx.amount > 0 ? 'in' : 'out'
  const disponibili = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return lines
      .filter(l => l.direction === verso)
      .filter(l => !needle || l.label.toLowerCase().includes(needle)
        || (l.clientName ?? '').toLowerCase().includes(needle))
      .sort((a, b) => a.month.localeCompare(b.month) || b.net - a.net)
  }, [lines, verso, q])

  const byId = useMemo(() => new Map(disponibili.map(l => [l.id, l])), [disponibili])

  /* La proposta la fa il motore: ogni riga prende il suo scoperto finché il
     movimento tiene, nell'ordine in cui è stata scelta. Un importo scritto a
     mano vince, perché chi ha la fattura davanti sa qualcosa che il tool no. */
  const scelte: Candidate[] = picked
    .map(id => byId.get(id))
    .filter((l): l is PlLineRef => !!l)
    .map(l => ({
      target: (l.direction === 'in' ? 'ricavo' : 'costo') as Candidate['target'],
      targetId: l.id, label: l.label, remaining: grossOf(l),
    }))

  const auto = propose({ id: tx.id, amount: tx.amount, source: tx.source }, [], scelte)
  const drafts: AllocDraft[] = auto.drafts.map(d => {
    const scritto = manual[d.targetId]
    const n = scritto === undefined || scritto === '' ? null : Number(scritto.replace(',', '.'))
    return n != null && Number.isFinite(n) && n > 0 ? { ...d, amount: Math.round(n * 100) / 100 } : d
  })

  const v = validate({ id: tx.id, amount: tx.amount, source: tx.source }, [], drafts)
  const totale = drafts.reduce((s, d) => s + d.amount, 0)
  const resta = Math.round((Math.abs(tx.amount) - totale) * 100) / 100

  return (
    <div className="fixed inset-0 z-50 bg-scrim flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      role="dialog" aria-modal="true" aria-labelledby="alloc-title">
      <div className="bg-surface border border-border rounded-2xl shadow-soft w-full max-w-2xl my-auto">

        {/* ── il movimento, e quanto ne resta ── */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="alloc-title" className="text-sm font-bold text-text-primary">
                Spartisci questo movimento
              </h2>
              <p className="text-2xs text-text-tertiary mt-0.5 truncate">
                {new Date(tx.booked_on).toLocaleDateString('it-IT')} ·{' '}
                {tx.counterparty ?? tx.description.slice(0, 44)}
              </p>
            </div>
            <button onClick={onClose} aria-label="Chiudi"
              className="text-text-tertiary hover:text-text-primary shrink-0">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-baseline gap-4 flex-wrap mt-3">
            <span className="text-2xs text-text-secondary">
              lordo <b className="tabular text-text-primary">{eur2(Math.abs(tx.amount))}</b>
            </span>
            <span className="text-2xs text-text-secondary">
              allocato <b className="tabular text-text-primary">{eur2(totale)}</b>
            </span>
            {/* Il numero che deve stare sempre sotto gli occhi. */}
            <span className={`text-2xs px-2 py-0.5 rounded-lg border ${
              resta < -0.01 ? 'border-error text-error bg-error-dim'
                : resta > 0.01 ? 'border-warning text-warning bg-warning-dim'
                : 'border-success text-success bg-success-dim'}`}>
              {resta < -0.01 ? <>sforato di <b className="tabular">{eur2(-resta)}</b></>
                : resta > 0.01 ? <>resta da spiegare <b className="tabular">{eur2(resta)}</b></>
                : 'spiegato per intero'}
            </span>
          </div>
        </div>

        {/* ── le righe da coprire ── */}
        <div className="px-5 py-3 border-b border-border">
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder={verso === 'out' ? 'cerca fra le uscite aperte' : 'cerca fra le entrate aperte'}
            aria-label="Cerca una riga"
            className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2
                       text-2xs text-text-primary focus-visible:border-gold" />
        </div>

        <ul className="max-h-80 overflow-y-auto divide-y divide-border/60">
          {disponibili.length === 0 && (
            <li className="px-5 py-4 text-2xs text-text-tertiary">
              Nessuna riga aperta di questo verso. Se è una spesa che non è a piano, registrala
              prima nel conto economico del suo mese.
            </li>
          )}
          {disponibili.slice(0, 40).map(l => {
            const on = picked.includes(l.id)
            const d = drafts.find(x => x.targetId === l.id)
            const scoperto = grossOf(l)
            const manca = d ? Math.round((scoperto - d.amount) * 100) / 100 : 0
            return (
              <li key={l.id} className={on ? 'bg-gold-dim/20' : ''}>
                <div className="flex items-center gap-3 px-5 py-2.5">
                  <button type="button" role="checkbox" aria-checked={on}
                    onClick={() => setPicked(p => on ? p.filter(x => x !== l.id) : [...p, l.id])}
                    aria-label={`${on ? 'Togli' : 'Aggiungi'} ${l.label}`}
                    className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center press ${
                      on ? 'bg-gold border-gold' : 'border-border-interactive hover:border-gold'}`}>
                    {on && <Check className="w-3 h-3 text-on-gold" aria-hidden="true" />}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block text-2xs font-semibold text-text-primary truncate">{l.label}</span>
                    <span className="block text-2xs text-text-tertiary">
                      {monthLabel(l.month)}
                      {l.clientName && <> · {l.clientName}</>}
                      {' · scoperto '}{eur2(scoperto)}
                      {/* §297 — «coperta a metà» è un terzo stato, e va detto qui:
                          senza, una riga che prende 2.100 su 2.562 sembra saldata. */}
                      {on && manca > 0.01 && (
                        <span className="text-warning font-semibold"> · resterebbero {eur2(manca)}</span>
                      )}
                    </span>
                  </span>
                  {on && (
                    <input inputMode="decimal" value={manual[l.id] ?? d?.amount.toFixed(2) ?? ''}
                      onChange={e => setManual(m => ({ ...m, [l.id]: e.target.value }))}
                      aria-label={`Quanto di questo movimento paga ${l.label}`}
                      className="w-24 bg-background border border-border-interactive rounded-lg px-2 py-1
                                 text-2xs text-text-primary tabular text-right focus-visible:border-gold" />
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {/* ── l'esito, prima di premere ── */}
        <div className="px-5 py-4 border-t border-border flex items-center gap-3 flex-wrap">
          {!v.ok && picked.length > 0 && (
            <p className="flex items-start gap-1.5 text-2xs text-error flex-1 min-w-[240px]">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              {v.why}
            </p>
          )}
          {v.ok && resta > 0.01 && (
            <p className="text-2xs text-text-tertiary flex-1 min-w-[240px]">
              Restano <b className="text-text-secondary tabular">{eur2(resta)}</b> non allocati: il
              movimento resta in elenco per la parte che manca. Non si inventa una destinazione.
            </p>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose}
              className="text-2xs font-semibold px-3 py-2 rounded-xl border border-border
                         text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              Annulla
            </button>
            <button disabled={!v.ok || pending}
              onClick={() => onConfirm(drafts)}
              className="text-2xs font-semibold px-3.5 py-2 rounded-xl bg-gold text-on-gold
                         press disabled:opacity-40">
              {drafts.length > 1 ? `Alloca su ${drafts.length} righe` : 'Alloca'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

/**
 * §384 — chi paga una distinta.
 *
 * Gli stipendi escono dal conto in una riga sola — «favore beneficiari vari
 * distinta», 3.945 € — e dentro ci sono tre persone. Questa finestra è il
 * posto dove si dice **quali** e **quanto a ciascuna**.
 *
 * **L'importo si scrive qui, e non è burocrazia.** I cedolini in archivio
 * sono PDF con l'importo a zero: nessuno sa quanto è stato pagato a chi. La
 * somma dei cedolini scelti deve fare la distinta, e il totale in fondo lo
 * dice mentre spunti — se non torna, o manca una persona o una cifra è
 * sbagliata. È la differenza fra un aggancio che controlla e uno che si
 * limita a dichiarare, ed è la ragione per cui l'azione rifiuta invece di
 * salvare in silenzio.
 *
 * I cedolini già pagati da un'altra distinta si vedono e non si scelgono: un
 * cedolino pagato due volte raddoppierebbe il costo del personale senza che
 * nessuno lo vada a cercare.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import type { BankTx, CedolinoScelta } from '@/lib/bank'

const MESI = ['', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

const eur2 = (n: number) =>
  `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

export function DistintaDialog({ tx, cedolini, pending, onChiudi, onSalva, onSlega }: {
  tx: BankTx
  cedolini: CedolinoScelta[]
  pending: boolean
  onChiudi: () => void
  onSalva: (righe: { payslipId: string; amount: number }[], forza: boolean) => void
  onSlega: () => void
}) {
  const distinta = Math.round(Math.abs(tx.amount) * 100) / 100
  /** quello che c'è già, così riaprire la finestra mostra la scelta di prima */
  const [scelte, setScelte] = useState<Record<string, string>>(() =>
    Object.fromEntries((tx.payslipLinks ?? []).map(l => [l.payslipId, String(l.amount).replace('.', ',')])))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onChiudi])

  /* I cedolini del mese del bonifico per primi: una distinta di settembre
     paga quasi sempre agosto, e cercarlo in mezzo a un anno di buste è il
     modo di scegliere quello sbagliato. */
  const elenco = useMemo(() => {
    const mese = Number(tx.booked_on.slice(5, 7))
    const anno = Number(tx.booked_on.slice(0, 4))
    const vicino = (c: CedolinoScelta) =>
      Math.abs((anno * 12 + mese) - (c.year * 12 + c.month))
    return [...cedolini]
      .filter(c => !c.linkedTo || c.linkedTo === tx.id || scelte[c.id] !== undefined)
      .sort((a, b) => vicino(a) - vicino(b) || a.who.localeCompare(b.who))
      .slice(0, 24)
  }, [cedolini, tx.booked_on, tx.id, scelte])

  const numero = (v: string) => {
    const n = Number(v.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  const righe = Object.entries(scelte).map(([payslipId, v]) => ({ payslipId, amount: numero(v) }))
  const totale = Math.round(righe.reduce((n, r) => n + r.amount, 0) * 100) / 100
  const scarto = Math.round((totale - distinta) * 100) / 100
  const quadra = Math.abs(scarto) < 0.01

  const spunta = (c: CedolinoScelta) => setScelte(p => {
    if (c.id in p) { const { [c.id]: _, ...resto } = p; return resto }
    return { ...p, [c.id]: '' }
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-scrim sm:p-4 animate-fade-in" onClick={onChiudi}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Chi paga questa distinta"
        className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-pop animate-slide-up pb-safe overflow-hidden flex flex-col max-h-[88vh]">
        <header className="flex items-start gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-text-primary font-heading">Chi paga questa distinta</h2>
            <p className="text-2xs text-text-secondary mt-0.5">
              <span className="tabular font-semibold text-text-primary">{eur2(distinta)}</span>
              {' '}il {new Date(tx.booked_on).toLocaleDateString('it-IT')} · {tx.description.slice(0, 48)}
            </p>
          </div>
          <button onClick={onChiudi} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary p-1 -mr-1">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {elenco.map(c => {
            const on = c.id in scelte
            return (
              <div key={c.id} className="flex items-center gap-2.5 px-4 py-2">
                <input type="checkbox" checked={on} onChange={() => spunta(c)}
                  aria-label={`${c.who}, ${MESI[c.month]} ${c.year}`}
                  className="accent-gold w-3.5 h-3.5 cursor-pointer shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold text-text-primary truncate">{c.who}</span>
                  <span className="block text-2xs text-text-tertiary">{MESI[c.month]} {c.year}</span>
                </span>
                {on && (
                  <span className="flex items-center gap-1 shrink-0">
                    <input value={scelte[c.id]} onChange={e => setScelte(p => ({ ...p, [c.id]: e.target.value }))}
                      inputMode="decimal" placeholder="0,00"
                      aria-label={`Importo pagato a ${c.who}`}
                      className="w-24 bg-background border border-border-interactive rounded-lg px-2 py-1 text-2xs tabular text-right text-text-primary" />
                    <span className="text-2xs text-text-tertiary">€</span>
                  </span>
                )}
              </div>
            )
          })}
          {!elenco.length && (
            <p className="px-4 py-10 text-center text-2xs text-text-tertiary">
              Nessun cedolino disponibile: vanno caricati in Personale prima di poterli collegare.
            </p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border shrink-0 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-secondary">Somma dei cedolini</span>
            <span className={`ml-auto tabular font-bold ${quadra ? 'text-success' : 'text-warning'}`}>
              {eur2(totale)}
            </span>
          </div>
          {!quadra && (
            <p className="flex items-start gap-1.5 text-2xs text-warning">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />
              <span>
                {scarto > 0 ? 'Superano' : 'Non arrivano al'}la distinta di{' '}
                <strong className="tabular">{eur2(Math.abs(scarto))}</strong>: manca qualcuno, o una cifra è sbagliata.
              </span>
            </p>
          )}
          <div className="flex items-center gap-3">
            {(tx.payslipLinks?.length ?? 0) > 0 && (
              <button onClick={onSlega} disabled={pending}
                className="text-2xs text-error hover:underline disabled:opacity-40">
                Slega tutti
              </button>
            )}
            <button onClick={onChiudi} disabled={pending}
              className="ml-auto text-sm text-text-secondary hover:text-text-primary disabled:opacity-40 press">
              Annulla
            </button>
            <button onClick={() => onSalva(righe, !quadra)} disabled={pending || !righe.length}
              className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl press disabled:opacity-40 ${
                quadra ? 'bg-gold text-on-gold shadow-soft' : 'bg-warning-dim border border-warning/40 text-warning'}`}>
              {pending && <Loader2 className="w-4 h-4 animate-spin" />}
              {quadra ? 'Collega' : 'Collega così com’è'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

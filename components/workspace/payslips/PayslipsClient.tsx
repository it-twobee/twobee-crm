'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Receipt, Download, Upload, Loader2, X, Trash2, Lock } from 'lucide-react'
import { getPayslipUrl, uploadPayslip, deletePayslip } from '@/app/actions/payslips'
import type { Payslip } from '@/lib/types/database'

const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

export function PayslipsClient({ payslips, isAdmin, currentUserId, team }: {
  payslips: Payslip[]
  isAdmin: boolean
  currentUserId: string
  team: { id: string; full_name: string }[]
}) {
  const [showUpload, setShowUpload] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const download = async (p: Payslip) => {
    setDownloading(p.id)
    const res = await getPayslipUrl(p.id)
    setDownloading(null)
    if ('error' in res) { toast.error(res.error); return }
    // Il link è firmato e scade in 60s: apriamolo subito, non conserviamolo.
    window.open(res.url, '_blank', 'noopener,noreferrer')
  }

  const byYear = new Map<number, Payslip[]>()
  for (const p of payslips) {
    if (!byYear.has(p.year)) byYear.set(p.year, [])
    byYear.get(p.year)!.push(p)
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b - a)

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Receipt className="w-5 h-5 text-gold-text" aria-hidden="true" />
            Buste Paga
          </h1>
          <p className="text-text-tertiary text-sm mt-0.5 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            {isAdmin ? 'Vedi e gestisci le buste paga del team' : 'Solo tu puoi vedere le tue buste paga'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 transition-colors shrink-0"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            Carica
          </button>
        )}
      </header>

      {payslips.length === 0 && (
        <div className="text-center py-20 text-text-tertiary text-sm">
          Nessuna busta paga disponibile.
        </div>
      )}

      {years.map(year => (
        <section key={year} className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-text-secondary tabular">{year}</h2>
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-tertiary tabular">{byYear.get(year)!.length}</span>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {byYear.get(year)!.map(p => (
              <li key={p.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                <Receipt className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{MONTHS[p.month - 1]}</p>
                  {isAdmin && p.profile_id !== currentUserId && (
                    <p className="text-2xs text-text-tertiary truncate">
                      {team.find(t => t.id === p.profile_id)?.full_name ?? 'Sconosciuto'}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => download(p)}
                  disabled={downloading === p.id}
                  aria-label={`Scarica busta paga di ${MONTHS[p.month - 1]} ${year}`}
                  className="p-2 rounded-lg text-text-tertiary hover:text-gold-text hover:bg-surface-hover transition-colors disabled:opacity-50"
                >
                  {downloading === p.id
                    ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    : <Download className="w-4 h-4" aria-hidden="true" />}
                </button>
                {isAdmin && <DeleteButton payslipId={p.id} />}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {showUpload && isAdmin && (
        <UploadModal team={team} onClose={() => setShowUpload(false)} />
      )}
    </div>
  )
}

function DeleteButton({ payslipId }: { payslipId: string }) {
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        aria-label="Elimina busta paga"
        className="p-2 rounded-lg text-text-tertiary hover:text-error hover:bg-error-dim transition-colors"
      >
        <Trash2 className="w-4 h-4" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => start(async () => {
          const res = await deletePayslip(payslipId)
          if ('error' in res) toast.error(res.error)
          else toast.success('Busta paga eliminata')
        })}
        disabled={pending}
        className="px-2 py-1 rounded-lg bg-error text-xs font-semibold text-on-gold disabled:opacity-50"
      >
        {pending ? '…' : 'Conferma'}
      </button>
      <button onClick={() => setConfirming(false)} aria-label="Annulla"
        className="p-1 text-text-tertiary hover:text-text-primary">
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

function UploadModal({ team, onClose }: { team: { id: string; full_name: string }[]; onClose: () => void }) {
  const [pending, start] = useTransition()
  const now = new Date()

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">Carica busta paga</h2>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form
          action={(fd: FormData) => start(async () => {
            const res = await uploadPayslip(fd)
            if ('error' in res) toast.error(res.error)
            else { toast.success('Busta paga caricata'); onClose() }
          })}
          className="p-5 space-y-4"
        >
          <div>
            <label htmlFor="profile_id" className="text-text-tertiary text-xs mb-1.5 block">Dipendente</label>
            <select id="profile_id" name="profile_id" required
              className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary">
              <option value="">Seleziona…</option>
              {team.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="month" className="text-text-tertiary text-xs mb-1.5 block">Mese</label>
              <select id="month" name="month" defaultValue={now.getMonth() + 1} required
                className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="year" className="text-text-tertiary text-xs mb-1.5 block">Anno</label>
              <input id="year" name="year" type="number" defaultValue={now.getFullYear()} min={2000} max={2100} required
                className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary tabular" />
            </div>
          </div>

          <div>
            <label htmlFor="file" className="text-text-tertiary text-xs mb-1.5 block">File (PDF)</label>
            <input id="file" name="file" type="file" accept="application/pdf,image/*" required
              className="w-full text-sm text-text-secondary file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-surface-active file:text-text-primary file:text-xs" />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={pending}
              className="flex-1 py-2.5 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 disabled:opacity-40 transition-colors">
              {pending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" aria-hidden="true" /> : 'Carica'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-text-tertiary text-sm rounded-xl hover:text-text-primary transition-colors">
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

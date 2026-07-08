'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, X, Clock, CheckCircle2, XCircle, Calendar, FileText, Banknote } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HrRequest } from '@/lib/types/database'

const TYPE_LABELS: Record<string, string> = {
  ferie: 'Ferie',
  permesso: 'Permesso',
  malattia: 'Malattia',
  spesa: 'Nota Spese',
  documento_hr: 'Documento HR',
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  ferie: <Calendar className="w-4 h-4" />,
  permesso: <Clock className="w-4 h-4" />,
  malattia: <FileText className="w-4 h-4" />,
  spesa: <Banknote className="w-4 h-4" />,
  documento_hr: <FileText className="w-4 h-4" />,
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:   { label: 'In attesa', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: <Clock className="w-3.5 h-3.5" /> },
  approved:  { label: 'Approvata', color: 'text-green-400 bg-green-400/10 border-green-400/20',  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  rejected:  { label: 'Rifiutata', color: 'text-red-400 bg-red-400/10 border-red-400/20',         icon: <XCircle className="w-3.5 h-3.5" /> },
  cancelled: { label: 'Annullata', color: 'text-white/30 bg-white/5 border-white/10',             icon: <X className="w-3.5 h-3.5" /> },
}

interface Props {
  requests: HrRequest[]
  profileId: string
}

export function WorkspaceHR({ requests: initialRequests, profileId }: Props) {
  const [requests, setRequests] = useState<HrRequest[]>(initialRequests)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    type: 'ferie' as string,
    start_date: '',
    end_date: '',
    notes: '',
    amount: '',
  })

  const needsDates = ['ferie', 'permesso', 'malattia'].includes(form.type)
  const needsAmount = form.type === 'spesa'

  async function submit() {
    if (needsDates && !form.start_date) { toast.error('Inserisci la data di inizio'); return }
    setSubmitting(true)
    const sb = createClient()
    const payload: Record<string, unknown> = {
      profile_id: profileId,
      type: form.type,
      notes: form.notes || null,
      start_date: needsDates ? form.start_date || null : null,
      end_date: needsDates ? form.end_date || null : null,
      amount: needsAmount && form.amount ? parseFloat(form.amount) : null,
    }
    const { data, error } = await sb.from('hr_requests').insert(payload).select().single()
    setSubmitting(false)
    if (error) { toast.error('Errore invio richiesta'); return }
    toast.success('Richiesta inviata')
    setRequests(prev => [data as HrRequest, ...prev])
    setShowForm(false)
    setForm({ type: 'ferie', start_date: '', end_date: '', notes: '', amount: '' })
  }

  async function cancel(id: string) {
    const sb = createClient()
    const { error } = await sb.from('hr_requests').update({ status: 'cancelled' }).eq('id', id)
    if (error) { toast.error('Errore'); return }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' as const } : r))
    toast.success('Richiesta annullata')
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Richieste HR</h1>
          <p className="text-white/40 text-sm mt-0.5">Ferie, permessi e note spese</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-[#F5C800] text-black text-sm font-semibold rounded-xl hover:bg-[#F5C800]/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuova richiesta
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-5 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A]">
          <h2 className="text-sm font-semibold text-white mb-4">Nuova richiesta</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-white/50 text-xs mb-1.5 block">Tipo</label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(TYPE_LABELS).map(t => (
                  <button
                    key={t}
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors',
                      form.type === t
                        ? 'bg-[#F5C800]/10 text-[#F5C800] border-[#F5C800]/30'
                        : 'text-white/40 border-[#2A2A2A] hover:border-white/20 hover:text-white/70',
                    )}
                  >
                    {TYPE_ICONS[t]}
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {needsDates && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-white/50 text-xs mb-1.5 block">Data inizio</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:border-[#F5C800]/40 outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-white/50 text-xs mb-1.5 block">Data fine</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:border-[#F5C800]/40 outline-none"
                  />
                </div>
              </div>
            )}

            {needsAmount && (
              <div>
                <label className="text-white/50 text-xs mb-1.5 block">Importo (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:border-[#F5C800]/40 outline-none"
                />
              </div>
            )}

            <div>
              <label className="text-white/50 text-xs mb-1.5 block">Note (opzionale)</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Aggiungi una nota..."
                className="w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:border-[#F5C800]/40 outline-none resize-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={submit}
                disabled={submitting}
                className="px-5 py-2 bg-[#F5C800] text-black text-sm font-semibold rounded-xl hover:bg-[#F5C800]/90 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Invio…' : 'Invia richiesta'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-white/40 text-sm rounded-xl hover:text-white transition-colors"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {requests.length === 0 ? (
        <div className="text-center py-16 text-white/30 text-sm">Nessuna richiesta</div>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map(r => {
            const meta = STATUS_META[r.status] ?? STATUS_META.pending
            const canCancel = r.status === 'pending'
            return (
              <div key={r.id} className="flex items-start gap-4 p-4 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A]">
                <div className="p-2 rounded-xl bg-white/5 text-white/40">
                  {TYPE_ICONS[r.type] ?? <FileText className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white text-sm font-medium">{TYPE_LABELS[r.type] ?? r.type}</span>
                    <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border', meta.color)}>
                      {meta.icon}
                      {meta.label}
                    </span>
                  </div>
                  {(r.start_date || r.end_date) && (
                    <p className="text-white/40 text-xs mt-0.5">
                      {r.start_date} {r.end_date && r.end_date !== r.start_date ? `→ ${r.end_date}` : ''}
                    </p>
                  )}
                  {r.amount && (
                    <p className="text-white/40 text-xs mt-0.5">€{Number(r.amount).toFixed(2)}</p>
                  )}
                  {r.notes && <p className="text-white/40 text-xs mt-0.5 truncate">{r.notes}</p>}
                  {r.review_note && (
                    <p className="text-white/50 text-xs mt-1 italic">"{r.review_note}"</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-white/25 text-xs">
                    {new Date(r.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                  </span>
                  {canCancel && (
                    <button
                      onClick={() => cancel(r.id)}
                      className="text-white/20 hover:text-red-400 transition-colors"
                      title="Annulla"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

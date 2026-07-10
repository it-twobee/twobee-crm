'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Plus, X, Clock, CheckCircle2, XCircle, Calendar, FileText, Banknote,
  Upload, Sun, Timer, Paperclip, Palmtree, AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HrRequest, VacationBalance } from '@/lib/types/database'

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
  pending:   { label: 'In attesa', color: 'text-gold-text bg-gold/10 border-warning/20', icon: <Clock className="w-3.5 h-3.5" /> },
  approved:  { label: 'Approvata', color: 'text-success bg-success/10 border-success/20',  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  rejected:  { label: 'Rifiutata', color: 'text-error bg-error/10 border-error/20',         icon: <XCircle className="w-3.5 h-3.5" /> },
  cancelled: { label: 'Annullata', color: 'text-text-tertiary bg-surface border-border',             icon: <X className="w-3.5 h-3.5" /> },
}

interface Props {
  requests: HrRequest[]
  profileId: string
  vacationBalance: VacationBalance | null
}

export function WorkspaceHR({ requests: initialRequests, profileId, vacationBalance }: Props) {
  const [requests, setRequests] = useState<HrRequest[]>(initialRequests)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    type: 'ferie' as string,
    start_date: '',
    end_date: '',
    notes: '',
    amount: '',
    is_full_day: true,
    start_time: '',
    end_time: '',
    file: null as File | null,
  })

  const needsDates = ['ferie', 'permesso', 'malattia'].includes(form.type)
  const needsAmount = form.type === 'spesa'
  const needsTime = needsDates && !form.is_full_day
  const canUpload = form.type === 'spesa'

  async function uploadFile(file: File): Promise<string | null> {
    const sb = createClient()
    const ext = file.name.split('.').pop()
    const path = `hr/${profileId}/${Date.now()}.${ext}`
    const { error } = await sb.storage.from('hr-attachments').upload(path, file)
    if (error) { toast.error('Errore upload file'); return null }
    const { data } = sb.storage.from('hr-attachments').getPublicUrl(path)
    return data.publicUrl
  }

  async function submit() {
    if (needsDates && !form.start_date) { toast.error('Inserisci la data di inizio'); return }
    if (needsTime && (!form.start_time || !form.end_time)) { toast.error('Inserisci orario inizio e fine'); return }

    setSubmitting(true)

    let attachmentUrl: string | null = null
    if (form.file) {
      setUploading(true)
      attachmentUrl = await uploadFile(form.file)
      setUploading(false)
      if (!attachmentUrl && canUpload) { setSubmitting(false); return }
    }

    const sb = createClient()
    const payload: Record<string, unknown> = {
      profile_id: profileId,
      type: form.type,
      notes: form.notes || null,
      start_date: needsDates ? form.start_date || null : null,
      end_date: needsDates ? form.end_date || null : null,
      is_full_day: needsDates ? form.is_full_day : true,
      start_time: needsTime ? form.start_time || null : null,
      end_time: needsTime ? form.end_time || null : null,
      amount: needsAmount && form.amount ? parseFloat(form.amount) : null,
      attachment_url: attachmentUrl,
    }

    const { data, error } = await sb.from('hr_requests').insert(payload).select().single()
    setSubmitting(false)
    if (error) { toast.error('Errore invio richiesta'); return }
    toast.success('Richiesta inviata')
    setRequests(prev => [data as HrRequest, ...prev])
    setShowForm(false)
    setForm({ type: 'ferie', start_date: '', end_date: '', notes: '', amount: '', is_full_day: true, start_time: '', end_time: '', file: null })
    if (fileRef.current) fileRef.current.value = ''
  }

  async function cancel(id: string) {
    const sb = createClient()
    const { error } = await sb.from('hr_requests').update({ status: 'cancelled' }).eq('id', id)
    if (error) { toast.error('Errore'); return }
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' as const } : r))
    toast.success('Richiesta annullata')
  }

  const vb = vacationBalance

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Balance cards */}
      {vb && (vb.annual_days > 0 || vb.annual_leave_hours > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <BalanceCard
            label="Ferie maturate"
            value={`${vb.accrued_days}/${vb.annual_days}`}
            unit="gg"
            icon={<Palmtree className="w-4 h-4 text-success" />}
            accent="border-success/20"
          />
          <BalanceCard
            label="Ferie usate"
            value={String(vb.used_days)}
            unit="gg"
            icon={<Calendar className="w-4 h-4 text-info" />}
            accent="border-info/20"
          />
          <BalanceCard
            label="Ferie residue"
            value={String(vb.remaining_days)}
            unit="gg"
            icon={<Sun className="w-4 h-4 text-gold-text" />}
            accent={vb.remaining_days <= 2 ? 'border-error/30' : 'border-gold/20'}
            alert={vb.remaining_days <= 2}
          />
          <BalanceCard
            label="Permessi residui"
            value={`${vb.remaining_leave_hours}/${vb.annual_leave_hours}`}
            unit="h"
            icon={<Timer className="w-4 h-4 text-accent" />}
            accent="border-accent/20"
          />
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Richieste HR</h1>
          <p className="text-text-tertiary text-sm mt-0.5">Ferie, permessi e note spese</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuova richiesta
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-5 rounded-2xl bg-surface border border-border">
          <h2 className="text-sm font-semibold text-text-primary mb-4">Nuova richiesta</h2>
          <div className="flex flex-col gap-3">
            {/* Type selector */}
            <div>
              <label className="text-text-secondary text-xs mb-1.5 block">Tipo</label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(TYPE_LABELS).map(t => (
                  <button
                    key={t}
                    onClick={() => setForm(f => ({ ...f, type: t, is_full_day: true, start_time: '', end_time: '', file: null }))}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors',
                      form.type === t
                        ? 'bg-gold/10 text-gold-text border-gold/30'
                        : 'text-text-tertiary border-border hover:border-border-strong hover:text-text-secondary',
                    )}
                  >
                    {TYPE_ICONS[t]}
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Full day toggle */}
            {needsDates && (
              <div>
                <label className="text-text-secondary text-xs mb-1.5 block">Durata</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setForm(f => ({ ...f, is_full_day: true, start_time: '', end_time: '' }))}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors',
                      form.is_full_day
                        ? 'bg-gold/10 text-gold-text border-gold/30'
                        : 'text-text-tertiary border-border hover:border-border-strong hover:text-text-secondary',
                    )}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    Giornata intera
                  </button>
                  <button
                    onClick={() => setForm(f => ({ ...f, is_full_day: false }))}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors',
                      !form.is_full_day
                        ? 'bg-gold/10 text-gold-text border-gold/30'
                        : 'text-text-tertiary border-border hover:border-border-strong hover:text-text-secondary',
                    )}
                  >
                    <Timer className="w-3.5 h-3.5" />
                    Fascia oraria
                  </button>
                </div>
              </div>
            )}

            {/* Date fields */}
            {needsDates && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-text-secondary text-xs mb-1.5 block">Data inizio</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:border-gold/40 outline-none"
                  />
                </div>
                {form.is_full_day && (
                  <div className="flex-1">
                    <label className="text-text-secondary text-xs mb-1.5 block">Data fine</label>
                    <input
                      type="date"
                      value={form.end_date}
                      onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:border-gold/40 outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Time fields */}
            {needsTime && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-text-secondary text-xs mb-1.5 block">Dalle</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:border-gold/40 outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-text-secondary text-xs mb-1.5 block">Alle</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:border-gold/40 outline-none"
                  />
                </div>
              </div>
            )}

            {/* Amount */}
            {needsAmount && (
              <div>
                <label className="text-text-secondary text-xs mb-1.5 block">Importo (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:border-gold/40 outline-none"
                />
              </div>
            )}

            {/* File upload for spese */}
            {canUpload && (
              <div>
                <label className="text-text-secondary text-xs mb-1.5 block">Allegato (foto, PDF)</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed cursor-pointer transition-colors',
                    form.file
                      ? 'border-gold/30 bg-gold/5'
                      : 'border-border hover:border-border-strong'
                  )}
                >
                  <Upload className="w-4 h-4 text-text-tertiary" />
                  <span className="text-sm text-text-tertiary truncate flex-1">
                    {form.file ? form.file.name : 'Carica ricevuta o giustificativo'}
                  </span>
                  {form.file && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setForm(f => ({ ...f, file: null })); if (fileRef.current) fileRef.current.value = '' }}
                      className="text-text-tertiary hover:text-error transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf,.txt"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) setForm(prev => ({ ...prev, file: f }))
                  }}
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-text-secondary text-xs mb-1.5 block">Note (opzionale)</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Aggiungi una nota..."
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:border-gold/40 outline-none resize-none"
              />
            </div>

            {/* Submit */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={submit}
                disabled={submitting}
                className="px-5 py-2 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 disabled:opacity-50 transition-colors"
              >
                {uploading ? 'Upload…' : submitting ? 'Invio…' : 'Invia richiesta'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-text-tertiary text-sm rounded-xl hover:text-text-primary transition-colors"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request list */}
      {requests.length === 0 ? (
        <div className="text-center py-16 text-text-tertiary text-sm">Nessuna richiesta</div>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map(r => {
            const meta = STATUS_META[r.status] ?? STATUS_META.pending
            const canCancel = r.status === 'pending'
            return (
              <div key={r.id} className="flex items-start gap-4 p-4 rounded-2xl bg-surface border border-border">
                <div className="p-2 rounded-xl bg-surface text-text-tertiary">
                  {TYPE_ICONS[r.type] ?? <FileText className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-text-primary text-sm font-medium">{TYPE_LABELS[r.type] ?? r.type}</span>
                    <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border', meta.color)}>
                      {meta.icon}
                      {meta.label}
                    </span>
                    {!r.is_full_day && r.start_time && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-accent/20 text-accent bg-accent/10">
                        <Timer className="w-3 h-3" />
                        {r.start_time?.slice(0, 5)}–{r.end_time?.slice(0, 5)}
                      </span>
                    )}
                  </div>
                  {(r.start_date || r.end_date) && (
                    <p className="text-text-tertiary text-xs mt-0.5">
                      {r.start_date} {r.end_date && r.end_date !== r.start_date ? `→ ${r.end_date}` : ''}
                    </p>
                  )}
                  {r.amount != null && r.amount > 0 && (
                    <p className="text-text-tertiary text-xs mt-0.5">€{Number(r.amount).toFixed(2)}</p>
                  )}
                  {r.attachment_url && (
                    <a
                      href={r.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-gold-text/60 hover:text-gold-text mt-0.5 transition-colors"
                    >
                      <Paperclip className="w-3 h-3" />
                      Allegato
                    </a>
                  )}
                  {r.notes && <p className="text-text-tertiary text-xs mt-0.5 truncate">{r.notes}</p>}
                  {r.review_note && (
                    <p className="text-text-secondary text-xs mt-1 italic">&ldquo;{r.review_note}&rdquo;</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-text-tertiary text-xs">
                    {new Date(r.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                  </span>
                  {canCancel && (
                    <button
                      onClick={() => cancel(r.id)}
                      className="text-text-tertiary hover:text-error transition-colors"
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

function BalanceCard({
  label, value, unit, icon, accent, alert
}: {
  label: string; value: string; unit: string; icon: React.ReactNode; accent: string; alert?: boolean
}) {
  return (
    <div className={cn('p-4 rounded-2xl bg-surface border', accent)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-text-secondary text-xs">{label}</span>
        {icon}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn('text-xl font-bold', alert ? 'text-error' : 'text-text-primary')}>{value}</span>
        <span className="text-text-tertiary text-xs">{unit}</span>
        {alert && <AlertCircle className="w-3.5 h-3.5 text-error ml-1" />}
      </div>
    </div>
  )
}

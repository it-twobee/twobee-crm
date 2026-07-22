'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, X, Loader2, Ban, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { monthlyAmount } from '@/lib/revenue'
import {
  listRevenueStreams, createRevenueStream, closeRevenueStream,
  reactivateRevenueStream, deleteRevenueStream,
} from '@/app/actions/revenue-streams'
import type {
  RevenueStream, ServiceLine, RevenueModel, BillingFrequency, Project,
} from '@/lib/types/database'

const SERVICE_LINES: { value: ServiceLine; label: string }[] = [
  { value: 'growth', label: 'Growth' },
  { value: 'digital', label: 'Digital' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'ai', label: 'AI' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'other', label: 'Altro' },
]

const REVENUE_MODELS: { value: RevenueModel; label: string; hint: string }[] = [
  { value: 'recurring', label: 'Canone ricorrente', hint: 'Entra nell’MRR' },
  { value: 'maintenance', label: 'Manutenzione', hint: 'Canone, entra nell’MRR' },
  { value: 'one_off', label: 'Una tantum', hint: 'Importo unico' },
  { value: 'milestone_based', label: 'A SAL', hint: 'Acconto, stati avanzamento, saldo' },
  { value: 'usage_based', label: 'A consumo', hint: 'Variabile' },
  { value: 'non_billable', label: 'Non fatturabile', hint: 'Nessun ricavo' },
]

const FREQUENCIES: { value: BillingFrequency; label: string }[] = [
  { value: 'mensile', label: 'Mensile' },
  { value: 'bimestrale', label: 'Bimestrale' },
  { value: 'trimestrale', label: 'Trimestrale' },
  { value: 'semestrale', label: 'Semestrale' },
  { value: 'annuale', label: 'Annuale' },
]

const LINE_STYLE: Record<string, string> = {
  growth: 'bg-success-dim text-success',
  digital: 'bg-info-dim text-info',
  marketing: 'bg-accent-dim text-accent',
  ai: 'bg-warning-dim text-warning',
  hybrid: 'bg-surface-active text-text-secondary',
  consulting: 'bg-surface-active text-text-secondary',
  other: 'bg-surface-active text-text-tertiary',
}

const isRecurring = (m: RevenueModel) => m === 'recurring' || m === 'maintenance'

interface Props {
  clientId: string
  projects: Pick<Project, 'id' | 'name'>[]
}

export function AccordiEconomiciTab({ clientId, projects }: Props) {
  const [streams, setStreams] = useState<RevenueStream[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    label: '', service_line: 'growth' as ServiceLine, revenue_model: 'recurring' as RevenueModel,
    amount: '', billing_frequency: 'mensile' as BillingFrequency,
    start_date: today, end_date: '', project_id: '', notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listRevenueStreams(clientId)
    if (!res.ok) toast.error(res.error ?? 'Errore nel caricamento')
    setStreams(res.streams)
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  const activeStreams = streams.filter(s => s.status === 'attivo')
  const mrr = activeStreams
    .filter(s => isRecurring(s.revenue_model))
    .reduce((sum, s) => sum + monthlyAmount(Number(s.amount), s.billing_frequency), 0)
  const oneOffTotal = activeStreams
    .filter(s => s.revenue_model === 'one_off' || s.revenue_model === 'milestone_based')
    .reduce((sum, s) => sum + Number(s.amount), 0)

  const submit = async () => {
    if (!form.label.trim()) { toast.error('Serve un nome per l’accordo'); return }
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { toast.error('Importo non valido'); return }

    setSaving(true)
    const res = await createRevenueStream({
      client_id: clientId,
      project_id: form.project_id || null,
      label: form.label.trim(),
      service_line: form.service_line,
      revenue_model: form.revenue_model,
      amount,
      billing_frequency: isRecurring(form.revenue_model) ? form.billing_frequency : null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      notes: form.notes || null,
    })
    setSaving(false)

    if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
    toast.success('Accordo creato')
    setShowForm(false)
    setForm(f => ({ ...f, label: '', amount: '', end_date: '', project_id: '', notes: '' }))
    load()
  }

  const close = async (s: RevenueStream) => {
    const date = window.prompt('Data di fine dell’accordo (AAAA-MM-GG):', today)
    if (!date) return
    const res = await closeRevenueStream(s.id, clientId, date)
    if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
    toast.success('Accordo chiuso')
    load()
  }

  const reactivate = async (s: RevenueStream) => {
    const res = await reactivateRevenueStream(s.id, clientId, null)
    if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
    toast.success('Accordo riattivato')
    load()
  }

  const remove = async (s: RevenueStream) => {
    if (!window.confirm(`Eliminare definitivamente "${s.label}"? Per conservare lo storico conviene chiuderlo, non eliminarlo.`)) return
    const res = await deleteRevenueStream(s.id, clientId)
    if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
    toast.success('Accordo eliminato')
    load()
  }

  const inputCls = 'w-full bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/50'

  return (
    <div className="space-y-5">
      {/* Riepilogo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-2xl p-5">
          <p className="text-2xs text-text-tertiary">MRR del cliente</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{formatCurrency(mrr)}</p>
          <p className="text-2xs text-text-tertiary mt-0.5">Somma dei canoni attivi, normalizzati a mese</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-5">
          <p className="text-2xs text-text-tertiary">Una tantum attivo</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{formatCurrency(oneOffTotal)}</p>
          <p className="text-2xs text-text-tertiary mt-0.5">Progetti e lavori a corpo in corso</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-5">
          <p className="text-2xs text-text-tertiary">Accordi</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{activeStreams.length}</p>
          <p className="text-2xs text-text-tertiary mt-0.5">
            {streams.length - activeStreams.length > 0
              ? `${streams.length - activeStreams.length} chiusi nello storico`
              : 'Nessun accordo chiuso'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Accordi economici</h3>
          <p className="text-2xs text-text-tertiary mt-0.5">
            L&apos;MRR del cliente è calcolato da qui. Growth, Digital e Marketing possono convivere.
          </p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-gold text-on-gold text-sm font-semibold px-3 py-2 rounded-lg hover:opacity-90 transition-opacity">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Annulla' : 'Nuovo accordo'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Nome accordo *</label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Canone Growth, Sito e-commerce, Social Media Management…" className={inputCls} />
            </div>
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Progetto collegato</label>
              <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} className={inputCls}>
                <option value="">Nessuno (accordo di cliente)</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Linea di servizio *</label>
              <select value={form.service_line} onChange={e => setForm(f => ({ ...f, service_line: e.target.value as ServiceLine }))} className={inputCls}>
                {SERVICE_LINES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Modello di ricavo *</label>
              <select value={form.revenue_model} onChange={e => setForm(f => ({ ...f, revenue_model: e.target.value as RevenueModel }))} className={inputCls}>
                {REVENUE_MODELS.map(m => <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">
                {isRecurring(form.revenue_model) ? 'Importo per periodo (€) *' : 'Importo totale (€) *'}
              </label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="1800" className={inputCls} />
            </div>
            {isRecurring(form.revenue_model) && (
              <div>
                <label className="block text-2xs text-text-tertiary mb-1.5">Frequenza *</label>
                <select value={form.billing_frequency} onChange={e => setForm(f => ({ ...f, billing_frequency: e.target.value as BillingFrequency }))} className={inputCls}>
                  {FREQUENCIES.map(fr => <option key={fr.value} value={fr.value}>{fr.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Inizio *</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Fine (vuoto = indeterminato)</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Note</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} />
            </div>
          </div>

          {isRecurring(form.revenue_model) && form.amount && form.billing_frequency !== 'mensile' && (
            <p className="text-2xs text-text-secondary">
              Contribuisce all&apos;MRR per {formatCurrency(monthlyAmount(parseFloat(form.amount) || 0, form.billing_frequency))} al mese.
            </p>
          )}

          <button onClick={submit} disabled={saving}
            className="flex items-center gap-2 bg-gold text-on-gold text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Crea accordo
          </button>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
        </div>
      ) : streams.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <p className="text-sm text-text-secondary">Nessun accordo economico.</p>
          <p className="text-2xs text-text-tertiary mt-1">
            Finché non ne crei uno, l&apos;MRR di questo cliente resta a zero.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-2xs text-text-tertiary">
                <th className="text-left font-semibold px-4 py-3">Accordo</th>
                <th className="text-left font-semibold px-4 py-3">Linea</th>
                <th className="text-left font-semibold px-4 py-3">Modello</th>
                <th className="text-right font-semibold px-4 py-3">Importo</th>
                <th className="text-right font-semibold px-4 py-3">MRR</th>
                <th className="text-left font-semibold px-4 py-3">Periodo</th>
                <th className="text-right font-semibold px-4 py-3">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {streams.map(s => {
                const closed = s.status !== 'attivo'
                const contrib = isRecurring(s.revenue_model) && !closed
                  ? monthlyAmount(Number(s.amount), s.billing_frequency)
                  : 0
                return (
                  <tr key={s.id} className={`border-b border-border last:border-0 ${closed ? 'opacity-55' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="text-text-primary font-medium">{s.label}</p>
                      {closed && <p className="text-2xs text-text-tertiary">{s.status}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded ${LINE_STYLE[s.service_line] ?? LINE_STYLE.other}`}>
                        {SERVICE_LINES.find(l => l.value === s.service_line)?.label ?? s.service_line}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-2xs">
                      {REVENUE_MODELS.find(m => m.value === s.revenue_model)?.label ?? s.revenue_model}
                      {s.billing_frequency && s.billing_frequency !== 'una_tantum' && ` · ${s.billing_frequency}`}
                    </td>
                    <td className="px-4 py-3 text-right text-text-primary">{formatCurrency(Number(s.amount))}</td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {contrib > 0 ? formatCurrency(contrib) : '—'}
                    </td>
                    <td className="px-4 py-3 text-2xs text-text-secondary whitespace-nowrap">
                      {s.start_date} → {s.end_date ?? 'indeterminato'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {closed ? (
                          <button onClick={() => reactivate(s)} aria-label="Riattiva accordo"
                            className="p-1.5 rounded hover:bg-surface-hover text-text-tertiary hover:text-success transition-colors">
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button onClick={() => close(s)} aria-label="Chiudi accordo"
                            className="p-1.5 rounded hover:bg-surface-hover text-text-tertiary hover:text-warning transition-colors">
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => remove(s)} aria-label="Elimina accordo"
                          className="p-1.5 rounded hover:bg-surface-hover text-text-tertiary hover:text-error transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

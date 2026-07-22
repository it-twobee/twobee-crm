'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, X, Loader2, Link2, Trash2, Check } from 'lucide-react'
import { toast } from 'sonner'
import {
  listClientAdHoc, createClientAdHoc, updateClientAdHoc,
  linkAdHocToProject, deleteClientAdHoc, type AdHocTask,
} from '@/app/actions/client-adhoc'

/**
 * Attività ad hoc del cliente: lavoro trasversale che non appartiene davvero a
 * un progetto.
 *
 * Lo stesso componente sta nella scheda cliente e dentro ogni progetto di quel
 * cliente. Nel progetto è **contestuale**: mostra le task di scope cliente senza
 * toccarne il `project_id`, che è il punto del §10 da non tradire — attribuirle
 * a un progetto per comodità di visualizzazione falserebbe ogni aggregato.
 */

const STATUS: { value: string; label: string }[] = [
  { value: 'da_fare', label: 'Da fare' },
  { value: 'in_corso', label: 'In corso' },
  { value: 'in_revisione', label: 'In revisione' },
  { value: 'completato', label: 'Completato' },
]

const PRIORITY: { value: string; label: string; cls: string }[] = [
  { value: 'bassa', label: 'Bassa', cls: 'text-text-tertiary' },
  { value: 'media', label: 'Media', cls: 'text-info' },
  { value: 'alta', label: 'Alta', cls: 'text-warning' },
  { value: 'urgente', label: 'Urgente', cls: 'text-error' },
]

interface Props {
  clientId: string
  projects: { id: string; name: string }[]
  profiles: { id: string; full_name: string | null }[]
  canEdit: boolean
  /** Nel dominio progetto il pannello è più compatto e si presenta come contestuale. */
  compact?: boolean
}

export function ClientAdHocPanel({ clientId, projects, profiles, canEdit, compact = false }: Props) {
  const [tasks, setTasks] = useState<AdHocTask[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('aperte')

  const [form, setForm] = useState({
    title: '', description: '', due_date: '', priority: 'media',
    estimated_hours: '', assignee: '', is_client_task: false,
  })

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listClientAdHoc(clientId)
    if (!res.ok) toast.error(res.error ?? 'Errore nel caricamento')
    setTasks(res.tasks)
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  const visible = tasks.filter(t =>
    statusFilter === 'tutte' ? true
    : statusFilter === 'aperte' ? t.status !== 'completato'
    : t.status === statusFilter
  )

  const openCount = tasks.filter(t => t.status !== 'completato').length
  const today = new Date().toISOString().slice(0, 10)
  const overdue = tasks.filter(t => t.status !== 'completato' && t.due_date && t.due_date < today).length

  const submit = async () => {
    if (!form.title.trim()) { toast.error('Serve un titolo'); return }
    setSaving(true)
    const res = await createClientAdHoc({
      client_id: clientId,
      title: form.title,
      description: form.description || null,
      due_date: form.due_date || null,
      priority: form.priority,
      estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : null,
      assignee_ids: form.assignee ? [form.assignee] : [],
      is_client_task: form.is_client_task,
    })
    setSaving(false)
    if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
    toast.success('Attività creata')
    setShowForm(false)
    setForm({ title: '', description: '', due_date: '', priority: 'media', estimated_hours: '', assignee: '', is_client_task: false })
    load()
  }

  const patch = async (t: AdHocTask, p: Parameters<typeof updateClientAdHoc>[2]) => {
    const res = await updateClientAdHoc(t.id, clientId, p)
    if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
    load()
  }

  const link = async (t: AdHocTask, projectId: string) => {
    if (!projectId) return
    const res = await linkAdHocToProject(t.id, clientId, projectId)
    if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
    toast.success('Attività collegata al progetto')
    load()
  }

  const remove = async (t: AdHocTask) => {
    if (!window.confirm(`Spostare "${t.title}" nel cestino?`)) return
    const res = await deleteClientAdHoc(t.id, clientId)
    if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
    toast.success('Spostata nel cestino')
    load()
  }

  const inputCls = 'w-full bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/50'

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-text-primary">
            {compact ? 'Attività ad hoc del cliente' : 'Attività ad hoc'}
          </h3>
          <p className="text-2xs text-text-tertiary mt-0.5">
            {compact
              ? 'Lavoro del cliente non attribuito a questo progetto. Conta nel Workload.'
              : 'Lavoro trasversale non attribuibile a un progetto specifico.'}
            {overdue > 0 && <span className="text-error font-semibold"> · {overdue} scadute</span>}
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 bg-gold text-on-gold text-sm font-semibold px-3 py-2 rounded-lg hover:opacity-90 transition-opacity shrink-0">
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'Annulla' : 'Nuova attività'}
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Cosa c'è da fare" className={inputCls} />
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Dettagli (facoltativo)" className={inputCls} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Scadenza</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Priorità</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={inputCls}>
                {PRIORITY.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Ore stimate</label>
              <input type="number" step="0.5" value={form.estimated_hours}
                onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))}
                placeholder="4" className={inputCls} />
            </div>
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Assegnata a</label>
              <select value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))} className={inputCls}>
                <option value="">Nessuno</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? '—'}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-2xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={form.is_client_task}
              onChange={e => setForm(f => ({ ...f, is_client_task: e.target.checked }))}
              className="accent-gold" />
            Visibile al cliente nel suo portale
          </label>

          <p className="text-2xs text-text-tertiary">
            Senza ore stimate l&apos;attività pesa 4h nel Workload (valore di default).
          </p>

          <button onClick={submit} disabled={saving}
            className="flex items-center gap-2 bg-gold text-on-gold text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Crea attività
          </button>
        </div>
      )}

      {/* Filtri */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {[{ v: 'aperte', l: `Aperte (${openCount})` }, ...STATUS.map(s => ({ v: s.value, l: s.label })), { v: 'tutte', l: 'Tutte' }].map(f => (
          <button key={f.v} onClick={() => setStatusFilter(f.v)}
            className={`text-2xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
              statusFilter === f.v
                ? 'bg-surface-active text-text-primary border-border-strong'
                : 'bg-transparent text-text-secondary border-border hover:text-text-primary'
            }`}>
            {f.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          <p className="text-sm text-text-secondary">Nessuna attività ad hoc.</p>
          <p className="text-2xs text-text-tertiary mt-1">
            Qui va il lavoro per il cliente che non appartiene a un progetto preciso.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
          {visible.map(t => {
            const isOverdue = t.status !== 'completato' && t.due_date && t.due_date < today
            const prio = PRIORITY.find(p => p.value === t.priority)
            return (
              <div key={t.id} className="p-3 flex items-start gap-3 flex-wrap">
                {canEdit && (
                  <button
                    onClick={() => patch(t, { status: t.status === 'completato' ? 'da_fare' : 'completato' })}
                    aria-label={t.status === 'completato' ? 'Riapri attività' : 'Segna come completata'}
                    className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                      t.status === 'completato'
                        ? 'bg-success border-success text-on-gold'
                        : 'border-border-strong hover:border-success'
                    }`}>
                    {t.status === 'completato' && <Check className="w-3 h-3" />}
                  </button>
                )}

                <div className="flex-1 min-w-[12rem]">
                  <p className={`text-sm ${t.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                    {t.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {t.due_date && (
                      <span className={`text-2xs ${isOverdue ? 'text-error font-semibold' : 'text-text-tertiary'}`}>
                        {new Date(t.due_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                    {prio && <span className={`text-2xs ${prio.cls}`}>{prio.label}</span>}
                    {t.estimated_hours != null && (
                      <span className="text-2xs text-text-tertiary">{t.estimated_hours}h</span>
                    )}
                    {t.is_client_task && (
                      <span className="text-2xs text-info">visibile al cliente</span>
                    )}
                  </div>
                </div>

                {canEdit && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {projects.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={e => link(t, e.target.value)}
                        aria-label="Collega a un progetto"
                        className="text-2xs bg-background border border-border rounded-lg px-2 py-1 text-text-secondary max-w-[9rem]">
                        <option value="">Collega a…</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                    <button onClick={() => remove(t)} aria-label="Sposta nel cestino"
                      className="p-1.5 rounded hover:bg-surface-hover text-text-tertiary hover:text-error transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {compact && visible.length > 0 && (
        <p className="text-2xs text-text-tertiary flex items-center gap-1.5">
          <Link2 className="w-3 h-3" />
          Queste attività restano di scope cliente: non entrano negli avanzamenti di questo progetto.
        </p>
      )}
    </div>
  )
}

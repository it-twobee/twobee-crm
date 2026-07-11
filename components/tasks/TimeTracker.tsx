'use client'

import { useState, useEffect } from 'react'
import { Clock, Plus, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// Fonte canonica: time_entries (TIME-01). Il campo data si chiama `date`.
interface TimeLogWithProfile {
  id: string
  task_id: string | null
  profile_id: string | null
  hours: number
  note: string | null
  date: string
  created_at: string
  profile: { id: string; full_name: string } | null
}

export function TimeTracker({ taskId, estimatedHours }: { taskId: string; estimatedHours: number | null }) {
  const [logs, setLogs] = useState<TimeLogWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ hours: '', note: '', date: new Date().toISOString().slice(0, 10) })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('time_entries')
        .select('id, task_id, profile_id, hours, note, date, created_at, profile:profiles!time_entries_profile_id_fkey(id, full_name)')
        .eq('task_id', taskId)
        .order('date', { ascending: false })
      setLogs((data ?? []) as unknown as TimeLogWithProfile[])
      setLoading(false)
    }
    load()
  }, [taskId])

  const totalLogged = logs.reduce((sum, l) => sum + l.hours, 0)

  const addLog = async () => {
    const hours = parseFloat(form.hours)
    if (!hours || hours <= 0) { toast.error('Inserisci ore valide'); return }
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    // project_id/client_id vengono riempiti dal trigger a partire da task_id.
    const { data, error } = await supabase.from('time_entries').insert({
      task_id: taskId,
      profile_id: user?.id,
      hours,
      note: form.note || null,
      date: form.date,
    }).select('id, task_id, profile_id, hours, note, date, created_at, profile:profiles!time_entries_profile_id_fkey(id, full_name)').single()
    setSaving(false)
    if (error) { toast.error('Errore salvataggio'); return }
    setLogs((prev) => [data as unknown as TimeLogWithProfile, ...prev])
    setForm({ hours: '', note: '', date: new Date().toISOString().slice(0, 10) })
    setAdding(false)
    toast.success('Ore registrate!')
  }

  const deleteLog = async (id: string) => {
    const supabase = createClient()
    await supabase.from('time_entries').delete().eq('id', id)
    setLogs((prev) => prev.filter((l) => l.id !== id))
  }

  const pct = estimatedHours ? Math.min(100, (totalLogged / estimatedHours) * 100) : null

  return (
    <div className="space-y-3">
      {/* Progress bar ore */}
      <div className="flex items-center justify-between text-xs mb-1">
        <div className="flex items-center gap-1.5 text-text-secondary">
          <Clock className="w-3.5 h-3.5" />
          <span><span className="text-text-primary font-semibold">{totalLogged}h</span> registrate
          {estimatedHours && <span className="text-text-secondary"> / {estimatedHours}h stimate</span>}
          </span>
        </div>
        <button onClick={() => setAdding(!adding)} className="flex items-center gap-1 text-gold-text hover:underline">
          <Plus className="w-3 h-3" /> Aggiungi
        </button>
      </div>

      {pct !== null && (
        <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-error' : pct >= 80 ? 'bg-warning' : 'bg-success'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Form aggiungi */}
      {adding && (
        <div className="bg-background border border-border rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-text-secondary mb-1">Ore *</label>
              <input
                type="number"
                min="0.25"
                step="0.25"
                value={form.hours}
                onChange={(e) => setForm((p) => ({ ...p, hours: e.target.value }))}
                placeholder="es. 1.5"
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-text-secondary mb-1">Data</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold"
              />
            </div>
          </div>
          <input
            value={form.note}
            onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
            placeholder="Nota opzionale..."
            className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold"
          />
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 py-1.5 text-xs border border-border rounded text-text-secondary hover:text-text-primary transition-colors">Annulla</button>
            <button onClick={addLog} disabled={saving} className="flex-1 py-1.5 text-xs bg-gold text-on-gold font-bold rounded hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-1">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} Salva
            </button>
          </div>
        </div>
      )}

      {/* Log list */}
      {!loading && logs.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {logs.map((l) => (
            <div key={l.id} className="flex items-center justify-between text-xs group">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-text-primary">{l.hours}h</span>
                <span className="text-text-secondary">{l.profile?.full_name ?? 'Utente'}</span>
                <span className="text-text-secondary">{new Date(l.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>
                {l.note && <span className="text-text-secondary italic truncate max-w-[120px]">{l.note}</span>}
              </div>
              <button onClick={() => deleteLog(l.id)} className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-error transition-all">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

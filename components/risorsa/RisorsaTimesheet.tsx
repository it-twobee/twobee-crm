'use client'

import { useState } from 'react'
import { Loader2, Plus, Clock, Trash2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface Entry {
  id: string; date: string; hours: number; note: string | null
  project_id: string | null; task_id: string | null; category: string | null
  projects: { name: string } | null
}
interface MyTask { id: string; title: string; project_id: string | null; project: { id: string; name: string } | null }

const ic = 'bg-background border border-border rounded-lg px-2.5 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-gold'

export function RisorsaTimesheet({ profileId, initialEntries, myTasks }: {
  profileId: string
  initialEntries: Entry[]
  myTasks: MyTask[]
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [entries, setEntries] = useState(initialEntries)
  const [taskId, setTaskId]   = useState('')
  const [date, setDate]       = useState(today)
  const [hours, setHours]     = useState('')
  const [note, setNote]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [improving, setImproving] = useState(false)

  const selectedTask = myTasks.find(t => t.id === taskId)

  const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
  const hoursToday = entries.filter(e => e.date === today).reduce((s, e) => s + e.hours, 0)
  const hoursWeek  = entries.filter(e => e.date >= weekStart).reduce((s, e) => s + e.hours, 0)
  const hoursMonth = entries.reduce((s, e) => s + e.hours, 0)

  const improveNote = async () => {
    if (!note.trim()) { toast.error('Scrivi prima una nota da migliorare'); return }
    setImproving(true)
    try {
      const res = await fetch('/api/ai/prefill', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: 'timesheet', mode: 'improve', context: { note, task: selectedTask?.title } }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore AI')
      if (data.suggestions?.description) setNote(data.suggestions.description)
      else toast.error('Nessun suggerimento')
    } catch (e) { toast.error((e as Error).message) } finally { setImproving(false) }
  }

  const add = async () => {
    const h = parseFloat(hours)
    if (!h || h <= 0) { toast.error('Inserisci le ore'); return }
    setSaving(true)
    const { data, error } = await createClient().from('time_entries').insert({
      profile_id: profileId,
      project_id: selectedTask?.project_id ?? null,
      task_id: taskId || null,
      date, hours: h, note: note.trim() || null, category: 'sviluppo',
    }).select('id, date, hours, note, project_id, task_id, category, projects(name)').single()
    setSaving(false)
    if (error) { toast.error(error.message); return }
    setEntries(prev => [data as unknown as Entry, ...prev])
    setHours(''); setNote(''); setTaskId('')
    toast.success('Ore registrate')
  }

  const remove = async (e: Entry) => {
    setEntries(prev => prev.filter(x => x.id !== e.id))
    await createClient().from('time_entries').delete().eq('id', e.id)
  }

  return (
    <div className="max-w-4xl mx-auto px-5 py-6 space-y-5">
      <h1 className="text-xl font-black text-text-primary">Timesheet</h1>

      <div className="grid grid-cols-3 gap-3">
        {[{ l: 'Oggi', v: hoursToday }, { l: 'Ultimi 7 giorni', v: hoursWeek }, { l: 'Questo mese', v: hoursMonth }].map(s => (
          <div key={s.l} className="bg-background border border-border rounded-2xl p-4">
            <p className="text-2xs text-text-tertiary uppercase tracking-wider font-bold mb-1">{s.l}</p>
            <p className="text-2xl font-black text-gold-text">{s.v}h</p>
          </div>
        ))}
      </div>

      {/* Log rapido */}
      <div className="bg-background border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2"><Plus className="w-4 h-4 text-gold-text" /><span className="text-sm font-bold text-text-primary">Logga ore</span></div>
        <div className="grid grid-cols-2 lg:grid-cols-[1fr_120px_80px] gap-2">
          <select value={taskId} onChange={e => setTaskId(e.target.value)} className={`${ic} col-span-2 lg:col-span-1`}>
            <option value="">Attività (opzionale)…</option>
            {myTasks.map(t => <option key={t.id} value={t.id}>{t.title}{t.project?.name ? ` · ${t.project.name}` : ''}</option>)}
          </select>
          <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className={ic} />
          <input type="number" min="0" step="0.5" value={hours} onChange={e => setHours(e.target.value)} placeholder="ore" className={ic} />
        </div>
        <div className="flex gap-2">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Cosa hai fatto? (es. tracking GA4 e sistemazione eventi form)" className={`${ic} flex-1`} />
          <button onClick={improveNote} disabled={improving} title="Migliora con AI"
            className="px-3 rounded-lg border border-border text-text-tertiary hover:text-gold-text hover:border-border transition-colors shrink-0">
            {improving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          </button>
          <button onClick={add} disabled={saving}
            className="px-4 bg-gold text-on-gold text-sm font-bold rounded-lg hover:bg-gold/90 disabled:opacity-50 shrink-0 flex items-center gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />} Salva
          </button>
        </div>
      </div>

      {/* Riepilogo */}
      {entries.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-2xl">
          <p className="text-text-tertiary text-sm">Nessuna ora registrata questo mese.</p>
          <p className="text-text-tertiary text-xs mt-1">Logga le ore partendo da un'attività oppure inserisci un'attività manuale.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map(e => (
            <div key={e.id} className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-2.5 group">
              <span className="text-2xs text-text-tertiary w-16 shrink-0">{new Date(e.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>
              <span className="text-sm font-black text-gold-text w-12 shrink-0">{e.hours}h</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{e.note ?? '—'}</p>
                {e.projects?.name && <p className="text-2xs text-text-tertiary">{e.projects.name}</p>}
              </div>
              <button onClick={() => remove(e)} className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-error transition-all shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

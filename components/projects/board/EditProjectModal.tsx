'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Project } from '@/lib/types/database'
import { STATUS_PROJECT } from './types'

// ─── Edit project modal ────────────────────────────────────────────────────────
export function EditProjectModal({ project, onClose, onSaved }: {
  project: Project; onClose: () => void; onSaved: (p: Partial<Project>) => void
}) {
  const [form, setForm] = useState({
    name: project.name, description: project.description ?? '', status: project.status,
    project_kind: project.project_kind ?? '',
  })
  const [loading, setLoading] = useState(false)
  const inp = 'w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-gold'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    const patch = {
      name: form.name.trim() || project.name,
      description: form.description || null,
      status: form.status,
      project_kind: form.project_kind || null,
    }
    await createClient().from('projects').update(patch).eq('id', project.id)
    setLoading(false)
    toast.success('Progetto aggiornato')
    onSaved(patch as Partial<Project>)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">Modifica progetto</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-text-tertiary hover:text-text-primary" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div><label className="block text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider">Nome *</label>
            <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inp} /></div>
          <div><label className="block text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider">Descrizione</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className={`${inp} resize-none`} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider">Stato</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Project['status'] }))} className={inp}>
                {STATUS_PROJECT.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select></div>
            <div><label className="block text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider">Kind</label>
              <select value={form.project_kind} onChange={e => setForm(p => ({ ...p, project_kind: e.target.value }))} className={inp}>
                <option value="">—</option><option value="growth">📈 Growth</option><option value="digital">💻 Digital</option>
              </select></div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-text-tertiary hover:text-text-primary">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-xl text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}Salva
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

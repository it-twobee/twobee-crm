'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ProjectKind } from '@/lib/types/database'

interface Client { id: string; company_name: string }

interface Props {
  dept: ProjectKind
  clients: Client[]
  onClose: () => void
  onCreated: (p: { id: string; name: string; status: string; project_type: string; client_id: string | null; client_name: string | null; tasks: never[] }) => void
}

const PROJECT_TYPES = [
  { value: 'campagna',  label: '📣 Campagna Performance' },
  { value: 'ecommerce', label: '🛒 E-commerce' },
  { value: 'lead_gen',  label: '🎯 Lead Generation' },
  { value: 'app_ai',    label: '🤖 App AI / Custom' },
  { value: 'sito_web',  label: '🌐 Sito Web / Landing' },
  { value: 'custom',    label: '📁 Personalizzato' },
]

const DEPT_DEFAULT_TYPE: Record<ProjectKind, string> = {
  growth:    'campagna',
  marketing: 'campagna',
  digital:   'sito_web',
  ai:        'app_ai',
}

export function CreateProjectModal({ dept, clients, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: '',
    client_id: '',
    project_type: DEPT_DEFAULT_TYPE[dept],
    description: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inp = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold transition-colors'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setLoading(true)
    setError(null)
    const sb = createClient()
    const { data, error: err } = await sb.from('projects').insert({
      name: form.name.trim(),
      client_id: form.client_id || null,
      project_type: form.project_type,
      project_kind: dept,
      description: form.description || null,
      status: 'attivo',
    }).select('id, name, status, project_type, client_id').single()

    setLoading(false)
    if (err) { setError(err.message); return }

    const client = clients.find(c => c.id === form.client_id)
    onCreated({
      ...(data as any),
      client_name: client?.company_name ?? null,
      tasks: [],
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-black text-text-primary">Nuovo Progetto</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-text-tertiary mb-1.5">Nome progetto *</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="es. Campagna Q3 2025"
              className={inp}
              required
            />
          </div>

          <div>
            <label className="block text-xs text-text-tertiary mb-1.5">Cliente</label>
            <select
              value={form.client_id}
              onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
              className={inp}>
              <option value="">— Nessun cliente</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-text-tertiary mb-1.5">Tipo progetto</label>
            <select
              value={form.project_type}
              onChange={e => setForm(p => ({ ...p, project_type: e.target.value }))}
              className={inp}>
              {PROJECT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-text-tertiary mb-1.5">Descrizione</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Obiettivo del progetto…"
              rows={3}
              className={inp + ' resize-none'}
            />
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-tertiary hover:text-text-primary transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={loading || !form.name.trim()}
              className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Crea Progetto
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

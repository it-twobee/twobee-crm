'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Lightbulb, Plus, X, Loader2, Link2, FileText, Trash2, Search, ExternalLink,
} from 'lucide-react'

interface BestIdea {
  id: string
  title: string
  url: string | null
  file_path: string | null
  file_name: string | null
  note: string | null
  tags: string[]
  created_by: string | null
  created_at: string
}

const BUCKET = 'best-ideas'

/** Dominio leggibile, per capire da dove viene un link senza aprirlo. */
function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export function BestIdeasBoard({ currentProfileId }: { currentProfileId: string }) {
  const [ideas, setIdeas] = useState<BestIdea[]>([])
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const load = async () => {
    const { data, error } = await createClient()
      .from('chat_best_ideas').select('*').order('created_at', { ascending: false })
    if (error) {
      if (error.code === 'PGRST205') setMissingTable(true)
      else toast.error(error.message)
      setLoading(false)
      return
    }
    setIdeas((data ?? []) as BestIdea[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const allTags = useMemo(
    () => Array.from(new Set(ideas.flatMap(i => i.tags))).sort(),
    [ideas],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ideas.filter(i => {
      if (activeTag && !i.tags.includes(activeTag)) return false
      if (q && !`${i.title} ${i.note ?? ''} ${i.tags.join(' ')}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [ideas, query, activeTag])

  const remove = async (id: string) => {
    const { error } = await createClient().from('chat_best_ideas').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setIdeas(prev => prev.filter(i => i.id !== id))
    toast.success('Risorsa eliminata')
  }

  if (missingTable) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-warning/30 bg-warning-dim p-5 text-center">
          <p className="text-sm font-bold text-text-primary mb-1">Configurazione incompleta</p>
          <p className="text-sm text-text-secondary">
            Esegui <code className="text-xs bg-surface px-1.5 py-0.5 rounded border border-border">090_chat_rework.sql</code> e
            crea il bucket <strong>{BUCKET}</strong>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="shrink-0 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-4 h-4 text-gold-text shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-text-primary">best-ideas</h2>
            <p className="text-2xs text-text-tertiary">Link, screenshot e documenti che vale la pena tenere</p>
          </div>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-on-gold text-xs font-semibold rounded-lg hover:bg-gold/90 transition-colors shrink-0">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Aggiungi
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[10rem]">
            <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Cerca…" aria-label="Cerca fra le risorse"
              className="w-full bg-surface border border-border-interactive rounded-lg pl-8 pr-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/40" />
          </div>
          {allTags.map(t => (
            <button key={t} onClick={() => setActiveTag(activeTag === t ? null : t)}
              aria-pressed={activeTag === t}
              className={`px-2 py-1 rounded-lg text-2xs font-medium transition-colors ${
                activeTag === t ? 'bg-gold-dim text-gold-text' : 'bg-surface text-text-tertiary hover:text-text-primary'
              }`}>
              #{t}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" aria-hidden="true" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <p className="text-center py-16 text-sm text-text-tertiary">
            {ideas.length === 0 ? 'Nessuna risorsa ancora. Aggiungi il primo link o documento.' : 'Nessun risultato.'}
          </p>
        )}

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(idea => (
            <li key={idea.id}
              className="group rounded-xl border border-border bg-surface p-4 hover:border-border-strong transition-colors">
              <div className="flex items-start gap-2 mb-2">
                {idea.url
                  ? <Link2 className="w-4 h-4 text-info shrink-0 mt-0.5" aria-hidden="true" />
                  : <FileText className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />}
                <p className="flex-1 text-sm font-medium text-text-primary leading-snug">{idea.title}</p>
                {(idea.created_by === currentProfileId) && (
                  <button onClick={() => remove(idea.id)} aria-label={`Elimina ${idea.title}`}
                    className="p-1 rounded text-text-tertiary hover:text-error opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0">
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              {idea.note && <p className="text-2xs text-text-tertiary mb-2 line-clamp-2">{idea.note}</p>}

              {idea.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {idea.tags.map(t => (
                    <span key={t} className="text-2xs px-1.5 py-0.5 rounded bg-surface-active text-text-tertiary">#{t}</span>
                  ))}
                </div>
              )}

              {idea.url && (
                <a href={idea.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-2xs text-info hover:underline">
                  {hostOf(idea.url)} <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                </a>
              )}
              {idea.file_name && !idea.url && (
                <span className="text-2xs text-text-tertiary truncate block">{idea.file_name}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {showNew && (
        <NewIdeaModal
          profileId={currentProfileId}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load() }}
        />
      )}
    </div>
  )
}

function NewIdeaModal({ profileId, onClose, onSaved }: {
  profileId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) { toast.error('Il titolo è obbligatorio'); return }
    if (!url.trim() && !file) { toast.error('Serve un link oppure un file'); return }
    setSaving(true)
    const sb = createClient()

    let filePath: string | null = null
    if (file) {
      const ext = file.name.split('.').pop() ?? 'bin'
      const path = `${profileId}/${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file)
      if (upErr) { setSaving(false); toast.error(`Upload fallito: ${upErr.message}`); return }
      filePath = path
    }

    const { error } = await sb.from('chat_best_ideas').insert({
      title: title.trim(),
      url: url.trim() || null,
      file_path: filePath,
      file_name: file?.name ?? null,
      note: note.trim() || null,
      tags: tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean),
      created_by: profileId,
    } as never)

    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Risorsa aggiunta')
    onSaved()
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="new-idea-title"
      className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 id="new-idea-title" className="text-sm font-bold text-text-primary">Nuova risorsa</h2>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label htmlFor="bi-title" className="text-text-tertiary text-xs mb-1.5 block">Titolo *</label>
            <input id="bi-title" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
          </div>
          <div>
            <label htmlFor="bi-url" className="text-text-tertiary text-xs mb-1.5 block">Link</label>
            <input id="bi-url" type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://…"
              className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
          </div>
          <div>
            <label htmlFor="bi-file" className="text-text-tertiary text-xs mb-1.5 block">Oppure un file</label>
            <input id="bi-file" type="file" onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-text-secondary file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-surface-active file:text-text-primary file:text-xs" />
          </div>
          <div>
            <label htmlFor="bi-tags" className="text-text-tertiary text-xs mb-1.5 block">Tag (separati da virgola)</label>
            <input id="bi-tags" value={tags} onChange={e => setTags(e.target.value)}
              placeholder="design, copy, ads"
              className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
          </div>
          <div>
            <label htmlFor="bi-note" className="text-text-tertiary text-xs mb-1.5 block">Nota</label>
            <textarea id="bi-note" rows={2} value={note} onChange={e => setNote(e.target.value)}
              className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40 resize-none" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" aria-hidden="true" /> : 'Aggiungi'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-text-tertiary text-sm rounded-xl hover:text-text-primary transition-colors">
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}

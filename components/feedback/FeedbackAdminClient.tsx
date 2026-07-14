'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronUp, Filter, Plus, X, Loader2, ImagePlus } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { createFeedback, voteFeedback, setFeedbackStatus } from '@/app/actions/feedback'
import { ImagePicker, AttachmentThumbs, uploadFeedbackImages, MAX_IMAGES } from './attachments'
import { FeedbackItem, FeedbackSection, FeedbackKind, FeedbackStatus, STATUS_LABELS, STATUS_STYLE, KIND_LABELS, IMPACT_LABELS } from './types'

const STATUSES: FeedbackStatus[] = ['nuovo', 'in_valutazione', 'pianificato', 'in_corso', 'realizzato', 'archiviato']
const inputCls = 'w-full bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold'

export function FeedbackAdminClient({ sections, feedback, votedIds }: {
  sections: FeedbackSection[]
  feedback: FeedbackItem[]
  votedIds: string[]
}) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'tutti'>('tutti')
  const [sectionFilter, setSectionFilter] = useState<string>('tutte')
  const [votedSet, setVotedSet] = useState<Set<string>>(new Set(votedIds))
  const [busy, setBusy] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  const sectionLabel = useMemo(() => Object.fromEntries(sections.map(s => [s.key, s.label])), [sections])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of feedback) c[f.status] = (c[f.status] ?? 0) + 1
    return c
  }, [feedback])

  const list = feedback.filter(f =>
    (statusFilter === 'tutti' || f.status === statusFilter) &&
    (sectionFilter === 'tutte'
      || (sectionFilter === '__new__' ? f.kind === 'new_section' : f.target_section_key === sectionFilter)),
  )

  const changeStatus = async (id: string, status: FeedbackStatus) => {
    setBusy(id)
    const r = await setFeedbackStatus(id, status, feedback.find(f => f.id === id)?.admin_note ?? undefined)
    setBusy(null)
    if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
    router.refresh()
  }

  const saveNote = async (id: string, note: string, status: FeedbackStatus) => {
    setBusy(id)
    const r = await setFeedbackStatus(id, status, note)
    setBusy(null)
    if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
    toast.success('Risposta salvata'); router.refresh()
  }

  const vote = async (id: string) => {
    const on = !votedSet.has(id)
    setBusy(id)
    const r = await voteFeedback(id, on)
    setBusy(null)
    if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
    setVotedSet(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })
    router.refresh()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Feedback & Idee</h1>
          <p className="text-text-secondary text-sm mt-1">Raccolta strutturata dal team e dagli admin, legata alle sezioni della piattaforma.</p>
        </div>
        <button onClick={() => setComposing(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-gold text-on-gold rounded-xl text-sm font-bold hover:bg-gold/90 transition-colors shrink-0">
          <Plus className="w-4 h-4" /> Nuovo
        </button>
      </header>

      {/* KPI stato */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatusFilter(statusFilter === s ? 'tutti' : s)}
            className={`p-3 rounded-xl border text-left transition-colors ${
              statusFilter === s ? 'border-gold bg-gold-dim' : 'border-border bg-surface hover:border-border-strong'}`}>
            <p className="text-xl font-bold text-text-primary">{counts[s] ?? 0}</p>
            <p className="text-2xs text-text-tertiary">{STATUS_LABELS[s]}</p>
          </button>
        ))}
      </div>

      {/* Filtro sezione */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-text-tertiary" />
        <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}
          className="bg-surface border border-border-interactive rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold">
          <option value="tutte">Tutte le sezioni</option>
          <option value="__new__">Proposte di nuove sezioni</option>
          {sections.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {statusFilter !== 'tutti' && (
          <button onClick={() => setStatusFilter('tutti')} className="text-2xs text-text-tertiary hover:text-text-primary flex items-center gap-1">
            <X className="w-3 h-3" /> {STATUS_LABELS[statusFilter]}
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {list.map(f => (
          <AdminRow key={f.id} f={f} sectionLabel={sectionLabel}
            voted={votedSet.has(f.id)} busy={busy === f.id}
            onVote={() => vote(f.id)} onStatus={s => changeStatus(f.id, s)} onSaveNote={(note, s) => saveNote(f.id, note, s)} />
        ))}
        {list.length === 0 && <p className="text-sm text-text-tertiary text-center py-12">Nessun feedback con questi filtri.</p>}
      </div>

      {composing && (
        <ComposerModal sections={sections} onClose={() => setComposing(false)}
          onCreated={() => { setComposing(false); toast.success('Feedback aggiunto'); router.refresh() }} />
      )}
    </div>
  )
}

function AdminRow({ f, sectionLabel, voted, busy, onVote, onStatus, onSaveNote }: {
  f: FeedbackItem
  sectionLabel: Record<string, string>
  voted: boolean
  busy: boolean
  onVote: () => void
  onStatus: (s: FeedbackStatus) => void
  onSaveNote: (note: string, s: FeedbackStatus) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState(f.admin_note ?? '')

  return (
    <article className="p-4 rounded-xl border border-border bg-surface">
      <div className="flex gap-3">
        <button onClick={onVote} disabled={busy} aria-label="Vota"
          className={`flex flex-col items-center justify-center w-11 shrink-0 rounded-lg border transition-colors ${
            voted ? 'border-gold bg-gold-dim text-gold-text' : 'border-border text-text-tertiary hover:text-text-primary'}`}>
          <ChevronUp className="w-4 h-4" />
          <span className="text-xs font-bold tabular">{f.vote_count}</span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xs text-text-tertiary">{KIND_LABELS[f.kind]}</span>
            {f.target_section_key && <span className="text-2xs text-text-tertiary">· {sectionLabel[f.target_section_key] ?? f.target_section_key}</span>}
            {f.proposed_section_name && <span className="text-2xs text-gold-text">· nuova: {f.proposed_section_name}</span>}
            <span className="text-2xs text-text-tertiary">· {IMPACT_LABELS[f.impact]}</span>
            <span className="text-2xs text-text-tertiary">· {f.source_portal === 'admin' ? 'da admin' : 'da operativo'}</span>
          </div>
          <button onClick={() => setExpanded(e => !e)} className="text-sm font-semibold text-text-primary mt-1 text-left hover:text-gold-text transition-colors">
            {f.title}
          </button>
          <p className={`text-xs text-text-secondary mt-0.5 whitespace-pre-line ${expanded ? '' : 'line-clamp-2'}`}>{f.description}</p>

          <AttachmentThumbs attachments={f.attachments} size="sm" />

          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="w-5 h-5 rounded-full bg-surface-active text-text-secondary text-[9px] font-bold flex items-center justify-center overflow-hidden shrink-0">
              {f.author?.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={f.author.avatar_url} alt="" className="w-full h-full object-cover" />
                : getInitials(f.author?.full_name ?? 'Anonimo')}
            </span>
            <span className="text-2xs text-text-tertiary">
              {f.author?.full_name ?? 'Anonimo'} · {formatDistanceToNow(new Date(f.created_at), { addSuffix: true, locale: it })}
            </span>
          </div>

          {expanded && (
            <div className="mt-3 space-y-2">
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder="Risposta / nota interna (visibile all'autore)" className={`${inputCls} resize-none`} />
              <button onClick={() => onSaveNote(note, f.status)} disabled={busy}
                className="text-xs font-semibold text-gold-text hover:opacity-80 disabled:opacity-50">Salva risposta</button>
            </div>
          )}
        </div>

        <div className="shrink-0">
          <span className={`inline-block text-2xs font-semibold px-2 py-0.5 rounded-full mb-1.5 ${STATUS_STYLE[f.status]}`}>{STATUS_LABELS[f.status]}</span>
          <select value={f.status} onChange={e => onStatus(e.target.value as FeedbackStatus)} disabled={busy}
            className="block bg-background border border-border-interactive rounded-lg px-2 py-1 text-2xs text-text-primary focus:outline-none focus:border-gold">
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
      </div>
    </article>
  )
}

function ComposerModal({ sections, onClose, onCreated }: {
  sections: FeedbackSection[]; onClose: () => void; onCreated: () => void
}) {
  const [kind, setKind] = useState<FeedbackKind>('improvement')
  const [sectionKey, setSectionKey] = useState('')
  const [newName, setNewName] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [impact, setImpact] = useState<'bassa' | 'media' | 'alta'>('media')
  const [images, setImages] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const r = await createFeedback({
      sourcePortal: 'admin', kind,
      targetSectionKey: kind === 'improvement' ? sectionKey : null,
      proposedSectionName: kind === 'new_section' ? newName : null,
      title, description, impact,
    })
    if (!r.ok || !r.id) { setSaving(false); toast.error(r.error ?? 'Errore'); return }
    if (images.length) {
      const { failed } = await uploadFeedbackImages(r.id, images)
      if (failed) toast.warning(`${failed} immagine/i non caricate`)
    }
    setSaving(false)
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-text-primary">Nuovo feedback</h3>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>
        <select value={kind} onChange={e => setKind(e.target.value as FeedbackKind)} className={inputCls}>
          <option value="improvement">Miglioramento di una sezione</option>
          <option value="new_section">Proposta di nuova sezione</option>
          <option value="idea">Idea</option>
          <option value="bug">Problema</option>
        </select>
        {kind === 'improvement' && (
          <select value={sectionKey} onChange={e => setSectionKey(e.target.value)} className={inputCls}>
            <option value="">Seleziona sezione…</option>
            {sections.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        )}
        {kind === 'new_section' && (
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome nuova sezione" className={inputCls} />
        )}
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo" className={inputCls} />
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Descrizione" className={`${inputCls} resize-none`} />
        <div>
          <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <ImagePlus className="w-3.5 h-3.5" /> Screenshot <span className="normal-case tracking-normal font-normal text-text-tertiary/70">— facoltativi, max {MAX_IMAGES}</span>
          </p>
          <ImagePicker files={images} onChange={setImages} disabled={saving} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {(['bassa', 'media', 'alta'] as const).map(i => (
              <button key={i} onClick={() => setImpact(i)}
                className={`px-3 py-1.5 rounded-lg text-2xs font-semibold capitalize border transition-colors ${
                  impact === i ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:text-text-primary'}`}>{i}</button>
            ))}
          </div>
          <button onClick={submit} disabled={saving || !title.trim() || !description.trim()}
            className="px-5 py-2 bg-gold text-on-gold rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-gold/90 transition-colors flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Invia
          </button>
        </div>
      </div>
    </div>
  )
}

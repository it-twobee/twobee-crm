'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale'
import { Lightbulb, Wand2, PlusSquare, ChevronUp, Loader2, ImagePlus } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { createFeedback, voteFeedback } from '@/app/actions/feedback'
import { ImagePicker, AttachmentThumbs, uploadFeedbackImages, MAX_IMAGES } from './attachments'
import { FeedbackItem, FeedbackSection, FeedbackKind, STATUS_LABELS, STATUS_STYLE, KIND_LABELS, IMPACT_LABELS } from './types'

type FormKind = Extract<FeedbackKind, 'improvement' | 'new_section' | 'idea'>

const TYPE_CARDS: { kind: FormKind; icon: React.ReactNode; title: string; desc: string }[] = [
  { kind: 'improvement', icon: <Wand2 className="w-5 h-5" />, title: 'Migliora una sezione', desc: 'Un affinamento a una sezione che già usi' },
  { kind: 'new_section', icon: <PlusSquare className="w-5 h-5" />, title: 'Proponi una nuova sezione', desc: 'Una sezione integrativa da creare da zero' },
  { kind: 'idea', icon: <Lightbulb className="w-5 h-5" />, title: 'Idea o problema', desc: 'Un’intuizione o qualcosa che non va' },
]

const inputCls = 'w-full bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold'

export function FeedbackWorkspaceClient({ currentUserId, sections, feedback, votedIds }: {
  currentUserId: string
  sections: FeedbackSection[]
  feedback: FeedbackItem[]
  votedIds: string[]
}) {
  const router = useRouter()
  const [kind, setKind] = useState<FormKind>('improvement')
  const [sectionKey, setSectionKey] = useState('')
  const [newName, setNewName] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [impact, setImpact] = useState<'bassa' | 'media' | 'alta'>('media')
  const [images, setImages] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'mie' | 'tutte'>('tutte')
  const [votedSet, setVotedSet] = useState<Set<string>>(new Set(votedIds))
  const [voting, setVoting] = useState<string | null>(null)

  const sectionLabel = useMemo(
    () => Object.fromEntries(sections.map(s => [s.key, s.label])),
    [sections],
  )

  const submit = async () => {
    setSaving(true)
    const r = await createFeedback({
      sourcePortal: 'workspace', kind,
      targetSectionKey: kind === 'improvement' ? sectionKey : null,
      proposedSectionName: kind === 'new_section' ? newName : null,
      title, description, impact,
    })
    if (!r.ok || !r.id) { setSaving(false); toast.error(r.error ?? 'Errore'); return }

    if (images.length) {
      const { failed } = await uploadFeedbackImages(r.id, images)
      if (failed) toast.warning(`${failed} immagine/i non caricate, il resto è stato inviato`)
    }
    setSaving(false)
    toast.success('Feedback inviato, grazie!')
    setTitle(''); setDescription(''); setSectionKey(''); setNewName(''); setImpact('media'); setImages([])
    router.refresh()
  }

  const vote = async (id: string) => {
    const on = !votedSet.has(id)
    setVoting(id)
    const r = await voteFeedback(id, on)
    setVoting(null)
    if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
    setVotedSet(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })
    router.refresh()
  }

  const list = feedback.filter(f => tab === 'tutte' || f.author_id === currentUserId)

  const canSubmit = title.trim() && description.trim()
    && (kind !== 'improvement' || sectionKey)
    && (kind !== 'new_section' || newName.trim())

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Feedback</h1>
        <p className="text-text-secondary text-sm mt-1">
          Aiutaci a migliorare gli strumenti che usi ogni giorno. Proponi un affinamento a una
          sezione esistente o l&apos;idea di una sezione tutta nuova.
        </p>
      </header>

      {/* Form guidato, verticale */}
      <section className="rounded-2xl border border-border bg-surface p-5 space-y-5">
        <div>
          <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">1 · Cosa vuoi proporre?</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {TYPE_CARDS.map(c => (
              <button key={c.kind} onClick={() => setKind(c.kind)}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  kind === c.kind ? 'border-gold bg-gold-dim' : 'border-border hover:border-border-strong'}`}>
                <span className={kind === c.kind ? 'text-gold-text' : 'text-text-tertiary'}>{c.icon}</span>
                <p className="text-sm font-semibold text-text-primary mt-2">{c.title}</p>
                <p className="text-2xs text-text-tertiary mt-0.5 leading-snug">{c.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {kind === 'improvement' && (
          <div>
            <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">2 · Quale sezione?</p>
            <select value={sectionKey} onChange={e => setSectionKey(e.target.value)} className={inputCls}>
              <option value="">Seleziona la sezione…</option>
              {sections.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        )}
        {kind === 'new_section' && (
          <div>
            <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">2 · Nome della nuova sezione</p>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Es. Report settimanale automatico" className={inputCls} />
          </div>
        )}

        <div>
          <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
            {kind === 'idea' ? '2' : '3'} · In una frase
          </p>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Il titolo della tua proposta" className={inputCls} />
        </div>

        <div>
          <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
            {kind === 'idea' ? '3' : '4'} · Raccontaci di più
          </p>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            placeholder="Cosa succede oggi, cosa vorresti, e perché ti aiuterebbe." className={`${inputCls} resize-none`} />
        </div>

        <div>
          <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ImagePlus className="w-3.5 h-3.5" /> Screenshot <span className="text-text-tertiary/70 normal-case tracking-normal font-normal">— facoltativi, max {MAX_IMAGES}</span>
          </p>
          <ImagePicker files={images} onChange={setImages} disabled={saving} />
          <p className="text-2xs text-text-tertiary mt-2 leading-snug">Un&apos;immagine di com&apos;è oggi ci aiuta a capire meglio cosa ottimizzare.</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {(['bassa', 'media', 'alta'] as const).map(i => (
              <button key={i} onClick={() => setImpact(i)}
                className={`px-3 py-1.5 rounded-lg text-2xs font-semibold capitalize transition-colors border ${
                  impact === i ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:text-text-primary'}`}>
                {i}
              </button>
            ))}
          </div>
          <button onClick={submit} disabled={saving || !canSubmit}
            className="px-5 py-2 bg-gold text-on-gold rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-gold/90 transition-colors flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Invia
          </button>
        </div>
      </section>

      {/* Bacheca */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-text-primary">Proposte del team</h2>
          <span className="text-2xs text-text-tertiary">{list.length}</span>
          <div className="ml-auto flex bg-surface border border-border rounded-lg p-0.5">
            {(['tutte', 'mie'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                  tab === t ? 'bg-gold text-on-gold' : 'text-text-tertiary hover:text-text-primary'}`}>
                {t === 'tutte' ? 'Tutte' : 'Le mie'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {list.map(f => (
            <WorkspaceCard key={f.id} f={f} sectionLabel={sectionLabel}
              voted={votedSet.has(f.id)} voting={voting === f.id} onVote={() => vote(f.id)} />
          ))}
          {list.length === 0 && (
            <div className="text-center py-12 rounded-xl border border-dashed border-border">
              <Lightbulb className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
              <p className="text-sm text-text-tertiary">
                {tab === 'mie' ? 'Non hai ancora inviato proposte.' : 'Nessuna proposta ancora. Inizia tu!'}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function WorkspaceCard({ f, sectionLabel, voted, voting, onVote }: {
  f: FeedbackItem
  sectionLabel: Record<string, string>
  voted: boolean
  voting: boolean
  onVote: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isLong = f.description.length > 160 || f.description.includes('\n')

  return (
    <article className="flex gap-3 p-4 rounded-xl border border-border bg-surface">
      <button onClick={onVote} disabled={voting}
        aria-label={voted ? 'Togli voto' : 'Vota'}
        className={`flex flex-col items-center justify-center w-11 h-12 shrink-0 rounded-lg border transition-colors ${
          voted ? 'border-gold bg-gold-dim text-gold-text' : 'border-border text-text-tertiary hover:text-text-primary'}`}>
        {voting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronUp className="w-4 h-4" />}
        <span className="text-xs font-bold tabular">{f.vote_count}</span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[f.status]}`}>{STATUS_LABELS[f.status]}</span>
          <span className="text-2xs text-text-tertiary">{KIND_LABELS[f.kind]}</span>
          {f.target_section_key && (
            <span className="text-2xs text-text-tertiary">· {sectionLabel[f.target_section_key] ?? f.target_section_key}</span>
          )}
          {f.proposed_section_name && <span className="text-2xs text-gold-text">· {f.proposed_section_name}</span>}
          <span className="text-2xs text-text-tertiary">· {IMPACT_LABELS[f.impact]}</span>
        </div>
        <p className="text-sm font-semibold text-text-primary mt-1">{f.title}</p>
        <p className={`text-xs text-text-secondary mt-0.5 whitespace-pre-line ${expanded || !isLong ? '' : 'line-clamp-2'}`}>{f.description}</p>
        {isLong && (
          <button onClick={() => setExpanded(e => !e)} className="text-2xs font-semibold text-gold-text hover:opacity-80 mt-1">
            {expanded ? 'Mostra meno' : 'Mostra tutto'}
          </button>
        )}

        <AttachmentThumbs attachments={f.attachments} />

        <div className="flex items-center gap-1.5 mt-2">
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

        {f.admin_note && (
          <p className="text-2xs text-text-secondary mt-2 p-2 rounded-lg bg-surface-hover border border-border">
            <span className="font-semibold text-gold-text">Risposta: </span>{f.admin_note}
          </p>
        )}
      </div>
    </article>
  )
}

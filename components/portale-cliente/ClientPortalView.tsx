'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Check, Eye, FolderKanban, BarChart3, FileText,
  Star, ChevronRight, ChevronDown, MessageCircle, MessageSquare,
  Send, Loader2, Trash2, Reply, FolderOpen, ExternalLink, X,
  Layout, ListChecks, Bell, Headphones, Receipt,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SlackChat } from '@/components/chat/SlackChat'
import { DriveEmbed } from '@/components/shared/DriveEmbed'
import { isDriveUrl, driveKind } from '@/lib/drive'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { timeAgo, UPDATE_TAGS, type ProjectComment } from '@/components/projects/project-shared'
import { PHASE_LABEL, PHASE_COLOR } from '@/lib/reparti-constants'
import type { Client, Project, Sprint, Task, ClientKpi, Invoice, Profile, Document } from '@/lib/types/database'

// ── Light-mode palette ──
const bg     = '#F7F7F5'
const card   = '#FFFFFF'
const border = '#E8E5DF'
const t1     = 'var(--color-surface)'
const t2     = '#6B6B6B'
const t3     = '#9B9B9B'
const gold   = 'var(--color-gold-text)'
const goldBg = '#FDF8E8'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    attivo:      { label: 'Attivo',      bg: '#ECFDF5', color: 'var(--color-success)' },
    in_corso:    { label: 'In corso',    bg: goldBg,    color: gold },
    completato:  { label: 'Completato',  bg: '#ECFDF5', color: 'var(--color-success)' },
    in_pausa:    { label: 'In pausa',    bg: 'var(--color-surface-hover)', color: 'var(--color-text-tertiary)' },
    da_fare:     { label: 'Da fare',     bg: 'var(--color-surface-hover)', color: 'var(--color-text-tertiary)' },
    pianificato: { label: 'Pianificato', bg: '#EFF6FF', color: '#2563EB' },
  }
  const s = map[status] ?? { label: status, bg: 'var(--color-surface-hover)', color: 'var(--color-text-tertiary)' }
  return (
    <span className="text-2xs font-bold px-2.5 py-1 rounded-full"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  )
}

// ─── Task card ───────────────────────────────────────────────────────────────
function ClientTaskCard({ task }: { task: Task }) {
  const [done, setDone]     = useState(task.status === 'completato')
  const [saving, setSaving] = useState(false)
  const isOver = !done && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)

  const toggle = async () => {
    if (saving) return
    setSaving(true)
    const next = done ? 'da_fare' : 'completato'
    const { error } = await createClient().from('tasks').update({ status: next }).eq('id', task.id)
    setSaving(false)
    if (error) { toast.error('Errore'); return }
    setDone(!done)
    if (!done) toast.success('Completato!')
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all ${
      done ? 'bg-success border-success opacity-60' :
      isOver ? 'bg-error border-error' :
      'bg-surface border-border hover:border-gold/40 hover:shadow-sm'}`}>
      <button onClick={toggle} disabled={saving}
        className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
          done ? 'bg-success border-success' : 'border-border hover:border-gold'}`}>
        {done && <Check className="w-3 h-3 text-text-primary" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${done ? 'line-through text-text-secondary' : 'text-text-tertiary font-medium'}`}>{task.title}</p>
        {(task as any).hint && <p className="text-2xs text-text-secondary mt-0.5">{(task as any).hint}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isOver && <span className="text-2xs text-error font-bold">scaduta</span>}
        {task.due_date && !isOver && !done && (
          <span className="text-2xs text-text-secondary">
            {new Date(task.due_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Project progress card ────────────────────────────────────────────────────
function ProjectCard({ project, sprints }: { project: Project; sprints: Sprint[] }) {
  const [open, setOpen] = useState(false)
  const pSprints     = sprints.filter(s => s.project_id === project.id)
  const activeSprint = pSprints.find(s => s.status === 'in_corso')
  const sprintsDone  = pSprints.filter(s => s.status === 'completato').length
  const pct          = pSprints.length > 0 ? Math.round((sprintsDone / pSprints.length) * 100) : 0

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-background transition-colors text-left">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: project.status === 'attivo' ? 'var(--color-gold-text)' : '#D4D4D4' }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-tertiary truncate">{project.name}</p>
          <p className="text-2xs text-text-secondary mt-0.5 capitalize">
            {project.project_type?.replace('_', ' ')}
            {activeSprint ? ` · Sprint: ${activeSprint.name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {pSprints.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 bg-background rounded-full overflow-hidden">
                <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-2xs text-text-secondary font-medium">{pct}%</span>
            </div>
          )}
          <StatusBadge status={project.status} />
          {open ? <ChevronDown className="w-3.5 h-3.5 text-text-secondary" /> : <ChevronRight className="w-3.5 h-3.5 text-text-secondary" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-5 py-4 bg-background space-y-2">
          {pSprints.length > 0 ? (
            <>
              <p className="text-2xs font-bold text-text-secondary uppercase tracking-wider mb-2">Sprint</p>
              {pSprints.map(s => {
                const isDone = s.status === 'completato'
                const isAct  = s.status === 'in_corso'
                return (
                  <div key={s.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                    isDone ? 'bg-success border-success' :
                    isAct ? 'bg-warning border-warning' :
                    'bg-surface border-border'}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isDone ? 'bg-success' : isAct ? 'bg-warning' : 'bg-[#D4D4D4]'}`} />
                    <span className={`flex-1 text-xs font-medium ${isDone ? 'text-success' : isAct ? 'text-warning' : 'text-text-secondary'}`}>{s.name}</span>
                    {s.start_date && s.end_date && (
                      <span className="text-2xs text-text-secondary">
                        {new Date(s.start_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} → {new Date(s.end_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                )
              })}
            </>
          ) : (
            <p className="text-xs text-text-secondary text-center py-4">Nessuno sprint pianificato</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── KPI card ────────────────────────────────────────────────────────────────
function KpiRow({ kpi }: { kpi: ClientKpi }) {
  const fields = [
    { label: 'Revenue',   val: kpi.revenue_attributed != null ? formatCurrency(kpi.revenue_attributed) : null },
    { label: 'Lead',      val: kpi.leads_generated != null ? String(kpi.leads_generated) : null },
    { label: 'ROAS',      val: kpi.roas != null ? `${kpi.roas}×` : null },
    { label: 'CTR',       val: kpi.ctr != null ? `${kpi.ctr}%` : null },
    { label: 'Conv.rate', val: kpi.conversion_rate != null ? `${kpi.conversion_rate}%` : null },
  ].filter(f => f.val !== null)

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <p className="text-2xs font-bold text-text-secondary uppercase tracking-wider mb-3">
        {new Date(kpi.month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
      </p>
      <div className="flex flex-wrap gap-6">
        {fields.map(f => (
          <div key={f.label}>
            <p className="text-2xs text-text-secondary mb-0.5">{f.label}</p>
            <p className="text-base font-bold text-text-tertiary">{f.val}</p>
          </div>
        ))}
        {fields.length === 0 && <p className="text-xs text-text-secondary">Nessun dato per questo mese</p>}
      </div>
    </div>
  )
}

// ─── Update post (aggiornamento) ──────────────────────────────────────────────
const TAG_STYLE_LIGHT: Record<string, string> = {
  'Milestone raggiunta': 'bg-success text-success border-success',
  'Blocco':              'bg-error text-error border-error',
  'Update settimanale':  'bg-warning text-warning border-warning',
  'Altro':               'bg-surface-hover text-text-secondary border-border',
}

function UpdatePost({ comment, allProfiles, projectName, currentProfile, onDelete }: {
  comment: ProjectComment; allProfiles: Profile[]; projectName: string; currentProfile: Profile; onDelete: (id: string) => void
}) {
  const [showReply, setShowReply] = useState(false)
  const [replies, setReplies]     = useState<ProjectComment[]>([])
  const [loadedReplies, setLoadedReplies] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending]     = useState(false)
  const author = allProfiles.find(p => p.id === comment.author_id)
  const isOwn  = comment.author_id === currentProfile.id
  const isTeam = !comment.is_client

  const loadReplies = async () => {
    if (loadedReplies) { setShowReply(r => !r); return }
    const { data } = await createClient().from('project_comments').select('*').eq('parent_id', comment.id).order('created_at')
    setReplies((data ?? []) as ProjectComment[])
    setLoadedReplies(true)
    setShowReply(true)
  }

  const sendReply = async () => {
    if (!replyText.trim() || sending) return
    setSending(true)
    const { data, error } = await createClient().from('project_comments')
      .insert({ project_id: comment.project_id, author_id: currentProfile.id, content: replyText.trim(), parent_id: comment.id, is_client: false, tag: null })
      .select().single()
    setSending(false)
    if (error) { toast.error(error.message); return }
    setReplies(r => [...r, data as ProjectComment])
    setReplyText('')
    toast.success('Risposta inviata')
  }

  const ini = author?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  return (
    <div className="group">
      <div className={`p-4 rounded-2xl border transition-all ${
        isTeam ? 'bg-surface border-border' : 'bg-warning border-warning'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-2xs font-bold ${
            isTeam ? 'bg-background text-text-secondary' : 'bg-warning text-warning'
          }`}>
            {author?.avatar_url
              ? <img src={author.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
              : ini}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-xs font-bold text-text-tertiary">{author?.full_name ?? 'Team TwoBee'}</span>
              {isTeam
                ? <span className="text-2xs font-bold px-1.5 py-0.5 rounded-full bg-background text-text-secondary">TEAM</span>
                : <span className="text-2xs font-bold px-1.5 py-0.5 rounded-full bg-warning text-warning">CLIENTE</span>
              }
              {comment.tag && (
                <span className={`text-2xs font-bold px-1.5 py-0.5 rounded-full border ${TAG_STYLE_LIGHT[comment.tag] ?? TAG_STYLE_LIGHT['Altro']}`}>
                  {comment.tag}
                </span>
              )}
              <span className="text-2xs text-text-secondary ml-auto">{timeAgo(comment.created_at)}</span>
              <span className="text-2xs text-text-secondary hidden sm:block">{projectName}</span>
            </div>
            <p className="text-sm text-text-tertiary leading-relaxed whitespace-pre-wrap">{comment.content}</p>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={loadReplies} className="p-1.5 rounded-lg text-text-secondary hover:text-text-tertiary hover:bg-background">
              <Reply className="w-3.5 h-3.5" />
            </button>
            {isOwn && (
              <button onClick={async () => { await createClient().from('project_comments').delete().eq('id', comment.id); onDelete(comment.id); toast.success('Eliminato') }}
                className="p-1.5 rounded-lg text-text-secondary hover:text-error hover:bg-error">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {showReply && (
          <div className="mt-3 ml-11 space-y-2">
            {replies.map(r => {
              const rAuthor = allProfiles.find(p => p.id === r.author_id)
              return (
                <div key={r.id} className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-background flex items-center justify-center text-2xs font-bold text-text-secondary shrink-0">
                    {rAuthor?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) ?? '?'}
                  </div>
                  <div className="flex-1 bg-background rounded-xl px-3 py-2 border border-border">
                    <span className="text-2xs font-bold text-text-tertiary">{rAuthor?.full_name ?? 'Utente'}</span>
                    <span className="text-2xs text-text-secondary ml-2">{timeAgo(r.created_at)}</span>
                    <p className="text-xs text-text-tertiary mt-0.5">{r.content}</p>
                  </div>
                </div>
              )
            })}
            <div className="flex gap-2 mt-2">
              <input value={replyText} onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendReply() }}
                placeholder="Scrivi una risposta…"
                className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-xs text-text-tertiary placeholder-text-tertiary focus:outline-none focus:border-gold" />
              <button onClick={sendReply} disabled={!replyText.trim() || sending}
                className="px-3 py-2 bg-background rounded-xl text-text-secondary hover:text-text-tertiary disabled:opacity-40 transition-colors">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Aggiornamenti tab ────────────────────────────────────────────────────────
function AggiornamentoTab({ comments: initialComments, projects, currentProfile, allProfiles }: {
  comments: ProjectComment[]; projects: Project[]; currentProfile: Profile; allProfiles: Profile[]
}) {
  const [comments, setComments] = useState(initialComments)
  const [text, setText]         = useState('')
  const [tag, setTag]           = useState(UPDATE_TAGS[0])
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [sending, setSending]   = useState(false)
  const [filterTag, setFilterTag] = useState<string>('tutti')

  const send = async () => {
    if (!text.trim() || !projectId || sending) return
    setSending(true)
    const { data, error } = await createClient().from('project_comments')
      .insert({ project_id: projectId, author_id: currentProfile.id, content: text.trim(), tag, is_client: false, parent_id: null })
      .select().single()
    setSending(false)
    if (error) { toast.error(error.message); return }
    setComments(c => [data as ProjectComment, ...c])
    setText('')
    toast.success('Aggiornamento pubblicato')
  }

  const filtered = filterTag === 'tutti' ? comments : comments.filter(c => c.tag === filterTag)

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {projects.length > 1 && (
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text-tertiary focus:outline-none">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <div className="flex gap-1 flex-wrap">
            {UPDATE_TAGS.map(t => (
              <button key={t} onClick={() => setTag(t)}
                className={`text-2xs font-bold px-2 py-1 rounded-full border transition-all ${
                  tag === t ? TAG_STYLE_LIGHT[t] ?? TAG_STYLE_LIGHT['Altro'] : 'border-border text-text-secondary hover:text-text-tertiary'
                }`}>{t}</button>
            ))}
          </div>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder="Scrivi un aggiornamento…"
          rows={3}
          className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-text-tertiary placeholder-text-tertiary focus:outline-none focus:border-gold resize-none" />
        <div className="flex justify-end">
          <button onClick={send} disabled={!text.trim() || sending}
            className="flex items-center gap-2 px-4 py-2 bg-surface text-text-primary text-xs font-bold rounded-xl disabled:opacity-40 hover:bg-surface-active transition-colors">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Pubblica
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {['tutti', ...UPDATE_TAGS].map(t => (
          <button key={t} onClick={() => setFilterTag(t)}
            className={`text-2xs font-bold px-2.5 py-1 rounded-full border transition-all capitalize ${
              filterTag === t ? 'bg-surface border-border text-text-primary' : 'border-border text-text-secondary hover:text-text-tertiary'
            }`}>{t}</button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <MessageCircle className="w-8 h-8 text-text-secondary mx-auto mb-3" />
            <p className="text-text-secondary text-sm">Nessun aggiornamento</p>
          </div>
        ) : filtered.map(c => (
          <UpdatePost key={c.id} comment={c} allProfiles={allProfiles}
            projectName={projects.find(p => p.id === c.project_id)?.name ?? ''}
            currentProfile={currentProfile}
            onDelete={id => setComments(prev => prev.filter(x => x.id !== id))} />
        ))}
      </div>
    </div>
  )
}

// ─── Chat tab ─────────────────────────────────────────────────────────────────
function ChatTab({ ccChannelId, client, currentProfile, allProfiles }: {
  ccChannelId: string | null; client: Client; currentProfile: Profile; allProfiles: Profile[]
}) {
  const [channelId, setChannelId] = useState<string | null>(ccChannelId)
  const [creating, setCreating]   = useState(false)

  const createChannel = async () => {
    setCreating(true)
    const slug = client.company_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const { data, error } = await createClient()
      .from('chat_channels')
      .insert({ name: `cc-${slug}`, type: 'customer_care', client_id: client.id, created_by: currentProfile.id })
      .select('id').single()
    setCreating(false)
    if (error) { toast.error(error.message); return }
    if (data) {
      await createClient().from('channel_members').insert({ channel_id: data.id, profile_id: currentProfile.id })
      setChannelId(data.id)
    }
  }

  if (!channelId) {
    return (
      <div className="flex flex-col items-center py-16 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-background flex items-center justify-center">
          <Headphones className="w-5 h-5 text-text-secondary" />
        </div>
        <p className="text-text-secondary text-sm">Nessun canale chat attivo</p>
        <button onClick={createChannel} disabled={creating}
          className="flex items-center gap-2 px-4 py-2 bg-surface text-text-primary text-xs font-bold rounded-xl hover:bg-surface-active disabled:opacity-40">
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
          Avvia chat con il team
        </button>
      </div>
    )
  }

  return (
    <div className="h-[600px] rounded-2xl overflow-hidden border border-border">
      <SlackChat
        channelId={channelId}
        channelName={`cc-${client.company_name}`}
        channelType="customer_care"
        currentProfile={currentProfile}
        allProfiles={allProfiles}
        isAdmin={true}
        isArchived={false}
        isReadOnly={false}
        clientId={client.id}
      />
    </div>
  )
}

// ─── Documenti tab ────────────────────────────────────────────────────────────
function DocumentiTab({ documents }: { documents: Document[] }) {
  const [preview, setPreview] = useState<Document | null>(null)
  const folders = documents.filter(d => driveKind(d.file_url) === 'folder')
  const files   = documents.filter(d => driveKind(d.file_url) !== 'folder')

  if (documents.length === 0) {
    return (
      <div className="text-center py-16">
        <FolderOpen className="w-8 h-8 text-text-secondary mx-auto mb-3" />
        <p className="text-text-secondary text-sm">Nessun documento condiviso</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {folders.map(d => <DriveEmbed key={d.id} url={d.file_url} title={d.name} height={460} />)}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(d => {
            const drive = isDriveUrl(d.file_url)
            return (
              <div key={d.id} className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3 hover:border-gold/40 transition-colors">
                <FileText className="w-4 h-4 text-text-secondary shrink-0" />
                <span className="flex-1 text-sm text-text-tertiary truncate font-medium">{d.name}</span>
                <span className="text-2xs text-text-secondary">{timeAgo(d.created_at)}</span>
                {drive ? (
                  <button onClick={() => setPreview(d)}
                    className="flex items-center gap-1 text-2xs font-bold text-gold-text hover:text-warning shrink-0">
                    <Eye className="w-3.5 h-3.5" /> Anteprima
                  </button>
                ) : (
                  <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-2xs font-bold text-gold-text hover:text-warning shrink-0">
                    <ExternalLink className="w-3.5 h-3.5" /> Apri
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/10 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setPreview(null) }}>
          <div className="w-full max-w-4xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-text-primary truncate">{preview.name}</p>
              <button onClick={() => setPreview(null)} className="text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
            </div>
            <DriveEmbed url={preview.file_url} title={preview.name} height={600} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
type PortalTab = 'panoramica' | 'progetti' | 'task' | 'aggiornamenti' | 'chat' | 'documenti' | 'kpi' | 'fatture'

const TAB_ICONS: Record<PortalTab, React.ReactNode> = {
  panoramica:    <Layout className="w-3.5 h-3.5" />,
  progetti:      <FolderKanban className="w-3.5 h-3.5" />,
  task:          <ListChecks className="w-3.5 h-3.5" />,
  aggiornamenti: <Bell className="w-3.5 h-3.5" />,
  chat:          <Headphones className="w-3.5 h-3.5" />,
  documenti:     <FolderOpen className="w-3.5 h-3.5" />,
  kpi:           <BarChart3 className="w-3.5 h-3.5" />,
  fatture:       <Receipt className="w-3.5 h-3.5" />,
}

export function ClientPortalView({ client, projects, sprints, clientTasks, kpis, invoices, ccChannelId, comments, documents, currentProfile, allProfiles, isPreview = true }: {
  client: Client; projects: Project[]; sprints: Sprint[]; clientTasks: Task[]; kpis: ClientKpi[]; invoices: Invoice[]
  ccChannelId: string | null; comments: ProjectComment[]; documents: Document[]
  currentProfile: Profile; allProfiles: Profile[]; isPreview?: boolean
}) {
  const [tab, setTab] = useState<PortalTab>('panoramica')

  const pendingTasks   = clientTasks.filter(t => t.status !== 'completato')
  const completedTasks = clientTasks.filter(t => t.status === 'completato')
  const activeProjects = projects.filter(p => p.status === 'attivo')
  const unpaidAmount   = invoices.filter(i => ['da_inviare', 'inviata', 'in_ritardo'].includes(i.status)).reduce((s, i) => s + i.amount, 0)

  const TABS: { id: PortalTab; label: string; badge?: number }[] = [
    { id: 'panoramica',    label: 'Panoramica' },
    { id: 'progetti',      label: 'Progetti',     badge: activeProjects.length },
    { id: 'task',           label: 'Da fare',       badge: pendingTasks.length > 0 ? pendingTasks.length : undefined },
    { id: 'aggiornamenti', label: 'Aggiornamenti', badge: comments.length > 0 ? comments.length : undefined },
    { id: 'chat',          label: 'Chat' },
    { id: 'documenti',     label: 'Documenti',     badge: documents.length > 0 ? documents.length : undefined },
    { id: 'kpi',           label: 'Report' },
    { id: 'fatture',       label: 'Fatture' },
  ]

  return (
    <div className="min-h-screen" style={{ background: bg }}>
      {/* Banner preview — solo super admin */}
      {isPreview && (
        <div className="bg-surface px-6 py-2.5 flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 text-gold-text" />
          <span className="text-xs text-text-primary font-medium">Stai visualizzando il portale come il cliente</span>
          <Link href="/portale-cliente" className="ml-auto text-2xs text-text-tertiary hover:text-text-primary flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Lista clienti
          </Link>
          <Link href={`/clienti/${client.id}`} className="text-2xs text-text-tertiary hover:text-text-primary flex items-center gap-1">
            Vista admin <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="bg-surface border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-surface flex items-center justify-center text-sm font-black text-text-primary">
              {client.company_name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-black text-text-tertiary">{client.company_name}</h1>
              <p className="text-xs text-text-secondary mt-0.5 capitalize">
                {client.client_type?.replace('_', '+')}
                {client.package ? ` · ${client.package}` : ''}
              </p>
            </div>
            {pendingTasks.length > 0 && (
              <button onClick={() => setTab('task')}
                className="flex items-center gap-2 bg-warning border border-warning rounded-xl px-3 py-2 hover:bg-warning transition-colors">
                <Star className="w-3.5 h-3.5 text-warning" />
                <span className="text-xs font-bold text-warning">{pendingTasks.length} da fare</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex gap-0.5 overflow-x-auto -mb-px">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-all border-b-2 shrink-0 ${
                  tab === t.id
                    ? 'border-border text-text-tertiary'
                    : 'border-transparent text-text-secondary hover:text-text-tertiary'
                }`}>
                {TAB_ICONS[t.id]}
                {t.label}
                {t.badge != null && t.badge > 0 && (
                  <span className={`text-2xs font-bold px-1.5 py-0.5 rounded-full ${
                    tab === t.id ? 'bg-surface text-text-primary' : 'bg-background text-text-secondary'
                  }`}>{t.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-6">

        {/* ── PANORAMICA ── */}
        {tab === 'panoramica' && (
          <div className="space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Progetti attivi', value: String(activeProjects.length), color: 'var(--color-surface)' },
                { label: 'Da completare',   value: String(pendingTasks.length),   color: pendingTasks.length > 0 ? 'var(--color-gold-text)' : 'var(--color-success)' },
                { label: 'Sprint in corso',  value: String(sprints.filter(s => s.status === 'in_corso').length), color: '#2563EB' },
                { label: 'Da pagare',       value: formatCurrency(unpaidAmount), color: unpaidAmount > 0 ? '#DC2626' : 'var(--color-success)' },
              ].map(s => (
                <div key={s.label} className="bg-surface border border-border rounded-2xl p-4">
                  <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold mb-2">{s.label}</p>
                  <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Azioni richieste */}
            {pendingTasks.length > 0 && (
              <div className="bg-warning border border-warning rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-warning" />
                  <span className="text-sm font-bold text-warning">Cosa ci serve da te</span>
                </div>
                <div className="space-y-2">
                  {pendingTasks.slice(0, 4).map(t => (
                    <div key={t.id} className="flex items-center gap-2.5">
                      <div className="w-4 h-4 rounded-full border-2 border-warning shrink-0" />
                      <span className="text-sm text-warning flex-1 truncate">{t.title}</span>
                      {t.due_date && (
                        <span className="text-2xs text-warning">
                          {new Date(t.due_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                    </div>
                  ))}
                  {pendingTasks.length > 4 && (
                    <button onClick={() => setTab('task')} className="text-2xs text-warning hover:text-warning font-bold flex items-center gap-1 mt-1">
                      +{pendingTasks.length - 4} altre <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Sprint attivi */}
            {sprints.filter(s => s.status === 'in_corso').length > 0 && (
              <div className="bg-surface border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <FolderKanban className="w-4 h-4 text-info" />
                  <span className="text-sm font-bold text-text-tertiary">Sprint in corso</span>
                </div>
                {sprints.filter(s => s.status === 'in_corso').map(s => {
                  const proj = projects.find(p => p.id === s.project_id)
                  return (
                    <div key={s.id} className="flex items-center gap-3 py-2.5 border-t border-border">
                      <div className="w-2 h-2 rounded-full bg-info shrink-0" />
                      <span className="text-sm text-text-tertiary font-medium flex-1">{s.name}</span>
                      <span className="text-2xs text-text-secondary">{proj?.name}</span>
                      {s.end_date && (
                        <span className="text-2xs text-text-secondary">
                          fino al {new Date(s.end_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Ultimi aggiornamenti */}
            {comments.length > 0 && (
              <div className="bg-surface border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-accent" />
                    <span className="text-sm font-bold text-text-tertiary">Ultimi aggiornamenti</span>
                  </div>
                  <button onClick={() => setTab('aggiornamenti')} className="text-2xs text-text-secondary hover:text-text-tertiary font-medium flex items-center gap-1">
                    Tutti <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                {comments.slice(0, 3).map(c => {
                  const author = allProfiles.find(p => p.id === c.author_id)
                  return (
                    <div key={c.id} className="py-2.5 border-t border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xs font-bold text-text-tertiary">{author?.full_name ?? 'Team'}</span>
                        {c.tag && <span className={`text-2xs font-bold px-1.5 py-0.5 rounded-full border ${TAG_STYLE_LIGHT[c.tag] ?? TAG_STYLE_LIGHT['Altro']}`}>{c.tag}</span>}
                        <span className="text-2xs text-text-secondary ml-auto">{timeAgo(c.created_at)}</span>
                      </div>
                      <p className="text-xs text-text-tertiary line-clamp-2">{c.content}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Ultimo KPI */}
            {kpis[0] && (
              <div className="bg-surface border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-success" />
                    <span className="text-sm font-bold text-text-tertiary">Ultimo report</span>
                  </div>
                  <button onClick={() => setTab('kpi')} className="text-2xs text-text-secondary hover:text-text-tertiary font-medium flex items-center gap-1">
                    Tutti <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <KpiRow kpi={kpis[0]} />
              </div>
            )}
          </div>
        )}

        {tab === 'progetti' && (
          <div className="space-y-3">
            {projects.length === 0
              ? <div className="text-center py-16"><p className="text-text-secondary text-sm">Nessun progetto</p></div>
              : projects.map(p => <ProjectCard key={p.id} project={p} sprints={sprints} />)}
          </div>
        )}

        {tab === 'task' && (
          <div className="space-y-5">
            {pendingTasks.length > 0 && (
              <div>
                <p className="text-2xs font-bold text-warning uppercase tracking-wider mb-2">Da completare ({pendingTasks.length})</p>
                <div className="space-y-2">{pendingTasks.map(t => <ClientTaskCard key={t.id} task={t} />)}</div>
              </div>
            )}
            {completedTasks.length > 0 && (
              <div>
                <p className="text-2xs font-bold text-success uppercase tracking-wider mb-2">Completate ({completedTasks.length})</p>
                <div className="space-y-2 opacity-60">{completedTasks.map(t => <ClientTaskCard key={t.id} task={t} />)}</div>
              </div>
            )}
            {clientTasks.length === 0 && (
              <div className="text-center py-16">
                <Check className="w-8 h-8 text-success mx-auto mb-3" />
                <p className="text-text-secondary text-sm">Nessuna azione richiesta al momento</p>
              </div>
            )}
          </div>
        )}

        {tab === 'aggiornamenti' && <AggiornamentoTab comments={comments} projects={projects} currentProfile={currentProfile} allProfiles={allProfiles} />}
        {tab === 'chat' && <ChatTab ccChannelId={ccChannelId} client={client} currentProfile={currentProfile} allProfiles={allProfiles} />}
        {tab === 'documenti' && <DocumentiTab documents={documents} />}

        {tab === 'kpi' && (
          <div className="space-y-3">
            {kpis.length === 0
              ? <div className="text-center py-16"><p className="text-text-secondary text-sm">Nessun report KPI</p></div>
              : kpis.map(k => <KpiRow key={k.id} kpi={k} />)}
          </div>
        )}

        {tab === 'fatture' && (
          <div className="space-y-2">
            {invoices.length === 0
              ? <div className="text-center py-16"><p className="text-text-secondary text-sm">Nessuna fattura</p></div>
              : invoices.map(inv => {
                  const sc = inv.status === 'pagata' ? 'bg-success text-success' : inv.status === 'in_ritardo' ? 'bg-error text-error' : 'bg-warning text-warning'
                  const sl = { da_inviare: 'Da inviare', inviata: 'Inviata', pagata: 'Pagata', in_ritardo: 'Scaduta', accettata: 'Accettata' }[inv.status] ?? inv.status
                  return (
                    <div key={inv.id} className="flex items-center gap-4 bg-surface border border-border rounded-xl px-4 py-3.5">
                      <Receipt className="w-4 h-4 text-text-secondary shrink-0" />
                      <span className="flex-1 text-sm text-text-tertiary font-medium">
                        {new Date(inv.month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                      </span>
                      <span className="text-sm font-bold text-text-tertiary">{formatCurrency(inv.amount)}</span>
                      <span className={`text-2xs font-bold px-2.5 py-1 rounded-full ${sc}`}>{sl}</span>
                    </div>
                  )
                })}
          </div>
        )}
      </div>
    </div>
  )
}

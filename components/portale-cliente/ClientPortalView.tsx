'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Check, Eye, FolderKanban, BarChart3, FileText,
  Star, ChevronRight, ChevronDown, MessageCircle, MessageSquare,
  Send, Loader2, Trash2, Reply, Flag,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SlackChat } from '@/components/chat/SlackChat'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { timeAgo, UPDATE_TAGS, type ProjectComment } from '@/components/projects/project-shared'
import { PHASE_LABEL, PHASE_COLOR } from '@/lib/reparti-constants'
import type { Client, Project, Sprint, Task, ClientKpi, Invoice, Profile } from '@/lib/types/database'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    attivo:      { label: 'Attivo',      color: '#22C55E' },
    in_corso:    { label: 'In corso',    color: '#F5C800' },
    completato:  { label: 'Completato',  color: '#22C55E' },
    in_pausa:    { label: 'In pausa',    color: '#6B7280' },
    da_fare:     { label: 'Da fare',     color: '#6B7280' },
    pianificato: { label: 'Pianificato', color: '#3B82F6' },
  }
  const s = map[status] ?? { label: status, color: '#6B7280' }
  return (
    <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
      style={{ background: `${s.color}15`, color: s.color }}>{s.label}</span>
  )
}

// ─── Client task row ──────────────────────────────────────────────────────────
function ClientTaskCard({ task }: { task: Task }) {
  const [done, setDone]     = useState(task.status === 'completato')
  const [saving, setSaving] = useState(false)
  const phase    = ((task as any).tags ?? []).find((t: string) => ['onboarding', 'build', 'lancio'].includes(t))
  const phColor  = PHASE_COLOR[phase ?? ''] ?? '#6B7280'
  const isOver   = !done && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)

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
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
      done ? 'border-green-500/20 bg-green-500/5 opacity-60' :
      isOver ? 'border-red-400/30 bg-red-400/5' :
      'border-[#1A1A1A] bg-[#0D0D0D] hover:border-[#2A2A2A]'}`}>
      <button onClick={toggle} disabled={saving}
        className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
          done ? 'bg-green-500 border-green-500' : 'border-[#2A2A2A] hover:border-[#F5C800]'}`}>
        {done && <Check className="w-3 h-3 text-black" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${done ? 'line-through text-[#333]' : 'text-white'}`}>{task.title}</p>
        {(task as any).hint && <p className="text-[10px] text-[#444] mt-0.5">{(task as any).hint}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {phase && (
          <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
            style={{ background: `${phColor}15`, color: phColor }}>{PHASE_LABEL[phase] ?? phase}</span>
        )}
        {isOver && <span className="text-[9px] text-red-400 font-bold">scaduta</span>}
        <span className={`text-[9px] font-bold ${task.priority === 'alta' ? 'text-red-400' : task.priority === 'media' ? 'text-yellow-400' : 'text-[#444]'}`}>
          {task.priority}
        </span>
      </div>
    </div>
  )
}

// ─── Project progress card ────────────────────────────────────────────────────
function ProjectCard({ project, sprints }: { project: Project; sprints: Sprint[] }) {
  const [open, setOpen] = useState(false)
  const activeSprint = sprints.find(s => s.project_id === project.id && s.status === 'in_corso')
  const sprintsDone  = sprints.filter(s => s.project_id === project.id && s.status === 'completato').length
  const sprintsTotal = sprints.filter(s => s.project_id === project.id).length
  const pct          = sprintsTotal > 0 ? Math.round((sprintsDone / sprintsTotal) * 100) : 0

  return (
    <div className="border border-[#1A1A1A] rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-[#0A0A0A] transition-colors text-left">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: project.status === 'attivo' ? '#F5C800' : '#2A2A2A' }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{project.name}</p>
          <p className="text-[10px] text-[#444] mt-0.5 capitalize">
            {project.project_type?.replace('_', ' ')}
            {activeSprint ? ` · Sprint: ${activeSprint.name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {sprintsTotal > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
                <div className="h-full bg-[#F5C800] rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-[#444]">{pct}%</span>
            </div>
          )}
          <StatusBadge status={project.status} />
          {open ? <ChevronDown className="w-3.5 h-3.5 text-[#333]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#333]" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-[#111] px-4 py-4 bg-[#080808] space-y-2">
          {sprints.filter(s => s.project_id === project.id).length > 0 ? (
            <>
              <p className="text-[9px] font-bold text-[#333] uppercase tracking-wider mb-2">Sprint</p>
              {sprints.filter(s => s.project_id === project.id).map(s => {
                const isDone = s.status === 'completato'
                const isAct  = s.status === 'in_corso'
                const color  = isDone ? '#22C55E' : isAct ? '#F5C800' : '#3A3A3A'
                return (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: `${color}08`, border: `1px solid ${color}18` }}>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                    <span className="flex-1 text-xs" style={{ color: isDone ? '#22C55E' : isAct ? '#F5C800' : '#555' }}>{s.name}</span>
                    {s.start_date && s.end_date && (
                      <span className="text-[9px] text-[#333]">
                        {new Date(s.start_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} →{' '}
                        {new Date(s.end_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: `${color}15`, color }}>
                      {isDone ? 'Completato' : isAct ? 'Attivo' : 'Pianificato'}
                    </span>
                  </div>
                )
              })}
            </>
          ) : (
            <p className="text-xs text-[#333] text-center py-4">Nessuno sprint pianificato</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── KPI row ──────────────────────────────────────────────────────────────────
function KpiRow({ kpi }: { kpi: ClientKpi }) {
  const fields = [
    { label: 'Revenue',   val: kpi.revenue_attributed != null ? formatCurrency(kpi.revenue_attributed) : null },
    { label: 'Lead',      val: kpi.leads_generated != null ? String(kpi.leads_generated) : null },
    { label: 'ROAS',      val: kpi.roas != null ? `${kpi.roas}×` : null },
    { label: 'CTR',       val: kpi.ctr != null ? `${kpi.ctr}%` : null },
    { label: 'Conv.rate', val: kpi.conversion_rate != null ? `${kpi.conversion_rate}%` : null },
  ].filter(f => f.val !== null)

  return (
    <div className="border border-[#1A1A1A] rounded-xl p-3">
      <p className="text-[9px] font-bold text-[#444] mb-2">
        {new Date(kpi.month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
      </p>
      <div className="flex flex-wrap gap-4">
        {fields.map(f => (
          <div key={f.label}>
            <p className="text-[9px] text-[#333]">{f.label}</p>
            <p className="text-sm font-bold text-white">{f.val}</p>
          </div>
        ))}
        {fields.length === 0 && <p className="text-xs text-[#333]">Nessun dato per questo mese</p>}
      </div>
    </div>
  )
}

// ─── Update post (aggiornamento) ──────────────────────────────────────────────
const TAG_STYLE: Record<string, string> = {
  'Milestone raggiunta': 'bg-green-500/10 text-green-400 border-green-500/25',
  'Blocco':              'bg-red-500/10 text-red-400 border-red-500/25',
  'Update settimanale':  'bg-[#F5C800]/10 text-[#F5C800] border-[#F5C800]/25',
  'Altro':               'bg-[#2A2A2A] text-[#666] border-[#333]',
}

function UpdatePost({ comment, allProfiles, projectName, currentProfile, onDelete }: {
  comment: ProjectComment
  allProfiles: Profile[]
  projectName: string
  currentProfile: Profile
  onDelete: (id: string) => void
}) {
  const [showReply, setShowReply] = useState(false)
  const [replies, setReplies]     = useState<ProjectComment[]>([])
  const [loadedReplies, setLoadedReplies] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending]     = useState(false)
  const author = allProfiles.find(p => p.id === comment.author_id)
  const isOwn  = comment.author_id === currentProfile.id

  const loadReplies = async () => {
    if (loadedReplies) { setShowReply(r => !r); return }
    const { data } = await createClient().from('project_comments')
      .select('*').eq('parent_id', comment.id).order('created_at')
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

  const del = async () => {
    await createClient().from('project_comments').delete().eq('id', comment.id)
    onDelete(comment.id)
    toast.success('Eliminato')
  }

  const ini = author?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const isTeam = !comment.is_client

  return (
    <div className="group">
      <div className={`p-4 rounded-2xl border transition-all ${
        isTeam
          ? 'bg-[#0D0D0D] border-[#1A1A1A]'
          : 'bg-[#F5C800]/5 border-[#F5C800]/15'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black ${
            isTeam ? 'bg-[#1A1A1A] text-[#666]' : 'bg-[#F5C800]/20 text-[#F5C800]'
          }`}>
            {author?.avatar_url
              ? <img src={author.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
              : ini}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-xs font-bold text-white">{author?.full_name ?? 'Team TwoBee'}</span>
              {isTeam
                ? <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-[#1A1A1A] text-[#444]">TEAM</span>
                : <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-[#F5C800]/15 text-[#F5C800]">CLIENTE</span>
              }
              {comment.tag && (
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${TAG_STYLE[comment.tag] ?? TAG_STYLE['Altro']}`}>
                  {comment.tag}
                </span>
              )}
              <span className="text-[9px] text-[#333] ml-auto">{timeAgo(comment.created_at)}</span>
              <span className="text-[9px] text-[#222] hidden sm:block">{projectName}</span>
            </div>
            <p className="text-sm text-[#CCC] leading-relaxed whitespace-pre-wrap">{comment.content}</p>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={loadReplies}
              className="p-1.5 rounded-lg text-[#333] hover:text-[#888] hover:bg-[#1A1A1A]">
              <Reply className="w-3.5 h-3.5" />
            </button>
            {isOwn && (
              <button onClick={del}
                className="p-1.5 rounded-lg text-[#333] hover:text-red-400 hover:bg-red-400/10">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Replies */}
        {showReply && (
          <div className="mt-3 ml-11 space-y-2">
            {replies.map(r => {
              const rAuthor = allProfiles.find(p => p.id === r.author_id)
              return (
                <div key={r.id} className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#1A1A1A] flex items-center justify-center text-[9px] font-bold text-[#444] shrink-0">
                    {rAuthor?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) ?? '?'}
                  </div>
                  <div className="flex-1 bg-[#111] rounded-xl px-3 py-2">
                    <span className="text-[10px] font-bold text-[#888]">{rAuthor?.full_name ?? 'Utente'}</span>
                    <span className="text-[9px] text-[#333] ml-2">{timeAgo(r.created_at)}</span>
                    <p className="text-xs text-[#AAA] mt-0.5">{r.content}</p>
                  </div>
                </div>
              )
            })}
            <div className="flex gap-2 mt-2">
              <input value={replyText} onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendReply() }}
                placeholder="Scrivi una risposta…"
                className="flex-1 bg-[#111] border border-[#1A1A1A] rounded-xl px-3 py-2 text-xs text-white placeholder-[#2A2A2A] focus:outline-none focus:border-[#2A2A2A]" />
              <button onClick={sendReply} disabled={!replyText.trim() || sending}
                className="px-3 py-2 bg-[#1A1A1A] rounded-xl text-[#888] hover:text-white disabled:opacity-40 transition-colors">
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
  comments: ProjectComment[]
  projects: Project[]
  currentProfile: Profile
  allProfiles: Profile[]
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
      {/* Compose */}
      <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {projects.length > 1 && (
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className="bg-[#111] border border-[#1A1A1A] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <div className="flex gap-1 flex-wrap">
            {UPDATE_TAGS.map(t => (
              <button key={t} onClick={() => setTag(t)}
                className={`text-[9px] font-bold px-2 py-1 rounded-full border transition-all ${
                  tag === t ? TAG_STYLE[t] ?? TAG_STYLE['Altro'] : 'border-[#1A1A1A] text-[#333] hover:text-[#666]'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder="Scrivi un aggiornamento per il cliente…"
          rows={3}
          className="w-full bg-[#111] border border-[#1A1A1A] rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#2A2A2A] focus:outline-none focus:border-[#2A2A2A] resize-none" />
        <div className="flex justify-end">
          <button onClick={send} disabled={!text.trim() || sending}
            className="flex items-center gap-2 px-4 py-2 bg-[#F5C800] text-black text-xs font-black rounded-xl disabled:opacity-40 hover:bg-yellow-400 transition-colors">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Pubblica
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {['tutti', ...UPDATE_TAGS].map(t => (
          <button key={t} onClick={() => setFilterTag(t)}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all capitalize ${
              filterTag === t ? 'bg-[#F5C800]/10 border-[#F5C800]/30 text-[#F5C800]' : 'border-[#1A1A1A] text-[#333] hover:text-[#666]'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <MessageCircle className="w-8 h-8 text-[#1A1A1A] mx-auto mb-3" />
            <p className="text-[#444] text-sm">Nessun aggiornamento</p>
          </div>
        ) : filtered.map(c => (
          <UpdatePost
            key={c.id}
            comment={c}
            allProfiles={allProfiles}
            projectName={projects.find(p => p.id === c.project_id)?.name ?? ''}
            currentProfile={currentProfile}
            onDelete={id => setComments(prev => prev.filter(x => x.id !== id))}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Chat tab ─────────────────────────────────────────────────────────────────
function ChatTab({ ccChannelId, client, currentProfile, allProfiles }: {
  ccChannelId: string | null
  client: Client
  currentProfile: Profile
  allProfiles: Profile[]
}) {
  const [channelId, setChannelId] = useState<string | null>(ccChannelId)
  const [creating, setCreating]   = useState(false)
  const { isSuperAdmin: _isSuperAdmin } = { isSuperAdmin: true }

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
        <MessageSquare className="w-8 h-8 text-[#1A1A1A]" />
        <p className="text-[#444] text-sm">Nessun canale chat attivo per questo cliente</p>
        <button onClick={createChannel} disabled={creating}
          className="flex items-center gap-2 px-4 py-2 bg-[#F5C800] text-black text-xs font-black rounded-xl hover:bg-yellow-400 disabled:opacity-40">
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
          Crea canale chat
        </button>
      </div>
    )
  }

  return (
    <div className="h-[600px] rounded-2xl overflow-hidden border border-[#1A1A1A]">
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

// ─── Main ─────────────────────────────────────────────────────────────────────
type PortalTab = 'panoramica' | 'progetti' | 'task' | 'aggiornamenti' | 'chat' | 'kpi' | 'fatture'

export function ClientPortalView({ client, projects, sprints, clientTasks, kpis, invoices, ccChannelId, comments, currentProfile, allProfiles }: {
  client: Client
  projects: Project[]
  sprints: Sprint[]
  clientTasks: Task[]
  kpis: ClientKpi[]
  invoices: Invoice[]
  ccChannelId: string | null
  comments: ProjectComment[]
  currentProfile: Profile
  allProfiles: Profile[]
}) {
  const [tab, setTab] = useState<PortalTab>('panoramica')

  const pendingTasks   = clientTasks.filter(t => t.status !== 'completato')
  const completedTasks = clientTasks.filter(t => t.status === 'completato')
  const activeProjects = projects.filter(p => p.status === 'attivo')
  const unpaidAmount   = invoices.filter(i => ['da_inviare', 'inviata', 'in_ritardo'].includes(i.status)).reduce((s, i) => s + i.amount, 0)

  const TABS: { id: PortalTab; label: string; badge?: number }[] = [
    { id: 'panoramica',     label: 'Panoramica' },
    { id: 'progetti',       label: 'Progetti',      badge: activeProjects.length },
    { id: 'task',           label: 'Da fare',        badge: pendingTasks.length > 0 ? pendingTasks.length : undefined },
    { id: 'aggiornamenti',  label: 'Aggiornamenti',  badge: comments.length > 0 ? comments.length : undefined },
    { id: 'chat',           label: 'Chat',           badge: ccChannelId ? undefined : undefined },
    { id: 'kpi',            label: 'Report KPI' },
    { id: 'fatture',        label: 'Fatture' },
  ]

  return (
    <div className="min-h-screen bg-[#111111]">
      {/* Super admin banner */}
      <div className="bg-[#F5C800]/10 border-b border-[#F5C800]/20 px-6 py-2 flex items-center gap-2">
        <Eye className="w-3.5 h-3.5 text-[#F5C800]" />
        <span className="text-xs text-[#F5C800] font-bold">Stai visualizzando il portale come il cliente</span>
        <Link href="/portale-cliente" className="ml-auto text-[10px] text-[#F5C800]/60 hover:text-[#F5C800] flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Lista clienti
        </Link>
        <Link href={`/clienti/${client.id}`} className="text-[10px] text-[#F5C800]/60 hover:text-[#F5C800] flex items-center gap-1">
          Vista admin <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[#F5C800]/10 border border-[#F5C800]/20 flex items-center justify-center text-lg font-black text-[#F5C800]">
            {client.company_name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-black text-white">{client.company_name}</h1>
            <p className="text-xs text-[#444] mt-0.5 capitalize">
              {client.client_type?.replace('_', '+')}
              {client.package ? ` · ${client.package}` : ''}
            </p>
          </div>
          {pendingTasks.length > 0 && (
            <div className="ml-auto flex items-center gap-2 bg-[#F5C800]/10 border border-[#F5C800]/20 rounded-xl px-3 py-2">
              <Star className="w-3.5 h-3.5 text-[#F5C800]" />
              <span className="text-xs font-bold text-[#F5C800]">{pendingTasks.length} azioni richieste</span>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-[#0D0D0D] border border-[#1A1A1A] rounded-xl p-1 mb-6 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all shrink-0 ${tab === t.id ? 'bg-[#F5C800] text-black' : 'text-[#444] hover:text-white'}`}>
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-black/20' : 'bg-[#1A1A1A]'}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── PANORAMICA ── */}
        {tab === 'panoramica' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-4">
                <p className="text-[10px] text-[#444] uppercase tracking-wider font-bold mb-2">MRR</p>
                <p className="text-2xl font-black text-[#F5C800]">{formatCurrency(client.mrr ?? 0)}</p>
              </div>
              <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-4">
                <p className="text-[10px] text-[#444] uppercase tracking-wider font-bold mb-2">Progetti attivi</p>
                <p className="text-2xl font-black text-white">{activeProjects.length}</p>
              </div>
              <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-4">
                <p className="text-[10px] text-[#444] uppercase tracking-wider font-bold mb-2">Da fare</p>
                <p className={`text-2xl font-black ${pendingTasks.length > 0 ? 'text-[#F5C800]' : 'text-[#22C55E]'}`}>{pendingTasks.length}</p>
              </div>
              <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-4">
                <p className="text-[10px] text-[#444] uppercase tracking-wider font-bold mb-2">Da pagare</p>
                <p className={`text-2xl font-black ${unpaidAmount > 0 ? 'text-red-400' : 'text-[#22C55E]'}`}>{formatCurrency(unpaidAmount)}</p>
              </div>
            </div>

            {pendingTasks.length > 0 && (
              <div className="bg-[#0D0D0D] border border-[#F5C800]/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-[#F5C800]" />
                  <span className="text-sm font-bold text-white">Cosa ci serve da te</span>
                </div>
                <div className="space-y-2">
                  {pendingTasks.slice(0, 4).map(t => (
                    <div key={t.id} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full border border-[#2A2A2A] shrink-0" />
                      <span className="text-sm text-[#888] flex-1 truncate">{t.title}</span>
                    </div>
                  ))}
                  {pendingTasks.length > 4 && (
                    <button onClick={() => setTab('task')} className="text-[10px] text-[#F5C800] hover:text-yellow-400 flex items-center gap-1 mt-1">
                      +{pendingTasks.length - 4} altre <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {sprints.filter(s => s.status === 'in_corso').length > 0 && (
              <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FolderKanban className="w-4 h-4 text-[#3B82F6]" />
                  <span className="text-sm font-bold text-white">Sprint in corso</span>
                </div>
                {sprints.filter(s => s.status === 'in_corso').map(s => {
                  const proj = projects.find(p => p.id === s.project_id)
                  return (
                    <div key={s.id} className="flex items-center gap-3 py-2 border-t border-[#111]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#F5C800] shrink-0" />
                      <span className="text-sm text-white flex-1">{s.name}</span>
                      <span className="text-[10px] text-[#444]">{proj?.name}</span>
                      {s.end_date && (
                        <span className="text-[9px] text-[#333]">
                          fino al {new Date(s.end_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {comments.length > 0 && (
              <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-[#A855F7]" />
                    <span className="text-sm font-bold text-white">Ultimi aggiornamenti</span>
                  </div>
                  <button onClick={() => setTab('aggiornamenti')} className="text-[10px] text-[#444] hover:text-white flex items-center gap-1">
                    Tutti <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                {comments.slice(0, 3).map(c => {
                  const author = allProfiles.find(p => p.id === c.author_id)
                  return (
                    <div key={c.id} className="py-2.5 border-t border-[#111]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-[#888]">{author?.full_name ?? 'Team'}</span>
                        {c.tag && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${TAG_STYLE[c.tag] ?? TAG_STYLE['Altro']}`}>{c.tag}</span>}
                        <span className="text-[9px] text-[#333] ml-auto">{timeAgo(c.created_at)}</span>
                      </div>
                      <p className="text-xs text-[#666] line-clamp-2">{c.content}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {kpis[0] && (
              <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-[#A855F7]" />
                    <span className="text-sm font-bold text-white">Ultimo report KPI</span>
                  </div>
                  <button onClick={() => setTab('kpi')} className="text-[10px] text-[#444] hover:text-white flex items-center gap-1">
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
              ? <div className="text-center py-16"><p className="text-[#444] text-sm">Nessun progetto</p></div>
              : projects.map(p => <ProjectCard key={p.id} project={p} sprints={sprints} />)}
          </div>
        )}

        {tab === 'task' && (
          <div className="space-y-4">
            {pendingTasks.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-[#F5C800] uppercase tracking-wider mb-2">Da completare ({pendingTasks.length})</p>
                <div className="space-y-2">{pendingTasks.map(t => <ClientTaskCard key={t.id} task={t} />)}</div>
              </div>
            )}
            {completedTasks.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-2">Completate ({completedTasks.length})</p>
                <div className="space-y-2 opacity-60">{completedTasks.map(t => <ClientTaskCard key={t.id} task={t} />)}</div>
              </div>
            )}
            {clientTasks.length === 0 && (
              <div className="text-center py-16">
                <Check className="w-8 h-8 text-[#22C55E] mx-auto mb-3" />
                <p className="text-[#444] text-sm">Nessuna azione richiesta al momento</p>
              </div>
            )}
          </div>
        )}

        {tab === 'aggiornamenti' && (
          <AggiornamentoTab
            comments={comments}
            projects={projects}
            currentProfile={currentProfile}
            allProfiles={allProfiles}
          />
        )}

        {tab === 'chat' && (
          <ChatTab
            ccChannelId={ccChannelId}
            client={client}
            currentProfile={currentProfile}
            allProfiles={allProfiles}
          />
        )}

        {tab === 'kpi' && (
          <div className="space-y-3">
            {kpis.length === 0
              ? <div className="text-center py-16"><p className="text-[#444] text-sm">Nessun report KPI</p></div>
              : kpis.map(k => <KpiRow key={k.id} kpi={k} />)}
          </div>
        )}

        {tab === 'fatture' && (
          <div className="space-y-2">
            {invoices.length === 0
              ? <div className="text-center py-16"><p className="text-[#444] text-sm">Nessuna fattura</p></div>
              : invoices.map(inv => {
                  const sc = inv.status === 'pagata' ? 'text-green-400 bg-green-400/10' : inv.status === 'in_ritardo' ? 'text-red-400 bg-red-400/10' : 'text-yellow-400 bg-yellow-400/10'
                  const sl = { da_inviare: 'Da inviare', inviata: 'Inviata', pagata: 'Pagata', in_ritardo: 'Scaduta', accettata: 'Accettata' }[inv.status] ?? inv.status
                  return (
                    <div key={inv.id} className="flex items-center gap-4 bg-[#0D0D0D] border border-[#1A1A1A] rounded-xl px-4 py-3">
                      <FileText className="w-4 h-4 text-[#333] shrink-0" />
                      <span className="flex-1 text-sm text-white">
                        {new Date(inv.month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                      </span>
                      <span className="text-sm font-bold text-white">{formatCurrency(inv.amount)}</span>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${sc}`}>{sl}</span>
                    </div>
                  )
                })}
          </div>
        )}
      </div>
    </div>
  )
}

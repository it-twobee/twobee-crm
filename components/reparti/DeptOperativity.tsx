'use client'

import { useState, useRef, useEffect } from 'react'
import {
  TrendingUp, TrendingDown, Clock, Euro, AlertTriangle,
  Zap, Send, Loader2, Plus, ChevronRight, ChevronDown,
  ExternalLink, MessageSquare, Trash2, RefreshCw, Bot,
  CheckCircle2, Target, BarChart3, Users,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { SprintMilestoneBoardSection } from '@/components/projects/SprintMilestoneBoardSection'
import { CreateProjectModal } from './CreateProjectModal'
import { BoardTeam } from './BoardTeam'
import { TaskClienteSection } from './TaskClienteSection'
import { RepartiTimeline } from './RepartiTimeline'
import type { ProjectKind, Profile } from '@/lib/types/database'
import type { DeptProject, DeptStats, SavedChat, ChatMessage } from '@/app/(dashboard)/reparti/[dept]/page'

type OperTab = 'dashboard' | 'board' | 'clienti' | 'timeline'

interface ClientOpt { id: string; company_name: string }

// ─── Scorecard ────────────────────────────────────────────────────────────────
function ScoreCard({ icon, label, value, sub, color, trend }: {
  icon: React.ReactNode; label: string; value: string; sub?: string
  color: string; trend?: 'up' | 'down' | 'neutral'
}) {
  return (
    <div className="bg-background border border-border rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="p-2 rounded-xl" style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, color }}>
          {icon}
        </span>
        {trend === 'up'   && <TrendingUp  className="w-4 h-4 text-success" />}
        {trend === 'down' && <TrendingDown className="w-4 h-4 text-error"   />}
      </div>
      <div>
        <p className="text-2xl font-black text-text-primary">{value}</p>
        <p className="text-xs text-text-tertiary mt-0.5">{label}</p>
        {sub && <p className="text-2xs text-text-tertiary mt-1">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Sprint velocity mini chart ───────────────────────────────────────────────
function VelocityChart({ sprints, projects }: { sprints: any[]; projects: DeptProject[] }) {
  const allSprints = projects.flatMap(p => p.sprints)
  const completedSprints = allSprints.filter(s => s.status === 'completato').slice(-6)
  if (completedSprints.length === 0) return null

  const max = Math.max(...completedSprints.map(s => {
    const tasks = projects.flatMap(p => p.tasks)
    return tasks.filter(t => t.sprint_id === s.id && !t.is_milestone && !t.parent_id && t.status === 'completato').length
  }))

  return (
    <div className="bg-background border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-gold-text" />
        <span className="text-xs font-bold text-text-primary">Sprint Velocity</span>
        <span className="text-2xs text-text-tertiary ml-auto">ultimi {completedSprints.length} sprint</span>
      </div>
      <div className="flex items-end gap-1.5 h-12">
        {completedSprints.map((s, i) => {
          const allTasks = projects.flatMap(p => p.tasks)
          const done = allTasks.filter(t => t.sprint_id === s.id && !t.is_milestone && !t.parent_id && t.status === 'completato').length
          const h = max > 0 ? Math.round((done / max) * 100) : 0
          return (
            <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[8px] text-text-tertiary">{done}</span>
              <div className="w-full rounded-t-sm bg-gold/80 transition-all"
                style={{ height: `${Math.max(h, 4)}%`, minHeight: 3 }} />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-2xs text-text-tertiary">task/sprint completate</span>
        <span className="text-2xs text-gold-text font-bold">
          avg {completedSprints.length > 0
            ? Math.round(completedSprints.reduce((s, sprint) => {
                const t = projects.flatMap(p => p.tasks)
                return s + t.filter(t => t.sprint_id === sprint.id && !t.is_milestone && !t.parent_id && t.status === 'completato').length
              }, 0) / completedSprints.length)
            : 0}
        </span>
      </div>
    </div>
  )
}

// ─── Client health mini list ──────────────────────────────────────────────────
function ClientHealthList({ projects }: { projects: DeptProject[] }) {
  const withRisk = projects
    .filter(p => p.client_risk !== null && p.client_name)
    .sort((a, b) => (b.client_risk ?? 0) - (a.client_risk ?? 0))
    .slice(0, 4)

  if (withRisk.length === 0) return null

  const riskColor = (r: number) =>
    r >= 7 ? 'text-error bg-error/10' :
    r >= 4 ? 'text-gold-text bg-gold/10' :
    'text-success bg-success/10'

  return (
    <div className="bg-background border border-border rounded-2xl p-4 col-span-2">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-gold-text" />
        <span className="text-xs font-bold text-text-primary">Client Health</span>
      </div>
      <div className="space-y-2">
        {withRisk.map(p => (
          <div key={p.id} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-primary truncate">{p.client_name}</p>
              <p className="text-2xs text-text-tertiary">{p.name}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {p.client_mrr && (
                <span className="text-2xs text-text-tertiary">€{p.client_mrr.toLocaleString('it-IT')}/mo</span>
              )}
              <span className={`text-2xs font-black px-1.5 py-0.5 rounded-full ${riskColor(p.client_risk!)}`}>
                R{p.client_risk}
              </span>
            </div>
            <div className="flex-1 max-w-16">
              <div className="h-1 bg-surface rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${
                  (p.client_risk ?? 0) >= 7 ? 'bg-error' :
                  (p.client_risk ?? 0) >= 4 ? 'bg-gold' : 'bg-success'
                }`} style={{ width: `${(p.client_risk ?? 0) * 10}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── AI Chat ─────────────────────────────────────────────────────────────────
function AIChatSection({ dept, projects, stats, savedChats: initialChats }: {
  dept: ProjectKind; projects: DeptProject[]; stats: DeptStats; savedChats: SavedChat[]
}) {
  const [chats, setChats]         = useState<SavedChat[]>(initialChats)
  const [activeChatId, setActive] = useState<string | null>(initialChats[0]?.id ?? null)
  const [messages, setMessages]   = useState<ChatMessage[]>(initialChats[0]?.messages ?? [])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const projectContext = `
Reparto: ${dept}
Progetti attivi: ${stats.activeProjects}/${stats.totalProjects}
Task completate: ${stats.doneTasks}/${stats.totalTasks} (${stats.totalTasks > 0 ? Math.round((stats.doneTasks/stats.totalTasks)*100) : 0}%)
Ore stimate: ${stats.estimatedHours}h | Ore lavorate: ${stats.loggedHours}h
MRR totale reparto: €${stats.totalMrr.toLocaleString('it-IT')}
Sprint attivi: ${stats.activeSprints} | Completati: ${stats.completedSprints}
Progetti: ${projects.map(p => `${p.name} (${p.status}, ${p.tasks.filter(t => !t.is_milestone && !t.parent_id).length} task, cliente: ${p.client_name ?? '—'})`).join('; ')}
  `.trim()

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/reparti/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dept, message: userMsg, history: messages, projectContext, chatId: activeChatId }),
      })
      const data = await res.json()
      const aiMsg: ChatMessage = { role: 'assistant', content: data.reply }
      const finalMessages: ChatMessage[] = [...newMessages, aiMsg]
      setMessages(finalMessages)

      if (data.chatId && !activeChatId) {
        setActive(data.chatId)
        setChats(prev => [{ id: data.chatId, title: userMsg.slice(0, 60), messages: finalMessages, updated_at: new Date().toISOString() }, ...prev])
      } else if (data.chatId) {
        setChats(prev => prev.map(c => c.id === data.chatId ? { ...c, messages: finalMessages, updated_at: new Date().toISOString() } : c))
      }
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Errore di connessione. Riprova.' }])
    } finally {
      setLoading(false)
    }
  }

  const newChat = () => {
    setActive(null)
    setMessages([])
    setInput('')
    setShowHistory(false)
  }

  const loadChat = (chat: SavedChat) => {
    setActive(chat.id)
    setMessages(chat.messages)
    setShowHistory(false)
  }

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await createClient().from('dept_ai_chats').delete().eq('id', id)
    setChats(prev => prev.filter(c => c.id !== id))
    if (activeChatId === id) newChat()
  }

  const QUICK = [
    'Qual è lo stato generale del reparto questa settimana?',
    'Quali task sono a rischio scadenza?',
    'Suggerisci le priorità per i prossimi 3 giorni',
    'Genera un brief settimanale del reparto',
  ]

  const renderMessage = (msg: ChatMessage, i: number) => {
    const isUser = msg.role === 'user'
    return (
      <div key={i} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-2xs font-black ${
          isUser ? 'bg-gold text-on-gold' : 'bg-surface text-gold-text border border-border'
        }`}>
          {isUser ? 'M' : <Bot className="w-3.5 h-3.5" />}
        </div>
        <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
          <div className={`px-3 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-gold text-on-gold rounded-tr-sm'
              : 'bg-background border border-border text-text-secondary rounded-tl-sm'
          }`}
            dangerouslySetInnerHTML={{ __html: msg.content
              .replace(/\*\*(.*?)\*\*/g, '<strong class="text-text-primary">$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/`(.*?)`/g, '<code class="bg-background px-1 rounded text-gold-text text-xs">$1</code>')
              .replace(/^- /gm, '• ')
            }} />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background border border-border rounded-2xl overflow-hidden flex flex-col" style={{ height: 520 }}>
      {/* header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <Bot className="w-4 h-4 text-gold-text" />
        <span className="text-sm font-bold text-text-primary flex-1">AI Chat — Reparto</span>
        <button onClick={() => setShowHistory(s => !s)}
          className="flex items-center gap-1.5 text-2xs text-text-tertiary hover:text-text-primary transition-colors px-2 py-1 rounded-lg hover:bg-surface">
          <MessageSquare className="w-3 h-3" />
          Storico ({chats.length})
        </button>
        <button onClick={newChat}
          className="flex items-center gap-1.5 text-2xs font-bold text-on-gold px-2.5 py-1 rounded-lg bg-gold hover:bg-gold/90">
          <Plus className="w-3 h-3" /> Nuova
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* history sidebar */}
        {showHistory && (
          <div className="w-56 border-r border-border overflow-y-auto shrink-0 bg-background">
            {chats.length === 0
              ? <p className="text-2xs text-text-tertiary p-4">Nessuna conversazione</p>
              : chats.map(c => (
                <div key={c.id} onClick={() => loadChat(c)}
                  className={`flex items-start gap-2 px-3 py-2.5 border-b border-border cursor-pointer hover:bg-background transition-colors group ${activeChatId === c.id ? 'bg-background' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-2xs text-text-secondary truncate">{c.title || 'Conversazione'}</p>
                    <p className="text-2xs text-text-tertiary mt-0.5">
                      {new Date(c.updated_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  <button onClick={e => deleteChat(c.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-text-tertiary hover:text-error transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            }
          </div>
        )}

        {/* chat area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <Bot className="w-10 h-10 text-text-tertiary" />
                <div>
                  <p className="text-sm font-bold text-text-tertiary">Chiedi qualsiasi cosa</p>
                  <p className="text-xs text-text-tertiary mt-1">Sui tuoi progetti, task, priorità o trend di settore</p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                  {QUICK.map(q => (
                    <button key={q} onClick={() => { setInput(q); }}
                      className="text-left text-2xs text-text-tertiary bg-background border border-border hover:border-border hover:text-text-primary rounded-xl px-2.5 py-2 transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => renderMessage(m, i))
            )}
            {loading && (
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-gold-text" />
                </div>
                <div className="bg-background border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-gold animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* input */}
          <div className="px-4 pb-3 shrink-0">
            <div className="flex gap-2 bg-background border border-border rounded-xl px-3 py-2 focus-within:border-border transition-colors">
              <textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Scrivi un messaggio… (Invio per inviare)"
                rows={1}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-tertiary focus:outline-none resize-none" />
              <button onClick={send} disabled={!input.trim() || loading}
                className="w-7 h-7 rounded-lg bg-gold flex items-center justify-center disabled:opacity-40 hover:bg-gold/90 transition-colors shrink-0 self-end">
                {loading ? <Loader2 className="w-3.5 h-3.5 text-on-gold animate-spin" /> : <Send className="w-3.5 h-3.5 text-on-gold" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Project list ─────────────────────────────────────────────────────────────
function ProjectCard({ project, profiles, accent }: { project: DeptProject; profiles: Profile[]; accent: string }) {
  const [open, setOpen] = useState(false)
  const realTasks = project.tasks.filter(t => !t.is_milestone && !t.parent_id)
  const done  = realTasks.filter(t => t.status === 'completato').length
  const total = realTasks.length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0
  const url   = project.client_id ? `/clienti/${project.client_id}/progetto/${project.id}` : null
  const activeSprint = project.sprints.find(s => s.status === 'in_corso')
  const est   = realTasks.reduce((s, t) => s + (t.estimated_hours ?? 0), 0)
  const logged = realTasks.reduce((s, t) => s + (t.logged_hours ?? 0), 0)

  return (
    <div className="bg-background border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button onClick={() => setOpen(o => !o)} className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setOpen(o => !o)}>
          <p className="text-sm font-bold text-text-primary truncate">{project.name}</p>
          <p className="text-2xs text-text-tertiary mt-0.5">
            {project.client_name ?? '—'} · {project.project_type}
            {activeSprint && <span className="ml-2 text-success">● {activeSprint.name}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {est > 0 && (
            <span className={`text-2xs font-bold ${logged > est ? 'text-error' : 'text-text-tertiary'}`}>
              {logged}h/{est}h
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <div className="w-20 h-1.5 bg-surface rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: accent }} />
            </div>
            <span className="text-2xs text-text-tertiary font-mono">{done}/{total}</span>
          </div>
          <span className={`text-2xs font-bold px-2 py-0.5 rounded-full ${
            project.status === 'attivo'     ? 'text-success bg-success/10' :
            project.status === 'completato' ? 'text-info bg-info/10'  :
            'text-text-tertiary bg-surface'
          }`}>{project.status}</span>
          {url && (
            <Link href={url} onClick={e => e.stopPropagation()}
              className="p-1 text-text-tertiary hover:text-gold-text transition-colors" title="Apri progetto completo">
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
      {open && (
        <div className="border-t border-border px-4 py-4">
          <SprintMilestoneBoardSection
            tasks={project.tasks} sprints={project.sprints}
            profiles={profiles} projectId={project.id}
            isAdmin={true} accent={accent} />
        </div>
      )}
    </div>
  )
}

// ─── Dashboard sub-tab ───────────────────────────────────────────────────────
function DashboardTab({ dept, projects, profiles, clients, stats, savedChats, color }: {
  dept: ProjectKind; projects: DeptProject[]; profiles: Profile[]
  clients: ClientOpt[]; stats: DeptStats; savedChats: SavedChat[]; color: string
}) {
  const [filter, setFilter]           = useState<'tutti' | 'attivo' | 'completato'>('tutti')
  const [showCreate, setShowCreate]   = useState(false)
  const [allProjects, setAllProjects] = useState(projects)
  const [showChat, setShowChat]       = useState(false)

  const filtered  = filter === 'tutti' ? allProjects : allProjects.filter(p => p.status === filter)
  const hoursOk   = stats.estimatedHours > 0
  const hoursOver = stats.loggedHours > stats.estimatedHours
  const taskPct   = stats.totalTasks > 0 ? Math.round((stats.doneTasks / stats.totalTasks) * 100) : 0

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ScoreCard icon={<Target className="w-4 h-4" />} label="Task completate"
          value={`${taskPct}%`} sub={`${stats.doneTasks}/${stats.totalTasks} totali`}
          color="#F5C800" trend={taskPct >= 70 ? 'up' : taskPct < 30 ? 'down' : 'neutral'} />
        <ScoreCard icon={<Clock className="w-4 h-4" />} label="Ore lavorate"
          value={`${stats.loggedHours}h`} sub={hoursOk ? `su ${stats.estimatedHours}h stimate` : 'ore non stimate'}
          color={hoursOver ? 'var(--color-error)' : 'var(--color-info)'} trend={hoursOver ? 'down' : hoursOk ? 'up' : 'neutral'} />
        <ScoreCard icon={<Euro className="w-4 h-4" />} label="MRR reparto"
          value={`€${stats.totalMrr.toLocaleString('it-IT')}`} sub={`${stats.activeProjects} clienti attivi`}
          color="#22C55E" trend="up" />
        <ScoreCard icon={<AlertTriangle className="w-4 h-4" />} label="Risk score medio"
          value={stats.avgRisk > 0 ? `${stats.avgRisk}/10` : '—'}
          sub={stats.avgRisk >= 7 ? '⚠ attenzione richiesta' : stats.avgRisk >= 4 ? 'monitorare' : 'sotto controllo'}
          color={stats.avgRisk >= 7 ? 'var(--color-error)' : stats.avgRisk >= 4 ? 'var(--color-warning)' : 'var(--color-success)'}
          trend={stats.avgRisk >= 7 ? 'down' : 'neutral'} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="col-span-2"><VelocityChart sprints={[]} projects={allProjects} /></div>
        <ClientHealthList projects={allProjects} />
      </div>

      <div>
        <button onClick={() => setShowChat(s => !s)}
          className="flex items-center gap-2 text-xs font-bold text-gold-text hover:text-gold-text transition-colors mb-3">
          <Bot className="w-4 h-4" />
          {showChat ? 'Nascondi' : 'Apri'} AI Chat reparto
          {!showChat && savedChats.length > 0 && (
            <span className="text-2xs text-text-tertiary font-normal ml-1">{savedChats.length} conversazioni</span>
          )}
        </button>
        {showChat && <AIChatSection dept={dept} projects={allProjects} stats={stats} savedChats={savedChats} />}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <p className="text-text-tertiary text-sm">{allProjects.length} progetti · {stats.activeSprints} sprint attivi</p>
          <div className="flex items-center gap-2">
            <div className="flex bg-surface border border-border rounded-lg overflow-hidden">
              {(['tutti', 'attivo', 'completato'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${filter === f ? 'text-on-gold' : 'text-text-tertiary hover:text-text-primary'}`}
                  style={filter === f ? { background: color } : {}}>
                  {f}
                </button>
              ))}
            </div>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-on-gold hover:brightness-110"
              style={{ background: color }}>
              <Plus className="w-3.5 h-3.5" /> Nuovo Progetto
            </button>
          </div>
        </div>
        {filtered.length === 0
          ? <div className="flex flex-col items-center py-16 gap-3 text-center">
              <p className="text-text-tertiary text-sm">Nessun progetto{filter !== 'tutti' ? ` "${filter}"` : ''}</p>
              <button onClick={() => setShowCreate(true)} className="text-xs font-bold px-4 py-2 rounded-lg text-on-gold" style={{ background: color }}>+ Crea il primo progetto</button>
            </div>
          : <div className="space-y-3">{filtered.map(p => <ProjectCard key={p.id} project={p} profiles={profiles} accent={color} />)}</div>
        }
      </div>

      {showCreate && (
        <CreateProjectModal dept={dept} clients={clients}
          onClose={() => setShowCreate(false)}
          onCreated={p => setAllProjects(prev => [{ ...(p as any), tasks: [], sprints: [], client_mrr: null, client_risk: null }, ...prev])} />
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function DeptOperativity({ dept, projects, profiles, clients, stats, savedChats, color }: {
  dept: ProjectKind; projects: DeptProject[]; profiles: Profile[]
  clients: ClientOpt[]; stats: DeptStats; savedChats: SavedChat[]; color: string
}) {
  const [tab, setTab] = useState<OperTab>('dashboard')

  const TABS: { id: OperTab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'board',     label: 'Board Team' },
    { id: 'clienti',   label: 'Task Clienti' },
    { id: 'timeline',  label: 'Timeline' },
  ]

  return (
    <div className="space-y-5">
      {/* Sub-tab bar */}
      <div className="flex gap-1 bg-background border border-border rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${tab === t.id ? 'text-on-gold' : 'text-text-tertiary hover:text-text-primary'}`}
            style={tab === t.id ? { background: color } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <DashboardTab dept={dept} projects={projects} profiles={profiles}
          clients={clients} stats={stats} savedChats={savedChats} color={color} />
      )}
      {tab === 'board' && <BoardTeam projects={projects} profiles={profiles} />}
      {tab === 'clienti' && <TaskClienteSection projects={projects} />}
      {tab === 'timeline' && <RepartiTimeline projects={projects} profiles={profiles} />}
    </div>
  )
}

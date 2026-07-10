'use client'

import Link from 'next/link'
import { CheckCircle2, Clock, CalendarClock, MessageSquare, ChevronRight } from 'lucide-react'

interface TaskToday {
  id: string
  title: string
}

interface TaskDue {
  id: string
  title: string
  due_date: string | null
  status: string
  priority?: string
  project?: { id?: string; name?: string } | null
}

export interface ActiveChannel {
  id: string
  name: string
  type: string
  unread: boolean
  lastMessage?: string
  lastMessageTime?: string
  lastSender?: string
}

interface Props {
  tasksToday: TaskToday[]
  tasksDueSoon: TaskDue[]
  activeChannels: ActiveChannel[]
}

const PRIORITY_DOT: Record<string, string> = {
  urgente: 'bg-error',
  alta: 'bg-orange',
  media: 'bg-info',
  bassa: 'bg-surface-active',
}

function deadlineLabel(dueDate: string): { text: string; cls: string } {
  const diff = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000)
  if (diff < 0) return { text: `${Math.abs(diff)}g in ritardo`, cls: 'text-error font-bold' }
  if (diff === 0) return { text: 'Oggi', cls: 'text-error' }
  if (diff === 1) return { text: 'Domani', cls: 'text-orange' }
  if (diff <= 3) return { text: `Fra ${diff}g`, cls: 'text-orange' }
  return { text: `Fra ${diff}g`, cls: 'text-gold-text' }
}

const CHANNEL_ICON: Record<string, string> = {
  cliente_interno: '🔒',
  customer_care: '🎧',
  interno: '💬',
  cliente: '👤',
  task: '✅',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ora'
  if (mins < 60) return `${mins}m fa`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h fa`
  return `${Math.floor(hrs / 24)}g fa`
}

export function RisorsaView({ tasksToday, tasksDueSoon, activeChannels }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

      {/* ── 1. I miei task di oggi ── */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-gold-text" />
            <p className="text-sm font-bold text-text-primary font-heading">I miei task di oggi</p>
          </div>
          <span className="text-xs font-bold text-gold-text bg-gold/[0.08] px-2 py-0.5 rounded-full">
            {tasksToday.length}
          </span>
        </div>

        {tasksToday.length === 0 ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-7 h-7 text-success mx-auto mb-2" />
            <p className="text-sm text-text-primary font-semibold">Nessun task per oggi</p>
            <p className="text-2xs text-overlay/30 mt-1">Goditi la giornata!</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {tasksToday.map(t => (
              <Link key={t.id} href="/le-mie-attivita"
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-overlay/[0.06] hover:bg-overlay/[0.04] transition-colors group">
                <div className="w-4 h-4 rounded border border-overlay/20 group-hover:border-gold transition-colors shrink-0" />
                <span className="text-sm text-text-primary truncate flex-1">{t.title}</span>
                <ChevronRight className="w-3.5 h-3.5 text-overlay/20 group-hover:text-gold-text shrink-0" />
              </Link>
            ))}
          </div>
        )}

        {tasksToday.length > 0 && (
          <div className="mt-3 pt-3 border-t border-overlay/[0.06] text-center">
            <Link href="/le-mie-attivita" className="text-2xs text-gold-text hover:underline font-semibold">
              Vai alle mie attività →
            </Link>
          </div>
        )}
      </div>

      {/* ── 2. Scadenze imminenti ── */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-gold-text" />
            <p className="text-sm font-bold text-text-primary font-heading">Scadenze imminenti</p>
          </div>
          <span className="text-xs font-bold text-gold-text bg-gold/[0.08] px-2 py-0.5 rounded-full">
            {tasksDueSoon.length}
          </span>
        </div>

        {tasksDueSoon.length === 0 ? (
          <div className="text-center py-6">
            <Clock className="w-7 h-7 text-success mx-auto mb-2" />
            <p className="text-sm text-text-primary font-semibold">Nessuna scadenza</p>
            <p className="text-2xs text-overlay/30 mt-1">Nessun task in scadenza nei prossimi 7 giorni</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {tasksDueSoon.slice(0, 6).map(t => {
              const dl = t.due_date ? deadlineLabel(t.due_date) : null
              return (
                <Link key={t.id} href="/le-mie-attivita"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-overlay/[0.06] hover:bg-overlay/[0.04] transition-colors group">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[t.priority ?? 'media'] ?? PRIORITY_DOT.media}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{t.title}</p>
                    {t.project?.name && (
                      <p className="text-2xs text-overlay/30 truncate">{t.project.name}</p>
                    )}
                  </div>
                  {dl && (
                    <span className={`text-2xs font-semibold shrink-0 ${dl.cls}`}>
                      {dl.text}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}

        {tasksDueSoon.length > 6 && (
          <div className="mt-3 pt-3 border-t border-overlay/[0.06] text-center">
            <Link href="/le-mie-attivita" className="text-2xs text-gold-text hover:underline font-semibold">
              +{tasksDueSoon.length - 6} altre scadenze →
            </Link>
          </div>
        )}
      </div>

      {/* ── 3. Canali Chat attivi ── */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gold-text" />
            <p className="text-sm font-bold text-text-primary font-heading">Canali Chat attivi</p>
          </div>
          {activeChannels.some(c => c.unread) && (
            <span className="text-2xs font-bold text-text-primary bg-error/80 px-2 py-0.5 rounded-full">
              {activeChannels.filter(c => c.unread).length} non letti
            </span>
          )}
        </div>

        {activeChannels.length === 0 ? (
          <div className="text-center py-6">
            <MessageSquare className="w-7 h-7 text-overlay/15 mx-auto mb-2" />
            <p className="text-sm text-text-primary font-semibold">Nessun canale</p>
            <p className="text-2xs text-overlay/30 mt-1">Non sei membro di nessun canale chat</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {activeChannels.slice(0, 6).map(ch => (
              <Link key={ch.id} href="/chat"
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-overlay/[0.06] hover:bg-overlay/[0.04] transition-colors group">
                <span className="text-sm shrink-0">{CHANNEL_ICON[ch.type] ?? '💬'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-sm truncate ${ch.unread ? 'text-text-primary font-semibold' : 'text-overlay/50'}`}>
                      {ch.name}
                    </p>
                    {ch.unread && <div className="w-1.5 h-1.5 rounded-full bg-gold shrink-0" />}
                  </div>
                  {ch.lastMessage && (
                    <p className="text-2xs text-overlay/30 truncate">
                      {ch.lastSender && <span className="font-semibold text-overlay/40">{ch.lastSender}: </span>}
                      {ch.lastMessage}
                    </p>
                  )}
                </div>
                {ch.lastMessageTime && (
                  <span className="text-2xs text-overlay/20 shrink-0">
                    {timeAgo(ch.lastMessageTime)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}

        {activeChannels.length > 6 && (
          <div className="mt-3 pt-3 border-t border-overlay/[0.06] text-center">
            <Link href="/chat" className="text-2xs text-gold-text hover:underline font-semibold">
              Tutti i canali →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

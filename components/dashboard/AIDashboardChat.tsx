'use client'

import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, ArrowRight, Loader2, X, Users, FolderOpen, BarChart3, CheckSquare, TrendingUp, AlertTriangle, CalendarDays, LayoutDashboard, Receipt, Headphones } from 'lucide-react'
import Link from 'next/link'

export interface AIContext {
  mrr: number
  clientsCount: number
  clientsAtRisk: number
  clientsLost: number
  alertsCount: number
  tasksDueSoon: number
  projectsCount: number
  topAlerts: { title: string; severity: string }[]
  clients: { name: string; label: string; mrr: number; type: string; id: string }[]
}

interface Action { label: string; href: string; icon?: string }
interface Message { role: 'user' | 'ai'; text: string; actions?: Action[] }

const ICON_MAP: Record<string, React.ReactNode> = {
  users: <Users className="w-3 h-3" />,
  'folder-open': <FolderOpen className="w-3 h-3" />,
  'bar-chart-3': <BarChart3 className="w-3 h-3" />,
  'check-square': <CheckSquare className="w-3 h-3" />,
  'trending-up': <TrendingUp className="w-3 h-3" />,
  'alert-triangle': <AlertTriangle className="w-3 h-3" />,
  calendar: <CalendarDays className="w-3 h-3" />,
  'layout-dashboard': <LayoutDashboard className="w-3 h-3" />,
  receipt: <Receipt className="w-3 h-3" />,
  headphones: <Headphones className="w-3 h-3" />,
}

const SUGGESTED = [
  { text: 'Come stanno i clienti?', icon: <Users className="w-3.5 h-3.5" /> },
  { text: 'Task in scadenza oggi', icon: <CheckSquare className="w-3.5 h-3.5" /> },
  { text: 'Revenue e MRR attuale', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { text: 'Chi è a rischio churn?', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
]

export function AIDashboardChat({ context }: { context: AIContext }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const endRef   = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (query: string) => {
    if (!query.trim() || loading) return
    setMessages(p => [...p, { role: 'user', text: query }])
    setInput('')
    setLoading(true)
    try {
      const r = await fetch('/api/ai/dashboard-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, context }),
      })
      const data = await r.json()
      setMessages(p => [...p, { role: 'ai', text: data.answer ?? 'Nessuna risposta.', actions: data.actions ?? [] }])
    } catch {
      setMessages(p => [...p, { role: 'ai', text: 'Errore di connessione. Riprova.' }])
    }
    setLoading(false)
  }

  const hasMessages = messages.length > 0

  return (
    <div className="w-full mb-6">
      {/* ── Chat history ── */}
      {hasMessages && (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl mb-2 overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#111]">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-[#F5C800]/10 border border-[#F5C800]/20 flex items-center justify-center">
                <Sparkles className="w-2.5 h-2.5 text-[#F5C800]" />
              </div>
              <span className="text-xs font-bold text-[#F5C800] tracking-wide">TWO BEE AI</span>
            </div>
            <button onClick={() => setMessages([])}
              className="text-[#333] hover:text-[#888] transition-colors p-1 rounded-lg hover:bg-[#1A1A1A]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div className="max-h-80 overflow-y-auto px-4 py-4 space-y-5">
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="bg-[#1A1A1A] border border-[#252525] rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[75%]">
                      <p className="text-sm text-white leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-[#F5C800]/10 border border-[#F5C800]/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-3 h-3 text-[#F5C800]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#C0C0C0] leading-relaxed">{msg.text}</p>
                      {msg.actions && msg.actions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {msg.actions.map((a, j) => (
                            <Link key={j} href={a.href}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-[#252525] bg-[#111] text-[#888] hover:text-white hover:border-[#F5C800]/30 transition-all group">
                              {a.icon && ICON_MAP[a.icon] && (
                                <span className="text-[#444] group-hover:text-[#F5C800] transition-colors">
                                  {ICON_MAP[a.icon]}
                                </span>
                              )}
                              {a.label}
                              <ArrowRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-[#F5C800]/10 border border-[#F5C800]/20 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3 h-3 text-[#F5C800]" />
                </div>
                <div className="flex items-center gap-2 py-1">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-[#333] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-[#333] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-[#333] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>
      )}

      {/* ── Suggested prompts (only when no messages) ── */}
      {!hasMessages && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          {SUGGESTED.map((s, i) => (
            <button key={i} onClick={() => send(s.text)}
              className="flex items-center gap-2 text-left text-xs text-[#444] bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2.5 hover:border-[#2A2A2A] hover:text-[#888] transition-all">
              <span className="shrink-0 text-[#333]">{s.icon}</span>
              {s.text}
            </button>
          ))}
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="relative flex items-center gap-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl px-4 py-3 focus-within:border-[#F5C800]/25 transition-colors">
        <Sparkles className="w-4 h-4 text-[#2A2A2A] shrink-0" />
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
          placeholder="Chiedi qualcosa al gestionale…"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-[#2A2A2A] outline-none"
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-20"
          style={{ background: input.trim() && !loading ? '#F5C800' : '#111', border: '1px solid #1A1A1A' }}>
          {loading
            ? <Loader2 className="w-3.5 h-3.5 text-[#444] animate-spin" />
            : <Send className="w-3.5 h-3.5" style={{ color: input.trim() ? '#000' : '#333' }} />}
        </button>
      </div>
    </div>
  )
}

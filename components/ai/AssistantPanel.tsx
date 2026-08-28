'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Send, Sparkles, Wrench, X } from 'lucide-react'
import { ConfirmActionCard } from './ConfirmActionCard'

export type Surface = 'dashboard' | 'workspace'

interface Link_ { percorso: string; etichetta: string }
interface Step { tool: string; ok: boolean }
interface Pending { id: string; tool: string; summary: string }

interface Message {
  role: 'user' | 'ai'
  text: string
  links?: Link_[]
  steps?: Step[]
  pending?: Pending | null
  pendingResolved?: boolean
}

// Etichette umane: "sto leggendo le tue task" dice qualcosa, "list_my_tasks" no.
const TOOL_LABELS: Record<string, string> = {
  search: 'cerco nel gestionale',
  list_team: 'guardo il team',
  open_page: 'preparo il link',
  list_my_tasks: 'leggo le tue task',
  list_tasks: 'cerco fra le task',
  get_task: 'apro la task',
  list_projects: 'leggo i progetti',
  get_project: 'apro il progetto',
  list_sprints: 'leggo gli sprint',
  get_workload: 'calcolo il carico di lavoro',
  list_clients: 'leggo i clienti',
  get_financials: 'leggo i dati economici',
  create_task: 'creo la task',
  update_task: 'aggiorno la task',
  complete_task: 'chiudo la task',
  assign_task: 'aggiorno gli assegnatari',
  delete_task: 'sposto nel cestino',
  request_task: 'invio la richiesta',
  create_project: 'creo il progetto',
  create_sprint: 'creo lo sprint',
  create_milestone: 'creo la milestone',
  create_plan: 'creo il piano',
}

const SUGGESTED: Record<Surface, string[]> = {
  dashboard: [
    'Riassumimi le mie task',
    'Quali clienti sono a rischio?',
    'Chi è più carico questa settimana?',
    'Progetti attivi e avanzamento',
  ],
  workspace: [
    'Riassumimi le mie task',
    'Cosa scade questa settimana?',
    'Qual è il mio carico di lavoro?',
    'Mostrami i progetti attivi',
  ],
}

interface Props {
  open: boolean
  onClose: () => void
  surface: Surface
  userName?: string | null
}

export function AssistantPanel({ open, onClose, surface, userName }: Props) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const send = useCallback(async (query: string) => {
    if (!query.trim() || loading) return
    setMessages((p) => [...p, { role: 'user', text: query }])
    setInput('')
    setLoading(true)
    try {
      const r = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, surface, conversationId }),
      })
      const data = await r.json()
      if (data.conversationId) setConversationId(data.conversationId)
      setMessages((p) => [...p, {
        role: 'ai',
        text: data.answer ?? data.error ?? 'Nessuna risposta.',
        links: data.links ?? [],
        steps: data.steps ?? [],
        pending: data.pending ?? null,
      }])
    } catch {
      setMessages((p) => [...p, { role: 'ai', text: 'Errore di connessione. Riprova.' }])
    }
    setLoading(false)
  }, [loading, surface, conversationId])

  const resolvePending = async (index: number, confirm: boolean) => {
    const msg = messages[index]
    if (!msg?.pending) return
    if (!confirm) {
      setMessages((p) => p.map((m, i) => i === index ? { ...m, pendingResolved: true } : m))
      setMessages((p) => [...p, { role: 'ai', text: 'Annullato, non ho toccato nulla.' }])
      return
    }
    setConfirming(true)
    try {
      const r = await fetch('/api/ai/assistant/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingId: msg.pending.id, surface, conversationId }),
      })
      const data = await r.json()
      setMessages((p) => p.map((m, i) => i === index ? { ...m, pendingResolved: true } : m))
      setMessages((p) => [...p, { role: 'ai', text: data.answer ?? 'Fatto.' }])
      // I dati sono cambiati: la pagina sotto al pannello deve rifletterlo.
      if (data.ok) router.refresh()
    } catch {
      setMessages((p) => [...p, { role: 'ai', text: 'Non sono riuscito a eseguire l’azione.' }])
    }
    setConfirming(false)
  }

  const hasMessages = messages.length > 0

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-scrim transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label="Assistente AI"
        aria-modal="true"
        className={`fixed top-0 right-0 z-50 h-screen w-full sm:w-[420px] bg-surface border-l border-border flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gold-dim border border-gold/20 flex items-center justify-center">
              <Sparkles className="w-2.5 h-2.5 text-gold-text" aria-hidden="true" />
            </div>
            <span className="text-2xs font-bold text-gold-text tracking-wide">TWO BEE AI</span>
          </div>
          <div className="flex items-center gap-1">
            {hasMessages && (
              <button
                onClick={() => { setMessages([]); setConversationId(null) }}
                className="text-2xs text-text-tertiary hover:text-text-secondary px-2 py-1 rounded-lg hover:bg-surface-hover transition-colors"
              >
                Nuova
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Chiudi assistente"
              className="text-text-tertiary hover:text-text-secondary p-1 rounded-lg hover:bg-surface-hover transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {!hasMessages && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary leading-relaxed">
                Ciao{userName ? ` ${userName.split(' ')[0]}` : ''}. Chiedimi delle tue task, dei progetti
                o del carico di lavoro — posso anche crearle e aggiornarle per te.
              </p>
              <div className="space-y-2">
                {SUGGESTED[surface].map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left text-2xs text-text-tertiary bg-background border border-border rounded-xl px-3 py-2.5 hover:text-text-secondary hover:border-border-strong transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="bg-surface-hover border border-border rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%]">
                    <p className="text-sm text-text-primary leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-gold-dim border border-gold/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-gold-text" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {!!msg.steps?.length && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
                        {msg.steps.map((s, j) => (
                          <span key={j} className={`inline-flex items-center gap-1 text-2xs ${s.ok ? 'text-text-tertiary' : 'text-error'}`}>
                            <Wrench className="w-2.5 h-2.5" aria-hidden="true" />
                            {TOOL_LABELS[s.tool] ?? s.tool}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                    {msg.pending && !msg.pendingResolved && (
                      <ConfirmActionCard
                        summary={msg.pending.summary}
                        busy={confirming}
                        onConfirm={() => resolvePending(i, true)}
                        onCancel={() => resolvePending(i, false)}
                      />
                    )}

                    {!!msg.links?.length && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {msg.links.map((a, j) => (
                          <Link
                            key={j}
                            href={a.percorso}
                            onClick={onClose}
                            className="inline-flex items-center gap-1.5 text-2xs font-semibold px-3 py-1.5 rounded-xl border border-border bg-background text-text-secondary hover:text-text-primary hover:border-gold/30 transition-colors group"
                          >
                            {a.etichetta}
                            <ArrowRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
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
              <div className="w-6 h-6 rounded-full bg-gold-dim border border-gold/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-3 h-3 text-gold-text" aria-hidden="true" />
              </div>
              <div className="flex gap-1 py-2">
                <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="p-3 border-t border-border shrink-0">
          <div className="flex items-center gap-3 bg-background border border-border-interactive rounded-2xl px-4 py-2.5 focus-within:border-gold/40 transition-colors">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
              placeholder="Chiedi o chiedi di fare…"
              aria-label="Messaggio per l'assistente"
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              aria-label="Invia messaggio"
              className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-gold text-on-gold disabled:bg-surface-active disabled:text-text-tertiary transition-colors"
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                : <Send className="w-3.5 h-3.5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

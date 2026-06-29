'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, Users, FolderKanban, CheckSquare, MessageSquare, FileText, ShoppingCart, CornerDownLeft } from 'lucide-react'
import { globalSearch, type SearchResult, type SearchType } from '@/app/actions/global-search'

const TYPE_META: Record<SearchType, { label: string; icon: React.ReactNode; color: string }> = {
  cliente:    { label: 'Clienti',    icon: <Users className="w-3.5 h-3.5" />,        color: '#F5C800' },
  progetto:   { label: 'Progetti',   icon: <FolderKanban className="w-3.5 h-3.5" />, color: '#3B82F6' },
  task:       { label: 'Task',       icon: <CheckSquare className="w-3.5 h-3.5" />,  color: '#22C55E' },
  messaggio:  { label: 'Messaggi',   icon: <MessageSquare className="w-3.5 h-3.5" />, color: '#A855F7' },
  documento:  { label: 'Documenti',  icon: <FileText className="w-3.5 h-3.5" />,     color: '#06B6D4' },
  deal:       { label: 'Commerciale', icon: <ShoppingCart className="w-3.5 h-3.5" />, color: '#F59E0B' },
}

const TYPE_ORDER: SearchType[] = ['cliente', 'progetto', 'task', 'messaggio', 'documento', 'deal']

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive]   = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const reqId = useRef(0)

  // Apertura con Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQuery(''); setResults([]); setActive(0) }
  }, [open])

  // Ricerca con debounce
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    const id = ++reqId.current
    const t = setTimeout(async () => {
      const res = await globalSearch(query)
      if (id === reqId.current) { setResults(res); setActive(0); setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const go = useCallback((r: SearchResult) => {
    setOpen(false)
    router.push(r.href)
  }, [router])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]) }
  }

  const grouped = TYPE_ORDER
    .map((type) => ({ type, items: results.filter((r) => r.type === type) }))
    .filter((g) => g.items.length > 0)

  let flatIndex = -1

  return (
    <>
      {/* Trigger nell'Header */}
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 bg-background border border-[#2A2A2A] rounded-lg pl-9 pr-3 py-2 text-sm text-text-secondary hover:border-gold/40 transition-colors relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
        <span className="flex-1 text-left">Cerca clienti, task, messaggi…</span>
        <kbd className="hidden sm:inline-block text-[10px] font-bold text-[#555] border border-[#2A2A2A] rounded px-1.5 py-0.5">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 bg-black/70"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="w-full max-w-xl bg-[#0D0D0D] border border-[#2A2A2A] rounded-2xl shadow-2xl overflow-hidden">
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1A1A1A]">
              <Search className="w-4 h-4 text-text-secondary shrink-0" />
              <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
                placeholder="Cerca in clienti, progetti, task, chat, documenti…"
                className="flex-1 bg-transparent text-sm text-white placeholder-[#444] focus:outline-none" />
              {loading && <Loader2 className="w-4 h-4 text-text-secondary animate-spin shrink-0" />}
            </div>

            {/* Risultati */}
            <div className="max-h-[55vh] overflow-y-auto">
              {query.trim().length < 2 ? (
                <div className="px-4 py-10 text-center text-[#444] text-sm">Digita almeno 2 caratteri per cercare</div>
              ) : !loading && results.length === 0 ? (
                <div className="px-4 py-10 text-center text-[#444] text-sm">Nessun risultato per “{query}”</div>
              ) : (
                grouped.map((g) => (
                  <div key={g.type} className="py-1.5">
                    <div className="flex items-center gap-1.5 px-4 py-1 text-[10px] font-black uppercase tracking-wider"
                      style={{ color: TYPE_META[g.type].color }}>
                      {TYPE_META[g.type].icon} {TYPE_META[g.type].label}
                    </div>
                    {g.items.map((r) => {
                      flatIndex++
                      const idx = flatIndex
                      return (
                        <div key={`${r.type}-${r.id}`} onClick={() => go(r)}
                          onMouseEnter={() => setActive(idx)}
                          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${active === idx ? 'bg-white/[0.04]' : ''}`}>
                          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `${TYPE_META[r.type].color}15`, color: TYPE_META[r.type].color }}>
                            {TYPE_META[r.type].icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white truncate">{r.title}</p>
                            {r.subtitle && <p className="text-[11px] text-[#555] truncate">{r.subtitle}</p>}
                          </div>
                          {active === idx && <CornerDownLeft className="w-3.5 h-3.5 text-[#444] shrink-0" />}
                        </div>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-3 px-4 py-2 border-t border-[#1A1A1A] text-[10px] text-[#444]">
              <span><kbd className="border border-[#2A2A2A] rounded px-1">↑↓</kbd> naviga</span>
              <span><kbd className="border border-[#2A2A2A] rounded px-1">↵</kbd> apri</span>
              <span><kbd className="border border-[#2A2A2A] rounded px-1">esc</kbd> chiudi</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

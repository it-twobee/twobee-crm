'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, AlertCircle, CheckCircle2, Clock, ArrowUpRight,
  Plus, Briefcase, Trash2, X, Loader2, Users, ArrowLeft,
  ChevronDown, ChevronRight, FolderKanban, ListFilter,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import type { ClientType, ClientLabel } from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaskMin { id: string; status: string; priority: string; due_date: string | null }
interface ProjectMin {
  id: string; name: string; status: string; sprint_current: number; client_id: string
  tasks: TaskMin[]
}
interface KpiMin { month: string; roas: number | null; leads_generated: number | null; revenue_attributed: number | null; ad_spend: number | null }
interface ClientData {
  id: string; company_name: string; package: string; mrr: number
  status: string; client_type: ClientType; client_label: ClientLabel; payment_status: string
  projects: ProjectMin[]; client_kpis: KpiMin[]
}
interface PortfolioProjectEntry { project_id: string; priority: 'alta' | 'media' | 'bassa'; added_at: string }
interface PortfolioClientEntry { client_id: string; priority: 'alta' | 'media' | 'bassa' }
type SmartFilter = { client_type?: string; project_status?: string; project_kind?: string }

interface Portfolio {
  id: string; name: string; description: string | null; color: string; created_at: string
  smart_filter?: SmartFilter | null
  portfolio_projects: PortfolioProjectEntry[]
  portfolio_clients: PortfolioClientEntry[]
  created_by_profile?: { id: string; full_name: string; avatar_url: string | null } | null
}
interface ProfileMin { id: string; full_name: string; avatar_url: string | null }

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = { verde: 'bg-success', giallo: 'bg-warning', rosso: 'bg-error' }
const PRIORITY_BADGE: Record<string, string> = {
  alta:  'bg-red-500/20 text-red-400 border border-red-500/30',
  media: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  bassa: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
}
const PROJECT_STATUS_BADGE: Record<string, string> = {
  attivo:     'bg-success/20 text-success',
  in_pausa:   'bg-warning/20 text-warning',
  completato: 'bg-blue-500/20 text-blue-400',
  archiviato: 'bg-[#2A2A2A] text-text-secondary',
}
const PALETTE = ['#F5C800', '#22C55E', '#3B82F6', '#8B5CF6', '#EF4444', '#F59E0B', '#06B6D4', '#EC4899']
const FOLDER_STYLES: Record<string, { bg: string; border: string }> = {
  '#F5C800': { bg: 'bg-yellow-500/15', border: 'border-yellow-500/30' },
  '#22C55E': { bg: 'bg-green-500/15',  border: 'border-green-500/30'  },
  '#3B82F6': { bg: 'bg-blue-500/15',   border: 'border-blue-500/30'   },
  '#8B5CF6': { bg: 'bg-purple-500/15', border: 'border-purple-500/30' },
  '#EF4444': { bg: 'bg-red-500/15',    border: 'border-red-500/30'    },
  '#F59E0B': { bg: 'bg-amber-500/15',  border: 'border-amber-500/30'  },
  '#06B6D4': { bg: 'bg-cyan-500/15',   border: 'border-cyan-500/30'   },
  '#EC4899': { bg: 'bg-pink-500/15',   border: 'border-pink-500/30'   },
}

function clientHealth(client: ClientData) {
  let score = 100
  if (client.status === 'rosso') score -= 40
  else if (client.status === 'giallo') score -= 20
  if (client.payment_status === 'scaduto') score -= 30
  else if (client.payment_status === 'in_attesa') score -= 10
  if (client.client_label === 'in_bilico') score -= 20
  const overdue = client.projects.flatMap(p => p.tasks)
    .filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completato').length
  score = Math.max(0, Math.min(100, score - overdue * 5))
  if (score >= 75) return { color: 'text-success', bg: 'bg-success', label: 'Ottimo', score }
  if (score >= 50) return { color: 'text-warning', bg: 'bg-warning', label: 'Attenzione', score }
  return { color: 'text-error', bg: 'bg-error', label: 'Critico', score }
}

// ─── New Portfolio Modal ──────────────────────────────────────────────────────

function NewPortfolioModal({ clients, onClose, onCreated }: {
  clients: ClientData[]
  onClose: () => void
  onCreated: (p: Portfolio) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#F5C800')
  const [mode, setMode] = useState<'manual' | 'smart'>('manual')
  const [smartClientType, setSmartClientType] = useState('')
  const [smartProjectKind, setSmartProjectKind] = useState('')
  const [smartProjectStatus, setSmartProjectStatus] = useState('')
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const toggleClient = (id: string) =>
    setExpandedClients(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleProject = (id: string) =>
    setSelectedProjects(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])

  const toggleAllClientProjects = (client: ClientData) => {
    const ids = client.projects.map(p => p.id)
    const allSelected = ids.every(id => selectedProjects.includes(id))
    if (allSelected) setSelectedProjects(prev => prev.filter(id => !ids.includes(id)))
    else setSelectedProjects(prev => Array.from(new Set([...prev, ...ids])))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const smartFilter: SmartFilter | null = mode === 'smart'
      ? { ...(smartClientType ? { client_type: smartClientType } : {}),
          ...(smartProjectKind ? { project_kind: smartProjectKind } : {}),
          ...(smartProjectStatus ? { project_status: smartProjectStatus } : {}) }
      : null

    const { data: portfolio, error } = await supabase.from('portfolios').insert({
      name: name.trim(), description: description || null, color, created_by: user?.id,
      ...(smartFilter && Object.keys(smartFilter).length > 0 ? { smart_filter: smartFilter } : {}),
    }).select().single()
    if (error) { toast.error('Errore: ' + error.message); setLoading(false); return }

    const ppEntries: PortfolioProjectEntry[] = []
    if (mode === 'manual' && selectedProjects.length > 0) {
      await supabase.from('portfolio_projects').insert(
        selectedProjects.map(project_id => ({ portfolio_id: portfolio.id, project_id, priority: 'media' }))
      )
      selectedProjects.forEach(pid => ppEntries.push({ project_id: pid, priority: 'media', added_at: new Date().toISOString() }))
    }

    const clientIds = Array.from(new Set(
      clients.filter(c => c.projects.some(p => selectedProjects.includes(p.id))).map(c => c.id)
    ))
    const pcEntries: PortfolioClientEntry[] = []
    if (mode === 'manual' && clientIds.length > 0) {
      await supabase.from('portfolio_clients').insert(
        clientIds.map(client_id => ({ portfolio_id: portfolio.id, client_id, priority: 'media' }))
      )
      clientIds.forEach(cid => pcEntries.push({ client_id: cid, priority: 'media' }))
    }

    setLoading(false)
    toast.success(`Portfolio ${mode === 'smart' ? 'smart ' : ''}creato!`)
    onCreated({ ...portfolio, smart_filter: smartFilter, portfolio_projects: ppEntries, portfolio_clients: pcEntries } as Portfolio)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-[#2A2A2A] rounded-card w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A] shrink-0">
          <h2 className="text-base font-bold text-white">Nuovo Portfolio</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary hover:text-white" /></button>
        </div>
        <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Nome *</label>
            <input required value={name} onChange={e => setName(e.target.value)}
              placeholder="es. Clienti Premium, Q3 Growth..."
              className="w-full bg-background border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Descrizione</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Opzionale..."
              className="w-full bg-background border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-2">Colore</label>
            <div className="flex gap-2 flex-wrap">
              {PALETTE.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {/* Mode selector */}
          <div>
            <label className="block text-xs text-text-secondary mb-2">Tipo portfolio</label>
            <div className="flex gap-2">
              {([['manual', 'Manuale'], ['smart', 'Smart (dinamico)']] as const).map(([k, v]) => (
                <button key={k} type="button" onClick={() => setMode(k)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${mode === k ? 'bg-gold text-black' : 'bg-[#1A1A1A] border border-[#2A2A2A] text-text-secondary hover:text-white'}`}>{v}</button>
              ))}
            </div>
          </div>

          {mode === 'smart' && (
            <div className="space-y-3 bg-[#0C0C0C] border border-[#2A2A2A] rounded-xl p-4">
              <p className="text-[10px] text-[#555] uppercase font-bold tracking-wider">Filtri dinamici — il portfolio si aggiorna automaticamente</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-text-secondary mb-1">Tipo cliente</label>
                  <select value={smartClientType} onChange={e => setSmartClientType(e.target.value)}
                    className="w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-xs text-white">
                    <option value="">Tutti</option>
                    <option value="growth">Growth</option>
                    <option value="digital">Digital</option>
                    <option value="growth_digital">Growth + Digital</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-text-secondary mb-1">Tipo progetto</label>
                  <select value={smartProjectKind} onChange={e => setSmartProjectKind(e.target.value)}
                    className="w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-xs text-white">
                    <option value="">Tutti</option>
                    <option value="growth">Growth</option>
                    <option value="digital">Digital</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-text-secondary mb-1">Stato progetto</label>
                  <select value={smartProjectStatus} onChange={e => setSmartProjectStatus(e.target.value)}
                    className="w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-xs text-white">
                    <option value="">Tutti</option>
                    <option value="attivo">Attivo</option>
                    <option value="pianificato">Pianificato</option>
                    <option value="completato">Completato</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {mode === 'manual' && <div>
            <label className="block text-xs text-text-secondary mb-2">
              Progetti da includere
              {selectedProjects.length > 0 && <span className="text-gold ml-2">{selectedProjects.length} selezionati</span>}
            </label>
            <div className="max-h-56 overflow-y-auto border border-[#2A2A2A] rounded-lg divide-y divide-[#2A2A2A]">
              {clients.map(client => {
                const expanded = expandedClients.has(client.id)
                const allSel = client.projects.length > 0 && client.projects.every(p => selectedProjects.includes(p.id))
                const someSel = client.projects.some(p => selectedProjects.includes(p.id))
                return (
                  <div key={client.id}>
                    {/* Client header row */}
                    <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer"
                      onClick={() => toggleClient(client.id)}>
                      {expanded ? <ChevronDown className="w-3.5 h-3.5 text-text-secondary shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-text-secondary shrink-0" />}
                      <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel && !allSel }}
                        onChange={e => { e.stopPropagation(); toggleAllClientProjects(client) }}
                        onClick={e => e.stopPropagation()}
                        className="accent-gold w-3.5 h-3.5 shrink-0" />
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[client.status] ?? 'bg-[#444]'}`} />
                      <span className="text-sm font-semibold text-white flex-1">{client.company_name}</span>
                      <span className="text-xs text-text-secondary">{client.projects.length} progetti</span>
                    </div>
                    {/* Projects */}
                    {expanded && client.projects.map(proj => (
                      <label key={proj.id} className="flex items-center gap-3 px-3 py-1.5 pl-9 hover:bg-white/5 cursor-pointer">
                        <input type="checkbox" checked={selectedProjects.includes(proj.id)} onChange={() => toggleProject(proj.id)}
                          className="accent-gold w-3.5 h-3.5 shrink-0" />
                        <FolderKanban className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                        <span className="text-sm text-white flex-1">{proj.name}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${PROJECT_STATUS_BADGE[proj.status] ?? ''}`}>
                          {proj.status.replace('_', ' ')}
                        </span>
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-[#2A2A2A] rounded-lg text-sm text-text-secondary hover:text-white">Annulla</button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-gold text-black font-bold rounded-lg text-sm hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Crea Portfolio
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Add Projects Modal ───────────────────────────────────────────────────────

function AddProjectsModal({ portfolioId, clients, existingProjectIds, onClose, onAdded }: {
  portfolioId: string
  clients: ClientData[]
  existingProjectIds: string[]
  onClose: () => void
  onAdded: (entries: PortfolioProjectEntry[], clientEntries: PortfolioClientEntry[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const available = clients.map(c => ({ ...c, projects: c.projects.filter(p => !existingProjectIds.includes(p.id)) }))
    .filter(c => c.projects.length > 0)

  const toggleExpand = (id: string) =>
    setExpandedClients(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const submit = async () => {
    if (!selected.length) return
    setLoading(true)
    const supabase = createClient()
    await supabase.from('portfolio_projects').insert(
      selected.map(project_id => ({ portfolio_id: portfolioId, project_id, priority: 'media' }))
    )
    const newClientIds = Array.from(new Set(
      clients.filter(c => c.projects.some(p => selected.includes(p.id))).map(c => c.id)
    ))
    await supabase.from('portfolio_clients').upsert(
      newClientIds.map(client_id => ({ portfolio_id: portfolioId, client_id, priority: 'media' })),
      { onConflict: 'portfolio_id,client_id', ignoreDuplicates: true }
    )
    setLoading(false)
    toast.success(`${selected.length} progett${selected.length === 1 ? 'o aggiunto' : 'i aggiunti'}!`)
    const ppEntries: PortfolioProjectEntry[] = selected.map(pid => ({ project_id: pid, priority: 'media', added_at: new Date().toISOString() }))
    const pcEntries: PortfolioClientEntry[] = newClientIds.map(cid => ({ client_id: cid, priority: 'media' }))
    onAdded(ppEntries, pcEntries)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-[#2A2A2A] rounded-card w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A] shrink-0">
          <h2 className="text-sm font-bold text-white">Aggiungi progetti</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-text-secondary hover:text-white" /></button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-[#2A2A2A]">
          {available.length === 0 && <p className="text-sm text-text-secondary text-center py-8">Tutti i progetti sono già nel portfolio</p>}
          {available.map(client => {
            const expanded = expandedClients.has(client.id)
            return (
              <div key={client.id}>
                <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/5 cursor-pointer"
                  onClick={() => toggleExpand(client.id)}>
                  {expanded ? <ChevronDown className="w-3.5 h-3.5 text-text-secondary" /> : <ChevronRight className="w-3.5 h-3.5 text-text-secondary" />}
                  <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[client.status] ?? 'bg-[#444]'}`} />
                  <span className="text-sm font-semibold text-white flex-1">{client.company_name}</span>
                  <span className="text-xs text-text-secondary">{client.projects.length}</span>
                </div>
                {expanded && client.projects.map(proj => (
                  <label key={proj.id} className="flex items-center gap-3 px-4 py-2 pl-10 hover:bg-white/5 cursor-pointer">
                    <input type="checkbox" checked={selected.includes(proj.id)} onChange={() => setSelected(prev => prev.includes(proj.id) ? prev.filter(x => x !== proj.id) : [...prev, proj.id])}
                      className="accent-gold w-3.5 h-3.5" />
                    <FolderKanban className="w-3.5 h-3.5 text-text-secondary" />
                    <span className="text-sm text-white flex-1">{proj.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${PROJECT_STATUS_BADGE[proj.status] ?? ''}`}>
                      {proj.status.replace('_', ' ')}
                    </span>
                  </label>
                ))}
              </div>
            )
          })}
        </div>
        <div className="px-5 py-4 border-t border-[#2A2A2A] flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2 border border-[#2A2A2A] rounded-lg text-sm text-text-secondary hover:text-white">Annulla</button>
          <button onClick={submit} disabled={loading || !selected.length}
            className="flex-1 py-2 bg-gold text-black font-bold rounded-lg text-sm hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Aggiungi {selected.length > 0 ? `(${selected.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Portfolio Home Card ──────────────────────────────────────────────────────

function PortfolioCard({ portfolio, clients, onClick, onDelete }: {
  portfolio: Portfolio; clients: ClientData[]
  onClick: () => void; onDelete: (id: string) => void
}) {
  const folderStyle = FOLDER_STYLES[portfolio.color] ?? { bg: 'bg-gold/15', border: 'border-gold/30' }
  const projectCount = portfolio.portfolio_projects.length
  const clientCount = portfolio.portfolio_clients.length

  // Unique clients from projects in portfolio
  const memberClients = clients.filter(c =>
    c.projects.some(p => portfolio.portfolio_projects.some(pp => pp.project_id === p.id))
  )

  return (
    <div onClick={onClick}
      className="group relative bg-surface border border-[#2A2A2A] rounded-2xl p-5 cursor-pointer hover:border-[#3A3A3A] hover:bg-[#1C1C1C] transition-all duration-150">
      <button onClick={e => { e.stopPropagation(); onDelete(portfolio.id) }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-text-secondary hover:text-error">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <div className={`w-14 h-14 rounded-xl ${folderStyle.bg} border ${folderStyle.border} flex items-center justify-center mb-4`}>
        <Briefcase className="w-7 h-7" style={{ color: portfolio.color }} />
      </div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <p className="text-sm font-bold text-white truncate pr-6">{portfolio.name}</p>
        {portfolio.smart_filter && Object.keys(portfolio.smart_filter).length > 0 && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">Smart</span>
        )}
      </div>
      {portfolio.description && <p className="text-xs text-text-secondary mb-2 truncate">{portfolio.description}</p>}
      <div className="flex items-center gap-3 mt-3">
        <div className="flex -space-x-1.5">
          {memberClients.slice(0, 4).map((c, i) => (
            <div key={c.id} className="w-6 h-6 rounded-full bg-gold/20 border border-[#2A2A2A] flex items-center justify-center text-[9px] font-black text-gold"
              style={{ zIndex: 10 - i }}>{c.company_name[0].toUpperCase()}</div>
          ))}
          {memberClients.length > 4 && (
            <div className="w-6 h-6 rounded-full bg-[#2A2A2A] border border-[#2A2A2A] flex items-center justify-center text-[9px] text-text-secondary">+{memberClients.length - 4}</div>
          )}
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-text-secondary">{projectCount} progetti</p>
          {clientCount > 0 && <p className="text-[10px] text-text-secondary">{clientCount} clienti</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Priority Cell (inline dropdown) ─────────────────────────────────────────

function PriorityCell({ portfolioId, projectId, value, onChange }: {
  portfolioId: string; projectId: string; value: 'alta' | 'media' | 'bassa'
  onChange: (v: 'alta' | 'media' | 'bassa') => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const select = async (p: 'alta' | 'media' | 'bassa') => {
    setOpen(false)
    if (p === value) return
    setSaving(true)
    const sb = createClient()
    await sb.from('portfolio_projects').update({ priority: p }).eq('portfolio_id', portfolioId).eq('project_id', projectId)
    setSaving(false)
    onChange(p)
  }

  return (
    <div className="relative">
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded capitalize transition-all ${PRIORITY_BADGE[value]} hover:opacity-80`}>
        {saving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : value}
        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg shadow-xl z-20 min-w-[100px] overflow-hidden">
            {(['alta', 'media', 'bassa'] as const).map(p => (
              <button key={p} onClick={() => select(p)}
                className={`w-full text-left px-3 py-1.5 text-xs capitalize hover:bg-[#2A2A2A] transition-colors ${p === value ? 'font-bold text-gold' : 'text-white'}`}>{p}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Elenco Tab (projects grouped by client) ──────────────────────────────────

function ElencoTab({ portfolio, clients, allClients, onPriorityChange, onAddProjects, onRemoveProject }: {
  portfolio: Portfolio | null
  clients: ClientData[]          // clients visible in this portfolio
  allClients: ClientData[]       // all clients (for add modal)
  onPriorityChange: (projectId: string, p: 'alta' | 'media' | 'bassa') => void
  onAddProjects?: () => void
  onRemoveProject?: (projectId: string) => void
}) {
  const [sortBy, setSortBy] = useState<'priority' | 'name' | 'status'>('priority')
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set(clients.map(c => c.id)))

  const toggleExpand = (id: string) =>
    setExpandedClients(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const getProjectPriority = (projectId: string): 'alta' | 'media' | 'bassa' => {
    if (!portfolio) return 'media'
    return portfolio.portfolio_projects.find(pp => pp.project_id === projectId)?.priority ?? 'media'
  }

  const PRIORITY_ORDER = { alta: 0, media: 1, bassa: 2 }

  const sortedClients = [...clients].sort((a, b) => {
    if (sortBy === 'name') return a.company_name.localeCompare(b.company_name)
    if (sortBy === 'priority') {
      const aPrio = Math.min(...a.projects.map(p => PRIORITY_ORDER[getProjectPriority(p.id)]))
      const bPrio = Math.min(...b.projects.map(p => PRIORITY_ORDER[getProjectPriority(p.id)]))
      return aPrio - bPrio
    }
    return 0
  })

  const totalProjects = clients.reduce((s, c) => s + c.projects.length, 0)

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[#2A2A2A] flex-wrap">
        <span className="text-xs text-text-secondary">{totalProjects} progetti · {clients.length} clienti</span>
        {portfolio && onAddProjects && (
          <button onClick={onAddProjects}
            className="flex items-center gap-1.5 text-xs text-gold border border-gold/30 rounded-lg px-3 py-1.5 hover:bg-gold/10 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Aggiungi progetto
          </button>
        )}
        <div className="flex items-center gap-1 text-xs text-text-secondary ml-auto">
          <ListFilter className="w-3.5 h-3.5" />
          {([['priority', 'Priorità'], ['name', 'Nome'], ['status', 'Stato']] as [typeof sortBy, string][]).map(([k, v]) => (
            <button key={k} onClick={() => setSortBy(k)}
              className={`px-2 py-0.5 rounded transition-colors ${sortBy === k ? 'text-gold font-semibold' : 'hover:text-white'}`}>{v}</button>
          ))}
        </div>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-0 border-b border-[#2A2A2A] px-6 py-2.5">
        {['Progetto / Cliente', 'Priorità', 'Stato', 'Task', 'Scadute', ''].map(h => (
          <span key={h} className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">{h}</span>
        ))}
      </div>

      {/* Rows grouped by client */}
      {sortedClients.length === 0 ? (
        <div className="text-center py-16 text-text-secondary text-sm">
          Nessun progetto in questo portfolio.{' '}
          {onAddProjects && <button onClick={onAddProjects} className="text-gold hover:underline">Aggiungine uno →</button>}
        </div>
      ) : sortedClients.map(client => {
        const expanded = expandedClients.has(client.id)
        const h = clientHealth(client)
        const clientProjects = portfolio
          ? client.projects.filter(p => portfolio.portfolio_projects.some(pp => pp.project_id === p.id))
          : client.projects

        const sortedProjects = [...clientProjects].sort((a, b) => {
          if (sortBy === 'priority') return PRIORITY_ORDER[getProjectPriority(a.id)] - PRIORITY_ORDER[getProjectPriority(b.id)]
          if (sortBy === 'name') return a.name.localeCompare(b.name)
          return 0
        })

        return (
          <div key={client.id} className="border-b border-[#2A2A2A] last:border-0">
            {/* Client header */}
            <div
              onClick={() => toggleExpand(client.id)}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-0 px-6 py-2.5 bg-[#111] hover:bg-[#161616] cursor-pointer transition-colors items-center"
            >
              <div className="flex items-center gap-2">
                {expanded ? <ChevronDown className="w-3.5 h-3.5 text-text-secondary" /> : <ChevronRight className="w-3.5 h-3.5 text-text-secondary" />}
                <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[client.status] ?? 'bg-[#444]'}`} />
                <Link href={`/clienti/${client.id}`} onClick={e => e.stopPropagation()}
                  className="text-sm font-bold text-white hover:text-gold transition-colors">{client.company_name}</Link>
                <span className="text-xs text-text-secondary ml-1">{formatCurrency(client.mrr)}/m</span>
              </div>
              <div />
              <span className={`text-xs font-semibold ${h.color}`}>{h.label}</span>
              <span className="text-xs text-text-secondary">{clientProjects.length} progetti</span>
              <div />
              <div />
            </div>

            {/* Project rows */}
            {expanded && sortedProjects.map(proj => {
              const done = proj.tasks.filter(t => t.status === 'completato').length
              const total = proj.tasks.length
              const pct = total ? Math.round((done / total) * 100) : 0
              const overdue = proj.tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completato').length
              const prio = getProjectPriority(proj.id)

              return (
                <div key={proj.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-0 px-6 py-3 pl-12 hover:bg-white/[0.02] transition-colors items-center group/proj">
                  {/* Progetto */}
                  <div className="flex items-center gap-2">
                    <FolderKanban className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                    <Link href={`/clienti/${client.id}?tab=1`}
                      className="text-sm text-white hover:text-gold transition-colors">{proj.name}</Link>
                  </div>
                  {/* Priorità */}
                  <div>
                    {portfolio ? (
                      <PriorityCell portfolioId={portfolio.id} projectId={proj.id} value={prio} onChange={p => onPriorityChange(proj.id, p)} />
                    ) : (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded capitalize ${PRIORITY_BADGE[prio]}`}>{prio}</span>
                    )}
                  </div>
                  {/* Stato */}
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded capitalize w-fit ${PROJECT_STATUS_BADGE[proj.status] ?? ''}`}>
                    {proj.status.replace('_', ' ')}
                  </span>
                  {/* Task */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs text-white">{done}/{total}</span>
                    </div>
                    {total > 0 && (
                      <div className="w-16 h-1 bg-[#2A2A2A] rounded-full overflow-hidden">
                        <div className="h-full bg-success rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  {/* Scadute */}
                  {overdue > 0
                    ? <span className="text-xs text-error font-semibold">{overdue}</span>
                    : <span className="text-xs text-success">✓</span>
                  }
                  {/* Actions */}
                  <div className="flex items-center gap-1.5 opacity-0 group-hover/proj:opacity-100 transition-opacity">
                    <Link href={`/clienti/${client.id}?tab=1`}
                      className="text-text-secondary hover:text-gold transition-colors" title="Apri progetto">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                    {portfolio && onRemoveProject && (
                      <button onClick={() => onRemoveProject(proj.id)}
                        className="text-text-secondary hover:text-error transition-colors" title="Rimuovi dal portfolio">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({ clients }: { clients: ClientData[] }) {
  const allProjects = clients.flatMap(c => c.projects)
  const allTasks = allProjects.flatMap(p => p.tasks)
  const done = allTasks.filter(t => t.status === 'completato').length
  const overdue = allTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completato').length
  const totalMRR = clients.reduce((s, c) => s + c.mrr, 0)
  const atRisk = clients.filter(c => c.client_label === 'in_bilico' || c.status === 'rosso').length

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'MRR Totale', value: formatCurrency(totalMRR), icon: <TrendingUp className="w-4 h-4 text-success" />, color: 'text-success' },
          { label: 'Progetti', value: allProjects.length, icon: <FolderKanban className="w-4 h-4 text-gold" />, color: 'text-white' },
          { label: 'Task completate', value: `${done}/${allTasks.length}`, icon: <CheckCircle2 className="w-4 h-4 text-blue-400" />, color: 'text-white' },
          { label: 'Task scadute', value: overdue, icon: <Clock className="w-4 h-4 text-warning" />, color: overdue > 0 ? 'text-warning' : 'text-success' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-[#111] border border-[#2A2A2A] rounded-xl p-4 flex items-center gap-3">
            {icon}
            <div>
              <p className="text-[10px] text-text-secondary uppercase tracking-wide">{label}</p>
              <p className={`text-xl font-black ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#111] border border-[#2A2A2A] rounded-xl p-4">
          <p className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-4">Stato Progetti</p>
          {(['attivo', 'in_pausa', 'completato', 'archiviato'] as const).map(s => {
            const count = allProjects.filter(p => p.status === s).length
            return (
              <div key={s} className="flex items-center gap-3 mb-2.5">
                <span className="text-xs text-text-secondary w-24 capitalize">{s.replace('_', ' ')}</span>
                <div className="flex-1 h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${PROJECT_STATUS_BADGE[s]?.includes('success') ? 'bg-success' : PROJECT_STATUS_BADGE[s]?.includes('warning') ? 'bg-warning' : PROJECT_STATUS_BADGE[s]?.includes('blue') ? 'bg-blue-500' : 'bg-[#3A3A3A]'}`}
                    style={{ width: allProjects.length ? `${(count / allProjects.length) * 100}%` : '0%' }} />
                </div>
                <span className="text-xs font-bold text-white w-5 text-right">{count}</span>
              </div>
            )
          })}
        </div>
        <div className="bg-[#111] border border-[#2A2A2A] rounded-xl p-4">
          <p className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-4">Clienti</p>
          {[
            { label: 'Totali', value: clients.length, color: 'text-white' },
            { label: 'A rischio', value: atRisk, color: atRisk > 0 ? 'text-error' : 'text-success' },
            { label: 'Task scadute', value: overdue, color: overdue > 0 ? 'text-warning' : 'text-success' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex justify-between items-center mb-2.5">
              <span className="text-xs text-text-secondary">{label}</span>
              <span className={`text-sm font-bold ${color}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Avanzamento Tab ──────────────────────────────────────────────────────────

function AvanzamentoTab({ clients }: { clients: ClientData[] }) {
  return (
    <div className="p-6 space-y-3">
      {clients.map(client => (
        <div key={client.id} className="bg-[#111] border border-[#2A2A2A] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[client.status] ?? 'bg-[#444]'}`} />
            <Link href={`/clienti/${client.id}`} className="text-sm font-bold text-white hover:text-gold transition-colors flex-1">{client.company_name}</Link>
            <span className="text-xs text-text-secondary">{formatCurrency(client.mrr)}/m</span>
          </div>
          <div className="space-y-2">
            {client.projects.map(proj => {
              const done = proj.tasks.filter(t => t.status === 'completato').length
              const total = proj.tasks.length
              const pct = total ? Math.round((done / total) * 100) : 0
              return (
                <div key={proj.id}>
                  <div className="flex items-center gap-2 mb-1">
                    <FolderKanban className="w-3 h-3 text-text-secondary shrink-0" />
                    <span className="text-xs text-text-secondary flex-1">{proj.name}</span>
                    <span className={`text-xs font-semibold ${pct === 100 ? 'text-success' : pct > 50 ? 'text-warning' : 'text-text-secondary'}`}>{pct}%</span>
                    <Link href={`/clienti/${client.id}?tab=1`}><ArrowUpRight className="w-3 h-3 text-text-secondary hover:text-gold" /></Link>
                  </div>
                  <div className="h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden ml-5">
                    <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-success' : 'bg-gold'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PortfolioClient({ clients, portfolios: initialPortfolios, profiles }: {
  clients: ClientData[]
  portfolios: Portfolio[]
  profiles: ProfileMin[]
}) {
  const [portfolios, setPortfolios] = useState(initialPortfolios)
  const [activePortfolio, setActivePortfolio] = useState<Portfolio | null>(null)
  const [showAllClients, setShowAllClients] = useState(false)
  const [activeTab, setActiveTab] = useState<'elenco' | 'dashboard' | 'avanzamento'>('elenco')
  const [homeTab, setHomeTab] = useState<'recenti' | 'tutti'>('recenti')
  const [showNewPortfolio, setShowNewPortfolio] = useState(false)
  const [showAddProjects, setShowAddProjects] = useState(false)

  const inDetail = activePortfolio !== null || showAllClients

  const visibleClients = (() => {
    if (!activePortfolio) return clients
    const sf = activePortfolio.smart_filter
    if (sf && Object.keys(sf).length > 0) {
      return clients
        .filter(c => !sf.client_type || c.client_type === sf.client_type)
        .map(c => ({
          ...c,
          projects: c.projects.filter(p => {
            if (sf.project_status && p.status !== sf.project_status) return false
            if (sf.project_kind) {
              const proj = c.projects.find(pp => pp.id === p.id) as ProjectMin & { project_kind?: string }
              if (proj && (proj as unknown as { project_kind?: string }).project_kind !== sf.project_kind) return false
            }
            return true
          }),
        }))
        .filter(c => c.projects.length > 0)
    }
    const projIds = new Set(activePortfolio.portfolio_projects.map(pp => pp.project_id))
    return clients
      .map(c => ({ ...c, projects: c.projects.filter(p => projIds.has(p.id)) }))
      .filter(c => c.projects.length > 0)
  })()

  const totalMRR = visibleClients.reduce((s, c) => s + c.mrr, 0)
  const overdueTasks = visibleClients.flatMap(c => c.projects.flatMap(p => p.tasks))
    .filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completato').length
  const totalProjects = visibleClients.reduce((s, c) => s + c.projects.length, 0)

  const handlePriorityChange = (projectId: string, p: 'alta' | 'media' | 'bassa') => {
    const update = (port: Portfolio): Portfolio => ({
      ...port, portfolio_projects: port.portfolio_projects.map(pp => pp.project_id === projectId ? { ...pp, priority: p } : pp)
    })
    setPortfolios(prev => prev.map(po => po.id === activePortfolio?.id ? update(po) : po))
    setActivePortfolio(prev => prev ? update(prev) : null)
  }

  const handleRemoveProject = async (projectId: string) => {
    if (!activePortfolio) return
    const sb = createClient()
    await sb.from('portfolio_projects').delete().eq('portfolio_id', activePortfolio.id).eq('project_id', projectId)
    const update = (port: Portfolio): Portfolio => ({
      ...port, portfolio_projects: port.portfolio_projects.filter(pp => pp.project_id !== projectId)
    })
    setPortfolios(prev => prev.map(po => po.id === activePortfolio.id ? update(po) : po))
    setActivePortfolio(prev => prev ? update(prev) : null)
    toast.success('Progetto rimosso dal portfolio')
  }

  const handleProjectsAdded = (ppEntries: PortfolioProjectEntry[], pcEntries: PortfolioClientEntry[]) => {
    if (!activePortfolio) return
    const update = (port: Portfolio): Portfolio => ({
      ...port,
      portfolio_projects: [...port.portfolio_projects, ...ppEntries],
      portfolio_clients: [
        ...port.portfolio_clients.filter(pc => !pcEntries.some(e => e.client_id === pc.client_id)),
        ...pcEntries,
      ],
    })
    setPortfolios(prev => prev.map(po => po.id === activePortfolio.id ? update(po) : po))
    setActivePortfolio(prev => prev ? update(prev) : null)
    setShowAddProjects(false)
  }

  const deletePortfolio = async (id: string) => {
    if (!confirm('Eliminare questo portfolio?')) return
    const sb = createClient()
    await sb.from('portfolios').delete().eq('id', id)
    setPortfolios(prev => prev.filter(p => p.id !== id))
    if (activePortfolio?.id === id) { setActivePortfolio(null); setShowAllClients(false) }
    toast.success('Portfolio eliminato')
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── HOME ─────────────────────────────────────────────────────────── */}
      {!inDetail && (
        <div className="flex flex-col h-full">
          <div className="px-8 pt-6 pb-0 border-b border-[#2A2A2A]">
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-2xl font-black text-white">Portfolio</h1>
              <button onClick={() => setShowNewPortfolio(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-bold text-sm rounded-xl hover:bg-yellow-400 transition-colors">
                <Plus className="w-4 h-4" /> Nuovo portfolio
              </button>
            </div>
            <div className="flex gap-1 mt-4">
              {([['recenti', 'Recenti e preferiti'], ['tutti', 'Sfoglia tutto']] as const).map(([k, v]) => (
                <button key={k} onClick={() => setHomeTab(k)}
                  className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${homeTab === k ? 'border-gold text-gold' : 'border-transparent text-text-secondary hover:text-white'}`}>{v}</button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            {portfolios.length > 0 && (
              <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4">
                {homeTab === 'recenti' ? 'Portfolio recenti' : 'Tutti i portfolio'}
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {/* New */}
              <div onClick={() => setShowNewPortfolio(true)}
                className="group bg-[#111] border-2 border-dashed border-[#2A2A2A] rounded-2xl p-5 cursor-pointer hover:border-gold/40 transition-all flex flex-col items-center justify-center min-h-[160px] gap-2">
                <div className="w-10 h-10 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center group-hover:border-gold/30 transition-colors">
                  <Plus className="w-5 h-5 text-text-secondary group-hover:text-gold transition-colors" />
                </div>
                <p className="text-xs text-text-secondary group-hover:text-white transition-colors font-semibold">Nuovo portfolio</p>
              </div>

              {/* All clients card */}
              <div onClick={() => { setShowAllClients(true); setActivePortfolio(null); setActiveTab('elenco') }}
                className="group bg-surface border border-[#2A2A2A] rounded-2xl p-5 cursor-pointer hover:border-[#3A3A3A] hover:bg-[#1C1C1C] transition-all">
                <div className="w-14 h-14 rounded-xl bg-[#2A2A2A] border border-[#3A3A3A] flex items-center justify-center mb-4">
                  <Users className="w-7 h-7 text-text-secondary" />
                </div>
                <p className="text-sm font-bold text-white mb-0.5">Tutti i clienti</p>
                <p className="text-xs text-text-secondary mb-3">Vista completa</p>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex -space-x-1.5">
                    {clients.slice(0, 4).map((c, i) => (
                      <div key={c.id} className="w-6 h-6 rounded-full bg-[#3A3A3A] border border-[#2A2A2A] flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ zIndex: 10 - i }}>{c.company_name[0]}</div>
                    ))}
                  </div>
                  <span className="text-xs text-text-secondary">{clients.length} clienti</span>
                </div>
              </div>

              {/* Portfolio cards */}
              {portfolios.map(p => (
                <PortfolioCard key={p.id} portfolio={p} clients={clients}
                  onClick={() => { setActivePortfolio(p); setShowAllClients(false); setActiveTab('elenco') }}
                  onDelete={deletePortfolio} />
              ))}
            </div>

            {portfolios.length === 0 && (
              <div className="text-center py-12">
                <Briefcase className="w-12 h-12 text-text-secondary mx-auto mb-4" />
                <p className="text-text-secondary mb-1">Nessun portfolio ancora.</p>
                <button onClick={() => setShowNewPortfolio(true)} className="text-gold hover:underline text-sm">Crea il primo portfolio →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DETAIL ───────────────────────────────────────────────────────── */}
      {inDetail && (
        <div className="flex flex-col h-full">
          <div className="px-6 pt-5 pb-0 border-b border-[#2A2A2A]">
            <button onClick={() => { setActivePortfolio(null); setShowAllClients(false) }}
              className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition-colors mb-4">
              <ArrowLeft className="w-4 h-4" /> Portfolio
            </button>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              {activePortfolio ? (
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: activePortfolio.color + '25', border: `1px solid ${activePortfolio.color}50` }}>
                  <Briefcase className="w-5 h-5" style={{ color: activePortfolio.color }} />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-xl bg-[#2A2A2A] border border-[#3A3A3A] flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-text-secondary" />
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-xl font-black text-white">{activePortfolio?.name ?? 'Tutti i clienti'}</h1>
                {activePortfolio?.description && <p className="text-xs text-text-secondary mt-0.5">{activePortfolio.description}</p>}
              </div>
              <button onClick={() => setShowNewPortfolio(true)}
                className="flex items-center gap-1.5 text-xs text-gold border border-gold/30 rounded-lg px-3 py-1.5 hover:bg-gold/10 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Nuovo portfolio
              </button>
            </div>
            <div className="flex gap-5 pb-3 text-sm">
              {[
                { label: 'MRR', value: formatCurrency(totalMRR), color: 'text-success' },
                { label: 'Progetti', value: totalProjects, color: 'text-white' },
                { label: 'Clienti', value: visibleClients.length, color: 'text-white' },
                { label: 'Task scadute', value: overdueTasks, color: overdueTasks > 0 ? 'text-warning' : 'text-text-secondary' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="text-text-secondary text-xs">{label}:</span>
                  <span className={`font-bold text-sm ${color}`}>{value}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-0 -mb-px">
              {([['elenco', 'Elenco'], ['dashboard', 'Dashboard'], ['avanzamento', 'Avanzamento']] as const).map(([k, v]) => (
                <button key={k} onClick={() => setActiveTab(k)}
                  className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === k ? 'border-gold text-gold' : 'border-transparent text-text-secondary hover:text-white'}`}>{v}</button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === 'elenco' && (
              <ElencoTab
                portfolio={activePortfolio}
                clients={visibleClients}
                allClients={clients}
                onPriorityChange={handlePriorityChange}
                onAddProjects={activePortfolio ? () => setShowAddProjects(true) : undefined}
                onRemoveProject={activePortfolio ? handleRemoveProject : undefined}
              />
            )}
            {activeTab === 'dashboard' && <DashboardTab clients={visibleClients} />}
            {activeTab === 'avanzamento' && <AvanzamentoTab clients={visibleClients} />}
          </div>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {showNewPortfolio && (
        <NewPortfolioModal
          clients={clients}
          onClose={() => setShowNewPortfolio(false)}
          onCreated={p => { setPortfolios(prev => [p, ...prev]); setShowNewPortfolio(false) }}
        />
      )}
      {showAddProjects && activePortfolio && (
        <AddProjectsModal
          portfolioId={activePortfolio.id}
          clients={clients}
          existingProjectIds={activePortfolio.portfolio_projects.map(pp => pp.project_id)}
          onClose={() => setShowAddProjects(false)}
          onAdded={handleProjectsAdded}
        />
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import {
  Plus, Search, Download, ExternalLink, Trash2,
  ChevronUp, ChevronDown, ChevronsUpDown,
  Pin, GripVertical, X, SlidersHorizontal,
  LayoutGrid, List, Calendar, TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { formatCurrency, getPaymentBadge } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Client, ClientPackage, PaymentStatus, ClientType, ClientLabel, Profile } from '@/lib/types/database'
import { NewClientModal } from './NewClientModal'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { deleteClient } from '@/app/actions/delete-client'
import { PrioritaOggi } from './PrioritaOggi'

interface ClientiListProps {
  clients: Client[]
  currentProfile?: Profile
}

type SortKey = 'company_name' | 'mrr' | 'client_type' | 'client_label' | 'payment_status' | 'package' | 'contract_end' | 'risk_score'
type SortDir = 'asc' | 'desc'
const ALL = 'tutti'

const labelBadge: Record<string, string> = {
  stabile: 'bg-success/20 text-success',
  in_bilico: 'bg-warning/20 text-warning',
  perso: 'bg-error/20 text-error',
  partner: 'bg-gold/20 text-gold',
}
const labelIcon: Record<string, string> = { stabile: '✅', in_bilico: '⚠️', perso: '❌', partner: '🤝' }
const typeBadge: Record<string, string> = {
  growth: 'bg-gold/15 text-gold',
  digital: 'bg-blue-500/15 text-blue-400',
  growth_digital: 'bg-purple-500/15 text-purple-400',
}

type PortfolioTab = 'tutti' | 'growth' | 'digital' | 'growth_digital' | 'interni'
const PORTFOLIO_TABS: { key: PortfolioTab; label: string; emoji: string }[] = [
  { key: 'tutti',          label: 'Tutti',          emoji: '🗂️' },
  { key: 'growth',         label: 'Growth',         emoji: '📈' },
  { key: 'digital',        label: 'Digital',        emoji: '💻' },
  { key: 'growth_digital', label: 'Growth+Digital', emoji: '⚡' },
  { key: 'interni',        label: 'Interni',        emoji: '🏢' },
]

const SORT_LABELS: Record<SortKey, string> = {
  company_name: 'Nome',
  mrr: 'Revenue (MRR)',
  client_type: 'Tipo',
  client_label: 'Label',
  payment_status: 'Pagamenti',
  package: 'Pacchetto',
  contract_end: 'Scadenza contratto',
  risk_score: 'AI Risk',
}

function RiskInfoTooltip() {
  return (
    <div className="relative group/tip inline-flex items-center" onClick={e => e.stopPropagation()}>
      <div className="w-3.5 h-3.5 rounded-full border border-[#444] text-[#555] text-[9px] font-bold flex items-center justify-center cursor-default select-none hover:border-gold/50 hover:text-gold transition-colors">i</div>
      <div className="pointer-events-none absolute left-0 top-full mt-2 w-60 bg-[#111] border border-[#2A2A2A] rounded-xl shadow-2xl opacity-0 group-hover/tip:opacity-100 transition-opacity z-[999] p-3.5 normal-case tracking-normal font-normal overflow-hidden">
        <div className="text-[11px] font-bold text-white mb-1">Come funziona il punteggio?</div>
        <div className="text-[10px] text-[#555] mb-3 leading-snug break-words">Score 0–100 per cliente. Più è alto, più è a rischio. Si aggiorna automaticamente.</div>
        <div className="space-y-1.5 mb-3">
          {([
            ['💳', 'Pagamenti in ritardo', '+10–30'],
            ['📊', 'KPI mensili in calo', '+8–20'],
            ['🎫', 'Ticket urgenti aperti', '+10–18'],
            ['📅', 'Scadenza contratto vicina', '+4–20'],
            ['🚦', 'Stato operativo', '+5–15'],
            ['🏷️', 'Label manuale', '±5–10'],
          ] as [string, string, string][]).map(([icon, label, pts]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="shrink-0 text-[11px]">{icon}</span>
              <span className="flex-1 text-[10px] text-text-secondary">{label}</span>
              <span className="shrink-0 text-[9px] text-[#444] tabular-nums">{pts}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-[#2A2A2A] pt-2 grid grid-cols-3 gap-1 text-center">
          <div className="text-[9px] font-bold text-success bg-success/10 rounded px-1 py-0.5">0–34 Basso</div>
          <div className="text-[9px] font-bold text-warning bg-warning/10 rounded px-1 py-0.5">35–59 Medio</div>
          <div className="text-[9px] font-bold text-error bg-error/10 rounded px-1 py-0.5">60+ Alto</div>
        </div>
      </div>
    </div>
  )
}

function RiskBadge({ score, trend, factors }: {
  score: number | null
  trend?: string | null
  factors?: Record<string, { score: number; msg: string }> | null
}) {
  if (score == null) return null
  const color = score >= 60 ? 'text-error bg-error/10 border-error/20'
    : score >= 35 ? 'text-warning bg-warning/10 border-warning/20'
    : 'text-success bg-success/10 border-success/20'
  const levelLabel = score >= 60 ? 'Alto rischio' : score >= 35 ? 'Rischio medio' : 'Basso rischio'
  const TrendIcon = trend === 'peggiora' ? TrendingUp : trend === 'migliora' ? TrendingDown : Minus
  const trendColor = trend === 'peggiora' ? 'text-error' : trend === 'migliora' ? 'text-success' : 'text-[#555]'
  const trendLabel = trend === 'peggiora' ? '↑ in peggioramento' : trend === 'migliora' ? '↓ in miglioramento' : '→ stabile'
  const factorEntries = factors ? Object.entries(factors) : []

  return (
    <span className="relative group/risk inline-flex items-center">
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border cursor-default ${color}`}>
        {score}
        <TrendIcon className={`w-2.5 h-2.5 ${trendColor}`} />
      </span>
      {/* Tooltip per riga */}
      <span className="pointer-events-none absolute left-0 bottom-full mb-2 w-56 bg-[#111] border border-[#2A2A2A] rounded-xl p-3 shadow-2xl opacity-0 group-hover/risk:opacity-100 transition-opacity z-[999] text-left">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[11px] font-bold ${score >= 60 ? 'text-error' : score >= 35 ? 'text-warning' : 'text-success'}`}>{levelLabel}</span>
          <span className={`text-[9px] ${trendColor}`}>{trendLabel}</span>
        </div>
        {factorEntries.length > 0 ? (
          <div className="space-y-1.5">
            {factorEntries.map(([key, f]) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-text-secondary truncate">{f.msg}</span>
                <span className={`text-[9px] font-bold shrink-0 ${f.score > 0 ? 'text-error' : 'text-success'}`}>
                  {f.score > 0 ? `+${f.score}` : f.score}
                </span>
              </div>
            ))}
            <div className="border-t border-[#2A2A2A] pt-1.5 flex items-center justify-between">
              <span className="text-[9px] text-[#555]">Score totale</span>
              <span className="text-[10px] font-black text-white">{score}/100</span>
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-[#555]">Nessun fattore di rischio rilevato.</p>
        )}
      </span>
    </span>
  )
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 text-[#444]" />
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-gold" />
    : <ChevronDown className="w-3 h-3 text-gold" />
}

function SortValue(c: Client, key: SortKey): string | number {
  if (key === 'company_name') return c.company_name.toLowerCase()
  if (key === 'mrr') return c.mrr
  if (key === 'client_type') return c.client_type ?? ''
  if (key === 'client_label') return c.client_label ?? ''
  if (key === 'payment_status') return c.payment_status
  if (key === 'package') return c.package
  if (key === 'contract_end') return c.contract_end ?? ''
  if (key === 'risk_score') return c.risk_score ?? -1
  return ''
}

const STORAGE_PINS = 'twobee_pinned_clients'
const STORAGE_PIN_ORDER = 'twobee_pinned_order'

export function ClientiList({ clients: initialClients, currentProfile }: ClientiListProps) {
  const canSeeMrr = !currentProfile || SUPER_ADMIN_EMAILS.includes(currentProfile.email) || ['admin', 'manager'].includes(currentProfile.app_role ?? '')
  const canCreateClient = !currentProfile || SUPER_ADMIN_EMAILS.includes(currentProfile.email) || ['admin', 'manager'].includes(currentProfile.app_role ?? '')
  const [clients, setClients] = useState(initialClients)
  const [search, setSearch] = useState('')

  // Realtime: aggiorna i clienti in lista appena cambiano su Supabase
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('clients-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clients' }, (payload) => {
        setClients(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...(payload.new as Client) } : c))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clients' }, (payload) => {
        setClients(prev => [...prev, payload.new as Client])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'clients' }, (payload) => {
        setClients(prev => prev.filter(c => c.id !== payload.old.id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])
  const [portfolioTab, setPortfolioTab] = useState<PortfolioTab>('tutti')
  const [filterPackage, setFilterPackage] = useState<ClientPackage | typeof ALL>(ALL)
  const [filterPayment, setFilterPayment] = useState<PaymentStatus | typeof ALL>(ALL)
  const [filterType, setFilterType] = useState<ClientType | typeof ALL>(ALL)
  const [filterLabel, setFilterLabel] = useState<ClientLabel | typeof ALL>(ALL)
  const [filterMrrMin, setFilterMrrMin] = useState('')
  const [filterMrrMax, setFilterMrrMax] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('company_name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [pinOrder, setPinOrder] = useState<string[]>([])
  const [showModal, setShowModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const dragRef = useRef<string | null>(null)
  const dragOverRef = useRef<string | null>(null)

  // Carica pin da localStorage
  useEffect(() => {
    try {
      const pins = JSON.parse(localStorage.getItem(STORAGE_PINS) ?? '[]') as string[]
      const order = JSON.parse(localStorage.getItem(STORAGE_PIN_ORDER) ?? '[]') as string[]
      setPinnedIds(pins)
      setPinOrder(order.length ? order : pins)
    } catch {}
  }, [])

  const savePins = (pins: string[], order: string[]) => {
    localStorage.setItem(STORAGE_PINS, JSON.stringify(pins))
    localStorage.setItem(STORAGE_PIN_ORDER, JSON.stringify(order))
  }

  const togglePin = (id: string) => {
    const isAlreadyPinned = pinnedIds.includes(id)
    const nextPins  = isAlreadyPinned ? pinnedIds.filter(p => p !== id) : [...pinnedIds, id]
    const nextOrder = isAlreadyPinned ? pinOrder.filter(p => p !== id) : [...pinOrder, id]
    setPinnedIds(nextPins)
    setPinOrder(nextOrder)
    savePins(nextPins, nextOrder)
  }

  const handleDragStart = (id: string) => { dragRef.current = id }
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    dragOverRef.current = id
  }
  const handleDrop = () => {
    const from = dragRef.current
    const to = dragOverRef.current
    if (!from || !to || from === to) return
    setPinOrder((prev) => {
      const next = [...prev]
      const fi = next.indexOf(from)
      const ti = next.indexOf(to)
      if (fi < 0 || ti < 0) return prev
      next.splice(fi, 1)
      next.splice(ti, 0, from)
      savePins(pinnedIds, next)
      return next
    })
    dragRef.current = null
    dragOverRef.current = null
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const activeFilters = [
    filterType !== ALL, filterLabel !== ALL,
    filterPayment !== ALL, filterPackage !== ALL, filterMrrMin !== '', filterMrrMax !== '',
  ].filter(Boolean).length

  const resetFilters = () => {
    setFilterType(ALL); setFilterLabel(ALL)
    setFilterPayment(ALL); setFilterPackage(ALL); setFilterMrrMin(''); setFilterMrrMax('')
    setSearch('')
  }

  const applyFilters = (list: Client[]) => list.filter((c) => {
    const matchSearch = c.company_name.toLowerCase().includes(search.toLowerCase())
    const matchPackage = filterPackage === ALL || c.package === filterPackage
    const matchPayment = filterPayment === ALL || c.payment_status === filterPayment
    const matchType = filterType === ALL || c.client_type === filterType
    const matchLabel = filterLabel === ALL || c.client_label === filterLabel
    const matchMrrMin = filterMrrMin === '' || c.mrr >= parseFloat(filterMrrMin)
    const matchMrrMax = filterMrrMax === '' || c.mrr <= parseFloat(filterMrrMax)
    const matchPortfolio = portfolioTab === 'tutti' || (portfolioTab === 'interni' ? c.is_internal : c.client_type === portfolioTab)
    return matchSearch && matchPackage && matchPayment && matchType && matchLabel && matchMrrMin && matchMrrMax && matchPortfolio
  })

  const applySort = (list: Client[]) => [...list].sort((a, b) => {
    const va = SortValue(a, sortKey)
    const vb = SortValue(b, sortKey)
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb))
    return sortDir === 'asc' ? cmp : -cmp
  })

  // Clienti persi: separati, non entrano nella lista principale né negli alert
  const lostClients = useMemo(() => clients.filter((c) => c.client_label === 'perso'), [clients])
  const activeClients = useMemo(() => clients.filter((c) => c.client_label !== 'perso'), [clients])

  const allFiltered = useMemo(() => applyFilters(activeClients), [
    activeClients, search, filterPackage, filterPayment,
    filterType, filterLabel, filterMrrMin, filterMrrMax, portfolioTab,
  ])

  const pinnedClients = useMemo(
    () => pinOrder.map((id) => allFiltered.find((c) => c.id === id)).filter((c): c is Client => !!c),
    [pinOrder, allFiltered]
  )

  const unpinnedClients = useMemo(
    () => applySort(allFiltered.filter((c) => !pinnedIds.includes(c.id))),
    [allFiltered, pinnedIds, sortKey, sortDir]
  )

  const totalMrr = useMemo(() => allFiltered.reduce((s, c) => s + c.mrr, 0), [allFiltered])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Sei sicuro di voler eliminare "${name}"? L'azione è irreversibile.`)) return
    setDeletingId(id)
    const { error } = await deleteClient(id)
    setDeletingId(null)
    if (error) { toast.error(error); return }
    setClients((prev) => prev.filter((c) => c.id !== id))
    toast.success(`"${name}" eliminato`)
  }

  const exportCsv = () => {
    const headers = ['Azienda', 'Tipo', 'Label', 'Pacchetto', 'MRR', 'Stato', 'Pagamenti', 'Inizio', 'Fine']
    const rows = allFiltered.map((c) => [c.company_name, c.client_type, c.client_label, c.package, c.mrr, c.status, c.payment_status, c.contract_start, c.contract_end])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'clienti-twobee.csv'
    a.click()
  }

  const ColHeader = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      onClick={() => handleSort(col)}
      className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors"
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </div>
    </th>
  )

  const ClientCard = ({ client, canSeeMrr, pinned, onPin, onDelete, deleting }: {
    client: Client; canSeeMrr: boolean; pinned: boolean; onPin: () => void
    onDelete: (id: string, name: string) => void; deleting: boolean
  }) => {
    const daysLeft = client.contract_end
      ? Math.max(0, Math.round((new Date(client.contract_end).getTime() - Date.now()) / 86400000))
      : null
    const expiringSoon = daysLeft !== null && daysLeft < 30

    return (
      <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4 hover:border-gold/20 transition-colors group flex flex-col gap-3">
        {/* Top: avatar + nome + pin */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/20 flex items-center justify-center text-base font-black text-gold shrink-0">
            {client.company_name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <Link href={`/clienti/${client.id}`} className="font-bold text-white hover:text-gold transition-colors text-sm leading-tight block truncate">
              {client.company_name}
            </Link>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`inline-flex items-center whitespace-nowrap text-[10px] font-semibold px-1.5 py-0.5 rounded ${typeBadge[client.client_type ?? 'growth']}`}>
                {client.client_type === 'growth_digital' ? 'G+D' : (client.client_type ?? 'growth')}
              </span>
              <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold px-1.5 py-0.5 rounded ${labelBadge[client.client_label ?? 'stabile']}`}>
                {labelIcon[client.client_label ?? 'stabile']} {(client.client_label ?? 'stabile').replace('_', ' ')}
              </span>
              {client.is_internal && (
                <span className="inline-flex items-center whitespace-nowrap text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">interno</span>
              )}
            </div>
          </div>
          <button onClick={onPin} className={`shrink-0 transition-colors ${pinned ? 'text-gold' : 'text-[#333] hover:text-gold opacity-0 group-hover:opacity-100'}`}>
            <Pin className={`w-3.5 h-3.5 ${pinned ? 'fill-gold' : ''}`} />
          </button>
        </div>

        {/* Metriche */}
        <div className="grid grid-cols-2 gap-2">
          {canSeeMrr && (
            <div className="bg-[#111] rounded-lg p-2.5">
              <p className="text-[9px] text-text-secondary uppercase tracking-wider mb-0.5">MRR</p>
              <p className="text-sm font-black text-gold">{formatCurrency(client.mrr)}</p>
            </div>
          )}
        </div>

        {/* Pacchetto + pagamento + risk */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] bg-gold/10 text-gold border border-gold/20 px-2 py-0.5 rounded font-semibold">{client.package}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${getPaymentBadge(client.payment_status)}`}>
            {client.payment_status === 'in_attesa' ? 'Attesa pagamento' : client.payment_status === 'pagato' ? 'Pagato' : 'Scaduto'}
          </span>
          {client.risk_score != null && <RiskBadge score={client.risk_score} trend={client.risk_trend} factors={client.risk_factors} />}
        </div>

        {/* Contratto */}
        {daysLeft !== null && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <Calendar className={`w-3 h-3 ${expiringSoon ? 'text-warning' : 'text-text-secondary'}`} />
            <span className={expiringSoon ? 'text-warning font-bold' : 'text-text-secondary'}>
              {daysLeft === 0 ? 'Contratto scaduto' : `${daysLeft}gg al rinnovo`}
            </span>
          </div>
        )}

        {/* Canali */}
        {client.active_channels.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {client.active_channels.slice(0, 3).map(ch => (
              <span key={ch} className="text-[10px] bg-background border border-[#2A2A2A] px-1.5 py-0.5 rounded text-text-secondary">{ch}</span>
            ))}
            {client.active_channels.length > 3 && <span className="text-[10px] text-text-secondary">+{client.active_channels.length - 3}</span>}
          </div>
        )}

        {/* Footer azioni */}
        <div className="flex items-center justify-between pt-1 border-t border-[#2A2A2A] mt-auto">
          <Link href={`/clienti/${client.id}`}
            className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-gold transition-colors">
            <ExternalLink className="w-3 h-3" /> Apri scheda
          </Link>
          <button onClick={() => onDelete(client.id, client.company_name)} disabled={deleting}
            className="text-text-secondary hover:text-error transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  const ClientRow = ({ client, pinned }: { client: Client; pinned: boolean }) => (
    <tr
      key={client.id}
      draggable={pinned}
      onDragStart={pinned ? () => handleDragStart(client.id) : undefined}
      onDragOver={pinned ? (e) => handleDragOver(e, client.id) : undefined}
      onDrop={pinned ? handleDrop : undefined}
      className={`border-b border-[#2A2A2A] hover:bg-white/3 transition-colors group ${pinned ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* Grip + pin */}
      <td className="px-2 py-3.5 w-8">
        <div className="flex items-center gap-1">
          {pinned && <GripVertical className="w-3.5 h-3.5 text-[#444] group-hover:text-text-secondary transition-colors" />}
          <button
            onClick={() => togglePin(client.id)}
            title={pinned ? 'Rimuovi dai fissati' : 'Fissa in cima'}
            className={`transition-colors ${pinned ? 'text-gold hover:text-gold/60' : 'text-[#333] hover:text-gold opacity-0 group-hover:opacity-100'}`}
          >
            {pinned ? <Pin className="w-3.5 h-3.5 fill-gold" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          {pinned && <span className="text-[10px] text-gold bg-gold/10 border border-gold/20 px-1.5 py-0.5 rounded font-semibold">FISSATO</span>}
          <Link href={`/clienti/${client.id}`} className="font-semibold text-white hover:text-gold transition-colors text-sm">
            {client.company_name}
          </Link>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <span className={`inline-flex items-center whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded ${typeBadge[client.client_type ?? 'growth']}`}>
          {client.client_type === 'growth_digital' ? 'G+D' : (client.client_type ?? 'growth')}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded ${labelBadge[client.client_label ?? 'stabile']}`}>
          {labelIcon[client.client_label ?? 'stabile']} {(client.client_label ?? 'stabile').replace('_', ' ')}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <RiskBadge score={client.risk_score} trend={client.risk_trend} factors={client.risk_factors} />
      </td>
      <td className="px-4 py-3.5">
        <span className="inline-flex whitespace-nowrap text-xs text-text-secondary bg-background px-2 py-1 rounded">{client.package}</span>
      </td>
      {canSeeMrr && <td className="px-4 py-3.5 text-sm font-bold text-gold">{formatCurrency(client.mrr)}</td>}
      <td className="px-4 py-3.5">
        <span className={`inline-flex items-center whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded ${getPaymentBadge(client.payment_status)}`}>
          {client.payment_status === 'in_attesa' ? 'Attesa pagamento' : client.payment_status === 'pagato' ? 'Pagato' : 'Scaduto'}
        </span>
      </td>
      <td className="px-4 py-3.5">
        {client.industry
          ? <span className="inline-flex whitespace-nowrap text-xs text-text-secondary bg-background border border-[#2A2A2A] px-2 py-0.5 rounded">{client.industry}</span>
          : <span className="text-xs text-[#444]">—</span>}
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <Link href={`/clienti/${client.id}`} className="flex items-center gap-1 text-xs text-text-secondary hover:text-gold transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> Apri
          </Link>
          <button
            onClick={() => handleDelete(client.id, client.company_name)}
            disabled={deletingId === client.id}
            className="text-text-secondary hover:text-error transition-colors disabled:opacity-50"
            title="Elimina cliente"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )

  return (
    <div className="p-6 space-y-4">
      <PrioritaOggi clients={clients} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Clienti</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {allFiltered.length} clienti{canSeeMrr && <> · MRR totale <span className="text-gold font-semibold">{formatCurrency(totalMrr)}</span></>}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Vista toggle */}
          <div className="flex border border-[#2A2A2A] rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('table')}
              className={`px-2.5 py-2 transition-colors ${viewMode === 'table' ? 'bg-gold/10 text-gold' : 'text-text-secondary hover:text-white'}`}
              title="Vista tabella">
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('grid')}
              className={`px-2.5 py-2 transition-colors ${viewMode === 'grid' ? 'bg-gold/10 text-gold' : 'text-text-secondary hover:text-white'}`}
              title="Vista card">
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary border border-[#2A2A2A] rounded-lg hover:text-white hover:border-white/20 transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          {canCreateClient && (
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-gold text-black rounded-lg hover:bg-yellow-400 transition-colors">
              <Plus className="w-4 h-4" /> Nuovo Cliente
            </button>
          )}
        </div>
      </div>

      {/* Portfolio tabs */}
      <div className="flex gap-1 flex-wrap">
        {PORTFOLIO_TABS.map(tab => {
          const count = tab.key === 'tutti'
            ? activeClients.length
            : activeClients.filter(c => c.client_type === tab.key).length
          if (tab.key !== 'tutti' && count === 0) return null
          return (
            <button key={tab.key} onClick={() => setPortfolioTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                portfolioTab === tab.key
                  ? tab.key === 'growth'         ? 'bg-gold/10 text-gold border-gold/30'
                  : tab.key === 'digital'        ? 'bg-blue-500/10 text-blue-400 border-blue-400/30'
                  : tab.key === 'growth_digital' ? 'bg-purple-500/10 text-purple-400 border-purple-400/30'
                  : 'bg-white/5 text-white border-white/10'
                  : 'bg-transparent text-text-secondary border-[#2A2A2A] hover:border-[#444] hover:text-white'
              }`}>
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${portfolioTab === tab.key ? 'bg-white/10' : 'bg-[#2A2A2A] text-[#666]'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Barra ricerca + filtri */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Ricerca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text" placeholder="Cerca azienda..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-surface border border-[#2A2A2A] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-text-secondary focus:outline-none focus:border-gold/40 w-52"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtri rapidi */}
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as ClientType | typeof ALL)}
          className="bg-surface border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/40">
          <option value={ALL}>Tutti i tipi</option>
          <option value="growth">Growth</option>
          <option value="digital">Digital</option>
        </select>

        <select value={filterLabel} onChange={(e) => setFilterLabel(e.target.value as ClientLabel | typeof ALL)}
          className="bg-surface border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/40">
          <option value={ALL}>Tutte le label</option>
          <option value="stabile">✅ Stabile</option>
          <option value="in_bilico">⚠️ In bilico</option>
          <option value="perso">❌ Perso</option>
          <option value="partner">🤝 Partner</option>
        </select>

        <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value as PaymentStatus | typeof ALL)}
          className="bg-surface border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/40">
          <option value={ALL}>Tutti i pagamenti</option>
          <option value="pagato">Pagato</option>
          <option value="in_attesa">Attesa pagamento</option>
          <option value="scaduto">Scaduto</option>
        </select>

        {/* Toggle filtri avanzati */}
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${showAdvanced || activeFilters > 0 ? 'border-gold/40 text-gold bg-gold/5' : 'border-[#2A2A2A] text-text-secondary hover:text-white hover:border-[#3A3A3A]'}`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Avanzati
          {activeFilters > 0 && <span className="bg-gold text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{activeFilters}</span>}
        </button>

        {activeFilters > 0 && (
          <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-error hover:underline">
            <X className="w-3 h-3" /> Reset filtri
          </button>
        )}
      </div>

      {/* Filtri avanzati */}
      {showAdvanced && (
        <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4 flex flex-wrap gap-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Pacchetto</label>
            <select value={filterPackage} onChange={(e) => setFilterPackage(e.target.value as ClientPackage | typeof ALL)}
              className="bg-background border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/40">
              <option value={ALL}>Tutti</option>
              <option value="Worker Bee Start">Worker Bee Start</option>
              <option value="Worker Bee Basic">Worker Bee Basic</option>
              <option value="Hive Basic">Hive Basic</option>
              <option value="Hive Custom">Hive Custom</option>
              <option value="Royal Queen">Royal Queen</option>
              <option value="IT Digital Partner">IT Digital Partner</option>
              <option value="Partner Quota">Partner Quota</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">MRR minimo (€)</label>
            <input
              type="number" value={filterMrrMin} onChange={(e) => setFilterMrrMin(e.target.value)}
              placeholder="0" className="bg-background border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/40 w-32"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">MRR massimo (€)</label>
            <input
              type="number" value={filterMrrMax} onChange={(e) => setFilterMrrMax(e.target.value)}
              placeholder="∞" className="bg-background border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/40 w-32"
            />
          </div>
          <div className="flex items-end">
            <div className="text-xs text-text-secondary bg-background border border-[#2A2A2A] rounded-lg px-3 py-2">
              <span className="text-white font-semibold">{allFiltered.length}</span> risultati · MRR medio <span className="text-gold font-semibold">{formatCurrency(allFiltered.length ? totalMrr / allFiltered.length : 0)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Ordinamento personalizzato info */}
      {pinnedClients.length > 0 && (
        <p className="text-xs text-text-secondary flex items-center gap-1.5">
          <Pin className="w-3 h-3 text-gold" />
          {pinnedClients.length} cliente{pinnedClients.length > 1 ? 'i' : ''} fissato{pinnedClients.length > 1 ? 'i' : ''} in cima · trascina per riordinare
        </p>
      )}

      {viewMode === 'table' ? (
        /* ── VISTA TABELLA ── */
        <div className="bg-surface border border-[#2A2A2A] rounded-card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2A2A2A]">
                <th className="px-2 py-3 w-8" />
                <ColHeader col="company_name" label="Azienda" />
                <ColHeader col="client_type" label="Tipo" />
                <ColHeader col="client_label" label="Label" />
                <th
                  onClick={() => handleSort('risk_score')}
                  className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    AI Risk
                    <RiskInfoTooltip />
                    <SortIcon col="risk_score" sortKey={sortKey} sortDir={sortDir} />
                  </div>
                </th>
                <ColHeader col="package" label="Pacchetto" />
                {canSeeMrr && <ColHeader col="mrr" label="MRR" />}
                <ColHeader col="payment_status" label="Pagamenti" />
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">Settore</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {allFiltered.length === 0 && (
                <tr><td colSpan={10} className="px-5 py-12 text-center text-text-secondary text-sm">Nessun cliente trovato</td></tr>
              )}
              {pinnedClients.map((client) => (
                <ClientRow key={client.id} client={client} pinned />
              ))}
              {pinnedClients.length > 0 && unpinnedClients.length > 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-1.5 bg-[#0D0D0D]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-[#2A2A2A]" />
                      <span className="text-[10px] text-text-secondary uppercase tracking-widest">Altri clienti</span>
                      <div className="flex-1 h-px bg-[#2A2A2A]" />
                    </div>
                  </td>
                </tr>
              )}
              {unpinnedClients.map((client) => (
                <ClientRow key={client.id} client={client} pinned={false} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── VISTA CARD GRID ── */
        <>
          {allFiltered.length === 0 && (
            <div className="text-center py-16 text-text-secondary text-sm">Nessun cliente trovato</div>
          )}
          {pinnedClients.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-[10px] text-gold uppercase tracking-widest font-bold flex items-center gap-1.5">
                <Pin className="w-3 h-3 fill-gold" /> Fissati
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {pinnedClients.map(c => <ClientCard key={c.id} client={c} canSeeMrr={canSeeMrr} pinned onPin={() => togglePin(c.id)} onDelete={handleDelete} deleting={deletingId === c.id} />)}
              </div>
            </div>
          )}
          {pinnedClients.length > 0 && unpinnedClients.length > 0 && (
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-[#2A2A2A]" />
              <span className="text-[10px] text-text-secondary uppercase tracking-widest">Altri clienti</span>
              <div className="flex-1 h-px bg-[#2A2A2A]" />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {unpinnedClients.map(c => <ClientCard key={c.id} client={c} canSeeMrr={canSeeMrr} pinned={false} onPin={() => togglePin(c.id)} onDelete={handleDelete} deleting={deletingId === c.id} />)}
          </div>
        </>
      )}

      {/* ── SEZIONE LOST ── */}
      {lostClients.length > 0 && <LostSection clients={lostClients} canSeeMrr={canSeeMrr} onDelete={handleDelete} deletingId={deletingId} />}

      {showModal && (
        <NewClientModal
          onClose={() => setShowModal(false)}
          onCreated={(client) => { setClients((prev) => [client, ...prev]); setShowModal(false) }}
        />
      )}
    </div>
  )
}

function LostSection({ clients, canSeeMrr, onDelete, deletingId }: {
  clients: Client[]; canSeeMrr: boolean; onDelete: (id: string, name: string) => void; deletingId: string | null
}) {
  const [open, setOpen] = useState(false)
  const lostMrr = clients.reduce((s, c) => s + c.mrr, 0)

  return (
    <div className="border border-[#2A2A2A] rounded-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-[#111] hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-text-secondary">Clienti Persi</span>
          <span className="text-xs bg-[#1A1A1A] border border-[#2A2A2A] text-text-secondary px-2 py-0.5 rounded-full">{clients.length}</span>
          {canSeeMrr && (
            <span className="text-xs text-text-secondary">MRR perso: <span className="text-error font-semibold">{formatCurrency(lostMrr)}</span></span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <table className="w-full">
          <thead>
            <tr className="border-y border-[#2A2A2A] bg-[#0D0D0D]">
              <th className="text-left px-5 py-2.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">Azienda</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">Tipo</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">Pacchetto</th>
              {canSeeMrr && <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">MRR</th>}
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">Perso il</th>
              <th className="px-4 py-2.5 w-20" />
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-[#1A1A1A] hover:bg-white/2 transition-colors group opacity-60 hover:opacity-100">
                <td className="px-5 py-3">
                  <Link href={`/clienti/${c.id}`} className="flex items-center gap-2.5 hover:text-gold transition-colors">
                    <div className="w-7 h-7 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-xs font-black text-text-secondary shrink-0">
                      {c.company_name[0].toUpperCase()}
                    </div>
                    <span className="text-sm text-white font-medium">{c.company_name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${c.client_type === 'growth' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                    {c.client_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">{c.package}</td>
                {canSeeMrr && <td className="px-4 py-3 text-sm text-text-secondary">{formatCurrency(c.mrr)}</td>}
                <td className="px-4 py-3 text-xs text-text-secondary">
                  {c.contract_end ? new Date(c.contract_end).toLocaleDateString('it-IT') : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/clienti/${c.id}`} className="text-xs text-text-secondary hover:text-gold transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                    {canSeeMrr && (
                      <button onClick={() => onDelete(c.id, c.company_name)} disabled={deletingId === c.id}
                        className="text-text-secondary hover:text-error transition-colors disabled:opacity-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

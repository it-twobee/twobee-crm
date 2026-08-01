'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import {
  Plus, Search, Download, ExternalLink, Trash2,
  ChevronUp, ChevronDown, ChevronsUpDown,
  Pin, GripVertical, X, SlidersHorizontal,
  LayoutGrid, List, Calendar, TrendingUp, TrendingDown, Minus, PauseCircle,
  AlertTriangle, Loader2,
} from 'lucide-react'
import { formatCurrency, getPaymentBadge, clientName } from '@/lib/utils'
import { pausedDays, paymentLabel } from '@/lib/clients'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Client, ClientPackage, PaymentStatus, ClientType, ClientLabel, Profile } from '@/lib/types/database'
import { NewClientModal } from './NewClientModal'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { deleteClients, previewClientDeletion, type DeletionPreview } from '@/app/actions/delete-client'
import { PrioritaOggi } from './PrioritaOggi'

/**
 * §176/§177: l'economics del cliente, calcolata dai contratti dei progetti.
 * `clients.mrr` resta in colonna ma è un residuo: qui si mostra il vero.
 */
export type ClientEconomicsSummary = {
  /** somma dei canoni ricorrenti attivi */
  recurring: number
  /** valore dei lavori a corpo venduti */
  oneOff: number
  /** quanto di quei lavori deve ancora entrare */
  oneOffOpen: number
  contracts: number
  quoted: number
  /** c'è qualcosa da cui dedurre lo stato pagamenti? Senza, il badge mente */
  hasBilling: boolean
  /** righe del mese in corso ancora scoperte: è il dettaglio per progetto */
  unpaidCount: number
  unpaidAmount: number
  unpaidLabels: string[]
}

interface ClientiListProps {
  clients: Client[]
  /** chiave = id cliente. Vuoto per chi non vede i dati economici */
  economics?: Record<string, ClientEconomicsSummary>
  currentProfile?: Profile
  /** Portale operativo: oscura MRR, pagamenti, export ed elimina — solo vista clienti attivi */
  hideEconomics?: boolean
}

type SortKey = 'company_name' | 'mrr' | 'client_type' | 'client_label' | 'payment_status' | 'package' | 'contract_end' | 'risk_score'
type SortDir = 'asc' | 'desc'
const ALL = 'tutti'

const labelBadge: Record<string, string> = {
  stabile: 'bg-success/20 text-success',
  in_bilico: 'bg-warning/20 text-warning',
  pending: 'bg-warning/20 text-warning',
  perso: 'bg-error/20 text-error',
  partner: 'bg-gold/20 text-gold-text',
}
const labelIcon: Record<string, string> = { stabile: '✅', in_bilico: '⚠️', pending: '⏸️', perso: '❌', partner: '🤝' }
const typeBadge: Record<string, string> = {
  growth: 'bg-gold/15 text-gold-text',
  digital: 'bg-info/15 text-info',
  growth_digital: 'bg-accent/15 text-accent',
}

type PortfolioTab = 'tutti' | 'growth' | 'digital' | 'growth_digital' | 'interni'
const PORTFOLIO_TABS: { key: PortfolioTab; label: string; emoji: string }[] = [
  { key: 'tutti',          label: 'Tutti',          emoji: '🗂️' },
  { key: 'growth',         label: 'Growth',         emoji: '📈' },
  { key: 'digital',        label: 'Digital',        emoji: '💻' },
  { key: 'growth_digital', label: 'Growth+Digital', emoji: '⚡' },
  { key: 'interni',        label: 'Interni',        emoji: '🏢' },
]

/** Il canone da mostrare: i contratti se ci sono, altrimenti niente da mostrare. */
const canone = (eco: ClientEconomicsSummary | undefined, c: Client) =>
  eco ? (eco.contracts > 0 ? eco.recurring : 0) : c.mrr

const SORT_LABELS: Record<SortKey, string> = {
  company_name: 'Nome',
  mrr: 'Canone mensile',
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
      <div className="w-3.5 h-3.5 rounded-full border border-border-strong text-text-secondary text-2xs font-bold flex items-center justify-center cursor-default select-none hover:border-gold/50 hover:text-gold-text transition-colors">i</div>
      <div className="pointer-events-none absolute left-0 top-full mt-2 w-60 bg-surface border border-border rounded-xl shadow-2xl opacity-0 group-hover/tip:opacity-100 transition-opacity z-[999] p-3.5 normal-case tracking-normal font-normal overflow-hidden">
        <div className="text-2xs font-bold text-text-primary mb-1">Come funziona il punteggio?</div>
        <div className="text-2xs text-text-secondary mb-3 leading-snug break-words">Score 0–100 per cliente. Più è alto, più è a rischio. Si aggiorna automaticamente.</div>
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
              <span className="shrink-0 text-2xs">{icon}</span>
              <span className="flex-1 text-2xs text-text-secondary">{label}</span>
              <span className="shrink-0 text-2xs text-text-tertiary tabular-nums">{pts}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-2 grid grid-cols-3 gap-1 text-center">
          <div className="text-2xs font-bold text-success bg-success/10 rounded px-1 py-0.5">0–34 Basso</div>
          <div className="text-2xs font-bold text-warning bg-warning/10 rounded px-1 py-0.5">35–59 Medio</div>
          <div className="text-2xs font-bold text-error bg-error/10 rounded px-1 py-0.5">60+ Alto</div>
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
  const trendColor = trend === 'peggiora' ? 'text-error' : trend === 'migliora' ? 'text-success' : 'text-text-secondary'
  const trendLabel = trend === 'peggiora' ? '↑ in peggioramento' : trend === 'migliora' ? '↓ in miglioramento' : '→ stabile'
  const factorEntries = factors ? Object.entries(factors) : []

  return (
    <span className="relative group/risk inline-flex items-center">
      <span className={`inline-flex items-center gap-1 text-2xs font-bold px-1.5 py-0.5 rounded border cursor-default ${color}`}>
        {score}
        <TrendIcon className={`w-2.5 h-2.5 ${trendColor}`} />
      </span>
      {/* Tooltip per riga */}
      <span className="pointer-events-none absolute left-0 bottom-full mb-2 w-56 bg-surface border border-border rounded-xl p-3 shadow-2xl opacity-0 group-hover/risk:opacity-100 transition-opacity z-[999] text-left">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-2xs font-bold ${score >= 60 ? 'text-error' : score >= 35 ? 'text-warning' : 'text-success'}`}>{levelLabel}</span>
          <span className={`text-2xs ${trendColor}`}>{trendLabel}</span>
        </div>
        {factorEntries.length > 0 ? (
          <div className="space-y-1.5">
            {factorEntries.map(([key, f]) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="text-2xs text-text-secondary truncate">{f.msg}</span>
                <span className={`text-2xs font-bold shrink-0 ${f.score > 0 ? 'text-error' : 'text-success'}`}>
                  {f.score > 0 ? `+${f.score}` : f.score}
                </span>
              </div>
            ))}
            <div className="border-t border-border pt-1.5 flex items-center justify-between">
              <span className="text-2xs text-text-secondary">Score totale</span>
              <span className="text-2xs font-black text-text-primary">{score}/100</span>
            </div>
          </div>
        ) : (
          <p className="text-2xs text-text-secondary">Nessun fattore di rischio rilevato.</p>
        )}
      </span>
    </span>
  )
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 text-text-tertiary" />
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-gold-text" />
    : <ChevronDown className="w-3 h-3 text-gold-text" />
}

function SortValue(c: Client, key: SortKey, eco?: ClientEconomicsSummary): string | number {
  if (key === 'company_name') return c.company_name.toLowerCase()
  // §176: si ordina per quello che si vede, cioè il canone dai contratti
  if (key === 'mrr') return eco ? canone(eco, c) : c.mrr
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

export function ClientiList({ clients: initialClients, currentProfile, hideEconomics = false, economics = {} }: ClientiListProps) {
  const canSeeMrr = !hideEconomics && (!currentProfile || SUPER_ADMIN_EMAILS.includes(currentProfile.email) || ['admin', 'manager'].includes(currentProfile.app_role ?? ''))
  const canCreateClient = !hideEconomics && (!currentProfile || SUPER_ADMIN_EMAILS.includes(currentProfile.email) || ['admin', 'manager'].includes(currentProfile.app_role ?? ''))
  const showPayments = !hideEconomics
  /* Stessa regola del server (`requireAdmin` in delete-client.ts): il manager
     vede i clienti ma non li elimina, quindi non deve nemmeno vedere le
     caselle — un cestino che risponde «permesso negato» è peggio di niente. */
  const canDelete = !hideEconomics && (!currentProfile || SUPER_ADMIN_EMAILS.includes(currentProfile.email) || currentProfile.app_role === 'admin')
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
  /** id in attesa di conferma: uno solo dal cestino di riga, N dalla selezione */
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const [preview, setPreview] = useState<DeletionPreview | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
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
    const mrrValue = canone(economics[c.id], c)
    const matchMrrMin = filterMrrMin === '' || mrrValue >= parseFloat(filterMrrMin)
    const matchMrrMax = filterMrrMax === '' || mrrValue <= parseFloat(filterMrrMax)
    const matchPortfolio = portfolioTab === 'tutti' || (portfolioTab === 'interni' ? c.is_internal : c.client_type === portfolioTab)
    return matchSearch && matchPackage && matchPayment && matchType && matchLabel && matchMrrMin && matchMrrMax && matchPortfolio
  })

  const applySort = (list: Client[]) => [...list].sort((a, b) => {
    const va = SortValue(a, sortKey, economics[a.id])
    const vb = SortValue(b, sortKey, economics[b.id])
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb))
    return sortDir === 'asc' ? cmp : -cmp
  })

  // Clienti persi: separati, non entrano nella lista principale né negli alert
  const lostClients = useMemo(() => clients.filter((c) => c.client_label === 'perso'), [clients])
  // §176: i fermi hanno il loro contenitore. Non sono persi — il rapporto è
  // vivo — ma non fatturano, quindi fuori dalla lista che alimenta i numeri
  const pausedClients = useMemo(() => clients.filter((c) => c.client_label === 'pending'), [clients])
  const activeClients = useMemo(
    () => clients.filter((c) => c.client_label !== 'perso' && c.client_label !== 'pending'), [clients])

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

  // §178: chi ha davvero qualcosa da incassare — gli altri non possono essere
  // «scaduti», e l'avviso non deve nemmeno nascere
  const billingIds = useMemo(
    () => new Set(Object.entries(economics).filter(([, e]) => e.hasBilling).map(([id]) => id)),
    [economics])

  // §176: i totali leggono i contratti, non la colonna d'anagrafica
  const totalMrr = useMemo(
    () => allFiltered.reduce((s, c) => s + canone(economics[c.id], c), 0), [allFiltered, economics])
  const totalOneOff = useMemo(
    () => allFiltered.reduce((s, c) => s + (economics[c.id]?.oneOff ?? 0), 0), [allFiltered, economics])
  const totalOpen = useMemo(
    () => allFiltered.reduce((s, c) => s + (economics[c.id]?.oneOffOpen ?? 0), 0), [allFiltered, economics])
  /* §179: «da quotare» = nessun contratto venduto, punto. Prima il conteggio
     richiedeva anche un MRR d'anagrafica > 0 — un residuo storico — e quindi
     ne saltava metà: i clienti senza quel numero restavano fuori pur essendo
     esattamente nella stessa condizione. Gli interni non si quotano. */
  const toQuote = useMemo(
    () => allFiltered.filter(c => !c.is_internal && (economics[c.id]?.contracts ?? 0) === 0).length,
    [allFiltered, economics])

  /* La selezione vive sugli id: se un cliente sparisce — eliminato qui, da un
     altro admin via realtime — esce da sé invece di restare a gonfiare il
     contatore di una barra che agisce su niente. */
  useEffect(() => {
    setSelected(prev => prev.filter(id => clients.some(c => c.id === id)))
  }, [clients])

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const visibleIds = useMemo(
    () => [...pinnedClients, ...unpinnedClients].map(c => c.id), [pinnedClients, unpinnedClients])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.includes(id))
  const toggleAllVisible = () => setSelected(prev => allVisibleSelected
    ? prev.filter(id => !visibleIds.includes(id))
    : Array.from(new Set([...prev, ...visibleIds])))

  /* Un cliente non è una riga d'anagrafica: sotto ci stanno progetti, task,
     contratti e chat, e cascatano tutti. Prima di chiedere conferma si va a
     contarli, così la conferma dice cosa costa davvero. */
  const askDelete = async (ids: string[]) => {
    if (ids.length === 0) return
    setPendingIds(ids)
    setPreview(null)
    const p = await previewClientDeletion(ids)
    if (p.error) { toast.error(p.error); setPendingIds([]); return }
    setPreview(p)
  }

  const confirmDelete = async () => {
    const ids = pendingIds
    setDeleting(true)
    const { deleted, error } = await deleteClients(ids)
    setDeleting(false)
    if (error) { toast.error(error); return }
    setClients(prev => prev.filter(c => !ids.includes(c.id)))
    setSelected(prev => prev.filter(id => !ids.includes(id)))
    setPendingIds([])
    toast.success(deleted === 1 ? 'Cliente eliminato' : `${deleted} clienti eliminati`)
  }

  const exportCsv = () => {
    const headers = ['Azienda', 'Tipo', 'Label', 'Pacchetto', 'Canone/mese', 'Lavori a corpo', 'Da incassare', 'Stato', 'Pagamenti', 'Inizio', 'Fine']
    const rows = allFiltered.map((c) => {
      const e = economics[c.id]
      return [c.company_name, c.client_type, c.client_label, c.package,
        canone(e, c), e?.oneOff ?? 0, e?.oneOffOpen ?? 0,
        c.status, c.payment_status, c.contract_start, c.contract_end]
    })
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
      className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider cursor-pointer select-none hover:text-text-primary transition-colors"
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </div>
    </th>
  )

  const ClientCard = ({ client, canSeeMrr, pinned, onPin }: {
    client: Client; canSeeMrr: boolean; pinned: boolean; onPin: () => void
  }) => {
    const daysLeft = client.contract_end
      ? Math.max(0, Math.round((new Date(client.contract_end).getTime() - Date.now()) / 86400000))
      : null
    const expiringSoon = daysLeft !== null && daysLeft < 30
    const eco = economics[client.id]
    const isSelected = selected.includes(client.id)

    return (
      <div className={`card-interactive bg-surface border rounded-2xl p-4 group flex flex-col gap-3 no-tap-highlight ${
        isSelected ? 'border-gold/50 ring-1 ring-gold/25' : 'border-border'}`}>
        {/* Top: avatar + nome + pin */}
        <div className="flex items-start gap-3">
          {canDelete && (
            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(client.id)}
              aria-label={`Seleziona ${clientName(client)}`}
              className={`accent-gold w-3.5 h-3.5 mt-1 shrink-0 cursor-pointer transition-opacity ${
                isSelected ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`} />
          )}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/20 flex items-center justify-center text-base font-black text-gold-text shrink-0">
            {client.company_name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <Link href={hideEconomics ? `/workspace/clienti/${client.id}` : `/clienti/${client.id}`} className="font-bold text-text-primary hover:text-gold-text transition-colors text-sm leading-tight block truncate">
              {clientName(client)}
            </Link>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`inline-flex items-center whitespace-nowrap text-2xs font-semibold px-1.5 py-0.5 rounded ${typeBadge[client.client_type ?? 'growth']}`}>
                {client.client_type === 'growth_digital' ? 'G+D' : (client.client_type ?? 'growth')}
              </span>
              <span className={`inline-flex items-center gap-1 whitespace-nowrap text-2xs font-semibold px-1.5 py-0.5 rounded ${labelBadge[client.client_label ?? 'stabile']}`}>
                {labelIcon[client.client_label ?? 'stabile']} {(client.client_label ?? 'stabile').replace('_', ' ')}
              </span>
              {client.is_internal && (
                <span className="inline-flex items-center whitespace-nowrap text-2xs font-semibold px-1.5 py-0.5 rounded bg-info/15 text-info">interno</span>
              )}
            </div>
          </div>
          <button onClick={onPin} className={`shrink-0 transition-colors ${pinned ? 'text-gold-text' : 'text-text-tertiary hover:text-gold-text opacity-0 group-hover:opacity-100'}`}>
            <Pin className={`w-3.5 h-3.5 ${pinned ? 'fill-gold' : ''}`} />
          </button>
        </div>

        {/* Metriche */}
        <div className="grid grid-cols-2 gap-2">
          {canSeeMrr && (
            <div className="bg-surface rounded-lg p-2.5">
              <p className="text-2xs text-text-secondary uppercase tracking-wider mb-0.5">Canone</p>
              {eco && eco.contracts === 0 ? (
                <p className="text-sm font-black text-warning">da quotare</p>
              ) : (
                <p className="text-sm font-black text-gold-text">{formatCurrency(canone(eco, client))}</p>
              )}
              <p className="text-2xs text-text-tertiary">
                {eco && eco.contracts > 0 ? `da ${eco.contracts} contratt${eco.contracts === 1 ? 'o' : 'i'}` : 'nessun contratto'}
              </p>
            </div>
          )}
          {canSeeMrr && eco && eco.oneOff > 0 && (
            <div className="bg-surface rounded-lg p-2.5">
              <p className="text-2xs text-text-secondary uppercase tracking-wider mb-0.5">A corpo</p>
              <p className="text-sm font-black text-accent">{formatCurrency(eco.oneOff)}</p>
              <p className="text-2xs text-text-tertiary">
                {eco.oneOffOpen > 0 ? `${formatCurrency(eco.oneOffOpen)} da incassare` : 'tutto incassato'}
              </p>
            </div>
          )}
        </div>

        {/* Pacchetto + pagamento + risk */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xs bg-gold/10 text-gold-text border border-gold/20 px-2 py-0.5 rounded font-semibold">{client.package}</span>
          {showPayments && (eco && !eco.hasBilling ? (
            <span className="text-2xs text-text-tertiary">nessuna scadenza</span>
          ) : (
            <span className={`text-2xs font-semibold px-2 py-0.5 rounded ${getPaymentBadge(client.payment_status)}`}>
              {paymentLabel(client.payment_status)}
            </span>
          ))}
          {client.risk_score != null && <RiskBadge score={client.risk_score} trend={client.risk_trend} factors={client.risk_factors} />}
        </div>

        {/* Contratto */}
        {daysLeft !== null && (
          <div className="flex items-center gap-1.5 text-2xs">
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
              <span key={ch} className="text-2xs bg-background border border-border px-1.5 py-0.5 rounded text-text-secondary">{ch}</span>
            ))}
            {client.active_channels.length > 3 && <span className="text-2xs text-text-secondary">+{client.active_channels.length - 3}</span>}
          </div>
        )}

        {/* Footer azioni */}
        <div className="flex items-center justify-between pt-1 border-t border-border mt-auto">
          <Link href={hideEconomics ? `/workspace/clienti/${client.id}` : `/clienti/${client.id}`}
            className="flex items-center gap-1 text-2xs text-text-secondary hover:text-gold-text transition-colors">
            <ExternalLink className="w-3 h-3" /> Apri scheda
          </Link>
          {canDelete && (
            <button onClick={() => askDelete([client.id])} aria-label={`Elimina ${clientName(client)}`}
              className="text-text-secondary hover:text-error transition-colors opacity-0 group-hover:opacity-100">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    )
  }

  const ClientRow = ({ client, pinned }: { client: Client; pinned: boolean }) => {
    const eco = economics[client.id]
    return (
    <tr
      key={client.id}
      draggable={pinned}
      onDragStart={pinned ? () => handleDragStart(client.id) : undefined}
      onDragOver={pinned ? (e) => handleDragOver(e, client.id) : undefined}
      onDrop={pinned ? handleDrop : undefined}
      className={`border-b border-border hover:bg-overlay/3 transition-colors group ${pinned ? 'cursor-grab active:cursor-grabbing' : ''} ${selected.includes(client.id) ? 'bg-gold/5' : ''}`}
    >
      {canDelete && (
        <td className="px-3 py-3.5 w-9">
          <input type="checkbox" checked={selected.includes(client.id)} onChange={() => toggleSelect(client.id)}
            aria-label={`Seleziona ${clientName(client)}`} className="accent-gold w-3.5 h-3.5 cursor-pointer" />
        </td>
      )}
      {/* Grip + pin */}
      <td className="px-2 py-3.5 w-8">
        <div className="flex items-center gap-1">
          {pinned && <GripVertical className="w-3.5 h-3.5 text-text-tertiary group-hover:text-text-secondary transition-colors" />}
          <button
            onClick={() => togglePin(client.id)}
            title={pinned ? 'Rimuovi dai fissati' : 'Fissa in cima'}
            className={`transition-colors ${pinned ? 'text-gold-text hover:text-gold-text/60' : 'text-text-tertiary hover:text-gold-text opacity-0 group-hover:opacity-100'}`}
          >
            {pinned ? <Pin className="w-3.5 h-3.5 fill-gold" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          {pinned && <span className="text-2xs text-gold-text bg-gold/10 border border-gold/20 px-1.5 py-0.5 rounded font-semibold">FISSATO</span>}
          <Link href={hideEconomics ? `/workspace/clienti/${client.id}` : `/clienti/${client.id}`} className="font-semibold text-text-primary hover:text-gold-text transition-colors text-sm">
            {clientName(client)}
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
      {canSeeMrr && (
        <td className="px-4 py-3.5" title={eco && eco.contracts > 0
          ? `Somma dei canoni attivi · ${eco.contracts} contratt${eco.contracts === 1 ? 'o' : 'i'}`
          : 'Nessun contratto nei progetti: il canone non è verificabile'}>
          {eco && eco.contracts === 0 ? (
            <span className="text-2xs font-semibold text-warning">da quotare</span>
          ) : (
            <span className="text-sm font-bold text-gold-text">{formatCurrency(canone(eco, client))}</span>
          )}
          {/* i lavori a corpo non sono canone: si vedono, non si sommano */}
          {eco && eco.oneOff > 0 && (
            <span className="block text-2xs text-accent">
              + {formatCurrency(eco.oneOff)} a corpo
              {eco.oneOffOpen > 0 && (
                <span className="text-text-tertiary"> · {formatCurrency(eco.oneOffOpen)} da incassare</span>
              )}
            </span>
          )}
        </td>
      )}
      {showPayments && (
        <td className="px-4 py-3.5">
          {/* §177: lo stato si deduce da rate e righe di mese. Senza nessuna
              delle due il valore in colonna è un residuo: meglio dirlo. */}
          {eco && !eco.hasBilling ? (
            <span className="text-2xs text-text-tertiary" title="Nessuna rata né riga di conto economico: lo stato pagamenti non è calcolabile">
              nessuna scadenza
            </span>
          ) : (
          <span className={`inline-flex items-center whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded ${getPaymentBadge(client.payment_status)}`}>
            {paymentLabel(client.payment_status)}
          </span>
          )}
          {/* §177: su più progetti conta quale non ha pagato, non solo che
              qualcosa manca — è l'unica informazione su cui si può agire */}
          {eco && eco.unpaidCount > 0 && (
            <span className="block text-2xs text-text-tertiary mt-0.5" title={eco.unpaidLabels.join(' · ')}>
              {eco.unpaidCount} progett{eco.unpaidCount === 1 ? 'o' : 'i'} scopert{eco.unpaidCount === 1 ? 'o' : 'i'}
              {' '}· {formatCurrency(eco.unpaidAmount)}
            </span>
          )}
        </td>
      )}
      <td className="px-4 py-3.5">
        {client.industry
          ? <span className="inline-flex whitespace-nowrap text-xs text-text-secondary bg-background border border-border px-2 py-0.5 rounded">{client.industry}</span>
          : <span className="text-xs text-text-tertiary">—</span>}
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <Link href={hideEconomics ? `/workspace/clienti/${client.id}` : `/clienti/${client.id}`} className="flex items-center gap-1 text-xs text-text-secondary hover:text-gold-text transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> Apri
          </Link>
          {!hideEconomics && (
            <button
              onClick={() => askDelete([client.id])}
              className="text-text-secondary hover:text-error transition-colors"
              title="Elimina cliente"
              aria-label={`Elimina ${clientName(client)}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {!hideEconomics && <PrioritaOggi billing={billingIds} clients={clients} />}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-text-primary font-heading">Clienti</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {allFiltered.length} clienti
            {canSeeMrr && (totalMrr > 0
              ? <> · canone <span className="text-gold-text font-semibold tabular">{formatCurrency(totalMrr)}</span>/mese</>
              : <> · <span className="text-text-tertiary">nessun canone a contratto</span></>)}
            {canSeeMrr && totalOneOff > 0 && (
              <> · a corpo <span className="text-accent font-semibold tabular">{formatCurrency(totalOneOff)}</span>
                {totalOpen > 0 && <span className="text-text-tertiary"> ({formatCurrency(totalOpen)} da incassare)</span>}</>
            )}
            {canSeeMrr && toQuote > 0 && (
              <span className="text-warning" title="Fatturano ma non hanno un contratto nei progetti: il canone non è verificabile">
                {' '}· {toQuote} da quotare
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Vista toggle */}
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('table')}
              className={`px-2.5 py-2 transition-colors ${viewMode === 'table' ? 'bg-gold/10 text-gold-text' : 'text-text-secondary hover:text-text-primary'}`}
              title="Vista tabella">
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('grid')}
              className={`px-2.5 py-2 transition-colors ${viewMode === 'grid' ? 'bg-gold/10 text-gold-text' : 'text-text-secondary hover:text-text-primary'}`}
              title="Vista card">
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          {!hideEconomics && (
            <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary border border-border rounded-xl hover:text-text-primary hover:border-border-strong transition-colors press">
              <Download className="w-4 h-4" /> <span className="hidden sm:inline">Export CSV</span>
            </button>
          )}
          {canCreateClient && (
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-gold text-on-gold rounded-xl shadow-soft hover:bg-gold/90 transition-colors press">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nuovo Cliente</span><span className="sm:hidden">Nuovo</span>
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
                  ? tab.key === 'growth'         ? 'bg-gold/10 text-gold-text border-gold/30'
                  : tab.key === 'digital'        ? 'bg-info/10 text-info border-info/30'
                  : tab.key === 'growth_digital' ? 'bg-accent/10 text-accent border-accent/30'
                  : 'bg-overlay/5 text-text-primary border-overlay/10'
                  : 'bg-transparent text-text-secondary border-border hover:border-border-strong hover:text-text-primary'
              }`}>
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
              <span className={`text-2xs px-1.5 py-0.5 rounded-full font-bold ${portfolioTab === tab.key ? 'bg-overlay/10' : 'bg-surface-hover text-text-secondary'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Barra ricerca + filtri */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Ricerca */}
        <div className="relative flex-1 min-w-[160px] sm:flex-none">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text" placeholder="Cerca azienda..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-surface border border-border rounded-xl pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold/40 w-full sm:w-52"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtri rapidi */}
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as ClientType | typeof ALL)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40">
          <option value={ALL}>Tutti i tipi</option>
          <option value="growth">Growth</option>
          <option value="digital">Digital</option>
        </select>

        <select value={filterLabel} onChange={(e) => setFilterLabel(e.target.value as ClientLabel | typeof ALL)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40">
          <option value={ALL}>Tutte le label</option>
          <option value="stabile">✅ Stabile</option>
          <option value="in_bilico">⚠️ In bilico</option>
          <option value="pending">⏸️ In pending</option>
          <option value="perso">❌ Perso</option>
          <option value="partner">🤝 Partner</option>
        </select>

        {showPayments && (
          <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value as PaymentStatus | typeof ALL)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40">
            <option value={ALL}>Tutti i pagamenti</option>
            <option value="pagato">Pagato</option>
            <option value="in_attesa">Attesa pagamento</option>
            <option value="scaduto">Scaduto</option>
          </select>
        )}

        {/* Toggle filtri avanzati */}
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${showAdvanced || activeFilters > 0 ? 'border-gold/40 text-gold-text bg-gold/5' : 'border-border text-text-secondary hover:text-text-primary hover:border-border-strong'}`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Avanzati
          {activeFilters > 0 && <span className="bg-gold text-on-gold text-2xs font-bold w-4 h-4 rounded-full flex items-center justify-center">{activeFilters}</span>}
        </button>

        {activeFilters > 0 && (
          <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-error hover:underline">
            <X className="w-3 h-3" /> Reset filtri
          </button>
        )}
      </div>

      {/* Filtri avanzati */}
      {showAdvanced && (
        <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap gap-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Pacchetto</label>
            <select value={filterPackage} onChange={(e) => setFilterPackage(e.target.value as ClientPackage | typeof ALL)}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40">
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
          {canSeeMrr && (
            <>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Canone minimo (€)</label>
                <input
                  type="number" value={filterMrrMin} onChange={(e) => setFilterMrrMin(e.target.value)}
                  placeholder="0" className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40 w-32"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Canone massimo (€)</label>
                <input
                  type="number" value={filterMrrMax} onChange={(e) => setFilterMrrMax(e.target.value)}
                  placeholder="∞" className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40 w-32"
                />
              </div>
            </>
          )}
          <div className="flex items-end">
            <div className="text-xs text-text-secondary bg-background border border-border rounded-lg px-3 py-2">
              <span className="text-text-primary font-semibold">{allFiltered.length}</span> risultati{canSeeMrr && <> · canone medio <span className="text-gold-text font-semibold">{formatCurrency(allFiltered.length ? totalMrr / allFiltered.length : 0)}</span></>}
            </div>
          </div>
        </div>
      )}

      {/* Ordinamento personalizzato info */}
      {pinnedClients.length > 0 && (
        <p className="text-xs text-text-secondary flex items-center gap-1.5">
          <Pin className="w-3 h-3 text-gold-text" />
          {pinnedClients.length} cliente{pinnedClients.length > 1 ? 'i' : ''} fissato{pinnedClients.length > 1 ? 'i' : ''} in cima · trascina per riordinare
        </p>
      )}

      {viewMode === 'table' ? (
        /* ── VISTA TABELLA ── */
        <div className="bg-surface border border-border rounded-card overflow-x-auto animate-fade-in">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border">
                {canDelete && (
                  <th className="px-3 py-3 w-9">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible}
                      aria-label={allVisibleSelected ? 'Deseleziona tutti' : 'Seleziona tutti i clienti in lista'}
                      title={allVisibleSelected ? 'Deseleziona tutti' : 'Seleziona tutti i clienti in lista'}
                      className="accent-gold w-3.5 h-3.5 cursor-pointer" />
                  </th>
                )}
                <th className="px-2 py-3 w-8" />
                <ColHeader col="company_name" label="Azienda" />
                <ColHeader col="client_type" label="Tipo" />
                <ColHeader col="client_label" label="Label" />
                <th
                  onClick={() => handleSort('risk_score')}
                  className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider cursor-pointer select-none hover:text-text-primary transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    AI Risk
                    <RiskInfoTooltip />
                    <SortIcon col="risk_score" sortKey={sortKey} sortDir={sortDir} />
                  </div>
                </th>
                <ColHeader col="package" label="Pacchetto" />
                {canSeeMrr && <ColHeader col="mrr" label="Canone" />}
                {showPayments && <ColHeader col="payment_status" label="Pagamenti" />}
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap">Settore</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {allFiltered.length === 0 && (
                <tr><td colSpan={12} className="px-5 py-12 text-center text-text-secondary text-sm">Nessun cliente trovato</td></tr>
              )}
              {pinnedClients.map((client) => (
                <ClientRow key={client.id} client={client} pinned />
              ))}
              {pinnedClients.length > 0 && unpinnedClients.length > 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-1.5 bg-surface">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-surface-hover" />
                      <span className="text-2xs text-text-secondary uppercase tracking-widest">Altri clienti</span>
                      <div className="flex-1 h-px bg-surface-hover" />
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
              <p className="text-2xs text-gold-text uppercase tracking-widest font-bold flex items-center gap-1.5">
                <Pin className="w-3 h-3 fill-gold" /> Fissati
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {pinnedClients.map(c => <ClientCard key={c.id} client={c} canSeeMrr={canSeeMrr} pinned onPin={() => togglePin(c.id)} />)}
              </div>
            </div>
          )}
          {pinnedClients.length > 0 && unpinnedClients.length > 0 && (
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-surface-hover" />
              <span className="text-2xs text-text-secondary uppercase tracking-widest">Altri clienti</span>
              <div className="flex-1 h-px bg-surface-hover" />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {unpinnedClients.map(c => <ClientCard key={c.id} client={c} canSeeMrr={canSeeMrr} pinned={false} onPin={() => togglePin(c.id)} />)}
          </div>
        </>
      )}

      {/* ── SEZIONE LOST ── (nascosta nel portale operativo: solo clienti attivi) */}
      {pausedClients.length > 0 && (
        <PausedSection clients={pausedClients} canSeeMrr={canSeeMrr} economics={economics}
          canDelete={canDelete} selected={selected} onToggle={toggleSelect} onDelete={id => askDelete([id])} />
      )}
      {!hideEconomics && lostClients.length > 0 && (
        <LostSection clients={lostClients} canSeeMrr={canSeeMrr} economics={economics}
          canDelete={canDelete} selected={selected} onToggle={toggleSelect} onDelete={id => askDelete([id])} />
      )}

      {/* Barra della selezione multipla: sta sopra tutto, così agisce anche su
          clienti selezionati in sezioni diverse senza doverli ritrovare */}
      {canDelete && selected.length > 0 && (
        <div className="fixed inset-x-4 bottom-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 flex items-center gap-3 bg-surface border border-border-strong rounded-2xl shadow-pop px-4 py-2.5 animate-slide-up">
          <span className="text-sm font-bold text-text-primary whitespace-nowrap">
            {selected.length} selezionat{selected.length === 1 ? 'o' : 'i'}
          </span>
          <button onClick={() => setSelected([])} className="text-xs text-text-secondary hover:text-text-primary transition-colors">
            Annulla
          </button>
          <button onClick={() => askDelete(selected)}
            className="ml-auto sm:ml-2 flex items-center gap-1.5 text-sm font-semibold bg-error-dim border border-error/40 text-error px-3 py-1.5 rounded-xl hover:bg-error/20 transition-colors press">
            <Trash2 className="w-3.5 h-3.5" /> Elimina
          </button>
        </div>
      )}

      {pendingIds.length > 0 && (
        <DeleteClientsModal
          names={clients.filter(c => pendingIds.includes(c.id)).map(clientName)}
          preview={preview}
          pending={deleting}
          onCancel={() => { if (!deleting) { setPendingIds([]); setPreview(null) } }}
          onConfirm={confirmDelete}
        />
      )}

      {showModal && (
        <NewClientModal
          onClose={() => setShowModal(false)}
          onCreated={(client) => { setClients((prev) => [client, ...prev]); setShowModal(false) }}
        />
      )}
    </div>
  )
}

/**
 * La conferma dice cosa cade insieme al cliente, non solo che l'azione è
 * irreversibile: progetti, task, contratti e chat spariscono con lui, e chi
 * clicca deve vederlo prima, non scoprirlo dopo.
 */
function DeleteClientsModal({ names, preview, pending, onCancel, onConfirm }: {
  names: string[]
  preview: DeletionPreview | null
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const counts: [number, string, string][] = preview ? ([
    [preview.projects, 'progetto', 'progetti'],
    [preview.tasks, 'task', 'task'],
    [preview.contracts, 'contratto', 'contratti'],
    [preview.revenueLines, 'riga di conto economico', 'righe di conto economico'],
    [preview.channels, 'canale chat', 'canali chat'],
  ] as [number, string, string][]).filter(([n]) => n > 0) : []

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-scrim sm:p-4 animate-fade-in" onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Conferma eliminazione"
        className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-pop animate-slide-up pb-safe overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="w-9 h-9 rounded-xl bg-error-dim flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-error" />
          </span>
          <h2 className="text-base font-bold text-text-primary font-heading">
            {names.length === 1 ? 'Elimina cliente' : `Elimina ${names.length} clienti`}
          </h2>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {names.slice(0, 8).map(n => (
              <span key={n} className="text-2xs font-semibold bg-background border border-border text-text-primary px-2 py-0.5 rounded">{n}</span>
            ))}
            {names.length > 8 && <span className="text-2xs text-text-secondary self-center">+{names.length - 8} altri</span>}
          </div>

          {preview === null ? (
            <p className="flex items-center gap-2 text-xs text-text-secondary">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Conto cosa viene eliminato…
            </p>
          ) : counts.length > 0 ? (
            <div className="bg-error-dim border border-error/30 rounded-xl p-3">
              <p className="text-2xs font-bold text-error uppercase tracking-wider mb-1.5">Sparisce anche</p>
              <ul className="space-y-0.5">
                {counts.map(([n, one, many]) => (
                  <li key={many} className="text-xs text-text-primary">
                    <span className="font-bold tabular">{n}</span> {n === 1 ? one : many}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-text-secondary">Nessun progetto, contratto o chat collegato: si elimina solo l&apos;anagrafica.</p>
          )}

          <p className="text-2xs text-text-tertiary">L&apos;azione è irreversibile e non passa dal cestino.</p>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 border-t border-border">
          <button onClick={onCancel} disabled={pending} className="text-sm text-text-secondary hover:text-text-primary disabled:opacity-40 press">
            Annulla
          </button>
          <button onClick={onConfirm} disabled={pending || preview === null}
            className="ml-auto flex items-center gap-1.5 text-sm font-semibold bg-error-dim border border-error/40 text-error px-4 py-2 rounded-xl hover:bg-error/20 disabled:opacity-40 press">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {pending ? 'Elimino…' : 'Elimina'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * I clienti fermi. Aperto di default quando ce n'è qualcuno da più di due mesi:
 * un rapporto sospeso che nessuno guarda diventa un rapporto perso, e la
 * differenza la fa una telefonata fatta al momento giusto.
 */
function PausedSection({ clients, canSeeMrr, economics, canDelete, selected, onToggle, onDelete }: {
  clients: Client[]; canSeeMrr: boolean; economics: Record<string, ClientEconomicsSummary>
  canDelete: boolean; selected: string[]; onToggle: (id: string) => void; onDelete: (id: string) => void
}) {
  const stale = clients.filter(c => (pausedDays(c.paused_at) ?? 0) > 60).length
  const [open, setOpen] = useState(stale > 0)
  // §176: anche qui il canone è quello dei contratti, non il residuo
  const pausedMrr = clients.reduce((s, c) => s + canone(economics[c.id], c), 0)

  return (
    <div className="border border-warning/30 rounded-card overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-warning-dim/40 hover:bg-warning-dim transition-colors">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <PauseCircle className="w-4 h-4 text-warning" />Clienti in pending
          </span>
          <span className="text-xs bg-surface border border-border text-text-secondary px-2 py-0.5 rounded-full">{clients.length}</span>
          {canSeeMrr && (
            <span className="text-xs text-text-secondary">
              Canone sospeso: <span className="text-warning font-semibold">{formatCurrency(pausedMrr)}</span>
              <span className="text-text-tertiary"> (dai contratti)</span>
            </span>
          )}
          {stale > 0 && (
            <span className="text-xs text-warning font-semibold">
              {stale} fermi da oltre due mesi
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="divide-y divide-border border-t border-border">
          {clients.map(c => {
            const d = pausedDays(c.paused_at)
            return (
              <div key={c.id} className={`flex items-center gap-3 px-5 py-3 transition-colors flex-wrap group ${
                selected.includes(c.id) ? 'bg-gold/5' : 'hover:bg-surface-hover'}`}>
                {canDelete && (
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={() => onToggle(c.id)}
                    aria-label={`Seleziona ${clientName(c)}`} className="accent-gold w-3.5 h-3.5 cursor-pointer shrink-0" />
                )}
                <Link href={`/clienti/${c.id}`} className="flex items-center gap-3 flex-1 min-w-[140px] hover:text-gold-text transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-surface border border-border flex items-center justify-center text-xs font-black text-text-secondary shrink-0">
                    {c.company_name[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-text-primary">{clientName(c)}</span>
                </Link>
                <span className="text-xs text-text-secondary">{c.package}</span>
                {canSeeMrr && (
                  (economics[c.id]?.contracts ?? 0) > 0
                    ? <span className="text-sm font-bold text-warning tabular">{formatCurrency(canone(economics[c.id], c))}</span>
                    : <span className="text-2xs text-text-tertiary">senza contratti</span>
                )}
                <span className={`text-xs ${d != null && d > 60 ? 'text-warning font-semibold' : 'text-text-tertiary'}`}>
                  {d == null ? 'da data ignota' : d === 0 ? 'da oggi' : `fermo da ${d} giorni`}
                </span>
                {canDelete && (
                  <button onClick={() => onDelete(c.id)} aria-label={`Elimina ${clientName(c)}`}
                    className="text-text-secondary hover:text-error transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )
          })}
          <p className="px-5 py-2.5 text-2xs text-text-tertiary bg-surface">
            Le lavorazioni sono sospese: non entrano nell&apos;MRR attivo né nel conto economico, ma il rapporto
            resta e non conta come churn. Riportali a «stabile» quando ripartono.
          </p>
        </div>
      )}
    </div>
  )
}

function LostSection({ clients, canSeeMrr, economics, canDelete, onDelete, selected, onToggle }: {
  clients: Client[]; canSeeMrr: boolean
  economics: Record<string, ClientEconomicsSummary>
  canDelete: boolean; onDelete: (id: string) => void
  selected: string[]; onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  // §176: il churn si misura su quello che fatturavano davvero, non
  // sull'anagrafica — un cliente perso senza contratti non ha portato via nulla
  const lostMrr = clients.reduce((s, c) => s + canone(economics[c.id], c), 0)

  return (
    <div className="border border-border rounded-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-surface hover:bg-overlay/3 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-text-secondary">Clienti Persi</span>
          <span className="text-xs bg-surface border border-border text-text-secondary px-2 py-0.5 rounded-full">{clients.length}</span>
          {canSeeMrr && (
            <span className="text-xs text-text-secondary">
              Canone perso: <span className="text-error font-semibold">{formatCurrency(lostMrr)}</span>
              <span className="text-text-tertiary"> (dai contratti)</span>
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <table className="w-full">
          <thead>
            <tr className="border-y border-border bg-surface">
              {canDelete && <th className="px-3 py-2.5 w-9" />}
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
              <tr key={c.id} className={`border-b border-border transition-colors group hover:opacity-100 ${
                selected.includes(c.id) ? 'bg-gold/5 opacity-100' : 'opacity-60 hover:bg-overlay/2'}`}>
                {canDelete && (
                  <td className="px-3 py-3 w-9">
                    <input type="checkbox" checked={selected.includes(c.id)} onChange={() => onToggle(c.id)}
                      aria-label={`Seleziona ${clientName(c)}`} className="accent-gold w-3.5 h-3.5 cursor-pointer" />
                  </td>
                )}
                <td className="px-5 py-3">
                  <Link href={`/clienti/${c.id}`} className="flex items-center gap-2.5 hover:text-gold-text transition-colors">
                    <div className="w-7 h-7 rounded-lg bg-surface border border-border flex items-center justify-center text-xs font-black text-text-secondary shrink-0">
                      {c.company_name[0].toUpperCase()}
                    </div>
                    <span className="text-sm text-text-primary font-medium">{clientName(c)}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${c.client_type === 'growth' ? 'bg-info/10 text-info' : 'bg-accent/10 text-accent'}`}>
                    {c.client_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">{c.package}</td>
                {canSeeMrr && (
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {(economics[c.id]?.contracts ?? 0) > 0
                      ? formatCurrency(canone(economics[c.id], c))
                      : <span className="text-2xs text-text-tertiary">senza contratti</span>}
                  </td>
                )}
                <td className="px-4 py-3 text-xs text-text-secondary">
                  {c.contract_end ? new Date(c.contract_end).toLocaleDateString('it-IT') : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/clienti/${c.id}`} className="text-xs text-text-secondary hover:text-gold-text transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                    {canDelete && (
                      <button onClick={() => onDelete(c.id)} aria-label={`Elimina ${clientName(c)}`}
                        className="text-text-secondary hover:text-error transition-colors">
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

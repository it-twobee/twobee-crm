'use client'

import { useState, useEffect, useMemo, useRef, useTransition } from 'react'
import Link from 'next/link'
import {
  History, RotateCcw, ChevronDown, ChevronRight, Search, ExternalLink,
  Plus, Edit2, Trash2, Loader2, AlertTriangle, Check, X, Users, Tag, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { restoreEntitySnapshot, previewRestore, type RestorePreview } from '@/app/actions/restore-entity'
import { fetchActivity, type ActivityFilters, type ActivityRow, type ActivityAuthor, type RetentionStatus } from '@/app/actions/activity'
import { VersioniPanel } from './VersioniPanel'
import { RetentionPanel } from './RetentionPanel'
import type { OsVersion, OsVersionChange, Profile } from '@/lib/types/database'

type VersionRow = OsVersion & { changes: OsVersionChange[] }

interface Props {
  initialRows: ActivityRow[]
  initialTotal: number
  authors: ActivityAuthor[]
  authorCounts: Record<string, number>
  stats: { total: number; today: number; week: number; create: number; update: number; delete: number }
  retention: RetentionStatus
  versions: VersionRow[]
  versionsMissing: boolean
  currentProfile: Profile
}

const ENTITY_LABELS: Record<string, { label: string; color: string }> = {
  clients:     { label: 'Clienti',     color: 'text-gold-text' },
  projects:    { label: 'Progetti',    color: 'text-info' },
  tasks:       { label: 'Task',        color: 'text-info' },
  deals:       { label: 'Deal',        color: 'text-accent' },
  invoices:    { label: 'Fatture',     color: 'text-success' },
  tickets:     { label: 'Ticket',      color: 'text-orange' },
  objectives:  { label: 'Obiettivi',   color: 'text-accent' },
  key_results: { label: 'Key Result',  color: 'text-accent' },
  decisions:   { label: 'Decisioni',   color: 'text-text-secondary' },
}

const ACTION_CONFIG = {
  create: { label: 'Creato',     icon: <Plus className="w-3 h-3" />,   color: 'text-success',  bg: 'bg-success-dim' },
  update: { label: 'Modificato', icon: <Edit2 className="w-3 h-3" />,  color: 'text-gold-text', bg: 'bg-gold-dim' },
  delete: { label: 'Eliminato',  icon: <Trash2 className="w-3 h-3" />, color: 'text-error',    bg: 'bg-error-dim' },
}

type PeriodKey = string

/**
 * I periodi selezionabili si fermano alla finestra di conservazione: offrire
 * «3 mesi» quando si conservano 20 giorni è promettere righe che non esistono
 * e far sembrare vuoto un archivio che è solo scaduto.
 */
function periodsFor(retentionDays: number): { key: PeriodKey; label: string }[] {
  const base = [
    { key: '1',  label: 'Oggi' },
    { key: '7',  label: '7 giorni' },
    { key: '30', label: '30 giorni' },
    { key: '90', label: '3 mesi' },
  ]
  const within = retentionDays > 0 ? base.filter(p => Number(p.key) < retentionDays) : base
  return [...within, { key: 'all', label: retentionDays > 0 ? `Tutto (${retentionDays}gg)` : 'Tutto' }]
}

const FIELD_SKIP = new Set(['id', 'created_at', 'updated_at', 'created_by'])

/** Quante righe per pagina: lo stesso numero che usa `fetchActivity`. */
const PAGE_SIZE = 60

/** Nomi di colonna → italiano. Quelli che non ci sono restano come sono: meglio grezzo che sbagliato. */
const FIELD_LABELS: Record<string, string> = {
  company_name: 'ragione sociale', display_name: 'nome', client_label: 'stato cliente',
  client_type: 'tipo', payment_status: 'pagamenti', mrr: 'canone', mrr_source: 'origine canone',
  contract_start: 'inizio contratto', contract_end: 'fine contratto', paused_at: 'sospeso dal',
  lost_at: 'perso il', risk_score: 'risk score', status: 'stato', name: 'nome',
  title: 'titolo', due_date: 'scadenza', assignee_id: 'assegnatario', project_id: 'progetto',
  milestone_id: 'milestone', sprint_id: 'sprint', is_internal: 'interno', package: 'pacchetto',
  _ripristino: 'ripristino',
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Quando è successo, per esteso: giorno della settimana, data e ora.
 * Le righe sono già raggruppate per data, ma il gruppo scorre via mentre si
 * legge — e una voce copiata o citata da sola deve sapersi datare.
 */
const fmtWhen = (s: string) => {
  const d = new Date(s)
  const day = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  return `${day} · ${time}`
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'sì' : 'no'
  if (typeof v === 'number') return String(v)
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('it-IT')
  }
  return s.length > 60 ? `${s.slice(0, 60)}…` : s
}

function entityHref(log: ActivityRow): string | null {
  const s = (log.snapshot ?? {}) as Record<string, unknown>
  switch (log.entity_type) {
    case 'clients':  return `/clienti/${log.entity_id}`
    case 'projects': return `/progetti/${log.entity_id}`
    case 'tasks':    return s.project_id ? `/progetti/${String(s.project_id)}` : null
    case 'tickets':  return '/customer-care/tickets'
    default:         return null
  }
}

function Initials({ name }: { name: string | null }) {
  const txt = (name ?? '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <span className="w-5 h-5 rounded-full bg-surface-active border border-border text-2xs font-bold text-text-secondary flex items-center justify-center shrink-0">
      {txt}
    </span>
  )
}

function DiffView({ diff }: { diff: Record<string, { old: unknown; new: unknown }> | null }) {
  const entries = Object.entries(diff ?? {}).filter(([k]) => !FIELD_SKIP.has(k))
  const [all, setAll] = useState(false)
  if (!entries.length) return null
  const shown = all ? entries : entries.slice(0, 10)

  return (
    <div className="space-y-1">
      {shown.map(([field, { old: o, new: n }]) => (
        <div key={field} className="flex items-start gap-2 text-2xs">
          <span className="text-text-secondary w-36 shrink-0 truncate" title={field}>
            {FIELD_LABELS[field] ?? field}
          </span>
          <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
            <span className="bg-error-dim text-error px-1.5 py-0.5 rounded max-w-[220px] truncate">{fmtValue(o)}</span>
            <ChevronRight className="w-2.5 h-2.5 text-text-tertiary shrink-0" />
            <span className="bg-success-dim text-success px-1.5 py-0.5 rounded max-w-[220px] truncate">{fmtValue(n)}</span>
          </div>
        </div>
      ))}
      {entries.length > 10 && (
        <button onClick={() => setAll(v => !v)} className="text-2xs text-gold-text hover:underline">
          {all ? 'mostra solo i primi 10' : `mostra tutti i ${entries.length} campi`}
        </button>
      )}
    </div>
  )
}

/** La conferma dice quali campi tornano indietro: «ripristina» da solo non è un'informazione. */
function ConfirmRestore({ preview, loading, onConfirm, onCancel }: {
  preview: RestorePreview | null; loading: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="mt-3 bg-warning-dim border border-warning/30 rounded-xl p-3 space-y-2">
      <p className="text-xs font-bold text-warning flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" /> Conferma ripristino
      </p>

      {preview === null ? (
        <p className="flex items-center gap-2 text-2xs text-text-secondary">
          <Loader2 className="w-3 h-3 animate-spin" /> Controllo cosa tornerebbe indietro…
        </p>
      ) : !preview.ok ? (
        <p className="text-2xs text-error">{preview.reason}</p>
      ) : preview.action === 'reinserimento' ? (
        <p className="text-2xs text-text-secondary">
          <strong className="text-text-primary">{preview.label}</strong> viene reinserito con i valori che aveva
          quando è stato eliminato ({preview.fields.length} campi).
        </p>
      ) : (
        <>
          <p className="text-2xs text-text-secondary">
            Tornano indietro {preview.fields.length} camp{preview.fields.length === 1 ? 'o' : 'i'}. Gli altri
            restano come sono adesso: una modifica successiva di qualcun altro non va annullata per sbaglio.
          </p>
          <div className="space-y-1">
            {preview.fields.slice(0, 8).map(f => (
              <div key={f.field} className="flex items-center gap-2 text-2xs">
                <span className="text-text-secondary w-36 shrink-0 truncate">{FIELD_LABELS[f.field] ?? f.field}</span>
                <span className="bg-surface border border-border text-text-tertiary px-1.5 py-0.5 rounded truncate max-w-[160px]">{fmtValue(f.from)}</span>
                <ChevronRight className="w-2.5 h-2.5 text-text-tertiary shrink-0" />
                <span className="bg-success-dim text-success px-1.5 py-0.5 rounded truncate max-w-[160px]">{fmtValue(f.to)}</span>
              </div>
            ))}
            {preview.fields.length > 8 && <p className="text-2xs text-text-tertiary">+ altri {preview.fields.length - 8}</p>}
          </div>
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onConfirm} disabled={loading || !preview?.ok}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-on-gold text-xs font-bold rounded-lg disabled:opacity-40 press">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Ripristina
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 border border-border text-xs text-text-secondary rounded-lg hover:text-text-primary press">
          Annulla
        </button>
      </div>
    </div>
  )
}

function StatTile({ label, value, hint, active, onClick }: {
  label: string; value: number; hint?: string; active?: boolean; onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick}
      className={`text-left bg-surface border rounded-xl px-3 py-2.5 transition-colors ${
        active ? 'border-gold/50 bg-gold-dim' : 'border-border'} ${onClick ? 'hover:border-border-strong' : ''}`}>
      <p className="text-2xs text-text-secondary uppercase tracking-wider">{label}</p>
      <p className="text-base font-black text-text-primary tabular">{value.toLocaleString('it-IT')}</p>
      {hint && <p className="text-2xs text-text-tertiary">{hint}</p>}
    </Tag>
  )
}

export function CronologiaClient({
  initialRows, initialTotal, authors, authorCounts, stats, retention, versions, versionsMissing, currentProfile,
}: Props) {
  const [tab, setTab] = useState<'attivita' | 'versioni'>('attivita')

  // ── filtri (applicati sul database, non sulla pagina caricata) ──
  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('tutti')
  const [action, setAction] = useState<ActivityFilters['action']>('tutti')
  const [authorId, setAuthorId] = useState('tutti')
  const [period, setPeriod] = useState<PeriodKey>('all')
  const PERIODS = useMemo(() => periodsFor(retention.retentionDays), [retention.retentionDays])

  const [rows, setRows] = useState(initialRows)
  const [total, setTotal] = useState(initialTotal)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const [isPending, startTransition] = useTransition()

  const filters: ActivityFilters = useMemo(() => ({
    search: search.trim() || undefined,
    entityType, action, authorId,
    from: period === 'all' ? undefined : iso(new Date(Date.now() - Number(period) * 86_400_000)),
  }), [search, entityType, action, authorId, period])

  /* La ricerca aspetta che si smetta di scrivere: una query per lettera su
     settemila righe non serve a nessuno. */
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      fetchActivity(filters, 0)
        .then(r => { if (alive) { setRows(r.rows); setTotal(r.total) } })
        .catch(e => toast.error(e instanceof Error ? e.message : 'Errore nel caricamento'))
        .finally(() => { if (alive) setLoading(false) })
    }, 300)
    return () => { alive = false; clearTimeout(t) }
  }, [filters])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const r = await fetchActivity(filters, rows.length)
      setRows(prev => [...prev, ...r.rows])
      setTotal(r.total)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore nel caricamento')
    } finally {
      setLoadingMore(false)
    }
  }

  const askRestore = async (logId: string) => {
    setExpanded(logId)
    setConfirming(logId)
    setPreview(null)
    try {
      setPreview(await previewRestore(logId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
      setConfirming(null)
    }
  }

  const handleRestore = (logId: string) => {
    startTransition(async () => {
      try {
        await restoreEntitySnapshot(logId)
        toast.success('Modifica riportata indietro')
        setConfirming(null)
        const r = await fetchActivity(filters, 0)
        setRows(r.rows); setTotal(r.total)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Errore durante il ripristino')
      }
    })
  }

  const resetFilters = () => {
    setSearch(''); setEntityType('tutti'); setAction('tutti'); setAuthorId('tutti'); setPeriod('all')
  }
  const activeFilters = [entityType !== 'tutti', action !== 'tutti', authorId !== 'tutti', period !== 'all', !!search].filter(Boolean).length

  // Raggruppa per giorno: la cronologia si legge per data, non per riga
  const grouped = useMemo(() => {
    const map = new Map<string, ActivityRow[]>()
    for (const log of rows) {
      const day = new Date(log.created_at).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const list = map.get(day) ?? []
      list.push(log)
      map.set(day, list)
    }
    return Array.from(map.entries())
  }, [rows])

  const senzaAutore = authorCounts['sistema'] ?? 0

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Intestazione + tab */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <History className="w-5 h-5 text-gold-text" />
          <div>
            <h1 className="text-xl font-black text-text-primary font-heading">Cronologia</h1>
            <p className="text-xs text-text-secondary">
              Ogni modifica ai dati e ogni versione del tool, con chi l&apos;ha fatta e cosa è cambiato
            </p>
          </div>
        </div>
        <div className="flex border border-border rounded-xl overflow-hidden">
          <button onClick={() => setTab('attivita')}
            className={`px-4 py-2 text-xs font-semibold transition-colors ${tab === 'attivita' ? 'bg-gold-dim text-gold-text' : 'text-text-secondary hover:text-text-primary'}`}>
            Attività
          </button>
          <button onClick={() => setTab('versioni')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-colors ${tab === 'versioni' ? 'bg-gold-dim text-gold-text' : 'text-text-secondary hover:text-text-primary'}`}>
            <Sparkles className="w-3.5 h-3.5" /> Versioni
          </button>
        </div>
      </div>

      {tab === 'versioni' ? (
        <VersioniPanel versions={versions} missing={versionsMissing} currentProfile={currentProfile} />
      ) : (
        <>
          {/* Governo: i numeri sono conteggi esatti su tutta la storia, non sulla pagina */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <StatTile label="Totale" value={stats.total} hint="da sempre" />
            <StatTile label="Oggi" value={stats.today} />
            <StatTile label="7 giorni" value={stats.week} />
            <StatTile label="Creazioni" value={stats.create} active={action === 'create'}
              onClick={() => setAction(action === 'create' ? 'tutti' : 'create')} />
            <StatTile label="Modifiche" value={stats.update} active={action === 'update'}
              onClick={() => setAction(action === 'update' ? 'tutti' : 'update')} />
            <StatTile label="Eliminazioni" value={stats.delete} active={action === 'delete'}
              onClick={() => setAction(action === 'delete' ? 'tutti' : 'delete')} />
          </div>

          {/* Chi ha fatto cosa */}
          <div className="bg-surface border border-border rounded-2xl p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-2xs font-bold text-text-secondary uppercase tracking-wider">
              <Users className="w-3.5 h-3.5" /> Per persona
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setAuthorId('tutti')}
                className={`text-2xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                  authorId === 'tutti' ? 'bg-gold-dim border-gold/40 text-gold-text' : 'bg-background border-border text-text-secondary hover:text-text-primary'}`}>
                Tutti
              </button>
              {authors.map(a => (
                <button key={a.id} onClick={() => setAuthorId(authorId === a.id ? 'tutti' : a.id)}
                  className={`flex items-center gap-1.5 text-2xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                    authorId === a.id ? 'bg-gold-dim border-gold/40 text-gold-text' : 'bg-background border-border text-text-secondary hover:text-text-primary'}`}>
                  <Initials name={a.full_name} />
                  {a.full_name ?? 'senza nome'}
                  <span className="text-text-tertiary tabular">{(authorCounts[a.id] ?? 0).toLocaleString('it-IT')}</span>
                </button>
              ))}
              {senzaAutore > 0 && (
                <button onClick={() => setAuthorId(authorId === 'sistema' ? 'tutti' : 'sistema')}
                  title="Modifiche scritte da automatismi (trigger, cron) o registrate prima che il tool sapesse attribuirle"
                  className={`text-2xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                    authorId === 'sistema' ? 'bg-gold-dim border-gold/40 text-gold-text' : 'bg-background border-border text-text-secondary hover:text-text-primary'}`}>
                  Sistema <span className="text-text-tertiary tabular">{senzaAutore.toLocaleString('it-IT')}</span>
                </button>
              )}
            </div>
          </div>

          <RetentionPanel status={retention} onChanged={() => window.location.reload()} />

          {/* Filtri */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cerca per nome o tipo…" aria-label="Cerca nella cronologia"
                className="w-full bg-surface border border-border-interactive rounded-lg pl-8 pr-8 py-2 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold/40" />
              {search && (
                <button onClick={() => setSearch('')} aria-label="Svuota la ricerca"
                  className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-text-secondary" /></button>
              )}
            </div>
            <select value={entityType} onChange={e => setEntityType(e.target.value)} aria-label="Filtra per tipo"
              className="bg-surface border border-border-interactive rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none">
              <option value="tutti">Tutti i tipi</option>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={action} onChange={e => setAction(e.target.value as ActivityFilters['action'])} aria-label="Filtra per azione"
              className="bg-surface border border-border-interactive rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none">
              <option value="tutti">Tutte le azioni</option>
              <option value="create">Creazioni</option>
              <option value="update">Modifiche</option>
              <option value="delete">Eliminazioni</option>
            </select>
            <div className="flex border border-border rounded-lg overflow-hidden">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  className={`px-2.5 py-2 text-2xs font-semibold transition-colors ${
                    period === p.key ? 'bg-gold-dim text-gold-text' : 'text-text-secondary hover:text-text-primary'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {activeFilters > 0 && (
              <button onClick={resetFilters} className="text-2xs text-text-secondary hover:text-text-primary underline">
                azzera {activeFilters} filtr{activeFilters === 1 ? 'o' : 'i'}
              </button>
            )}
            <span className="text-xs text-text-secondary ml-auto flex items-center gap-1.5">
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              {total.toLocaleString('it-IT')} risultati
            </span>
          </div>

          {/* Elenco */}
          {grouped.length === 0 ? (
            <div className="text-center py-16">
              <History className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
              <p className="text-sm text-text-secondary">Nessuna attività con questi filtri</p>
              {activeFilters > 0 && (
                <button onClick={resetFilters} className="text-xs text-gold-text hover:underline mt-1">azzera i filtri</button>
              )}
            </div>
          ) : (
            grouped.map(([day, dayLogs]) => (
              <div key={day}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px bg-surface-active flex-1" />
                  <span className="text-2xs font-bold text-text-secondary uppercase tracking-widest capitalize px-2">{day}</span>
                  <span className="text-2xs text-text-tertiary">{dayLogs.length}</span>
                  <div className="h-px bg-surface-active flex-1" />
                </div>

                <div className="space-y-1.5">
                  {dayLogs.map(log => {
                    const ac = ACTION_CONFIG[log.action]
                    const ec = ENTITY_LABELS[log.entity_type] ?? { label: log.entity_type, color: 'text-text-secondary' }
                    const isExp = expanded === log.id
                    const isConf = confirming === log.id
                    const diffCount = Object.keys(log.diff ?? {}).filter(k => !FIELD_SKIP.has(k)).length
                    const href = entityHref(log)
                    const canRestore = log.action !== 'create'

                    return (
                      <div key={log.id}
                        className={`bg-surface border rounded-xl overflow-hidden transition-colors ${isExp ? 'border-gold/30' : 'border-border'}`}>
                        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                          onClick={() => setExpanded(isExp ? null : log.id)}>
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${ac.bg}`}>
                            <span className={ac.color}>{ac.icon}</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-2xs font-bold ${ec.color}`}>{ec.label}</span>
                              <span className={`text-2xs font-bold ${ac.color}`}>{ac.label}</span>
                              <span className="text-xs text-text-primary font-semibold truncate">
                                {log.entity_label ?? log.entity_id}
                              </span>
                            </div>
                            <div className="flex items-center gap-2.5 mt-1 text-2xs text-text-secondary flex-wrap">
                              {log.user ? (
                                <span className="flex items-center gap-1.5">
                                  <Initials name={log.user.full_name} />{log.user.full_name}
                                </span>
                              ) : (
                                <span className="text-text-tertiary" title="Scritta da un automatismo o registrata prima dell'attribuzione">
                                  Sistema
                                </span>
                              )}
                              <span title={new Date(log.created_at).toLocaleString('it-IT')}>{fmtWhen(log.created_at)}</span>
                              {diffCount > 0 && <span>{diffCount} camp{diffCount === 1 ? 'o' : 'i'}</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {href && (
                              <Link href={href} onClick={e => e.stopPropagation()} aria-label="Apri la scheda"
                                className="text-text-secondary hover:text-gold-text transition-colors">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Link>
                            )}
                            {canRestore && !isConf && (
                              <button onClick={e => { e.stopPropagation(); askRestore(log.id) }}
                                className="flex items-center gap-1 text-2xs text-text-secondary hover:text-warning transition-colors px-2 py-1 rounded-lg hover:bg-warning-dim">
                                <RotateCcw className="w-3 h-3" /> Ripristina
                              </button>
                            )}
                            <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${isExp ? 'rotate-180' : ''}`} />
                          </div>
                        </div>

                        {isExp && (
                          <div className="border-t border-border px-4 py-3 space-y-3">
                            <p className="text-2xs text-text-tertiary">
                              {new Date(log.created_at).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                              {' alle '}
                              {new Date(log.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              {log.user ? ` · ${log.user.full_name}` : ' · Sistema'}
                            </p>
                            {log.action === 'update' && diffCount > 0 && <DiffView diff={log.diff} />}
                            {log.action === 'create' && (
                              <p className="text-2xs text-text-secondary">
                                Riga creata. <span className="font-mono text-text-tertiary">{log.entity_id}</span>
                              </p>
                            )}
                            {log.action === 'delete' && (
                              <p className="text-2xs text-error">
                                Riga eliminata: il ripristino la reinserisce con i valori che aveva.
                              </p>
                            )}
                            {isConf && (
                              <ConfirmRestore
                                preview={preview} loading={isPending}
                                onConfirm={() => handleRestore(log.id)}
                                onCancel={() => { setConfirming(null); setPreview(null) }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}

          {rows.length < total && (
            <div className="text-center pt-2">
              <button onClick={loadMore} disabled={loadingMore}
                className="inline-flex items-center gap-2 text-xs font-semibold text-text-secondary hover:text-text-primary border border-border rounded-xl px-4 py-2 press disabled:opacity-40">
                {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />}
                Carica altre {Math.min(PAGE_SIZE, total - rows.length)}
              </button>
              <p className="text-2xs text-text-tertiary mt-2">
                {rows.length.toLocaleString('it-IT')} di {total.toLocaleString('it-IT')}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

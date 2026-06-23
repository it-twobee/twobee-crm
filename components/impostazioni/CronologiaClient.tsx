'use client'

import { useState, useTransition } from 'react'
import {
  History, RotateCcw, ChevronDown, ChevronRight, Search,
  Plus, Edit2, Trash2, Loader2, AlertTriangle, Check, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { restoreEntitySnapshot } from '@/app/actions/restore-entity'
import type { ActivityLog, Profile } from '@/lib/types/database'

interface LogWithProfile extends ActivityLog {
  user?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

interface Props {
  logs: LogWithProfile[]
  isAdmin: boolean
  totalCount: number
}

const ENTITY_LABELS: Record<string, { label: string; color: string }> = {
  clients:     { label: 'Cliente',     color: 'text-gold' },
  tasks:       { label: 'Task',        color: 'text-blue-400' },
  deals:       { label: 'Deal',        color: 'text-purple-400' },
  invoices:    { label: 'Fattura',     color: 'text-green-400' },
  tickets:     { label: 'Ticket',      color: 'text-orange-400' },
  objectives:  { label: 'Obiettivo',   color: 'text-pink-400' },
  key_results: { label: 'Key Result',  color: 'text-pink-300' },
  projects:    { label: 'Progetto',    color: 'text-cyan-400' },
}

const ACTION_CONFIG = {
  create: { label: 'Creato',     icon: <Plus className="w-3 h-3" />,   color: 'text-success', bg: 'bg-success/10' },
  update: { label: 'Modificato', icon: <Edit2 className="w-3 h-3" />,  color: 'text-gold',    bg: 'bg-gold/10' },
  delete: { label: 'Eliminato',  icon: <Trash2 className="w-3 h-3" />, color: 'text-error',   bg: 'bg-error/10' },
}

const FIELD_SKIP = new Set(['id','created_at','updated_at','created_by'])

function DiffView({ diff }: { diff: Record<string, { old: unknown; new: unknown }> | null }) {
  if (!diff || Object.keys(diff).length === 0) return null
  const entries = Object.entries(diff).filter(([k]) => !FIELD_SKIP.has(k))
  if (!entries.length) return null

  return (
    <div className="mt-3 space-y-1.5">
      {entries.slice(0, 8).map(([field, { old: o, new: n }]) => (
        <div key={field} className="flex items-start gap-2 text-[10px]">
          <span className="text-text-secondary w-28 shrink-0 truncate font-mono">{field}</span>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {o !== null && o !== undefined && o !== '' && (
              <span className="bg-error/10 text-error px-1.5 py-0.5 rounded max-w-[120px] truncate font-mono">
                {String(o).slice(0, 40)}
              </span>
            )}
            {o !== null && o !== undefined && n !== null && n !== undefined && (
              <ChevronRight className="w-2.5 h-2.5 text-[#444] shrink-0" />
            )}
            {n !== null && n !== undefined && n !== '' && (
              <span className="bg-success/10 text-success px-1.5 py-0.5 rounded max-w-[120px] truncate font-mono">
                {String(n).slice(0, 40)}
              </span>
            )}
          </div>
        </div>
      ))}
      {entries.length > 8 && (
        <p className="text-[10px] text-[#444]">+ {entries.length - 8} altri campi modificati</p>
      )}
    </div>
  )
}

function ConfirmRestore({ log, onConfirm, onCancel, loading }: {
  log: LogWithProfile; onConfirm: () => void; onCancel: () => void; loading: boolean
}) {
  return (
    <div className="mt-3 bg-warning/5 border border-warning/20 rounded-lg p-3 space-y-2">
      <p className="text-xs font-bold text-warning flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" />
        Conferma ripristino
      </p>
      <p className="text-[10px] text-text-secondary">
        Stai per ripristinare <strong className="text-white">"{log.entity_label}"</strong> allo stato del{' '}
        {new Date(log.created_at).toLocaleString('it-IT')}. L'operazione è reversibile dalla cronologia.
      </p>
      <div className="flex gap-2">
        <button onClick={onConfirm} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-warning text-black text-xs font-bold rounded-lg disabled:opacity-50">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Ripristina
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 border border-[#2A2A2A] text-xs text-text-secondary rounded-lg hover:text-white">
          Annulla
        </button>
      </div>
    </div>
  )
}

export function CronologiaClient({ logs: initialLogs, isAdmin, totalCount }: Props) {
  const [logs] = useState(initialLogs)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('tutti')
  const [filterAction, setFilterAction] = useState('tutti')
  const [isPending, startTransition] = useTransition()

  const filtered = logs.filter(l => {
    const matchSearch = !search ||
      l.entity_label?.toLowerCase().includes(search.toLowerCase()) ||
      l.entity_type.toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === 'tutti' || l.entity_type === filterType
    const matchAction = filterAction === 'tutti' || l.action === filterAction
    return matchSearch && matchType && matchAction
  })

  const handleRestore = (logId: string) => {
    startTransition(async () => {
      try {
        await restoreEntitySnapshot(logId)
        toast.success('Versione ripristinata con successo')
        setConfirming(null)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Errore durante il ripristino')
      }
    })
  }

  // Raggruppa per giorno
  const grouped: Record<string, LogWithProfile[]> = {}
  for (const log of filtered) {
    const day = new Date(log.created_at).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    grouped[day] = grouped[day] ?? []
    grouped[day].push(log)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="w-5 h-5 text-gold" />
          <div>
            <h2 className="text-base font-black text-white">Cronologia</h2>
            <p className="text-xs text-text-secondary">{totalCount} operazioni registrate in totale</p>
          </div>
        </div>
      </div>

      {/* Filtri */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per nome o tipo..."
            className="w-full bg-surface border border-[#2A2A2A] rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder:text-text-secondary focus:outline-none focus:border-gold/40" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-text-secondary" /></button>}
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-surface border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white focus:outline-none">
          <option value="tutti">Tutti i tipi</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
          className="bg-surface border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white focus:outline-none">
          <option value="tutti">Tutte le azioni</option>
          <option value="create">Creazioni</option>
          <option value="update">Modifiche</option>
          <option value="delete">Eliminazioni</option>
        </select>
        <span className="text-xs text-text-secondary ml-1">{filtered.length} risultati</span>
      </div>

      {/* Lista per giorno */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16">
          <History className="w-10 h-10 text-[#2A2A2A] mx-auto mb-3" />
          <p className="text-sm text-text-secondary">Nessuna attività trovata</p>
          <p className="text-xs text-[#444] mt-1">La cronologia si popolerà automaticamente ad ogni modifica</p>
        </div>
      ) : (
        Object.entries(grouped).map(([day, dayLogs]) => (
          <div key={day}>
            {/* Separatore giorno */}
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px bg-[#2A2A2A] flex-1" />
              <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest capitalize px-2">{day}</span>
              <div className="h-px bg-[#2A2A2A] flex-1" />
            </div>

            <div className="space-y-1.5">
              {dayLogs.map(log => {
                const ac = ACTION_CONFIG[log.action]
                const ec = ENTITY_LABELS[log.entity_type] ?? { label: log.entity_type, color: 'text-text-secondary' }
                const isExp = expanded === log.id
                const isConf = confirming === log.id
                const hasDiff = log.diff && Object.keys(log.diff).filter(k => !FIELD_SKIP.has(k)).length > 0
                const canRestore = isAdmin && log.action !== 'create'

                return (
                  <div key={log.id}
                    className={`bg-surface border rounded-xl overflow-hidden transition-colors ${isExp ? 'border-gold/20' : 'border-[#2A2A2A]'}`}>
                    {/* Riga principale */}
                    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => setExpanded(isExp ? null : log.id)}>
                      {/* Icona azione */}
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${ac.bg}`}>
                        <span className={ac.color}>{ac.icon}</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold ${ec.color}`}>{ec.label}</span>
                          <span className={`text-[10px] font-bold ${ac.color}`}>{ac.label}</span>
                          <span className="text-xs text-white font-semibold truncate">
                            {log.entity_label ?? log.entity_id}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-text-secondary">
                          {log.user?.full_name && <span>{log.user.full_name}</span>}
                          <span>{new Date(log.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                          {hasDiff && <span>{Object.keys(log.diff ?? {}).filter(k => !FIELD_SKIP.has(k)).length} campi modificati</span>}
                        </div>
                      </div>

                      {/* Azioni */}
                      <div className="flex items-center gap-2 shrink-0">
                        {canRestore && !isConf && (
                          <button
                            onClick={e => { e.stopPropagation(); setExpanded(log.id); setConfirming(log.id) }}
                            className="flex items-center gap-1 text-[10px] text-text-secondary hover:text-warning transition-colors px-2 py-1 rounded-lg hover:bg-warning/10">
                            <RotateCcw className="w-3 h-3" /> Ripristina
                          </button>
                        )}
                        <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${isExp ? 'rotate-180' : ''}`} />
                      </div>
                    </div>

                    {/* Dettaglio espanso */}
                    {isExp && (
                      <div className="border-t border-[#2A2A2A] px-4 py-3">
                        {log.action === 'update' && hasDiff && (
                          <DiffView diff={log.diff} />
                        )}
                        {log.action === 'create' && (
                          <p className="text-[10px] text-text-secondary">
                            Record creato con ID <span className="font-mono text-[#444]">{log.entity_id}</span>
                          </p>
                        )}
                        {log.action === 'delete' && (
                          <p className="text-[10px] text-error">
                            Record eliminato — ripristinabile con il pulsante qui sopra
                          </p>
                        )}
                        {isConf && (
                          <ConfirmRestore
                            log={log}
                            onConfirm={() => handleRestore(log.id)}
                            onCancel={() => setConfirming(null)}
                            loading={isPending}
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

      {totalCount > logs.length && (
        <p className="text-center text-xs text-text-secondary py-4">
          Mostrate le ultime {logs.length} operazioni su {totalCount} totali
        </p>
      )}
    </div>
  )
}

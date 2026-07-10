'use client'

import { useState, useEffect } from 'react'
import { BarChart3, Loader2, RefreshCw, Sparkles, TrendingUp, TrendingDown, X, Pencil, Save, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import type { ClientKpi, Project, Client } from '@/lib/types/database'
import { Section, trendDir } from '../project-shared'

const KPI_LABELS: Record<string, string> = {
  mer: 'MER', ctr: 'CTR', cpa: 'CPA', leads_generated: 'Lead',
  revenue_attributed: 'Revenue', followers_gained: 'Follower',
  organic_sessions: 'Sessioni', new_users: 'Nuovi utenti', active_users: 'Utenti attivi',
  uptime: 'Uptime', email_open_rate: 'Email open', automation_runs: 'Automazioni',
}

const KPI_LEVEL_CONFIG = [
  { key: 'low',    label: 'Conservativo', desc: '35° percentile',  color: 'var(--color-text-tertiary)' },
  { key: 'med',    label: 'Realistico',   desc: '65° percentile',  color: 'var(--color-gold-text)' },
  { key: 'strong', label: 'Ambizioso',    desc: '90° percentile',  color: 'var(--color-success)' },
]

function fmtKpi(key: string, v: number): string {
  if (key === 'cpa' || key === 'revenue_attributed') return `€${v.toLocaleString('it-IT')}`
  if (key === 'ctr' || key === 'uptime' || key === 'email_open_rate') return `${v}%`
  if (key === 'mer') return `${v}×`
  if (key === 'followers_gained') return `+${v}`
  return v.toLocaleString('it-IT')
}

function KpiPrecompileModal({ project, client, accent, onClose, onApplied }: {
  project: Project; client: Client; accent: string; onClose: () => void; onApplied: (k: ClientKpi) => void
}) {
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<string | null>(null)
  const [levels, setLevels]     = useState<Record<string, Record<string, number>> | null>(null)
  const [kpiKeys, setKpiKeys]   = useState<string[]>([])

  const generate = async () => {
    setLoading(true); setLevels(null)
    try {
      const res = await fetch('/api/ai/kpi-precompile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectKind: project.project_kind,
          projectType: project.project_type,
          projectName: project.name,
          clientPackage: client.package,
          clientMrr: client.mrr,
        }),
      })
      const { levels: l, kpiKeys: k, error } = await res.json()
      if (error) { toast.error(error); return }
      setLevels(l); setKpiKeys(k)
    } catch { toast.error('Errore nella generazione') }
    finally { setLoading(false) }
  }

  useEffect(() => { generate() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async (levelKey: string) => {
    if (!levels?.[levelKey]) return
    setSaving(levelKey)
    const payload: Record<string, unknown> = {
      client_id: client.id,
      project_id: project.id,
      month: new Date().toISOString().slice(0, 7) + '-01',
      ...levels[levelKey],
    }
    const { data, error } = await createClient()
      .from('client_kpis')
      .upsert(payload, { onConflict: 'client_id,project_id,month' })
      .select().single()
    setSaving(null)
    if (error) { toast.error(error.message); return }
    toast.success('Obiettivi KPI salvati!')
    onApplied(data as ClientKpi)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 py-4 border-b border-border sticky top-0 bg-background z-10">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Sparkles className="w-4 h-4" style={{ color: accent }} />
              <h2 className="text-sm font-bold text-text-primary">Precompila obiettivi KPI</h2>
            </div>
            <p className="text-2xs" style={{ color: '#555' }}>
              {project.name} · benchmark {project.project_kind === 'growth' ? 'Growth' : 'Digital'} mercato italiano
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={generate} disabled={loading}
              className="flex items-center gap-1 text-2xs px-2.5 py-1.5 rounded-lg"
              style={{ background: 'var(--color-background)', border: '1px solid #1A1A1A', color: loading ? '#333' : '#555' }}>
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {loading ? 'Analisi…' : 'Rigenera'}
            </button>
            <button onClick={onClose}><X className="w-4 h-4 text-text-tertiary hover:text-text-primary" /></button>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} />
              <p className="text-xs" style={{ color: '#444' }}>Analisi benchmark di settore…</p>
            </div>
          ) : levels ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {KPI_LEVEL_CONFIG.map(lvl => (
                <div key={lvl.key} className="rounded-xl overflow-hidden"
                  style={{ border: `1px solid color-mix(in srgb, ${lvl.color} 13%, transparent)`, background: `color-mix(in srgb, ${lvl.color} 3%, transparent)` }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: `color-mix(in srgb, ${lvl.color} 13%, transparent)` }}>
                    <p className="text-2xs font-black uppercase tracking-widest" style={{ color: lvl.color }}>{lvl.label}</p>
                    <p className="text-2xs mt-0.5" style={{ color: '#444' }}>{lvl.desc}</p>
                  </div>
                  <div className="p-3 space-y-2">
                    {kpiKeys.map(k => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-2xs" style={{ color: '#555' }}>{KPI_LABELS[k] ?? k}</span>
                        <span className="text-2xs font-bold" style={{ color: lvl.color }}>
                          {levels[lvl.key]?.[k] != null ? fmtKpi(k, levels[lvl.key][k]) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 pb-3">
                    <button onClick={() => apply(lvl.key)} disabled={!!saving}
                      className="w-full py-2 rounded-lg text-2xs font-bold transition-all flex items-center justify-center gap-1.5"
                      style={{
                        background: `color-mix(in srgb, ${lvl.color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${lvl.color} 19%, transparent)`,
                        color: saving ? '#444' : lvl.color,
                      }}>
                      {saving === lvl.key ? <><Loader2 className="w-3 h-3 animate-spin" /> Salvo…</> : 'Usa questi obiettivi'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-10 text-xs" style={{ color: '#444' }}>Errore. Riprova.</p>
          )}
        </div>
      </div>
    </div>
  )
}

const KPI_KEYS_GROWTH = ['mer', 'ctr', 'cpa', 'leads_generated', 'revenue_attributed', 'followers_gained'] as const
const KPI_KEYS_DIGITAL = ['organic_sessions', 'new_users', 'active_users', 'uptime', 'email_open_rate', 'automation_runs'] as const

export function KpiSection({ kpis: initialKpis, project, client, accent, isAdmin }: {
  kpis: ClientKpi[]; project: Project; client: Client; accent: string; isAdmin: boolean
}) {
  const [kpis, setKpis]               = useState(initialKpis)
  const [showPrecompile, setPrecompile] = useState(false)
  const [editing, setEditing]          = useState(false)
  const [editValues, setEditValues]    = useState<Record<string, string>>({})
  const [savingEdit, setSavingEdit]    = useState(false)
  const isG = project.project_kind === 'growth'
  const last = kpis[0], prev = kpis[1]

  const kpiKeys = isG ? KPI_KEYS_GROWTH : KPI_KEYS_DIGITAL

  const items = isG ? [
    { key: 'mer', label: 'MER', v: last?.mer, f: (x: number) => `${x}×`, prev: prev?.mer },
    { key: 'ctr', label: 'CTR', v: last?.ctr, f: (x: number) => `${x}%`, prev: prev?.ctr },
    { key: 'cpa', label: 'CPA', v: last?.cpa, f: formatCurrency, prev: prev?.cpa },
    { key: 'leads_generated', label: 'Lead', v: last?.leads_generated, f: String, prev: prev?.leads_generated },
    { key: 'revenue_attributed', label: 'Revenue', v: last?.revenue_attributed, f: formatCurrency, prev: prev?.revenue_attributed },
    { key: 'followers_gained', label: 'Follower', v: last?.followers_gained, f: (x: number) => `+${x}`, prev: prev?.followers_gained },
  ] : [
    { key: 'organic_sessions', label: 'Sessioni', v: last?.organic_sessions, f: (x: number) => x.toLocaleString('it-IT'), prev: prev?.organic_sessions },
    { key: 'new_users', label: 'Nuovi utenti', v: last?.new_users, f: (x: number) => x.toLocaleString('it-IT'), prev: prev?.new_users },
    { key: 'active_users', label: 'Utenti attivi', v: last?.active_users, f: String, prev: prev?.active_users },
    { key: 'uptime', label: 'Uptime', v: last?.uptime, f: (x: number) => `${x}%`, prev: prev?.uptime },
    { key: 'email_open_rate', label: 'Email open', v: last?.email_open_rate, f: (x: number) => `${x}%`, prev: prev?.email_open_rate },
    { key: 'automation_runs', label: 'Automazioni', v: last?.automation_runs, f: String, prev: prev?.automation_runs },
  ]

  const startEdit = () => {
    const vals: Record<string, string> = {}
    for (const it of items) vals[it.key] = it.v != null ? String(it.v) : ''
    setEditValues(vals)
    setEditing(true)
  }

  const saveEdit = async () => {
    setSavingEdit(true)
    const payload: Record<string, unknown> = {
      client_id: client.id,
      project_id: project.id,
      month: last?.month ?? new Date().toISOString().slice(0, 7) + '-01',
    }
    for (const k of kpiKeys) {
      const v = editValues[k]?.trim()
      payload[k] = v ? parseFloat(v) : null
    }
    const { data, error } = await createClient()
      .from('client_kpis')
      .upsert(payload, { onConflict: 'client_id,project_id,month' })
      .select().single()
    setSavingEdit(false)
    if (error) { toast.error(error.message); return }
    setKpis(prev => [data as ClientKpi, ...prev.filter(x => x.id !== (data as ClientKpi).id)])
    setEditing(false)
    toast.success('KPI aggiornati')
  }

  const precompileBtn = isAdmin && (
    <button onClick={() => setPrecompile(true)}
      className="flex items-center gap-1 text-2xs font-bold px-2.5 py-1.5 rounded-lg mr-1 transition-all"
      style={{ background: 'var(--color-gold-dim)', border: '1px solid var(--color-gold-dim)', color: 'var(--color-gold-text)' }}>
      <Sparkles className="w-3 h-3" /> Precompila obiettivi
    </button>
  )

  const editBtn = isAdmin && !editing && last && (
    <button onClick={startEdit}
      className="flex items-center gap-1 text-2xs font-bold px-2.5 py-1.5 rounded-lg transition-all text-text-tertiary hover:text-text-primary border border-border hover:border-border">
      <Pencil className="w-3 h-3" /> Modifica valori
    </button>
  )

  return (
    <>
      {showPrecompile && (
        <KpiPrecompileModal
          project={project}
          client={client}
          accent={accent}
          onClose={() => setPrecompile(false)}
          onApplied={k => setKpis(prev => [k, ...prev.filter(x => x.id !== k.id)])}
        />
      )}

      {!last && !editing ? (
        <div className="flex flex-col items-center py-16 gap-4">
          <BarChart3 className="w-10 h-10 text-text-tertiary" />
          <p className="text-sm text-text-tertiary">Nessun dato KPI per questo progetto.</p>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button onClick={() => setPrecompile(true)}
                className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl transition-all"
                style={{ background: 'var(--color-gold-dim)', border: '1px solid var(--color-gold-dim)', color: 'var(--color-gold-text)' }}>
                <Sparkles className="w-3.5 h-3.5" /> Precompila con AI
              </button>
            )}
            {isAdmin && (
              <button onClick={() => { startEdit() }}
                className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl transition-all border border-border text-text-tertiary hover:text-text-primary hover:border-border">
                <Pencil className="w-3.5 h-3.5" /> Inserisci manualmente
              </button>
            )}
          </div>
        </div>
      ) : (
        <Section title="KPI del mese" icon={<BarChart3 className="w-3.5 h-3.5" />} accent={accent}
          right={<div className="flex items-center gap-2">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="text-2xs text-text-tertiary hover:text-text-primary px-2.5 py-1.5 rounded-lg border border-border">
                  Annulla
                </button>
                <button onClick={saveEdit} disabled={savingEdit}
                  className="flex items-center gap-1 text-2xs font-bold px-3 py-1.5 rounded-lg bg-gold text-on-gold disabled:opacity-50">
                  {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salva
                </button>
              </>
            ) : (
              <>{editBtn}{precompileBtn}<span className="text-2xs text-text-tertiary">{last && new Date(last.month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</span></>
            )}
          </div>}>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map(it => {
              const display = it.v != null ? it.f(it.v as number) : null
              const td = trendDir(it.v as number, it.prev as number)
              return (
                <div key={it.key} className={`bg-background border rounded-2xl p-4 transition-all ${editing ? 'border-gold/20' : 'border-border'}`}>
                  <p className="text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider">{it.label}</p>
                  {editing ? (
                    <input
                      type="number"
                      step="any"
                      value={editValues[it.key] ?? ''}
                      onChange={e => setEditValues(p => ({ ...p, [it.key]: e.target.value }))}
                      className="w-full bg-transparent text-xl font-black text-text-primary border-b border-gold/30 focus:border-gold focus:outline-none pb-0.5 placeholder:text-text-tertiary"
                      placeholder="—"
                    />
                  ) : (
                    <div className="flex items-end gap-2">
                      <p className="text-xl font-black" style={{ color: display ? accent : '#222' }}>{display ?? '—'}</p>
                      {td === 'up'   && <TrendingUp   className="w-3.5 h-3.5 text-success mb-0.5" />}
                      {td === 'down' && <TrendingDown  className="w-3.5 h-3.5 text-error mb-0.5" />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}
    </>
  )
}

'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Download, Play, ListTree } from 'lucide-react'
import {
  getReportStatus, runGa4Report, runKlaviyoReport, runMetaReport, getReport, getGa4Metadata, type ReportStatus,
} from '@/app/actions/tracking-reports'
import { upsertClientTracking } from '@/app/actions/tracking'
import { Field, inputCls } from '@/components/shared/formkit'
import { REPORT_SOURCES, type ReportSource } from '@/lib/tracking/vocab'
import type { ShapedReport, SkippedSection } from '@/lib/tracking/reporting'
import type { Ga4Metadata } from '@/lib/tracking/ga4'
import { Card, Chip, GoldButton, GhostButton, Loading, Notice, fmtDate, fmtDay } from './ui'

/* ── formattazione ─────────────────────────────────────────────────────── */

/** I nomi GA4 restano quelli di Esplora; le colonne calcolate (snake_case) diventano testo. */
function metricLabel(name: string) {
  if (!name.includes('_')) return name
  const t = name.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function formatMetric(name: string, value: number) {
  if (/^(tasso_|percentuale_)/.test(name)) return `${(value * 100).toFixed(1)}%`
  if (/^(ricavi|spesa|costo_per_conversione|costo_per_azione)$/.test(name)) {
    return value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: value < 100 ? 2 : 0 })
  }
  if (/Rate$/.test(name)) return `${(value * 100).toFixed(1)}%`
  if (/Duration$/i.test(name)) {
    const total = Math.round(value)
    return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`
  }
  if (/Revenue$/.test(name)) return value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  return value.toLocaleString('it-IT', { maximumFractionDigits: 1 })
}

function Variation({ v }: { v: number | null }) {
  if (v === null) return <span className="text-2xs text-text-tertiary">n/d</span>
  const tone = v > 0 ? 'success' : v < 0 ? 'error' : 'muted'
  return <Chip tone={tone}>{v > 0 ? '+' : ''}{v}%</Chip>
}

const sourceLabel = (s: string) => REPORT_SOURCES.find(r => r.key === s)?.label ?? s

/* ── tab ───────────────────────────────────────────────────────────────── */

type Extra = { sampled?: boolean; skipped?: SkippedSection[]; leadEvent?: string; conversionMetric?: string; flows?: number; adAccountId?: string; conversionActions?: string[]; vuoto?: boolean }

export function ClientReportTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [status, setStatus] = useState<ReportStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<(ShapedReport & Extra) | null>(null)
  const [metadata, setMetadata] = useState<Ga4Metadata | null>(null)
  const [form, setForm] = useState({ propertyId: '', leadEvent: '' })
  const [pending, start] = useTransition()
  const [running, setRunning] = useState<ReportSource | null>(null)

  const reload = useCallback(async () => {
    const res = await getReportStatus(clientId)
    if (!res.ok) { setError(res.error); return }
    setStatus(res.data)
    setForm({ propertyId: res.data.propertyId, leadEvent: res.data.leadEvent })
  }, [clientId])

  useEffect(() => { reload() }, [reload])

  const saveFields = () => start(async () => {
    const res = await upsertClientTracking(clientId, { ga4_property_id: form.propertyId, lead_event: form.leadEvent })
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Salvato')
    reload()
  })

  const generate = (source: ReportSource) => {
    setRunning(source)
    start(async () => {
      const res = source === 'ga4' ? await runGa4Report(clientId) : source === 'klaviyo' ? await runKlaviyoReport(clientId) : await runMetaReport(clientId)
      setRunning(null)
      if (!res.ok) { toast.error(res.error); reload(); return }
      setReport(res.data)
      toast.success(`Report ${sourceLabel(source)} generato`)
      reload()
    })
  }

  const openRun = (runId: string) => start(async () => {
    const res = await getReport(clientId, runId)
    if (!res.ok) { toast.error(res.error); return }
    setReport(res.data)
  })

  const loadMetadata = () => start(async () => {
    const res = await getGa4Metadata(clientId)
    if (!res.ok) { toast.error(res.error); return }
    setMetadata(res.data)
  })

  if (error) return <Notice tone="error">{error}</Notice>
  if (!status) return <Loading />

  const dirty = form.propertyId !== status.propertyId || form.leadEvent !== status.leadEvent

  return (
    <div className="space-y-4">
      <Card title="Connessione GA4" hint="Il service account è d'agenzia (Impostazioni → Chiavi tracking); qui il Property ID di questo cliente e l'evento del lead.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Property ID GA4" hint="solo il numero, non G-XXXX">
            <input value={form.propertyId} onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))} className={`${inputCls} font-mono`} placeholder="123456789" inputMode="numeric" />
          </Field>
          <Field label="Evento lead (funnel B2B)" hint="vuoto = generate_lead">
            <input value={form.leadEvent} onChange={e => setForm(f => ({ ...f, leadEvent: e.target.value }))} className={`${inputCls} font-mono`} placeholder="generate_lead" />
          </Field>
        </div>
        <div className="flex flex-wrap justify-between gap-2 mt-4">
          <GhostButton small onClick={loadMetadata} pending={pending} disabled={!status.propertyId}><ListTree className="w-3.5 h-3.5" /> Metriche disponibili</GhostButton>
          <GoldButton onClick={saveFields} pending={pending} disabled={!dirty}>Salva</GoldButton>
        </div>
        {metadata && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-2xs">
            <MetadataList title={`Metriche (${metadata.metrics.length})`} items={metadata.metrics} />
            <MetadataList title={`Dimensioni (${metadata.dimensions.length})`} items={metadata.dimensions} />
          </div>
        )}
      </Card>

      <Card title="Genera report" hint={`Periodo: ${fmtDay(status.period.start)} → ${fmtDay(status.period.end)}, confronto con ${fmtDay(status.period.compareStart)} → ${fmtDay(status.period.compareEnd)}. La finestra chiude ieri.`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {REPORT_SOURCES.map(s => {
            const st = status[s.key]
            return (
              <div key={s.key} className="border border-border rounded-xl p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-text-primary">{s.label}</span>
                  <Chip tone={st.canRun ? 'success' : 'warning'}>{st.canRun ? 'pronto' : `${st.blockers.length} prerequisiti`}</Chip>
                </div>
                {s.key === 'ga4' && status.definition && <p className="text-2xs text-text-tertiary">{status.definition}</p>}
                {st.blockers.length > 0 && <ul className="text-2xs text-text-secondary list-disc pl-4 space-y-0.5">{st.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>}
                <div className="mt-auto pt-1">
                  <GoldButton small onClick={() => generate(s.key)} pending={running === s.key} disabled={!st.canRun || (running !== null && running !== s.key)}>
                    <Play className="w-3.5 h-3.5" /> Genera
                  </GoldButton>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {report && <ReportView report={report} clientName={clientName} />}

      <Card title="Storico" hint="Gli ultimi 30 run per cliente, anche quelli falliti: «mai generato» e «ho provato e ha risposto male» sono due cose diverse.">
        {status.runs.length === 0 ? <p className="text-2xs text-text-tertiary">Nessun report ancora.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-2xs">
              <thead><tr className="text-text-tertiary text-left">
                <th className="py-1 pr-3 font-semibold">Quando</th><th className="py-1 pr-3 font-semibold">Fonte</th>
                <th className="py-1 pr-3 font-semibold">Periodo</th><th className="py-1 pr-3 font-semibold">Esito</th>
                <th className="py-1 pr-3 font-semibold">Righe</th><th className="py-1 font-semibold" />
              </tr></thead>
              <tbody>
                {status.runs.map(r => (
                  <tr key={r.id} className={`border-t border-border ${report?.id === r.id ? 'bg-gold-dim' : ''}`}>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-text-secondary">{fmtDate(r.created_at)}</td>
                    <td className="py-1.5 pr-3">{sourceLabel(r.source)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-text-secondary">{fmtDay(r.period_start)} → {fmtDay(r.period_end)}</td>
                    <td className="py-1.5 pr-3">{r.ok ? <Chip tone="success">ok</Chip> : <span className="text-error" title={r.error ?? ''}>{r.error ?? 'errore'}</span>}</td>
                    <td className="py-1.5 pr-3">{r.row_count}</td>
                    <td className="py-1.5 whitespace-nowrap">
                      {r.ok && (
                        <span className="inline-flex gap-1">
                          <GhostButton small onClick={() => openRun(r.id)} pending={pending}>Apri</GhostButton>
                          <a href={`/api/tracking/reports/${r.id}/csv`} className="inline-flex items-center gap-1 text-2xs font-semibold rounded-xl border border-border px-2.5 py-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover" aria-label="Scarica CSV">
                            <Download className="w-3.5 h-3.5" /> CSV
                          </a>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function MetadataList({ title, items }: { title: string; items: Ga4Metadata['metrics'] }) {
  return (
    <div>
      <p className="font-semibold text-text-secondary mb-1">{title}</p>
      <div className="max-h-56 overflow-y-auto border border-border rounded-xl p-2 space-y-0.5">
        {items.map(m => (
          <p key={m.apiName} className="font-mono text-text-primary">
            {m.apiName}{m.custom && <span className="ml-1 text-gold-text">custom</span>}
            <span className="ml-2 font-sans text-text-tertiary">{m.uiName}</span>
          </p>
        ))}
      </div>
    </div>
  )
}

function ReportView({ report, clientName }: { report: ShapedReport & Extra; clientName: string }) {
  return (
    <Card title={`${report.definition} · ${sourceLabel(report.source)}`}
      hint={`${clientName} · ${fmtDay(report.period.start)} → ${fmtDay(report.period.end)} vs ${fmtDay(report.period.compareStart)} → ${fmtDay(report.period.compareEnd)} · generato ${fmtDate(report.createdAt)}`}
      aside={
        <a href={`/api/tracking/reports/${report.id}/csv`} className="inline-flex items-center gap-1.5 text-2xs font-semibold rounded-xl border border-border px-3 py-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover">
          <Download className="w-3.5 h-3.5" /> CSV
        </a>
      }>
      <div className="space-y-2 mb-4">
        {report.leadEvent && <p className="text-2xs text-text-tertiary">Evento lead usato nel funnel: <span className="font-mono">{report.leadEvent}</span></p>}
        {report.sampled && <Notice tone="warning">GA4 ha campionato i dati: i numeri sono stime.</Notice>}
        {report.conversionMetric && <p className="text-2xs text-text-tertiary">Metrica di conversione Klaviyo: {report.conversionMetric} · {report.flows} flussi attivi</p>}
        {report.adAccountId && <p className="text-2xs text-text-tertiary">Ad Account {report.adAccountId} · conversioni contate: {report.conversionActions?.join(', ') || 'nessuna'}</p>}
        {report.vuoto && <Notice tone="muted">Nessuna spesa nel periodo su questo ad account.</Notice>}
        {report.skipped?.map(s => <Notice key={s.id} tone="muted">Sezione «{s.title}» saltata: {s.reason}</Notice>)}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {report.totals.map(t => (
          <div key={t.metric} className="border border-border rounded-xl p-3">
            <p className="text-2xs text-text-tertiary truncate" title={t.metric}>{metricLabel(t.metric)}</p>
            <p className="text-lg font-bold text-text-primary font-heading">{formatMetric(t.metric, t.current)}</p>
            <div className="flex items-center gap-2 text-2xs text-text-tertiary">
              <Variation v={t.variation} />
              <span>prima {formatMetric(t.metric, t.previous)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-5">
        {report.breakdowns.map(b => (
          <div key={b.id}>
            <h4 className="text-sm font-semibold text-text-primary mb-2">{b.title}</h4>
            {b.rows.length === 0 ? <p className="text-2xs text-text-tertiary">Nessun dato.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-2xs">
                  <thead><tr className="text-text-tertiary text-left">
                    {b.dimensions.map(d => <th key={d} className="py-1 pr-3 font-semibold">{d}</th>)}
                    {b.metrics.map(m => <th key={m} className="py-1 pr-3 font-semibold text-right">{metricLabel(m)}</th>)}
                  </tr></thead>
                  <tbody>
                    {b.rows.map(r => (
                      <tr key={r.key} className="border-t border-border">
                        {b.dimensions.map(d => <td key={d} className="py-1 pr-3 text-text-primary">{r.dimensions[d] ?? ''}</td>)}
                        {b.metrics.map(m => (
                          <td key={m} className="py-1 pr-3 text-right whitespace-nowrap">
                            <span className="text-text-primary">{formatMetric(m, r.metrics[m] ?? 0)}</span>
                            {r.previous && <span className="ml-1 text-text-tertiary">({formatMetric(m, r.previous[m] ?? 0)})</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
      {report.breakdowns.some(b => b.rows.some(r => r.previous)) && (
        <p className="text-2xs text-text-tertiary mt-3">Tra parentesi il valore del periodo precedente.</p>
      )}
    </Card>
  )
}

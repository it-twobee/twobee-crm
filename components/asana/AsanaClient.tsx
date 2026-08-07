'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Download, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Search, Info, ExternalLink,
} from 'lucide-react'
import { scanAsana, type AsanaScan } from '@/app/actions/asana'
import type { BoardKind } from '@/lib/asana'

const KIND_LABEL: Record<BoardKind, string> = {
  master: 'Board cliente',
  servizio: 'Checklist di servizio',
  adhoc: 'Ad hoc',
  prospect: 'Commerciale',
  interna: 'Interna',
}
const KIND_TONE: Record<BoardKind, string> = {
  master: 'bg-gold-dim text-gold-text border-gold/30',
  servizio: 'bg-info-dim text-info border-info/30',
  adhoc: 'bg-accent/15 text-accent border-accent/30',
  prospect: 'bg-surface-active text-text-secondary border-border',
  interna: 'bg-surface-active text-text-tertiary border-border',
}

export function AsanaClient() {
  const [scan, setScan] = useState<AsanaScan | null>(null)
  const [commercial, setCommercial] = useState(false)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'tutte' | 'pronte' | 'bloccate'>('tutte')
  const [pending, start] = useTransition()

  const run = () => start(async () => {
    try {
      const r = await scanAsana(commercial)
      setScan(r)
      toast.success(`${r.rows.length} task da ${r.boards} board`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  })

  const shown = useMemo(() => {
    if (!scan) return []
    const term = q.trim().toLowerCase()
    return scan.rows.filter(r => {
      if (only === 'pronte' && r.blockers.length) return false
      if (only === 'bloccate' && !r.blockers.length) return false
      if (!term) return true
      return [r.name, r.board.name, r.board.clientName, r.assigneeEmail, r.section]
        .some(v => v?.toLowerCase().includes(term))
    })
  }, [scan, q, only])

  const download = () => {
    if (!scan) return
    const blob = new Blob([scan.csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `asana-task-attive.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading">Asana</h1>
          <p className="text-sm text-text-secondary mt-1">
            Le task attive che vivono ancora su Asana, incrociate con clienti e persone di TwoBee.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={run} disabled={pending}
            className="flex items-center gap-1.5 text-2xs font-semibold bg-gold text-on-gold rounded-xl px-3 py-2 press disabled:opacity-40">
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {scan ? 'Rileggi' : 'Leggi da Asana'}
          </button>
          {scan && (
            <button onClick={download}
              className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <Download className="w-3.5 h-3.5" />Scarica CSV
            </button>
          )}
        </div>
      </div>

      {/* Cosa fa e cosa non fa: una sezione temporanea deve dirlo da sé */}
      <div className="rounded-2xl border border-info/40 bg-info-dim p-4 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
        <div className="min-w-0 text-2xs text-text-secondary space-y-1">
          <p className="text-sm font-semibold text-text-primary">Sola lettura</p>
          <p>
            Non scrive niente: né su Asana né sul database di TwoBee. Legge le task non completate,
            capisce da che cliente vengono dal <strong>nome della board</strong> — su Asana la gerarchia
            sta lì, non nell&apos;API — e aggancia gli assegnatari per email.
          </p>
          <p>
            Ogni riga che non passerebbe dice <strong>perché</strong>, invece di sparire: è la lista da
            guardare prima di decidere cosa importare.
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-2xs text-text-secondary cursor-pointer">
        <input type="checkbox" checked={commercial} onChange={e => setCommercial(e.target.checked)}
          className="accent-gold" />
        Leggi anche le board commerciali e interne
        <span className="text-text-tertiary">(~40 board in più, righe comunque bloccate)</span>
      </label>

      {!scan && !pending && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-text-secondary">Premi «Leggi da Asana» per cominciare.</p>
          <p className="text-2xs text-text-tertiary mt-1">Sono ~100 board: la lettura richiede qualche decina di secondi.</p>
        </div>
      )}

      {scan && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Task attive" value={scan.summary.total} hint={`da ${scan.boards} board di ${scan.workspace}`} />
            <Stat label="Pronte" value={scan.summary.ready} tone="success"
              hint="cliente e assegnatario riconosciuti" />
            <Stat label="Da sistemare" value={scan.summary.blocked} tone={scan.summary.blocked ? 'warning' : undefined}
              hint="manca qualcosa per portarle dentro" />
            <Stat label="Board lette" value={scan.boards}
              hint={scan.failed.length ? `${scan.failed.length} in errore` : 'nessun errore'} />
          </div>

          {scan.summary.reasons.length > 0 && (
            <section className="bg-surface border border-border rounded-2xl p-4">
              <h2 className="text-sm font-bold text-text-primary mb-2">Cosa blocca, e quante volte</h2>
              <div className="space-y-1.5">
                {scan.summary.reasons.map(r => (
                  <div key={r.reason} className="flex items-center gap-3">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                    <span className="text-2xs text-text-secondary flex-1">{r.reason}</span>
                    <span className="text-2xs font-bold text-text-primary tabular">{r.count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {scan.failed.length > 0 && (
            <section className="rounded-2xl border border-error/40 bg-error-dim p-4">
              <p className="text-sm font-bold text-text-primary mb-1">{scan.failed.length} board non lette</p>
              <ul className="text-2xs text-text-secondary space-y-0.5">
                {scan.failed.slice(0, 6).map(f => <li key={f.name}>{f.name} — {f.reason}</li>)}
              </ul>
            </section>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca task, board, cliente, persona…"
                aria-label="Cerca fra le task"
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-surface border border-border-interactive text-sm text-text-primary placeholder:text-text-tertiary" />
            </div>
            <div className="flex gap-1 bg-surface border border-border rounded-xl p-1">
              {(['tutte', 'pronte', 'bloccate'] as const).map(k => (
                <button key={k} onClick={() => setOnly(k)} aria-pressed={only === k}
                  className={`px-2.5 py-1 rounded-lg text-2xs font-semibold capitalize press ${
                    only === k ? 'bg-gold text-on-gold' : 'text-text-secondary hover:bg-surface-hover'}`}>
                  {k}
                </button>
              ))}
            </div>
          </div>

          <section className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-2xs text-text-tertiary uppercase tracking-wider border-b border-border">
                    <th className="text-left font-semibold px-4 py-2">Task</th>
                    <th className="text-left font-semibold px-2 py-2">Board</th>
                    <th className="text-left font-semibold px-2 py-2">Cliente</th>
                    <th className="text-left font-semibold px-2 py-2">Assegnatario</th>
                    <th className="text-left font-semibold px-2 py-2">Scadenza</th>
                    <th className="text-left font-semibold px-2 py-2">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, 400).map(r => (
                    <tr key={r.gid} className="border-t border-border/60 hover:bg-surface-hover align-top">
                      <td className="px-4 py-2">
                        <a href={`https://app.asana.com/0/0/${r.gid}`} target="_blank" rel="noreferrer"
                          className="text-2xs font-semibold text-text-primary hover:text-gold-text inline-flex items-center gap-1">
                          {r.name}<ExternalLink className="w-3 h-3 opacity-50 shrink-0" />
                        </a>
                        {r.section && <span className="block text-2xs text-text-tertiary">{r.section}</span>}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`inline-flex text-2xs font-semibold px-1.5 py-0.5 rounded border ${KIND_TONE[r.board.kind]}`}>
                          {KIND_LABEL[r.board.kind]}
                        </span>
                        <span className="block text-2xs text-text-tertiary mt-0.5">{r.board.service ?? r.board.name}</span>
                      </td>
                      <td className="px-2 py-2 text-2xs capitalize">
                        <span className={r.clientId ? 'text-text-primary' : 'text-warning'}>
                          {r.board.clientName ?? '—'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-2xs">
                        <span className={r.profileId ? 'text-text-primary' : 'text-text-tertiary'}>
                          {r.assigneeEmail ?? '—'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-2xs tabular text-text-secondary">{r.dueOn ?? '—'}</td>
                      <td className="px-2 py-2">
                        {r.blockers.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-2xs text-success">
                            <CheckCircle2 className="w-3 h-3" />pronta
                          </span>
                        ) : (
                          <span className="text-2xs text-warning">{r.blockers.join(' · ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {shown.length > 400 && (
              <p className="text-2xs text-text-tertiary px-4 py-2 border-t border-border">
                Mostrate 400 di {shown.length}: il CSV le contiene tutte.
              </p>
            )}
            {shown.length === 0 && (
              <p className="text-2xs text-text-tertiary px-4 py-6 text-center">Nessuna task con questi filtri.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, hint, tone }: {
  label: string; value: number; hint?: string; tone?: 'success' | 'warning'
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
      <span className="text-2xs font-semibold text-text-secondary uppercase tracking-wider">{label}</span>
      <p className={`text-xl font-bold tabular mt-1 ${
        tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-text-primary'}`}>{value}</p>
      {hint && <p className="text-2xs text-text-tertiary mt-0.5">{hint}</p>}
    </div>
  )
}

'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Download, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Search, Info, ExternalLink,
  Users, ArrowRight, Check,
} from 'lucide-react'
import { scanAsana, importAsanaTasks, type AsanaScan } from '@/app/actions/asana'
import type { BoardKind } from '@/lib/asana'

type Project = { id: string; name: string; client: string | null }
type Workstream = { id: string; project_id: string; name: string }
type Milestone = { id: string; workstream_id: string; name: string }

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

export function AsanaClient({ projects, workstreams, milestones }: {
  projects: Project[]; workstreams: Workstream[]; milestones: Milestone[]
}) {
  const [scan, setScan] = useState<AsanaScan | null>(null)
  const [commercial, setCommercial] = useState(false)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'tutte' | 'pronte' | 'bloccate'>('tutte')
  const [pending, start] = useTransition()

  /* §216 — la migrazione si guarda **per persona**: «cosa ha in mano Michele» è
     la domanda con cui si decide cosa spostare, non «quali task esistono». */
  const [resource, setResource] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [projectId, setProjectId] = useState('')
  const [wsId, setWsId] = useState('')
  const [msId, setMsId] = useState('')
  const [keepAssignee, setKeepAssignee] = useState(true)

  const wsOf = useMemo(() => workstreams.filter(w => w.project_id === projectId), [workstreams, projectId])
  const msOf = useMemo(() => milestones.filter(m => m.workstream_id === wsId), [milestones, wsId])
  const done = useMemo(() => new Set(scan?.imported ?? []), [scan])

  const run = () => start(async () => {
    try {
      const r = await scanAsana(commercial)
      setScan(r)
      setPicked(new Set())
      toast.success(`${r.rows.length} task da ${r.boards} board · ${r.resources.length} risorse`)
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
      /* Il filtro per risorsa confronta l'email, non il nome: su Asana lo stesso
         nome si scrive in tre modi, l'email è una sola. La riga «senza
         assegnatario» ha la chiave vuota, ed è quella che serve per trovare le
         task che nessuno si è preso. */
      if (resource !== null && (r.assigneeEmail ?? '').toLowerCase() !== resource) return false
      if (!term) return true
      return [r.name, r.board.name, r.board.clientName, r.assigneeEmail, r.section]
        .some(v => v?.toLowerCase().includes(term))
    })
  }, [scan, q, only, resource])

  /* Si migra quello che si vede: selezionare tutto significa «tutto quello che
     ho filtrato», mai le righe nascoste da un filtro che ho dimenticato. */
  const selectable = useMemo(() => shown.filter(r => !done.has(r.gid)), [shown, done])
  const allPicked = selectable.length > 0 && selectable.every(r => picked.has(r.gid))
  const toggleAll = () => setPicked(p => {
    const n = new Set(p)
    if (allPicked) selectable.forEach(r => n.delete(r.gid))
    else selectable.forEach(r => n.add(r.gid))
    return n
  })
  const toggle = (gid: string) => setPicked(p => {
    const n = new Set(p); n.has(gid) ? n.delete(gid) : n.add(gid); return n
  })

  const migrate = () => {
    if (!scan) return
    const payload = scan.rows.filter(r => picked.has(r.gid)).map(r => ({
      gid: r.gid, title: r.name, notes: r.notes, dueOn: r.dueOn, assigneeEmail: r.assigneeEmail,
    }))
    start(async () => {
      try {
        const res = await importAsanaTasks(payload, { projectId, workstreamId: wsId, milestoneId: msId, keepAssignee })
        toast.success(`${res.created} task migrate`, {
          description: [
            res.skipped ? `${res.skipped} già dentro, saltate` : '',
            res.noAssignee ? `${res.noAssignee} senza assegnatario riconosciuto` : '',
          ].filter(Boolean).join(' · ') || undefined,
        })
        setPicked(new Set())
        const r = await scanAsana(commercial)
        setScan(r)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Errore')
      }
    })
  }

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
          <p className="text-sm font-semibold text-text-primary">Come funziona</p>
          <p>
            Legge le task non completate, capisce da che cliente vengono dal <strong>nome della
            board</strong> — su Asana la gerarchia sta lì, non nell&apos;API — e aggancia gli
            assegnatari per email. <strong>Su Asana non scrive mai niente.</strong>
          </p>
          <p>
            Parti dalla <strong>risorsa</strong>: scegli una persona, guarda cosa ha in mano, seleziona e
            portalo in un progetto e workstream che esistono già. Ogni riga che non passerebbe dice
            <strong> perché</strong>, invece di sparire.
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

          {/* ── Le risorse: da qui si parte ── */}
          <section className="bg-surface border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-gold-text" />
              <h2 className="text-sm font-bold text-text-primary flex-1">Risorse</h2>
              {resource !== null && (
                <button onClick={() => setResource(null)}
                  className="text-2xs font-semibold text-gold-text hover:opacity-80">mostra tutte</button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {scan.resources.map(r => {
                const key = (r.email ?? '').toLowerCase()
                const on = resource === key
                return (
                  <button key={r.gid || 'orfane'} onClick={() => setResource(on ? null : key)}
                    aria-pressed={on}
                    className={`text-left rounded-xl border p-3 transition-colors press ${
                      on ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'}`}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xs font-bold text-text-primary flex-1 truncate">{r.name}</span>
                      <span className="text-sm font-bold text-text-primary tabular">{r.tasks}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {/* Chi non ha un profilo TwoBee resta in elenco: sparire
                          sarebbe il modo di non accorgersi che gli mancano venti task. */}
                      {r.profileId
                        ? <span className="text-2xs text-success">in TwoBee</span>
                        : <span className="text-2xs text-warning">nessun profilo TwoBee</span>}
                      {r.tasks > 0 && (
                        <span className="text-2xs text-text-tertiary">· {r.ready} pronte</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── Dove finiscono ── */}
          <section className="bg-surface border border-border rounded-2xl p-4">
            <h2 className="text-sm font-bold text-text-primary mb-1">Porta in TwoBee</h2>
            <p className="text-2xs text-text-tertiary mb-3">
              Progetto e workstream esistenti. La <strong>milestone è obbligatoria</strong>: una task
              senza milestone non compare nel board del progetto — importata e invisibile è peggio di
              non importata.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Select label="Progetto" value={projectId}
                onChange={v => { setProjectId(v); setWsId(''); setMsId('') }}
                options={projects.map(p => ({ v: p.id, l: p.client ? `${p.client} · ${p.name}` : p.name }))} />
              <Select label="Workstream" value={wsId} disabled={!projectId}
                onChange={v => { setWsId(v); setMsId('') }}
                options={wsOf.map(w => ({ v: w.id, l: w.name }))} />
              <Select label="Milestone" value={msId} disabled={!wsId}
                onChange={setMsId} options={msOf.map(m => ({ v: m.id, l: m.name }))} />
            </div>
            {projectId && wsOf.length === 0 && (
              <p className="text-2xs text-warning mt-2">
                Questo progetto non ha workstream: creane uno dalla scheda progetto prima di migrare.
              </p>
            )}
            {wsId && msOf.length === 0 && (
              <p className="text-2xs text-warning mt-2">
                Questo workstream non ha milestone: creane una prima di migrare.
              </p>
            )}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <label className="flex items-center gap-2 text-2xs text-text-secondary cursor-pointer">
                <input type="checkbox" checked={keepAssignee} onChange={e => setKeepAssignee(e.target.checked)}
                  className="accent-gold" />
                Mantieni l&apos;assegnatario di Asana, dove l&apos;email combacia
              </label>
              <span className="flex-1" />
              <span className="text-2xs text-text-tertiary tabular">{picked.size} selezionate</span>
              <button onClick={migrate} disabled={pending || !picked.size || !msId}
                className="flex items-center gap-1.5 text-2xs font-semibold bg-gold text-on-gold rounded-xl px-3 py-2 press disabled:opacity-40">
                {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                Migra {picked.size || ''}
              </button>
            </div>
          </section>

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
                    <th className="w-8 px-3 py-2">
                      <input type="checkbox" checked={allPicked} onChange={toggleAll}
                        disabled={selectable.length === 0}
                        aria-label="Seleziona tutte le task filtrate" className="accent-gold" />
                    </th>
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
                      <td className="px-3 py-2">
                        {done.has(r.gid) ? (
                          <Check className="w-3.5 h-3.5 text-success" aria-label="già in TwoBee" />
                        ) : (
                          <input type="checkbox" checked={picked.has(r.gid)} onChange={() => toggle(r.gid)}
                            aria-label={`Seleziona ${r.name}`} className="accent-gold" />
                        )}
                      </td>
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
                        {done.has(r.gid) ? (
                          <span className="inline-flex items-center gap-1 text-2xs text-success">
                            <CheckCircle2 className="w-3 h-3" />già in TwoBee
                          </span>
                        ) : r.blockers.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-2xs text-text-secondary">
                            pronta
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

function Select({ label, value, onChange, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void
  options: { v: string; l: string }[]; disabled?: boolean
}) {
  return (
    <label className="block">
      <span className="block text-2xs font-semibold text-text-secondary mb-1">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className="w-full h-9 px-2 rounded-xl bg-surface border border-border-interactive text-sm text-text-primary disabled:opacity-40">
        <option value="">{disabled ? '—' : 'Scegli…'}</option>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
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

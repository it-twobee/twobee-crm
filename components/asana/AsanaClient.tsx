'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Download, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Search, Info, ExternalLink,
  Users, ArrowRight, Check, FolderTree, Trash2,
} from 'lucide-react'
import {
  scanAsana, importAsanaTasks, importAsanaAdHoc, setTriage, deleteOnAsana, type AsanaScan,
} from '@/app/actions/asana'
import { ASANA_DELETE_BATCH } from '@/lib/asana'
import type { BoardKind, Decision } from '@/lib/asana'

const DECISION_LABEL: Record<Decision, string> = {
  tieni: 'da tenere', elimina: 'da eliminare', migrata: 'già in TwoBee',
}
const DECISION_TONE: Record<Decision, string> = {
  tieni: 'bg-info-dim text-info border-info/30',
  elimina: 'bg-error-dim text-error border-error/30',
  migrata: 'bg-success-dim text-success border-success/30',
}

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
  const [mode, setMode] = useState<'attive' | 'tutto'>('attive')
  const [client, setClient] = useState<string | null>(null)
  const [showDecided, setShowDecided] = useState(false)
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
  /* §220 — dove atterrano. «Ad hoc» è il default perché è il caso vero: 106 task
     sparse su 26 board non sono i passi di una consegna, sono cose da fare per
     un cliente. Il progetto serve quando la struttura su Asana c'era davvero. */
  const [dest, setDest] = useState<'adhoc' | 'progetto'>('adhoc')
  /* §221 — creare comunque è il default. Rifiutare sembrava prudente e non lo
     era: costringeva a inventare un'anagrafica prima di sapere se serve. */
  const [withoutClient, setWithoutClient] = useState(true)
  const [missing, setMissing] = useState<string[]>([])
  /* §219 — la cancellazione su Asana ha uno stato suo, fuori dalla transizione:
     l'avanzamento deve aggiornarsi mentre gira, e dentro `useTransition` React
     lo rimanderebbe alla fine — cioè quando non serve più. */
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState<{ done: number; total: number } | null>(null)

  const wsOf = useMemo(() => workstreams.filter(w => w.project_id === projectId), [workstreams, projectId])
  const msOf = useMemo(() => milestones.filter(m => m.workstream_id === wsId), [milestones, wsId])
  const done = useMemo(() => new Set(scan?.imported ?? []), [scan])
  const decisions = useMemo(() => new Map(scan?.decisions ?? []), [scan])

  const run = () => start(async () => {
    try {
      const r = await scanAsana(mode)
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
      if (client !== null && r.board.clientName !== client) return false
      /* Le già decise si nascondono di default: il senso di questa pagina è che
         la lista si accorci mentre ci lavori, non che resti lunga uguale. */
      if (!showDecided && decisions.has(r.gid)) return false
      if (!term) return true
      return [r.name, r.board.name, r.board.clientName, r.assigneeEmail, r.section]
        .some(v => v?.toLowerCase().includes(term))
    })
  }, [scan, q, only, resource, client, showDecided, decisions])

  /* Si migra quello che si vede: selezionare tutto significa «tutto quello che
     ho filtrato», mai le righe nascoste da un filtro che ho dimenticato. */
  const selectable = useMemo(() => shown.filter(r => !done.has(r.gid)), [shown, done])
  const pickedList = useMemo(() => Array.from(picked), [picked])
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
    const sel = scan.rows.filter(r => picked.has(r.gid))
    const payload = sel.map(r => ({
      gid: r.gid, title: r.name, notes: r.notes, dueOn: r.dueOn, assigneeEmail: r.assigneeEmail,
    }))
    start(async () => {
      try {
        if (dest === 'adhoc') {
          const res = await importAsanaAdHoc(sel.map(r => ({
            gid: r.gid, title: r.name, notes: r.notes, dueOn: r.dueOn,
            assigneeEmail: r.assigneeEmail, clientId: r.clientId,
            boardName: r.board.name, clientName: r.board.clientName,
          })), withoutClient)
          toast.success(`${res.created} task ad hoc create`, {
            description: [
              res.skipped ? `${res.skipped} già dentro` : '',
              res.orphaned ? `${res.orphaned} senza cliente, con l'avviso in descrizione` : '',
              res.noAssignee ? `${res.noAssignee} senza risorsa riconosciuta` : '',
            ].filter(Boolean).join(' · ') || undefined,
          })
          setMissing(res.missingClients)
          setPicked(new Set())
          setScan(await scanAsana(mode))
          return
        }
        const res = await importAsanaTasks(payload, { projectId, workstreamId: wsId, milestoneId: msId, keepAssignee })
        toast.success(`${res.created} task migrate`, {
          description: [
            res.skipped ? `${res.skipped} già dentro, saltate` : '',
            res.noAssignee ? `${res.noAssignee} senza assegnatario riconosciuto` : '',
          ].filter(Boolean).join(' · ') || undefined,
        })
        setPicked(new Set())
        setScan(await scanAsana(mode))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Errore')
      }
    })
  }

  /**
   * §219 — Cancella davvero su Asana, a lotti.
   *
   * Non passa da `useTransition`: mille cancellazioni sono un minuto abbondante,
   * e l'unica cosa che rende sopportabile un minuto è vedere il contatore
   * muoversi. Ogni lotto che torna aggiorna lo stato, così se qualcosa si rompe
   * a metà si sa **quanto** è andato — non «forse tutto, forse niente».
   */
  const removeFromAsana = async () => {
    setConfirmDel(false)
    const gids = pickedList
    setDeleting({ done: 0, total: gids.length })
    let deleted = 0, gone = 0
    const failed: { gid: string; reason: string }[] = []
    try {
      for (let i = 0; i < gids.length; i += ASANA_DELETE_BATCH) {
        const chunk = gids.slice(i, i + ASANA_DELETE_BATCH)
        const r = await deleteOnAsana(chunk)
        deleted += r.deleted; gone += r.alreadyGone; failed.push(...r.failed)
        setDeleting({ done: Math.min(i + chunk.length, gids.length), total: gids.length })
      }
      toast.success(`${deleted} eliminate su Asana`, {
        description: [
          gone ? `${gone} non c'erano già più` : '',
          failed.length ? `${failed.length} non sono passate` : '',
          'Restano nel cestino di Asana per 30 giorni',
        ].filter(Boolean).join(' · '),
      })
      if (failed.length) {
        toast.error(`${failed.length} non eliminate`, { description: failed[0].reason })
      }
      setPicked(new Set())
      setScan(await scanAsana(mode))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore', {
        description: `${deleted} erano già state eliminate prima dell'interruzione`,
      })
    } finally {
      setDeleting(null)
    }
  }

  /** Le azioni massive: si decide per blocco, non riga per riga. */
  const decide = (d: Decision | null) => start(async () => {
    try {
      const n = await setTriage(pickedList, d)
      toast.success(d === null ? `${n} decisioni annullate` : `${n} segnate «${DECISION_LABEL[d]}»`)
      setPicked(new Set())
      setScan(await scanAsana(mode))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  })

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

      {/* §217 — quanto si guarda. «Tutto» è la vista per chiudere Asana: quello
          che non si guarda resta lì dentro quando si spegne la luce. */}
      <div className="flex gap-2 flex-wrap">
        {([
          ['attive', 'Solo attive', 'Il lavoro non chiuso sulle board di consegna: la vista per migrare'],
          ['tutto', 'Tutta la struttura', 'Ogni board e ogni task, chiuse e commerciali comprese: la vista per chiudere Asana'],
        ] as const).map(([m, lab, why]) => (
          <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} title={why}
            className={`text-left rounded-xl border px-3 py-2 press ${
              mode === m ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'}`}>
            <span className="block text-2xs font-bold text-text-primary">{lab}</span>
            <span className="block text-2xs text-text-tertiary">{why}</span>
          </button>
        ))}
        {scan && mode !== 'attive' && (
          <span className="self-center text-2xs text-text-tertiary">premi «Rileggi» per applicare</span>
        )}
      </div>

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

          {missing.length > 0 && (
            <div className="rounded-2xl border border-warning/40 bg-warning-dim p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-text-primary">
                    {missing.length} client{missing.length > 1 ? 'i' : 'e'} non {missing.length > 1 ? 'sono' : 'è'} in anagrafica
                  </p>
                  <p className="text-2xs text-text-secondary mt-1 capitalize">{missing.join(' · ')}</p>
                  <p className="text-2xs text-text-tertiary mt-1">
                    Le task sono state create lo stesso, con l&apos;avviso in descrizione. Admin e super
                    admin possono creare l&apos;anagrafica e poi agganciarle dalla scheda cliente.
                  </p>
                </div>
                <Link href="/clienti"
                  className="text-2xs font-semibold border border-warning/50 text-warning rounded-xl px-3 py-2 hover:bg-surface press shrink-0">
                  Vai ai clienti
                </Link>
              </div>
            </div>
          )}

          {scan.gidMissing && (
            <div className="rounded-2xl border border-error/40 bg-error-dim p-4 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-text-primary">Migration da eseguire prima di migrare</p>
                <p className="text-2xs text-text-secondary mt-1">
                  Manca <code className="px-1 py-0.5 rounded bg-surface border border-border">tasks.asana_gid</code>:
                  l&apos;avevano aggiunta le migration 003 e 113, il reset del dominio progetto ha ricreato le
                  tabelle e se l&apos;è portata via. Esegui{' '}
                  <code className="px-1 py-0.5 rounded bg-surface border border-border">supabase/migrations/202_asana_gid_restore.sql</code>.
                  Senza, il travaso non saprebbe quali task ha già portato dentro e le duplicherebbe
                  a ogni rilancio — per questo è bloccato, non è un dettaglio.
                </p>
              </div>
            </div>
          )}

          {scan.triageMissing && (
            <div className="rounded-2xl border border-warning/40 bg-warning-dim p-4 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-text-primary">Migration da eseguire</p>
                <p className="text-2xs text-text-secondary mt-1">
                  Le decisioni («da tenere», «da eliminare») non hanno dove essere scritte finché non
                  esegui{' '}
                  <code className="px-1 py-0.5 rounded bg-surface border border-border">supabase/migrations/201_asana_triage.sql</code>{' '}
                  nel SQL Editor di Supabase. Leggere Asana e migrare le task funziona lo stesso: è
                  solo il registro di cosa hai già deciso che manca.
                </p>
              </div>
            </div>
          )}

          {/* §217 — quanto manca: la sola cosa che rende finito un lavoro che
              sembra infinito. Senza, si smette di decidere dopo il terzo cliente. */}
          <section className="bg-surface border border-border rounded-2xl p-4">
            <div className="flex items-baseline gap-2 mb-2">
              <h2 className="text-sm font-bold text-text-primary flex-1">Da decidere</h2>
              <span className="text-sm font-bold text-text-primary tabular">{scan.progress.left}</span>
              <span className="text-2xs text-text-tertiary">su {scan.progress.total}</span>
            </div>
            <div className="h-1.5 bg-surface-active rounded-full overflow-hidden">
              <div className="h-full bg-success rounded-full transition-all" style={{ width: `${scan.progress.pct}%` }} />
            </div>
            <p className="text-2xs text-text-tertiary mt-1.5">
              {scan.progress.done} già decise ({scan.progress.pct}%). Le decisioni restano: si riprende da dove si era.
            </p>
          </section>

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

          {/* ── La struttura per cliente: da qui si decide cosa buttare ── */}
          <section className="bg-surface border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <FolderTree className="w-4 h-4 text-gold-text" />
              <h2 className="text-sm font-bold text-text-primary flex-1">Struttura per cliente</h2>
              {client !== null && (
                <button onClick={() => setClient(null)}
                  className="text-2xs font-semibold text-gold-text hover:opacity-80">mostra tutti</button>
              )}
            </div>
            <p className="text-2xs text-text-tertiary mb-3">
              «Icura - META ADS» e «Ad Hoc - Icura» sono lo stesso cliente e si decidono insieme.
              Le board senza cliente stanno in fondo: sono quelle che di solito si buttano, e una
              lista che le nasconde fa chiudere Asana con dentro roba mai guardata.
            </p>
            <div className="space-y-1.5">
              {scan.groups.map(g => {
                const key = g.clientName ?? ''
                const on = client === g.clientName
                return (
                  <div key={key || 'senza'} className={`rounded-xl border ${on ? 'border-gold bg-gold-dim' : 'border-border'}`}>
                    <button onClick={() => setClient(on ? null : g.clientName)} aria-pressed={on}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover rounded-xl transition-colors">
                      <span className={`text-2xs font-bold capitalize flex-1 truncate ${
                        g.clientName ? 'text-text-primary' : 'text-text-secondary'}`}>
                        {g.clientName ?? 'Senza cliente — interne e commerciali'}
                      </span>
                      {g.clientId
                        ? <span className="text-2xs text-success shrink-0">in anagrafica</span>
                        : g.clientName && <span className="text-2xs text-warning shrink-0">non in anagrafica</span>}
                      <span className="text-2xs text-text-tertiary shrink-0 tabular">
                        {g.boards.length} board · {g.open} aperte su {g.total}
                      </span>
                      <span className="text-2xs font-bold text-text-primary shrink-0 tabular">
                        {g.total - g.decided}
                      </span>
                    </button>
                    {on && (
                      <div className="px-3 pb-2 space-y-0.5">
                        {g.boards.map(b => (
                          <div key={b.board.gid} className="flex items-center gap-2 text-2xs">
                            <span className={`px-1.5 py-0.5 rounded border shrink-0 ${KIND_TONE[b.board.kind]}`}>
                              {KIND_LABEL[b.board.kind]}
                            </span>
                            <span className="text-text-secondary flex-1 truncate">{b.board.name}</span>
                            <span className="text-text-tertiary tabular shrink-0">
                              {b.open} aperte · {b.total - b.decided} da decidere
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

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
            <h2 className="text-sm font-bold text-text-primary mb-2">Porta in TwoBee</h2>
            <div className="grid gap-2 sm:grid-cols-2 mb-3">
              {([
                ['adhoc', 'Task Ad Hoc', 'Cliente dalla board, risorsa dall\u2019email. Niente altro da scegliere.'],
                ['progetto', 'Dentro un progetto', 'Serve progetto, workstream e milestone: usalo dove la struttura c\u2019era davvero.'],
              ] as const).map(([d, lab, why]) => (
                <button key={d} onClick={() => setDest(d)} aria-pressed={dest === d}
                  className={`text-left rounded-xl border p-3 press ${
                    dest === d ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'}`}>
                  <span className="block text-2xs font-bold text-text-primary">{lab}</span>
                  <span className="block text-2xs text-text-tertiary mt-0.5">{why}</span>
                </button>
              ))}
            </div>
            {dest === 'adhoc' ? (
              <>
                <p className="text-2xs text-text-tertiary">
                  Ogni task diventa una <strong>Task Ad Hoc</strong> del suo cliente, assegnata alla
                  persona che ce l&apos;ha su Asana.
                </p>
                <label className="flex items-start gap-2 text-2xs text-text-secondary cursor-pointer mt-2">
                  <input type="checkbox" checked={withoutClient}
                    onChange={e => setWithoutClient(e.target.checked)} className="accent-gold mt-0.5" />
                  <span>
                    Crea anche quelle il cui cliente non è in anagrafica
                    <span className="block text-2xs text-text-tertiary mt-0.5">
                      Nascono senza cliente e con l&apos;avviso scritto in cima alla descrizione — dove
                      lo legge chi apre la task, non in un messaggio che sparisce. Un admin può creare
                      l&apos;anagrafica dopo e agganciarle.
                    </span>
                  </span>
                </label>
              </>
            ) : (<>
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
            <label className="flex items-center gap-2 text-2xs text-text-secondary cursor-pointer mt-3">
              <input type="checkbox" checked={keepAssignee} onChange={e => setKeepAssignee(e.target.checked)}
                className="accent-gold" />
              Mantieni l&apos;assegnatario di Asana, dove l&apos;email combacia
            </label>
            </>)}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className="flex-1" />
              {dest === 'progetto' && !msId && picked.size > 0 && (
                <span className="text-2xs text-warning">scegli progetto, workstream e milestone</span>
              )}
              <span className="text-2xs text-text-tertiary tabular">{picked.size} selezionate</span>
              <button onClick={migrate}
                disabled={pending || !picked.size || scan.gidMissing || (dest === 'progetto' && !msId)}
                title={scan.gidMissing ? 'Esegui la migration 202: senza asana_gid il travaso duplicherebbe a ogni rilancio' : undefined}
                className="flex items-center gap-1.5 text-2xs font-semibold bg-gold text-on-gold rounded-xl px-3 py-2 press disabled:opacity-40">
                {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                {dest === 'adhoc' ? 'Crea ad hoc' : 'Migra'} {picked.size || ''}
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
            <select value={client ?? ''} onChange={e => setClient(e.target.value || null)}
              aria-label="Filtra per cliente"
              className="h-9 px-2 rounded-xl bg-surface border border-border-interactive text-2xs text-text-primary capitalize">
              <option value="">Tutti i clienti</option>
              {scan.clientNames.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-2xs text-text-secondary cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={showDecided} onChange={e => setShowDecided(e.target.checked)}
                className="accent-gold" />
              mostra le già decise
            </label>
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

          {deleting && (
            <div className="sticky bottom-3 z-30 bg-surface border border-border-strong rounded-2xl shadow-pop p-3">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-error" />
                <span className="text-2xs font-bold text-text-primary flex-1">
                  Elimino su Asana… {deleting.done} di {deleting.total}
                </span>
                <span className="text-2xs text-text-tertiary">non chiudere la pagina</span>
              </div>
              <div className="h-1.5 bg-surface-active rounded-full overflow-hidden">
                <div className="h-full bg-error rounded-full transition-all"
                  style={{ width: `${Math.round((deleting.done / Math.max(1, deleting.total)) * 100)}%` }} />
              </div>
            </div>
          )}

          {picked.size > 0 && !deleting && (
            <div className="sticky bottom-3 z-30 flex items-center gap-2 flex-wrap
                            bg-surface border border-border-strong rounded-2xl shadow-pop p-3">
              <span className="text-2xs font-bold text-text-primary">{picked.size} selezionate</span>
              <button onClick={() => { setPicked(new Set()); setConfirmDel(false) }}
                className="text-2xs font-semibold text-text-secondary hover:text-text-primary">deseleziona</button>
              <span className="flex-1" />
              {/* Decidere per blocco è il punto: riga per riga non si finisce. */}
              <button onClick={() => decide('tieni')} disabled={pending || scan.triageMissing}
                title={scan.triageMissing ? 'Esegui la migration 201: le decisioni non hanno dove essere scritte' : undefined}
                className="text-2xs font-semibold border border-info/50 text-info rounded-xl px-3 py-2 hover:bg-surface-hover press disabled:opacity-40">
                Da tenere
              </button>
              <button onClick={() => decide('elimina')} disabled={pending || scan.triageMissing}
                title={scan.triageMissing ? 'Esegui la migration 201: le decisioni non hanno dove essere scritte' : undefined}
                className="text-2xs font-semibold border border-error/50 text-error rounded-xl px-3 py-2 hover:bg-surface-hover press disabled:opacity-40">
                Da eliminare
              </button>
              <button onClick={() => decide(null)} disabled={pending || scan.triageMissing}
                title="Un ripensamento deve costare quanto la scelta"
                className="text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary press disabled:opacity-40">
                Annulla decisione
              </button>

              {/* §219 — due passi, e il secondo dice il numero. Cancellare su un
                  servizio di terzi non può essere un click distratto: la conferma
                  ripete quante ne stai togliendo e dove finiscono. */}
              {confirmDel ? (
                <span className="flex items-center gap-2 border border-error/50 bg-error-dim rounded-xl px-3 py-2">
                  <span className="text-2xs font-semibold text-text-primary">
                    Elimino {picked.size} task da Asana? Vanno nel cestino, 30 giorni per ripristinarle.
                  </span>
                  <button onClick={removeFromAsana}
                    className="text-2xs font-bold text-error hover:opacity-80">Elimina</button>
                  <button onClick={() => setConfirmDel(false)}
                    className="text-2xs font-semibold text-text-secondary hover:text-text-primary">Annulla</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDel(true)} disabled={pending}
                  title="Cancella davvero le task su Asana. Finiscono nel cestino, non distrutte."
                  className="flex items-center gap-1.5 text-2xs font-semibold border border-error/50 text-error rounded-xl px-3 py-2 hover:bg-error-dim press disabled:opacity-40">
                  <Trash2 className="w-3.5 h-3.5" />Elimina su Asana
                </button>
              )}
            </div>
          )}

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
                        {r.completed && <span className="block text-2xs text-text-tertiary">completata su Asana</span>}
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
                        {/* §221 — un abbinamento dedotto si dichiara: «Industrial
                            Service and Facility» → «Industrial Service» è quasi
                            sempre giusto, ma quasi non è sempre. */}
                        {r.clientMatch === 'prefisso' && (
                          <span className="block text-2xs text-info normal-case">abbinato per prefisso</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-2xs">
                        <span className={r.profileId ? 'text-text-primary' : 'text-text-tertiary'}>
                          {r.assigneeEmail ?? '—'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-2xs tabular text-text-secondary">{r.dueOn ?? '—'}</td>
                      <td className="px-2 py-2">
                        {decisions.get(r.gid) ? (
                          <span className={`inline-flex items-center gap-1 text-2xs font-semibold px-1.5 py-0.5 rounded border ${DECISION_TONE[decisions.get(r.gid)!]}`}>
                            {DECISION_LABEL[decisions.get(r.gid)!]}
                          </span>
                        ) : done.has(r.gid) ? (
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

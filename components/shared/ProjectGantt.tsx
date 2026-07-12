'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { X, Flag, ExternalLink, Pencil, Check, Loader2 } from 'lucide-react'
import { isoLocal, type WLTask, type WLProject, type WLSprint } from '@/lib/workload'
import { usePortalRoutes } from '@/lib/portal-routes'
import { renameSprint, renameMilestone } from '@/app/actions/workload-sprints'

const STATUS_LABEL: Record<string, string> = {
  da_fare: 'Da fare', in_corso: 'In corso', in_revisione: 'In revisione', completato: 'Completato',
  pianificato: 'Pianificato',
}

/* ── Gantt di progetto su calendario: SOLO sprint + milestone ─────────────────── */
type GanttItem =
  | { kind: 'sprint'; id: string; title: string; start: string; end: string; status: string; tasks: number; done: number }
  | { kind: 'milestone'; id: string; title: string; start: string; end: string; status: string }

export function ProjectGantt({ project, sprints, milestones, tasks, editable, onItemClick }: {
  project: WLProject
  sprints: WLSprint[]
  milestones: WLTask[]
  tasks: WLTask[]
  editable: boolean
  /** Se presente (dominio progetto), il click porta all'elemento nella pagina invece
   *  di aprire il popup: siamo già nel progetto, un popup che rimanda qui è inutile. */
  onItemClick?: (item: { kind: 'sprint' | 'milestone'; id: string }) => void
}) {
  const { projectHref } = usePortalRoutes()
  const [detail, setDetail] = useState<GanttItem | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [savingName, startRename] = useTransition()
  // Rinomine applicate localmente (le date e le task collegate non cambiano mai).
  const [renamed, setRenamed] = useState<Record<string, string>>({})
  const todayStr = isoLocal(new Date())   // NON toISOString: in Europe/Rome sfaserebbe di un giorno

  const saveName = (item: GanttItem) => startRename(async () => {
    const name = draftName.trim()
    if (!name || name === item.title) { setRenaming(false); return }
    const res = item.kind === 'sprint'
      ? await renameSprint(project.id, item.id, name)
      : await renameMilestone(project.id, item.id, name)
    if ('error' in res) { toast.error(res.error); return }
    setRenamed(prev => ({ ...prev, [item.id]: name }))
    setDetail({ ...item, title: name })
    setRenaming(false)
    toast.success('Nome aggiornato')
  })

  const items: GanttItem[] = useMemo(() => {
    const s: GanttItem[] = sprints.map(sp => {
      const inSprint = tasks.filter(t => !t.is_milestone && t.due_date && t.due_date >= sp.start_date && t.due_date <= sp.end_date)
      return {
        kind: 'sprint', id: sp.id, title: renamed[sp.id] ?? sp.name, start: sp.start_date, end: sp.end_date, status: sp.status,
        tasks: inSprint.length, done: inSprint.filter(t => t.status === 'completato').length,
      }
    })
    const m: GanttItem[] = milestones.filter(x => x.due_date)
      .map(x => ({ kind: 'milestone', id: x.id, title: renamed[x.id] ?? x.title, start: x.due_date!, end: x.due_date!, status: x.status }))
    return [...s, ...m].sort((a, b) => a.start.localeCompare(b.start))
  }, [sprints, milestones, tasks, renamed])

  if (items.length === 0) {
    return (
      <div className="px-4 py-5 text-center">
        <p className="text-2xs text-text-tertiary">Nessuno sprint o milestone con date: il Gantt non è tracciabile.</p>
        <Link href={projectHref(project.client_id, project.id)} className="text-2xs text-gold-text hover:underline mt-1 inline-block">
          Apri il progetto per pianificarli →
        </Link>
      </div>
    )
  }

  // Calendario RESPONSIVE: tutto in % sulla stessa scala temporale, così si adatta alla
  // larghezza della card. Le colonne dei mesi hanno flex proporzionale ai giorni reali →
  // barre sprint e marker milestone cadono esattamente sotto la data corrispondente.
  const min = items.map(i => i.start).sort()[0]
  const max = items.map(i => i.end).sort().slice(-1)[0]
  const gStartD = new Date(min.slice(0, 8) + '01T00:00:00')                     // 1° del mese iniziale
  const lastD = new Date(max + 'T00:00:00')
  const gEndD = new Date(lastD.getFullYear(), lastD.getMonth() + 1, 0)          // ultimo giorno del mese finale
  const dayIdx = (iso: string) =>
    Math.round((new Date(iso + 'T00:00:00').getTime() - gStartD.getTime()) / 86400000)
  const totalDays = Math.max(1, dayIdx(isoLocal(gEndD)) + 1)
  const pctOf = (iso: string) => (dayIdx(iso) / totalDays) * 100                 // 0..100

  const months: { label: string; days: number }[] = []
  const cur = new Date(gStartD)
  while (cur <= gEndD && months.length < 24) {
    const dim = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()
    months.push({ label: cur.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }), days: dim })
    cur.setMonth(cur.getMonth() + 1)
  }

  const sprintCls = (s: GanttItem) => {
    if (s.status === 'completato') return 'bg-success/70 border-success'
    if (s.end < todayStr) return 'bg-error/60 border-error'
    if (s.status === 'in_corso') return 'bg-gold/70 border-gold'
    return 'bg-info/50 border-info'
  }
  const fmtD = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
  const showToday = todayStr >= isoLocal(gStartD) && todayStr <= isoLocal(gEndD)

  // Milestone su corsie: due marker vicini non si accavallano. La bandierina resta
  // SEMPRE sulla data esatta; è l'etichetta che si sposta (a destra, o a sinistra sul bordo).
  const ms = items.filter(i => i.kind === 'milestone').sort((a, b) => a.start.localeCompare(b.start))
  const LANE_GAP = 16                                     // % minima fra due etichette sulla stessa corsia
  const laneOf = new Map<string, number>()
  const laneLastX: number[] = []
  for (const m of ms) {
    const x = pctOf(m.start)
    let lane = laneLastX.findIndex(last => x - last >= LANE_GAP)
    if (lane === -1) { lane = laneLastX.length; laneLastX.push(x) }
    else laneLastX[lane] = x
    laneOf.set(m.id, lane)
  }
  const laneCount = Math.max(1, laneLastX.length)
  const sprintItems = items.filter(i => i.kind === 'sprint')
    .sort((a, b) => a.start.localeCompare(b.start))

  return (
    <div className="px-4 py-3">
      <div className="relative w-full">
        {/* Griglia mensile su tutta l'altezza: guida di lettura */}
        <div className="absolute inset-0 flex pointer-events-none" aria-hidden="true">
          {months.map((m, i) => (
            <div key={i} style={{ flexGrow: m.days, flexBasis: 0 }}
              className={`border-l border-border/60 first:border-l-0 ${i % 2 === 1 ? 'bg-surface-hover/30' : ''}`} />
          ))}
        </div>

        {/* Asse mesi */}
        <div className="relative flex border-b border-border pb-1 mb-2.5">
          {months.map((m, i) => (
            <div key={i} style={{ flexGrow: m.days, flexBasis: 0, minWidth: 0 }}
              className="text-2xs font-semibold text-text-tertiary capitalize pl-1.5 truncate">
              {m.label}
            </div>
          ))}
        </div>

        {/* Linea "oggi" — cade esattamente sulla data odierna */}
        {showToday && (
          <div className="absolute top-4 bottom-0 w-px bg-error/70 z-20 pointer-events-none" style={{ left: `${pctOf(todayStr)}%` }}>
            <span className="absolute -top-4 left-1 text-2xs text-error font-bold whitespace-nowrap">oggi</span>
          </div>
        )}

        {/* Sprint: una riga ciascuno, con avanzamento riempito nella barra */}
        <div className="relative space-y-1.5">
          {sprintItems.map(sp => {
            const left = pctOf(sp.start)
            const width = Math.max(3, pctOf(sp.end) + (100 / totalDays) - left)
            const progress = sp.kind === 'sprint' && sp.tasks > 0 ? Math.round((sp.done / sp.tasks) * 100) : 0
            return (
              <div key={sp.id} className="relative h-7">
                <button onClick={() => onItemClick ? onItemClick({ kind: 'sprint', id: sp.id }) : setDetail(sp)}
                  title={`Sprint: ${sp.title}\n${fmtD(sp.start)} → ${fmtD(sp.end)}\nStato: ${STATUS_LABEL[sp.status] ?? sp.status}${sp.kind === 'sprint' ? `\nTask: ${sp.done}/${sp.tasks} completate (${progress}%)` : ''}`}
                  className={`absolute h-7 rounded-md border flex items-center overflow-hidden hover:brightness-110 hover:ring-1 hover:ring-gold transition-all ${sprintCls(sp)}`}
                  style={{ left: `${left}%`, width: `${width}%` }}>
                  {/* Riempimento = avanzamento reale */}
                  {progress > 0 && (
                    <span className="absolute inset-y-0 left-0 bg-overlay/20 pointer-events-none" style={{ width: `${progress}%` }} aria-hidden="true" />
                  )}
                  <span className="relative flex items-center gap-1.5 px-2 w-full">
                    <span className="text-2xs font-semibold text-text-primary truncate">{sp.title}</span>
                    {sp.kind === 'sprint' && sp.tasks > 0 && (
                      <span className="text-2xs text-text-primary/70 tabular ml-auto shrink-0">{progress}%</span>
                    )}
                  </span>
                </button>
              </div>
            )
          })}
          {sprintItems.length === 0 && (
            <p className="text-2xs text-text-tertiary py-1">Nessuno sprint pianificato.</p>
          )}
        </div>

        {/* Milestone: bandierina ANCORATA alla data, etichetta accanto */}
        {ms.length > 0 && (
          <div className="relative mt-2.5 border-t border-border pt-2" style={{ height: laneCount * 30 + 6 }}>
            {ms.map(m => {
              const done = m.status === 'completato'
              const late = !done && m.start < todayStr
              const lane = laneOf.get(m.id) ?? 0
              const x = pctOf(m.start)
              const flip = x > 72                       // vicino al bordo destro: etichetta a sinistra
              return (
                // Punto largo 0 sulla data esatta: nulla lo sposta.
                <div key={m.id} className="absolute" style={{ left: `${x}%`, top: lane * 30, width: 0 }}>
                  <button onClick={() => onItemClick ? onItemClick({ kind: 'milestone', id: m.id }) : setDetail(m)}
                    title={`Milestone: ${m.title}\nData: ${fmtD(m.start)}\nStato: ${done ? 'Completata' : late ? 'In ritardo' : 'Da fare'}`}
                    className={`absolute flex items-center gap-1 hover:brightness-125 transition-all whitespace-nowrap ${
                      flip ? 'right-0 flex-row-reverse pr-1' : 'left-0 pl-1'
                    }`}>
                    <Flag className={`w-3 h-3 shrink-0 ${done ? 'text-success' : late ? 'text-error' : 'text-gold-text'}`} aria-hidden="true" />
                    <span className="flex flex-col leading-tight text-left">
                      <span className={`text-2xs font-semibold ${late ? 'text-error' : 'text-text-primary'}`}>{fmtD(m.start)}</span>
                      <span className="text-2xs text-text-tertiary max-w-[8rem] truncate">{m.title}</span>
                    </span>
                  </button>
                  {/* Tacca verticale che àncora la bandierina alla data */}
                  <span className={`absolute top-0 w-px h-3 ${done ? 'bg-success/50' : late ? 'bg-error/50' : 'bg-gold/50'}`} aria-hidden="true" />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Popup dettaglio: sprint o milestone → CTA alla sezione dedicata */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-surface border border-border rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-2xs uppercase tracking-wider text-text-tertiary">
                  {detail.kind === 'sprint' ? 'Sprint' : 'Milestone'} · {project.name}
                </p>
                {/* Rinomina: cambia SOLO il nome. Date, stato e task collegate restano invariati. */}
                {renaming && editable ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <input autoFocus value={draftName} onChange={e => setDraftName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveName(detail); if (e.key === 'Escape') setRenaming(false) }}
                      aria-label="Nome"
                      className="flex-1 bg-background border border-border-interactive rounded-lg px-2 py-1 text-sm font-bold text-text-primary focus:outline-none focus:border-gold/50" />
                    <button onClick={() => saveName(detail)} disabled={savingName} aria-label="Salva nome"
                      className="p-1 text-gold-text hover:bg-surface-hover rounded">
                      {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setRenaming(false)} aria-label="Annulla" className="p-1 text-text-tertiary hover:text-text-primary rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5 group">
                    <h3 className="text-base font-bold text-text-primary truncate">{detail.title}</h3>
                    {editable && (
                      <button onClick={() => { setDraftName(detail.title); setRenaming(true) }}
                        aria-label="Rinomina" title="Rinomina (non tocca le task collegate)"
                        className="p-1 text-text-tertiary hover:text-gold-text opacity-0 group-hover:opacity-100 transition-opacity">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => setDetail(null)} aria-label="Chiudi" className="p-1 text-text-tertiary hover:text-text-primary shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-text-tertiary">{detail.kind === 'sprint' ? 'Periodo' : 'Data'}</dt>
                <dd className="text-text-primary font-medium">
                  {detail.kind === 'sprint'
                    ? `${new Date(detail.start + 'T00:00:00').toLocaleDateString('it-IT')} → ${new Date(detail.end + 'T00:00:00').toLocaleDateString('it-IT')}`
                    : new Date(detail.start + 'T00:00:00').toLocaleDateString('it-IT')}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-tertiary">Stato</dt>
                <dd className="text-text-primary font-medium">{STATUS_LABEL[detail.status] ?? detail.status}</dd>
              </div>
              {detail.kind === 'sprint' && (
                <div className="flex justify-between">
                  <dt className="text-text-tertiary">Task</dt>
                  <dd className="text-text-primary font-medium">{detail.done}/{detail.tasks} completate</dd>
                </div>
              )}
            </dl>
            <Link href={projectHref(project.client_id, project.id)}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-gold text-on-gold text-sm font-bold rounded-xl hover:bg-gold/90 transition-colors">
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              Apri nel progetto
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

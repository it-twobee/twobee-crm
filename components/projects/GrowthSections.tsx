'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw, Plus, X, Check, Pause, Play, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import {
  listRoutines, seedRoutines, generateOccurrences, closeSkippedOccurrences,
  updateRoutine, updateOccurrence, listInitiatives, createInitiative,
  type RoutineRow, type InitiativeRow,
} from '@/app/actions/growth-routines'
import { focusOf, KPI_BY_FOCUS, type RoutineFrequency } from '@/lib/growth-routines'
import type { Task, Profile } from '@/lib/types/database'
import { LeadsSection } from './LeadsSection'

/**
 * Le tre aree operative di un progetto Growth (§9.2): Routine ricorrenti,
 * Iniziative una tantum e la Panoramica che le riassume.
 *
 * Un progetto Growth non è una sequenza infinita di sprint identici: la
 * ricorrenza è una REGOLA (growth_routines) e le occorrenze sono task reali con
 * `routine_id` + `period_key`. "Modifica solo questa" tocca la task, "modifica
 * tutte le prossime" tocca la regola — mai un comportamento implicito.
 */

const FREQ_LABEL: Record<string, string> = {
  settimanale: 'Settimanale', quindicinale: 'Quindicinale',
  mensile: 'Mensile', trimestrale: 'Trimestrale',
}

const FOCUS_LABEL: Record<string, string> = {
  ecommerce: 'E-commerce', lead_gen: 'Lead generation', generico: 'Growth generico',
}

type Section = 'panoramica' | 'routine' | 'iniziative' | 'lead'

interface Props {
  projectId: string
  projectType: string | null
  clientId: string
  tasks: Task[]
  profiles: Pick<Profile, 'id' | 'full_name'>[]
  canEdit: boolean
}

export function GrowthSections({ projectId, projectType, clientId, tasks, profiles, canEdit }: Props) {
  const [section, setSection] = useState<Section>('panoramica')
  const [routines, setRoutines] = useState<RoutineRow[]>([])
  const [initiatives, setInitiatives] = useState<InitiativeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const focus = focusOf(projectType)

  const load = useCallback(async () => {
    setLoading(true)
    const [r, i] = await Promise.all([listRoutines(projectId), listInitiatives(projectId)])
    if (!r.ok) toast.error(r.error ?? 'Errore routine')
    setRoutines(r.routines)
    setInitiatives(i.initiatives)
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  // Le occorrenze sono task normali con routine_id: arrivano già col progetto.
  const occurrences = tasks.filter(t => (t as Task & { routine_id?: string | null }).routine_id)
  const today = new Date().toISOString().slice(0, 10)
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  const openOcc = occurrences.filter(t => t.status !== 'completato' && t.status !== 'non_svolta')
  const thisWeek = openOcc.filter(t => t.due_date && t.due_date >= today && t.due_date <= weekEnd)
  const overdue = openOcc.filter(t => t.due_date && t.due_date < today)
  const skipped = occurrences.filter(t => t.status === 'non_svolta')
  const activeRoutines = routines.filter(r => r.is_active)

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: (r: never) => string) => {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
    toast.success(msg(res as never))
    load()
  }

  const doSeed = () => run(
    () => seedRoutines(projectId),
    (r: { created: number }) => r.created > 0 ? `${r.created} routine create` : 'Routine già presenti',
  )
  const doGenerate = () => run(
    () => generateOccurrences(projectId, 30),
    (r: { created: number }) => r.created > 0 ? `${r.created} occorrenze generate` : 'Nessuna nuova occorrenza: erano già tutte lì',
  )
  const doClose = () => run(
    () => closeSkippedOccurrences(projectId),
    (r: { closed: number }) => r.closed > 0 ? `${r.closed} occorrenze chiuse come non svolte` : 'Niente da chiudere',
  )

  const SECTIONS: { key: Section; label: string; badge?: number }[] = [
    { key: 'panoramica', label: 'Panoramica' },
    { key: 'routine', label: 'Routine', badge: activeRoutines.length || undefined },
    { key: 'iniziative', label: 'Iniziative', badge: initiatives.filter(i => i.status !== 'completata').length || undefined },
    // Solo dove ha senso: un e-commerce avrà la sezione Negozio (Shopify).
    ...(focus === 'lead_gen' ? [{ key: 'lead' as Section, label: 'Lead' }] : []),
  ]

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary py-10 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          {SECTIONS.map(s => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={`text-sm font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                section === s.key
                  ? 'bg-surface-active text-text-primary border-border-strong'
                  : 'bg-transparent text-text-secondary border-border hover:text-text-primary'
              }`}>
              {s.label}
              {s.badge != null && <span className="ml-1.5 text-2xs text-text-tertiary">{s.badge}</span>}
            </button>
          ))}
        </div>
        <span className="text-2xs text-text-tertiary">Focus: {FOCUS_LABEL[focus]}</span>
      </div>

      {section === 'panoramica' && (
        <Panoramica
          focus={focus} routines={activeRoutines} thisWeek={thisWeek}
          overdue={overdue} skipped={skipped} initiatives={initiatives}
          onGoRoutine={() => setSection('routine')}
        />
      )}

      {section === 'routine' && (
        <RoutineList
          routines={routines} occurrences={occurrences} profiles={profiles}
          canEdit={canEdit} busy={busy}
          onSeed={doSeed} onGenerate={doGenerate} onClose={doClose}
          onToggle={async (r) => {
            const res = await updateRoutine(r.id, projectId, { is_active: !r.is_active })
            if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
            toast.success(r.is_active ? 'Routine sospesa' : 'Routine riattivata')
            load()
          }}
          onOccurrenceDone={async (t) => {
            const res = await updateOccurrence(t.id, { status: t.status === 'completato' ? 'da_fare' : 'completato' })
            if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
            load()
          }}
        />
      )}

      {section === 'lead' && (
        <LeadsSection clientId={clientId} projectId={projectId} canEdit={canEdit} />
      )}

      {section === 'iniziative' && (
        <Initiatives
          projectId={projectId} initiatives={initiatives} profiles={profiles}
          canEdit={canEdit} onDone={load}
        />
      )}
    </div>
  )
}

// ─── Panoramica ─────────────────────────────────────────────────────────────

function Panoramica({ focus, routines, thisWeek, overdue, skipped, initiatives, onGoRoutine }: {
  focus: string; routines: RoutineRow[]; thisWeek: Task[]; overdue: Task[]
  skipped: Task[]; initiatives: InitiativeRow[]; onGoRoutine: () => void
}) {
  const kpis = KPI_BY_FOCUS[focus as keyof typeof KPI_BY_FOCUS] ?? []
  const activeInit = initiatives.filter(i => i.status === 'in_corso' || i.status === 'pianificata')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Routine attive" value={routines.length} hint="Regole ricorrenti" />
        <Stat label="Questa settimana" value={thisWeek.length} hint="Occorrenze da svolgere" />
        <Stat label="Scadute" value={overdue.length} hint="Da recuperare"
          accent={overdue.length > 0 ? 'text-error' : undefined} />
        <Stat label="Iniziative attive" value={activeInit.length} hint="Lavori una tantum" />
      </div>

      {overdue.length > 0 && (
        <button onClick={onGoRoutine}
          className="w-full text-left bg-error-dim border border-error/30 rounded-2xl p-4 hover:opacity-90 transition-opacity">
          <p className="text-sm font-semibold text-error">{overdue.length} routine scadute</p>
          <p className="text-2xs text-text-secondary mt-0.5">
            {overdue.slice(0, 3).map(t => t.title).join(' · ')}
            {overdue.length > 3 && ` e altre ${overdue.length - 3}`}
          </p>
        </button>
      )}

      {skipped.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-sm font-semibold text-text-primary">{skipped.length} routine non svolte</p>
          <p className="text-2xs text-text-tertiary mt-0.5">
            Chiuse automaticamente al passaggio del periodo. È il tasso di esecuzione reale su questo cliente.
          </p>
        </div>
      )}

      <div className="bg-surface border border-border rounded-2xl p-5">
        <p className="text-sm font-bold text-text-primary mb-1">KPI di riferimento</p>
        <p className="text-2xs text-text-tertiary mb-3">
          Selezionati in base al focus del progetto: un {focus === 'ecommerce' ? 'e-commerce non guarda il costo per lead' : 'progetto lead gen non guarda il valore medio ordine'}.
        </p>
        <div className="flex flex-wrap gap-2">
          {kpis.map(k => (
            <span key={k.key} className="text-2xs font-semibold px-2 py-1 rounded-lg bg-background border border-border text-text-secondary">
              {k.label}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-5">
        <p className="text-sm font-bold text-text-primary mb-2">Prossime attività</p>
        {thisWeek.length === 0 ? (
          <p className="text-2xs text-text-tertiary">Nessuna routine in scadenza questa settimana.</p>
        ) : (
          <ul className="space-y-1.5">
            {thisWeek.slice(0, 6).map(t => (
              <li key={t.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-primary truncate">{t.title}</span>
                <span className="text-2xs text-text-tertiary shrink-0">
                  {t.due_date && new Date(t.due_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, hint, accent = 'text-text-primary' }: {
  label: string; value: number; hint: string; accent?: string
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <p className="text-2xs text-text-tertiary">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${accent}`}>{value}</p>
      <p className="text-2xs text-text-tertiary mt-0.5">{hint}</p>
    </div>
  )
}

// ─── Routine ────────────────────────────────────────────────────────────────

function RoutineList({ routines, occurrences, canEdit, busy, onSeed, onGenerate, onClose, onToggle, onOccurrenceDone }: {
  routines: RoutineRow[]; occurrences: Task[]; profiles: Pick<Profile, 'id' | 'full_name'>[]
  canEdit: boolean; busy: boolean
  onSeed: () => void; onGenerate: () => void; onClose: () => void
  onToggle: (r: RoutineRow) => void
  onOccurrenceDone: (t: Task) => void
}) {
  const [tab, setTab] = useState<'settimana' | 'scadute' | 'regole'>('settimana')
  const today = new Date().toISOString().slice(0, 10)
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  const open = occurrences.filter(t => t.status !== 'completato' && t.status !== 'non_svolta')
  const week = open.filter(t => t.due_date && t.due_date >= today && t.due_date <= weekEnd)
  const late = open.filter(t => t.due_date && t.due_date < today)

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onSeed} disabled={busy}
            className="flex items-center gap-1.5 bg-gold text-on-gold text-sm font-semibold px-3 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
            <Sparkles className="w-4 h-4" /> Crea routine di default
          </button>
          <button onClick={onGenerate} disabled={busy || routines.length === 0}
            className="flex items-center gap-1.5 bg-surface border border-border text-text-primary text-sm font-semibold px-3 py-2 rounded-lg hover:bg-surface-hover disabled:opacity-50 transition-colors">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Genera prossimi 30 giorni
          </button>
          <button onClick={onClose} disabled={busy}
            className="flex items-center gap-1.5 bg-transparent border border-border text-text-secondary text-sm px-3 py-2 rounded-lg hover:text-text-primary disabled:opacity-50 transition-colors">
            Chiudi le saltate
          </button>
        </div>
      )}

      <p className="text-2xs text-text-tertiary">
        La generazione è sicura da ripetere: ogni occorrenza è unica per routine e periodo,
        quindi rilanciarla non crea doppioni.
      </p>

      <div className="flex items-center gap-1.5">
        {([
          { k: 'settimana' as const, l: `Questa settimana (${week.length})` },
          { k: 'scadute' as const, l: `Scadute (${late.length})` },
          { k: 'regole' as const, l: `Regole (${routines.length})` },
        ]).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`text-2xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
              tab === t.k ? 'bg-surface-active text-text-primary border-border-strong'
                : 'bg-transparent text-text-secondary border-border hover:text-text-primary'
            }`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'regole' ? (
        routines.length === 0 ? (
          <Empty text="Nessuna routine configurata." hint="Usa «Crea routine di default»: il set dipende dal focus del progetto." />
        ) : (
          <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
            {routines.map(r => (
              <div key={r.id} className={`p-3 flex items-center gap-3 ${r.is_active ? '' : 'opacity-55'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary">{r.title}</p>
                  <p className="text-2xs text-text-tertiary">
                    {FREQ_LABEL[r.frequency]} · {r.default_estimated_hours}h
                    {!r.is_active && ' · sospesa'}
                  </p>
                </div>
                {canEdit && (
                  <button onClick={() => onToggle(r)}
                    aria-label={r.is_active ? 'Sospendi routine' : 'Riattiva routine'}
                    className="p-1.5 rounded hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors">
                    {r.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        (() => {
          const list = tab === 'settimana' ? week : late
          if (list.length === 0) {
            return <Empty
              text={tab === 'settimana' ? 'Nessuna routine in scadenza questa settimana.' : 'Nessuna routine scaduta.'}
              hint={routines.length === 0 ? 'Configura prima le routine.' : 'Genera le occorrenze se non le vedi.'} />
          }
          return (
            <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
              {list.map(t => (
                <div key={t.id} className="p-3 flex items-center gap-3">
                  {canEdit && (
                    <button onClick={() => onOccurrenceDone(t)} aria-label="Segna come svolta"
                      className="w-4 h-4 rounded border border-border-strong hover:border-success shrink-0 flex items-center justify-center transition-colors">
                      {t.status === 'completato' && <Check className="w-3 h-3 text-success" />}
                    </button>
                  )}
                  <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{t.title}</span>
                  <span className={`text-2xs shrink-0 ${tab === 'scadute' ? 'text-error font-semibold' : 'text-text-tertiary'}`}>
                    {t.due_date && new Date(t.due_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          )
        })()
      )}
    </div>
  )
}

// ─── Iniziative ─────────────────────────────────────────────────────────────

function Initiatives({ projectId, initiatives, profiles, canEdit, onDone }: {
  projectId: string; initiatives: InitiativeRow[]
  profiles: Pick<Profile, 'id' | 'full_name'>[]; canEdit: boolean; onDone: () => void
}) {
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', start_date: '', end_date: '', budget: '', owner_id: '' })

  const inputCls = 'w-full bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/50'

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Serve un nome'); return }
    setSaving(true)
    const res = await createInitiative({
      project_id: projectId, name: form.name, description: form.description || null,
      start_date: form.start_date || null, end_date: form.end_date || null,
      budget: form.budget ? parseFloat(form.budget) : null,
      owner_id: form.owner_id || null,
    })
    setSaving(false)
    if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
    toast.success('Iniziativa creata')
    setShow(false)
    setForm({ name: '', description: '', start_date: '', end_date: '', budget: '', owner_id: '' })
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xs text-text-tertiary max-w-lg">
          Attività Growth non ricorrenti: nuova campagna, lancio prodotto, landing, shooting,
          test di mercato. Hanno un inizio e una fine, a differenza delle routine.
        </p>
        {canEdit && (
          <button onClick={() => setShow(v => !v)}
            className="flex items-center gap-1.5 bg-gold text-on-gold text-sm font-semibold px-3 py-2 rounded-lg hover:opacity-90 transition-opacity shrink-0">
            {show ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {show ? 'Annulla' : 'Nuova iniziativa'}
          </button>
        )}
      </div>

      {show && canEdit && (
        <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Nome dell'iniziativa" className={inputCls} />
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Obiettivo (facoltativo)" className={inputCls} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Inizio</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Fine</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Budget (€)</label>
              <input type="number" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-2xs text-text-tertiary mb-1.5">Responsabile</label>
              <select value={form.owner_id} onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))} className={inputCls}>
                <option value="">Nessuno</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? '—'}</option>)}
              </select>
            </div>
          </div>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-2 bg-gold text-on-gold text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Crea iniziativa
          </button>
        </div>
      )}

      {initiatives.length === 0 ? (
        <Empty text="Nessuna iniziativa." hint="Le attività una tantum vivono qui, separate dalle routine." />
      ) : (
        <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
          {initiatives.map(i => (
            <div key={i.id} className="p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[12rem]">
                <p className="text-sm text-text-primary">{i.name}</p>
                <p className="text-2xs text-text-tertiary">
                  {i.start_date ?? '—'} → {i.end_date ?? 'in corso'}
                  {i.budget != null && ` · ${formatCurrency(Number(i.budget))}`}
                </p>
              </div>
              <span className="text-2xs px-2 py-0.5 rounded bg-surface-active text-text-secondary shrink-0">
                {i.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Empty({ text, hint }: { text: string; hint: string }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-6 text-center">
      <p className="text-sm text-text-secondary">{text}</p>
      <p className="text-2xs text-text-tertiary mt-1">{hint}</p>
    </div>
  )
}

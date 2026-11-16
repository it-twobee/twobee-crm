'use client'

import { useState } from 'react'
import { Repeat, Pencil, Trash2 } from 'lucide-react'
import { nextOccurrence, ruleLabel, monthlyVolume, occurrencesBetween } from '@/lib/recurrence'
import { SuggerimentiModello } from '@/components/projects/WorkstreamPresets'
import type { ModelloNodo } from '@/lib/workstream-presets'
import { Segmented, inputCls } from '@/components/shared/formkit'
import type { RecurrenceFrequency } from '@/lib/types/database'

/* §501 — la riga e il modulo di una ricorrente, fuori dalla pagina della
   corsia: li usa anche la sezione Task per le serie ad hoc, e una seconda
   copia avrebbe preso la sua strada al primo ritocco. */

type Person = { id: string; full_name: string; avatar_url: string | null }

// ── Ricorrenti (riuso semantica dell'editor) ────────────────────────────────
const FREQ: { key: RecurrenceFrequency; label: string }[] = [
  { key: 'daily', label: 'Giornaliera' }, { key: 'weekly', label: 'Settimanale' },
  { key: 'biweekly', label: 'Quindicinale' }, { key: 'monthly', label: 'Mensile' }, { key: 'quarterly', label: 'Trimestrale' },
]
const FREQ_LABEL: Record<string, string> = Object.fromEntries(FREQ.map(f => [f.key, f.label]))
const WEEKDAYS = [['Lun', 1], ['Mar', 2], ['Mer', 3], ['Gio', 4], ['Ven', 5], ['Sab', 6], ['Dom', 0]] as const
export type RecInput = {
  title: string; frequency: RecurrenceFrequency; interval: number
  weekdays: number[]; day_of_month: number | null
  /** §338 — da quando, e fino a quando. Su una tappa è la domanda principale */
  start_date: string; end_date: string | null
  owner_id: string | null; visibility: 'internal' | 'client_visible'
}

/**
 * §338 — La riga di una ricorrente, editabile dove la si legge.
 *
 * Diceva titolo e frequenza, e tutto il resto stava dietro una matita che
 * compariva solo passandoci sopra: il responsabile — cioè la sola cosa che
 * decide se l'occorrenza arriverà a qualcuno in «le mie attività» — non era
 * nemmeno visibile. §346 — e da lì una regola senza responsabile **non genera
 * affatto**: il motore la salta, perché materializzarla vuol dire fabbricare
 * una riga al giorno che nessuno raccoglie. Assegnarla è il gesto che la
 * accende, e rigenera subito.
 *
 * Adesso la riga dice **chi, ogni quanto, la prossima volta e quante ne fa**, e
 * le due cose che si cambiano di continuo — responsabile e pausa — si toccano
 * sul posto. La matita resta per il resto (titolo, giorni, visibilità) ed è
 * **sempre visibile**: un controllo che appare al passaggio del mouse non
 * esiste per chi non sa di doverlo cercare, e su un touch non esiste affatto.
 */
export function RecurringRow({
  id, title, contesto, rule, active, visibility, ownerId, accent, Icon,
  profiles, canEdit, pending, onOwner, onToggle, onEdit, onDelete,
}: {
  id: string
  title: string
  /** §501 — dove sta, quando la riga non è dentro la sua corsia: il cliente di
      una serie ad hoc, o «nessun cliente» */
  contesto?: string
  rule: { frequency: RecurrenceFrequency; interval: number; weekdays: number[] | null; day_of_month: number | null; start_date: string; end_date: string | null }
  active: boolean
  visibility: 'internal' | 'client_visible'
  ownerId: string | null
  accent: string
  Icon: typeof Repeat
  profiles: Person[]
  canEdit: boolean
  pending: boolean
  onOwner: (v: string | null) => void
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const oggi = new Date().toISOString().slice(0, 10)
  const prossima = active ? nextOccurrence(rule, oggi) : null
  const quante = active ? monthlyVolume(rule, oggi) : 0
  const giorno = (v: string) =>
    new Date(`${v}T00:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

  return (
    <div className={`flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0 ${active ? '' : 'opacity-60'}`}>
      <Icon className={`w-3.5 h-3.5 shrink-0 ${accent}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-text-primary truncate">{title}</span>
        <span className="block text-2xs text-text-tertiary truncate">
          {contesto && <>{contesto} · </>}
          {ruleLabel(rule)}
          {prossima
            ? <> · prossima <strong className="text-text-secondary">{giorno(prossima)}</strong>
              {quante > 1 && <> · {quante} al mese</>}</>
            : active
              ? <> · <span className="text-warning">nessuna data in arrivo</span></>
              : <> · in pausa</>}
        </span>
      </span>

      {/* §338 — il responsabile **sulla riga**: è quello che decide se
          l'occorrenza arriverà a qualcuno, e stava dietro una matita nascosta.
          §346 — senza, la regola resta **ferma**: il motore la salta, e questa
          select è il gesto che la accende. Il bordo giallo dice che è spenta. */}
      <select value={ownerId ?? ''} disabled={!canEdit || pending}
        aria-label={`Responsabile di ${title}`}
        onChange={e => onOwner(e.target.value || null)}
        className={`shrink-0 text-2xs rounded-lg px-1.5 py-1 border bg-background max-w-[130px]
          ${ownerId ? 'border-border text-text-secondary' : 'border-warning/40 text-warning'}`}>
        <option value="">nessuno · ferma</option>
        {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>

      {visibility === 'client_visible' && (
        <span className="text-2xs text-info shrink-0" title="Visibile nel portale del cliente">cliente</span>
      )}
      {canEdit && (
        <>
          <button onClick={onToggle} disabled={pending}
            className="text-2xs text-text-tertiary hover:text-gold-text shrink-0 disabled:opacity-40">
            {active ? 'Pausa' : 'Attiva'}
          </button>
          <button onClick={onEdit} aria-label={`Modifica ${title}`}
            className="text-text-tertiary hover:text-text-primary shrink-0"><Pencil className="w-3 h-3" /></button>
          <button onClick={onDelete} aria-label={`Elimina ${title}`}
            className="text-text-tertiary hover:text-error shrink-0"><Trash2 className="w-3 h-3" /></button>
        </>
      )}
    </div>
  )
}

export function RecurringForm({ initial, profiles, pending, modelli = [], visibilita = true, onSave, onCancel }: {
  initial?: RecInput; profiles: Person[]; pending: boolean
  /** §501 — senza cliente non c'è un portale dove mostrarla: la scelta non si offre */
  visibilita?: boolean
  /** §405 — le ricorrenti che questo servizio ha di solito: riempiono il modulo */
  modelli?: ModelloNodo[]
  onSave: (v: RecInput) => void; onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(initial?.frequency ?? 'weekly')
  const [interval, setIntv] = useState(initial?.interval ?? 1)
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? [1])
  const [dom, setDom] = useState<number | null>(initial?.day_of_month ?? 1)
  const [ownerId, setOwnerId] = useState(initial?.owner_id ?? '')
  const [visibility, setVisibility] = useState<'internal' | 'client_visible'>(initial?.visibility ?? 'internal')
  const oggi = new Date().toISOString().slice(0, 10)
  const [start, setStart] = useState(initial?.start_date ?? oggi)
  const [end, setEnd] = useState(initial?.end_date ?? '')
  const needsWeekdays = frequency === 'weekly' || frequency === 'biweekly'
  const needsDom = frequency === 'monthly' || frequency === 'quarterly'
  const value: RecInput = {
    title, frequency, interval,
    weekdays: needsWeekdays ? weekdays : [], day_of_month: needsDom ? dom : null,
    start_date: start || oggi, end_date: end || null,
    owner_id: ownerId || null, visibility,
  }
  /* §338 — **cosa produrrà, prima di salvare.** Una regola si scrive a parole e
     si legge in date: «ogni due settimane di lunedì» non dice se la prima cade
     domani o fra dodici giorni, e una ricorrenza che sforna trenta righe invece
     di una si scopre quando il calendario è già pieno. */
  const prossime = occurrencesBetween(value, start || oggi,
    new Date(Date.parse(`${start || oggi}T00:00:00Z`) + 92 * 86400000).toISOString().slice(0, 10), 3)
  const alMese = monthlyVolume(value, start || oggi)
  const submit = () => onSave(value)
  return (
    <div className="bg-background border border-gold/30 rounded-xl p-3 space-y-2.5 my-1">
      {!initial && modelli.length > 0 && (
        <SuggerimentiModello voci={modelli} etichetta="Le ricorrenti di questo servizio"
          onPick={m => {
            setTitle(m.nome)
            if (m.frequenza) setFrequency(m.frequenza as RecurrenceFrequency)
          }} />
      )}
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
      <input value={title} onChange={e => setTitle(e.target.value)} autoFocus aria-label="Titolo ricorrente"
        placeholder="Titolo (es. Check Ads)" className={inputCls} />
      <div className="flex items-center gap-2 flex-wrap">
        <select value={frequency} onChange={e => setFrequency(e.target.value as RecurrenceFrequency)} aria-label="Frequenza" className="bg-surface border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary">
          {FREQ.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <label className="flex items-center gap-1 text-2xs text-text-tertiary">ogni
          <input type="number" min={1} value={interval} onChange={e => setIntv(Math.max(1, Number(e.target.value)))} aria-label="Intervallo" className="w-12 bg-surface border border-border-interactive rounded px-1.5 py-1 text-2xs text-text-primary text-center" />
          {frequency === 'daily' ? 'giorni' : frequency === 'monthly' ? 'mesi' : frequency === 'quarterly' ? 'trimestri' : 'settimane'}
        </label>
      </div>
      {needsWeekdays && (
        <div className="flex items-center gap-1 flex-wrap">
          {WEEKDAYS.map(([lab, n]) => (
            <button key={n} type="button" onClick={() => setWeekdays(w => w.includes(n) ? w.filter(x => x !== n) : [...w, n])}
              className={`text-2xs font-semibold px-2 py-1 rounded-lg border ${weekdays.includes(n) ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:bg-surface-hover'}`}>{lab}</button>
          ))}
        </div>
      )}
      {needsDom && (
        <label className="flex items-center gap-1.5 text-2xs text-text-tertiary">Giorno del mese
          <input type="number" min={1} max={31} value={dom ?? 1} onChange={e => setDom(Number(e.target.value))} className="w-14 bg-surface border border-border-interactive rounded px-1.5 py-1 text-2xs text-text-primary text-center" /></label>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={ownerId} onChange={e => setOwnerId(e.target.value)} aria-label="Responsabile" className="bg-surface border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary">
          <option value="">Responsabile…</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        {visibilita && (
          <Segmented ariaLabel="Visibilità" value={visibility} onChange={setVisibility}
            options={[{ value: 'internal', label: 'Interna' }, { value: 'client_visible', label: 'Cliente' }]} />
        )}
      </div>
      {/* §338 — da quando parte e quando finisce: su una tappa ricorrente è la
          domanda principale («la review parte da gennaio»), e non c'era. Senza
          fine la serie continua, ed è il caso normale. */}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-1.5 text-2xs text-text-tertiary">Dal
          <input type="date" value={start} onChange={e => setStart(e.target.value)}
            aria-label="Prima data utile"
            className="flex-1 bg-surface border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary" /></label>
        <label className="flex items-center gap-1.5 text-2xs text-text-tertiary">Fino al
          <input type="date" value={end} onChange={e => setEnd(e.target.value)}
            aria-label="Ultima data utile (facoltativa)" placeholder="senza fine"
            className="flex-1 bg-surface border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary" /></label>
      </div>

      <p className="text-2xs text-text-tertiary bg-surface border border-border rounded-lg px-2.5 py-1.5">
        {prossime.length === 0
          ? <span className="text-warning">Questa regola non produce nessuna data: controlla frequenza e periodo.</span>
          : <>
            <strong className="text-text-secondary">{ruleLabel(value)}</strong>
            {' · '}prossime: {prossime.map(d =>
              new Date(`${d}T00:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })).join(' · ')}
            {alMese > 0 && <> · {alMese} al mese</>}
          </>}
      </p>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-2xs font-semibold text-text-secondary px-2.5 py-1.5">Annulla</button>
        <button onClick={submit} disabled={pending || !title.trim()} className="text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg disabled:opacity-40">Salva</button>
      </div>
    </div>
  )
}

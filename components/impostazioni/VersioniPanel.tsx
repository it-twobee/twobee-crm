'use client'

import { useState, useTransition } from 'react'
import {
  Sparkles, Plus, Check, X, Loader2, Trash2, Pencil, Database, AlertTriangle,
  ChevronDown, ArrowRight, CalendarClock, Send, Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  createVersion, updateVersion, publishVersion, unpublishVersion, deleteVersion,
  addChange, updateChange, deleteChange, type ChangeInput,
} from '@/app/actions/os-versions'
import {
  CHANGE_KINDS, cycleOf, daysLeftInCycle, parseVersion, compareVersions, formatVersion,
  nextVersion, countByKind, CYCLE_DAYS, type ChangeKind,
} from '@/lib/os-version'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { OsVersion, OsVersionChange, Profile } from '@/lib/types/database'

type VersionRow = OsVersion & { changes: OsVersionChange[] }

const KIND_STYLE: Record<ChangeKind, string> = {
  novita:        'bg-accent/15 text-accent border-accent/30',
  miglioramento: 'bg-info/15 text-info border-info/30',
  correzione:    'bg-warning-dim text-warning border-warning/30',
  rimozione:     'bg-surface-active text-text-secondary border-border',
  sicurezza:     'bg-gold-dim text-gold-text border-gold/30',
}

const IMPACT_DOT: Record<string, string> = { alto: 'bg-error', medio: 'bg-warning', basso: 'bg-text-tertiary' }

const AREAS = ['Clienti', 'Progetti', 'Economics', 'Costi', 'Fiscale', 'Workload', 'Workspace', 'Chat', 'Cronologia', 'Sicurezza', 'Generale']

const dateIt = (d: string | null) => d ? new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : null

const input = 'w-full bg-background border border-border-interactive rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/40'

function Notice() {
  return (
    <div className="rounded-2xl border border-warning/30 bg-warning-dim p-5">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
        <h2 className="text-sm font-bold text-text-primary">Registro delle versioni non ancora attivo</h2>
      </div>
      <p className="text-xs text-text-secondary mb-3">
        Le tabelle <code className="text-2xs bg-surface px-1.5 py-0.5 rounded border border-border">os_versions</code> e{' '}
        <code className="text-2xs bg-surface px-1.5 py-0.5 rounded border border-border">os_version_changes</code> non
        esistono ancora. La cronologia delle attività funziona lo stesso: manca solo il changelog di prodotto.
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
        <Database className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />
        <code className="text-2xs text-text-primary">supabase/migrations/179_os_versions.sql</code>
      </div>
    </div>
  )
}

/** Il form di una voce: cosa è cambiato, e — la parte che conta — rispetto a cosa. */
function ChangeForm({ initial, onCancel, onSave, pending }: {
  initial?: Partial<ChangeInput>
  onCancel: () => void
  onSave: (v: ChangeInput) => void
  pending: boolean
}) {
  const [kind, setKind] = useState<ChangeKind>((initial?.kind as ChangeKind) ?? 'novita')
  const [area, setArea] = useState(initial?.area ?? 'Generale')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [detail, setDetail] = useState(initial?.detail ?? '')
  const [before, setBefore] = useState(initial?.before_text ?? '')
  const [after, setAfter] = useState(initial?.after_text ?? '')
  const [impact, setImpact] = useState<NonNullable<ChangeInput['impact']>>(initial?.impact ?? 'medio')

  return (
    <div className="bg-background border border-border rounded-xl p-3 space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {CHANGE_KINDS.map(k => (
          <button key={k.key} onClick={() => setKind(k.key)} title={k.hint}
            className={`text-2xs font-semibold px-2 py-1 rounded-lg border transition-colors ${
              kind === k.key ? KIND_STYLE[k.key] : 'bg-surface border-border text-text-secondary hover:text-text-primary'}`}>
            {k.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select value={area} onChange={e => setArea(e.target.value)} aria-label="Area" className={input}>
          {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={impact} onChange={e => setImpact(e.target.value as NonNullable<ChangeInput['impact']>)} aria-label="Impatto" className={input}>
          <option value="alto">Impatto alto</option>
          <option value="medio">Impatto medio</option>
          <option value="basso">Impatto basso</option>
        </select>
      </div>

      <input value={title} onChange={e => setTitle(e.target.value)} className={input}
        placeholder="Cosa cambia, in una riga" aria-label="Titolo della voce" />
      <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={2} className={input}
        placeholder="Perché è cambiato (facoltativo)" aria-label="Dettaglio" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <textarea value={before} onChange={e => setBefore(e.target.value)} rows={2} className={input}
          placeholder="Prima: com'era" aria-label="Prima" />
        <textarea value={after} onChange={e => setAfter(e.target.value)} rows={2} className={input}
          placeholder="Adesso: com'è" aria-label="Adesso" />
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => onSave({ kind, area, title, detail, before_text: before, after_text: after, impact })}
          disabled={pending || !title.trim()}
          className="flex items-center gap-1.5 text-xs font-bold bg-gold text-on-gold px-3 py-1.5 rounded-lg disabled:opacity-40 press">
          {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salva
        </button>
        <button onClick={onCancel} className="text-xs text-text-secondary hover:text-text-primary press">Annulla</button>
      </div>
    </div>
  )
}

function ChangeRow({ c, canEdit, onSaved }: { c: OsVersionChange; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<unknown>, ok: string) => start(async () => {
    try { await fn(); toast.success(ok); setEditing(false); onSaved() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  if (editing) {
    return (
      <ChangeForm pending={pending} onCancel={() => setEditing(false)}
        initial={{
          kind: c.kind, area: c.area, title: c.title, impact: c.impact,
          detail: c.detail ?? '', before_text: c.before_text ?? '', after_text: c.after_text ?? '',
        }}
        onSave={v => run(() => updateChange(c.id, v), 'Voce aggiornata')} />
    )
  }

  const kindLabel = CHANGE_KINDS.find(k => k.key === c.kind)?.label ?? c.kind

  return (
    <div className="group border border-border rounded-xl p-3 bg-background">
      <div className="flex items-start gap-2 flex-wrap">
        <span className={`text-2xs font-bold px-1.5 py-0.5 rounded border ${KIND_STYLE[c.kind]}`}>{kindLabel}</span>
        <span className="text-2xs text-text-secondary bg-surface border border-border px-1.5 py-0.5 rounded">{c.area}</span>
        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 ${IMPACT_DOT[c.impact]}`} title={`Impatto ${c.impact}`} />
        <p className="text-sm font-semibold text-text-primary flex-1 min-w-[200px]">{c.title}</p>
        {canEdit && (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditing(true)} aria-label="Modifica la voce"
              className="text-text-secondary hover:text-gold-text"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={() => run(() => deleteChange(c.id), 'Voce eliminata')} aria-label="Elimina la voce"
              className="text-text-secondary hover:text-error"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>

      {c.detail && <p className="text-xs text-text-secondary mt-1.5">{c.detail}</p>}

      {(c.before_text || c.after_text) && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center">
          <div className="bg-surface border border-border rounded-lg px-2.5 py-1.5">
            <p className="text-2xs text-text-tertiary uppercase tracking-wider mb-0.5">Prima</p>
            <p className="text-2xs text-text-secondary">{c.before_text ?? '—'}</p>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-text-tertiary mx-auto hidden sm:block" />
          <div className="bg-success-dim border border-success/25 rounded-lg px-2.5 py-1.5">
            <p className="text-2xs text-success uppercase tracking-wider mb-0.5">Adesso</p>
            <p className="text-2xs text-text-primary">{c.after_text ?? '—'}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function VersionCard({ v, canEdit, defaultOpen, onSaved }: {
  v: VersionRow; canEdit: boolean; defaultOpen: boolean; onSaved: () => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [adding, setAdding] = useState(false)
  const [editingHead, setEditingHead] = useState(false)
  const [title, setTitle] = useState(v.title)
  const [summary, setSummary] = useState(v.summary ?? '')
  const [pending, start] = useTransition()

  const changes = [...(v.changes ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const counts = countByKind(changes)
  const draft = v.status === 'bozza'

  const run = (fn: () => Promise<unknown>, ok: string) => start(async () => {
    try { await fn(); toast.success(ok); setAdding(false); setEditingHead(false); onSaved() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  return (
    <div className={`border rounded-2xl overflow-hidden ${draft ? 'border-warning/40' : 'border-border'}`}>
      <div className="flex items-start gap-3 px-4 py-3 bg-surface cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="shrink-0 text-center">
          <p className="text-base font-black text-gold-text tabular">v{v.version}</p>
          <p className="text-2xs text-text-tertiary">{dateIt(v.released_at) ?? 'non pubblicata'}</p>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-text-primary">{v.title}</h3>
            {draft && <span className="text-2xs font-bold bg-warning-dim text-warning border border-warning/30 px-1.5 py-0.5 rounded">bozza</span>}
          </div>
          <p className="text-2xs text-text-secondary mt-0.5">
            Ciclo {dateIt(v.period_start)} → {dateIt(v.period_end)} · {changes.length} voc{changes.length === 1 ? 'e' : 'i'}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {CHANGE_KINDS.filter(k => counts[k.key] > 0).map(k => (
              <span key={k.key} className={`text-2xs font-semibold px-1.5 py-0.5 rounded border ${KIND_STYLE[k.key]}`}>
                {counts[k.key]} {k.label.toLowerCase()}
              </span>
            ))}
          </div>
        </div>

        <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="border-t border-border p-4 space-y-3 bg-background">
          {editingHead ? (
            <div className="space-y-2">
              <input value={title} onChange={e => setTitle(e.target.value)} className={input} aria-label="Titolo della versione" />
              <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3} className={input}
                placeholder="Il racconto: a cosa serve questa versione" aria-label="Sommario" />
              <div className="flex items-center gap-2">
                <button onClick={() => run(() => updateVersion(v.id, { title, summary }), 'Versione aggiornata')}
                  disabled={pending || !title.trim()}
                  className="flex items-center gap-1.5 text-xs font-bold bg-gold text-on-gold px-3 py-1.5 rounded-lg disabled:opacity-40 press">
                  {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salva
                </button>
                <button onClick={() => setEditingHead(false)} className="text-xs text-text-secondary hover:text-text-primary press">Annulla</button>
              </div>
            </div>
          ) : v.summary ? (
            <p className="text-xs text-text-secondary leading-relaxed">{v.summary}</p>
          ) : (
            <p className="text-xs text-text-tertiary">Nessun sommario.</p>
          )}

          {changes.length === 0 ? (
            <p className="text-xs text-text-tertiary">Nessuna voce: questa versione non dice ancora cosa è cambiato.</p>
          ) : (
            <div className="space-y-2">
              {changes.map(c => <ChangeRow key={c.id} c={c} canEdit={canEdit} onSaved={onSaved} />)}
            </div>
          )}

          {canEdit && (adding ? (
            <ChangeForm pending={pending} onCancel={() => setAdding(false)}
              onSave={val => run(() => addChange(v.id, val), 'Voce aggiunta')} />
          ) : (
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <button onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-gold-text hover:underline">
                <Plus className="w-3.5 h-3.5" /> Aggiungi voce
              </button>
              <button onClick={() => setEditingHead(true)}
                className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary">
                <Pencil className="w-3.5 h-3.5" /> Titolo e sommario
              </button>
              {draft ? (
                <button onClick={() => run(() => publishVersion(v.id), 'Versione pubblicata')} disabled={pending}
                  className="flex items-center gap-1.5 text-xs font-semibold text-success hover:underline disabled:opacity-40">
                  <Send className="w-3.5 h-3.5" /> Pubblica
                </button>
              ) : (
                <button onClick={() => run(() => unpublishVersion(v.id), 'Versione riportata in bozza')} disabled={pending}
                  className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-warning disabled:opacity-40">
                  <Undo2 className="w-3.5 h-3.5" /> Riporta in bozza
                </button>
              )}
              <button onClick={() => run(() => deleteVersion(v.id), 'Versione eliminata')} disabled={pending}
                className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-error ml-auto disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" /> Elimina versione
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function VersioniPanel({ versions, missing, currentProfile }: {
  versions: VersionRow[]
  missing: boolean
  currentProfile: Profile
}) {
  const [creating, setCreating] = useState(false)
  const [bump, setBump] = useState<'ciclo' | 'sostanziale' | 'major'>('ciclo')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [pending, start] = useTransition()

  const canEdit = SUPER_ADMIN_EMAILS.includes(currentProfile.email) || currentProfile.app_role === 'admin'

  if (missing) return <Notice />

  const parsed = versions.map(v => parseVersion(v.version)).filter((v): v is NonNullable<typeof v> => v !== null).sort(compareVersions)
  const latest = parsed[0] ?? null
  const published = versions.filter(v => v.status === 'pubblicata')
  const current = published[0] ?? versions[0] ?? null
  const cycle = cycleOf(new Date())
  const left = daysLeftInCycle(new Date())
  const suggested = formatVersion(nextVersion(latest, bump, new Date()))
  const cycleCovered = versions.some(v => v.period_start === cycle.start)

  const refresh = () => { if (typeof window !== 'undefined') window.location.reload() }

  const create = () => start(async () => {
    try {
      await createVersion({ bump, title, summary })
      toast.success(`Versione ${suggested} aperta in bozza`)
      setCreating(false); setTitle(''); setSummary('')
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    }
  })

  return (
    <div className="space-y-4">
      {/* Dove siamo nel ciclo */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <div className="flex items-start gap-4 flex-wrap">
          <div>
            <p className="text-2xs text-text-secondary uppercase tracking-wider">Versione in uso</p>
            <p className="text-2xl font-black text-gold-text tabular">v{current?.version ?? '—'}</p>
            <p className="text-2xs text-text-tertiary">{current?.title ?? 'nessuna versione pubblicata'}</p>
          </div>

          <div className="flex-1 min-w-[220px]">
            <p className="flex items-center gap-1.5 text-2xs text-text-secondary uppercase tracking-wider">
              <CalendarClock className="w-3.5 h-3.5" /> Ciclo in corso
            </p>
            <p className="text-sm font-semibold text-text-primary">
              {dateIt(cycle.start)} → {dateIt(cycle.end)}
            </p>
            <p className="text-2xs text-text-secondary">
              {left === 0 ? 'si chiude oggi' : `mancano ${left} giorn${left === 1 ? 'o' : 'i'}`}
              {' · '}una versione ogni {CYCLE_DAYS} giorni
              {!cycleCovered && <span className="text-warning"> · questo ciclo non ha ancora una versione</span>}
            </p>
          </div>

          {canEdit && !creating && (
            <button onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 text-sm font-bold bg-gold text-on-gold px-3 py-2 rounded-xl press">
              <Plus className="w-4 h-4" /> Nuova versione
            </button>
          )}
        </div>

        {creating && (
          <div className="mt-4 border-t border-border pt-3 space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {([
                ['ciclo', 'Chiude il ciclo', 'i 15 giorni sono finiti'],
                ['sostanziale', 'Modifica sostanziale', 'esce a metà ciclo'],
                ['major', 'Versione maggiore', 'lo decide una persona'],
              ] as const).map(([k, label, hint]) => (
                <button key={k} onClick={() => setBump(k)} title={hint}
                  className={`text-2xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                    bump === k ? 'bg-gold-dim border-gold/40 text-gold-text' : 'bg-background border-border text-text-secondary hover:text-text-primary'}`}>
                  {label}
                </button>
              ))}
              <span className="text-2xs text-text-secondary self-center ml-1">
                sarà la <strong className="text-text-primary tabular">v{suggested}</strong>
              </span>
            </div>
            <input value={title} onChange={e => setTitle(e.target.value)} className={input}
              placeholder="Titolo della versione" aria-label="Titolo della versione" />
            <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={2} className={input}
              placeholder="Il racconto: cosa cambia rispetto alla versione precedente" aria-label="Sommario" />
            <div className="flex items-center gap-2">
              <button onClick={create} disabled={pending || !title.trim()}
                className="flex items-center gap-1.5 text-xs font-bold bg-gold text-on-gold px-3 py-1.5 rounded-lg disabled:opacity-40 press">
                {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Apri in bozza
              </button>
              <button onClick={() => setCreating(false)} className="text-xs text-text-secondary hover:text-text-primary press">
                <X className="w-3.5 h-3.5 inline" /> Annulla
              </button>
            </div>
          </div>
        )}
      </div>

      {versions.length === 0 ? (
        <div className="text-center py-16">
          <Sparkles className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
          <p className="text-sm text-text-secondary">Nessuna versione registrata</p>
          <p className="text-xs text-text-tertiary mt-1">La v1.0.0 arriva con la migration 179.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {versions.map((v, i) => (
            <VersionCard key={v.id} v={v} canEdit={canEdit} defaultOpen={i === 0} onSaved={refresh} />
          ))}
        </div>
      )}

      <p className="text-2xs text-text-tertiary">
        Le voci si scrivono a mano di proposito: un changelog generato dai commit racconta i commit, non il prodotto.
      </p>
    </div>
  )
}

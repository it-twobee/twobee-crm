'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, Plus, X, Trash2, ChevronUp, ChevronDown, Check, Pencil, UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  listPhases, createPhase, updatePhase, deletePhase, reorderPhases,
  type Phase,
} from '@/app/actions/project-phases'

/**
 * Fasi di progetto, gestibili come sprint e task: crea, rinomina, riordina,
 * assegna un responsabile, cambia stato, elimina.
 *
 * La fase è logica (Discovery, Sviluppo, Rilascio), lo sprint è temporale: un
 * progetto può avere tre sprint dentro la fase "Sviluppo". Per questo `phase_id`
 * sta sia sulle task sia sugli sprint.
 *
 * Eliminare una fase NON cancella le task: `tasks.phase_id` è ON DELETE SET NULL,
 * quindi tornano senza fase. Cancellare un contenitore non deve portarsi via il
 * lavoro che contiene.
 */

const STATUS: { value: string; label: string; cls: string }[] = [
  { value: 'da_avviare', label: 'Da avviare', cls: 'text-text-tertiary' },
  { value: 'in_corso', label: 'In corso', cls: 'text-info' },
  { value: 'completata', label: 'Completata', cls: 'text-success' },
  { value: 'bloccata', label: 'Bloccata', cls: 'text-error' },
  { value: 'saltata', label: 'Saltata', cls: 'text-text-tertiary' },
]

interface PhaseWithOwner extends Phase {
  owner?: { id: string; full_name: string | null; avatar_url: string | null } | null
}

export function PhasesSection({ projectId, profiles, canEdit, taskCounts = {} }: {
  projectId: string
  profiles: { id: string; full_name: string | null }[]
  canEdit: boolean
  /** Quante task appartengono a ciascuna fase: serve ad avvisare prima di eliminare. */
  taskCounts?: Record<string, number>
}) {
  const [phases, setPhases] = useState<PhaseWithOwner[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listPhases(projectId)
    if (!res.ok) toast.error(res.error ?? 'Errore nel caricamento')
    setPhases(res.phases as PhaseWithOwner[])
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg?: string) => {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (!res.ok) { toast.error(res.error ?? 'Errore'); return false }
    if (msg) toast.success(msg)
    load()
    return true
  }

  const add = async () => {
    if (!newName.trim()) return
    const ok = await run(() => createPhase(projectId, { name: newName }), 'Fase aggiunta')
    if (ok) { setNewName(''); setAdding(false) }
  }

  const rename = async (p: PhaseWithOwner) => {
    if (!editName.trim() || editName === p.name) { setEditingId(null); return }
    const ok = await run(() => updatePhase(p.id, projectId, { name: editName.trim() }))
    if (ok) setEditingId(null)
  }

  const move = async (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= phases.length) return
    const ids = phases.map(p => p.id)
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    setPhases(prev => {
      const copy = [...prev]
      ;[copy[index], copy[next]] = [copy[next], copy[index]]
      return copy
    })
    await run(() => reorderPhases(projectId, ids))
  }

  const remove = async (p: PhaseWithOwner) => {
    const n = taskCounts[p.id] ?? 0
    const msg = n > 0
      ? `Eliminare la fase "${p.name}"? Le ${n} task collegate non vengono cancellate: restano nel progetto senza fase.`
      : `Eliminare la fase "${p.name}"?`
    if (!window.confirm(msg)) return
    await run(() => deletePhase(p.id, projectId), 'Fase eliminata')
  }

  const inputCls = 'w-full bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/50'

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Caricamento fasi…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Fasi del progetto</h3>
          <p className="text-2xs text-text-tertiary mt-0.5">
            La fase è logica, lo sprint è temporale: dentro «Sviluppo» possono starci più sprint.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setAdding(v => !v)}
            className="flex items-center gap-1.5 bg-gold text-on-gold text-sm font-semibold px-3 py-2 rounded-lg hover:opacity-90 transition-opacity shrink-0">
            {adding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {adding ? 'Annulla' : 'Nuova fase'}
          </button>
        )}
      </div>

      {adding && canEdit && (
        <div className="flex items-center gap-2">
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(false) }}
            placeholder="Nome della fase (es. Discovery)" className={inputCls} />
          <button onClick={add} disabled={busy || !newName.trim()}
            className="bg-gold text-on-gold text-sm font-semibold px-3 py-2 rounded-lg disabled:opacity-40 shrink-0">
            Aggiungi
          </button>
        </div>
      )}

      {phases.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-6 text-center">
          <p className="text-sm text-text-secondary">Nessuna fase.</p>
          <p className="text-2xs text-text-tertiary mt-1">
            Le fasi raggruppano il lavoro per momento del progetto: Discovery, Sviluppo, Rilascio…
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
          {phases.map((p, i) => {
            const st = STATUS.find(s => s.value === p.status)
            const n = taskCounts[p.id] ?? 0
            return (
              <div key={p.id} className="p-3 flex items-center gap-3 flex-wrap">
                {canEdit && (
                  <div className="flex flex-col shrink-0">
                    <button onClick={() => move(i, -1)} disabled={i === 0 || busy}
                      aria-label="Sposta su"
                      className="p-0.5 text-text-tertiary hover:text-text-primary disabled:opacity-25 transition-colors">
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={i === phases.length - 1 || busy}
                      aria-label="Sposta giù"
                      className="p-0.5 text-text-tertiary hover:text-text-primary disabled:opacity-25 transition-colors">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <span className="text-2xs text-text-tertiary w-5 shrink-0">{i + 1}</span>

                <div className="flex-1 min-w-[10rem]">
                  {editingId === p.id ? (
                    <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                      onBlur={() => rename(p)}
                      onKeyDown={e => { if (e.key === 'Enter') rename(p); if (e.key === 'Escape') setEditingId(null) }}
                      className="w-full bg-background border border-gold/40 rounded px-2 py-1 text-sm text-text-primary outline-none" />
                  ) : (
                    <button
                      onClick={() => { if (!canEdit) return; setEditingId(p.id); setEditName(p.name) }}
                      className={`text-sm text-text-primary text-left ${canEdit ? 'hover:text-gold-text cursor-pointer' : 'cursor-default'} inline-flex items-center gap-1.5 group`}>
                      {p.name}
                      {canEdit && <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60" />}
                    </button>
                  )}
                  {n > 0 && <p className="text-2xs text-text-tertiary mt-0.5">{n} task</p>}
                </div>

                {/* Responsabile */}
                {canEdit ? (
                  <select value={p.owner_id ?? ''}
                    onChange={e => run(() => updatePhase(p.id, projectId, { owner_id: e.target.value || null }))}
                    aria-label={`Responsabile della fase ${p.name}`}
                    className="text-2xs bg-background border border-border rounded-lg px-2 py-1 text-text-secondary max-w-[9rem] shrink-0">
                    <option value="">Nessun responsabile</option>
                    {profiles.map(pr => <option key={pr.id} value={pr.id}>{pr.full_name ?? '—'}</option>)}
                  </select>
                ) : (
                  <span className="text-2xs text-text-tertiary shrink-0 inline-flex items-center gap-1">
                    <UserRound className="w-3 h-3" />
                    {p.owner?.full_name ?? '—'}
                  </span>
                )}

                {/* Date */}
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <input type="date" value={p.start_date ?? ''}
                      onChange={e => run(() => updatePhase(p.id, projectId, { start_date: e.target.value || null }))}
                      aria-label={`Inizio fase ${p.name}`}
                      className="text-2xs bg-background border border-border rounded-lg px-1.5 py-1 text-text-secondary" />
                    <span className="text-2xs text-text-tertiary">→</span>
                    <input type="date" value={p.end_date ?? ''}
                      onChange={e => run(() => updatePhase(p.id, projectId, { end_date: e.target.value || null }))}
                      aria-label={`Fine fase ${p.name}`}
                      className="text-2xs bg-background border border-border rounded-lg px-1.5 py-1 text-text-secondary" />
                  </div>
                )}

                {/* Stato */}
                {canEdit ? (
                  <select value={p.status}
                    onChange={e => run(() => updatePhase(p.id, projectId, { status: e.target.value }))}
                    aria-label={`Stato della fase ${p.name}`}
                    className="text-2xs bg-background border border-border rounded-lg px-2 py-1 text-text-secondary shrink-0">
                    {STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                ) : (
                  <span className={`text-2xs font-semibold shrink-0 ${st?.cls ?? ''}`}>{st?.label ?? p.status}</span>
                )}

                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => run(() => updatePhase(p.id, projectId, {
                        requires_client_approval: !p.requires_client_approval,
                      }))}
                      aria-label={p.requires_client_approval ? 'Non richiede approvazione cliente' : 'Richiede approvazione cliente'}
                      title="Approvazione cliente"
                      className={`p-1.5 rounded transition-colors ${
                        p.requires_client_approval ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'
                      }`}>
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => remove(p)} aria-label={`Elimina fase ${p.name}`}
                      className="p-1.5 rounded text-text-tertiary hover:text-error transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {phases.length > 0 && (
        <p className="text-2xs text-text-tertiary">
          Eliminando una fase le sue task restano nel progetto, senza fase. Il segno di spunta
          marca le fasi che richiedono l&apos;approvazione del cliente.
        </p>
      )}
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle, Info, CheckCircle2, Pencil, FileStack, Sparkles,
  FolderTree, Flag, CheckSquare, Repeat,
} from 'lucide-react'
import { StepHead, Segmented, inputCls, Avatar } from '@/components/shared/formkit'
import { countTree, type WWorkstream, type Person, type ClientChoice } from './types'

type Check = {
  id: string
  tone: 'error' | 'warn' | 'info'
  text: string
  fix?: { label: string; run: () => void }
}

export function StepConferma({
  client, area, serviceLabel, name, description, startDate, targetEnd,
  managerId, priority, visibility, team, profiles, structure, offConvention,
  status, setStatus, saveTpl, setSaveTpl, goTo, quickFix,
}: {
  client: ClientChoice
  area: string
  serviceLabel: string
  name: string
  description: string
  startDate: string
  targetEnd: string
  managerId: string
  priority: string
  visibility: string
  team: string[]
  profiles: Person[]
  structure: WWorkstream[]
  offConvention: number
  status: 'draft' | 'active'
  setStatus: (s: 'draft' | 'active') => void
  saveTpl: { on: boolean; name: string }
  setSaveTpl: (v: { on: boolean; name: string }) => void
  goTo: (step: number) => void
  quickFix: {
    realignNaming: () => void
    spreadDates: () => void
    assignAllToPm: () => void
  }
}) {
  const [showAll, setShowAll] = useState(false)
  const counts = useMemo(() => countTree(structure), [structure])
  const pm = profiles.find(p => p.id === managerId)
  const undated = counts.ms - counts.dated
  const unassigned = counts.tk - counts.assigned
  const canSpread = !!startDate && !!targetEnd && targetEnd > startDate

  const checks = useMemo<Check[]>(() => {
    const out: Check[] = []
    if (counts.ws === 0) out.push({ id: 'ws', tone: 'error', text: 'Nessun workstream: il progetto nasce vuoto.', fix: { label: 'Struttura', run: () => goTo(6) } })
    if (startDate && targetEnd && targetEnd < startDate) out.push({ id: 'range', tone: 'error', text: 'La data di fine precede quella di inizio.', fix: { label: 'Correggi', run: () => goTo(3) } })
    if (!managerId) out.push({ id: 'pm', tone: 'warn', text: 'Nessun Project Manager: nessuno riceve il progetto in carico.', fix: { label: 'Scegli PM', run: () => goTo(3) } })
    if (!startDate || !targetEnd) out.push({ id: 'dates', tone: 'warn', text: 'Progetto senza periodo: non compare nelle viste temporali.', fix: { label: 'Aggiungi date', run: () => goTo(3) } })
    if (counts.ms > 0 && undated > 0) out.push({
      id: 'undated', tone: 'warn',
      text: `${undated} milestone su ${counts.ms} senza scadenza: restano fuori dal calendario.`,
      fix: canSpread ? { label: 'Distribuisci', run: quickFix.spreadDates } : { label: 'Aggiungi date', run: () => goTo(3) },
    })
    if (counts.tk > 0 && unassigned > 0) out.push({
      id: 'unassigned', tone: 'warn',
      text: `${unassigned} task su ${counts.tk} senza assegnatario.`,
      fix: managerId ? { label: 'Assegna al PM', run: quickFix.assignAllToPm } : { label: 'Struttura', run: () => goTo(6) },
    })
    if (offConvention > 0) out.push({ id: 'naming', tone: 'warn', text: `${offConvention} nomi fuori dalla naming convention.`, fix: { label: 'Riallinea', run: quickFix.realignNaming } })
    if (team.length === 0) out.push({ id: 'team', tone: 'info', text: 'Nessun membro oltre al PM: solo admin e PM vedranno il progetto.', fix: { label: 'Team', run: () => goTo(4) } })
    const recurringNoTasks = structure.filter(w => w.workstream_type === 'recurring' && w.recurring.length === 0).length
    if (recurringNoTasks > 0) out.push({ id: 'rec', tone: 'info', text: `${recurringNoTasks} workstream continuative senza attività ricorrenti.`, fix: { label: 'Struttura', run: () => goTo(6) } })
    return out
  }, [counts, undated, unassigned, offConvention, managerId, startDate, targetEnd, team.length, structure, canSpread, goTo, quickFix])

  const blocking = checks.filter(c => c.tone === 'error')
  const visible = showAll ? checks : checks.slice(0, 4)

  return (
    <div className="space-y-4">
      <StepHead title="Ultimo controllo"
        hint="Quello che segue è ciò che verrà creato. Clicca una riga per tornare a modificarla." />

      <div className="rounded-2xl border border-border overflow-hidden">
        <Row label="Cliente" value={client.kind === 'internal' ? 'Progetto interno (TWO BEE)' : client.name} onClick={() => goTo(0)} />
        <Row label="Area · Workstream" value={`${area} · ${serviceLabel}`} onClick={() => goTo(2)} />
        <Row label="Nome" value={name || '—'} onClick={() => goTo(3)} strong />
        {description && <Row label="Descrizione" value={description} onClick={() => goTo(3)} />}
        <Row label="Periodo" value={startDate || targetEnd ? `${startDate || '?'} → ${targetEnd || '?'}` : 'non definito'} onClick={() => goTo(3)} />
        <Row label="Priorità · Visibilità" value={`${priority} · ${visibility === 'client_visible' ? 'visibile al cliente' : 'interna'}`} onClick={() => goTo(3)} />
        <Row label="Project Manager" onClick={() => goTo(3)}
          value={pm ? pm.full_name : 'nessuno'}
          icon={pm ? <Avatar name={pm.full_name} url={pm.avatar_url} size={20} /> : undefined} />
        <Row label="Team" onClick={() => goTo(4)}
          value={team.length ? `${team.length} oltre al PM` : 'solo il PM'}
          icon={team.length ? (
            <span className="flex -space-x-1.5">
              {profiles.filter(p => team.includes(p.id)).slice(0, 5).map(p => (
                <Avatar key={p.id} name={p.full_name} url={p.avatar_url} size={20} />
              ))}
            </span>
          ) : undefined} />
        <button type="button" onClick={() => goTo(6)}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover">
          <span className="text-2xs text-text-tertiary w-32 shrink-0">Struttura</span>
          <span className="flex-1 flex items-center gap-3 text-2xs text-text-secondary tabular flex-wrap">
            <span className="flex items-center gap-1"><FolderTree className="w-3 h-3 text-gold-text" />{counts.ws} workstream</span>
            <span className="flex items-center gap-1"><Flag className="w-3 h-3 text-info" />{counts.ms} milestone</span>
            <span className="flex items-center gap-1"><CheckSquare className="w-3 h-3" />{counts.tk} task</span>
            {counts.rc > 0 && <span className="flex items-center gap-1 text-success"><Repeat className="w-3 h-3" />{counts.rc} ricorrenti</span>}
          </span>
          <Pencil className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
        </button>
      </div>

      {checks.length === 0 ? (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-success-dim">
          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
          <span className="text-2xs text-success font-semibold">Tutto a posto: nessun suggerimento.</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-2xs font-semibold text-text-secondary">Suggerimenti ({checks.length})</div>
          {visible.map(c => (
            <div key={c.id} className={`flex items-center gap-2 p-2.5 rounded-xl ${
              c.tone === 'error' ? 'bg-error-dim' : c.tone === 'warn' ? 'bg-warning-dim' : 'bg-surface-active'
            }`}>
              {c.tone === 'info'
                ? <Info className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                : <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${c.tone === 'error' ? 'text-error' : 'text-warning'}`} />}
              <span className={`flex-1 text-2xs ${c.tone === 'error' ? 'text-error' : c.tone === 'warn' ? 'text-warning' : 'text-text-secondary'}`}>{c.text}</span>
              {c.fix && (
                <button type="button" onClick={c.fix.run}
                  className="text-2xs font-semibold text-text-primary underline underline-offset-2 shrink-0 hover:opacity-80">
                  {c.fix.label}
                </button>
              )}
            </div>
          ))}
          {checks.length > 4 && (
            <button type="button" onClick={() => setShowAll(s => !s)}
              className="text-2xs font-semibold text-text-tertiary hover:text-text-primary">
              {showAll ? 'Mostra meno' : `Altri ${checks.length - 4}`}
            </button>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="block text-2xs font-semibold text-text-secondary mb-1.5">Crea come</span>
          <Segmented ariaLabel="Stato iniziale" value={status} onChange={setStatus}
            options={[{ value: 'draft', label: 'Bozza' }, { value: 'active', label: 'Attivo' }]} />
          <p className="text-2xs text-text-tertiary mt-1.5">
            {status === 'draft'
              ? 'Visibile solo a chi lo cerca: nessuna notifica al team.'
              : 'Parte subito: compare nel calendario e nelle attività del team.'}
          </p>
        </div>

        {counts.ws > 0 && (
          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-1.5">
              <input type="checkbox" checked={saveTpl.on}
                onChange={e => setSaveTpl({ ...saveTpl, on: e.target.checked })} />
              <span className="flex items-center gap-1.5 text-2xs font-semibold text-text-secondary">
                <FileStack className="w-3.5 h-3.5 text-gold-text" />Salva questa struttura come template
              </span>
            </label>
            {saveTpl.on && (
              <>
                <input value={saveTpl.name} onChange={e => setSaveTpl({ ...saveTpl, name: e.target.value })}
                  placeholder="Nome del template" aria-label="Nome del template" className={inputCls} />
                <p className="flex items-center gap-1.5 text-2xs text-text-tertiary mt-1.5">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  Salvata senza prefissi di cliente: riutilizzabile su qualsiasi progetto.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {blocking.length > 0 && (
        <p className="text-2xs text-error">Puoi creare comunque: nessun controllo è bloccante.</p>
      )}
    </div>
  )
}

function Row({
  label, value, onClick, icon, strong,
}: { label: string; value: string; onClick: () => void; icon?: React.ReactNode; strong?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover border-b border-border last:border-b-0">
      <span className="text-2xs text-text-tertiary w-32 shrink-0">{label}</span>
      {icon}
      <span className={`flex-1 min-w-0 truncate text-sm ${strong ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>{value}</span>
      <Pencil className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
    </button>
  )
}

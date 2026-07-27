'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Check, X, Clock, CalendarDays, Receipt, FileText, Plane, Thermometer,
  Undo2, Paperclip, ChevronRight, AlertTriangle, RotateCcw, CalendarCheck,
} from 'lucide-react'
import { Avatar, SearchInput, Segmented, Empty, inputCls } from '@/components/shared/formkit'
import { approveHrRequest, rejectHrRequest, revokeHrApproval } from '@/app/actions/hr-requests'
import type { HrRequest, HrRequestType, Profile } from '@/lib/types/database'

const TYPE_META: Record<HrRequestType, { label: string; icon: React.ReactNode; tone: string; dest: string }> = {
  ferie:        { label: 'Ferie',        icon: <Plane className="w-3.5 h-3.5" />,      tone: 'text-info',    dest: 'Calendario + Google' },
  permesso:     { label: 'Permesso',     icon: <Clock className="w-3.5 h-3.5" />,      tone: 'text-warning', dest: 'Calendario + Google' },
  malattia:     { label: 'Malattia',     icon: <Thermometer className="w-3.5 h-3.5" />, tone: 'text-error',   dest: 'Calendario + Google' },
  spesa:        { label: 'Nota spese',   icon: <Receipt className="w-3.5 h-3.5" />,    tone: 'text-success', dest: 'Buste paga' },
  documento_hr: { label: 'Documento HR', icon: <FileText className="w-3.5 h-3.5" />,   tone: 'text-accent',  dest: 'Documenti personali' },
}
const STATUS_META: Record<string, { label: string; tone: string }> = {
  pending:   { label: 'In attesa',  tone: 'text-warning' },
  approved:  { label: 'Approvata',  tone: 'text-success' },
  rejected:  { label: 'Rifiutata',  tone: 'text-error' },
  cancelled: { label: 'Annullata',  tone: 'text-text-tertiary' },
}
const DEST_HREF: Record<string, string> = {
  calendario: '/calendario',
  'buste-paga': '/workspace/buste-paga',
  'documenti-personali': '/workspace/documenti-personali',
}

const fmt = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : null
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000) + 1

type Filter = 'pending' | 'approved' | 'rejected' | 'tutte'

export function HrRequestsTab({ requests, profiles }: { requests: HrRequest[]; profiles: Profile[] }) {
  const [pending, start] = useTransition()
  const [filter, setFilter] = useState<Filter>('pending')
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<'' | HrRequestType>('')
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const person = (id: string) => profiles.find(p => p.id === id) ?? null

  const counts = useMemo(() => ({
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    tutte: requests.length,
  }), [requests])

  const view = useMemo(() => {
    const t = q.trim().toLowerCase()
    return requests.filter(r => {
      if (filter !== 'tutte' && r.status !== filter) return false
      if (typeFilter && r.type !== typeFilter) return false
      if (t) {
        const who = person(r.profile_id)?.full_name.toLowerCase() ?? ''
        if (!who.includes(t) && !(r.notes ?? '').toLowerCase().includes(t)) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, filter, typeFilter, q, profiles])

  const run = (fn: () => Promise<unknown>, ok: string) => start(async () => {
    try { await fn(); toast.success(ok); setNoteFor(null); setNote('') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const approve = (r: HrRequest) => start(async () => {
    try {
      const res = await approveHrRequest(r.id, noteFor === r.id ? note : undefined)
      const dest = res.routedTo ? DEST_HREF[res.routedTo] : null
      toast.success('Richiesta approvata', {
        description: res.routedTo
          ? `Finita in ${res.routedTo.replace('-', ' ')}${res.googleSync === 'synced' ? ' · sincronizzata su Google'
            : res.googleSync === 'local' ? ' · Google non collegato, resta nel tool'
            : res.googleSync === 'error' ? ' · Google non raggiungibile, riproveremo' : ''}`
          : undefined,
        action: dest ? { label: 'Apri', onClick: () => { window.location.href = dest } } : undefined,
      })
      setNoteFor(null); setNote('')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-text-primary font-heading">Richieste dal team</h2>
        <p className="text-2xs text-text-tertiary mt-0.5">
          Approvando, la richiesta diventa la cosa che rappresenta: un&apos;assenza sul calendario,
          una nota spese in buste paga, un documento nei documenti personali.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Tile n={counts.pending} label="Da decidere" tone="warning" icon={<Clock className="w-4 h-4" />}
          active={filter === 'pending'} onClick={() => setFilter('pending')} />
        <Tile n={counts.approved} label="Approvate" tone="success" icon={<Check className="w-4 h-4" />}
          active={filter === 'approved'} onClick={() => setFilter('approved')} />
        <Tile n={counts.rejected} label="Rifiutate" tone="error" icon={<X className="w-4 h-4" />}
          active={filter === 'rejected'} onClick={() => setFilter('rejected')} />
        <Tile n={counts.tutte} label="Tutte" icon={<CalendarDays className="w-4 h-4" />}
          active={filter === 'tutte'} onClick={() => setFilter('tutte')} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[180px]"><SearchInput value={q} onChange={setQ} placeholder="Cerca persona o motivo…" /></div>
        <div className="w-72 shrink-0">
          <Segmented ariaLabel="Tipo" value={typeFilter} onChange={setTypeFilter}
            options={[
              { value: '' as const, label: 'Tutti' },
              { value: 'ferie' as const, label: 'Ferie' },
              { value: 'permesso' as const, label: 'Permessi' },
              { value: 'spesa' as const, label: 'Spese' },
              { value: 'documento_hr' as const, label: 'Doc' },
            ]} />
        </div>
        {(q || typeFilter) && (
          <button onClick={() => { setQ(''); setTypeFilter('') }}
            className="flex items-center gap-1 text-2xs font-semibold text-text-secondary hover:text-text-primary shrink-0">
            <RotateCcw className="w-3.5 h-3.5" />Azzera
          </button>
        )}
      </div>

      {view.length === 0 ? (
        requests.length === 0
          ? <Empty>Nessuna richiesta dal team. Quando qualcuno ne invia una dal Workspace, compare qui.</Empty>
          : <Empty>Nessuna richiesta per i filtri attivi.</Empty>
      ) : (
        <div className="rounded-2xl border border-border shadow-soft overflow-hidden divide-y divide-border">
          {view.map(r => {
            const meta = TYPE_META[r.type]
            const who = person(r.profile_id)
            const st = STATUS_META[r.status] ?? STATUS_META.pending
            const range = r.start_date
              ? `${fmt(r.start_date)}${r.end_date && r.end_date !== r.start_date ? ` → ${fmt(r.end_date)}` : ''}`
              : null
            const days = r.start_date && r.end_date ? daysBetween(r.start_date, r.end_date) : null
            const noting = noteFor === r.id

            return (
              <div key={r.id} className="bg-surface">
                <div className="flex items-center gap-3 px-3 sm:px-4 py-3">
                  {who ? <Avatar name={who.full_name} url={who.avatar_url} size={30} /> : <span className="w-[30px]" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-text-primary truncate">{who?.full_name ?? '—'}</span>
                      <span className={`flex items-center gap-1 text-2xs font-semibold ${meta.tone}`}>
                        {meta.icon}{meta.label}
                      </span>
                      {r.status === 'pending' && (
                        <span className="text-2xs text-text-tertiary">→ {meta.dest}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {range && (
                        <span className="text-2xs text-text-secondary tabular">
                          {range}{days && days > 1 ? ` · ${days}gg` : ''}
                          {!r.is_full_day && r.start_time ? ` · ${r.start_time}–${r.end_time ?? ''}` : ''}
                        </span>
                      )}
                      {r.amount != null && (
                        <span className="text-2xs font-semibold text-success tabular">€ {r.amount.toLocaleString('it-IT')}</span>
                      )}
                      {r.notes && <span className="text-2xs text-text-tertiary truncate max-w-[280px]">{r.notes}</span>}
                      {r.attachment_url && (
                        <span className="flex items-center gap-1 text-2xs text-info"><Paperclip className="w-3 h-3" />allegato</span>
                      )}
                    </div>
                    {r.review_note && (
                      <p className="text-2xs text-text-tertiary mt-1 italic">Nota: {r.review_note}</p>
                    )}
                  </div>

                  <span className={`text-2xs font-semibold shrink-0 ${st.tone}`}>{st.label}</span>

                  {r.status === 'pending' ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => { setNoteFor(noting ? null : r.id); setNote('') }}
                        className="text-2xs font-semibold text-text-tertiary hover:text-text-primary px-1.5">
                        Nota
                      </button>
                      <button onClick={() => run(() => rejectHrRequest(r.id, noting ? note : undefined), 'Richiesta rifiutata')}
                        disabled={pending} aria-label="Rifiuta"
                        className="flex items-center gap-1 text-2xs font-semibold text-error border border-error/30 bg-error-dim px-2.5 py-1.5 rounded-lg press disabled:opacity-50">
                        <X className="w-3.5 h-3.5" />Rifiuta
                      </button>
                      <button onClick={() => approve(r)} disabled={pending} aria-label="Approva"
                        className="flex items-center gap-1 text-2xs font-semibold bg-gold text-on-gold px-2.5 py-1.5 rounded-lg shadow-soft press disabled:opacity-50">
                        <Check className="w-3.5 h-3.5" />Approva
                      </button>
                    </div>
                  ) : r.status === 'approved' ? (
                    <div className="flex items-center gap-2 shrink-0">
                      {r.calendar_event_id && (
                        <Link href="/calendario" className="flex items-center gap-1 text-2xs font-semibold text-info hover:opacity-80">
                          <CalendarCheck className="w-3.5 h-3.5" />Calendario<ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                      <button onClick={() => run(() => revokeHrApproval(r.id), 'Approvazione revocata')}
                        disabled={pending} title="Rimuove l'evento (anche da Google) e rimette in attesa"
                        className="flex items-center gap-1 text-2xs font-semibold text-text-tertiary hover:text-warning disabled:opacity-50">
                        <Undo2 className="w-3.5 h-3.5" />Revoca
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => run(() => revokeHrApproval(r.id), 'Rimessa in attesa')}
                      disabled={pending}
                      className="flex items-center gap-1 text-2xs font-semibold text-text-tertiary hover:text-text-primary shrink-0 disabled:opacity-50">
                      <Undo2 className="w-3.5 h-3.5" />Riapri
                    </button>
                  )}
                </div>

                {noting && (
                  <div className="px-4 pb-3 flex items-center gap-2">
                    {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                    <input value={note} onChange={e => setNote(e.target.value)} autoFocus
                      placeholder="Nota per chi ha fatto la richiesta (facoltativa)"
                      className={inputCls} aria-label="Nota di revisione" />
                    <button onClick={() => { setNoteFor(null); setNote('') }}
                      className="text-2xs font-semibold text-text-tertiary shrink-0">Chiudi</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {counts.pending > 0 && (
        <p className="flex items-center gap-1.5 text-2xs text-text-tertiary">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Le assenze approvate finiscono sul calendario della persona e, se ha collegato Google, anche sul suo Google Calendar.
        </p>
      )}
    </div>
  )
}

function Tile({ n, label, icon, tone, active, onClick }: {
  n: number; label: string; icon: React.ReactNode
  tone?: 'error' | 'warning' | 'success'; active: boolean; onClick: () => void
}) {
  const ink = n === 0 ? 'text-text-primary'
    : tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-text-primary'
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`bg-surface border rounded-2xl px-3.5 py-3 shadow-soft text-left transition-colors hover:bg-surface-hover no-tap-highlight ${
        active ? 'border-gold ring-1 ring-gold' : 'border-border'
      }`}>
      <div className="flex items-center justify-between">
        <span className={`text-2xl font-black tabular font-heading ${ink}`}>{n}</span>
        <span className={n === 0 ? 'text-text-tertiary' : ink}>{icon}</span>
      </div>
      <div className="text-2xs text-text-tertiary mt-0.5 truncate">{label}</div>
    </button>
  )
}

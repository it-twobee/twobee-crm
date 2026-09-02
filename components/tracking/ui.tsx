'use client'

import { Loader2 } from 'lucide-react'
import { TONE_CHIP, TONE_DOT, statusByValue, qaStatusByValue, type Tone, type TrackingStatus, type QaStatus } from '@/lib/tracking/vocab'

export function Chip({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-semibold whitespace-nowrap ${TONE_CHIP[tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`} />
      {children}
    </span>
  )
}

export function StatusChip({ value, title }: { value: TrackingStatus | null | undefined; title?: string }) {
  const s = statusByValue(value) ?? statusByValue('todo')!
  return <Chip tone={s.tone} title={title}>{s.label}</Chip>
}

export function QaChip({ value, title }: { value: QaStatus | null | undefined; title?: string }) {
  const s = qaStatusByValue(value)
  if (!s) return <Chip tone="muted" title={title}>Mai</Chip>
  return <Chip tone={s.tone} title={title}>{s.label}</Chip>
}

export function Card({ title, hint, aside, children }: {
  title: string; hint?: string; aside?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="bg-surface border border-border rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-text-primary font-heading">{title}</h3>
          {hint && <p className="text-2xs text-text-tertiary mt-0.5">{hint}</p>}
        </div>
        {aside && <div className="shrink-0 flex items-center gap-2">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

export function GoldButton({ onClick, pending, disabled, children, small, type = 'button' }: {
  onClick?: () => void; pending?: boolean; disabled?: boolean; children: React.ReactNode; small?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} onClick={onClick} disabled={pending || disabled}
      className={`inline-flex items-center gap-1.5 font-semibold bg-gold text-on-gold rounded-xl disabled:opacity-40 press btn-gold whitespace-nowrap ${
        small ? 'text-2xs px-3 py-1.5' : 'text-sm px-4 py-2'}`}>
      {pending && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  )
}

export function GhostButton({ onClick, pending, disabled, children, danger, small, ariaLabel }: {
  onClick?: () => void; pending?: boolean; disabled?: boolean; children: React.ReactNode; danger?: boolean; small?: boolean
  ariaLabel?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={pending || disabled} aria-label={ariaLabel}
      className={`inline-flex items-center gap-1.5 font-semibold rounded-xl border disabled:opacity-40 press whitespace-nowrap ${
        small ? 'text-2xs px-2.5 py-1.5' : 'text-sm px-3 py-2'} ${
        danger ? 'border-border text-error hover:bg-error-dim' : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}>
      {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  )
}

export function Loading({ label = 'Carico…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-2xs text-text-tertiary py-6">
      <Loader2 className="w-4 h-4 animate-spin" /> {label}
    </div>
  )
}

export function Notice({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <div className={`rounded-xl px-3 py-2 text-2xs ${TONE_CHIP[tone]}`}>{children}</div>
}

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const fmtDay = (iso: string | null | undefined) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

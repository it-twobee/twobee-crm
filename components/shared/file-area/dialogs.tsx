'use client'

import { useEffect, useRef, useState } from 'react'
import { Folder, Home, Loader2 } from 'lucide-react'
import { crumbsOf } from '@/lib/portal/explorer'
import { buttonCls } from './items'

/* §413 — Le due finestre dell'organizzare: dare un nome (cartella nuova,
   rinomina) e scegliere dove spostare. Chiedono al server e mostrano la sua
   risposta: la regola la tiene lui, qui la si dice prima quando si può. */

function Shell({ title, onClose, pending, children, footer }: {
  title: string; onClose: () => void; pending: boolean; children: React.ReactNode; footer: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pending) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, pending])
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim p-4" onClick={() => { if (!pending) onClose() }}>
    <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
      className="flex max-h-[86vh] w-full max-w-md flex-col rounded-2xl border border-border bg-surface shadow-pop animate-scale-in">
      <h2 className="border-b border-border px-4 py-3 font-heading text-base font-bold text-text-primary">{title}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>
    </div>
  </div>
}

const primaryCls = 'inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-2xs font-semibold text-on-gold disabled:opacity-50'

export function NameDialog({ title, label, initial, suffix, confirmLabel, validate, onSubmit, onClose }: {
  title: string
  label: string
  initial: string
  /** L'estensione di un file: si vede, non si tocca. */
  suffix?: string
  confirmLabel: string
  validate: (value: string) => string | null
  /** Ritorna un errore da mostrare, o `null` se è andata. */
  onSubmit: (value: string) => Promise<string | null>
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])
  const local = validate(value)
  const submit = async () => {
    if (local || pending) { setError(local ?? ''); return }
    setPending(true); setError('')
    const failure = await onSubmit(value.trim())
    setPending(false)
    if (failure) setError(failure); else onClose()
  }
  return <Shell title={title} onClose={onClose} pending={pending} footer={<>
    <button type="button" className={buttonCls} onClick={onClose} disabled={pending}>Annulla</button>
    <button type="button" className={primaryCls} onClick={() => { void submit() }} disabled={pending || !!local}>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}{confirmLabel}
    </button>
  </>}>
    <label className="block text-2xs font-semibold text-text-secondary" htmlFor="nome-area-file">{label}</label>
    <div className="mt-1.5 flex items-center gap-1">
      <input id="nome-area-file" ref={input} value={value} onChange={e => { setValue(e.target.value); setError('') }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }}
        className="min-h-10 w-full rounded-lg border border-border-interactive bg-background px-3 text-sm text-text-primary" />
      {suffix && <span className="shrink-0 text-sm text-text-secondary">{suffix}</span>}
    </div>
    {suffix && <p className="mt-1.5 text-2xs text-text-tertiary">Si cambia il nome, non il tipo del file.</p>}
    {(error || (value !== initial && local)) && <p role="alert" className="mt-2 text-2xs text-error">{error || local}</p>}
  </Shell>
}

export function MoveDialog({ title, rootLabel, folders, disabledReason, onSubmit, onClose }: {
  title: string
  rootLabel: string
  folders: string[]
  /** Perché non si può scegliere questa cartella (è quella di partenza, è dentro sé stessa…). */
  disabledReason: (path: string) => string | null
  onSubmit: (path: string) => Promise<string | null>
  onClose: () => void
}) {
  const [choice, setChoice] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const options = [{ path: '', depth: 0, name: rootLabel }, ...folders.map(path => {
    const steps = crumbsOf(path)
    return { path, depth: steps.length, name: steps[steps.length - 1]?.name ?? path }
  })]
  const submit = async () => {
    if (choice === null || pending) return
    setPending(true); setError('')
    const failure = await onSubmit(choice)
    setPending(false)
    if (failure) setError(failure); else onClose()
  }
  return <Shell title={title} onClose={onClose} pending={pending} footer={<>
    <button type="button" className={buttonCls} onClick={onClose} disabled={pending}>Annulla</button>
    <button type="button" className={primaryCls} onClick={() => { void submit() }} disabled={pending || choice === null}>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}Sposta qui
    </button>
  </>}>
    <div role="radiogroup" aria-label="Cartella di destinazione" className="space-y-0.5">
      {options.map(option => {
        const reason = disabledReason(option.path)
        const selected = choice === option.path
        return <button key={option.path || 'radice'} type="button" role="radio" aria-checked={selected}
          disabled={!!reason} title={reason ?? undefined} onClick={() => setChoice(option.path)}
          style={{ paddingLeft: `${0.5 + option.depth * 1}rem` }}
          className={`flex min-h-10 w-full items-center gap-2 rounded-lg pr-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
            selected ? 'bg-gold-dim text-text-primary ring-2 ring-gold' : 'text-text-primary hover:bg-surface-hover'}`}>
          {option.path ? <Folder className="h-4 w-4 shrink-0 text-gold-text" aria-hidden="true" /> : <Home className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />}
          <span className="min-w-0 flex-1 truncate">{option.name}</span>
          {reason && <span className="shrink-0 text-2xs text-text-tertiary">{reason}</span>}
        </button>
      })}
    </div>
    {error && <p role="alert" className="mt-2 text-2xs text-error">{error}</p>}
  </Shell>
}

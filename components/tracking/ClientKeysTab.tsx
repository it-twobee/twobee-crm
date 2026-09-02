'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Copy, Trash2, KeyRound } from 'lucide-react'
import { listPlatformKeys, revealPlatformKey, savePlatformKey, deletePlatformKey } from '@/app/actions/tracking-secrets'
import { inputCls } from '@/components/shared/formkit'
import type { PlatformKeyStatus } from '@/lib/types/database'
import { Card, GoldButton, GhostButton, Loading, Notice, fmtDate } from './ui'

/**
 * Chiavi API per piattaforma: un valore per servizio, serve alle integrazioni.
 * Il valore non arriva mai con l'elenco: si chiede con «Mostra», e si toglie
 * dalla pagina con «Nascondi».
 */
export function ClientKeysTab({ clientId }: { clientId: string }) {
  const [slots, setSlots] = useState<PlatformKeyStatus[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const res = await listPlatformKeys(clientId)
    if (!res.ok) { setError(res.error); return }
    setSlots(res.data)
  }, [clientId])

  useEffect(() => { reload() }, [reload])

  if (error) return <Notice tone="error">{error}</Notice>
  if (!slots) return <Loading />

  return (
    <div className="space-y-4">
      <Notice tone="muted">
        Un solo valore per servizio, cifrato a riposo. Per Meta va l&apos;Ad Account ID del cliente: il token è d&apos;agenzia
        e sta in Impostazioni → Chiavi tracking. Gli accessi con utente e password stanno nel tab Accessi.
      </Notice>
      {slots.map(slot => <KeySlot key={slot.platform} clientId={clientId} slot={slot} onChanged={reload} />)}
    </div>
  )
}

function KeySlot({ clientId, slot, onChanged }: { clientId: string; slot: PlatformKeyStatus; onChanged: () => void }) {
  const [value, setValue] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()

  const reveal = () => start(async () => {
    const res = await revealPlatformKey(clientId, slot.platform)
    if (!res.ok) { toast.error(res.error); return }
    setValue(res.data)
  })

  const copy = () => start(async () => {
    const res = value !== null ? { ok: true as const, data: value } : await revealPlatformKey(clientId, slot.platform)
    if (!res.ok) { toast.error(res.error); return }
    await navigator.clipboard.writeText(res.data)
    toast.success('Copiato')
  })

  const save = () => start(async () => {
    const res = await savePlatformKey(clientId, slot.platform, draft)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(`${slot.label}: salvato`)
    setEditing(false); setDraft(''); setValue(null)
    onChanged()
  })

  const remove = () => start(async () => {
    if (!confirm(`Rimuovere il valore di ${slot.label}?`)) return
    const res = await deletePlatformKey(clientId, slot.platform)
    if (!res.ok) { toast.error(res.error); return }
    setValue(null); setEditing(false)
    onChanged()
  })

  return (
    <Card title={slot.label} hint={slot.hint}
      aside={slot.hasValue
        ? <span className="text-2xs text-text-tertiary">aggiornata {fmtDate(slot.updatedAt)}</span>
        : <span className="text-2xs text-text-tertiary">non impostata</span>}>
      {editing ? (
        <div className="space-y-3">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={slot.platform === 'klaviyo' ? 2 : 1}
            className={`${inputCls} font-mono`} placeholder={slot.hint} autoComplete="off" spellCheck={false} />
          <div className="flex gap-2 justify-end">
            <GhostButton onClick={() => { setEditing(false); setDraft('') }}>Annulla</GhostButton>
            <GoldButton onClick={save} pending={pending} disabled={!draft.trim()}>Salva</GoldButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className={`flex-1 min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono break-all ${
            slot.hasValue ? 'text-text-primary' : 'text-text-tertiary'}`}>
            {!slot.hasValue ? '—' : value ?? '••••••••••••••••'}
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            {slot.hasValue && (value === null
              ? <GhostButton small onClick={reveal} pending={pending} ariaLabel="Mostra"><Eye className="w-3.5 h-3.5" /> Mostra</GhostButton>
              : <GhostButton small onClick={() => setValue(null)} ariaLabel="Nascondi"><EyeOff className="w-3.5 h-3.5" /> Nascondi</GhostButton>)}
            {slot.hasValue && <GhostButton small onClick={copy} pending={pending} ariaLabel="Copia"><Copy className="w-3.5 h-3.5" /> Copia</GhostButton>}
            <GhostButton small onClick={() => { setEditing(true); setDraft(value ?? '') }}>
              <KeyRound className="w-3.5 h-3.5" /> {slot.hasValue ? 'Modifica' : 'Imposta'}
            </GhostButton>
            {slot.hasValue && <GhostButton small danger onClick={remove} pending={pending} ariaLabel="Rimuovi"><Trash2 className="w-3.5 h-3.5" /> Rimuovi</GhostButton>}
          </div>
        </div>
      )}
    </Card>
  )
}

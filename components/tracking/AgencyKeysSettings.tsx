'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Trash2, KeyRound } from 'lucide-react'
import { BackLink } from '@/components/shared/BackLink'
import { Suspense } from 'react'
import { listAgencyKeys, revealAgencyKey, saveAgencyKey, deleteAgencyKey } from '@/app/actions/tracking-secrets'
import { inputCls } from '@/components/shared/formkit'
import type { AgencyKeyStatus } from '@/lib/types/database'
import { Card, Chip, GoldButton, GhostButton, Loading, Notice, fmtDate } from './ui'

export type DefinitionSummary = { archetype: string; title: string; version: number; breakdowns: number; funnels: number; eventParameters: number; note: string | null }
export type TemplateSummary = { archetype: string; title: string; version: number; sections: number; items: number }

/**
 * Segreti d'agenzia: una copia per tutto il portafoglio. Il dato che cambia
 * da cliente a cliente (Property ID, Ad Account ID) sta nella scheda cliente.
 */
export function AgencyKeysSettings({ vaultConfigured, cronConfigured, definitions, templates, backHref }: {
  vaultConfigured: boolean; cronConfigured: boolean; definitions: DefinitionSummary[]; templates: TemplateSummary[]
  backHref: string
}) {
  const [slots, setSlots] = useState<AgencyKeyStatus[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const res = await listAgencyKeys()
    if (!res.ok) { setError(res.error); return }
    setSlots(res.data)
  }, [])
  useEffect(() => { reload() }, [reload])

  return (
    <div className="min-h-full p-4 sm:p-6 space-y-4 max-w-4xl">
      <Suspense fallback={null}><BackLink fallback={backHref} label="Tracking" /></Suspense>
      <div>
        <h1 className="text-2xl font-bold text-text-primary font-heading">Chiavi tracking</h1>
        <p className="text-2xs text-text-tertiary mt-1">Connettori a livello agenzia per report e controllo giornaliero, gestiti da admin e manager. Cifrati a riposo con la chiave del server.</p>
      </div>

      {!vaultConfigured && (
        <Notice tone="error">
          <strong>VAULT_KEY non configurata</strong> nell&apos;ambiente: chiavi e password non si possono salvare né leggere.
          Genera 32 byte (<code>openssl rand -hex 32</code>) e impostala su Coolify. Se la perdi, i segreti salvati vanno reinseriti.
        </Notice>
      )}
      {!cronConfigured && (
        <Notice tone="warning">
          <strong>TRACKING_CRON_SECRET non configurato</strong>: il controllo giornaliero automatico non può partire. Resta disponibile «Controlla ora» dalla pagina Tracking.
        </Notice>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {!slots && !error && <Loading />}
      {slots?.map(slot => <AgencySlot key={slot.platform} slot={slot} onChanged={reload} disabled={!vaultConfigured} />)}

      <Card title="Definizioni report" hint="Metriche e dimensioni GA4 per archetipo: stanno nei JSON del codice (lib/tracking/definitions), non a database.">
        <ul className="divide-y divide-border">
          {definitions.map(d => (
            <li key={d.archetype} className="py-2">
              <p className="text-sm font-semibold text-text-primary">{d.title} <span className="text-2xs text-text-tertiary font-normal">v{d.version}</span></p>
              <p className="text-2xs text-text-tertiary">{d.breakdowns} breakdown · {d.funnels} funnel · {d.eventParameters} parametri custom{d.note ? ` · ${d.note}` : ''}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Checklist per archetipo" hint="Le voci stanno in lib/tracking/templates: gli id sono chiavi a database, rinominarli perde l'avanzamento.">
        <ul className="divide-y divide-border">
          {templates.map(t => (
            <li key={t.archetype} className="py-2 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-text-primary">{t.title} <span className="text-2xs text-text-tertiary font-normal">v{t.version}</span></p>
              <p className="text-2xs text-text-tertiary">{t.sections} sezioni · {t.items} voci</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function AgencySlot({ slot, onChanged, disabled }: { slot: AgencyKeyStatus; onChanged: () => void; disabled: boolean }) {
  const [value, setValue] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()

  const reveal = () => start(async () => {
    const res = await revealAgencyKey(slot.platform)
    if (!res.ok) { toast.error(res.error); return }
    setValue(res.data)
  })
  const save = () => start(async () => {
    const res = await saveAgencyKey(slot.platform, draft)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(`${slot.label}: salvato`)
    setEditing(false); setDraft(''); setValue(null)
    onChanged()
  })
  const remove = () => start(async () => {
    if (!confirm(`Rimuovere ${slot.label}?`)) return
    const res = await deleteAgencyKey(slot.platform)
    if (!res.ok) { toast.error(res.error); return }
    setValue(null)
    onChanged()
  })

  const rows = slot.kind === 'json' ? 8 : 2

  return (
    <Card title={slot.label} hint={slot.hint}
      aside={!slot.implemented ? <Chip tone="muted">non ancora attivo</Chip>
        : slot.hasValue ? <Chip tone="success">configurato · {fmtDate(slot.updatedAt)}</Chip> : <Chip tone="warning">mancante</Chip>}>
      {!slot.implemented ? (
        <p className="text-2xs text-text-tertiary">Connettore da scrivere: la voce c&apos;è per non far finta che funzioni.</p>
      ) : editing ? (
        <div className="space-y-3">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={rows}
            className={`${inputCls} font-mono text-2xs`} placeholder={slot.hint} autoComplete="off" spellCheck={false} />
          <div className="flex gap-2 justify-end">
            <GhostButton onClick={() => { setEditing(false); setDraft('') }}>Annulla</GhostButton>
            <GoldButton onClick={save} pending={pending} disabled={!draft.trim()}>Salva</GoldButton>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {value !== null && (
            <pre className="rounded-xl border border-border bg-background px-3 py-2 text-2xs font-mono text-text-primary whitespace-pre-wrap break-all max-h-64 overflow-y-auto">{value}</pre>
          )}
          <div className="flex gap-2 flex-wrap">
            {slot.hasValue && (value === null
              ? <GhostButton small onClick={reveal} pending={pending}><Eye className="w-3.5 h-3.5" /> Mostra</GhostButton>
              : <GhostButton small onClick={() => setValue(null)}><EyeOff className="w-3.5 h-3.5" /> Nascondi</GhostButton>)}
            <GhostButton small onClick={() => { setEditing(true); setDraft(value ?? '') }} disabled={disabled}>
              <KeyRound className="w-3.5 h-3.5" /> {slot.hasValue ? 'Sostituisci' : 'Imposta'}
            </GhostButton>
            {slot.hasValue && <GhostButton small danger onClick={remove} pending={pending}><Trash2 className="w-3.5 h-3.5" /> Rimuovi</GhostButton>}
          </div>
        </div>
      )}
    </Card>
  )
}

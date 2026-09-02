'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Copy, Trash2, Pencil, Plus, ExternalLink, KeyRound } from 'lucide-react'
import {
  listLogins, createLogin, updateLogin, revealLoginSecret, deleteLogin, type LoginInput,
} from '@/app/actions/tracking-secrets'
import { Field, inputCls, ModalShell, Empty, SearchInput } from '@/components/shared/formkit'
import { ACCOUNT_SERVICES, accountServiceLabel } from '@/lib/tracking/vocab'
import type { ClientLoginRow } from '@/lib/types/database'
import { GhostButton, GoldButton, Loading, Notice } from './ui'

/**
 * Accessi ad account umani: utente + password di social, posta, dominio…
 * Un cliente può averne quanti vuole per lo stesso servizio. La password
 * viaggia solo se la si modifica: correggere una nota non la tocca.
 */
export function ClientLoginsTab({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const [rows, setRows] = useState<ClientLoginRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [modal, setModal] = useState<{ mode: 'new' } | { mode: 'edit'; row: ClientLoginRow } | null>(null)

  const reload = useCallback(async () => {
    const res = await listLogins(clientId)
    if (!res.ok) { setError(res.error); return }
    setRows(res.data)
  }, [clientId])

  useEffect(() => { reload() }, [reload])

  const filtered = useMemo(() => {
    const list = rows ?? []
    const s = q.trim().toLowerCase()
    if (!s) return list
    return list.filter(r => [r.service, accountServiceLabel(r.service), r.label, r.username, r.url, r.note].join(' ').toLowerCase().includes(s))
  }, [rows, q])

  const groups = useMemo(() => {
    const m = new Map<string, ClientLoginRow[]>()
    for (const r of filtered) m.set(r.service, [...(m.get(r.service) ?? []), r])
    return Array.from(m.entries())
  }, [filtered])

  if (error) return <Notice tone="error">{error}</Notice>
  if (!rows) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex-1"><SearchInput value={q} onChange={setQ} placeholder="Cerca servizio, utente, etichetta…" /></div>
        <GoldButton onClick={() => setModal({ mode: 'new' })}><Plus className="w-4 h-4" /> Nuovo accesso</GoldButton>
      </div>

      {groups.length === 0 && (
        <Empty>{rows.length === 0 ? 'Nessun accesso salvato. Instagram, posta, registrar, hosting: qui, non in una mail.' : 'Nessun risultato.'}</Empty>
      )}

      {groups.map(([service, list]) => (
        <section key={service}>
          <h3 className="text-2xs font-semibold text-text-secondary uppercase tracking-wide mb-2">{accountServiceLabel(service)}</h3>
          <div className="space-y-2">
            {list.map(r => <LoginCard key={r.id} clientId={clientId} row={r} onEdit={() => setModal({ mode: 'edit', row: r })} onChanged={reload} />)}
          </div>
        </section>
      ))}

      {modal && (
        <LoginModal clientId={clientId} clientName={clientName}
          row={modal.mode === 'edit' ? modal.row : null}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); reload() }} />
      )}
    </div>
  )
}

function LoginCard({ clientId, row, onEdit, onChanged }: {
  clientId: string; row: ClientLoginRow; onEdit: () => void; onChanged: () => void
}) {
  const [secret, setSecret] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const reveal = () => start(async () => {
    const res = await revealLoginSecret(clientId, row.id)
    if (!res.ok) { toast.error(res.error); return }
    setSecret(res.data)
  })
  const copySecret = () => start(async () => {
    const res = secret !== null ? { ok: true as const, data: secret } : await revealLoginSecret(clientId, row.id)
    if (!res.ok) { toast.error(res.error); return }
    await navigator.clipboard.writeText(res.data)
    toast.success('Password copiata')
  })
  const copyUser = async () => { await navigator.clipboard.writeText(row.username); toast.success('Utente copiato') }
  const remove = () => start(async () => {
    if (!confirm(`Eliminare l'accesso ${row.label || row.username || accountServiceLabel(row.service)}?`)) return
    const res = await deleteLogin(clientId, row.id)
    if (!res.ok) { toast.error(res.error); return }
    onChanged()
  })

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">{row.label || accountServiceLabel(row.service)}</span>
            {row.url && (
              <a href={row.url} target="_blank" rel="noreferrer" className="text-2xs text-gold-text inline-flex items-center gap-1">
                apri <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-2xs text-text-tertiary self-center">Utente</dt>
            <dd className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-text-primary break-all">{row.username || '—'}</span>
              {row.username && <button onClick={copyUser} aria-label="Copia utente" className="text-text-tertiary hover:text-text-primary"><Copy className="w-3.5 h-3.5" /></button>}
            </dd>
            <dt className="text-2xs text-text-tertiary self-center">Password</dt>
            <dd className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-text-primary break-all">{!row.has_secret ? '—' : secret ?? '••••••••••'}</span>
              {row.has_secret && (secret === null
                ? <button onClick={reveal} disabled={pending} aria-label="Mostra password" className="text-text-tertiary hover:text-text-primary"><Eye className="w-3.5 h-3.5" /></button>
                : <button onClick={() => setSecret(null)} aria-label="Nascondi password" className="text-text-tertiary hover:text-text-primary"><EyeOff className="w-3.5 h-3.5" /></button>)}
              {row.has_secret && <button onClick={copySecret} disabled={pending} aria-label="Copia password" className="text-text-tertiary hover:text-text-primary"><Copy className="w-3.5 h-3.5" /></button>}
            </dd>
            {row.note && (<><dt className="text-2xs text-text-tertiary">Note</dt><dd className="text-text-secondary whitespace-pre-wrap">{row.note}</dd></>)}
          </dl>
        </div>
        <div className="flex gap-1 shrink-0">
          <GhostButton small onClick={onEdit} ariaLabel="Modifica"><Pencil className="w-3.5 h-3.5" /></GhostButton>
          <GhostButton small danger onClick={remove} pending={pending} ariaLabel="Elimina"><Trash2 className="w-3.5 h-3.5" /></GhostButton>
        </div>
      </div>
    </div>
  )
}

function LoginModal({ clientId, clientName, row, onClose, onSaved }: {
  clientId: string; clientName?: string; row: ClientLoginRow | null; onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState({
    service: row?.service ?? 'instagram', label: row?.label ?? '', username: row?.username ?? '',
    url: row?.url ?? '', note: row?.note ?? '',
  })
  const [secret, setSecret] = useState('')
  const [secretTouched, setSecretTouched] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [pending, start] = useTransition()

  const submit = () => start(async () => {
    const input: LoginInput = { ...f }
    // la password viaggia solo se la si è toccata: vuota di proposito = cancellarla
    if (!row || secretTouched) input.secret = secret
    const res = row ? await updateLogin(clientId, row.id, input) : await createLogin(clientId, input)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(row ? 'Accesso aggiornato' : 'Accesso salvato')
    onSaved()
  })

  return (
    <ModalShell title={row ? 'Modifica accesso' : 'Nuovo accesso'} hint={clientName} icon={<KeyRound className="w-4 h-4 text-gold-text" />}
      onClose={onClose} onSubmit={submit} submitLabel={row ? 'Salva' : 'Crea'} canSubmit={!!f.service.trim()} pending={pending}>
      <Field label="Servizio" hint="qualsiasi testo: il menu è solo un aiuto">
        <input list="tracking-services" value={f.service} onChange={e => setF(s => ({ ...s, service: e.target.value }))} className={inputCls} />
        <datalist id="tracking-services">{ACCOUNT_SERVICES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</datalist>
      </Field>
      <Field label="Etichetta" hint="es. profilo principale, casella info@">
        <input value={f.label} onChange={e => setF(s => ({ ...s, label: e.target.value }))} className={inputCls} />
      </Field>
      <Field label="Utente / email">
        <input value={f.username} onChange={e => setF(s => ({ ...s, username: e.target.value }))} className={`${inputCls} font-mono`} autoComplete="off" />
      </Field>
      <Field label="Password" hint={row?.has_secret && !secretTouched ? 'salvata: lascia vuoto per non cambiarla' : undefined}>
        <div className="flex gap-2">
          <input type={showSecret ? 'text' : 'password'} value={secret}
            onChange={e => { setSecret(e.target.value); setSecretTouched(true) }}
            className={`${inputCls} font-mono`} autoComplete="new-password"
            placeholder={row?.has_secret ? '••••••••••' : ''} />
          <GhostButton small onClick={() => setShowSecret(v => !v)} ariaLabel={showSecret ? 'Nascondi' : 'Mostra'}>
            {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </GhostButton>
        </div>
      </Field>
      <Field label="Indirizzo" hint="pagina di accesso">
        <input value={f.url} onChange={e => setF(s => ({ ...s, url: e.target.value }))} className={inputCls} placeholder="https://…" inputMode="url" />
      </Field>
      <Field label="Note">
        <textarea value={f.note} onChange={e => setF(s => ({ ...s, note: e.target.value }))} rows={3} className={inputCls} />
      </Field>
    </ModalShell>
  )
}

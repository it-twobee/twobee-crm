'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Copy, ExternalLink, Loader2, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { getClientPortalAccess, inviteClientPortal, resetClientPortalPassword, revokeClientPortalAccess, updateClientPortalAccess } from '@/app/actions/portal-access'
import { PORTAL_ROLES } from '@/lib/portal/access'
import type { PortalAccessData, PortalAccessInput, PortalAccessLink, PortalMember, PortalRole } from '@/lib/portal/access'
import type { ClientContact } from '@/lib/types/database'
import { portalHref } from '@/lib/portal/model'

const emptyForm = (): PortalAccessInput => ({ email: '', name: '', role: 'referente', scope: 'all', projectIds: [] })
const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border-interactive bg-surface px-3 py-2 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50'
const field = 'w-full rounded-lg border border-border-interactive bg-background px-3 py-2 text-sm text-text-primary disabled:opacity-60'

export function ClientPortalTab({ clientId, contacts }: { clientId: string; contacts: ClientContact[] }) {
  const [data, setData] = useState<PortalAccessData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<PortalAccessInput | null>(null)
  const [editing, setEditing] = useState<PortalMember | null>(null)
  const [revoking, setRevoking] = useState<PortalMember | null>(null)
  const [link, setLink] = useState<PortalAccessLink | null>(null)

  useEffect(() => {
    let disposed = false
    getClientPortalAccess(clientId).then(result => {
      if (disposed) return
      if (result.error) setError(result.error)
      else setData(result.data ?? null)
    }).catch(() => { if (!disposed) setError('Non è stato possibile caricare gli accessi.') })
      .finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true }
  }, [clientId])

  async function reload() {
    setLoading(true)
    try {
      const result = await getClientPortalAccess(clientId)
      if (result.error) { setError(result.error); setData(null) }
      else { setData(result.data ?? null); setError('') }
    } catch { setError('Non è stato possibile caricare gli accessi.'); setData(null) }
    finally { setLoading(false) }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); toast.success('Link copiato.') }
    catch { toast.error('Copia automatica non disponibile: seleziona il link e copialo manualmente.') }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!form || busy) return
    setBusy(true); setLink(null)
    try {
      if (editing) {
        const result = await updateClientPortalAccess(clientId, editing.profileId, editing.revision, form)
        if (result.error) { toast.error(result.error); return }
        toast.success(editing.revokedAt ? 'Accesso riattivato.' : 'Permessi aggiornati.')
      } else {
        const result = await inviteClientPortal(clientId, form)
        if (result.error) { toast.error(result.error); await reload(); return }
        setLink(result.data ?? null)
        toast.success(result.data?.kind === 'login' ? 'Account esistente abilitato al cliente.' : 'Invito pronto da condividere.')
      }
      setForm(null); setEditing(null)
      await reload()
    } catch { toast.error('Operazione non riuscita. Aggiorna gli accessi prima di riprovare.') }
    finally { setBusy(false) }
  }

  async function reset(member: PortalMember) {
    if (busy) return
    setBusy(true); setLink(null)
    try {
      const result = await resetClientPortalPassword(clientId, member.profileId)
      if (result.error) toast.error(result.error)
      else { setLink(result.data ?? null); toast.success('Link personale pronto da condividere.') }
    } catch { toast.error('Non è stato possibile generare il link.') }
    finally { setBusy(false) }
  }

  async function revoke() {
    if (!revoking || busy) return
    setBusy(true); setLink(null)
    try {
      const result = await revokeClientPortalAccess(clientId, revoking.profileId, revoking.revision)
      if (result.error) toast.error(result.error)
      else { toast.success('Accesso al cliente revocato.'); setRevoking(null) }
      await reload()
    } catch { toast.error('Non è stato possibile revocare l’accesso.') }
    finally { setBusy(false) }
  }

  function edit(member: PortalMember) {
    setEditing(member); setLink(null); setRevoking(null)
    setForm({ name: member.name, email: member.email, role: member.role, scope: member.scope, projectIds: [...member.projectIds] })
  }

  return <section className="space-y-5" aria-label="Portale cliente">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold text-text-primary">Portale cliente</h2>
        <p className="mt-1 text-sm text-text-secondary">Link, referenti e permessi di accesso, sempre in questa scheda.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={button} onClick={() => copy(new URL(portalHref('/portale', clientId), window.location.origin).toString())}><Copy className="h-4 w-4" /> Copia link portale</button>
        <Link className={button} href={portalHref('/portale', clientId)}><ExternalLink className="h-4 w-4" /> Apri anteprima</Link>
      </div>
    </div>
    <p className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
      Il link del portale richiede l’account personale del referente. Per il primo accesso genera un invito:
      il cliente sceglie la propria password e vede soltanto le aziende e i progetti autorizzati.
    </p>

    {link && <div className="space-y-3 rounded-xl border border-border-strong bg-surface p-4" role="status">
      <h3 className="font-semibold text-text-primary">{link.kind === 'login' ? 'Accesso abilitato' : link.kind === 'invite' ? 'Invito personale' : 'Reimpostazione password'}</h3>
      <p className="text-sm text-text-secondary">{link.kind === 'login'
        ? 'Il referente ha già un account: può accedere con la sua password. Condividi questo link.'
        : 'Copia e invia questo link soltanto al referente. È monouso e scade secondo la configurazione dell’autenticazione. Il cliente sceglie la password; nessuna email è stata inviata automaticamente.'}</p>
      <label className="block text-sm text-text-primary">Link da condividere
        <input className={`${field} mt-1`} readOnly value={link.url} onFocus={event => event.target.select()} />
      </label>
      <div className="flex gap-2"><button className={button} onClick={() => copy(link.url)}><Copy className="h-4 w-4" /> Copia link</button>
        <button className={button} onClick={() => setLink(null)}>Chiudi</button></div>
    </div>}

    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold text-text-primary">Persone autorizzate</h3>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={loading || busy} onClick={reload}><RefreshCw className="h-4 w-4" /> Aggiorna</button>
        <button className={button} disabled={!data || loading || busy} onClick={() => { setEditing(null); setForm(emptyForm()); setRevoking(null); setLink(null) }}><Plus className="h-4 w-4" /> Invita referente</button>
      </div>
    </div>
    {loading && <p className="flex items-center gap-2 text-sm text-text-secondary" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento accessi…</p>}
    {error && <p className="rounded-xl border border-error/30 bg-error-dim p-4 text-sm text-error" role="alert">{error}</p>}

    {form && <form onSubmit={save} className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <h3 className="font-semibold text-text-primary">{editing ? editing.revokedAt ? 'Riattiva accesso' : 'Modifica permessi' : 'Invita una persona'}</h3>
      {!editing && contacts.some(c => c.email) && <label className="block text-sm text-text-secondary">Compila da un contatto
        <select className={`${field} mt-1`} defaultValue="" disabled={busy} onChange={event => {
          const contact = contacts.find(c => c.id === event.target.value)
          if (contact) setForm({ ...form, name: contact.full_name, email: contact.email ?? '' })
        }}><option value="">Inserisci manualmente o scegli un contatto</option>{contacts.filter(c => c.email).map(c => <option key={c.id} value={c.id}>{c.full_name} · {c.email}</option>)}</select>
      </label>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-text-secondary">Nome e cognome<input required maxLength={160} className={`${field} mt-1`} value={form.name} disabled={busy || !!editing} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
        <label className="block text-sm text-text-secondary">Email personale<input type="email" required maxLength={254} className={`${field} mt-1`} value={form.email} disabled={busy || !!editing} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
        <label className="block text-sm text-text-secondary">Ruolo nel portale<select className={`${field} mt-1`} value={form.role} disabled={busy} onChange={event => setForm({ ...form, role: event.target.value as PortalRole })}>{Object.entries(PORTAL_ROLES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block text-sm text-text-secondary">Accesso ai progetti<select className={`${field} mt-1`} value={form.scope} disabled={busy} onChange={event => setForm({ ...form, scope: event.target.value as 'all' | 'selected', projectIds: [] })}><option value="all">Tutti i progetti condivisi, anche futuri</option><option value="selected">Solo i progetti selezionati</option></select></label>
      </div>
      <p className="text-sm text-text-secondary">I permessi non pubblicano contenuti: progetti e documenti interni restano riservati.</p>
      {form.scope === 'selected' && <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold text-text-primary">Progetti autorizzati</legend>
        {!data?.projects.length && <p className="text-sm text-text-secondary">Nessun progetto disponibile. Scegli tutti i progetti condivisi oppure crea prima il progetto.</p>}
        {data?.projects.map(project => <label key={project.id} className="flex items-center gap-2 text-sm text-text-primary"><input type="checkbox" disabled={busy} checked={form.projectIds.includes(project.id)} onChange={event => setForm({ ...form, projectIds: event.target.checked ? [...form.projectIds, project.id] : form.projectIds.filter(id => id !== project.id) })} />{project.name}</label>)}
      </fieldset>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-on-gold disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? 'Salva accesso' : 'Genera invito'}</button>
        <button type="button" disabled={busy} className={button} onClick={() => { setForm(null); setEditing(null) }}>Annulla</button>
      </div>
    </form>}

    {data && !loading && !data.members.length && <p className="rounded-xl border border-border p-5 text-sm text-text-secondary">Nessun referente abilitato. La sezione è pronta: genera il primo invito quando vuoi dare accesso al cliente.</p>}
    {data?.members.map(member => <div key={member.id} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h4 className="font-semibold text-text-primary">{member.name}</h4><p className="break-all text-sm text-text-secondary">{member.email}</p></div>
        <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${member.revokedAt || !member.active ? 'bg-error-dim text-error' : member.activated ? 'bg-success-dim text-success' : 'bg-warning-dim text-warning'}`}>{member.revokedAt ? 'Revocato' : !member.active ? 'Account disabilitato' : member.activated ? 'Attivo' : 'Da attivare'}</span>
      </div>
      <p className="text-sm text-text-secondary">{PORTAL_ROLES[member.role]} · {member.scope === 'all' ? 'Tutti i progetti condivisi' : `${member.projectIds.length} progetti autorizzati`}</p>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy || !member.active} onClick={() => edit(member)}>{member.revokedAt ? 'Riattiva accesso' : 'Modifica permessi'}</button>
        {!member.revokedAt && <>
          <button className={button} disabled={busy || !member.active} onClick={() => reset(member)}>{member.activated ? 'Reimposta password' : 'Rigenera invito'}</button>
          <button className={button} disabled={busy} onClick={() => { setRevoking(member); setForm(null); setLink(null) }}>Revoca accesso</button>
        </>}
      </div>
      {revoking?.id === member.id && <div className="space-y-3 rounded-lg border border-error/30 bg-error-dim p-3" role="alert">
        <p className="text-sm text-text-primary">Revocare l’accesso di {member.name} a questa azienda? Gli eventuali accessi ad altre aziende resteranno attivi.</p>
        <div className="flex flex-wrap gap-2"><button disabled={busy} className={button} onClick={revoke}>Conferma revoca</button><button disabled={busy} className={button} onClick={() => setRevoking(null)}>Annulla</button></div>
      </div>}
    </div>)}
    <p className="text-sm text-text-secondary">Password dimenticata? «Reimposta password» genera un link personale: la password attuale cambia solo quando il referente ne sceglie una nuova.</p>
  </section>
}

import { getViewer } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isExternalResource } from '@/lib/permissions'
import { isMissingPortalSchema, REQUEST_STATUS, portalDate } from '@/lib/portal/model'
import { EmptyState, PortalHeading } from './PortalContent'

export async function PortalQueue() {
  const { profile, isAdmin } = await getViewer()
  if (!profile || profile.is_active === false || (!isAdmin && (profile.role !== 'team' || isExternalResource(profile.app_role) || profile.app_role === 'viewer'))) {
    return <div className="p-6"><EmptyState title="Coda riservata al team interno.">Per le attività assegnate usa la sezione Task.</EmptyState></div>
  }
  const db = await createClient()
  const requests = await db.from('portal_requests').select('id, title, body, status, assigned_to, created_at').not('status', 'in', '(chiusa,annullata,non_accolta)').order('created_at').limit(100)
  if (isMissingPortalSchema(requests.error)) return <div className="p-6 sm:p-8"><PortalHeading eyebrow="Customer Care · Portale cliente" title="Da gestire">Il punto di raccolta per richieste, materiali e pubblicazioni.</PortalHeading><EmptyState title="La coda del portale è in preparazione.">Richiede la migration 233, scritta e non applicata. Qui arriveranno richieste da assegnare, risposte da verificare, consegne da pubblicare e approvazioni in attesa.</EmptyState><p className="mt-5 text-sm text-text-secondary">Le conversazioni esistenti restano nella scheda Conversazioni. Nessuna nota interna viene trasferita al cliente.</p></div>
  const [activities, versions] = await Promise.all([
    db.from('portal_activities').select('id, title, status, kind').in('status', ['da_fare', 'in_verifica']).limit(100),
    db.from('portal_deliverable_versions').select('id, title, version').is('published_at', null).limit(100),
  ])
  if (requests.error || activities.error || versions.error) return <div role="alert" className="p-6 text-sm text-error">Non è stato possibile leggere la coda. Ricarica la pagina; l’assenza di dati non è stata verificata.</div>
  return <div className="p-6 sm:p-8"><PortalHeading eyebrow="Customer Care · Portale cliente" title="Da gestire">Consultazione del primo incremento. Assegnazioni, risposte pubbliche e pubblicazione saranno attivate dopo le prove su staging.</PortalHeading>
    <section className="mb-10"><h2 className="mb-4 font-heading text-xl font-semibold">Richieste aperte</h2>{!requests.data?.length ? <EmptyState title="Nessuna richiesta aperta.">Le nuove richieste saranno assegnate al referente del progetto; in sua assenza resteranno da assegnare.</EmptyState> : requests.data.map(r => <details key={r.id} className="border-b border-border py-4"><summary className="cursor-pointer text-sm font-medium">{r.title} · {REQUEST_STATUS[r.status]}{!r.assigned_to && <span className="ml-2 text-warning">Da assegnare</span>}</summary><p className="mt-2 text-xs text-text-secondary">{portalDate(r.created_at)}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm">{r.body}</p><p className="mt-3 text-xs text-text-secondary">Contenuto pubblico della richiesta. Le note interne sono conservate separatamente.</p></details>)}</section>
    <section className="mb-10"><h2 className="mb-4 font-heading text-xl font-semibold">Materiali e approvazioni</h2>{!activities.data?.length ? <p className="text-sm text-text-secondary">Nessun elemento in attesa.</p> : activities.data.map(a => <p key={a.id} className="border-b border-border py-3 text-sm">{a.title} · {a.status === 'in_verifica' ? 'Risposta da verificare' : a.kind === 'approvazione' ? 'Approvazione in attesa' : 'In attesa del cliente'}</p>)}</section>
    <section><h2 className="mb-4 font-heading text-xl font-semibold">Consegne da pubblicare</h2>{!versions.data?.length ? <p className="text-sm text-text-secondary">Nessuna versione in bozza.</p> : versions.data.map(v => <p key={v.id} className="border-b border-border py-3 text-sm">{v.title} · versione {v.version}</p>)}</section>
  </div>
}

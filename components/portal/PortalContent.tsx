import Link from 'next/link'
import { ArrowRight, Clock3 } from 'lucide-react'
import { ACTIVITY_STATUS, PROJECT_STATUS, portalDate, portalHref } from '@/lib/portal/model'
import type { PortalActivity, PortalProject, PortalVersion } from '@/lib/portal/model'

export function PortalHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return <div className="mb-9 max-w-3xl"><p className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-secondary">{eyebrow}</p><h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h1>{children && <div className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">{children}</div>}</div>
}

export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border-strong px-5 py-7 sm:px-7"><h3 className="text-base font-medium">{title}</h3><div className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">{children}</div></div>
}

export function SetupNotice({ legacy }: { legacy: boolean }) {
  return <p className="mb-8 flex items-start gap-3 rounded-lg bg-surface px-4 py-3 text-sm text-text-secondary"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{legacy ? 'Portale in preparazione. Puoi consultare i progetti già condivisi; attività, consegne versionate e richieste saranno disponibili dopo l’attivazione.' : 'Prima versione in consultazione. Invii, materiali e approvazioni non sono ancora attivi.'}</span></p>
}

export function NoCompany() {
  return <EmptyState title="Il tuo accesso è da collegare a un’azienda.">Contatta il tuo referente TwoBee per verificare l’invito e l’associazione. Qui compariranno soltanto i contenuti autorizzati per il tuo account.</EmptyState>
}

export function ProjectList({ projects, clientId }: { projects: PortalProject[]; clientId: string }) {
  if (!projects.length) return <EmptyState title="Nessun progetto ancora condiviso.">Il tuo referente pubblicherà qui il perimetro del lavoro e i prossimi passi. Se ne stai già aspettando uno, puoi chiedergli un aggiornamento.</EmptyState>
  return <div className="divide-y divide-border border-y border-border">{projects.map(p => <Link key={p.id} href={portalHref(`/portale/progetti/${p.id}`, clientId)} className="group grid gap-3 py-6 hover:bg-surface-hover sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:gap-8 sm:px-3">
    <div className="min-w-0"><p className="mb-1 text-xs capitalize text-text-secondary">{p.area} · {PROJECT_STATUS[p.status] ?? 'Stato da aggiornare'}</p><h3 className="break-words text-lg font-semibold group-hover:text-gold-text">{p.title}</h3></div>
    <div className="min-w-0"><p className="text-xs text-text-secondary">Prossimo passo</p><p className="mt-1 break-words text-sm">{p.next_step ?? 'In attesa di un aggiornamento condiviso'}</p>{p.target_date && <p className="mt-1 text-xs text-text-secondary">Data {p.date_kind}: {portalDate(p.target_date)}</p>}</div>
    <ArrowRight className="hidden h-5 w-5 text-text-secondary sm:block" aria-hidden="true" />
  </Link>)}</div>
}

export function ActivityList({ activities, projects, clientId, legacy }: { activities: PortalActivity[]; projects: PortalProject[]; clientId: string; legacy: boolean }) {
  if (!activities.length) return <EmptyState title={legacy ? 'Le attività cliente non sono ancora attive.' : 'Non ci sono attività richieste in questo momento.'}>{legacy ? 'Qui troverai materiali da inviare, domande a cui rispondere e versioni da approvare. Le attività del team restano nel loro spazio operativo.' : 'Quando servirà il tuo contributo, troverai qui cosa fare, perché serve e la scadenza.'}</EmptyState>
  return <div className="divide-y divide-border border-y border-border">{activities.map(a => <article key={a.id} className="py-6">
    <div className="flex flex-wrap items-baseline justify-between gap-3"><h3 className="text-lg font-semibold">{a.title}</h3><span className="text-sm text-text-secondary">{ACTIVITY_STATUS[a.status] ?? 'Da verificare'}</span></div>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-text-secondary">{a.reason}</p>
    <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm"><div><dt className="text-xs text-text-secondary">Entro quando</dt><dd>{portalDate(a.due_date)}</dd></div><div><dt className="text-xs text-text-secondary">A chi rivolgerti</dt><dd>{a.contact_name}</dd></div><div><dt className="text-xs text-text-secondary">Progetto</dt><dd><Link className="text-gold-text underline underline-offset-4" href={portalHref(`/portale/progetti/${a.project_id}`, clientId)}>{projects.find(p => p.id === a.project_id)?.title ?? 'Apri progetto'}</Link></dd></div></dl>
    <p className="mt-4 text-xs text-text-secondary">{a.kind === 'approvazione' ? 'Rivedi e approva' : a.kind === 'materiale' ? 'Allega il materiale' : 'Rispondi'} · azione disponibile dopo l’attivazione.{a.kind === 'materiale' && ' Il materiale passerà in verifica al team.'}</p>
  </article>)}</div>
}

export function VersionList({ versions }: { versions: PortalVersion[] }) {
  if (!versions.length) return <EmptyState title="Nessuna consegna pubblicata.">Le consegne compariranno qui con versione, autore e data di pubblicazione.</EmptyState>
  return <ul className="divide-y divide-border">{versions.map(v => <li key={v.id} className="py-4"><p className="font-medium">{v.title} <span className="text-sm text-text-secondary">· versione {v.version}</span></p><p className="mt-1 text-xs text-text-secondary">{v.author_name} · {portalDate(v.published_at)}</p>{v.approval_required && <p className="mt-2 text-sm text-warning">Questa versione richiede una verifica. Consultarla non equivale ad approvarla.</p>}<p className="mt-2 text-xs text-text-secondary">Download protetto disponibile dopo l’attivazione.</p></li>)}</ul>
}

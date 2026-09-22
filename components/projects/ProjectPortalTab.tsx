'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, EyeOff, FileUp, Loader2, Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  addDeliverableVersion, createDeliverable, deleteDeliverableDraft, publishClientTask,
  publishDeliverableVersion, publishProject, retireDeliverableVersion, saveProjectPortalDraft,
  withdrawClientActivity, withdrawProject,
} from '@/app/actions/portal-publish'
import {
  PORTAL_ACTIVITY_KINDS, PORTAL_DATE_KINDS, PORTAL_PHASES,
  blockedReason, missingForPublication, needsRepublish,
} from '@/lib/portal/publish'
import type { PortalActivityKind, PortalProjectFields } from '@/lib/portal/publish'
import { portalDate } from '@/lib/portal/model'
import { humanBytes, materialDownloadHref } from '@/lib/portal/materials'
import type { PortalActivity, PortalProject, PortalVersion } from '@/lib/portal/model'
import { ActivityList, ProjectList, VersionList } from '@/components/portal/PortalContent'

const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border-interactive bg-surface px-3 py-2 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50'
const primary = 'inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-3 py-2 text-sm font-semibold text-on-gold hover:opacity-90 disabled:opacity-50'
const field = 'w-full rounded-lg border border-border-interactive bg-background px-3 py-2 text-sm text-text-primary disabled:opacity-60'
const label = 'block text-2xs font-semibold uppercase tracking-wide text-text-secondary'

export type PortalTaskRow = {
  id: string; title: string; description: string | null; due_date: string | null
  deleted_at: string | null; task_type: string; client_id: string | null
  activity: { id: string; status: string; kind: string; published_at: string | null } | null
}
export type PortalVersionRow = {
  id: string; version: number; title: string; author_name: string
  approval_required: boolean; published_at: string | null; retired_at: string | null
}
export type PortalDeliverableRow = { id: string; title: string; versions: PortalVersionRow[] }

export type PortalMaterialRow = {
  id: string; project_id: string | null; name: string; mime: string | null
  size: number; kind: string; uploaded_by_name: string; created_at: string
}

export type ProjectPortalData = {
  projectId: string
  clientId: string
  companyName: string
  projectName: string
  /** a chi si rivolge il cliente quando il progetto non dichiara un referente */
  fallbackContact: string
  area: string
  status: string
  saved: PortalProjectFields
  publishedAt: string | null
  publishedBy: string | null
  tasks: PortalTaskRow[]
  deliverables: PortalDeliverableRow[]
  materials: PortalMaterialRow[]
  materialsMissing: boolean
  schemaMissing: boolean
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
    <h3 className="font-heading text-lg font-semibold">{title}</h3>
    {hint && <p className="mt-1 text-sm text-text-secondary">{hint}</p>}
    <div className="mt-4">{children}</div>
  </section>
}

export function ProjectPortalTab({ data }: { data: ProjectPortalData }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [draft, setDraft] = useState<PortalProjectFields>(data.saved)
  const [newDeliverable, setNewDeliverable] = useState('')
  const [uploadFor, setUploadFor] = useState<string | null>(null)
  const [approval, setApproval] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const published = !!data.publishedAt
  const missing = missingForPublication(draft)
  const changed = needsRepublish(data.saved, draft)

  const set = <K extends keyof PortalProjectFields>(key: K, value: PortalProjectFields[K]) =>
    setDraft(d => ({ ...d, [key]: value }))

  function run(action: () => Promise<{ error?: string }>, ok: string) {
    start(async () => {
      const result = await action()
      if (result?.error) { toast.error(result.error); return }
      toast.success(ok)
      router.refresh()
    })
  }

  // L'anteprima usa i componenti veri del portale: non è una rappresentazione.
  const previewProject: PortalProject = useMemo(() => ({
    id: data.projectId, client_id: data.clientId, title: draft.title || data.projectName,
    area: data.area, status: data.status, objective: draft.objective, scope: draft.scope,
    update: draft.update, next_step: draft.next_step, contact: draft.contact,
    published_at: data.publishedAt, target_date: draft.target_date,
    date_kind: draft.date_kind, phase: draft.phase,
  }), [data, draft])

  const previewActivities: PortalActivity[] = useMemo(() => data.tasks
    .filter(t => t.activity?.published_at)
    .map(t => ({
      id: t.activity!.id, project_id: null, title: t.title, reason: t.description ?? '',
      kind: t.activity!.kind, due_date: t.due_date, contact_name: data.saved.contact || data.fallbackContact,
      status: t.activity!.status, version_id: null,
    })), [data])

  const previewVersions: PortalVersion[] = useMemo(() => data.deliverables.flatMap(d =>
    d.versions.filter(v => v.published_at && !v.retired_at).map(v => ({
      id: v.id, project_id: data.projectId, deliverable_id: d.id, title: v.title,
      version: v.version, author_name: v.author_name, published_at: v.published_at!,
      approval_required: v.approval_required,
    }))), [data])

  async function upload(deliverableId: string, file: File) {
    setUploading(true)
    try {
      const body = new FormData()
      body.set('file', file)
      body.set('folder', 'deliverables')
      body.set('entityType', 'project')
      body.set('entityId', data.projectId)
      const response = await fetch('/api/files/upload', { method: 'POST', body })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || 'Caricamento non riuscito.')
      const created = await addDeliverableVersion(data.projectId, deliverableId, payload.file.id, { approvalRequired: approval })
      if (created.error) throw new Error(created.error)
      toast.success('Versione creata in bozza: pubblicala quando è pronta.')
      setUploadFor(null); setApproval(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Caricamento non riuscito.')
    } finally { setUploading(false) }
  }

  if (data.schemaMissing) return <div className="max-w-3xl rounded-xl border border-border bg-surface p-5">
    <h3 className="font-heading text-lg font-semibold">Pubblicazione non ancora attiva</h3>
    <p className="mt-2 text-sm text-text-secondary">Richiede la migration 249 del portale. Finché non è applicata questa scheda non pubblica niente: non simula un invio riuscito.</p>
  </div>

  return <div className="max-w-6xl space-y-4 animate-fade-in">
    <Section title="Stato nel portale" hint={published
      ? 'Il cliente vede questo progetto e ciò che ci sta sotto.'
      : 'Il progetto è interno. Niente arriva al cliente finché non lo pubblichi.'}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${published ? 'bg-success-dim text-success' : 'bg-surface-hover text-text-secondary'}`}>
          {published ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
          {published ? `Pubblicato il ${portalDate(data.publishedAt)}${data.publishedBy ? ` da ${data.publishedBy}` : ''}` : 'Non pubblicato'}
        </span>
        <button type="button" className={primary} disabled={pending || !!missing.length}
          onClick={() => run(() => publishProject(data.projectId, draft), published ? 'Aggiornamento pubblicato.' : 'Progetto pubblicato nel portale.')}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {published ? 'Pubblica aggiornamento' : 'Pubblica nel portale'}
        </button>
        {!published && <button type="button" className={button} disabled={pending || !draft.title.trim()}
          onClick={() => run(() => saveProjectPortalDraft(data.projectId, draft), 'Bozza salvata: il cliente non la vede.')}>Salva bozza</button>}
        {published && <button type="button" className={button} disabled={pending}
          onClick={() => run(() => withdrawProject(data.projectId), 'Progetto ritirato dal portale.')}>Ritira dal portale</button>}
        <Link href={`/portale?client=${data.clientId}`} className={button} target="_blank" rel="noreferrer">Apri il portale</Link>
      </div>
      {!!missing.length && <p className="mt-3 flex items-start gap-2 text-sm text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Manca {missing.join(', ')}: senza, la scheda del cliente resta muta.</p>}
      {published && changed && <p className="mt-3 text-sm text-info">Hai modificato i contenuti condivisi. Il cliente vede ancora la versione precedente finché non ripubblichi.</p>}
      {published && <p className="mt-3 text-2xs text-text-secondary">Ritirando il progetto spariscono insieme a lui le sue consegne e le attività collegate. Le attività d’azienda restano.</p>}
    </Section>

    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Contenuti condivisi" hint="Campi dedicati: il brief interno e le note del team non passano di qui.">
        <div className="space-y-3">
          <div><label className={label} htmlFor="portal-title">Titolo pubblico</label>
            <input id="portal-title" className={field} value={draft.title} maxLength={240}
              onChange={e => set('title', e.target.value)} placeholder="Come chiamiamo questo lavoro col cliente" /></div>
          {([['objective', 'Obiettivo', 'Perché stiamo facendo questo lavoro'],
             ['scope', 'Perimetro condiviso', 'Cosa è compreso, e cosa no'],
             ['update', 'Ultimo aggiornamento', 'Cosa è successo dall’ultima volta'],
             ['next_step', 'Prossimo passo', 'Cosa succede adesso']] as const).map(([key, title, hint]) => (
            <div key={key}><label className={label} htmlFor={`portal-${key}`}>{title}</label>
              <textarea id={`portal-${key}`} className={`${field} min-h-20`} value={draft[key] ?? ''} maxLength={5000}
                onChange={e => set(key, e.target.value || null)} placeholder={hint} /></div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={label} htmlFor="portal-contact">Referente</label>
              <input id="portal-contact" className={field} value={draft.contact ?? ''} maxLength={240}
                onChange={e => set('contact', e.target.value || null)} placeholder="A chi si rivolge il cliente" /></div>
            <div><label className={label} htmlFor="portal-phase">Momento della relazione</label>
              <select id="portal-phase" className={field} value={draft.phase ?? ''}
                onChange={e => set('phase', (e.target.value || null) as PortalProjectFields['phase'])}>
                <option value="">Non dichiarato</option>
                {Object.entries(PORTAL_PHASES).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
              </select></div>
            <div><label className={label} htmlFor="portal-date">Data</label>
              <input id="portal-date" type="date" className={field} value={draft.target_date ?? ''}
                onChange={e => set('target_date', e.target.value || null)} /></div>
            <div><label className={label} htmlFor="portal-date-kind">Tipo di data</label>
              <select id="portal-date-kind" className={field} value={draft.date_kind}
                onChange={e => set('date_kind', e.target.value as PortalProjectFields['date_kind'])}>
                {Object.entries(PORTAL_DATE_KINDS).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
              </select></div>
          </div>
          <button type="button" className={button} disabled={pending || !changed} onClick={() => setDraft(data.saved)}>Annulla le modifiche</button>
        </div>
      </Section>

      <Section title="Anteprima" hint="Gli stessi componenti che vede il cliente, con quello che hai scritto adesso.">
        <div className="space-y-6 rounded-lg border border-dashed border-border-strong p-4">
          <ProjectList projects={[previewProject]} clientId={data.clientId} />
          <div><h4 className="mb-2 font-heading text-base font-semibold">Le tue attività</h4>
            <ActivityList activities={previewActivities} projects={[previewProject]} clientId={data.clientId} legacy={false} companyName={data.companyName} /></div>
          <div><h4 className="mb-2 font-heading text-base font-semibold">Consegne e documenti</h4>
            <VersionList versions={previewVersions} /></div>
        </div>
      </Section>
    </div>

    <Section title="Attività al cliente" hint="Nascono dalle task «al cliente» dell’azienda: si scrivono una volta sola, qui si decide se condividerle.">
      {!data.tasks.length ? <p className="text-sm text-text-secondary">Nessuna task al cliente per {data.companyName}. Si creano dal composer delle task, scegliendo «Al cliente».</p>
        : <ul className="divide-y divide-border">{data.tasks.map(task => {
          const blocked = blockedReason(task)
          const shared = !!task.activity?.published_at
          return <li key={task.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium">{task.title}</p>
              <p className="mt-1 break-words text-2xs text-text-secondary">
                {task.description?.trim() || 'Nessun perché scritto'} · {task.due_date ? `entro ${portalDate(task.due_date)}` : 'senza scadenza'}
              </p>
              {blocked && <p className="mt-1 text-2xs text-warning">{blocked}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-md px-2 py-1 text-2xs font-medium ${shared ? 'bg-success-dim text-success' : task.activity ? 'bg-warning-dim text-warning' : 'bg-surface-hover text-text-secondary'}`}>
                {shared ? 'Condivisa' : task.activity ? 'Ritirata' : 'Non condivisa'}
              </span>
              {!shared && <PublishTaskButton disabled={pending || !!blocked} onPublish={kind =>
                run(() => publishClientTask(task.id, { kind, contactName: data.saved.contact || data.fallbackContact }), 'Attività condivisa col cliente.')} />}
              {shared && <button type="button" className={button} disabled={pending}
                onClick={() => run(() => withdrawClientActivity(task.activity!.id), 'Attività ritirata.')}>Ritira</button>}
            </div>
          </li>
        })}</ul>}
    </Section>

    <Section title="Consegne" hint="Carica il file, crea la versione, poi pubblicala. Una versione pubblicata non si modifica: si ritira, o se ne pubblica una nuova.">
      <div className="mb-4 flex flex-wrap gap-2">
        <input className={`${field} max-w-xs`} value={newDeliverable} maxLength={240} placeholder="Nome della consegna"
          onChange={e => setNewDeliverable(e.target.value)} aria-label="Nome della nuova consegna" />
        <button type="button" className={button} disabled={pending || !newDeliverable.trim()}
          onClick={() => run(async () => {
            const result = await createDeliverable(data.projectId, newDeliverable)
            if (!result.error) setNewDeliverable('')
            return result
          }, 'Consegna creata.')}><Plus className="h-4 w-4" aria-hidden="true" />Nuova consegna</button>
      </div>
      {!data.deliverables.length ? <p className="text-sm text-text-secondary">Nessuna consegna. La prima versione arriva dopo il primo caricamento.</p>
        : <ul className="space-y-4">{data.deliverables.map(deliverable => <li key={deliverable.id} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{deliverable.title}</p>
            <button type="button" className={button} disabled={pending || uploading}
              onClick={() => { setUploadFor(uploadFor === deliverable.id ? null : deliverable.id); setApproval(false) }}>
              <FileUp className="h-4 w-4" aria-hidden="true" />Nuova versione</button>
          </div>
          {uploadFor === deliverable.id && <div className="mt-3 rounded-lg bg-surface-hover p-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={approval}
              onChange={e => setApproval(e.target.checked)} />Chiedi al cliente di approvarla</label>
            <p className="mt-1 text-2xs text-text-secondary">Con l’approvazione richiesta il cliente riceve un’attività dedicata. Aprire o scaricare il file non vale come accettazione.</p>
            <input ref={fileInput} type="file" className="mt-3 block w-full text-sm" disabled={uploading}
              aria-label="File della consegna"
              onChange={e => { const file = e.target.files?.[0]; if (file) upload(deliverable.id, file); e.target.value = '' }} />
            {uploading && <p className="mt-2 flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Caricamento in corso…</p>}
            <p className="mt-2 text-2xs text-text-secondary">Massimo 50 MB. Il file resta privato: il cliente lo scarica dal portale, con il suo account.</p>
          </div>}
          {!deliverable.versions.length ? <p className="mt-3 text-2xs text-text-secondary">Nessuna versione caricata.</p>
            : <ul className="mt-3 divide-y divide-border">{deliverable.versions.map(v => <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-2xs text-text-secondary">versione {v.version} · {v.author_name} · {v.published_at ? `pubblicata il ${portalDate(v.published_at)}` : 'bozza'}{v.retired_at ? ` · ritirata il ${portalDate(v.retired_at)}` : ''}{v.approval_required ? ' · approvazione richiesta' : ''}</span>
              <span className="flex gap-2">
                {!v.published_at && <><button type="button" className={primary} disabled={pending}
                  onClick={() => run(() => publishDeliverableVersion(data.projectId, v.id), 'Consegna pubblicata.')}><Upload className="h-4 w-4" aria-hidden="true" />Pubblica</button>
                  <button type="button" className={button} disabled={pending}
                    onClick={() => run(() => deleteDeliverableDraft(data.projectId, v.id), 'Bozza eliminata.')}>Elimina bozza</button></>}
                {v.published_at && !v.retired_at && <button type="button" className={button} disabled={pending}
                  onClick={() => run(() => retireDeliverableVersion(data.projectId, v.id), 'Versione ritirata dal portale.')}>Ritira</button>}
              </span>
            </li>)}</ul>}
        </li>)}</ul>}
    </Section>
    <Section title="Materiali dal cliente" hint="Lo spazio file dell’azienda: quello che ci manda arriva qui, etichettato per progetto quando lo dichiara.">
      {data.materialsMissing ? <p className="text-sm text-text-secondary">Lo spazio file non è ancora attivo: richiede la migration 250 del portale.</p>
        : !data.materials.length ? <p className="text-sm text-text-secondary">Niente ancora. Il cliente carica dal portale, sezione «I tuoi file».</p>
        : <ul className="divide-y divide-border">{data.materials.map(m => <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
          <span className="min-w-0">
            <span className="block break-words text-sm font-medium">{m.name}</span>
            <span className="block text-2xs text-text-secondary">
              {humanBytes(Number(m.size))} · {m.uploaded_by_name} · {portalDate(m.created_at)}
              {m.project_id ? (m.project_id === data.projectId ? ' · questo progetto' : ' · altro progetto') : ' · senza progetto'}
            </span>
          </span>
          <a href={materialDownloadHref(m.id)} className={button}>Scarica<span className="sr-only"> {m.name}</span></a>
        </li>)}</ul>}
    </Section>
  </div>
}

function PublishTaskButton({ disabled, onPublish }: { disabled: boolean; onPublish: (kind: PortalActivityKind) => void }) {
  const [open, setOpen] = useState(false)
  if (!open) return <button type="button" className={button} disabled={disabled} onClick={() => setOpen(true)}>Condividi</button>
  return <span className="flex gap-2">{(Object.entries(PORTAL_ACTIVITY_KINDS) as [PortalActivityKind, { label: string; hint: string }][]).map(([kind, meta]) => (
    <button key={kind} type="button" className={button} title={meta.hint} disabled={disabled}
      onClick={() => { setOpen(false); onPublish(kind) }}>{meta.label}</button>
  ))}</span>
}

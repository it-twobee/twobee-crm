'use client'

import { useState, useEffect, useMemo, useRef, useTransition, useCallback } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, Briefcase, FolderTree, CheckSquare, Users,
  Wand2, AlertTriangle,
} from 'lucide-react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { createWorkstream } from '@/app/actions/workstreams'
import {
  ModalShell, Group, Field, SearchInput, PickRow, Segmented, Empty, inputCls,
} from '@/components/shared/formkit'
import { workstreamPrefixFromProjectName, applyWorkstreamPrefix } from '@/lib/project-naming'
import { TaskComposer } from '@/components/tasks/TaskComposer'
import type {
  WorkstreamType, ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode,
} from '@/lib/types/database'

// componenti pesanti: caricati solo all'apertura (fuori dal bundle dell'header globale)
const ProjectWizard = dynamic(() => import('@/components/projects/ProjectWizard').then(m => ({ default: m.ProjectWizard })), { ssr: false })
const NewClientModal = dynamic(() => import('@/components/clients/NewClientModal').then(m => ({ default: m.NewClientModal })), { ssr: false })

type ClientOpt = { id: string; name: string }
type ProjectOpt = { id: string; name: string; client_id: string }
type PersonOpt = { id: string; full_name: string; app_role: string | null; avatar_url?: string | null }
type WsOpt = { id: string; name: string }
type MsOpt = { id: string; title: string; milestone_type: string }

type Mode = null | 'client' | 'project' | 'workstream' | 'task'

export function QuickCreate({ context = 'admin' }: { context?: 'admin' | 'workspace' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>(null)
  const [loaded, setLoaded] = useState(false)
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [projects, setProjects] = useState<ProjectOpt[]>([])
  const [profiles, setProfiles] = useState<PersonOpt[]>([])
  const [services, setServices] = useState<ServiceCatalogEntry[]>([])
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [nodes, setNodes] = useState<ProjectTemplateNode[]>([])
  const [wizardLoaded, setWizardLoaded] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { setMounted(true) }, [])

  const ensureData = useCallback(async () => {
    if (loaded) return
    const sb = createBrowserClient()
    const [c, p, pr] = await Promise.all([
      sb.from('clients').select('id, company_name, display_name').order('company_name'),
      sb.from('projects').select('id, name, client_id').is('deleted_at', null).order('created_at', { ascending: false }),
      sb.from('profiles').select('id, full_name, app_role, avatar_url').eq('is_active', true).order('full_name'),
    ])
    setClients((c.data ?? []).map((x: { id: string; company_name: string; display_name: string | null }) => ({ id: x.id, name: x.display_name || x.company_name })))
    setProjects((p.data ?? []) as ProjectOpt[])
    setProfiles((pr.data ?? []) as PersonOpt[])
    setLoaded(true)
  }, [loaded])

  // dati aggiuntivi per il wizard progetto
  const ensureWizardData = useCallback(async () => {
    if (wizardLoaded) return
    const sb = createBrowserClient()
    const [s, t, n] = await Promise.all([
      sb.from('service_catalog').select('*').order('area').order('sort_order'),
      sb.from('project_templates').select('*').order('sort_order'),
      sb.from('project_template_nodes').select('*').order('sort_order'),
    ])
    setServices((s.data ?? []) as ServiceCatalogEntry[])
    setTemplates((t.data ?? []) as ProjectTemplate[])
    setNodes((n.data ?? []) as ProjectTemplateNode[])
    setWizardLoaded(true)
  }, [wizardLoaded])

  const start = (m: Mode) => {
    setOpen(false)
    ensureData()
    if (m === 'project') ensureWizardData()
    setMode(m)
  }

  const toggleMenu = () => {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(o => !o)
  }

  // dal workspace le rotte admin sono rimbalzate dal middleware: prefissa i link
  const base = context === 'workspace' ? '/workspace' : ''
  const notifyCreated = (label: string, href: string) =>
    toast.success(label, { action: { label: 'Apri', onClick: () => router.push(href) } })

  return (
    <div className="contents">
      <button ref={btnRef} onClick={toggleMenu} aria-label="Crea" aria-expanded={open}
        className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gold text-on-gold text-sm font-semibold shadow-soft press no-tap-highlight">
        <Plus className="w-4 h-4" /><span className="hidden sm:inline">Crea</span>
      </button>

      {/* menu in portale: mai tagliato da overflow del layout */}
      {mounted && open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[59]" onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: rect.bottom + 8, left: Math.max(8, rect.right - 224) }}
            className="w-56 bg-surface border border-border-strong rounded-2xl shadow-pop z-[60] p-1.5 animate-scale-in">
            {context === 'admin' && (
              <MenuRow icon={<Users className="w-4 h-4 text-gold-text" />} title="Nuova anagrafica" hint="Aggiungi un cliente" onClick={() => start('client')} />
            )}
            <MenuRow icon={<Briefcase className="w-4 h-4 text-gold-text" />} title="Nuovo progetto" hint="Con il wizard" onClick={() => start('project')} />
            <MenuRow icon={<FolderTree className="w-4 h-4 text-gold-text" />} title="Nuovo workstream" hint="In un progetto" onClick={() => start('workstream')} />
            <MenuRow icon={<CheckSquare className="w-4 h-4 text-gold-text" />} title="Nuova task" hint="In progetto, ad hoc o al cliente" onClick={() => start('task')} />
          </div>
        </>,
        document.body,
      )}

      {/* modali/wizard in portale: l'header ha backdrop-filter, che ancorerebbe
          i fixed all'header invece che al viewport → li montiamo su document.body */}
      {mounted && mode === 'client' && createPortal(
        <NewClientModal onClose={() => setMode(null)}
          onCreated={(c) => { setMode(null); notifyCreated('Anagrafica creata', `/clienti/${c.id}`); router.refresh() }} />, document.body)}
      {mounted && mode === 'project' && wizardLoaded && createPortal(
        <ProjectWizard clients={clients} profiles={profiles} services={services} templates={templates} nodes={nodes}
          basePath={`${base}/progetti`} onClose={() => setMode(null)} />, document.body)}
      {mounted && mode === 'workstream' && createPortal(
        <WorkstreamModal projects={projects} base={base} onClose={() => setMode(null)} onDone={() => setMode(null)} notify={notifyCreated} />, document.body)}
      {mounted && mode === 'task' && createPortal(
        <TaskComposer
          destination={{ mode: 'pick', allow: ['project', 'ad_hoc', 'cliente'], clients, projects }}
          profiles={profiles.map(p => ({ id: p.id, full_name: p.full_name, avatar_url: p.avatar_url ?? null, app_role: p.app_role as never }))}
          onClose={() => setMode(null)}
          onCreated={({ kind, clientId, projectId, workstreamId }) => {
            setMode(null)
            notifyCreated('Task creata',
              kind === 'project' && projectId && workstreamId ? `${base}/progetti/${projectId}/workstream/${workstreamId}`
                : kind === 'cliente' && clientId ? `${base}/clienti/${clientId}`
                : `${base}/ad-hoc`)
            router.refresh()
          }} />, document.body)}
    </div>
  )
}

function MenuRow({ icon, title, hint, onClick }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-surface-hover transition-colors press">
      <span className="w-8 h-8 rounded-lg bg-gold-dim flex items-center justify-center shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-text-primary truncate">{title}</div>
        <div className="text-2xs text-text-tertiary truncate">{hint}</div>
      </div>
    </button>
  )
}

function WorkstreamModal({ projects, base, onClose, onDone, notify }: { projects: ProjectOpt[]; base: string; onClose: () => void; onDone: () => void; notify: (l: string, h: string) => void }) {
  const [pending, start] = useTransition()
  const [projectId, setProjectId] = useState('')
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<WorkstreamType>('project')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const project = projects.find(p => p.id === projectId)
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? projects.filter(p => p.name.toLowerCase().includes(t)) : projects
  }, [projects, q])

  // il prefisso di convention si rilegge dal nome del progetto (Cliente · Area · Servizio)
  const prefix = project ? workstreamPrefixFromProjectName(project.name) : null
  const conform = prefix ? applyWorkstreamPrefix(prefix, name) : name
  const offConvention = !!prefix && !!name.trim() && name.trim() !== conform

  const badRange = !!startDate && !!endDate && endDate < startDate
  const canSubmit = !!projectId && !!name.trim() && !badRange

  const submit = () => start(async () => {
    try {
      const wsId = await createWorkstream({ project_id: projectId, name: name.trim(), workstream_type: type, start_date: startDate || null, end_date: endDate || null })
      notify('Workstream creato', `${base}/progetti/${projectId}/workstream/${wsId}`); onDone()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  return (
    <ModalShell title="Nuovo workstream" hint={project ? project.name : 'In quale progetto?'}
      icon={<FolderTree className="w-4 h-4 text-gold-text" />}
      onClose={onClose} onSubmit={submit} canSubmit={canSubmit} pending={pending}>

      <Group label="Progetto" meta={projectId
        ? <button type="button" onClick={() => setProjectId('')} className="text-2xs font-semibold text-gold-text">Cambia</button>
        : undefined}>
        {projectId && project ? (
          <PickRow selected onClick={() => setProjectId('')}
            icon={<Briefcase className="w-4 h-4 text-gold-text shrink-0" />} title={project.name} />
        ) : (
          <div className="space-y-2">
            <SearchInput value={q} onChange={setQ} placeholder="Cerca progetto…" autoFocus />
            {filtered.length === 0 ? <Empty>Nessun progetto per «{q}».</Empty> : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {filtered.map(p => (
                  <PickRow key={p.id} selected={false} onClick={() => { setProjectId(p.id); setQ('') }}
                    icon={<Briefcase className="w-4 h-4 text-gold-text shrink-0" />} title={p.name} />
                ))}
              </div>
            )}
          </div>
        )}
      </Group>

      {projectId && (
        <>
          <Group label="Tipo">
            <Segmented ariaLabel="Tipo workstream" value={type} onChange={setType}
              options={[{ value: 'project', label: 'A termine' }, { value: 'recurring', label: 'Continuativa' }]} />
            <p className="text-2xs text-text-tertiary mt-1.5">
              {type === 'project'
                ? 'Ha un inizio e una fine: compare come barra sul calendario.'
                : 'Operatività continua: raccoglie le attività ricorrenti.'}
            </p>
          </Group>

          <Field label="Nome">
            <div className="flex gap-2">
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus placeholder="Setup, Produzione, Reporting…" />
              {offConvention && (
                <button type="button" onClick={() => setName(conform)} title={`Riallinea a: ${conform}`}
                  className="flex items-center gap-1.5 px-3 rounded-xl border border-border-interactive text-2xs font-semibold text-gold-text hover:bg-surface-hover shrink-0">
                  <Wand2 className="w-3.5 h-3.5" />Convention
                </button>
              )}
            </div>
            {offConvention && <span className="block text-2xs text-text-tertiary mt-1.5 truncate">Convention: {conform}</span>}
          </Field>

          {type === 'project' && (
            <Group label="Periodo">
              <div className="grid grid-cols-2 gap-3">
                <input type="date" aria-label="Inizio" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
                <input type="date" aria-label="Fine" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
              </div>
              {badRange && (
                <p className="flex items-center gap-1.5 text-2xs text-error mt-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />La fine precede l&apos;inizio.
                </p>
              )}
            </Group>
          )}
        </>
      )}
    </ModalShell>
  )
}


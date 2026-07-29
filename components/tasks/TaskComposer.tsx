'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import {
  CheckSquare, CornerDownRight, Repeat, Briefcase, FolderTree, Flag,
  Eye, EyeOff, ListTodo, Building2, ShieldCheck,
} from 'lucide-react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { createProjectTask } from '@/app/actions/tasks'
import { createAdHocTask } from '@/app/actions/ad-hoc-tasks'
import {
  ModalShell, Group, Field, Segmented, SearchInput, PickRow, Avatar, Empty, inputCls,
} from '@/components/shared/formkit'
import { CLIENT_ROLES } from '@/lib/permissions'
import type { AppRole, Priority, Visibility } from '@/lib/types/database'

export type TaskKind = 'project' | 'ad_hoc' | 'cliente'
export type Person = { id: string; full_name: string; avatar_url: string | null; app_role?: AppRole | null }
export type ClientOpt = { id: string; name: string }
export type ProjectOpt = { id: string; name: string; client_id: string | null }

/** Destinazione già nota: il composer chiede solo il *cosa*. */
export type FixedDestination = {
  mode: 'fixed'
  kind: TaskKind
  /** briciole in testata, es. "Progetto · Workstream · M1" */
  context: string
  clientId?: string | null
  projectId?: string
  workstreamId?: string
  milestoneId?: string
  parentTaskId?: string | null
  /** cambia solo icona e copy */
  variant?: 'task' | 'subtask' | 'continuous'
  defaultDue?: string | null
}

/** Destinazione da scegliere: il composer chiede prima il *dove*. */
export type PickDestination = {
  mode: 'pick'
  allow: TaskKind[]
  clients: ClientOpt[]
  projects: ProjectOpt[]
  defaultKind?: TaskKind
  defaultClientId?: string
}

const KIND_META: Record<TaskKind, { label: string; hint: string }> = {
  project: { label: 'In un progetto', hint: 'Dentro una milestone di un progetto.' },
  ad_hoc: { label: 'Ad hoc (nostra)', hint: 'Fuori progetto, la facciamo noi.' },
  cliente: { label: 'Al cliente', hint: 'La deve fare il cliente: compare nel suo portale.' },
}

export function TaskComposer({
  destination, profiles, onClose, onCreated,
}: {
  destination: FixedDestination | PickDestination
  profiles: Person[]
  onClose: () => void
  /** href facoltativo dove è finita la task, per il toast del chiamante */
  onCreated?: (info: { id: string; kind: TaskKind; clientId: string | null; projectId?: string; workstreamId?: string }) => void
}) {
  const fixed = destination.mode === 'fixed' ? destination : null
  const pick = destination.mode === 'pick' ? destination : null
  const [pending, start] = useTransition()

  const [kind, setKind] = useState<TaskKind>(
    fixed?.kind ?? pick?.defaultKind ?? pick?.allow[0] ?? 'project',
  )
  const [clientId, setClientId] = useState(fixed?.clientId ?? pick?.defaultClientId ?? '')
  const [projectId, setProjectId] = useState(fixed?.projectId ?? '')
  const [wsId, setWsId] = useState(fixed?.workstreamId ?? '')
  const [msId, setMsId] = useState(fixed?.milestoneId ?? '')
  const [q, setQ] = useState('')

  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [supervisor, setSupervisor] = useState('')
  const [due, setDue] = useState(fixed?.defaultDue ?? '')
  const [priority, setPriority] = useState<Priority>('media')
  const [clientVisible, setClientVisible] = useState(false)
  const [again, setAgain] = useState(false)

  // cascata progetto → workstream → milestone (solo quando il dove si sceglie)
  const [ws, setWs] = useState<{ id: string; name: string }[]>([])
  const [ms, setMs] = useState<{ id: string; title: string; milestone_type: string }[]>([])
  const [loadingWs, setLoadingWs] = useState(false)
  const [loadingMs, setLoadingMs] = useState(false)

  useEffect(() => {
    if (!pick || kind !== 'project' || !projectId) { setWs([]); setWsId(''); return }
    setLoadingWs(true)
    createBrowserClient().from('project_workstreams').select('id, name')
      .eq('project_id', projectId).order('sort_order')
      .then(({ data }) => { setWs(data ?? []); setLoadingWs(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, projectId])

  useEffect(() => {
    if (!pick || !wsId) { setMs([]); setMsId(''); return }
    setLoadingMs(true)
    createBrowserClient().from('milestones').select('id, title, milestone_type')
      .eq('workstream_id', wsId).order('sort_order')
      .then(({ data }) => {
        const list = data ?? []
        setMs(list)
        setMsId(list.find(m => m.milestone_type === 'delivery')?.id ?? list[0]?.id ?? '')
        setLoadingMs(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])

  // referenti del cliente: su una task "al cliente" il titolare è uno di loro
  const [contacts, setContacts] = useState<Person[] | null>(null)
  const effectiveClientId = kind === 'project'
    ? (pick?.projects.find(p => p.id === projectId)?.client_id ?? fixed?.clientId ?? null)
    : (clientId || null)

  useEffect(() => {
    if (kind !== 'cliente' || !effectiveClientId) { setContacts(null); return }
    createBrowserClient().from('client_assignments').select('profile_id').eq('client_id', effectiveClientId)
      .then(({ data }) => {
        const ids = new Set((data ?? []).map(a => a.profile_id))
        setContacts(profiles.filter(p => ids.has(p.id)))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, effectiveClientId])

  // chi può essere titolare, e chi può presidiare
  const isClientProfile = (p: Person) => CLIENT_ROLES.includes(p.app_role as AppRole)
  const assigneeOptions = kind === 'cliente' ? (contacts ?? []) : profiles.filter(p => !isClientProfile(p))
  const supervisorOptions = profiles.filter(p => !isClientProfile(p))

  // il primo referente è il titolare naturale
  useEffect(() => {
    if (kind === 'cliente' && contacts && contacts.length && !assignee) setAssignee(contacts[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, contacts])

  const person = assigneeOptions.find(p => p.id === assignee)
  const supPerson = supervisorOptions.find(p => p.id === supervisor)
  const client = (pick?.clients ?? []).find(c => c.id === clientId)
  const project = (pick?.projects ?? []).find(p => p.id === projectId)

  const filteredClients = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? (pick?.clients ?? []).filter(c => c.name.toLowerCase().includes(t)) : (pick?.clients ?? [])
  }, [pick, q])
  const filteredProjects = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? (pick?.projects ?? []).filter(p => p.name.toLowerCase().includes(t)) : (pick?.projects ?? [])
  }, [pick, q])

  const destinationReady = fixed
    ? true
    : kind === 'project' ? (!!projectId && !!wsId && !!msId) : !!clientId
  const canSubmit = !!title.trim() && destinationReady

  const Icon = fixed?.variant === 'subtask' ? CornerDownRight
    : fixed?.variant === 'continuous' ? Repeat
    : kind === 'cliente' ? Building2
    : kind === 'ad_hoc' ? ListTodo
    : CheckSquare

  const heading = fixed?.variant === 'subtask' ? 'Nuova subtask'
    : fixed?.variant === 'continuous' ? 'Nuova attività continuativa'
    : kind === 'cliente' ? 'Nuova task al cliente'
    : kind === 'ad_hoc' ? 'Nuova task ad hoc'
    : 'Nuova task'

  const hint = fixed?.context
    ?? (kind === 'project'
      ? [project?.name, ws.find(w => w.id === wsId)?.name].filter(Boolean).join(' · ') || 'Dove va questa task?'
      : client?.name ?? 'Per quale cliente?')

  const submit = () => start(async () => {
    try {
      let id: string
      if (kind === 'project') {
        id = await createProjectTask({
          client_id: effectiveClientId,
          project_id: fixed?.projectId ?? projectId,
          workstream_id: fixed?.workstreamId ?? wsId,
          milestone_id: fixed?.milestoneId ?? msId,
          parent_task_id: fixed?.parentTaskId ?? null,
          title: title.trim(), assignee_id: assignee || null, due_date: due || null,
          priority, visibility: clientVisible ? 'client_visible' : 'internal',
        })
      } else {
        id = await createAdHocTask({
          client_id: clientId, task_type: kind === 'cliente' ? 'cliente' : 'ad_hoc',
          title: title.trim(), assignee_id: assignee || null,
          supervisor_id: kind === 'cliente' ? (supervisor || null) : null,
          due_date: due || null, priority,
          visibility: clientVisible ? 'client_visible' : 'internal',
        })
      }
      toast.success(heading.replace('Nuova', 'Creata'))
      onCreated?.({
        id, kind, clientId: effectiveClientId,
        projectId: fixed?.projectId ?? projectId, workstreamId: fixed?.workstreamId ?? wsId,
      })
      if (again) { setTitle(''); setDue(fixed?.defaultDue ?? '') }
      else onClose()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  return (
    <ModalShell title={heading} hint={hint} icon={<Icon className="w-4 h-4 text-gold-text" />}
      onClose={onClose} onSubmit={submit} pending={pending} canSubmit={canSubmit}
      submitLabel={again ? 'Crea e continua' : 'Crea'}>

      {/* ── DOVE ─────────────────────────────────────────────────────────── */}
      {pick && pick.allow.length > 1 && (
        <div>
          <Segmented ariaLabel="Tipo di task" value={kind}
            onChange={k => { setKind(k); setQ(''); setAssignee(''); setSupervisor('') }}
            options={pick.allow.map(k => ({ value: k, label: KIND_META[k].label }))} />
          <p className="text-2xs text-text-tertiary mt-1.5">{KIND_META[kind].hint}</p>
        </div>
      )}

      {pick && kind === 'project' && (
        <>
          <Group label="Progetto" meta={projectId
            ? <button type="button" onClick={() => { setProjectId(''); setWsId('') }} className="text-2xs font-semibold text-gold-text">Cambia</button>
            : undefined}>
            {projectId && project ? (
              <PickRow selected onClick={() => { setProjectId(''); setWsId('') }}
                icon={<Briefcase className="w-4 h-4 text-gold-text shrink-0" />} title={project.name} />
            ) : (
              <div className="space-y-2">
                <SearchInput value={q} onChange={setQ} placeholder="Cerca progetto…" autoFocus />
                {filteredProjects.length === 0 ? <Empty>Nessun progetto per «{q}».</Empty> : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {filteredProjects.map(p => (
                      <PickRow key={p.id} selected={false} onClick={() => { setProjectId(p.id); setQ('') }}
                        icon={<Briefcase className="w-4 h-4 text-gold-text shrink-0" />} title={p.name} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </Group>

          {projectId && (
            <Group label="Workstream">
              {loadingWs ? <Skeleton /> : ws.length === 0 ? (
                <Empty>Questo progetto non ha ancora workstream.</Empty>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {ws.map(w => (
                    <PickRow key={w.id} selected={wsId === w.id} onClick={() => setWsId(w.id)}
                      icon={<FolderTree className="w-4 h-4 text-gold-text shrink-0" />} title={w.name} />
                  ))}
                </div>
              )}
            </Group>
          )}

          {wsId && (
            <Group label="Milestone">
              {loadingMs ? <Skeleton /> : ms.length === 0 ? <Empty>Nessuna milestone in questa workstream.</Empty> : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {ms.map(m => (
                    <PickRow key={m.id} selected={msId === m.id} onClick={() => setMsId(m.id)}
                      icon={<Flag className={`w-4 h-4 shrink-0 ${m.milestone_type === 'system' ? 'text-text-tertiary' : 'text-info'}`} />}
                      title={m.title}
                      subtitle={m.milestone_type === 'system' ? 'operatività continua' : undefined} />
                  ))}
                </div>
              )}
            </Group>
          )}
        </>
      )}

      {pick && kind !== 'project' && (
        <Group label="Cliente" meta={clientId
          ? <button type="button" onClick={() => { setClientId(''); setAssignee('') }} className="text-2xs font-semibold text-gold-text">Cambia</button>
          : undefined}>
          {clientId && client ? (
            <PickRow selected onClick={() => { setClientId(''); setAssignee('') }}
              icon={<Avatar name={client.name} />} title={client.name} />
          ) : (
            <div className="space-y-2">
              <SearchInput value={q} onChange={setQ} placeholder="Cerca cliente…" autoFocus />
              {filteredClients.length === 0 ? <Empty>Nessun cliente per «{q}».</Empty> : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {filteredClients.map(c => (
                    <PickRow key={c.id} selected={false} onClick={() => { setClientId(c.id); setQ('') }}
                      icon={<Avatar name={c.name} />} title={c.name} />
                  ))}
                </div>
              )}
            </div>
          )}
        </Group>
      )}

      {/* ── COSA ─────────────────────────────────────────────────────────── */}
      <Field label="Titolo">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input value={title} onChange={e => setTitle(e.target.value)} autoFocus={!!fixed}
          className={inputCls} placeholder="Cosa va fatto?" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={kind === 'cliente' ? 'Chi la deve fare, lato cliente' : 'Assegnatario'}
          hint={kind === 'cliente'
            ? (contacts === null ? 'scegli prima il cliente'
              : contacts.length ? 'referente registrato' : 'nessun referente registrato')
            : undefined}>
          <div className="flex items-center gap-2">
            {person && <Avatar name={person.full_name} url={person.avatar_url} />}
            <select value={assignee} onChange={e => setAssignee(e.target.value)} className={inputCls}
              aria-label="Assegnatario" disabled={kind === 'cliente' && !assigneeOptions.length}>
              <option value="">— nessuno —</option>
              {assigneeOptions.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
        </Field>
        <Field label="Scadenza">
          <input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputCls} aria-label="Scadenza" />
        </Field>
      </div>

      {kind === 'cliente' && (
        <Field label="Chi la presidia, da noi" hint="secondo livello: controlla che arrivi">
          <div className="flex items-center gap-2">
            {supPerson ? <Avatar name={supPerson.full_name} url={supPerson.avatar_url} />
              : <ShieldCheck className="w-5 h-5 text-text-tertiary shrink-0" />}
            <select value={supervisor} onChange={e => setSupervisor(e.target.value)} className={inputCls} aria-label="Presidio">
              <option value="">— nessuno —</option>
              {supervisorOptions.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
        </Field>
      )}

      <Field label="Priorità">
        <Segmented ariaLabel="Priorità" value={priority} onChange={setPriority}
          options={[{ value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'bassa', label: 'Bassa' }]} />
      </Field>

      {/* per una task al cliente la visibilità non è una scelta */}
      {kind === 'cliente' ? (
        <div className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gold bg-gold-dim">
          <Eye className="w-4 h-4 text-info shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text-primary">Visibile al cliente</span>
            <span className="block text-2xs text-text-tertiary">Sempre: è una cosa che deve fare lui</span>
          </span>
        </div>
      ) : (
        <button type="button" onClick={() => setClientVisible(v => !v)} aria-pressed={clientVisible}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${
            clientVisible ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'
          }`}>
          {clientVisible ? <Eye className="w-4 h-4 text-info shrink-0" /> : <EyeOff className="w-4 h-4 text-text-tertiary shrink-0" />}
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text-primary">Visibile al cliente</span>
            <span className="block text-2xs text-text-tertiary">Compare nel portale cliente tra le sue attività</span>
          </span>
        </button>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={again} onChange={e => setAgain(e.target.checked)} />
        <span className="text-2xs text-text-secondary">Resta aperto per aggiungerne un&apos;altra</span>
      </label>
    </ModalShell>
  )
}

function Skeleton() {
  return <div className="space-y-1.5">{[0, 1].map(i => <div key={i} className="h-11 rounded-xl bg-surface-active animate-pulse" />)}</div>
}

'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import {
  CheckSquare, CornerDownRight, Repeat, Briefcase, FolderTree, Flag,
  Eye, EyeOff, ListTodo, Building2, ShieldCheck, CircleSlash, UserPlus, Sprout,
} from 'lucide-react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { createProjectTask } from '@/app/actions/tasks'
import { createAdHocTask } from '@/app/actions/ad-hoc-tasks'
import { createRecurring } from '@/app/actions/recurring'
import { occurrencesBetween, ruleLabel, type RecurrenceRule } from '@/lib/recurrence'
import { createClientQuick } from '@/app/actions/clients'
import {
  ModalShell, Group, Field, Segmented, SearchInput, PickRow, Avatar, Empty, inputCls,
} from '@/components/shared/formkit'
import { isPortalAccount } from '@/lib/permissions'
import { SuggerimentiModello, useServiceCatalog } from '@/components/projects/WorkstreamPresets'
import { modelliDiTipo } from '@/lib/workstream-presets'
import type { AppRole, Priority, Visibility } from '@/lib/types/database'

export type TaskKind = 'project' | 'ad_hoc' | 'cliente'

/**
 * §321 — «nessun cliente» **scelto** non è «non ho ancora scelto», e la
 * differenza deve stare nello stato: con la stringa vuota per tutte e due, il
 * pulsante Crea resterebbe spento su una scelta che è stata fatta. Sentinella,
 * non `null`, perché `clientId` è la stessa variabile che porta un uuid.
 */
export const NO_CLIENT = '__none__'
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
  /**
   * §317 — chi può aprire una nuova anagrafica (admin e manager). Il gate vero
   * è `requireClientCreator()` dentro l'azione; questo serve a non mostrare un
   * pulsante che rimbalzerebbe, che è peggio di un pulsante assente (§211).
   */
  canCreateClient?: boolean
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
  /* §321 — un'anagrafica aperta da qui deve comparire subito nella lista: il
     server la conosce, questa modale no, e ricaricare la pagina sotto una
     modale aperta è il modo per perdere quello che si stava scrivendo. */
  const [nuovi, setNuovi] = useState<ClientOpt[]>([])
  const [creating, setCreating] = useState<'stabile' | 'lead' | null>(null)

  const [title, setTitle] = useState('')
  /* §353 — i **dettagli**: stessa colonna (`tasks.description`) e stesso nome
     del modale e del wizard. Si scrivono qui, dove la task nasce: chiederli
     dopo, aprendo il dettaglio, vuol dire non averli mai — il contesto finisce
     nel titolo e chi la riceve legge una riga lunga il doppio e incompleta. */
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState('')
  const [supervisor, setSupervisor] = useState('')
  const [due, setDue] = useState(fixed?.defaultDue ?? '')
  const [priority, setPriority] = useState<Priority>('media')
  const [clientVisible, setClientVisible] = useState(false)
  const [again, setAgain] = useState(false)
  /* §469 — «Si ripete»: la task diventa una regola (`recurring_task_templates`) e il
     motore delle ricorrenze (§337) mette le occorrenze in «le mie attività».
     La data che si scrive qui diventa la **fine del ciclo**, non la scadenza:
     ogni occorrenza ha la sua. Solo sui progetti, perché il motore genera
     dentro una milestone; e non sulle subtask, che vivono della loro madre. */
  const oggi = new Date().toISOString().slice(0, 10)
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none')
  const [repeatFrom, setRepeatFrom] = useState(oggi)
  const [repeatDays, setRepeatDays] = useState<number[]>([])

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

  /* §405 — i task che questo servizio ha di solito: riempiono il titolo, le ore
     e la priorità. Il servizio si legge dal progetto scelto, non dal composer:
     è l'unico posto che lo sa. */
  const [servizio, setServizio] = useState<{ service_type: string | null; service_subtype: string | null } | null>(null)
  useEffect(() => {
    const id = fixed?.projectId ?? projectId
    if (kind !== 'project' || !id) { setServizio(null); return }
    let vivo = true
    void createBrowserClient().from('projects').select('service_type, service_subtype').eq('id', id).maybeSingle()
      .then(({ data }) => { if (vivo) setServizio((data as typeof servizio) ?? null) })
    return () => { vivo = false }
  }, [kind, projectId, fixed?.projectId])

  const { templates, nodes } = useServiceCatalog(kind === 'project' && !!servizio?.service_type)
  const modelliTask = servizio?.service_type
    ? modelliDiTipo(templates, nodes, [{ service_type: servizio.service_type, service_subtype: servizio.service_subtype }], 'task')
    : []

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
  const noClient = clientId === NO_CLIENT
  const effectiveClientId = kind === 'project'
    ? (pick?.projects.find(p => p.id === projectId)?.client_id ?? fixed?.clientId ?? null)
    : (noClient ? null : (clientId || null))

  useEffect(() => {
    if (kind !== 'cliente' || !effectiveClientId) { setContacts(null); return }
    createBrowserClient().from('client_assignments').select('profile_id').eq('client_id', effectiveClientId)
      .then(({ data }) => {
        const ids = new Set((data ?? []).map(a => a.profile_id))
        setContacts(profiles.filter(p => ids.has(p.id)))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, effectiveClientId])

  /* chi può essere titolare, e chi può presidiare.
     §409 — si guardava `CLIENT_ROLES`, che è solo `client`: un invito al
     portale crea un profilo **guest**, e il referente di un cliente finiva fra
     le persone a cui assegnare del lavoro nostro. */
  const isClientProfile = (p: Person) => isPortalAccount(p)
  const assigneeOptions = kind === 'cliente' ? (contacts ?? []) : profiles.filter(p => !isClientProfile(p))
  const supervisorOptions = profiles.filter(p => !isClientProfile(p))

  // il primo referente è il titolare naturale
  useEffect(() => {
    if (kind === 'cliente' && contacts && contacts.length && !assignee) setAssignee(contacts[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, contacts])

  const person = assigneeOptions.find(p => p.id === assignee)
  const supPerson = supervisorOptions.find(p => p.id === supervisor)
  const allClients = useMemo(
    () => [...nuovi, ...(pick?.clients ?? [])], [nuovi, pick])
  const client = allClients.find(c => c.id === clientId)
  const project = (pick?.projects ?? []).find(p => p.id === projectId)

  const filteredClients = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? allClients.filter(c => c.name.toLowerCase().includes(t)) : allClients
  }, [allClients, q])

  /* §321 — il nome scritto vale come nome nuovo solo se **non** è già in
     anagrafica: proporre «aggiungi Affinity» quando Affinity è tre righe sotto
     è il modo di creare un doppione senza accorgersene. */
  const nome = q.trim()
  const esisteGià = nome.length > 0
    && allClients.some(c => c.name.trim().toLowerCase() === nome.toLowerCase())
  const canOpenAnagrafica = !!pick?.canCreateClient && nome.length >= 2 && !esisteGià
  const filteredProjects = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? (pick?.projects ?? []).filter(p => p.name.toLowerCase().includes(t)) : (pick?.projects ?? [])
  }, [pick, q])

  /* Una task **al cliente** compare nel portale del cliente: senza un cliente
     non ha un posto dove comparire, quindi lì la sentinella non vale. */
  const destinationReady = fixed
    ? true
    : kind === 'project' ? (!!projectId && !!wsId && !!msId)
    : kind === 'cliente' ? (!!clientId && !noClient)
    : !!clientId
  const canRepeat = kind === 'project' && !fixed?.parentTaskId
  const repeating = canRepeat && repeat !== 'none'
  const rule: RecurrenceRule | null = repeating ? {
    frequency: repeat as RecurrenceRule['frequency'],
    weekdays: repeat === 'weekly' && repeatDays.length ? repeatDays : null,
    start_date: repeatFrom || oggi,
    end_date: due || null,
  } : null
  const prossime = rule
    ? occurrencesBetween(rule, rule.start_date,
      new Date(Date.parse(`${rule.start_date}T00:00:00Z`) + 92 * 86400000).toISOString().slice(0, 10), 3)
    : []
  /* §346 — una regola senza responsabile resta ferma: il motore non fabbrica
     lavoro di nessuno. Crearla così vorrebbe dire «l'ho messa» e non vederla
     arrivare mai, quindi l'assegnatario qui è obbligatorio. */
  const canSubmit = !!title.trim() && destinationReady
    && (!repeating || (!!assignee && prossime.length > 0))

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
      : noClient ? 'Nessun cliente' : client?.name ?? 'Per quale cliente?')

  /**
   * §321 — «questo nome non è in anagrafica»: le due risposte.
   *
   * `stabile` è un cliente vero, `lead` è qualcuno per cui il lavoro è già
   * cominciato ma che non fattura ancora — e la differenza non è cosmetica:
   * un lead resta fuori da MRR, conto economico, alert e churn
   * (`countsInStats` in `lib/clients.ts`). Quello che nasce qui è una riga
   * minima, e chi apre la scheda la completa: qui si dà un posto a un lavoro,
   * non si compila un'anagrafica.
   */
  const creaCliente = (label: 'stabile' | 'lead') => {
    setCreating(label)
    start(async () => {
      try {
        const c = await createClientQuick(nome, label)
        const opt = { id: c.id, name: c.display_name || c.company_name }
        setNuovi(prev => [opt, ...prev])
        setClientId(c.id)
        setQ('')
        toast.success(label === 'lead' ? `«${opt.name}» segnato come lead` : `«${opt.name}» in anagrafica`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Errore')
      } finally { setCreating(null) }
    })
  }

  const submit = () => start(async () => {
    try {
      let id: string
      if (rule) {
        id = await createRecurring({
          client_id: effectiveClientId,
          project_id: fixed?.projectId ?? projectId,
          workstream_id: fixed?.workstreamId ?? wsId,
          milestone_id: fixed?.milestoneId ?? msId,
          title: title.trim(), description: description.trim() || null,
          frequency: rule.frequency, weekdays: rule.weekdays ?? null,
          start_date: rule.start_date, end_date: rule.end_date ?? null,
          owner_id: assignee, priority,
          visibility: clientVisible ? 'client_visible' : 'internal',
        })
      } else if (kind === 'project') {
        id = await createProjectTask({
          client_id: effectiveClientId,
          project_id: fixed?.projectId ?? projectId,
          workstream_id: fixed?.workstreamId ?? wsId,
          milestone_id: fixed?.milestoneId ?? msId,
          parent_task_id: fixed?.parentTaskId ?? null,
          title: title.trim(), description: description.trim() || null,
          assignee_id: assignee || null, due_date: due || null,
          priority, visibility: clientVisible ? 'client_visible' : 'internal',
        })
      } else {
        id = await createAdHocTask({
          client_id: effectiveClientId, task_type: kind === 'cliente' ? 'cliente' : 'ad_hoc',
          title: title.trim(), description: description.trim() || null,
          assignee_id: assignee || null,
          supervisor_id: kind === 'cliente' ? (supervisor || null) : null,
          due_date: due || null, priority,
          visibility: clientVisible ? 'client_visible' : 'internal',
        })
      }
      toast.success(rule ? `Si ripete ${ruleLabel(rule)}` : heading.replace('Nuova', 'Creata'),
        rule ? { description: `La prima è il ${fmtGiorno(prossime[0])}, in «le mie attività» di chi la riceve.` } : undefined)
      onCreated?.({
        id, kind, clientId: effectiveClientId,
        projectId: fixed?.projectId ?? projectId, workstreamId: fixed?.workstreamId ?? wsId,
      })
      if (again) { setTitle(''); setDescription(''); setDue(fixed?.defaultDue ?? '') }
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
            onChange={k => {
              setKind(k); setQ(''); setAssignee(''); setSupervisor('')
              /* §321 — «nessun cliente» vale solo per una task nostra: passando
                 a «Al cliente» resterebbe scelto un cliente che non esiste, con
                 Crea spento e niente che lo spieghi. Si torna a chiedere. */
              if (k === 'cliente') setClientId(prev => prev === NO_CLIENT ? '' : prev)
            }}
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
          {clientId && (noClient || client) ? (
            <PickRow selected onClick={() => { setClientId(''); setAssignee('') }}
              icon={noClient
                ? <span className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center shrink-0">
                    <CircleSlash className="w-4 h-4 text-text-tertiary" />
                  </span>
                : <Avatar name={client!.name} />}
              title={noClient ? 'Nessun cliente' : client!.name}
              subtitle={noClient ? 'roba nostra, non legata a un cliente' : undefined} />
          ) : (
            <div className="space-y-2">
              <SearchInput value={q} onChange={setQ}
                placeholder={pick.canCreateClient ? 'Cerca, o scrivi un nome nuovo…' : 'Cerca cliente…'} autoFocus />

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {/* §321 — la prima voce è «nessuno»: una task ad hoc può essere
                    roba nostra e basta. Su una task **al cliente** non c'è,
                    perché senza cliente non avrebbe un portale dove comparire. */}
                {kind === 'ad_hoc' && (!nome || 'nessun cliente'.includes(nome.toLowerCase())) && (
                  <PickRow selected={false} onClick={() => { setClientId(NO_CLIENT); setQ('') }}
                    icon={<span className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center shrink-0">
                      <CircleSlash className="w-4 h-4 text-text-tertiary" />
                    </span>}
                    title="Nessun cliente" subtitle="roba nostra, non legata a un cliente" />
                )}
                {filteredClients.map(c => (
                  <PickRow key={c.id} selected={false} onClick={() => { setClientId(c.id); setQ('') }}
                    icon={<Avatar name={c.name} />} title={c.name} />
                ))}
              </div>

              {/* §321 — il nome scritto non è in anagrafica: due risposte, e
                  dicono cosa comportano. Senza il permesso non si mostra un
                  pulsante che rimbalzerebbe (§211): si dice a chi chiederlo. */}
              {canOpenAnagrafica && (
                <div className="rounded-xl border border-dashed border-border p-3 space-y-2">
                  <p className="text-2xs text-text-secondary">
                    «<span className="font-semibold text-text-primary">{nome}</span>» non è in anagrafica.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => creaCliente('stabile')} disabled={!!creating}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold text-on-gold text-2xs font-semibold disabled:opacity-60">
                      <UserPlus className="w-3.5 h-3.5" />
                      {creating === 'stabile' ? 'Aggiungo…' : 'Aggiungi in anagrafica'}
                    </button>
                    <button type="button" onClick={() => creaCliente('lead')} disabled={!!creating}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-strong text-text-primary text-2xs font-semibold hover:bg-surface-hover disabled:opacity-60">
                      <Sprout className="w-3.5 h-3.5 text-info" />
                      {creating === 'lead' ? 'Segno…' : 'Segna come lead'}
                    </button>
                  </div>
                  <p className="text-2xs text-text-tertiary">
                    Il lead resta fuori da canone, conto economico e avvisi finché non diventa cliente.
                  </p>
                </div>
              )}

              {nome && filteredClients.length === 0 && !canOpenAnagrafica && (
                <Empty>
                  {esisteGià ? <>«{nome}» è già in elenco.</>
                    : pick.canCreateClient ? <>Scrivi almeno due lettere per aprirlo in anagrafica.</>
                    : <>Nessun cliente per «{nome}». L&apos;anagrafica la apre un admin o un manager.</>}
                </Empty>
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
        {!title.trim() && modelliTask.length > 0 && (
          <div className="mt-2">
            <SuggerimentiModello voci={modelliTask} etichetta="I task di questo servizio"
              onPick={m => {
                setTitle(m.nome)
                if (m.descrizione) setDescription(d => d || m.descrizione || '')
                if (m.priorita) setPriority(m.priorita as Priority)
              }} />
          </div>
        )}
      </Field>

      {/* §353 — subito dopo il titolo, non dietro un pannello: è il campo che
          spiega la richiesta a chi la riceve, e se non si chiede adesso non si
          compila mai. Facoltativo: se non serve resta vuoto. */}
      <Field label="Dettagli" hint="contesto, link, cosa serve per chiuderla">
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
          className={`${inputCls} resize-none`}
          placeholder="Cosa serve, entro quando, con quali riferimenti." />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={kind === 'cliente' ? 'Chi la deve fare, lato cliente' : 'Assegnatario'}
          hint={kind === 'cliente'
            ? (contacts === null ? 'scegli prima il cliente'
              : contacts.length ? 'referente registrato' : 'nessun referente registrato')
            : repeating ? (assignee ? 'riceve ogni occorrenza' : 'serve: senza, la serie non parte')
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
        <Field label={repeating ? 'Fino al' : 'Scadenza'} hint={repeating ? (due ? 'fine del ciclo' : 'vuota: senza fine') : undefined}>
          <input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputCls}
            aria-label={repeating ? 'Fine del ciclo' : 'Scadenza'} />
        </Field>
      </div>

      {/* non un <Field>: è un <label>, e un clic sull'anteprima premerebbe «No» */}
      {canRepeat && (
        <div>
          <span className="block text-2xs font-semibold text-text-secondary mb-1.5">Si ripete</span>
          <Segmented ariaLabel="Ripetizione" value={repeat}
            onChange={v => {
              setRepeat(v)
              /* passando a «si ripete» la scadenza scritta prima non è la fine
                 del ciclo: tenerla chiuderebbe la serie lo stesso giorno */
              if (v !== 'none' && repeat === 'none' && due && due <= (repeatFrom || oggi)) setDue('')
            }}
            options={[
              { value: 'none', label: 'No' }, { value: 'daily', label: 'Ogni giorno' },
              { value: 'weekly', label: 'Ogni settimana' }, { value: 'monthly', label: 'Ogni mese' },
            ]} />
          {repeating && (
            <div className="mt-2 space-y-2">
              {repeat === 'weekly' && (
                <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Giorni della settimana">
                  {GIORNI_BREVI.map(([lab, n]) => {
                    const on = repeatDays.length ? repeatDays.includes(n)
                      : new Date(`${repeatFrom || oggi}T00:00:00Z`).getUTCDay() === n
                    return (
                      <button key={n} type="button" aria-pressed={on}
                        onClick={() => setRepeatDays(prev => {
                          const base = prev.length ? prev : [new Date(`${repeatFrom || oggi}T00:00:00Z`).getUTCDay()]
                          return base.includes(n) ? base.filter(x => x !== n) : [...base, n]
                        })}
                        className={`text-2xs font-semibold px-2 py-1 rounded-lg border ${on ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:bg-surface-hover'}`}>
                        {lab}
                      </button>
                    )
                  })}
                </div>
              )}
              <label className="flex items-center gap-2 text-2xs text-text-tertiary">Dal
                <input type="date" value={repeatFrom} onChange={e => setRepeatFrom(e.target.value)}
                  aria-label="Prima occorrenza" className={`${inputCls} flex-1`} />
              </label>
              <p className="text-2xs text-text-tertiary bg-surface border border-border rounded-lg px-2.5 py-1.5">
                {prossime.length === 0
                  ? <span className="text-warning">Così non cade nessuna data: controlla «Dal» e «Fino al».</span>
                  : <>
                    <strong className="text-text-secondary">{ruleLabel(rule!)}</strong>
                    {' · '}prossime: {prossime.map(fmtGiorno).join(' · ')}
                    {' · '}arrivano da sole nelle attività di chi la riceve, ognuna con la sua data.
                  </>}
              </p>
            </div>
          )}
        </div>
      )}

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

const GIORNI_BREVI: [string, number][] = [['Lun', 1], ['Mar', 2], ['Mer', 3], ['Gio', 4], ['Ven', 5], ['Sab', 6], ['Dom', 0]]

const fmtGiorno = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

function Skeleton() {
  return <div className="space-y-1.5">{[0, 1].map(i => <div key={i} className="h-11 rounded-xl bg-surface-active animate-pulse" />)}</div>
}

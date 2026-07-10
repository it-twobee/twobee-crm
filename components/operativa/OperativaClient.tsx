'use client'

import { useState, useMemo } from 'react'
import { Plus, Users, CheckCircle2, Clock, AlertTriangle, Repeat, GitBranch, LayoutTemplate, X, Loader2, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Profile, Task, TaskTemplate, Client } from '@/lib/types/database'

interface Props {
  profiles: Profile[]
  tasks: Task[]
  clients: Pick<Client, 'id' | 'company_name' | 'client_type'>[]
  templates: TaskTemplate[]
  currentUserId: string
}

const ic = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/50'

const PRIORITY_COLORS: Record<string, string> = {
  urgente: 'text-error', alta: 'text-warning', media: 'text-info', bassa: 'text-text-secondary',
}

const DEFAULT_TEMPLATES = [
  {
    name: 'Onboarding Growth',
    service_type: 'growth' as const,
    tasks: [
      { title: 'Kickoff call con il cliente', priority: 'alta', days_offset: 0 },
      { title: 'Setup account pubblicitari (Meta + Google)', priority: 'alta', days_offset: 3 },
      { title: 'Creazione pixel e tracciamenti', priority: 'alta', days_offset: 5 },
      { title: 'Prima campagna attiva', priority: 'alta', days_offset: 10 },
      { title: 'Report settimana 1', priority: 'media', days_offset: 14 },
      { title: 'Ottimizzazione campagne (mese 1)', priority: 'media', days_offset: 30 },
    ],
  },
  {
    name: 'Onboarding Digital',
    service_type: 'digital' as const,
    tasks: [
      { title: 'Kickoff call e brief creativo', priority: 'alta', days_offset: 0 },
      { title: 'Accesso ai canali social', priority: 'alta', days_offset: 1 },
      { title: 'Piano editoriale mese 1', priority: 'alta', days_offset: 5 },
      { title: 'Primi 3 post pubblicati', priority: 'media', days_offset: 10 },
      { title: 'Report social mese 1', priority: 'media', days_offset: 30 },
    ],
  },
  {
    name: 'Check mensile cliente',
    service_type: 'entrambi' as const,
    tasks: [
      { title: 'Inserisci KPI del mese', priority: 'alta', days_offset: 2 },
      { title: 'Report mensile al cliente', priority: 'alta', days_offset: 5 },
      { title: 'Call di review risultati', priority: 'media', days_offset: 7 },
      { title: 'Piano azioni mese successivo', priority: 'media', days_offset: 10 },
    ],
  },
]

function WorkloadBar({ count }: { count: number }) {
  const color = count === 0 ? 'bg-surface-active' : count <= 3 ? 'bg-success' : count <= 6 ? 'bg-warning' : 'bg-error'
  const textColor = count === 0 ? 'text-text-tertiary' : count <= 3 ? 'text-success' : count <= 6 ? 'text-warning' : 'text-error'
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 bg-surface-active rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min((count / 10) * 100, 100)}%` }} />
      </div>
      <span className={`text-xs font-bold w-5 text-right ${textColor}`}>{count}</span>
    </div>
  )
}

function TemplateModal({ onClose, onSaved, clients }: {
  onClose: () => void
  onSaved: (t: TaskTemplate) => void
  clients: Pick<Client, 'id' | 'company_name' | 'client_type'>[]
}) {
  const [step, setStep] = useState<'template' | 'apply'>('template')
  const [selectedTemplate, setSelectedTemplate] = useState<typeof DEFAULT_TEMPLATES[0] | null>(null)
  const [selectedClient, setSelectedClient] = useState('')
  const [loading, setLoading] = useState(false)

  const applyTemplate = async () => {
    if (!selectedTemplate || !selectedClient) return
    setLoading(true)
    const supabase = createClient()
    const client = clients.find(c => c.id === selectedClient)
    if (!client) return

    // Trova o crea progetto per il cliente
    const { data: projects } = await supabase.from('projects').select('id').eq('client_id', selectedClient).limit(1)
    let projectId = projects?.[0]?.id
    if (!projectId) {
      const { data: newProject } = await supabase.from('projects').insert({
        client_id: selectedClient, name: `${client.company_name} — ${selectedTemplate.name}`, status: 'attivo', sprint_current: 1,
      }).select('id').single()
      projectId = newProject?.id
    }

    if (!projectId) { toast.error('Errore creazione progetto'); setLoading(false); return }

    const today = new Date()
    const taskPayload = selectedTemplate.tasks.map(t => ({
      project_id: projectId!,
      title: t.title,
      priority: t.priority,
      status: 'da_fare',
      due_date: new Date(today.getTime() + t.days_offset * 86400000).toISOString().split('T')[0],
      depth: 0, position: 0, is_milestone: false, tags: [], logged_hours: 0,
    }))

    await supabase.from('tasks').insert(taskPayload)
    setLoading(false)
    toast.success(`${selectedTemplate.tasks.length} task create per ${client.company_name}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Template onboarding</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary" /></button>
        </div>
        <div className="p-6 space-y-4">
          {step === 'template' && (
            <>
              <p className="text-xs text-text-secondary mb-3">Scegli un template e seleziona il cliente — le task vengono create automaticamente con le scadenze.</p>
              <div className="space-y-2">
                {DEFAULT_TEMPLATES.map(t => (
                  <button key={t.name} onClick={() => setSelectedTemplate(t)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${selectedTemplate?.name === t.name ? 'border-gold/40 bg-gold/5' : 'border-border hover:border-border'}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-text-primary">{t.name}</p>
                      <span className={`text-2xs font-bold px-2 py-0.5 rounded-full ${t.service_type === 'growth' ? 'text-gold-text bg-gold/10' : t.service_type === 'digital' ? 'text-info bg-info/10' : 'text-success bg-success/10'}`}>
                        {t.service_type}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary mt-1">{t.tasks.length} task · {t.tasks[t.tasks.length - 1].days_offset} giorni</p>
                  </button>
                ))}
              </div>
              <button onClick={() => selectedTemplate && setStep('apply')} disabled={!selectedTemplate}
                className="w-full py-2.5 bg-gold text-on-gold font-bold rounded-lg disabled:opacity-50">
                Continua →
              </button>
            </>
          )}
          {step === 'apply' && selectedTemplate && (
            <>
              <div className="bg-gold/5 border border-gold/20 rounded-lg p-3 mb-2">
                <p className="text-xs font-bold text-gold-text">{selectedTemplate.name}</p>
                <p className="text-xs text-text-secondary">{selectedTemplate.tasks.length} task da creare</p>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Seleziona cliente</label>
                <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} className={ic}>
                  <option value="">— Scegli cliente —</option>
                  {clients.filter(c => selectedTemplate.service_type === 'entrambi' || c.client_type === selectedTemplate.service_type || !c.client_type).map(c => (
                    <option key={c.id} value={c.id}>{c.company_name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                {selectedTemplate.tasks.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-text-secondary py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                    <span className="flex-1">{t.title}</span>
                    <span className="text-2xs text-text-tertiary">+{t.days_offset}gg</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep('template')} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary">← Indietro</button>
                <button onClick={applyTemplate} disabled={loading || !selectedClient}
                  className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />} Crea task
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function OperativaClient({ profiles, tasks, clients, templates, currentUserId }: Props) {
  const [activeTab, setActiveTab] = useState(0)
  const [showTemplateModal, setShowTemplateModal] = useState(false)

  // Workload per membro
  const workload = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of tasks) {
      const uid = t.assigned_to ?? t.assignee_id
      if (uid) map[uid] = (map[uid] ?? 0) + 1
    }
    return map
  }, [tasks])

  // Task scadute
  const today = new Date().toISOString().split('T')[0]
  const overdue = tasks.filter(t => t.due_date && t.due_date < today)
  const dueToday = tasks.filter(t => t.due_date === today)
  const unassigned = tasks.filter(t => !t.assigned_to && !t.assignee_id)
  const tasksByStatus = {
    da_fare: tasks.filter(t => t.status === 'da_fare').length,
    in_corso: tasks.filter(t => t.status === 'in_corso').length,
    in_revisione: tasks.filter(t => t.status === 'in_revisione').length,
  }

  const TABS = ['Workload team', 'Task overview', 'Template onboarding']

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Area Operativa</h1>
          <p className="text-text-secondary text-sm mt-0.5">Workload team, task e processi interni</p>
        </div>
        <button onClick={() => setShowTemplateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-sm font-bold rounded-lg hover:bg-gold/90">
          <LayoutTemplate className="w-4 h-4" /> Applica template
        </button>
      </div>

      {/* KPI veloci */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: 'Task attive', v: tasks.length, c: 'text-text-primary' },
          { l: 'Scadute', v: overdue.length, c: overdue.length > 0 ? 'text-error' : 'text-success' },
          { l: 'Scadono oggi', v: dueToday.length, c: dueToday.length > 0 ? 'text-warning' : 'text-text-primary' },
          { l: 'Non assegnate', v: unassigned.length, c: unassigned.length > 0 ? 'text-warning' : 'text-success' },
        ].map(k => (
          <div key={k.l} className="bg-surface border border-border rounded-xl p-4">
            <p className="text-xs text-text-secondary mb-1">{k.l}</p>
            <p className={`text-2xl font-black ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeTab === i ? 'text-gold-text border-gold' : 'text-text-secondary border-transparent hover:text-text-primary'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab 0: Workload */}
      {activeTab === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-xl p-5">
            <p className="text-sm font-bold text-text-primary mb-4">Carico per membro team</p>
            <div className="space-y-3">
              {profiles.filter(p => !['client', 'viewer'].includes(p.app_role ?? '')).map(p => {
                const count = workload[p.id] ?? 0
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-2xs font-bold text-gold-text flex-shrink-0">
                      {(p.full_name || p.email)[0].toUpperCase()}
                    </div>
                    <div className="w-24 min-w-0">
                      <p className="text-xs font-semibold text-text-primary truncate">{p.full_name.split(' ')[0]}</p>
                      <p className="text-2xs text-text-secondary capitalize">{p.app_role}</p>
                    </div>
                    <WorkloadBar count={count} />
                    <span className={`text-2xs font-bold w-16 text-right flex-shrink-0 ${count > 6 ? 'text-error' : count > 3 ? 'text-warning' : 'text-text-secondary'}`}>
                      {count === 0 ? 'libero' : count > 6 ? 'sovraccarico' : count > 3 ? 'occupato' : 'ok'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-5">
            <p className="text-sm font-bold text-text-primary mb-4">Stato task</p>
            <div className="space-y-3">
              {[
                { l: 'Da fare', v: tasksByStatus.da_fare, c: 'bg-surface-active' },
                { l: 'In corso', v: tasksByStatus.in_corso, c: 'bg-gold' },
                { l: 'In revisione', v: tasksByStatus.in_revisione, c: 'bg-info' },
                { l: 'Scadute', v: overdue.length, c: 'bg-error' },
              ].map(s => (
                <div key={s.l} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-24">{s.l}</span>
                  <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${s.c}`} style={{ width: `${Math.min((s.v / Math.max(tasks.length, 1)) * 100, 100)}%` }} />
                  </div>
                  <span className="text-xs font-bold text-text-primary w-6 text-right">{s.v}</span>
                </div>
              ))}
            </div>
            {overdue.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-xs font-bold text-error mb-2">Task scadute</p>
                <div className="space-y-1">
                  {overdue.slice(0, 4).map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      <AlertTriangle className="w-3 h-3 text-error flex-shrink-0" />
                      <span className="text-text-primary truncate flex-1">{t.title}</span>
                      <span className="text-error flex-shrink-0">{t.due_date ? new Date(t.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 1: Task overview */}
      {activeTab === 1 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-background">
                {['Task', 'Priorità', 'Status', 'Assegnato a', 'Scadenza'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tasks.slice(0, 50).map(t => {
                const assigneeId = t.assigned_to ?? t.assignee_id
                const assignee = profiles.find(p => p.id === assigneeId)
                const isOverdue = t.due_date && t.due_date < today
                return (
                  <tr key={t.id} className="hover:bg-surface">
                    <td className="px-4 py-3 text-sm text-text-primary max-w-xs truncate">{t.title}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold capitalize ${PRIORITY_COLORS[t.priority] ?? 'text-text-secondary'}`}>{t.priority}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-text-secondary capitalize">{t.status?.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3">
                      {assignee
                        ? <span className="text-xs text-text-primary">{assignee.full_name.split(' ')[0]}</span>
                        : <span className="text-xs text-warning">⚠ Non assegnata</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${isOverdue ? 'text-error font-bold' : 'text-text-secondary'}`}>
                        {t.due_date ? new Date(t.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '—'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {tasks.length === 0 && <p className="text-center py-12 text-text-secondary text-sm">Nessuna task attiva</p>}
        </div>
      )}

      {/* Tab 2: Template */}
      {activeTab === 2 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {DEFAULT_TEMPLATES.map(t => (
            <div key={t.name} className="bg-surface border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-text-primary">{t.name}</p>
                  <span className={`text-2xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${t.service_type === 'growth' ? 'text-gold-text bg-gold/10' : t.service_type === 'digital' ? 'text-info bg-info/10' : 'text-success bg-success/10'}`}>
                    {t.service_type}
                  </span>
                </div>
                <span className="text-xs text-text-secondary">{t.tasks.length} task</span>
              </div>
              <div className="space-y-1.5 mb-4">
                {t.tasks.map((task, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-text-secondary">
                    <div className="w-1 h-1 rounded-full bg-gold flex-shrink-0" />
                    <span className="flex-1 truncate">{task.title}</span>
                    <span className="text-2xs text-text-tertiary flex-shrink-0">+{task.days_offset}gg</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowTemplateModal(true)}
                className="w-full py-2 text-xs font-bold text-on-gold bg-gold rounded-lg hover:bg-gold/90">
                Applica a cliente
              </button>
            </div>
          ))}
        </div>
      )}

      {showTemplateModal && (
        <TemplateModal
          clients={clients}
          onClose={() => setShowTemplateModal(false)}
          onSaved={() => {}}
        />
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Edit2 } from 'lucide-react'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { SeenProvider, useSeen } from '@/lib/hooks/useSeen'
import type { Client, Project, Sprint, Task, ClientKpi, ClientKpiConfig, Profile, MeetingNote, ProjectAppointment } from '@/lib/types/database'
import { type ProjectComment } from './project-shared'
import { ProgressRing } from './ProjectPrimitives'
import { ContextualCreate } from '@/components/shared/ContextualCreate'
import { ClientAdHocPanel } from '@/components/clients/ClientAdHocPanel'
import { GrowthSections } from './GrowthSections'
import { AppointmentsSection } from './tabs/AppuntamentiTab'
import { MeetingRecapsSection } from './tabs/RiunioniTab'
import { KpiSection } from './tabs/KpiTab'
import { AggiornamentiFeed } from './tabs/AggiornamentiTab'
import { ProjectChatSection } from './tabs/ChatTab'
import { ClientPlanSection } from './tabs/ClientPlanTab'
import { ProgettoView } from './board/ProgettoView'
import { EditProjectModal } from './board/EditProjectModal'
import { STATUS_PROJECT, type PageTab, type ExtTask, type ExtSprint } from './board/types'

export type { ProjectComment }


interface Props {
  client: Client; project: Project; tasks: Task[]; sprints: Sprint[]
  kpis: ClientKpi[]; kpiConfig: ClientKpiConfig | null
  currentProfile: Profile; allProfiles: Profile[]; comments: ProjectComment[]
  appointments: ProjectAppointment[]; meetings: MeetingNote[]
  seenItemIds?: string[]
  backHref?: string
}

// ─── Main ──────────────────────────────────────────────────────────────────────
let accent = 'var(--color-gold-text)'

export function ProjectPageClient({
  client, project: initialProject, tasks: initialTasks, sprints: initialSprints,
  kpis, currentProfile, allProfiles, comments: initialComments,
  appointments, meetings, seenItemIds, backHref,
}: Props) {
  const [activeTab, setActiveTab]         = useState<PageTab>('progetto')
  const [localTasks, setLocalTasks]       = useState<ExtTask[]>(initialTasks as ExtTask[])
  const [localComments, setLocalComments] = useState(initialComments)
  const [localProject, setLocalProject]   = useState(initialProject)
  const [editOpen, setEditOpen]           = useState(false)

  const isAdmin = SUPER_ADMIN_EMAILS.includes(currentProfile?.email ?? '')
    || currentProfile?.app_role === 'admin'
    || currentProfile?.app_role === 'manager'

  const isG = localProject.project_kind === 'growth'
  accent = isG ? 'var(--color-gold-text)' : 'var(--color-info)'

  // Le milestone non sono più task (139): il conteggio guarda solo il lavoro reale.
  const leafTasks     = localTasks.filter(t => !(t as ExtTask).parent_id)
  const done          = leafTasks.filter(t => t.status === 'completato').length
  const total         = leafTasks.length
  const pct           = total ? Math.round(done / total * 100) : 0
  const overdue       = leafTasks.filter(t => t.status !== 'completato' && t.due_date && t.due_date < new Date().toISOString().slice(0, 10)).length
  const newUpdates    = localComments.filter(c => !c.parent_id && Date.now() - new Date(c.created_at).getTime() < 7 * 86400000).length

  const statusBadgeStyle: Record<string, string> = {
    attivo:      'bg-success/10 text-success border-success/20',
    in_pausa:    'bg-warning/10 text-warning border-warning/20',
    completato:  'bg-surface text-text-tertiary border-border',
    archiviato:  'bg-surface text-text-tertiary border-border',
  }

  // Un progetto Growth non è una sequenza di sprint: ha Startup, Routine e
  // Iniziative (§9.2). La sezione compare solo dove ha senso.
  const isGrowth = (localProject as Project & { service_line?: string }).service_line === 'growth'

  const TABS: { key: PageTab; label: string; badge?: number }[] = [
    ...(isGrowth ? [{ key: 'growth' as PageTab, label: '🌱 Growth' }] : []),
    { key: 'progetto',      label: '📋 Progetto' },
    { key: 'appuntamenti',  label: '📅 Appuntamenti', badge: appointments.filter(a => a.date >= new Date().toISOString().slice(0, 10)).length || undefined },
    { key: 'riunioni',      label: '📖 Riunioni', badge: meetings.length || undefined },
    { key: 'kpi',           label: '📊 KPI' },
    { key: 'aggiornamenti', label: '💬 Aggiornamenti', badge: newUpdates || undefined },
    { key: 'piano_cliente', label: '⭐ Task al cliente' },
    { key: 'adhoc',         label: '⚡ Ad hoc cliente' },
    { key: 'chat',          label: '🗨️ Customer Care' },
  ]


  return (
    <SeenProvider profileId={currentProfile?.id ?? ''} initialSeen={seenItemIds ?? []}>
    <SeenOnMount id={localProject.id} type="project" />
    <div className="flex flex-col min-h-full bg-background">
      {/* ── Header ── */}
      <div className="border-b border-border bg-background">
        {/* Breadcrumb */}
        <div className="px-4 sm:px-6 pt-4 pb-0">
          <Link href={backHref ?? `/clienti/${client.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /> {client.company_name}
          </Link>

          {/* Project info row */}
          <div className="flex items-start gap-3 sm:gap-4 mb-3">
            <ProgressRing pct={pct} size={48} accent={accent} />

            <div className="flex-1 min-w-0">
              {/* Title + edit */}
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-lg sm:text-xl font-black text-text-primary leading-tight">{localProject.name}</h1>
                {isAdmin && (
                  <button onClick={() => setEditOpen(true)}
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors shrink-0">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Badges row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border ${statusBadgeStyle[localProject.status] ?? ''}`}>
                  {STATUS_PROJECT.find(o => o.v === localProject.status)?.l}
                </span>
                {localProject.project_kind && (
                  <span className="text-2xs font-bold px-2 py-0.5 rounded-full border"
                    style={{ background: `color-mix(in srgb, ${accent} 7%, transparent)`, color: accent, borderColor: `color-mix(in srgb, ${accent} 15%, transparent)` }}>
                    {isG ? '📈 Growth' : '💻 Digital'}
                  </span>
                )}
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 mt-1.5 text-2xs text-text-tertiary flex-wrap">
                <span>{done}/{total} task</span>
                {overdue > 0 && <span className="text-error font-bold">⚠ {overdue} scadute</span>}
              </div>
            </div>

            {/* §15: CTA "Crea" contestuale — cliente e progetto già precompilati */}
            <ContextualCreate canCreate={isAdmin} ctx={{
              clientId: client.id,
              clientName: client.display_name ?? client.company_name,
              projectId: localProject.id,
              projectName: localProject.name,
            }} />
          </div>

        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-t border-border px-4 sm:px-6">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key ? '' : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
              style={activeTab === tab.key ? { borderBottomColor: accent, color: accent } : {}}>
              {tab.label}
              {tab.badge && tab.badge > 0 && (
                <span className="absolute -top-0.5 right-0 w-4 h-4 bg-error text-text-primary text-[8px] font-black rounded-full flex items-center justify-center">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 p-3 sm:p-5 w-full">
        {activeTab === 'progetto' && (
          <ProgettoView
            project={localProject} client={client} allTasks={localTasks}
            profiles={allProfiles} currentUserId={currentProfile.id} isAdmin={isAdmin} accent={accent}
            onUpdateTasks={setLocalTasks}
          />
        )}
        {activeTab === 'appuntamenti' && (
          <AppointmentsSection project={localProject} client={client} isAdmin={isAdmin} accent={accent}
            profiles={allProfiles} currentUserId={currentProfile.id} />
        )}
        {activeTab === 'riunioni' && (
          <MeetingRecapsSection meetings={meetings} project={localProject} client={client}
            currentProfile={currentProfile} isAdmin={isAdmin} accent={accent}
            sprints={[]} milestones={[]} profiles={allProfiles} />
        )}
        {activeTab === 'kpi' && (
          <KpiSection kpis={kpis} project={localProject} client={client} accent={accent} isAdmin={isAdmin} />
        )}
        {activeTab === 'aggiornamenti' && (
          <AggiornamentiFeed comments={localComments} currentProfile={currentProfile}
            projectId={localProject.id} allProfiles={allProfiles} isAdmin={isAdmin}
            onUpdate={setLocalComments} accent={accent} />
        )}
        {activeTab === 'piano_cliente' && (
          <ClientPlanSection project={localProject} client={client} isAdmin={isAdmin} accent={accent} />
        )}
        {activeTab === 'growth' && (
          <GrowthSections
            projectId={localProject.id}
            projectType={localProject.project_type}
            clientId={client.id}
            tasks={localTasks}
            profiles={allProfiles.map(p => ({ id: p.id, full_name: p.full_name }))}
            canEdit={isAdmin}
          />
        )}
        {activeTab === 'adhoc' && (
          <ClientAdHocPanel
            clientId={client.id}
            projects={[{ id: localProject.id, name: localProject.name }]}
            profiles={allProfiles.map(p => ({ id: p.id, full_name: p.full_name }))}
            canEdit={isAdmin}
            compact
          />
        )}
        {activeTab === 'chat' && currentProfile && (
          <ProjectChatSection
            projectId={localProject.id}
            clientId={client.id}
            projectName={localProject.name}
            currentProfile={currentProfile}
            allProfiles={allProfiles}
            isAdmin={isAdmin}
            accent={accent}
          />
        )}
      </div>

      {/* Edit modal */}
      {editOpen && (
        <EditProjectModal project={localProject} onClose={() => setEditOpen(false)}
          onSaved={patch => setLocalProject(p => ({ ...p, ...patch }))} />
      )}
    </div>
    </SeenProvider>
  )
}

// Segna un elemento come "visto" al montaggio (usato per il progetto: aprirlo = vederlo).
function SeenOnMount({ id, type }: { id: string; type: 'project' | 'sprint' | 'task' }) {
  const { markSeen } = useSeen()
  useEffect(() => { markSeen(id, type) }, [id, type, markSeen])
  return null
}

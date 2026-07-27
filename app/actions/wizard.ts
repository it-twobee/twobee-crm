'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ProjectArea, Visibility } from '@/lib/types/database'

/**
 * Azioni collaterali del wizard progetto. Stesso gate di
 * `createProjectFromWizard`: chi può creare un progetto può anche salvarne il
 * template, invitare una risorsa e aggiungere una voce di catalogo.
 * (Il catalogo "amministrativo" resta super-admin-only in service-catalog.ts.)
 */
async function requireProjectCreator(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role, app_role').eq('id', user.id).single()
  if (p?.role !== 'admin' && p?.app_role !== 'manager') throw new Error('Permesso negato')
  return user.id
}

const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48)

// ── 1) Workstream su misura → voce di catalogo riutilizzabile ───────────────
export async function createCatalogService(input: { area: ProjectArea; label: string }) {
  await requireProjectCreator()
  const label = input.label.trim()
  if (!label) throw new Error('Nome mancante')
  const service_type = slug(label)
  if (!service_type) throw new Error('Nome non valido')

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('service_catalog').select('*')
    .eq('area', input.area).eq('service_type', service_type).is('service_subtype', null)
    .maybeSingle()
  if (existing) return existing

  const { data, error } = await admin
    .from('service_catalog')
    .insert({ area: input.area, service_type, service_subtype: null, label, sort_order: 999 })
    .select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni/catalogo')
  return data
}

// ── 2) Struttura del wizard → nuovo template riutilizzabile ─────────────────
export type TemplateDraftTask = { name: string; visibility: Visibility }
export type TemplateDraftMilestone = {
  name: string; milestone_type: 'delivery' | 'system'; visibility: Visibility
  tasks: TemplateDraftTask[]
}
export type TemplateDraftRecurring = {
  name: string; frequency: string; priority: string | null
  visibility: Visibility; estimated_hours: number | null
}
export type TemplateDraftWorkstream = {
  name: string; workstream_type: 'project' | 'recurring'; visibility: Visibility
  milestones: TemplateDraftMilestone[]
  recurring: TemplateDraftRecurring[]
}

export async function saveWizardTemplate(input: {
  name: string
  description?: string | null
  service_type: string
  service_subtype?: string | null
  workstreams: TemplateDraftWorkstream[]
}) {
  const uid = await requireProjectCreator()
  const name = input.name.trim()
  if (!name) throw new Error('Nome template mancante')
  if (!input.workstreams.length) throw new Error('Struttura vuota')

  const admin = createAdminClient()
  const { data: tpl, error } = await admin
    .from('project_templates')
    .insert({
      service_type: input.service_type,
      service_subtype: input.service_subtype ?? null,
      name, description: input.description?.trim() || null, created_by: uid,
    })
    .select('id').single()
  if (error || !tpl) throw new Error(error?.message ?? 'Template non creato')

  // i nomi arrivano già "nudi" (senza prefisso di convention): il template deve
  // restare riutilizzabile su clienti e servizi diversi
  for (let i = 0; i < input.workstreams.length; i++) {
    const w = input.workstreams[i]
    const { data: wsNode, error: e1 } = await admin
      .from('project_template_nodes')
      .insert({
        template_id: tpl.id, parent_id: null, node_type: 'workstream', name: w.name,
        workstream_type: w.workstream_type, visibility: w.visibility, sort_order: i * 10,
      })
      .select('id').single()
    if (e1 || !wsNode) throw new Error(e1?.message ?? 'Nodo workstream non creato')

    for (let j = 0; j < w.recurring.length; j++) {
      const r = w.recurring[j]
      const { error: e2 } = await admin.from('project_template_nodes').insert({
        template_id: tpl.id, parent_id: wsNode.id, node_type: 'recurring_task', name: r.name,
        frequency: r.frequency, priority: r.priority, visibility: r.visibility,
        estimated_hours: r.estimated_hours, sort_order: j * 10,
      })
      if (e2) throw new Error(e2.message)
    }

    for (let j = 0; j < w.milestones.length; j++) {
      const m = w.milestones[j]
      const { data: msNode, error: e3 } = await admin
        .from('project_template_nodes')
        .insert({
          template_id: tpl.id, parent_id: wsNode.id, node_type: 'milestone', name: m.name,
          milestone_type: m.milestone_type, visibility: m.visibility, sort_order: j * 10,
        })
        .select('id').single()
      if (e3 || !msNode) throw new Error(e3?.message ?? 'Nodo milestone non creato')

      for (let k = 0; k < m.tasks.length; k++) {
        const t = m.tasks[k]
        const { error: e4 } = await admin.from('project_template_nodes').insert({
          template_id: tpl.id, parent_id: msNode.id, node_type: 'task', name: t.name,
          visibility: t.visibility, sort_order: k * 10,
        })
        if (e4) throw new Error(e4.message)
      }
    }
  }

  revalidatePath('/impostazioni/catalogo')
  return tpl.id as string
}

// ── 3) Link d'invito per una risorsa esterna ────────────────────────────────
export async function createTeamInviteLink(input: {
  email: string; app_role: string; job_title?: string | null; area?: string | null
}): Promise<{ url: string; expiresAt: string }> {
  const uid = await requireProjectCreator()
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email non valida')

  const admin = createAdminClient()
  const { data: already } = await admin
    .from('profiles').select('id').eq('email', email).maybeSingle()
  if (already) throw new Error('Questa email è già registrata: cercala nell\'elenco del team')

  const { data, error } = await admin
    .from('invitations')
    .insert({
      email, app_role: input.app_role,
      job_title: input.job_title?.trim() || null, area: input.area || null,
      invited_by: uid,
    })
    .select('token, expires_at').single()
  if (error || !data) throw new Error(error?.message ?? 'Invito non creato')

  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  return { url: `${base}/registrati?token=${data.token}`, expiresAt: data.expires_at as string }
}

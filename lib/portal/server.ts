import 'server-only'
import { cache } from 'react'
import { redirect, notFound } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isMissingPortalSchema, isPortalRole, legacyProject, selectCompany } from './model'
import type { PortalCompany, PortalProject, PortalActivity, PortalRequest, PortalVersion } from './model'

export const requirePortalViewer = cache(async () => {
  const viewer = await getViewer()
  if (!viewer.user) redirect('/login')
  if (!viewer.profile || viewer.profile.is_active === false) redirect('/login?accesso=revocato')
  if (!viewer.isSuperAdmin && !isPortalRole(viewer.profile)) {
    redirect(viewer.isWorkspace ? '/workspace' : '/dashboard')
  }
  return { userId: viewer.user.id, name: viewer.profile.full_name, preview: viewer.isSuperAdmin }
})

export const getPortalContext = cache(async (requested?: string) => {
  const viewer = await requirePortalViewer()
  const db = await createClient()
  const memberships = await db.from('portal_memberships')
    .select('client_id, portal_role').eq('profile_id', viewer.userId).is('revoked_at', null)
  const legacy = isMissingPortalSchema(memberships.error)
  if (memberships.error && !legacy) throw new Error('Non è stato possibile verificare gli accessi al portale.')

  let companies: PortalCompany[] = []
  if (viewer.preview) {
    const result = await db.from('clients').select('id, company_name, display_name').order('company_name')
    if (result.error) throw new Error('Non è stato possibile caricare le aziende per l’anteprima.')
    companies = (result.data ?? []).map(c => ({ id: c.id, name: c.display_name || c.company_name, role: 'lettore' }))
  } else if (legacy) {
    const assignments = await db.from('client_assignments').select('client_id').eq('profile_id', viewer.userId)
    if (assignments.error) throw new Error('Non è stato possibile verificare l’associazione azienda.')
    const ids = (assignments.data ?? []).map(a => a.client_id).filter(Boolean) as string[]
    if (ids.length) {
      const result = await db.from('clients').select('id, company_name, display_name').in('id', ids).order('company_name')
      if (result.error) throw new Error('Non è stato possibile caricare la tua azienda.')
      companies = (result.data ?? []).map(c => ({ id: c.id, name: c.display_name || c.company_name, role: 'lettore' }))
    }
  } else {
    const result = await db.from('portal_companies').select('id, name').order('name')
    if (result.error) throw new Error('Non è stato possibile caricare la tua azienda.')
    companies = (result.data ?? []).flatMap(c => {
      const membership = memberships.data?.find(m => m.client_id === c.id)
      return membership ? [{ id: c.id, name: c.name, role: membership.portal_role as PortalCompany['role'] }] : []
    })
  }
  const company = selectCompany(companies, requested)
  if (requested && !company) notFound()
  return { ...viewer, companies, company, legacy }
})

export const getPortalData = cache(async (requested?: string) => {
  const context = await getPortalContext(requested)
  const empty = { projects: [] as PortalProject[], activities: [] as PortalActivity[], requests: [] as PortalRequest[], versions: [] as PortalVersion[] }
  if (!context.company) return { ...context, ...empty }
  const db = await createClient()
  const clientId = context.company.id
  if (context.legacy) {
    const result = await db.from('projects').select('id, client_id, name, area, status')
      .eq('client_id', clientId).eq('visibility', 'client_visible').is('deleted_at', null).order('name')
    if (result.error) throw new Error('Non è stato possibile caricare i progetti condivisi.')
    return { ...context, ...empty, projects: (result.data ?? []).map(legacyProject) }
  }
  const results = await Promise.all([
    db.from('portal_projects').select('id, client_id, title, area, status, objective, scope, update, next_step, contact, published_at, target_date, date_kind, phase').eq('client_id', clientId).order('title'),
    db.from('portal_activities').select('id, project_id, title, reason, kind, due_date, contact_name, status, version_id').eq('client_id', clientId).not('published_at', 'is', null).order('due_date', { nullsFirst: false }),
    db.from('portal_requests').select('id, project_id, title, body, kind, status, created_at').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100),
    db.from('portal_deliverable_versions').select('id, project_id, title, version, author_name, published_at, approval_required').eq('client_id', clientId).not('published_at', 'is', null).order('published_at', { ascending: false }).limit(100),
  ])
  if (results.some(r => r.error)) throw new Error('Non è stato possibile caricare tutti i contenuti condivisi. Riprova.')
  const projects = (results[0].data ?? []) as PortalProject[]
  // Anche l'anteprima super admin rispetta la pubblicazione del progetto padre.
  const ids = new Set(projects.map(p => p.id))
  return {
    ...context, projects,
    activities: ((results[1].data ?? []) as PortalActivity[]).filter(a => ids.has(a.project_id)),
    requests: ((results[2].data ?? []) as PortalRequest[]).filter(r => !r.project_id || ids.has(r.project_id)),
    versions: ((results[3].data ?? []) as PortalVersion[]).filter(v => ids.has(v.project_id)),
  }
})

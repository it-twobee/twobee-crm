import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { isAdminRole, isSuperAdminRaw } from '@/lib/permissions'
import { AsanaClient } from '@/components/asana/AsanaClient'

export const revalidate = 0

/**
 * §215 — Sezione **temporanea**: serve al travaso da Asana e va tolta quando è
 * finito. Il gate è qui e non solo nella voce di menu: nascondere un link non è
 * una barriera, e questa pagina legge il workspace intero con il token di Marco.
 *
 * Il bersaglio del travaso — progetti, workstream e milestone — si carica qui:
 * sono già dentro TwoBee, e chiederli ad Asana non avrebbe senso.
 */
export default async function AsanaPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  const isAdmin = isSuperAdminRaw(profile.email, profile.app_role)
    || isAdminRole(profile.app_role) || profile.role === 'admin'
  if (!isAdmin) redirect('/dashboard')

  const sb = await createClient()
  const [{ data: projects }, { data: workstreams }, { data: milestones }, { data: clients }] = await Promise.all([
    sb.from('projects').select('id, name, client_id, status').is('deleted_at', null)
      .in('status', ['active', 'draft', 'on_hold']).order('name'),
    sb.from('project_workstreams').select('id, project_id, name').order('sort_order'),
    /* §218 — `milestones` ha `title`, non `name`: `project_workstreams` ha
       `name`, e la somiglianza fra le due tabelle mi ha fatto scrivere la
       colonna sbagliata. La select falliva, `milestones` tornava null, la
       tendina restava vuota e il pulsante «Migra» non si accendeva mai — senza
       che niente lo dicesse. Una select rotta qui è muta: `{ data }` senza
       `error` non ha modo di lamentarsi. */
    sb.from('milestones').select('id, workstream_id, title').order('sort_order'),
    sb.from('clients').select('id, company_name, display_name'),
  ])

  const clientName = new Map((clients ?? []).map(c => [c.id, c.display_name || c.company_name]))

  return (
    <AsanaClient
      projects={(projects ?? []).map(p => ({
        id: p.id, name: p.name, client: p.client_id ? clientName.get(p.client_id) ?? null : null,
      }))}
      workstreams={(workstreams ?? []) as { id: string; project_id: string; name: string }[]}
      milestones={(milestones ?? []).map(m => ({
        id: m.id as string, workstream_id: m.workstream_id as string, name: m.title as string,
      }))}
    />
  )
}

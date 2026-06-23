import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PortfolioClient } from '@/components/progetti/PortfolioClient'

export const revalidate = 0

export default async function PortfolioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // All clients with their projects and tasks (for the "all clients" view and project picker)
  const [{ data: clients }, { data: portfolios }, { data: profiles }] = await Promise.all([
    supabase.from('clients').select(`
      id, company_name, package, mrr, status, client_type, client_label, payment_status,
      projects(
        id, name, status, sprint_current, client_id,
        tasks(id, status, priority, due_date)
      ),
      client_kpis(month, roas, leads_generated, revenue_attributed, ad_spend)
    `).neq('client_label', 'perso').order('company_name'),

    supabase.from('portfolios').select(`
      *,
      portfolio_clients(client_id, priority),
      portfolio_projects(project_id, priority, added_at),
      created_by_profile:profiles!portfolios_created_by_fkey(id, full_name, avatar_url)
    `).order('created_at', { ascending: false }),

    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true),
  ])

  return (
    <PortfolioClient
      clients={(clients ?? []) as Parameters<typeof PortfolioClient>[0]['clients']}
      portfolios={(portfolios ?? []) as Parameters<typeof PortfolioClient>[0]['portfolios']}
      profiles={(profiles ?? []) as Parameters<typeof PortfolioClient>[0]['profiles']}
    />
  )
}

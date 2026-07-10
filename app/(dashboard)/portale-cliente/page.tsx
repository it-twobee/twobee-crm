import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import Link from 'next/link'
import { Users, ArrowRight, Eye, AlertCircle } from 'lucide-react'
import { InviteClientButton } from '@/components/portale-cliente/InviteClientButton'

export const revalidate = 0

export default async function PortaleClienteIndexPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb.from('profiles').select('email, app_role').eq('id', user.id).single()
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || profile?.app_role === 'super_admin'
  if (!isSuperAdmin) redirect('/dashboard')

  const admin = createAdminClient()
  const [{ data: clients }, { data: clientUsers }] = await Promise.all([
    admin.from('clients')
      .select('id, company_name, client_type, package, mrr, risk_score, client_label')
      .order('company_name'),
    // client_id che hanno almeno un utente con ruolo 'client' assegnato
    admin.from('client_assignments')
      .select('client_id, profiles!inner(role)')
      .eq('profiles.role', 'client'),
  ])

  const withAccess = new Set((clientUsers ?? []).map((r: { client_id: string }) => r.client_id))

  const typeLabel: Record<string, string> = {
    growth: 'Growth', digital: 'Digital', growth_digital: 'Growth+Digital',
  }
  const labelColor: Record<string, string> = {
    stabile: 'text-success bg-success/10',
    in_bilico: 'text-warning bg-warning/10',
    perso: 'text-error bg-error/10',
    partner: 'text-gold-text bg-gold-dim',
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-xl bg-gold-dim flex items-center justify-center">
          <Eye className="w-4 h-4 text-gold-text" />
        </div>
        <div>
          <h1 className="text-lg font-black text-text-primary">Preview Portale Cliente</h1>
          <p className="text-xs text-text-tertiary">Solo super admin — seleziona un cliente per vedere la sua vista</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-2xs text-text-tertiary bg-surface border border-border rounded-lg px-2.5 py-1.5">
          <AlertCircle className="w-3 h-3" />
          Vista di sola lettura
        </div>
      </div>

      <div className="space-y-2">
        {(clients ?? []).map(c => (
          <Link key={c.id} href={`/portale-cliente/${c.id}`}
            className="group flex items-center gap-4 bg-surface border border-border hover:border-gold/30 hover:bg-gold/[0.03] rounded-xl px-4 py-3.5 transition-all">
            <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-text-tertiary group-hover:text-gold-text transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-primary truncate">{c.company_name}</p>
              <p className="text-2xs text-text-tertiary">
                {typeLabel[c.client_type] ?? c.client_type}
                {c.package && ` · ${c.package}`}
                {c.mrr ? ` · €${c.mrr.toLocaleString('it-IT')}/mo` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <InviteClientButton clientId={c.id} clientName={c.company_name} hasAccess={withAccess.has(c.id)} />
              {c.client_label && (
                <span className={`text-2xs font-black px-2 py-0.5 rounded-full ${labelColor[c.client_label] ?? 'text-text-tertiary bg-surface'}`}>
                  {c.client_label.replace('_', ' ')}
                </span>
              )}
              {c.risk_score != null && (
                <span className={`text-2xs font-black px-2 py-0.5 rounded-full ${c.risk_score >= 7 ? 'text-error bg-error/10' : c.risk_score >= 4 ? 'text-warning bg-warning/10' : 'text-success bg-success/10'}`}>
                  R{c.risk_score}
                </span>
              )}
              <ArrowRight className="w-3.5 h-3.5 text-text-tertiary group-hover:text-gold-text transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

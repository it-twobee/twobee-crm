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
    stabile: 'text-green-400 bg-green-400/10',
    in_bilico: 'text-yellow-400 bg-yellow-400/10',
    perso: 'text-red-400 bg-red-400/10',
    partner: 'text-[#F5C800] bg-[#F5C800]/10',
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-xl bg-[#F5C800]/10 flex items-center justify-center">
          <Eye className="w-4 h-4 text-[#F5C800]" />
        </div>
        <div>
          <h1 className="text-lg font-black text-white">Preview Portale Cliente</h1>
          <p className="text-xs text-[#444]">Solo super admin — seleziona un cliente per vedere la sua vista</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-[#333] bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5">
          <AlertCircle className="w-3 h-3" />
          Vista di sola lettura
        </div>
      </div>

      <div className="space-y-2">
        {(clients ?? []).map(c => (
          <Link key={c.id} href={`/portale-cliente/${c.id}`}
            className="group flex items-center gap-4 bg-[#0D0D0D] border border-[#1A1A1A] hover:border-[#F5C800]/30 hover:bg-[#F5C800]/3 rounded-xl px-4 py-3.5 transition-all">
            <div className="w-8 h-8 rounded-lg bg-[#1A1A1A] flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-[#444] group-hover:text-[#F5C800] transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{c.company_name}</p>
              <p className="text-[10px] text-[#444]">
                {typeLabel[c.client_type] ?? c.client_type}
                {c.package && ` · ${c.package}`}
                {c.mrr ? ` · €${c.mrr.toLocaleString('it-IT')}/mo` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <InviteClientButton clientId={c.id} clientName={c.company_name} hasAccess={withAccess.has(c.id)} />
              {c.client_label && (
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${labelColor[c.client_label] ?? 'text-[#444] bg-[#1A1A1A]'}`}>
                  {c.client_label.replace('_', ' ')}
                </span>
              )}
              {c.risk_score != null && (
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${c.risk_score >= 7 ? 'text-red-400 bg-red-400/10' : c.risk_score >= 4 ? 'text-yellow-400 bg-yellow-400/10' : 'text-green-400 bg-green-400/10'}`}>
                  R{c.risk_score}
                </span>
              )}
              <ArrowRight className="w-3.5 h-3.5 text-[#222] group-hover:text-[#F5C800] transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

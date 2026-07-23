import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Clock, Calendar, ArrowRight, Users, Headphones } from 'lucide-react'

export const revalidate = 0

export default async function WorkspaceDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [hrRes, { data: profile }, clientsRes, ticketsRes] = await Promise.all([
    supabase.from('hr_requests').select('id, status').eq('profile_id', user.id).eq('status', 'pending'),
    supabase.from('profiles').select('full_name, app_role, email, google_connected').eq('id', user.id).single(),
    supabase.from('clients_workspace').select('id').neq('client_label', 'perso'),
    supabase.from('tickets').select('id').in('status', ['aperto', 'in_lavorazione']),
  ])

  const googleConnected = Boolean((profile as { google_connected?: boolean } | null)?.google_connected)
  const name = profile?.full_name?.split(' ')[0] ?? 'ciao'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Ciao, {name} 👋</h1>
        <p className="text-text-secondary text-sm mt-1">
          {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Collega Google Calendar — per tutti i membri, finché non connesso */}
      {!googleConnected && (
        <div className="mb-6 flex items-center gap-3 p-4 rounded-xl border border-gold/30 bg-gold-dim">
          <Calendar className="w-5 h-5 text-gold-text shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">Collega il tuo Google Calendar aziendale</p>
            <p className="text-xs text-text-secondary mt-0.5">Sincronizza appuntamenti e scadenze, e crea eventi direttamente dal calendario.</p>
          </div>
          <a href="/api/google/auth"
            className="px-4 py-2 bg-gold text-on-gold rounded-lg text-sm font-bold hover:bg-gold/90 transition-colors shrink-0">
            Collega ora
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-8">
        <Link href="/workspace/clienti" className="p-5 rounded-2xl bg-surface border border-info/20 hover:bg-surface-hover transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-text-secondary text-xs">Clienti attivi</span>
            <Users className="w-4 h-4 text-info" />
          </div>
          <p className="text-2xl font-bold text-text-primary">{clientsRes.data?.length ?? 0}</p>
        </Link>
        <Link href="/workspace/customer-care/tickets" className="p-5 rounded-2xl bg-surface border border-gold/20 hover:bg-surface-hover transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-text-secondary text-xs">Ticket aperti</span>
            <Headphones className="w-4 h-4 text-gold-text" />
          </div>
          <p className="text-2xl font-bold text-text-primary">{ticketsRes.data?.length ?? 0}</p>
        </Link>
      </div>

      {/* HR alert */}
      {(hrRes.data?.length ?? 0) > 0 && (
        <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-gold-dim border border-gold/20">
          <Clock className="w-4 h-4 text-gold-text shrink-0" />
          <span className="text-gold-text text-sm">
            {hrRes.data!.length} richiesta HR in attesa
          </span>
          <Link href="/workspace/hr" className="ml-auto text-gold-text/60 hover:text-gold-text text-xs flex items-center gap-1">
            Vedi <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      <div className="bg-surface border border-border rounded-2xl p-8 text-center">
        <p className="text-sm text-text-secondary">
          Le attività torneranno qui insieme al nuovo flusso di progetto.
        </p>
      </div>
    </div>
  )
}

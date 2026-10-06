import { redirect } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { getSessionProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canGovernProjects } from '@/lib/permissions'
import { loadSocialBoard } from '@/lib/social-server'
import { SocialPageClient } from '@/components/social/SocialPageClient'

export const dynamic = 'force-dynamic'

/* §467 — Social nel workspace: gli stessi dati, i nomi dei clienti dalla vista
   senza economics (§211), e una RLS che agli esterni lascia i loro progetti. */
export default async function WorkspaceSocialPage({ searchParams }: { searchParams: { mese?: string } }) {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.role !== 'team') redirect('/workspace')
  const data = await loadSocialBoard(await createClient(), { userId: profile.id, mese: searchParams.mese, clientsTable: 'clients_workspace' })
  return (
    <div className="min-h-full p-4 sm:p-6">
      <header className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-dim"><Megaphone className="h-5 w-5 text-gold-text" aria-hidden="true" /></span>
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">Social</h1>
          <p className="text-2xs text-text-tertiary">Il piano editoriale dei progetti social, giorno per giorno.</p>
        </div>
      </header>
      <SocialPageClient data={data} me={{ id: profile.id, governa: canGovernProjects(profile), lettore: profile.app_role === 'viewer' }} />
    </div>
  )
}

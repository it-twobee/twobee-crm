import { redirect } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { getSessionProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { loadSfida } from '@/lib/linkedin-server'
import { SfidaLinkedin } from '@/components/linkedin/SfidaLinkedin'

export const dynamic = 'force-dynamic'

/* §477 — la sfida LinkedIn del team: chi fa più impression e reazioni nel mese. */
export default async function WorkspaceSfidaLinkedinPage({ searchParams }: { searchParams: { mese?: string } }) {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin' && profile.role !== 'team') redirect('/workspace')
  const data = await loadSfida(await createClient(), searchParams.mese)
  return (
    <div className="min-h-full p-4 sm:p-6">
      <header className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-dim"><Trophy className="h-5 w-5 text-gold-text" aria-hidden="true" /></span>
        <div>
          <h1 className="font-heading text-2xl font-bold text-text-primary">Sfida LinkedIn</h1>
          <p className="text-2xs text-text-tertiary">Impression, reazioni e commenti dei post del team, mese per mese.</p>
        </div>
      </header>
      <SfidaLinkedin data={data} me={profile.id} base="/workspace/linkedin" />
    </div>
  )
}

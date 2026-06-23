import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const revalidate = 0

export default async function DocumentiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-6">
      <h1 className="text-2xl font-black text-white mb-2">Documenti</h1>
      <p className="text-text-secondary text-sm">Gestione file clienti — Step 9</p>
    </div>
  )
}

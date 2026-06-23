import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FatturazioneGlobaleClient } from '@/components/fatturazione/FatturazioneGlobaleClient'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

export const revalidate = 0

export default async function FatturazionePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('app_role,email').eq('id', user.id).single()
  const canAccess = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || ['admin', 'manager'].includes(profile?.app_role ?? '')
  if (!canAccess) redirect('/dashboard')

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, client:clients(id, company_name), due_date, reminder_sent_at, reminder_count, description')
    .order('month', { ascending: false })

  return <FatturazioneGlobaleClient invoices={(invoices ?? []) as Parameters<typeof FatturazioneGlobaleClient>[0]['invoices']} />
}

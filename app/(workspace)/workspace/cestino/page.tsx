import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listDeletedTasks } from '@/app/actions/tasks-trash'
import { CestinoClient } from '@/components/cestino/CestinoClient'

export const revalidate = 0

export default async function WorkspaceCestinoPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const tasks = await listDeletedTasks()
  return <CestinoClient initialTasks={tasks} />
}

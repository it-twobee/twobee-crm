import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CronologiaClient } from '@/components/impostazioni/CronologiaClient'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { PROFILE_COLUMNS } from '@/lib/profile-columns'
import { fetchActivity, fetchRetentionStatus, type ActivityAuthor } from '@/app/actions/activity'
import type { OsVersion, OsVersionChange, Profile } from '@/lib/types/database'

export const revalidate = 0

const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

export default async function CronologiaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).single()
  const isAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || profile?.app_role === 'admin'
  if (!isAdmin) redirect('/dashboard')

  const now = Date.now()
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)

  const [page, authorsRes, retention, versionsRes, total, today, week, created, updated, deleted] = await Promise.all([
    fetchActivity({}, 0),
    supabase.from('profiles').select('id, full_name, avatar_url').order('full_name'),
    fetchRetentionStatus(),
    /* Le versioni arrivano coi loro cambiamenti: sono poche righe e servono
       tutte insieme per il confronto fra una release e la precedente. */
    supabase.from('os_versions')
      .select('*, changes:os_version_changes(*)')
      .order('major', { ascending: false })
      .order('minor', { ascending: false })
      .order('patch', { ascending: false }),
    supabase.from('activity_log').select('id', { count: 'exact', head: true }),
    supabase.from('activity_log').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay.toISOString()),
    supabase.from('activity_log').select('id', { count: 'exact', head: true }).gte('created_at', iso(now - 7 * DAY)),
    supabase.from('activity_log').select('id', { count: 'exact', head: true }).eq('action', 'create'),
    supabase.from('activity_log').select('id', { count: 'exact', head: true }).eq('action', 'update'),
    supabase.from('activity_log').select('id', { count: 'exact', head: true }).eq('action', 'delete'),
  ])

  const authors = (authorsRes.data ?? []) as ActivityAuthor[]

  /* Quante modifiche ha fatto ciascuno: conteggi esatti, non stime sulla pagina
     caricata. Sono head query su una colonna indicizzata, costano nulla. */
  const authorCounts = await Promise.all([
    ...authors.map(a =>
      supabase.from('activity_log').select('id', { count: 'exact', head: true }).eq('user_id', a.id)
        .then(r => [a.id, r.count ?? 0] as const)),
    supabase.from('activity_log').select('id', { count: 'exact', head: true }).is('user_id', null)
      .then(r => ['sistema', r.count ?? 0] as const),
  ])

  type VersionRow = OsVersion & { changes: OsVersionChange[] }
  const versionsMissing = versionsRes.error?.code === 'PGRST205' || versionsRes.error?.code === '42P01'
  const versions = (versionsRes.data ?? []) as unknown as VersionRow[]

  return (
    <div className="p-4 sm:p-6">
      <CronologiaClient
        initialRows={page.rows}
        initialTotal={page.total}
        authors={authors}
        authorCounts={Object.fromEntries(authorCounts)}
        stats={{
          total: total.count ?? 0,
          today: today.count ?? 0,
          week: week.count ?? 0,
          create: created.count ?? 0,
          update: updated.count ?? 0,
          delete: deleted.count ?? 0,
        }}
        retention={retention}
        versions={versions}
        versionsMissing={versionsMissing}
        currentProfile={profile as Profile}
      />
    </div>
  )
}

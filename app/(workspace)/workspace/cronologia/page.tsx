import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CronologiaClient } from '@/components/workspace/CronologiaClient'
import { VersionNews } from '@/components/workspace/VersionNews'
import type { ActivityLog, OsVersion, OsVersionChange } from '@/lib/types/database'

export const revalidate = 0

export default async function CronologiaPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  // Solo le proprie attività. Riusa activity_log (esiste già, usata dalla
  // cronologia admin): niente tabella nuova.
  const [{ data }, versionRes] = await Promise.all([
    sb.from('activity_log').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(300),
    /* L'ultima versione pubblicata: il changelog lo scrive l'admin, ma serve a
       chi lavora nel tool più che a chi lo amministra. Le bozze non escono da
       qui: le nasconde la RLS (§179). */
    sb.from('os_versions').select('*, changes:os_version_changes(*)')
      .eq('status', 'pubblicata')
      .order('major', { ascending: false })
      .order('minor', { ascending: false })
      .order('patch', { ascending: false })
      .limit(1).maybeSingle(),
  ])

  const latest = versionRes.error ? null : (versionRes.data as unknown as (OsVersion & { changes: OsVersionChange[] }) | null)

  return (
    <>
      {latest && (
        <div className="px-6 pt-6">
          <VersionNews version={latest} changes={latest.changes ?? []} />
        </div>
      )}
      <CronologiaClient logs={(data ?? []) as ActivityLog[]} />
    </>
  )
}

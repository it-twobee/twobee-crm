'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { cycleOf, nextVersion, parseVersion, formatVersion, compareVersions } from '@/lib/os-version'
import type { OsVersion, OsVersionChange } from '@/lib/types/database'

async function requireAdmin(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('email, app_role').eq('id', user.id).single()
  const ok = SUPER_ADMIN_EMAILS.includes(p?.email ?? '') || p?.app_role === 'admin'
  if (!ok) throw new Error('Solo gli admin scrivono il registro delle versioni')
  return user.id
}

function rev() {
  revalidatePath('/impostazioni/cronologia')
  revalidatePath('/workspace/cronologia')
}

export type NewVersionInput = {
  /** `ciclo` chiude i 15 giorni, `sostanziale` esce a metà, `major` la decide una persona */
  bump: 'ciclo' | 'sostanziale' | 'major'
  title: string
  summary?: string
}

/**
 * Apre la prossima versione in bozza. Il numero non si digita: lo dice il
 * calendario (un ciclo ogni 15 giorni) più l'ultima versione registrata.
 */
export async function createVersion(input: NewVersionInput): Promise<OsVersion> {
  const userId = await requireAdmin()
  if (!input.title.trim()) throw new Error('La versione ha bisogno di un titolo')

  const db = createAdminClient()
  const { data: existing } = await db.from('os_versions').select('version')
  const latest = (existing ?? [])
    .map((v: { version: string }) => parseVersion(v.version))
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .sort(compareVersions)[0] ?? null

  const now = new Date()
  const next = nextVersion(latest, input.bump, now)
  const cycle = cycleOf(now)

  const { data, error } = await db.from('os_versions').insert({
    version: formatVersion(next),
    major: next.major, minor: next.minor, patch: next.patch,
    title: input.title.trim(),
    summary: input.summary?.trim() || null,
    period_start: cycle.start,
    period_end: cycle.end,
    status: 'bozza',
    created_by: userId,
  }).select('*').single()

  if (error) throw new Error(error.message)
  rev()
  return data as OsVersion
}

export async function updateVersion(id: string, patch: Partial<Pick<OsVersion, 'title' | 'summary' | 'period_start' | 'period_end'>>) {
  await requireAdmin()
  const { error } = await createAdminClient().from('os_versions')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

/**
 * Pubblica una versione. Una bozza la vedono solo gli admin: finché il ciclo è
 * aperto le note cambiano, e una nota di rilascio che cambia sotto gli occhi
 * di chi la legge non è una nota di rilascio.
 */
export async function publishVersion(id: string) {
  await requireAdmin()
  const db = createAdminClient()
  const { count } = await db.from('os_version_changes').select('id', { count: 'exact', head: true }).eq('version_id', id)
  if (!count) throw new Error('Una versione senza nemmeno una voce non dice cosa è cambiato: aggiungine una')

  const { error } = await db.from('os_versions')
    .update({ status: 'pubblicata', released_at: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

export async function unpublishVersion(id: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('os_versions')
    .update({ status: 'bozza', released_at: null, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

export async function deleteVersion(id: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('os_versions').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

export type ChangeInput = {
  kind: OsVersionChange['kind']
  area: string
  title: string
  detail?: string
  before_text?: string
  after_text?: string
  impact?: OsVersionChange['impact']
}

/** Una voce nuova va in fondo: l'ordine di scrittura è l'ordine di lettura. */
export async function addChange(versionId: string, input: ChangeInput): Promise<OsVersionChange> {
  await requireAdmin()
  if (!input.title.trim()) throw new Error('La voce ha bisogno di un titolo')

  const db = createAdminClient()
  const { data: last } = await db.from('os_version_changes')
    .select('sort_order').eq('version_id', versionId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await db.from('os_version_changes').insert({
    version_id: versionId,
    kind: input.kind,
    area: input.area.trim() || 'Generale',
    title: input.title.trim(),
    detail: input.detail?.trim() || null,
    before_text: input.before_text?.trim() || null,
    after_text: input.after_text?.trim() || null,
    impact: input.impact ?? 'medio',
    sort_order: ((last as { sort_order: number } | null)?.sort_order ?? 0) + 10,
  }).select('*').single()

  if (error) throw new Error(error.message)
  rev()
  return data as OsVersionChange
}

export async function updateChange(id: string, input: Partial<ChangeInput>) {
  await requireAdmin()
  const { error } = await createAdminClient().from('os_version_changes').update(input).eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

export async function deleteChange(id: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('os_version_changes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

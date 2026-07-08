'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function ensureProjectChannels(
  projectId: string,
  clientId: string,
  projectName: string,
  projectKind?: string | null
) {
  const supabase = createAdminClient()
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'progetto'
  const map: Record<string, string> = {}

  const { data: existing } = await supabase
    .from('chat_channels')
    .select('id, type')
    .eq('project_id', projectId)
    .in('type', ['customer_care', 'cliente_interno'])

  ;(existing ?? []).forEach((c: { id: string; type: string }) => {
    map[c.type] = c.id
  })

  if (map['cliente_interno'] && map['customer_care']) return map

  const { data: posRow } = await supabase
    .from('chat_channels')
    .select('position')
    .eq('client_id', clientId)
    .order('position', { ascending: false })
    .limit(1)
    .single()

  const nextPos = (posRow?.position ?? -1) + 1
  const createdIds: string[] = []

  for (const [type, name] of [
    ['cliente_interno', 'team-' + slug],
    ['customer_care',   'cc-'   + slug],
  ] as [string, string][]) {
    if (!map[type]) {
      const { data } = await supabase.from('chat_channels').insert({
        name, type, client_id: clientId, project_id: projectId,
        is_archived: false, is_read_only: false, position: nextPos,
      }).select('id').single()
      if (data) { map[type] = data.id; createdIds.push(data.id) }
    }
  }

  if (createdIds.length > 0 && projectKind) {
    const { data: teamProfiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_active', true)
      .or(`area.eq.${projectKind},app_role.eq.admin,app_role.eq.super_admin`)

    if (teamProfiles?.length) {
      const memberships = createdIds.flatMap(chId =>
        teamProfiles.map((p: { id: string }) => ({ channel_id: chId, profile_id: p.id }))
      )
      await supabase.from('channel_members').upsert(memberships, {
        onConflict: 'channel_id,profile_id',
        ignoreDuplicates: true,
      })
    }
  }

  return map
}

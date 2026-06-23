'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function ensureProjectChannels(projectId: string, clientId: string, projectName: string) {
  const supabase = createAdminClient()
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'progetto'
  const map: Record<string, string> = {}

  // Cerca canali già esistenti per questo specifico progetto
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

  for (const [type, name] of [
    ['cliente_interno', 'team-' + slug],
    ['customer_care',   'cc-'   + slug],
  ] as [string, string][]) {
    if (!map[type]) {
      const { data } = await supabase.from('chat_channels').insert({
        name, type, client_id: clientId, project_id: projectId,
        is_archived: false, is_read_only: false, position: nextPos,
      }).select('id').single()
      if (data) map[type] = data.id
    }
  }

  return map
}

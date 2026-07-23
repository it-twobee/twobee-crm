'use server'

import { createClient } from '@/lib/supabase/server'

export type SearchType = 'cliente' | 'messaggio' | 'documento'

export interface SearchResult {
  type: SearchType
  id: string
  title: string
  subtitle?: string
  href: string
}

export async function globalSearch(raw: string): Promise<SearchResult[]> {
  const q = raw.trim()
  if (q.length < 2) return []

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return []

  // escape dei wildcard LIKE
  const term = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`

  const [clientsR, messagesR, documentsR] = await Promise.all([
    sb.from('clients').select('id, company_name').ilike('company_name', term).limit(6),
    sb.from('chat_messages')
      .select('id, content, channel:chat_channels(id, name)')
      .ilike('content', term).eq('is_deleted', false)
      .order('created_at', { ascending: false }).limit(8),
    sb.from('documents').select('id, name, client_id').ilike('name', term).limit(6),
  ])

  const results: SearchResult[] = []

  for (const c of (clientsR.data ?? []) as { id: string; company_name: string }[]) {
    results.push({ type: 'cliente', id: c.id, title: c.company_name, href: `/clienti/${c.id}` })
  }
  for (const m of (messagesR.data ?? []) as unknown as { id: string; content: string; channel: { id: string; name: string } | null }[]) {
    results.push({
      type: 'messaggio', id: m.id,
      title: m.content.length > 80 ? m.content.slice(0, 80) + '…' : m.content,
      subtitle: m.channel?.name ? `#${m.channel.name}` : undefined,
      href: '/chat',
    })
  }
  for (const d of (documentsR.data ?? []) as { id: string; name: string; client_id: string | null }[]) {
    results.push({
      type: 'documento', id: d.id, title: d.name,
      href: d.client_id ? `/clienti/${d.client_id}` : '/documenti',
    })
  }

  return results
}

// Ricerca del portale workspace: stesso motore, rotte /workspace/*.
// La RLS scopa già ciò che l'utente vede.
export async function workspaceSearch(raw: string): Promise<SearchResult[]> {
  const q = raw.trim()
  if (q.length < 2) return []

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return []

  const term = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`

  const [clientsR, documentsR] = await Promise.all([
    sb.from('clients_workspace').select('id, company_name').neq('client_label', 'perso').ilike('company_name', term).limit(6),
    sb.from('documents').select('id, name').ilike('name', term).limit(6),
  ])

  const results: SearchResult[] = []
  for (const c of (clientsR.data ?? []) as { id: string; company_name: string }[]) {
    results.push({ type: 'cliente', id: c.id, title: c.company_name, href: `/workspace/clienti/${c.id}` })
  }
  for (const d of (documentsR.data ?? []) as { id: string; name: string }[]) {
    results.push({ type: 'documento', id: d.id, title: d.name, href: '/workspace/documenti' })
  }
  return results
}

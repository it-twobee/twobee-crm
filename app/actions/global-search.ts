'use server'

import { createClient } from '@/lib/supabase/server'

export type SearchType = 'cliente' | 'progetto' | 'task' | 'messaggio' | 'documento' | 'deal'

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

  const [clientsR, projectsR, tasksR, messagesR, documentsR, dealsR] = await Promise.all([
    sb.from('clients').select('id, company_name').ilike('company_name', term).limit(6),
    sb.from('projects').select('id, name, client_id').ilike('name', term).limit(6),
    sb.from('tasks').select('id, title, project_id, projects(client_id)').ilike('title', term).limit(8),
    sb.from('chat_messages')
      .select('id, content, channel:chat_channels(id, name)')
      .ilike('content', term).eq('is_deleted', false)
      .order('created_at', { ascending: false }).limit(8),
    sb.from('documents').select('id, name, client_id').ilike('name', term).limit(6),
    sb.from('deals').select('id, title, company_name, stage').ilike('title', term).limit(6),
  ])

  const results: SearchResult[] = []

  for (const c of (clientsR.data ?? []) as { id: string; company_name: string }[]) {
    results.push({ type: 'cliente', id: c.id, title: c.company_name, href: `/clienti/${c.id}` })
  }
  for (const p of (projectsR.data ?? []) as { id: string; name: string; client_id: string | null }[]) {
    results.push({
      type: 'progetto', id: p.id, title: p.name,
      href: p.client_id ? `/clienti/${p.client_id}/progetto/${p.id}` : '/progetti',
    })
  }
  for (const t of (tasksR.data ?? []) as unknown as { id: string; title: string; project_id: string | null; projects: { client_id: string | null } | null }[]) {
    const clientId = t.projects?.client_id
    results.push({
      type: 'task', id: t.id, title: t.title,
      href: clientId && t.project_id ? `/clienti/${clientId}/progetto/${t.project_id}` : '/task',
    })
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
  for (const d of (dealsR.data ?? []) as { id: string; title: string; company_name: string | null; stage: string }[]) {
    results.push({ type: 'deal', id: d.id, title: d.title, subtitle: d.company_name ?? undefined, href: '/commerciale' })
  }

  return results
}

// Ricerca del portale workspace: stesso motore, ma limitata al perimetro
// informativo del workspace (clienti, progetti, task, documenti) e con rotte
// /workspace/*. Niente chat/commerciale. La RLS scopa già ciò che l'utente vede.
export async function workspaceSearch(raw: string): Promise<SearchResult[]> {
  const q = raw.trim()
  if (q.length < 2) return []

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return []

  const term = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`

  const [clientsR, projectsR, tasksR, documentsR] = await Promise.all([
    sb.from('clients').select('id, company_name').neq('client_label', 'perso').ilike('company_name', term).limit(6),
    sb.from('projects').select('id, name').eq('status', 'attivo').ilike('name', term).limit(8),
    sb.from('tasks').select('id, title, project_id').ilike('title', term).limit(10),
    sb.from('documents').select('id, name').ilike('name', term).limit(6),
  ])

  const results: SearchResult[] = []
  for (const c of (clientsR.data ?? []) as { id: string; company_name: string }[]) {
    results.push({ type: 'cliente', id: c.id, title: c.company_name, href: `/workspace/clienti/${c.id}` })
  }
  for (const p of (projectsR.data ?? []) as { id: string; name: string }[]) {
    results.push({ type: 'progetto', id: p.id, title: p.name, href: `/workspace/progetti/${p.id}` })
  }
  for (const t of (tasksR.data ?? []) as { id: string; title: string; project_id: string | null }[]) {
    results.push({
      type: 'task', id: t.id, title: t.title,
      href: t.project_id ? `/workspace/progetti/${t.project_id}` : '/workspace/attivita',
    })
  }
  for (const d of (documentsR.data ?? []) as { id: string; name: string }[]) {
    results.push({ type: 'documento', id: d.id, title: d.name, href: '/workspace/documenti' })
  }
  return results
}

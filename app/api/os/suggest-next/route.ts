import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

interface OsTask {
  id: string
  title: string
  category: string
  priority: string
  description: string | null
  depends_on: string[] | null
  implementation_order: number | null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', user.id).single()
  if (!profile || !SUPER_ADMIN_EMAILS.includes(profile.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { tasks } = await req.json() as { tasks: OsTask[] }
  if (tasks.length === 0) return NextResponse.json({ taskId: null, reason: 'Nessun task aperto.' })

  const openIds = new Set(tasks.map(t => t.id))

  // Filtra task con dipendenze non ancora completate
  const unblocked = tasks.filter(t => {
    const deps = t.depends_on ?? []
    return deps.every(depId => !openIds.has(depId))
  })

  if (unblocked.length === 0) return NextResponse.json({ taskId: null, reason: 'Tutti i task hanno dipendenze aperte.' })

  // Ordina per implementation_order, poi priority come fallback
  const PRIO_ORDER = ['critica', 'alta', 'media', 'bassa']
  const sorted = [...unblocked].sort((a, b) => {
    const orderA = a.implementation_order ?? 99
    const orderB = b.implementation_order ?? 99
    if (orderA !== orderB) return orderA - orderB
    return PRIO_ORDER.indexOf(a.priority) - PRIO_ORDER.indexOf(b.priority)
  })

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: 'Sei un engineering coach. Scegli il task da fare ADESSO tra quelli disponibili (dipendenze già soddisfatte). Considera: impatto sul prodotto, priorità, ordine di implementazione. Rispondi SOLO con JSON valido.',
        },
        {
          role: 'user',
          content: `Task disponibili (senza dipendenze bloccanti), già ordinati per priorità:
${sorted.map(t => `${t.id}: [${t.category}][${t.priority}][ordine:${t.implementation_order ?? '?'}] ${t.title} — ${t.description ?? ''}`).join('\n')}

Scegli il task più urgente e strategico. Rispondi con:
{"taskId":"<id esatto>","reason":"<spiegazione 1 frase, italiano>"}`,
        },
      ],
    }),
  })

  if (!groqRes.ok) {
    return NextResponse.json({ taskId: sorted[0].id, reason: 'Task con priorità più alta (fallback).' })
  }

  const groqData = await groqRes.json()
  const raw = groqData.choices?.[0]?.message?.content ?? '{}'
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    const result = JSON.parse(match?.[0] ?? '{}')
    const valid = sorted.find(t => t.id === result.taskId)
    if (!valid) return NextResponse.json({ taskId: sorted[0].id, reason: 'Task con priorità più alta.' })
    return NextResponse.json({ taskId: result.taskId, reason: result.reason ?? '' })
  } catch {
    return NextResponse.json({ taskId: sorted[0].id, reason: 'Task con priorità più alta.' })
  }
}

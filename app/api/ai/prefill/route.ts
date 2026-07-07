import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Route AI Prefill generica (addendum §16). L'AI SUGGERISCE, non salva mai.
// Estendibile per entityType (client/project/task/quote/proposal/report/timesheet).
// Fase 2 MVP: implementato 'timesheet' (improve/summarize). Gli altri tornano 501.

interface Body {
  entityType: string
  entityId?: string
  mode?: 'suggest' | 'improve' | 'summarize' | 'generate'
  context?: Record<string, unknown>
  fieldsRequested?: string[]
}

async function groqJson(prompt: string): Promise<any> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}`)
  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? ''
  const match = raw.match(/\{[\s\S]*\}/)
  return JSON.parse(match?.[0] ?? '{}')
}

export async function POST(req: NextRequest) {
  const body: Body = await req.json()
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  try {
    if (body.entityType === 'timesheet') {
      const note = String(body.context?.note ?? '').trim()
      const task = body.context?.task ? ` (attività: ${body.context.task})` : ''
      if (!note) return NextResponse.json({ error: 'Nota vuota' }, { status: 400 })
      const prompt = `Riscrivi in modo professionale e conciso questa descrizione di attività di lavoro${task}, in italiano, prima persona plurale o impersonale, 1-2 frasi, senza inventare nulla che non sia implicito nel testo:
"${note}"
Rispondi SOLO con JSON: { "suggestions": { "description": "..." }, "confidence": 0.0, "missing_data": [], "sources_used": ["timesheet_note"] }`
      const parsed = await groqJson(prompt)
      return NextResponse.json({
        suggestions: parsed.suggestions ?? {},
        confidence: parsed.confidence ?? 0.7,
        missing_data: parsed.missing_data ?? [],
        sources_used: parsed.sources_used ?? [],
      })
    }

    return NextResponse.json({ error: `entityType "${body.entityType}" non ancora supportato` }, { status: 501 })
  } catch (e) {
    console.error('[ai/prefill]', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

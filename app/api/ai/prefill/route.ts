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

async function groqJson(prompt: string, maxTokens = 1400): Promise<any> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
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
    // ── CLIENT KNOWLEDGE: compila i campi strutturati dai dati reali del cliente
    if (body.entityType === 'client') {
      const clientId = body.entityId
      if (!clientId) return NextResponse.json({ error: 'clientId mancante' }, { status: 400 })

      const [clientRes, notesRes, interRes, meetRes] = await Promise.all([
        sb.from('clients').select('company_name, industry, market_area, client_type, package').eq('id', clientId).maybeSingle(),
        sb.from('client_notes').select('content').eq('client_id', clientId).order('created_at', { ascending: false }).limit(20),
        sb.from('client_interactions').select('type, outcome, notes, date').eq('client_id', clientId).order('date', { ascending: false }).limit(20),
        sb.from('meeting_notes').select('title, summary, decisions, next_actions').eq('client_id', clientId).order('date', { ascending: false }).limit(10),
      ])
      const client = clientRes.data as { company_name: string; industry: string | null; market_area: string | null; client_type: string; package: string } | null
      if (!client) return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 })

      const sources: string[] = []
      const notes = (notesRes.data ?? []).map((n: { content: string }) => n.content).filter(Boolean)
      if (notes.length) sources.push(`${notes.length} note`)
      const inter = (interRes.data ?? []) as { type: string; outcome: string | null; notes: string | null; date: string }[]
      if (inter.length) sources.push(`${inter.length} interazioni`)
      const meets = (meetRes.data ?? []) as { title: string; summary: string | null; decisions: string | null; next_actions: string | null }[]
      if (meets.length) sources.push(`${meets.length} riunioni`)

      const prompt = `Sei un analyst di un'agenzia. Compila la knowledge base strutturata del cliente "${client.company_name}" usando SOLO i dati forniti. Non inventare.
Settore: ${client.industry ?? 'n/d'} · Area: ${client.market_area ?? 'n/d'} · Tipo servizio: ${client.client_type} · Pacchetto: ${client.package}

NOTE INTERNE:
${notes.slice(0, 20).map(n => `- ${n}`).join('\n') || '(nessuna)'}

INTERAZIONI:
${inter.map(i => `- [${i.type}${i.outcome ? '/' + i.outcome : ''}] ${i.notes ?? ''}`).join('\n') || '(nessuna)'}

RIUNIONI:
${meets.map(m => `- ${m.title}: ${m.summary ?? ''}${m.decisions ? ' | decisioni: ' + m.decisions : ''}`).join('\n') || '(nessuna)'}

Compila questi campi (stringa vuota "" se il dato non emerge dai contenuti; elenca in missing_data i campi lasciati vuoti):
business_model, main_offer, target_audience, competitors, tone_of_voice, pain_points, buyer_personas, services_active, do_not_do, opportunities, strategic_notes

Rispondi SOLO con JSON:
{ "suggestions": { "business_model": "...", "main_offer": "...", "target_audience": "...", "competitors": "...", "tone_of_voice": "...", "pain_points": "...", "buyer_personas": "...", "services_active": "...", "do_not_do": "...", "opportunities": "...", "strategic_notes": "..." }, "confidence": 0.0, "missing_data": [], "sources_used": [] }`

      const parsed = await groqJson(prompt)
      return NextResponse.json({
        suggestions: parsed.suggestions ?? {},
        confidence: parsed.confidence ?? 0.6,
        missing_data: parsed.missing_data ?? [],
        sources_used: sources,
      })
    }

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

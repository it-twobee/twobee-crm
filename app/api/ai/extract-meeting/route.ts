import { NextRequest, NextResponse } from 'next/server'
import { logAiCall } from '@/lib/ai-logger'

export async function POST(req: NextRequest) {
  const { text, title, date } = await req.json()
  const t0 = Date.now()

  if (!text?.trim()) return NextResponse.json({ error: 'Testo vuoto' }, { status: 400 })

  const system = `Sei un assistente che analizza trascrizioni di riunioni aziendali.
Estrai le informazioni chiave in modo strutturato e professionale.
Rispondi SOLO con JSON valido, nessun testo aggiuntivo.`

  const user = `Analizza questa trascrizione di riunione e restituisci un JSON strutturato.

TITOLO: ${title || 'Riunione'}
DATA: ${date || 'Non specificata'}

TRASCRIZIONE:
${text.slice(0, 8000)}

Restituisci SOLO questo JSON:
{
  "summary": "Sintesi chiara e concisa della riunione (3-5 frasi)",
  "key_topics": ["argomento 1", "argomento 2", "argomento 3"],
  "decisions": ["decisione 1", "decisione 2"],
  "actions": [
    { "what": "cosa fare", "who": "chi", "by": "entro quando" }
  ],
  "participants": ["Nome 1", "Nome 2"],
  "mood": "positivo" | "neutro" | "critico"
}

Regole:
- summary: testo fluido professionale in italiano
- key_topics: max 5 argomenti principali, brevi
- decisions: decisioni concrete prese, max 6
- actions: azioni con owner e deadline se menzionati
- participants: nomi rilevati nella trascrizione
- mood: sentiment generale della riunione`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1200,
      temperature: 0.2,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? ''
  const tokens = data.usage?.total_tokens
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) {
    logAiCall({ callType: 'extract-meeting', startMs: t0, success: false, errorMessage: 'Parsing fallito', tokensUsed: tokens })
    return NextResponse.json({ error: 'Parsing fallito', raw }, { status: 500 })
  }
  try {
    const parsed = JSON.parse(match[0])
    logAiCall({ callType: 'extract-meeting', startMs: t0, success: true, tokensUsed: tokens })
    return NextResponse.json(parsed)
  } catch {
    logAiCall({ callType: 'extract-meeting', startMs: t0, success: false, errorMessage: 'JSON non valido', tokensUsed: tokens })
    return NextResponse.json({ error: 'JSON non valido', raw }, { status: 500 })
  }
}

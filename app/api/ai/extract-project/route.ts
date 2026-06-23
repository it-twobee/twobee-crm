import { NextRequest, NextResponse } from 'next/server'
import { logAiCall } from '@/lib/ai-logger'

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'Testo vuoto' }, { status: 400 })
  const t0 = Date.now()

  const system = `Sei un assistente che estrae dati strutturati di un progetto da testi di riunione, briefing o trascrizioni.
Rispondi SOLO con JSON valido, nessun testo aggiuntivo, nessun markdown.`

  const user = `Dal seguente testo estrai le informazioni di un progetto e restituisci SOLO questo JSON:
{
  "name": "nome del progetto (breve, descrittivo)",
  "description": "descrizione generale del progetto",
  "kind": "growth o digital",
  "project_type": "ecommerce | lead_gen | sito_web | app_ai | campagna | custom",
  "objective": "obiettivo principale del progetto",
  "target_audience": "pubblico target / buyer persona",
  "channels": "canali e piattaforme coinvolti",
  "kpi_targets": "KPI e metriche target",
  "budget": "budget se menzionato",
  "deadline": "data scadenza in formato YYYY-MM-DD se menzionata, altrimenti stringa vuota",
  "milestones": ["milestone 1", "milestone 2", "milestone 3"]
}

Regole:
- kind: "growth" per marketing/advertising/lead gen/ecommerce, "digital" per app/software/sito/AI/CRM
- project_type: scegli il più pertinente tra le opzioni
- milestones: max 8, fasi chiave concrete del progetto in ordine cronologico
- Se un campo non è menzionato nel testo, lascia stringa vuota (non inventare)

TESTO:
${text.slice(0, 6000)}`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1500,
      temperature: 0.2,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? ''
  const tokens = data.usage?.total_tokens
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) {
    logAiCall({ callType: 'extract-project', startMs: t0, success: false, errorMessage: 'Parsing fallito', tokensUsed: tokens })
    return NextResponse.json({ error: 'Parsing fallito' }, { status: 500 })
  }
  try {
    const parsed = JSON.parse(match[0])
    logAiCall({ callType: 'extract-project', startMs: t0, success: true, tokensUsed: tokens })
    return NextResponse.json(parsed)
  } catch {
    logAiCall({ callType: 'extract-project', startMs: t0, success: false, errorMessage: 'JSON non valido', tokensUsed: tokens })
    return NextResponse.json({ error: 'JSON non valido' }, { status: 500 })
  }
}

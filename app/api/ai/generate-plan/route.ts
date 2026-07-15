import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { brief, project_type, project_name, company_name, kind } = await req.json()

  if (!brief?.trim()) return NextResponse.json({ error: 'Brief vuoto' }, { status: 400 })

  const kindCtx = kind === 'growth' ? 'Growth Marketing' : kind === 'digital' ? 'Digital / Tech' : 'Digital Agency'
  const typeCtx: Record<string, string> = {
    ecommerce: 'E-commerce', lead_gen: 'Lead Generation', sito_web: 'Sito Web',
    app_ai: 'App AI / Custom', campagna: 'Campagna Ads', custom: 'Progetto Custom',
  }

  const system = `Sei un senior project manager di una digital agency italiana.
Generi piani di progetto strutturati, realistici e orientati ai deliverable concreti.
Rispondi SOLO con JSON valido — nessun testo, nessun markdown.`

  const user = `Leggi il brief e genera un piano di progetto completo.

BRIEF:
${brief}

CONTESTO:
- Tipo progetto: ${typeCtx[project_type] ?? 'Custom'}
- Nome: ${project_name}
- Cliente: ${company_name}
- Approccio: ${kindCtx}

Genera 2-4 sprint con milestone e task pratici. Ogni sprint ha 1-3 milestone, ogni milestone ha 2-5 task.

Restituisci SOLO questo JSON:
{
  "sprints": [
    {
      "name": "Sprint N — Tema",
      "duration_weeks": N,
      "milestones": [
        {
          "title": "Titolo milestone breve",
          "tasks": [
            { "title": "Task concreta", "priority": "alta", "suggested_role": "senior" }
          ]
        }
      ]
    }
  ]
}

Regole:
- sprint name: "Sprint 1 — Discovery" (sempre in italiano)
- priority: "alta" | "media" | "bassa"
- task title: azione concreta in italiano, max 6 parole
- milestone title: deliverable principale, max 4 parole
- duration_weeks: 1-4 settimane per sprint
- suggested_role: il livello di seniority più adatto a svolgere quella task, uno tra
  "manager" | "senior" | "junior" | "stage". Regola pratica: attività strategiche,
  di coordinamento o ad alto rischio → "senior" o "manager"; attività esecutive
  standard → "junior"; attività semplici o di supporto → "stage".`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 4000,
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })

  const data = await res.json()
  if (!res.ok || data.error) {
    return NextResponse.json({ error: `AI non disponibile: ${data.error?.message ?? res.status}` }, { status: 502 })
  }

  const text = data.choices?.[0]?.message?.content ?? ''
  const parsed = safeParseJson(text)
  if (!parsed) return NextResponse.json({ error: 'La risposta AI non era leggibile. Riprova, o accorcia il brief.' }, { status: 500 })
  return NextResponse.json(parsed)
}

function safeParseJson(text: string): unknown | null {
  if (!text.trim()) return null
  try { return JSON.parse(text) } catch { /* fallback */ }
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

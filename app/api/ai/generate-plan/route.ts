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
      max_tokens: 2000,
      temperature: 0.35,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return NextResponse.json({ error: 'Parsing fallito', raw: text }, { status: 500 })

  try {
    const plan = JSON.parse(match[0])
    return NextResponse.json(plan)
  } catch {
    return NextResponse.json({ error: 'JSON non valido', raw: text }, { status: 500 })
  }
}

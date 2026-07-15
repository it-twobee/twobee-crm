import { NextRequest, NextResponse } from 'next/server'

// Generazione AI scope-aware da un brief. A seconda dello `scope` restituisce
// l'intero piano oppure solo il sotto-albero da agganciare a un genitore esistente:
//   plan/sprint → { sprints: [...] }
//   milestones  → { milestones: [{ title, tasks:[...] }] }   (dentro uno sprint)
//   tasks       → { tasks: [{ title, priority, suggested_role }] }  (dentro una milestone)
type Scope = 'plan' | 'sprint' | 'milestones' | 'tasks'

const ROLE_RULE = `suggested_role: livello di seniority adatto, uno tra "manager" | "senior" | "junior" | "stage". Attività strategiche/coordinamento/rischiose → "senior"/"manager"; esecutive standard → "junior"; semplici/supporto → "stage".`

const SHAPES: Record<Scope, { instr: string; shape: string }> = {
  plan: {
    instr: 'Genera un piano completo: 2-4 sprint, ogni sprint 1-3 milestone, ogni milestone 2-5 task.',
    shape: `{ "sprints": [ { "name": "Sprint 1 — Tema", "duration_weeks": 2, "milestones": [ { "title": "Milestone", "tasks": [ { "title": "Task", "priority": "alta", "suggested_role": "senior" } ] } ] } ] }`,
  },
  sprint: {
    instr: 'Genera 1-2 sprint (con le loro milestone e task) da aggiungere al progetto esistente.',
    shape: `{ "sprints": [ { "name": "Sprint — Tema", "duration_weeks": 2, "milestones": [ { "title": "Milestone", "tasks": [ { "title": "Task", "priority": "alta", "suggested_role": "senior" } ] } ] } ] }`,
  },
  milestones: {
    instr: 'Genera 1-4 milestone (con le loro task) da inserire nello sprint indicato.',
    shape: `{ "milestones": [ { "title": "Milestone", "tasks": [ { "title": "Task", "priority": "alta", "suggested_role": "senior" } ] } ] }`,
  },
  tasks: {
    instr: 'Genera 2-8 task concrete da inserire nella milestone indicata.',
    shape: `{ "tasks": [ { "title": "Task concreta", "priority": "alta", "suggested_role": "senior" } ] }`,
  },
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const scope: Scope = (['plan', 'sprint', 'milestones', 'tasks'].includes(body.scope) ? body.scope : 'plan')
  const { brief, project_name, company_name, kind, sprint_name, milestone_title } = body

  if (!brief?.trim()) return NextResponse.json({ error: 'Brief vuoto' }, { status: 400 })

  const kindCtx = kind === 'growth' ? 'Growth Marketing' : kind === 'digital' ? 'Digital / Tech' : 'Digital Agency'
  const { instr, shape } = SHAPES[scope]

  const contextLines = [
    project_name && `- Progetto: ${project_name}`,
    company_name && `- Cliente: ${company_name}`,
    `- Approccio: ${kindCtx}`,
    sprint_name && `- Sprint di destinazione: ${sprint_name}`,
    milestone_title && `- Milestone di destinazione: ${milestone_title}`,
  ].filter(Boolean).join('\n')

  const system = `Sei un senior project manager di una digital agency italiana. Generi strutture di lavoro realistiche e orientate ai deliverable concreti. Rispondi SOLO con JSON valido — nessun testo, nessun markdown.`

  const user = `Leggi il brief e ${instr}

BRIEF:
${brief}

CONTESTO:
${contextLines}

Restituisci SOLO questo JSON:
${shape}

Regole:
- tutto in italiano
- priority: "alta" | "media" | "bassa"
- task title: azione concreta, max 6 parole
- milestone title: deliverable, max 4 parole
- sprint name: "Sprint N — Tema"; duration_weeks: 1-4
- ${ROLE_RULE}`

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
    return NextResponse.json(JSON.parse(match[0]))
  } catch {
    return NextResponse.json({ error: 'JSON non valido', raw: text }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { project, tasks, sprints, kpis } = await req.json()

  const done      = tasks.filter((t: { status: string }) => t.status === 'completato').length
  const open      = tasks.filter((t: { status: string }) => t.status !== 'completato').length
  const overdue   = tasks.filter((t: { status: string; due_date?: string }) => t.status !== 'completato' && t.due_date && new Date(t.due_date) < new Date()).length
  const milestones = tasks.filter((t: { is_milestone: boolean }) => t.is_milestone)
  const doneMilestones = milestones.filter((m: { status: string }) => m.status === 'completato').length
  const curSprint = sprints.find((s: { status: string }) => s.status === 'in_corso')
  const lastKpi   = kpis[0] ?? null
  const isGrowth  = project.project_kind === 'growth'

  const context = `
Progetto: ${project.name}
Tipo: ${isGrowth ? 'Growth (marketing)' : 'Digital (prodotto/tech)'}
Stato: ${project.status}
Task totali: ${tasks.length} (${done} completate, ${open} aperte, ${overdue} scadute)
Milestone: ${doneMilestones}/${milestones.length} completate
Sprint corrente: ${curSprint ? `${curSprint.name} (${curSprint.start_date} → ${curSprint.end_date})` : 'Nessuno in corso'}
${lastKpi ? `KPI ultimo mese: ${isGrowth
  ? `ROAS ${lastKpi.roas ?? '—'}, Lead ${lastKpi.leads_generated ?? '—'}, Revenue ${lastKpi.revenue_attributed ?? '—'}, CTR ${lastKpi.ctr ?? '—'}%`
  : `Sessioni ${lastKpi.organic_sessions ?? '—'}, Utenti attivi ${lastKpi.active_users ?? '—'}, Uptime ${lastKpi.uptime ?? '—'}%`
}` : 'Nessun KPI registrato'}
`.trim()

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content: 'Sei un project manager esperto. Analizza i dati di un progetto e scrivi una sintesi in 2-3 frasi in italiano: fase attuale, punti critici se presenti, prossimo step prioritario. Sii diretto e concreto. Non usare elenchi puntati.',
        },
        { role: 'user', content: context },
      ],
    }),
  })

  const data = await res.json()
  const summary = data.choices?.[0]?.message?.content ?? 'Analisi non disponibile.'
  return NextResponse.json({ summary })
}

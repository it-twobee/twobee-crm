import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { project, sprint, tasks } = await req.json()

    const done  = tasks.filter((t: { status: string }) => t.status === 'completato')
    const open  = tasks.filter((t: { status: string }) => t.status !== 'completato')
    const overdue = open.filter((t: { due_date: string | null }) => t.due_date && new Date(t.due_date) < new Date())

    const prompt = `Genera un report sprint leggibile dal cliente per il progetto "${project.name}".

Sprint: ${sprint.name} (${sprint.start_date} → ${sprint.end_date})

Task completate (${done.length}):
${done.map((t: { title: string }) => `- ${t.title}`).join('\n') || 'Nessuna'}

Task in corso / da fare (${open.length}):
${open.map((t: { title: string; status: string; due_date: string | null }) => `- ${t.title} [${t.status}]${t.due_date ? ` scade ${t.due_date}` : ''}`).join('\n') || 'Nessuna'}

${overdue.length > 0 ? `Task in ritardo: ${overdue.map((t: { title: string }) => t.title).join(', ')}` : ''}

Scrivi un report in italiano, semplice e professionale, adatto a un cliente non tecnico. Struttura:
1. "Cosa abbiamo completato" (2-3 righe)
2. "Su cosa stiamo lavorando" (2-3 righe)
3. "Prossimi passi" (1-2 righe)
${overdue.length > 0 ? '4. "Note" — menziona i ritardi in modo costruttivo' : ''}

Tono: positivo, chiaro, orientato ai risultati. Max 150 parole totali.`

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 400,
        messages: [
          { role: 'system', content: 'Sei un project manager che scrive report per clienti. Rispondi direttamente con il report, senza intestazioni o markdown.' },
          { role: 'user', content: prompt },
        ],
      }),
    })

    const data = await res.json()
    const report = data.choices?.[0]?.message?.content ?? ''
    return NextResponse.json({ report })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

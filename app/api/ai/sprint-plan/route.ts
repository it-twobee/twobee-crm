import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { project, tasks } = await req.json()

    const openTasks = tasks.filter((t: { status: string }) => t.status !== 'completato')

    const prompt = `Sei un project manager esperto. Analizza questi task aperti del progetto "${project.name}" (Sprint ${project.sprint_current}) e seleziona quelli più adatti per il prossimo sprint (max 5-7 task).

Task disponibili:
${openTasks.map((t: { id: string; title: string; priority: string; due_date: string | null; status: string }, i: number) =>
  `${i + 1}. ID: ${t.id} | "${t.title}" | priorità: ${t.priority} | scadenza: ${t.due_date ?? 'nessuna'} | stato: ${t.status}`
).join('\n')}

Rispondi SOLO con questo JSON (nessun testo extra):
{
  "selected": [
    { "id": "uuid-del-task", "reason": "breve motivazione in italiano (max 10 parole)" }
  ],
  "summary": "sintesi dello sprint suggerito in 1-2 frasi"
}`

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 800,
        messages: [
          { role: 'system', content: 'Sei un project manager esperto. Rispondi solo con JSON valido.' },
          { role: 'user', content: prompt },
        ],
      }),
    })

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'No JSON in AI response' }, { status: 500 })

    const parsed = JSON.parse(match[0])
    return NextResponse.json(parsed)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

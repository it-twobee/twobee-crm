import { NextRequest, NextResponse } from 'next/server'
import type { ClientTaskTemplate } from '@/lib/reparti-constants'

export async function POST(req: NextRequest) {
  const { projectName, projectType, clientName, existingTasks, chatMessage, history } = await req.json()

  const isChat = !!chatMessage

  const systemPrompt = `Sei un project manager esperto di agenzie digitali. Il tuo compito è generare o modificare una lista di task cliente (deliverable che il cliente deve fornire al team) per un progetto.

Ogni task deve avere:
- title: descrizione chiara e actionable di cosa deve fare il cliente
- category: una di ["materiali", "accessi", "contenuti", "tecnico", "approvazione", "strategia"]
- priority: "alta" | "media" | "bassa"
- phase: "onboarding" | "build" | "lancio"
- hint: (opzionale) nota breve di aiuto per il cliente

Rispondi SOLO con JSON valido nel formato:
{ "tasks": [ { "title": "...", "category": "...", "priority": "...", "phase": "...", "hint": "..." }, ... ] }

Contesto progetto:
- Nome: ${projectName}
- Tipo: ${projectType}
- Cliente: ${clientName ?? 'Non specificato'}
${existingTasks?.length ? `\nTask esistenti:\n${existingTasks.map((t: ClientTaskTemplate) => `- [${t.phase}] ${t.title}`).join('\n')}` : ''}`

  const messages = isChat
    ? [
        { role: 'system', content: systemPrompt },
        ...((history ?? []) as { role: string; content: string }[]).slice(-6),
        { role: 'user', content: chatMessage },
      ]
    : [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Genera 6-8 task cliente per un progetto "${projectName}" di tipo "${projectType}"${clientName ? ` per il cliente ${clientName}` : ''}. Suddividi tra onboarding, build e lancio. Sii specifico e pratico.`,
        },
      ]

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 1500, messages }),
  })

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? '{}'
  const replyText = data.choices?.[0]?.message?.content ?? ''

  try {
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match?.[0] ?? '{}')
    return NextResponse.json({ tasks: parsed.tasks ?? [], reply: replyText })
  } catch {
    return NextResponse.json({ tasks: [], reply: replyText })
  }
}

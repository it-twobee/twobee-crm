import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { query, context } = await req.json()

  const clientList = (context.clients ?? [])
    .map((c: { name: string; label: string; mrr: number; type: string; id: string }) =>
      `- ${c.name} (${c.type}, ${c.label}, €${c.mrr}/mese) → /clienti/${c.id}`)
    .join('\n')

  const alertList = (context.topAlerts ?? [])
    .map((a: { title: string; severity: string }) => `- [${a.severity}] ${a.title}`)
    .join('\n')

  const system = `Sei l'assistente AI di TWO BEE, una digital agency italiana. Sei integrato nel gestionale interno e hai accesso ai dati in tempo reale.

DATI AGGIORNATI:
- MRR contratti: €${(context.mrr ?? 0).toLocaleString('it-IT')}
- Clienti attivi: ${context.clientsCount ?? 0}
- Clienti a rischio (in bilico): ${context.clientsAtRisk ?? 0}
- Clienti persi: ${context.clientsLost ?? 0}
- Alert urgenti: ${context.alertsCount ?? 0}
- Task in scadenza questa settimana: ${context.tasksDueSoon ?? 0}
- Progetti attivi: ${context.projectsCount ?? 0}

ALERT ATTIVI:
${alertList || 'Nessun alert'}

CLIENTI (con link diretto):
${clientList || 'Nessun cliente'}

REGOLE:
- Rispondi in italiano, in modo diretto e professionale. Max 3 frasi.
- Sii specifico: cita nomi, numeri, percentuali dal contesto.
- Suggerisci sempre 1-3 azioni contestuali e utili.
- Usa esattamente i path del gestionale per gli href.

PATH DISPONIBILI:
/dashboard, /clienti, /clienti/[id], /clienti/[id]/progetto/[projectId],
/task, /fatturazione, /report, /progetti, /commerciale, /customer-care, /customer-care/tickets

Rispondi SOLO con JSON valido:
{
  "answer": "risposta diretta in italiano",
  "actions": [
    { "label": "Etichetta bottone", "href": "/path", "icon": "nome-icona" }
  ]
}

Icone disponibili: users, folder-open, bar-chart-3, check-square, trending-up, alert-triangle, calendar, layout-dashboard, receipt, headphones`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 600,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: query },
      ],
    }),
  })

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? ''
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return NextResponse.json({ answer: raw.trim() || 'Nessuna risposta.', actions: [] })

  try {
    return NextResponse.json(JSON.parse(match[0]))
  } catch {
    return NextResponse.json({ answer: raw.trim(), actions: [] })
  }
}

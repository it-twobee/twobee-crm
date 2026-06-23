import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { context, financialSummary, pulseRaw } = await req.json()

  const prompt = `Sei l'assistente esecutivo di TWO BEE, un'agenzia di digital marketing.

Dati aggiornati dell'azienda:
- MRR: €${(context.mrr ?? 0).toLocaleString('it-IT')}/mese
- Clienti attivi: ${context.clientsCount} (${context.clientsAtRisk} a rischio, ${context.clientsLost} persi)
- Task in scadenza: ${context.tasksDueSoon}
- Alert attivi: ${context.alertsCount}
- Deal pipeline: ${pulseRaw.dealsActive} attivi, ${pulseRaw.dealsWon}/${pulseRaw.dealsTotal} chiusi vinti
- Ticket aperti: ${pulseRaw.ticketsOpen}
- OKR progress: ${pulseRaw.okrProgress}%
- Fatturato incassato: €${(financialSummary.totalPaid ?? 0).toLocaleString('it-IT')}
- In attesa: €${(financialSummary.totalPending ?? 0).toLocaleString('it-IT')}
- In ritardo: €${(financialSummary.totalOverdue ?? 0).toLocaleString('it-IT')}
- Alert principali: ${context.topAlerts?.map((a: { title: string }) => a.title).join('; ') ?? 'nessuno'}

Scrivi un brief esecutivo in italiano, max 200 parole, in questo formato esatto:

STATO GENERALE
[2 frasi: una positiva, una critica]

PRIORITÀ QUESTA SETTIMANA
• [azione concreta 1]
• [azione concreta 2]
• [azione concreta 3]

SEGNALI DA MONITORARE
• [rischio o opportunità 1]
• [rischio o opportunità 2]

Sii diretto e azionabile. Usa i numeri reali. Niente preamboli.`

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    const brief = data.choices?.[0]?.message?.content ?? ''
    return NextResponse.json({ brief })
  } catch {
    return NextResponse.json({ error: 'Errore Groq' }, { status: 500 })
  }
}

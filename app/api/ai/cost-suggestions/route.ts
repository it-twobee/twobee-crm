import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type, context } = body

  const prompts: Record<string, string> = {
    resource: `Sei un consulente HR specializzato in agenzie digitali italiane (growth marketing, web development, automazioni AI).

Basandoti sulle tariffe di mercato italiane 2024-2025, suggerisci una lista di risorse tipiche per una società di consulenza digitale come TwoBee.

Contesto attuale dell'azienda:
${context ?? 'Piccola agenzia digitale, 5-15 risorse, servizi growth + digital'}

Per ogni risorsa fornisci:
- name: nome del ruolo
- resource_type: internal_employee|external_freelancer|partner|consultant
- cost_type: monthly_salary|hourly|retainer
- role_title: titolo
- monthly_cost: costo aziendale mensile (RAL × 1.35 / 12 per dipendenti, retainer per freelancer)
- hourly_cost: tariffa oraria di mercato
- availability_hours_month: 160 per full-time, 80 per part-time, 40 per consulenti
- billable_target_hours_month: 70-80% delle ore disponibili per operativi, 50% per manager
- markup_default: markup suggerito (2-3x per consulenza)
- notes: note su posizionamento di mercato

Rispondi SOLO con JSON array.`,

    business: `Sei un controller di gestione per agenzie digitali italiane.

Suggerisci i costi fissi tipici per una società di consulenza digitale come TwoBee.

Contesto: ${context ?? 'Sede in Italia, 5-15 persone, servizi digitali e growth marketing'}

Per ogni voce:
- category: affitto|software|amministrazione|marketing|personale|formazione|altro
- description: descrizione specifica
- monthly_amount: importo mensile stimato (valori di mercato italiani 2024-2025)
- notes: perché questo costo è necessario

Includi: affitto/coworking, software di struttura (Google Workspace, Slack, project management), commercialista, assicurazioni, marketing proprio, licenze software specifici (analytics, design, AI), formazione team.

Rispondi SOLO con JSON array.`,

    project: `Sei un project manager di un'agenzia digitale italiana.

Suggerisci la struttura dei costi tipici per un progetto ${context ?? 'di consulenza growth marketing'}.

Per ogni voce:
- category: risorsa|software|provvigione|cac|produzione|indiretto|altro
- description: descrizione
- amount: importo stimato
- hours: ore stimate (se categoria risorsa)
- hourly_rate: tariffa oraria (se categoria risorsa)
- notes: note

Considera: ore strategist, ore specialist, software dedicati, provvigioni commerciali (10-15%), CAC, costi di produzione contenuti, costi indiretti allocati.

Rispondi SOLO con JSON array.`,
  }

  const prompt = prompts[type]
  if (!prompt) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 3000,
        messages: [
          { role: 'system', content: 'Rispondi SOLO con JSON array valido, senza markdown o testo extra.' },
          { role: 'user', content: prompt },
        ],
      }),
    })

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? '[]'
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    const parsed = JSON.parse(jsonMatch?.[0] ?? '[]')

    return NextResponse.json({ suggestions: parsed })
  } catch (err) {
    return NextResponse.json({ error: 'AI suggestions failed', details: String(err) }, { status: 500 })
  }
}

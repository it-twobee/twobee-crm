import { NextRequest, NextResponse } from 'next/server'

const TYPE_CONTEXT: Record<string, string> = {
  ecommerce: 'E-commerce shop online con pagamenti, catalog prodotti, logistica',
  lead_gen:  'Funnel di lead generation con landing page, CRM e automazioni email',
  sito_web:  'Sito web corporate o landing page con SEO',
  app_ai:    'Applicazione AI o gestionale custom con integrazioni API',
  campagna:  'Campagna performance su Meta/Google Ads con creatività e ottimizzazione',
  custom:    'Progetto digitale personalizzato',
}

export async function POST(req: NextRequest) {
  const { project_type, project_name, company_name, description, kind } = await req.json()

  const context = TYPE_CONTEXT[project_type] ?? TYPE_CONTEXT.custom
  const kindLabel = kind === 'growth' ? 'Growth Marketing' : kind === 'digital' ? 'Digital / Tech' : 'Digital Agency'

  const system = `Sei un project manager senior di una digital agency italiana.
Genera milestone di progetto realistiche, pratiche e orientate ai deliverable concreti.
Rispondi SOLO con JSON valido, nessun testo aggiuntivo.`

  const user = `Crea 6-8 milestone per questo progetto:
- Tipo: ${context}
- Nome: ${project_name}
- Cliente: ${company_name}
- Contesto: ${kindLabel}
${description ? `- Descrizione: ${description}` : ''}

Restituisci un array JSON:
[{"title":"...","description":"...","weeks":N}]
- title: nome breve milestone (max 5 parole)
- description: cosa viene consegnato/validato (1 frase)
- weeks: settimane stimate dall'inizio (progressivo, es: 1, 2, 4, 6, 8, 10)

Rispondi SOLO con il JSON array.`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 800,
      temperature: 0.4,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content ?? ''
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return NextResponse.json({ error: 'Parsing fallito', raw: text }, { status: 500 })

  try {
    const milestones = JSON.parse(match[0])
    return NextResponse.json({ milestones })
  } catch {
    return NextResponse.json({ error: 'JSON non valido', raw: text }, { status: 500 })
  }
}

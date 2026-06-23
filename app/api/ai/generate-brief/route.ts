import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { project_type, project_name, company_name, kind, template_label } = await req.json()

  const kindLabel = kind === 'growth' ? 'Growth Marketing' : kind === 'digital' ? 'Digital / Tech' : 'Digital Agency'
  const typeCtx: Record<string, string> = {
    ecommerce: 'E-commerce shop online con pagamenti, catalogo prodotti e logistica',
    lead_gen:  'Funnel di lead generation con landing page, CRM e automazioni email',
    sito_web:  'Sito web corporate o istituzionale con SEO',
    app_ai:    'Applicazione AI o gestionale custom con integrazioni API',
    campagna:  'Campagna performance su Meta/Google Ads con creatività e ottimizzazione',
    custom:    'Progetto digitale personalizzato',
  }

  const system = `Sei un account manager senior di una digital agency italiana.
Scrivi brief di progetto chiari, professionali e orientati agli obiettivi.
Rispondi SOLO con il testo del brief, senza titoli, senza markdown, senza JSON.`

  const user = `Scrivi un brief di progetto professionale per:
- Cliente: ${company_name}
- Progetto: ${project_name}
- Tipo: ${typeCtx[project_type] ?? 'Progetto digitale'}
- Approccio: ${kindLabel}
- Template selezionato: ${template_label}

Il brief deve:
- Essere in italiano, naturale e professionale
- Descrivere gli obiettivi principali del progetto
- Indicare il target e il contesto del cliente
- Specificare le aspettative e i deliverable principali
- Essere conciso ma completo (150-200 parole)
- NON usare punti elenco, solo testo fluido in paragrafi`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 400,
      temperature: 0.6,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })

  const data = await res.json()
  const brief = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!brief) return NextResponse.json({ error: 'Generazione fallita' }, { status: 500 })
  return NextResponse.json({ brief })
}

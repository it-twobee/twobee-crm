import { NextRequest, NextResponse } from 'next/server'

async function groq(prompt: string, system: string): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY non configurata')
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 400,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Groq error ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

const GROWTH_CONTEXT = `
Sei un consulente marketing esperto che aiuta a definire gli obiettivi KPI per un cliente Growth di un'agenzia digitale.
Un cliente Growth si occupa di: performance marketing, lead generation, advertising (Meta, Google), marketing automation, ecommerce, campagne a pagamento.
I KPI tipici Growth sono: ROAS, CTR, CPA, CPL, lead generati, conversion rate, revenue attribuita, ad spend.
`

const DIGITAL_CONTEXT = `
Sei un consulente IT e digitale esperto che aiuta a definire gli obiettivi KPI per un cliente Digital di un'agenzia.
Un cliente Digital si occupa di: implementazione AI, CRM, gestionali, applicativi web, siti web, SEO, social media management, contenuti organici.
I KPI tipici Digital sono: follower guadagnati, sessioni organiche, nuovi utenti, reach, engagement rate, posizione SEO, bounce rate, lead generati.
`

const SYSTEM_PROMPT = (isGrowth: boolean, clientName: string, industry: string | null) => `
${isGrowth ? GROWTH_CONTEXT : DIGITAL_CONTEXT}

Il cliente si chiama "${clientName}"${industry ? `, opera nel settore ${industry}` : ''}.

Il tuo compito è guidare l'utente in modo conversazionale a definire obiettivi KPI realistici e misurabili.
Fai domande mirate, una o due per volta. Dopo 3-4 scambi proponi un riepilogo degli obiettivi suggeriti in formato strutturato.
Rispondi in italiano, sii conciso e professionale. Usa numeri concreti e benchmark di settore quando possibile.
Non usare markdown eccessivo, tieni le risposte brevi (max 3-4 righe).
`

export async function POST(req: NextRequest) {
  const { messages, clientName, clientType, industry } = await req.json()

  const isGrowth = clientType === 'growth'

  try {
    const conversation = messages.map((m: { role: string; text: string }) =>
      `${m.role === 'ai' ? 'Assistente' : 'Utente'}: ${m.text}`
    ).join('\n')
    const fullPrompt = `${conversation}\nAssistente:`
    const text = await groq(fullPrompt, SYSTEM_PROMPT(isGrowth, clientName, industry))
    return NextResponse.json({ text })
  } catch (err) {
    console.error('kpi-chat error', err)
    return NextResponse.json({ text: 'Errore nella risposta AI. Riprova.' }, { status: 500 })
  }
}

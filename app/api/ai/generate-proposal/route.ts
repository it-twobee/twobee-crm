import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Quote, ProposalContent, BrandMode } from '@/lib/types/database'

interface Body {
  quoteId?: string
  clientId?: string
  dealId?: string
  brandMode: BrandMode
  partnerName?: string
  tone: 'premium' | 'direct' | 'institutional' | 'technical' | 'simple'
}

const TONE_LABEL: Record<Body['tone'], string> = {
  premium: 'premium e consulenziale',
  direct: 'diretto e orientato ai risultati',
  institutional: 'istituzionale e formale',
  technical: 'tecnico e dettagliato',
  simple: 'semplice e accessibile, senza tecnicismi',
}

export async function POST(req: NextRequest) {
  const body: Body = await req.json()

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  // ── Dati reali via RLS (quotes/deals sono staff-only: il route è di fatto staff-only)
  const [quoteRes, clientRes, dealRes] = await Promise.all([
    body.quoteId ? sb.from('quotes').select('*').eq('id', body.quoteId).maybeSingle() : Promise.resolve({ data: null }),
    body.clientId ? sb.from('clients').select('company_name, industry, market_area, client_type, package').eq('id', body.clientId).maybeSingle() : Promise.resolve({ data: null }),
    body.dealId ? sb.from('deals').select('title, value, company_name, stage').eq('id', body.dealId).maybeSingle() : Promise.resolve({ data: null }),
  ])

  const quote = quoteRes.data as Quote | null
  const client = clientRes.data as { company_name: string; industry: string | null; market_area: string | null; client_type: string; package: string } | null
  const deal = dealRes.data as { title: string; value: number | null; company_name: string | null; stage: string } | null

  const kpis = body.clientId
    ? (await sb.from('client_kpis').select('month, revenue_attributed, leads_generated, roas, organic_sessions')
        .eq('client_id', body.clientId).order('month', { ascending: false }).limit(3)).data ?? []
    : []

  // Solo dati client-facing: MAI cost_rate, markup, total_cost o margini
  const quoteFacts = quote ? {
    titolo: quote.title,
    prezzo_finale: quote.final_price,
    valido_fino: quote.valid_until,
    servizi: (quote.items ?? []).map(i => ({ servizio: i.service_name, ore_stimate: i.hours, prezzo: i.sale_price })),
    note: quote.notes,
  } : null

  const targetName = client?.company_name ?? deal?.company_name ?? null

  const brandRules = {
    twobee: 'Il documento è a brand TWO BEE (agenzia growth & digital italiana): tono premium, puoi citare TWO BEE, la sua metodologia e il suo team.',
    white_label: `Documento WHITE LABEL: NON citare MAI TWO BEE in nessuna forma. ${body.partnerName ? `Il mittente è "${body.partnerName}".` : 'Usa formulazioni neutre come "il nostro team" senza nominare alcuna agenzia.'}`,
    partner_branded: `Documento a brand del partner "${body.partnerName ?? 'Partner'}": il partner è il mittente. Non citare TWO BEE se non come "partner tecnico" e solo se strettamente necessario (preferibilmente mai).`,
    neutral: 'Documento neutro e istituzionale: nessun brand, nessun nome di agenzia, formulazioni impersonali professionali.',
  }[body.brandMode]

  const prompt = `Sei un senior consultant che scrive proposte commerciali per servizi di growth marketing e digital.
${brandRules}
Tono richiesto: ${TONE_LABEL[body.tone]}. Lingua: italiano.

═══ DATI REALI DISPONIBILI (usa SOLO questi) ═══
Destinatario: ${targetName ?? 'NON DISPONIBILE'}
${client ? `Cliente esistente — settore: ${client.industry ?? 'n/d'}, area: ${client.market_area ?? 'n/d'}, tipo servizio attuale: ${client.client_type}, pacchetto: ${client.package}` : 'Prospect (non ancora cliente)'}
${deal ? `Deal: "${deal.title}"${deal.value ? `, valore stimato €${deal.value}` : ''}` : ''}
${quoteFacts ? `Preventivo: ${JSON.stringify(quoteFacts)}` : 'Nessun preventivo collegato'}
${kpis.length ? `KPI recenti del cliente: ${JSON.stringify(kpis)}` : ''}

═══ REGOLE FERREE ═══
- NON inventare prezzi: usa solo prezzo_finale e i prezzi dei servizi se presenti. Se mancano, nella sezione Investimento scrivi "[da definire]" e aggiungi la voce a missing_data.
- NON inventare dati del cliente, numeri, KPI o risultati passati. Se un'informazione manca, scrivi in modo generico e aggiungila a missing_data.
- NON menzionare mai costi interni, margini o markup.
- I deliverable e le ore derivano dai servizi del preventivo, se presenti.

Genera una proposta con ESATTAMENTE queste sezioni, in quest'ordine:
1. Cover  2. Contesto del cliente  3. Problema / opportunità  4. Obiettivi  5. Strategia proposta  6. Piano operativo  7. Timeline  8. Deliverable  9. Team / risorse coinvolte  10. KPI  11. Investimento  12. Condizioni commerciali  13. Prossimi step

Rispondi ESCLUSIVAMENTE con JSON valido:
{
  "title": "titolo della proposta",
  "sections": [{ "title": "...", "content": "2-5 frasi", "bullets": ["..."], "speaker_notes": "nota per chi presenta" }],
  "commercial_summary": "riassunto commerciale in 2 frasi",
  "next_steps": ["..."],
  "missing_data": ["dato mancante e dove inserirlo"]
}`

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 3200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`Groq ${res.status}`)
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Risposta AI non valida')
    const parsed = JSON.parse(match[0]) as ProposalContent
    return NextResponse.json({
      title: parsed.title ?? 'Proposta commerciale',
      sections: parsed.sections ?? [],
      commercial_summary: parsed.commercial_summary ?? '',
      next_steps: parsed.next_steps ?? [],
      missing_data: parsed.missing_data ?? [],
    })
  } catch (e) {
    console.error('[generate-proposal]', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

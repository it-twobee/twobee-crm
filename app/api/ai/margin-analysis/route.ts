import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { client, projects, costs, resourceCosts, businessCosts, invoices } = body

  const totalRevenue = (invoices ?? [])
    .filter((i: { status: string }) => i.status === 'pagata')
    .reduce((s: number, i: { amount: number }) => s + i.amount, 0)
  const totalDirectCosts = (costs ?? [])
    .filter((c: { category: string }) => ['risorsa', 'software', 'provvigione', 'cac', 'produzione'].includes(c.category))
    .reduce((s: number, c: { amount: number }) => s + c.amount, 0)
  const totalIndirectCosts = (costs ?? [])
    .filter((c: { category: string }) => c.category === 'indiretto')
    .reduce((s: number, c: { amount: number }) => s + c.amount, 0)
  const monthlyOverhead = (businessCosts ?? [])
    .filter((b: { is_active: boolean }) => b.is_active)
    .reduce((s: number, b: { monthly_amount: number }) => s + b.monthly_amount, 0)

  const projectSummaries = (projects ?? []).map((p: { id: string; name: string; project_kind: string }) => {
    const pCosts = (costs ?? []).filter((c: { project_id: string }) => c.project_id === p.id)
    const directCost = pCosts
      .filter((c: { category: string }) => c.category !== 'indiretto')
      .reduce((s: number, c: { amount: number }) => s + c.amount, 0)
    const resourceHours = pCosts
      .filter((c: { category: string; hours: number | null }) => c.category === 'risorsa' && c.hours)
      .reduce((s: number, c: { hours: number | null }) => s + (c.hours ?? 0), 0)
    return { name: p.name, kind: p.project_kind, directCost, resourceHours }
  })

  const resourceSummaries = (resourceCosts ?? []).map((r: {
    name: string; resource_type: string; calculated_hourly_cost: number | null;
    billable_target_hours_month: number; availability_hours_month: number
  }) => ({
    name: r.name,
    type: r.resource_type,
    hourlyCost: r.calculated_hourly_cost,
    billableTarget: r.billable_target_hours_month,
    availability: r.availability_hours_month,
    saturationTarget: Math.round((r.billable_target_hours_month / r.availability_hours_month) * 100),
  }))

  const prompt = `Sei un controller di gestione specializzato in società di consulenza digitale (growth marketing, sviluppo web, automazioni).
Analizza i dati finanziari del cliente "${client.company_name}" (tipo: ${client.client_type}, MRR: €${client.mrr}/mese, pacchetto: ${client.package ?? 'n/a'}).

DATI:
- Fatturato pagato: €${totalRevenue}
- Costi diretti totali: €${totalDirectCosts}
- Costi indiretti totali: €${totalIndirectCosts}
- Costi fissi aziendali mensili: €${monthlyOverhead}
- Progetti: ${JSON.stringify(projectSummaries)}
- Risorse: ${JSON.stringify(resourceSummaries)}

ANALIZZA:
1. MARGINE DI CONTRIBUZIONE: calcola % margine per progetto e complessivo. Target: 60%.
2. SOGLIA MINIMA (Break-Even Floor): sotto quale prezzo questo cliente non è sostenibile.
3. SATURAZIONE RISORSE: le risorse allocate sono sopra/sotto il target 70-80%?
4. ROI RISORSE: il fatturato generato copre almeno 2.5x il costo delle risorse?
5. ALERT: segnala problemi critici (margine <40%, saturazione <65%, costi fuori controllo).
6. RACCOMANDAZIONI: 2-3 azioni concrete per migliorare la marginalità.

Rispondi in JSON con questa struttura:
{
  "margine_contribuzione_pct": number,
  "soglia_minima_mensile": number,
  "saturazione_media_pct": number,
  "roi_risorse": number,
  "alerts": [{ "level": "red|amber|green", "message": "string" }],
  "raccomandazioni": ["string"],
  "analisi_narrativa": "string (2-3 paragrafi di analisi discorsiva in italiano)"
}`

  const finalPrompt = body._customPrompt ?? prompt

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2000,
        messages: [
          { role: 'system', content: 'Rispondi SOLO con JSON valido, senza markdown o testo extra.' },
          { role: 'user', content: finalPrompt },
        ],
      }),
    })

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? '{}'
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}')

    return NextResponse.json(parsed)
  } catch (err) {
    return NextResponse.json({ error: 'AI analysis failed', details: String(err) }, { status: 500 })
  }
}

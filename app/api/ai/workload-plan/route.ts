import { NextResponse } from 'next/server'

// Fase 3d — AI Planning Assistant. Analizza carichi/segnali e PROPONE azioni.
// NON modifica nulla: la spec (§9.4) impone analizza→propone→utente conferma→sistema.
// L'apply resta lato utente (per-suggerimento), qui restituiamo solo proposte + fonti.
interface Payload {
  windows: { days: number; overloaded: number; top: { name: string; hours: number; capacity: number }[] }[]
  signals: { noEstimate: number; noDue: number; noOwner: number; projectsNoPm: number }
  needsAttention: { title: string; project: string; due_date: string | null; estimated_hours: number | null; owner: string | null; issue: string }[]
  peaks?: { from: string; to: string; hours: number; capacity: number; ratio: number; sprints?: number; maxSprints?: number; projects: { name: string; hours: number }[] }[]
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'AI non configurata (GROQ_API_KEY mancante)' }, { status: 503 })
    }

    const peaksTxt = (body.peaks ?? []).length
      ? (body.peaks ?? []).map(p => `- ${p.from} → ${p.to}: intensità ${p.ratio}%${p.sprints != null ? `, picco ${p.sprints} sprint contemporanei su ${p.maxSprints ?? 5} sostenibili` : ''}, ${p.hours}h su ${p.capacity}h di capacità. Progetti: ${p.projects.map(x => `${x.name} ${x.hours}h`).join(', ')}`).join('\n')
      : 'nessun periodo di sovraccarico previsto'

    const prompt = `Sei un assistente di pianificazione operativa. Analizza il carico di lavoro del team e PROPONI azioni concrete. NON devi applicare nulla: solo suggerire, sarà l'utente a decidere.

PERIODI CRITICI (settimane in cui le task di più progetti si accavallano — priorità assoluta nell'analisi):
${peaksTxt}

Intensità per finestra (ore pianificate vs capacità delle risorse più cariche):
${body.windows.map(w => `- ${w.days}gg: ${w.overloaded} risorse sovraccariche. Top: ${w.top.map(c => `${c.name} ${c.hours}/${c.capacity}h`).join(', ') || 'nessuna'}`).join('\n')}

Segnali qualità: ${body.signals.noEstimate} task senza stima, ${body.signals.noDue} senza scadenza, ${body.signals.noOwner} senza owner, ${body.signals.projectsNoPm} progetti senza PM.

Task che richiedono attenzione:
${body.needsAttention.slice(0, 25).map((t, i) => `${i + 1}. "${t.title}" (${t.project}) — ${t.issue}${t.due_date ? ` · scad ${t.due_date}` : ''}${t.owner ? ` · ${t.owner}` : ''}`).join('\n') || 'nessuna'}

Proponi 3-6 azioni pragmatiche per SPIANARE i periodi critici sopra (anticipare/posticipare task di uno dei progetti che si accavallano, riequilibrare fra risorse, spezzare task troppo grandi, assegnare owner, sistemare stime/scadenze mancanti). Cita SEMPRE il periodo e i progetti coinvolti.
Rispondi SOLO con questo JSON (nessun testo extra):
{
  "suggestions": [
    { "type": "sovraccarico|owner|stima|scadenza|riequilibrio|split|priorita|conflitto", "title": "azione breve in italiano", "detail": "cosa fare e perché, citando i dati (max 25 parole)" }
  ],
  "summary": "sintesi in 1 frase"
}`

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1000,
        messages: [
          { role: 'system', content: 'Sei un assistente di pianificazione. Proponi, non applicare. Rispondi solo con JSON valido.' },
          { role: 'user', content: prompt },
        ],
      }),
    })

    const data = await res.json()
    const parsed = JSON.parse(data.choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    return NextResponse.json({ suggestions: parsed.suggestions ?? [], summary: parsed.summary ?? '' })
  } catch {
    return NextResponse.json({ error: 'Errore analisi AI' }, { status: 500 })
  }
}

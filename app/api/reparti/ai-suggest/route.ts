import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { dept, projects } = await req.json() as {
    dept: string
    projects: { name: string; status: string; project_type: string; client_name: string | null; task_count: number; done_count: number }[]
  }

  const DEPT_CONTEXT: Record<string, string> = {
    growth:    'performance marketing, growth hacking, acquisizione lead, campagne paid (Meta, Google), funnel ottimizzazione, CRO, email marketing, automation',
    marketing: 'brand strategy, content marketing, social media, SEO/SEM, influencer, PR, editorial planning, copywriting, storytelling',
    digital:   'sviluppo web, e-commerce, UX/UI, app mobile, CMS, web performance, accessibilità, architettura frontend/backend',
    ai:        'intelligenza artificiale, LLM, automazione con AI, agenti AI, prompt engineering, RAG, computer vision, data analytics, AI per business',
  }

  const projectsList = projects.map(p =>
    `- "${p.name}" (${p.project_type}, ${p.status}) — ${p.done_count}/${p.task_count} task completati, cliente: ${p.client_name ?? 'N/A'}`
  ).join('\n') || 'Nessun progetto ancora nel reparto.'

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content: `Sei un consulente strategico senior specializzato in ${DEPT_CONTEXT[dept] ?? dept}.
Analizzi i progetti di un'agenzia B2B italiana e fornisci suggerimenti concreti, basati su trend attuali del settore ${dept}.
Rispondi SOLO con JSON valido, senza testo fuori dal JSON.`,
        },
        {
          role: 'user',
          content: `Analizza questo reparto ${dept.toUpperCase()} e fornisci 4 suggerimenti strategici.

PROGETTI ATTUALI:
${projectsList}

Per ogni suggerimento considera:
- Trend emergenti del settore ${dept}
- Opportunità non sfruttate dai progetti elencati
- Ottimizzazioni concrete e implementabili
- Nuove idee/servizi da proporre ai clienti

JSON (array di 4 oggetti):
[
  {
    "title": "Titolo breve e impattante",
    "category": "trend|ottimizzazione|opportunità|idea",
    "insight": "Descrizione di 2-3 frasi con contesto e valore specifico per il reparto",
    "action": "Azione concreta da fare questa settimana",
    "impact": "alto|medio|basso"
  }
]`,
        },
      ],
    }),
  })

  if (!res.ok) return NextResponse.json({ error: 'AI non disponibile' }, { status: 500 })

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? '[]'
  try {
    const match = raw.match(/\[[\s\S]*\]/)
    const suggestions = JSON.parse(match?.[0] ?? '[]')
    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', user.id).single()
  if (!profile || !SUPER_ADMIN_EMAILS.includes(profile.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { prompt, existingTasks } = await req.json() as {
    prompt: string
    existingTasks: { title: string }[]
  }

  if (!prompt?.trim()) return NextResponse.json({ suggestions: [] })

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2500,
      messages: [
        {
          role: 'system',
          content: `Sei un product manager senior per TwoBee, agenzia di marketing digitale con gestionale interno in Next.js 14 + Supabase.
Il gestionale ha: clienti, progetti, task, KPI mensili, chat per progetto, fatturazione, dashboard con widget drag&drop, Command Center (TwoBee OS).
Stack: Next.js 14 App Router, TypeScript, Tailwind, Supabase PostgreSQL, Groq AI, Recharts, Radix UI.
Cartella principale: app/(dashboard)/, components/, app/actions/, app/api/, supabase/migrations/.
Generi proposte concrete, tecniche, implementabili subito. Mai vaghe. Menziona sempre file specifici.
Rispondi SOLO con JSON valido, nessun testo fuori dall'array.`,
        },
        {
          role: 'user',
          content: `L'utente vuole sviluppare: "${prompt}"

Task già nel backlog (NON duplicare):
${existingTasks.slice(0, 30).map(t => `- ${t.title}`).join('\n')}

Sezioni: db | dashboard | clienti | progetti | chat | commerciale | dev

Genera ESATTAMENTE 5 task concreti per realizzare questa idea nel gestionale TwoBee.
Sii specifico: menziona componenti, tabelle DB, API routes, server actions reali.
Includi sia task di costruzione che di supporto (migration DB, types, ecc.).

Rispondi SOLO con questo JSON:
[
  {
    "category": "costruire|modificare|ottimizzare|eliminare",
    "priority": "critica|alta|media|bassa",
    "section": "db|dashboard|clienti|progetti|chat|commerciale|dev",
    "title": "Titolo conciso max 80 caratteri",
    "description": "2-3 frasi tecniche: cosa fare, come, perché. Cita file/componenti specifici.",
    "file_paths": ["path/relativo/file.tsx"],
    "related_files": ["path/dipendenza.ts"],
    "effort_days": 1
  }
]`,
        },
      ],
    }),
  })

  if (!groqRes.ok) return NextResponse.json({ error: 'Groq error' }, { status: 500 })

  const groqData = await groqRes.json()
  const raw = groqData.choices?.[0]?.message?.content ?? '[]'
  try {
    const match = raw.match(/\[[\s\S]*\]/)
    const suggestions = JSON.parse(match?.[0] ?? '[]')
    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}

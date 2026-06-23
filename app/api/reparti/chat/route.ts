import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DEPT_PERSONA: Record<string, string> = {
  growth:    'Sei un esperto di Growth Marketing con profonda conoscenza di acquisition, retention, funnel optimization, performance marketing e data-driven growth. Conosci le ultime strategie di growth hacking, SEO/SEM, paid social, email marketing automation.',
  marketing: 'Sei un esperto di Marketing Strategico e Brand con profonda conoscenza di content marketing, social media strategy, copywriting persuasivo, campaign management, influencer marketing e brand storytelling.',
  digital:   'Sei un esperto di Digital Product Development con profonda conoscenza di UX/UI design, web development, e-commerce, CMS, integrazioni API, performance web e accessibilità.',
  ai:        'Sei un esperto di AI/ML Applications con profonda conoscenza di LLM, prompt engineering, automazioni AI, agenti intelligenti, RAG, fine-tuning, valutazione modelli e deployment AI in produzione.',
}

const DEPT_LABEL: Record<string, string> = {
  growth: 'Growth', marketing: 'Marketing', digital: 'Digital', ai: 'AI',
}

export async function POST(req: NextRequest) {
  const { dept, message, history, projectContext, chatId } = await req.json()
  const sb = await createClient()

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const systemPrompt = `${DEPT_PERSONA[dept] ?? DEPT_PERSONA.growth}

Sei l'AI assistant del reparto ${DEPT_LABEL[dept]} di TwoBee, un'agenzia digitale.
Hai accesso ai dati reali del reparto e rispondi in italiano, in modo conciso e operativo.
Puoi rispondere sia su dati interni (progetti, task, sprint) che su best practice e trend di settore.

${projectContext ? `\n## Contesto attuale del reparto:\n${projectContext}` : ''}

Regole:
- Risposte concise e dirette (massimo 3-4 paragrafi)
- Usa bullet point quando elenchi elementi
- Suggerisci azioni concrete e realizzabili
- Se chiedi dati che non hai, dillo chiaramente
- Usa il markdown per formattare (grassetto, elenchi, code)
`

  const messages = [
    { role: 'system', content: systemPrompt },
    ...((history as { role: string; content: string }[]) ?? []).slice(-10),
    { role: 'user', content: message },
  ]

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 1500, messages }),
  })

  const data = await res.json()
  const reply = data.choices?.[0]?.message?.content ?? 'Errore nella risposta AI'

  // Persist to Supabase
  const updatedMessages = [
    ...((history as { role: string; content: string }[]) ?? []),
    { role: 'user', content: message },
    { role: 'assistant', content: reply },
  ]

  if (chatId) {
    await sb.from('dept_ai_chats').update({
      messages: updatedMessages,
      title: updatedMessages[0]?.content?.slice(0, 60) ?? 'Conversazione',
      updated_at: new Date().toISOString(),
    }).eq('id', chatId).eq('user_id', user.id)
  } else {
    const { data: newChat } = await sb.from('dept_ai_chats').insert({
      user_id: user.id,
      dept,
      title: message.slice(0, 60),
      messages: updatedMessages,
    }).select('id').single()
    return NextResponse.json({ reply, chatId: newChat?.id })
  }

  return NextResponse.json({ reply, chatId })
}

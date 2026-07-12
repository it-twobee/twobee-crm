import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// §27.2 — Assistente AI INTERNO del Customer Care.
//
// Suggerisce al team: azioni da fare, follow-up, bozza di risposta, rischi, escalation.
// NON invia messaggi, NON scrive al cliente, NON crea task: propone e basta — è il team
// che modifica, sceglie e conferma. Il cliente non deve mai vederlo, quindi:
//  - l'endpoint è riservato allo staff (admin|team): un utente `client`/`guest` riceve 403;
//  - i messaggi del canale li legge il server (service role), non li accetta dal body,
//    così nessuno può farsi analizzare un canale altrui.

interface Suggestion {
  type: 'azione' | 'follow_up' | 'risposta' | 'chiarimento' | 'rischio' | 'escalation' | 'documento'
  title: string
  detail: string
}

export async function POST(req: Request) {
  try {
    const { channelId } = (await req.json()) as { channelId?: string }
    if (!channelId) return NextResponse.json({ error: 'channelId mancante' }, { status: 400 })

    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const admin = createAdminClient()
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single()
    const role = (me as { role?: string } | null)?.role
    if (role !== 'admin' && role !== 'team') {
      // L'AI è uno strumento interno: il cliente non deve nemmeno poterla interrogare.
      return NextResponse.json({ error: 'Riservato al team' }, { status: 403 })
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'AI non configurata (GROQ_API_KEY mancante)' }, { status: 503 })
    }

    const { data: channel } = await admin
      .from('chat_channels').select('id, name, type, client_id').eq('id', channelId).single()
    if (!channel) return NextResponse.json({ error: 'Canale non trovato' }, { status: 404 })

    const { data: messages } = await admin
      .from('chat_messages')
      .select('content, created_at, sender:profiles!chat_messages_sender_id_fkey(full_name, role)')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(30)

    const rows = ((messages ?? []) as unknown as {
      content: string; created_at: string; sender: { full_name: string | null; role: string | null } | null
    }[]).reverse()

    if (rows.length === 0) {
      return NextResponse.json({ suggestions: [], sources: 0 })
    }

    const transcript = rows
      .map(m => `[${m.created_at.slice(0, 16).replace('T', ' ')}] ${m.sender?.full_name ?? 'Sconosciuto'} (${m.sender?.role === 'client' ? 'CLIENTE' : 'TEAM'}): ${m.content}`)
      .join('\n')

    const prompt = `Sei l'assistente interno del team di customer care di un'agenzia. Leggi la conversazione con il cliente e proponi al TEAM cosa fare.

Non stai parlando col cliente: i tuoi suggerimenti li legge solo il team, che deciderà se usarli.

CONVERSAZIONE (ultimi ${rows.length} messaggi del canale "${channel.name}"):
${transcript}

Proponi da 2 a 5 suggerimenti concreti e specifici basati SOLO su quanto scritto sopra. Tipi ammessi:
- "azione": qualcosa da fare operativamente
- "follow_up": ricontattare/sollecitare
- "risposta": bozza di risposta al cliente (il team la rivedrà prima di inviarla)
- "chiarimento": informazione da chiedere al cliente
- "rischio": segnale di insoddisfazione o problema
- "escalation": va coinvolto un responsabile
- "documento": serve un file/materiale

Se la conversazione non richiede nulla, restituisci una lista vuota.

Rispondi SOLO con JSON valido:
{"suggestions":[{"type":"azione","title":"titolo breve","detail":"cosa fare, concreto"}]}`

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1200,
        messages: [
          { role: 'system', content: 'Rispondi sempre e solo con JSON valido, senza testo attorno.' },
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Errore del servizio AI' }, { status: 502 })
    }

    const json = await res.json()
    const raw = json.choices?.[0]?.message?.content ?? ''
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { suggestions?: Suggestion[] }

    return NextResponse.json({
      suggestions: (parsed.suggestions ?? []).slice(0, 5),
      sources: rows.length,
    })
  } catch {
    return NextResponse.json({ error: 'Errore nella generazione dei suggerimenti' }, { status: 500 })
  }
}

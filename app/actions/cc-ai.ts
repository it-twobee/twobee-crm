'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic()

/**
 * §329 — anche un'azione che oggi non fa niente è un endpoint.
 *
 * Queste due non chiedevano niente a nessuno e chiamano un servizio **a
 * consumo** con il testo che ricevono. Oggi `ANTHROPIC_API_KEY` non è
 * impostata, quindi l'unico effetto è una risposta vuota — ed è precisamente il
 * modo in cui un problema del genere resta lì: il giorno in cui qualcuno mette
 * la chiave, la porta è già aperta e nessuno la sta guardando.
 */
async function requireStaff(): Promise<void> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin' && p?.role !== 'team') throw new Error('Permesso negato')
}

interface Message {
  sender: string
  content: string
  isOwn: boolean
}

export async function suggestCCReplies(clientName: string, messages: Message[]): Promise<string[]> {
  await requireStaff()
  if (!messages.length) return []
  try {
    const history = messages.slice(-10).map(m =>
      `${m.isOwn ? 'TwoBee (noi)' : clientName}: ${m.content}`
    ).join('\n')

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Sei un assistente di customer care professionale per l'azienda TwoBee.
Basandoti su questa conversazione con il cliente "${clientName}", suggerisci 3 risposte brevi e professionali in italiano.
Le risposte devono essere naturali, cordiali e adatte al contesto.

Conversazione recente:
${history}

Rispondi SOLO con un JSON array di 3 stringhe, nessun testo extra. Esempio: ["risposta 1", "risposta 2", "risposta 3"]`
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.slice(0, 3) : []
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('api_key') || msg.includes('API key') || msg.includes('authentication')) {
      return ['⚠️ ANTHROPIC_API_KEY mancante nel .env.local']
    }
    return []
  }
}

export async function summarizeClientThread(clientName: string, messages: Message[]): Promise<string> {
  await requireStaff()
  if (messages.length < 3) return ''
  try {
    const history = messages.slice(-20).map(m =>
      `${m.isOwn ? 'TwoBee' : clientName}: ${m.content}`
    ).join('\n')

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Riassumi in 2-3 frasi brevi questa conversazione con il cliente ${clientName}, evidenziando i punti chiave e lo stato attuale. Rispondi solo con il riassunto, in italiano.\n\n${history}`
      }]
    })

    return response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  } catch {
    return ''
  }
}

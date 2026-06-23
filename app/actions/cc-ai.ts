'use server'

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

interface Message {
  sender: string
  content: string
  isOwn: boolean
}

export async function suggestCCReplies(clientName: string, messages: Message[]): Promise<string[]> {
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

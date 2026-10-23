import { NextResponse, type NextRequest } from 'next/server'
import { conToken } from '@/lib/supabase/server'
import { buildAssistantCtx, type AssistantCtx } from '@/lib/ai/context'
import { findTool, toolsFor } from '@/lib/ai/tools'
import { capResult } from '@/lib/ai/tools/types'
import { auditToolCall } from '@/lib/ai/agent'
import { rispondiCorpo, ERRORE, type Server } from '@/lib/mcp/protocollo'
import { ESCLUSI, ISTRUZIONI, puoUsareIlConnettore, strumentiMcp } from '@/lib/mcp/accesso'
import { basePubblica, intestazioneNonAutorizzato, tokenDa } from '@/lib/mcp/risorsa'

/* §493 — il connettore di Claude. Gli strumenti sono quelli dell'assistente
   Ctrl+J, con le stesse tre difese (docs/ai-assistant.md): il catalogo filtrato
   per ruolo, i guard dei server action dentro ogni `run`, la RLS sotto. Qui
   l'identità arriva dal token e non dal cookie: `conToken()` la fa vedere a
   ogni `createClient()` della richiesta. */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new NextResponse(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

function nonAutorizzato(req: NextRequest, tokenPresente: boolean) {
  return json(
    { error: 'invalid_token', error_description: tokenPresente ? 'Token non valido o scaduto' : 'Serve un token: collega il connettore da Claude' },
    401,
    { 'WWW-Authenticate': intestazioneNonAutorizzato(basePubblica(req.nextUrl.origin), tokenPresente) },
  )
}

function server(c: AssistantCtx): Server {
  const permessi = toolsFor(c)
  return {
    nome: 'twobee-gestionale',
    versione: process.env.BUILD_SHA || 'dev',
    istruzioni: ISTRUZIONI,
    strumenti: strumentiMcp(permessi),
    async esegui(nome, args) {
      const tool = findTool(nome)
      if (!tool || nome in ESCLUSI) return null
      if (!permessi.some(t => t.name === nome)) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'Il tuo ruolo non consente questa operazione' }) }], isError: true }
      }
      const started = Date.now()
      try {
        const result = await tool.run(args, c)
        const failed = !!(result && typeof result === 'object' && 'error' in (result as Record<string, unknown>))
        void auditToolCall(c, null, tool, args, !failed,
          failed ? String((result as Record<string, unknown>).error) : null, Date.now() - started)
        return { content: [{ type: 'text', text: capResult(result) }], ...(failed ? { isError: true } : {}) }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Errore imprevisto'
        void auditToolCall(c, null, tool, args, false, msg, Date.now() - started)
        return { content: [{ type: 'text', text: JSON.stringify({ error: msg }) }], isError: true }
      }
    },
  }
}

export async function POST(req: NextRequest) {
  const token = tokenDa(req.headers.get('authorization'))
  if (!token) return nonAutorizzato(req, false)

  let corpo: unknown
  try { corpo = await req.json() } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: ERRORE.parse, message: 'JSON non valido' } }, 400)
  }

  return conToken(token, async () => {
    const base = await buildAssistantCtx('dashboard')
    if (!base) return nonAutorizzato(req, true)
    if (!puoUsareIlConnettore(base.profile)) {
      return json({ error: 'insufficient_scope', error_description: 'Il connettore è riservato allo staff interno di TwoBee' }, 403)
    }
    /* La superficie la decide il ruolo, non chi chiama: chi non è admin legge
       i clienti da `clients_workspace`, senza numeri economici (§211). */
    const c: AssistantCtx = { ...base, surface: base.isAdmin ? 'dashboard' : 'workspace' }
    const risposta = await rispondiCorpo(corpo, server(c))
    return risposta === null ? new NextResponse(null, { status: 202 }) : json(risposta)
  })
}

/* Niente stream dal server verso Claude: ogni risposta viaggia nella sua POST. */
export function GET() {
  return json({ error: 'Usa POST' }, 405, { Allow: 'POST' })
}

export function DELETE() {
  return json({ error: 'Nessuna sessione da chiudere' }, 405, { Allow: 'POST' })
}

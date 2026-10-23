/* §493 — Il connettore di Claude: il protocollo. Esegui il gate: npx tsx lib/mcp/protocollo.check.ts

   MCP è JSON-RPC 2.0 su HTTP. Qui c'è solo quello che serve a un server di
   strumenti senza stato: `initialize`, `ping`, `tools/list`, `tools/call`, le
   notifiche. Niente sessioni e niente stream: ogni POST porta la sua risposta in
   JSON, e una notifica risponde 202 senza corpo. È un modulo puro — chi esegue
   gli strumenti lo passa da fuori — così il protocollo si prova senza un server
   e senza un token. */

export const VERSIONI = ['2025-06-18', '2025-03-26', '2024-11-05'] as const

export type StrumentoMcp = {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean; title?: string }
}

export type EsitoStrumento = { content: { type: 'text'; text: string }[]; isError?: boolean }

export type Server = {
  nome: string
  versione: string
  istruzioni?: string
  strumenti: StrumentoMcp[]
  /** `null` = strumento sconosciuto (errore di protocollo, non di esecuzione) */
  esegui: (nome: string, args: Record<string, unknown>) => Promise<EsitoStrumento | null>
}

type Id = string | number | null
type Risposta =
  | { jsonrpc: '2.0'; id: Id; result: unknown }
  | { jsonrpc: '2.0'; id: Id; error: { code: number; message: string } }

export const ERRORE = { parse: -32700, richiesta: -32600, metodo: -32601, parametri: -32602, interno: -32603 } as const

const errore = (id: Id, code: number, message: string): Risposta => ({ jsonrpc: '2.0', id, error: { code, message } })
const ok = (id: Id, result: unknown): Risposta => ({ jsonrpc: '2.0', id, result })

/** La versione da usare: quella del client se la conosciamo, altrimenti la più recente nostra. */
export function versioneConcordata(richiesta: unknown): string {
  return VERSIONI.includes(richiesta as typeof VERSIONI[number]) ? (richiesta as string) : VERSIONI[0]
}

/**
 * Un messaggio JSON-RPC → la risposta, o `null` se era una notifica (niente
 * `id`: non si risponde). Gli errori di esecuzione di uno strumento non sono
 * errori di protocollo: tornano dentro il risultato con `isError`, così il
 * modello li legge e si corregge, come nell'assistente Ctrl+J.
 */
export async function rispondi(msg: unknown, s: Server): Promise<Risposta | null> {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return errore(null, ERRORE.richiesta, 'Richiesta non valida')
  const m = msg as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown }
  const notifica = !('id' in m)
  const id: Id = typeof m.id === 'string' || typeof m.id === 'number' ? m.id : null
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') return notifica ? null : errore(id, ERRORE.richiesta, 'Richiesta non valida')
  // risposte del client a nostre richieste: non ne facciamo, quindi si ignorano
  if (notifica) return null

  const params = (m.params && typeof m.params === 'object' ? m.params : {}) as Record<string, unknown>
  switch (m.method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: versioneConcordata(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: s.nome, version: s.versione },
        ...(s.istruzioni ? { instructions: s.istruzioni } : {}),
      })
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: s.strumenti })
    case 'tools/call': {
      const nome = params.name
      if (typeof nome !== 'string') return errore(id, ERRORE.parametri, 'Manca il nome dello strumento')
      const a = params.arguments ?? {}
      if (typeof a !== 'object' || Array.isArray(a) || a === null) return errore(id, ERRORE.parametri, 'Gli argomenti vanno inviati come oggetto')
      try {
        const esito = await s.esegui(nome, a as Record<string, unknown>)
        return esito ? ok(id, esito) : errore(id, ERRORE.parametri, `Strumento sconosciuto: ${nome}`)
      } catch (e) {
        return ok(id, { content: [{ type: 'text', text: JSON.stringify({ error: e instanceof Error ? e.message : 'Errore imprevisto' }) }], isError: true })
      }
    }
    default:
      return errore(id, ERRORE.metodo, `Metodo non supportato: ${m.method}`)
  }
}

/**
 * Il corpo di una POST: un messaggio o un lotto (2025-03-26). `null` = solo
 * notifiche, quindi 202 senza corpo.
 */
export async function rispondiCorpo(corpo: unknown, s: Server): Promise<Risposta | Risposta[] | null> {
  if (Array.isArray(corpo)) {
    if (corpo.length === 0) return errore(null, ERRORE.richiesta, 'Lotto vuoto')
    const tutte = await Promise.all(corpo.map(m => rispondi(m, s)))
    const risposte = tutte.filter((r): r is Risposta => r !== null)
    return risposte.length ? risposte : null
  }
  return rispondi(corpo, s)
}

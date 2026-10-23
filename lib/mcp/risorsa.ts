/* §493 — Il connettore di Claude: dove sta e chi rilascia i token.

   Claude chiama `/api/mcp` senza token, riceve 401 con l'indirizzo di questi
   metadati (RFC 9728), li legge e scopre che i token li rilascia Supabase Auth
   (server OAuth 2.1 del progetto, con la registrazione automatica dei client).
   Il login è quello del gestionale: nessun account nuovo, nessuna password in
   più. */

export const PERCORSO_MCP = '/api/mcp'

/** L'indirizzo pubblico del gestionale: dietro il proxy `origin` è quello interno del container. */
export function basePubblica(origin: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, '')
}

export function urlMetadati(base: string): string {
  return `${base}/.well-known/oauth-protected-resource${PERCORSO_MCP}`
}

export function metadatiRisorsa(base: string, supabaseUrl: string) {
  return {
    resource: `${base}${PERCORSO_MCP}`,
    authorization_servers: [`${supabaseUrl.replace(/\/$/, '')}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'TwoBee Gestionale',
  }
}

/** L'intestazione del 401: dice a Claude dove leggere i metadati e, se c'era un token, che non va. */
export function intestazioneNonAutorizzato(base: string, tokenPresente: boolean): string {
  return `Bearer resource_metadata="${urlMetadati(base)}"${tokenPresente ? ', error="invalid_token"' : ''}`
}

/** Il token dall'intestazione `Authorization: Bearer …`, o `null`. */
export function tokenDa(intestazione: string | null): string | null {
  const m = intestazione?.match(/^Bearer\s+([A-Za-z0-9._~+/=-]+)\s*$/i)
  return m ? m[1] : null
}

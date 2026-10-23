import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * §493 — il token di chi chiama da fuori dal browser: il connettore di Claude
 * (`/api/mcp`) non ha cookie, manda `Authorization: Bearer`. Dentro
 * `conToken()` ogni `createClient()` usa quel token invece dei cookie, così i
 * server action e i loro guard (`requireStaff`, `getSessionUser`…) valgono
 * identici senza riscriverli, e la RLS resta il pavimento. Fuori da
 * `conToken()` non cambia niente.
 */
const tokenDellaRichiesta = new AsyncLocalStorage<string>()

export function conToken<T>(token: string, fn: () => Promise<T>): Promise<T> {
  return tokenDellaRichiesta.run(token, fn)
}

/**
 * Un client per richiesta, non uno per chiamata.
 *
 * Layout, pagina e componenti annidati chiamavano `createClient()` ciascuno per
 * conto suo: ogni chiamata rileggeva i cookie e costruiva un client nuovo, con
 * la sua coda di refresh del token. `cache()` di React memoizza per singola
 * richiesta — dentro lo stesso render tutti ottengono la stessa istanza, e fra
 * richieste diverse non si condivide niente (nessuna sessione che sfugge a un
 * altro utente).
 */
export const createClient = cache(async () => {
  const token = tokenDellaRichiesta.getStore()
  if (token) return clientCol(token)

  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Il metodo set è chiamato da un Server Component — ignorabile
          }
        },
      },
    }
  )
})

/* Senza cookie non c'è una sessione da cui `getUser()` e `getClaims()`
   leggano il token: risponderebbero «nessun utente» a chi ha un token valido.
   Si passa il token esplicitamente — è la stessa verifica, fatta sul token
   che è arrivato invece che su quello del cookie. */
function clientCol(token: string) {
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }
  )
  const getUser = sb.auth.getUser.bind(sb.auth)
  const getClaims = sb.auth.getClaims.bind(sb.auth)
  sb.auth.getUser = (jwt?: string) => getUser(jwt ?? token)
  sb.auth.getClaims = ((jwt?: string, options?: Parameters<typeof getClaims>[1]) => getClaims(jwt ?? token, options)) as typeof getClaims
  return sb
}

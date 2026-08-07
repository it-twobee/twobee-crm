import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

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

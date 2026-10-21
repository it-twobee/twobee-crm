import { createBrowserClient } from '@supabase/ssr'
import { eScrittura, segnalaScrittura } from '@/lib/router-cache'

/* §491 — ogni scrittura riuscita dal browser lo annuncia: le pagine tenute in
   memoria vanno buttate, o tornando indietro si rivedrebbe il dato di prima */
const fetchCheAnnuncia: typeof fetch = async (input, init) => {
  const res = await fetch(input, init)
  if (res.ok) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const metodo = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (eScrittura(url, metodo)) segnalaScrittura()
  }
  return res
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: fetchCheAnnuncia } },
  )
}

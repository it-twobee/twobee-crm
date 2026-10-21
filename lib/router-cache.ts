/* §491 — Le pagine già viste restano in memoria nel browser (`staleTimes` in
   next.config.mjs): tornare su una sezione aperta da poco non rifà il giro a
   Supabase, che a tratti si ferma per secondi. La condizione è che una modifica
   propria si veda **sempre**, subito. Le azioni del server la garantiscono da
   sé (`revalidatePath` svuota la memoria del router); le scritture fatte dal
   browser col client Supabase no — e sono parecchie: customer care, scheda
   cliente, HR, ticket, impostazioni. Il client del browser le annuncia con
   questo evento, e `MemoriaPagine` svuota la memoria. */

export const EVENTO_SCRITTURA = 'twobee:scrittura'

/** Una scrittura sul database (non una lettura, non una RPC): POST/PATCH/PUT/DELETE su /rest/v1/<tabella>. */
export function eScrittura(url: string, metodo: string): boolean {
  const m = metodo.toUpperCase()
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false
  /* le RPC passano in POST anche quando leggono: una lettura che svuota la
     memoria e ricarica la pagina, che rifà la lettura, sarebbe un giro senza
     fine. Le RPC che scrivono, dal browser, non ce ne sono. */
  return /\/rest\/v1\/(?!rpc\/)[^/?]+/.test(url)
}

export function segnalaScrittura() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_SCRITTURA))
}

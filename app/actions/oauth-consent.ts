'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile, getSessionUser } from '@/lib/auth'
import { puoUsareIlConnettore } from '@/lib/mcp/accesso'

/* §493 — la risposta alla pagina «Autorizza Claude». Passa dal client
   dell'utente: è la sua sessione che Supabase Auth guarda per rilasciare il
   codice, e il service role qui non serve a niente. */

const valido = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id)
const tornaAllaPagina = (id: string): never => redirect(`/oauth/consent?authorization_id=${id}&errore=1`)

export async function autorizzaClaude(formData: FormData) {
  const id = formData.get('authorization_id')
  if (!valido(id)) redirect('/oauth/consent')
  /* Ripetuto qui e non solo nella pagina: un `'use server'` è un endpoint, e
     la pagina che nasconde il bottone non è una barriera. La barriera vera
     resta comunque `/api/mcp`, che rifiuta il token di chi non è staff. */
  const profile = await getSessionProfile()
  if (!puoUsareIlConnettore(profile)) tornaAllaPagina(id)
  const sb = await createClient()
  const { data, error } = await sb.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
  if (error || !data?.redirect_url) tornaAllaPagina(id)
  redirect(data!.redirect_url)
}

export async function rifiutaClaude(formData: FormData) {
  const id = formData.get('authorization_id')
  if (!valido(id)) redirect('/oauth/consent')
  if (!(await getSessionUser())) redirect('/login')
  const sb = await createClient()
  const { data, error } = await sb.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
  if (error || !data?.redirect_url) tornaAllaPagina(id)
  redirect(data!.redirect_url)
}

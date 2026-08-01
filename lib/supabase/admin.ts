import { createClient } from '@supabase/supabase-js'

// Admin client con service role — solo server-side
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Come `createAdminClient`, ma dichiara per conto di chi sta scrivendo.
 *
 * Il service role non ha `auth.uid()`: il trigger di cronologia non sa chi ha
 * fatto la modifica e la registra senza autore. PostgREST espone gli header
 * della richiesta come GUC, quindi l'attore viaggia in `x-actor-id` e il
 * trigger (migration 179) lo legge da lì. Usalo in ogni server action che
 * scrive su tabelle con cronologia: clients, projects, tasks, deals,
 * objectives, invoices, tickets.
 */
export function createActorClient(actorId: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { 'x-actor-id': actorId } },
    }
  )
}

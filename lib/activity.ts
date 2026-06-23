/**
 * Imposta la variabile di sessione Postgres usata dal trigger log_activity()
 * per associare l'utente corrente ad ogni operazione DB.
 * Va chiamata prima di qualsiasi INSERT/UPDATE/DELETE significativo.
 */
export async function setSessionUser(supabase: ReturnType<typeof import('@/lib/supabase/client').createClient>, userId: string) {
  await supabase.rpc('set_config', {
    setting: 'app.current_user_id',
    value: userId,
    is_local: true,
  }).then(() => {})
  // fallback: non blocca se la RPC non esiste
}

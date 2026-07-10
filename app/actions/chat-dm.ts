'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * Apre (o riusa) il canale di messaggi diretti fra l'utente corrente e `otherId`.
 *
 * INSERT su chat_channels richiede role='admin' via RLS, quindi passiamo dal
 * service role. Il controllo di chi può aprire un DM lo facciamo qui: entrambi
 * devono essere profili attivi, e non si apre un DM con se stessi.
 */
export async function openDirectMessage(otherId: string): Promise<{ channelId: string } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  if (otherId === user.id) return { error: 'Non puoi aprire una conversazione con te stesso' }

  const admin = createAdminClient()

  const { data: other } = await admin
    .from('profiles').select('id, full_name, is_active').eq('id', otherId).single()
  if (!other || !other.is_active) return { error: 'Utente non disponibile' }

  // Esiste già un DM fra i due? Cerchiamo i canali dm dell'utente corrente e
  // teniamo quello che ha esattamente l'altro come secondo partecipante.
  const { data: mine } = await admin
    .from('chat_dm_participants').select('channel_id').eq('profile_id', user.id)

  const myChannels = (mine ?? []).map((r: { channel_id: string }) => r.channel_id)
  if (myChannels.length > 0) {
    const { data: shared } = await admin
      .from('chat_dm_participants')
      .select('channel_id')
      .eq('profile_id', otherId)
      .in('channel_id', myChannels)
    if (shared && shared.length > 0) return { channelId: shared[0].channel_id }
  }

  const { data: me } = await admin.from('profiles').select('full_name').eq('id', user.id).single()

  const { data: channel, error } = await admin.from('chat_channels').insert({
    // Il nome è un fallback: la UI mostra il nome dell'altro partecipante.
    name: `${me?.full_name ?? 'Utente'} · ${other.full_name}`,
    type: 'dm',
    created_by: user.id,
  } as never).select('id').single()

  if (error || !channel) {
    // Il tipo 'dm' non esiste finché la 090 non è applicata: un errore Postgres
    // grezzo non dice a nessuno cosa fare.
    if (error?.message?.includes('chat_channels_type_check')) {
      return { error: 'I messaggi diretti richiedono la migration 090_chat_rework.sql' }
    }
    return { error: error?.message ?? 'Creazione canale fallita' }
  }

  const { error: partErr } = await admin.from('chat_dm_participants').insert([
    { channel_id: channel.id, profile_id: user.id },
    { channel_id: channel.id, profile_id: otherId },
  ] as never)

  if (partErr) {
    // Un canale senza partecipanti è irraggiungibile: meglio rimuoverlo.
    await admin.from('chat_channels').delete().eq('id', channel.id)
    return { error: partErr.message }
  }

  revalidatePath('/chat')
  return { channelId: channel.id }
}

/** Crea i tre canali team se mancano. Idempotente, come la migration 090. */
export async function ensureTeamChannels(): Promise<void> {
  const admin = createAdminClient()
  const wanted = [
    { key: 'team_intern', name: 'team-intern', position: 1 },
    { key: 'angolo_informativo', name: 'angolo-informativo', position: 2 },
    { key: 'best_ideas', name: 'best-ideas', position: 3 },
  ]

  const { data: existing } = await admin
    .from('chat_channels').select('team_key').eq('type', 'team')
  const have = new Set((existing ?? []).map((c: { team_key: string | null }) => c.team_key))

  const missing = wanted.filter(w => !have.has(w.key))
  if (missing.length === 0) return

  await admin.from('chat_channels').insert(
    missing.map(m => ({ name: m.name, type: 'team', team_key: m.key, position: m.position })) as never,
  )
}

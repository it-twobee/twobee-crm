'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { SUPER_ADMIN_EMAILS, coarseRole, isAdminRole } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import type { AppRole } from '@/lib/types/database'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile } = await supabase.from('profiles').select('email,app_role').eq('id', user.id).single()
  if (!profile) throw new Error('Profilo non trovato')
  const isSuper = SUPER_ADMIN_EMAILS.includes(profile.email) || profile.app_role === 'super_admin'
  const isAdmin = isSuper || profile.app_role === 'admin'
  if (!isAdmin) throw new Error('Accesso negato')
  return { callerId: user.id, isSuper }
}

// Promuove/cambia il ruolo (e i dati) di un utente. Allinea app_role + role così
// il suo portale workspace si aggiorna con sezioni, requisiti e responsabilità.
/**
 * §361 — `hireDate` e `birthDate` stanno **qui**, su `profiles`, e non sono
 * gli omonimi di `hr_people`: quelli sono la scheda paghe, esistono solo per
 * chi è a libro paga e servono a sapere quali contratti sono possibili. Questi
 * riguardano la persona — da quanto è con noi, quando è il suo compleanno —
 * e valgono anche per un freelance che una busta paga non ce l'ha.
 */
export async function adminUpdateUserProfile(userId: string, fields: {
  appRole?: AppRole; area?: string | null; jobTitle?: string | null
  competencies?: string[]; isActive?: boolean
  hireDate?: string | null; birthDate?: string | null
}) {
  const { callerId, isSuper } = await assertAdmin()
  const admin = createAdminClient()

  const updates: Record<string, unknown> = {}
  if (fields.appRole) {
    // Anti-escalation: solo il super admin assegna ruoli amministrativi.
    if (isAdminRole(fields.appRole) && !isSuper)
      throw new Error('Solo il super admin può assegnare ruoli amministrativi')
    // Nessuno può declassare sé stesso (evita di perdere l'accesso admin per sbaglio).
    if (userId === callerId && coarseRole(fields.appRole) !== 'admin')
      throw new Error('Non puoi cambiare il tuo ruolo amministrativo')
    updates.app_role = fields.appRole
    updates.role = coarseRole(fields.appRole)
  }
  if (fields.area !== undefined) updates.area = fields.area
  if (fields.jobTitle !== undefined) updates.job_title = fields.jobTitle
  if (fields.competencies !== undefined) updates.competencies = fields.competencies
  if (fields.isActive !== undefined) updates.is_active = fields.isActive
  /* Una data vuota è `null`, non stringa vuota: `date` in Postgres rifiuta ''
     e il campo si svuota cancellando il testo, non scrivendoci dentro. */
  if (fields.hireDate !== undefined) updates.hire_date = fields.hireDate || null
  if (fields.birthDate !== undefined) updates.birth_date = fields.birthDate || null

  const { error } = await admin.from('profiles').update(updates as never).eq('id', userId)
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni')
  revalidatePath('/workspace')
  return { role: updates.role as string | undefined }
}

export async function adminChangeUserEmail(userId: string, newEmail: string) {
  await assertAdmin()
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { email: newEmail })
  if (error) throw new Error(error.message)
  // Aggiorna anche profiles
  await admin.from('profiles').update({ email: newEmail }).eq('id', userId)
}

export async function adminChangeUserName(userId: string, fullName: string) {
  await assertAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({ full_name: fullName }).eq('id', userId)
  if (error) throw new Error(error.message)
}

export async function adminSendPasswordReset(email: string) {
  await assertAdmin()
  // Usa client normale per inviare reset email — non richiede admin key
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/reset-password`,
  })
  if (error) throw new Error(error.message)
}

// ── §362 · eliminazione definitiva ───────────────────────────────────────────

export type Traccia = { tabella: string; colonna: string; righe: number; azione: string }

/** `set null` e `set default` slegano e basta: sono le uniche che non tolgono niente */
const INNOCUA = (a: string) => a === 'set null' || a === 'set default'
/** `no action` e `restrict` non lasciano cancellare: il database rifiuta e basta */
const BLOCCA = (a: string) => a === 'no action' || a === 'restrict'

/**
 * Cosa si porta dietro una persona, prima di decidere.
 *
 * La lista arriva da `tracce_membro` (migration 234), che la chiede allo schema
 * invece di fidarsi di un elenco scritto a mano: quarantotto chiavi esterne
 * puntano a `profiles`, e una copia in TypeScript sarebbe vecchia alla prossima
 * tabella.
 */
export async function adminUserTraces(userId: string): Promise<Traccia[]> {
  await assertAdmin()
  const { data, error } = await createAdminClient().rpc('tracce_membro', { p_id: userId })
  if (error) throw new Error(`Impossibile leggere le tracce: ${error.message}`)
  return ((data ?? []) as Traccia[]).filter(t => !INNOCUA(t.azione))
}

/**
 * Elimina un membro **per sempre**: la riga in `profiles` e l'utente di Auth.
 *
 * Tre cose, e nessuna è pignoleria:
 *
 * - **admin e super admin** (§419). Era super admin soltanto, e la ragione era
 *   buona — cancellare non si disfa — ma reggeva solo finché il super admin era
 *   l'unico a fare pulizia: con gli account di prova che si accumulano, la
 *   scelta si è rivelata un collo di bottiglia e il committente l'ha cambiata.
 *   Resta la parte che conta: **un ruolo amministrativo lo elimina solo un
 *   super admin**, perché lì la cancellazione è anche una perdita di governo;
 * - **mai sé stessi.** Cancellarsi da soli lascia un sistema senza chi lo
 *   governa, e non c'è schermata che lo rimetta a posto;
 * - **mai chi ha lasciato tracce che bloccano.** Se ha task, cronologia o
 *   documenti con una chiave che non lascia cancellare, il database
 *   rifiuterebbe comunque: meglio dirlo prima, con l'elenco, che mostrare un
 *   errore di vincolo. Chi ha lavorato qui si disattiva — la storia resta.
 *
 * Quello che **cascade** si porta via viene mostrato prima nella conferma: non
 * si cancella niente che la persona davanti allo schermo non abbia letto.
 */
export async function adminDeleteUser(userId: string): Promise<{ eliminato: true }> {
  const { callerId, isSuper } = await assertAdmin()
  if (userId === callerId) throw new Error('Non puoi eliminare il tuo stesso account')

  const admin = createAdminClient()
  const { data: target } = await admin.from('profiles').select('email, app_role').eq('id', userId).maybeSingle()
  const t = target as { email?: string; app_role?: string } | null
  if (!t) throw new Error('Questo membro non esiste più')
  if (t.email && SUPER_ADMIN_EMAILS.includes(t.email)) {
    throw new Error('Questo account non si elimina: è il super admin di sistema')
  }
  /* §419 — un admin fa pulizia, non tocca chi governa: per togliere di mezzo un
     ruolo amministrativo serve un super admin. Senza questa riga, aprire
     l'eliminazione agli admin avrebbe aperto anche la strada per eliminarsi
     l'un l'altro. */
  if (!isSuper && isAdminRole(t.app_role)) {
    throw new Error('Un ruolo amministrativo lo elimina solo il super admin')
  }

  const bloccanti = (await adminUserTraces(userId)).filter(x => BLOCCA(x.azione))
  if (bloccanti.length) {
    const elenco = bloccanti.map(x => `${x.tabella} (${x.righe})`).join(', ')
    throw new Error(`Ha ancora dati collegati che non si possono cancellare: ${elenco}. Disattivalo invece di eliminarlo.`)
  }

  /* Prima il profilo, poi l'utente di Auth. Se `profiles` cade in cascata da
     `auth.users` la prima è già superflua, ma l'ordine inverso lascerebbe un
     profilo orfano nel caso opposto — e un profilo senza utente è una riga che
     compare in elenco e non si può più toccare. */
  const { error: eProfilo } = await admin.from('profiles').delete().eq('id', userId)
  if (eProfilo) throw new Error(`Profilo non eliminato: ${eProfilo.message}`)

  const { error: eAuth } = await admin.auth.admin.deleteUser(userId)
  /* «not found» va bene: vuol dire che la cascata da `profiles` l'ha già
     portato via, o che l'utente di Auth non c'era (invito mai accettato). */
  if (eAuth && !/not.?found/i.test(eAuth.message)) {
    throw new Error(`Profilo eliminato ma l'utente di accesso è rimasto: ${eAuth.message}`)
  }

  revalidatePath('/impostazioni')
  return { eliminato: true }
}

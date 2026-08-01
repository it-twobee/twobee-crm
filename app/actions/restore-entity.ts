'use server'

import { createClient } from '@/lib/supabase/server'
import { createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

/**
 * Cosa si può riportare indietro. La chiave è `activity_log.entity_type`, che
 * il trigger riempie col nome della tabella: qui non ci sono alias, c'è la
 * lista di quello che è sicuro riscrivere.
 */
const RESTORABLE: Record<string, string> = {
  clients: 'clients',
  projects: 'projects',
  tasks: 'tasks',
  tickets: 'tickets',
  deals: 'deals',
  objectives: 'objectives',
  key_results: 'key_results',
}

/** Non si riscrivono: chi ha creato la riga e quando, e l'identità della riga stessa. */
const EXCLUDE = new Set(['id', 'created_at', 'created_by', 'updated_at'])

export type RestorePreview = {
  ok: boolean
  reason?: string
  /** i campi che tornerebbero indietro, col valore di destinazione */
  fields: { field: string; from: unknown; to: unknown }[]
  action: 'reinserimento' | 'ritorno' | null
  label: string | null
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile } = await supabase.from('profiles').select('email, app_role').eq('id', user.id).single()
  const isAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || profile?.app_role === 'admin'
  if (!isAdmin) throw new Error('Solo gli admin possono ripristinare versioni precedenti')
  return { supabase, userId: user.id }
}

/**
 * Cosa cambierebbe un ripristino, senza farlo. Serve alla conferma: «torni
 * indietro» non vuol dire niente se non si vede su quali campi.
 */
export async function previewRestore(logId: string): Promise<RestorePreview> {
  const { supabase } = await requireAdmin()
  const { data: log } = await supabase.from('activity_log').select('*').eq('id', logId).single()
  if (!log) return { ok: false, reason: 'Voce di cronologia non trovata', fields: [], action: null, label: null }

  const table = RESTORABLE[log.entity_type]
  if (!table) {
    return { ok: false, reason: `«${log.entity_type}» non è ripristinabile`, fields: [], action: null, label: log.entity_label }
  }
  if (log.action === 'create') {
    return { ok: false, reason: 'Una creazione non si ripristina: si elimina la riga', fields: [], action: null, label: log.entity_label }
  }

  if (log.action === 'delete') {
    const snapshot = log.snapshot as Record<string, unknown>
    return {
      ok: true, action: 'reinserimento', label: log.entity_label,
      fields: Object.entries(snapshot)
        .filter(([k, v]) => !EXCLUDE.has(k) && v !== null)
        .slice(0, 12)
        .map(([field, to]) => ({ field, from: null, to })),
    }
  }

  const diff = (log.diff ?? {}) as Record<string, { old: unknown; new: unknown }>
  const fields = Object.entries(diff)
    .filter(([k]) => !EXCLUDE.has(k))
    .map(([field, { old, new: now }]) => ({ field, from: now, to: old }))
  if (fields.length === 0) {
    return { ok: false, reason: 'Questa modifica non ha campi da riportare indietro', fields: [], action: null, label: log.entity_label }
  }
  return { ok: true, action: 'ritorno', label: log.entity_label, fields }
}

/**
 * Riporta indietro una modifica.
 *
 * Per un `update` conta il **diff**, non lo snapshot: lo snapshot è lo stato
 * *dopo* il cambiamento, quindi riapplicarlo lascia tutto com'è — che è esatta-
 * mente quello che faceva prima. Si riscrivono solo i campi toccati da quella
 * modifica: le altre colonne possono essere cambiate dopo, e riscriverle
 * significherebbe annullare anche il lavoro di qualcun altro.
 */
export async function restoreEntitySnapshot(logId: string) {
  const { supabase, userId } = await requireAdmin()

  const { data: log, error: logErr } = await supabase.from('activity_log').select('*').eq('id', logId).single()
  if (logErr || !log) throw new Error('Voce di cronologia non trovata')

  const table = RESTORABLE[log.entity_type]
  if (!table) throw new Error(`«${log.entity_type}» non è ripristinabile`)
  if (log.action === 'create') throw new Error('Una creazione non si ripristina: elimina la riga dalla sua pagina')

  const db = createActorClient(userId)

  if (log.action === 'delete') {
    const snapshot = { ...(log.snapshot as Record<string, unknown>) }
    for (const k of ['created_at', 'created_by', 'updated_at']) delete snapshot[k]
    const { error } = await db.from(table).insert(snapshot)
    if (error) throw new Error(error.message)
  } else {
    const diff = (log.diff ?? {}) as Record<string, { old: unknown; new: unknown }>
    const patch: Record<string, unknown> = {}
    for (const [field, { old }] of Object.entries(diff)) {
      if (!EXCLUDE.has(field)) patch[field] = old
    }
    if (Object.keys(patch).length === 0) throw new Error('Questa modifica non ha campi da riportare indietro')
    const { error } = await db.from(table).update(patch).eq('id', log.entity_id)
    if (error) throw new Error(error.message)
  }

  /* Il ripristino è a sua volta una modifica: il trigger la registra da solo.
     Quello che il trigger non può sapere è che nasce da un'altra voce, quindi
     lo si scrive qui — così la cronologia non sembra un cambio spontaneo. */
  await db.from('activity_log').insert({
    user_id: userId,
    entity_type: log.entity_type,
    entity_id: log.entity_id,
    entity_label: log.entity_label,
    action: 'update',
    snapshot: log.snapshot,
    diff: { _ripristino: { old: `voce ${logId.slice(0, 8)}`, new: 'stato riportato indietro' } },
  })

  revalidatePath('/impostazioni/cronologia')
  return { ok: true }
}

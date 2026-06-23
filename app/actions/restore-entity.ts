'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

const RESTORABLE: Record<string, string> = {
  clients:     'clients',
  tasks:       'tasks',
  deals:       'deals',
  invoices:    'invoices',
  tickets:     'tickets',
  objectives:  'objectives',
  key_results: 'key_results',
  projects:    'projects',
}

// Campi da escludere dal restore (meta fields)
const EXCLUDE = ['created_at', 'created_by']

export async function restoreEntitySnapshot(logId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const { data: profile } = await supabase.from('profiles').select('email,app_role').eq('id', user.id).single()
  const isAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || ['admin'].includes(profile?.app_role ?? '')
  if (!isAdmin) throw new Error('Solo gli admin possono ripristinare versioni precedenti')

  // Carica la voce del log
  const { data: log, error: logErr } = await supabase
    .from('activity_log')
    .select('*')
    .eq('id', logId)
    .single()

  if (logErr || !log) throw new Error('Voce di cronologia non trovata')

  const table = RESTORABLE[log.entity_type]
  if (!table) throw new Error(`Tabella non ripristinabile: ${log.entity_type}`)

  // Prepara il payload: snapshot senza campi esclusi
  const snapshot = { ...log.snapshot }
  for (const k of EXCLUDE) delete snapshot[k]

  const admin = createAdminClient()

  if (log.action === 'delete') {
    // Reinserisce la riga eliminata
    const { error } = await admin.from(table).insert(snapshot)
    if (error) throw new Error(error.message)
  } else {
    // Ripristina lo stato precedente (applica snapshot alla riga corrente)
    const { error } = await admin.from(table).update(snapshot).eq('id', log.entity_id)
    if (error) throw new Error(error.message)
  }

  // Logga il ripristino stesso
  await supabase.from('activity_log').insert({
    user_id: user.id,
    entity_type: log.entity_type,
    entity_id: log.entity_id,
    entity_label: log.entity_label,
    action: 'update',
    snapshot,
    diff: { _restore: { old: 'versione corrente', new: `ripristino da log ${logId}` } },
  })

  return { ok: true }
}

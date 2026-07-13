import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SENSITIVE_FOLDERS, type StorageFile } from './shared'

// Guardia auth condivisa dalle route /api/files/*.
// L'accesso allo storage passa SEMPRE dal backend: qui verifichiamo utente + ruolo.

export interface Caller {
  userId: string
  role: string | null // coarse: admin | team | client | guest
  appRole: string | null
  email: string | null
  admin: ReturnType<typeof createAdminClient>
}

export async function getCaller(): Promise<Caller | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, app_role, email')
    .eq('id', user.id)
    .single()

  const p = (profile ?? {}) as { role?: string; app_role?: string; email?: string }
  return {
    userId: user.id,
    role: p.role ?? null,
    appRole: p.app_role ?? null,
    email: p.email ?? null,
    admin,
  }
}

/** Può leggere/scaricare questo file? Cartelle sensibili: solo owner o admin. */
export function canReadFile(
  c: Caller,
  f: Pick<StorageFile, 'folder' | 'uploaded_by'>,
): boolean {
  if (c.role === 'admin') return true
  if (f.uploaded_by && f.uploaded_by === c.userId) return true
  return !SENSITIVE_FOLDERS.includes(f.folder)
}

/** Può eliminare questo file? Solo owner o admin. */
export function canDeleteFile(
  c: Caller,
  f: Pick<StorageFile, 'uploaded_by'>,
): boolean {
  return c.role === 'admin' || (!!f.uploaded_by && f.uploaded_by === c.userId)
}

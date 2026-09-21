import { createClient } from '@/lib/supabase/server'
import { createActorClient } from '@/lib/supabase/admin'
import { canManageFolder, canWriteStorage, isStorageStaff, sameStorageContext } from './access'
import type { StorageActor, StorageContext } from './access'
import type { StorageFolderRow } from './shared'
export { canReadFile, canDeleteFile, canReadFolder, canManageFolder, canShareFile, canWriteStorage, isStorageAdmin } from './access'

// Guardia auth condivisa dalle route /api/files/*.
// L'accesso allo storage passa SEMPRE dal backend: qui verifichiamo utente + ruolo.

export interface Caller extends StorageActor {
  email: string | null
  session: Awaited<ReturnType<typeof createClient>>
  admin: ReturnType<typeof createActorClient>
}

export async function getCaller(): Promise<Caller | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, app_role, email, is_active')
    .eq('id', user.id)
    .single()

  if (error || !profile) return null
  const actor: StorageActor = {
    userId: user.id,
    role: profile.role ?? null,
    appRole: profile.app_role ?? null,
    active: profile.is_active !== false,
  }
  if (!isStorageStaff(actor)) return null
  return { ...actor, email: profile.email ?? null, session: supabase, admin: createActorClient(user.id) }
}

export async function canAccessStorageContext(caller: Caller, context: StorageContext, write = false) {
  if (write && !canWriteStorage(caller)) return false
  const { data, error } = await caller.session.rpc('storage_context_access', {
    p_folder: context.folder, p_entity_type: context.entity_type, p_entity_id: context.entity_id, p_write: write,
  })
  return !error && data === true
}

export async function validStorageParent(caller: Caller, context: StorageContext, parentId: string | null, write = false) {
  if (!parentId) return true
  const { data, error } = await caller.session.from('file_folders').select('*').eq('id', parentId).maybeSingle()
  return !error && !!data && sameStorageContext(context, data as StorageFolderRow)
    && (!write || canManageFolder(caller, data as StorageFolderRow))
}

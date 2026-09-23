import { createClient } from '@/lib/supabase/server'
import { createActorClient } from '@/lib/supabase/admin'
import { canManageFolder, canReadMaterials, canWriteMaterials, canWriteStorage, isStorageStaff, isStorageUuid, sameStorageContext } from './access'
import type { StorageActor, StorageContext } from './access'
import type { StorageFolderRow } from './shared'
export { canReadFile, canDeleteFile, canReadFolder, canManageFolder, canShareFile, canWriteStorage, isStorageAdmin, canReadMaterials, canWriteMaterials } from './access'

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

export type MaterialGate<T = never> =
  | { ok: true; caller: Caller; material: T }
  | { ok: false; status: number; error: string }

const materialContext = (clientId: string) => ({ folder: 'materiali' as const, entity_type: 'client', entity_id: clientId })

/* La porta dell'area file di un cliente, per il team. Una sola, perché la
   PATCH ne aveva mezza: controllava il ruolo e non l'azienda, e un'azienda
   nascosta al workspace restava toccabile da chi ne conosceva un file (§213).
   Ruolo, poi contesto: nessuna rotta arriva a MinIO prima di tutti e due. */
export async function requireMaterialAccess(clientId: string, write: boolean): Promise<MaterialGate<null>> {
  const caller = await getCaller()
  if (!caller) return { ok: false, status: 401, error: 'Non autorizzato' }
  if (!canReadMaterials(caller)) return { ok: false, status: 403, error: 'L’area file dei clienti è riservata al team interno.' }
  if (write && !canWriteMaterials(caller)) return { ok: false, status: 403, error: 'Accesso in sola lettura' }
  if (!isStorageUuid(clientId)) return { ok: false, status: 400, error: 'Cliente non valido' }
  if (!await canAccessStorageContext(caller, materialContext(clientId), write)) {
    return { ok: false, status: 403, error: 'Azienda non disponibile o non autorizzata.' }
  }
  return { ok: true, caller, material: null }
}

/** Come sopra, partendo da un file: la riga si legge con la RLS, l'azienda viene da lì. */
export async function requireMaterialRow<T extends { client_id: string }>(
  id: string, write: boolean, columns: string,
): Promise<MaterialGate<T>> {
  const caller = await getCaller()
  if (!caller) return { ok: false, status: 401, error: 'Non autorizzato' }
  if (!canReadMaterials(caller)) return { ok: false, status: 403, error: 'L’area file dei clienti è riservata al team interno.' }
  if (write && !canWriteMaterials(caller)) return { ok: false, status: 403, error: 'Accesso in sola lettura' }
  if (!isStorageUuid(id)) return { ok: false, status: 404, error: 'File non trovato' }
  const row = await caller.session.from('portal_materials').select(columns).eq('id', id).is('deleted_at', null).maybeSingle()
  // Un errore di lettura non è un «non esiste».
  if (row.error) return { ok: false, status: 503, error: 'File non disponibile' }
  if (!row.data) return { ok: false, status: 404, error: 'File non trovato' }
  const material = row.data as unknown as T
  if (!await canAccessStorageContext(caller, materialContext(material.client_id), write)) {
    return { ok: false, status: 404, error: 'File non trovato' }
  }
  return { ok: true, caller, material }
}

'use server'

/* §403 — L'area file di un cliente esiste per ogni cliente, da subito: non
   aspetta il portale. Qui la si legge per la scheda cliente; a scrivere ci
   pensano le rotte `/api/area-cliente/**`, che è dove sta la guard di scrittura. */
import { getViewer } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isStorageStaff, isStorageAdmin, canWriteStorage, isStorageUuid } from '@/lib/storage/access'
import { isMissingPortalSchema } from '@/lib/portal/model'
import type { ClientMaterial } from '@/components/shared/ClientFileArea'
import type { PortalResult } from '@/lib/portal/access'

export type ClientFilesData = {
  materials: ClientMaterial[]
  /** Il cliente ha un accesso vivo al portale: se no, il suo mezzo spazio è spento. */
  portalActive: boolean
  canWrite: boolean
  canDeleteClientFiles: boolean
  viewerId: string
  schemaMissing: boolean
}

async function requireFileStaff() {
  const { user, profile } = await getViewer()
  const actor = {
    userId: user?.id ?? '',
    role: profile?.role ?? null,
    appRole: profile?.app_role ?? null,
    active: profile?.is_active !== false,
  }
  if (!user || !isStorageStaff(actor)) throw new Error('Area riservata al team interno.')
  return actor
}

export async function getClientFiles(clientId: string): Promise<PortalResult<ClientFilesData>> {
  try {
    const actor = await requireFileStaff()
    if (!isStorageUuid(clientId)) throw new Error('Cliente non valido.')
    const db = await createClient()
    // Un'azienda nascosta al workspace non ha un'area, per chi non la vede (§213).
    const visible = await db.from(isStorageAdmin(actor) ? 'clients' : 'clients_workspace')
      .select('id').eq('id', clientId).maybeSingle()
    if (visible.error) throw new Error('Non è stato possibile leggere l’azienda. Riprova.')
    if (!visible.data) throw new Error('Cliente non disponibile o non autorizzato.')

    const [materials, memberships] = await Promise.all([
      db.from('portal_materials')
        .select('id, client_id, project_id, name, mime, size, kind, path, source, uploaded_by, uploaded_by_name, created_at, archived_at')
        .eq('client_id', clientId).is('deleted_at', null).order('created_at', { ascending: false }).limit(1000),
      db.from('portal_memberships').select('id').eq('client_id', clientId).is('revoked_at', null).limit(1),
    ])
    const schemaMissing = isMissingPortalSchema(materials.error)
    if (materials.error && !schemaMissing) throw new Error('Non è stato possibile leggere i file. Riprova.')

    return {
      data: {
        materials: schemaMissing ? [] : ((materials.data ?? []) as unknown as ClientMaterial[]),
        portalActive: !isMissingPortalSchema(memberships.error) && (memberships.data ?? []).length > 0,
        canWrite: canWriteStorage(actor),
        canDeleteClientFiles: isStorageAdmin(actor),
        viewerId: actor.userId,
        schemaMissing,
      },
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Operazione non riuscita. Riprova.' }
  }
}

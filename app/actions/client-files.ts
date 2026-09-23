'use server'

/* §403 — L'area file di un cliente esiste per ogni cliente, da subito: non
   aspetta il portale. Qui la si legge per la scheda cliente; a scrivere ci
   pensano le rotte `/api/area-cliente/**`, che è dove sta la guard di scrittura. */
import { getViewer } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canReadMaterials, canWriteMaterials, isStorageAdmin, isStorageUuid } from '@/lib/storage/access'
import { isMissingPortalSchema } from '@/lib/portal/model'
import type { ClientMaterial } from '@/lib/portal/explorer'
import type { PortalResult } from '@/lib/portal/access'

export type ClientFilesData = {
  materials: ClientMaterial[]
  /** Oltre `MAX_ROWS` righe l'elenco è parziale, e la pagina lo dice. */
  truncated: boolean
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
  // La stessa lista che usa il database: chi la RLS esclude vede una frase, non
  // un'area vuota che dice «nessuno ancora».
  if (!user || !canReadMaterials(actor)) throw new Error('L’area file dei clienti è riservata al team interno.')
  return actor
}

const MATERIAL_COLUMNS = 'id, client_id, project_id, name, mime, size, kind, path, source, uploaded_by, uploaded_by_name, created_at, archived_at'
const PAGE = 1000
/** Oltre, l'area va divisa: meglio dirlo che mostrare una parte come se fosse tutto. */
const MAX_ROWS = 20000

type Db = Awaited<ReturnType<typeof createClient>>

async function readAllMaterials(db: Db, clientId: string) {
  const rows: ClientMaterial[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const page = await db.from('portal_materials').select(MATERIAL_COLUMNS)
      .eq('client_id', clientId).is('deleted_at', null)
      .order('created_at', { ascending: false }).order('id').range(from, from + PAGE - 1)
    if (page.error) return { rows, error: page.error, truncated: false }
    rows.push(...((page.data ?? []) as unknown as ClientMaterial[]))
    if ((page.data ?? []).length < PAGE) return { rows, error: null, truncated: false }
  }
  return { rows, error: null, truncated: true }
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
      readAllMaterials(db, clientId),
      db.from('portal_memberships').select('id').eq('client_id', clientId).is('revoked_at', null).limit(1),
    ])
    const schemaMissing = isMissingPortalSchema(materials.error)
    if (materials.error && !schemaMissing) throw new Error('Non è stato possibile leggere i file. Riprova.')

    return {
      data: {
        materials: schemaMissing ? [] : materials.rows,
        truncated: materials.truncated,
        portalActive: !isMissingPortalSchema(memberships.error) && (memberships.data ?? []).length > 0,
        canWrite: canWriteMaterials(actor),
        canDeleteClientFiles: isStorageAdmin(actor),
        viewerId: actor.userId,
        schemaMissing,
      },
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Operazione non riuscita. Riprova.' }
  }
}

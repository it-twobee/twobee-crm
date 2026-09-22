import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { S3_BUCKET } from '@/lib/storage/s3'
import { isStorageUuid, validStorageObject } from '@/lib/storage/access'
import { serveStoredFile } from '@/lib/portal/serve'
import type { StorageFile } from '@/lib/storage/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* §395 — GET /api/portale/consegne/:versionId
   Non passa da `/api/files/:id/download`: quello è dello staff e aggirerebbe
   pubblicazione, scope progetto e revoca. L'autorizzazione **è** la RLS: la
   riga torna solo a chi ha una membership viva sul progetto pubblicato, e
   `storage_key` non è fra le colonne concesse al browser. Il service role
   arriva dopo, solo per leggere la chiave e servire i byte. */
export async function GET(req: Request, { params }: { params: { versionId: string } }) {
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  if (!isStorageUuid(params.versionId)) return NextResponse.json({ error: 'Consegna non trovata' }, { status: 404 })

  const version = await session.from('portal_deliverable_versions')
    .select('id')
    .eq('id', params.versionId).not('published_at', 'is', null).is('retired_at', null).maybeSingle()
  // Un errore di lettura non è un «non esiste»: non si finge un vuoto.
  if (version.error) return NextResponse.json({ error: 'Consegna non disponibile' }, { status: 503 })
  if (!version.data) return NextResponse.json({ error: 'Consegna non trovata' }, { status: 404 })

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Download non configurato' }, { status: 503 })
  }
  const admin = createAdminClient()
  const stored = await admin.from('portal_deliverable_versions')
    .select('storage_key, file_id').eq('id', params.versionId).maybeSingle()
  if (stored.error || !stored.data?.file_id) return NextResponse.json({ error: 'Consegna non trovata' }, { status: 404 })
  const fileRow = await admin.from('files').select('*').eq('id', stored.data.file_id).maybeSingle()
  if (fileRow.error || !fileRow.data) return NextResponse.json({ error: 'File non disponibile' }, { status: 404 })

  const file = fileRow.data as StorageFile
  // Bucket e prefisso devono corrispondere ai metadati, e la chiave pubblicata
  // resta quella della versione: una riga `files` modificata non cambia file.
  if (file.object_key !== stored.data.storage_key || !validStorageObject(file, S3_BUCKET)) {
    return NextResponse.json({ error: 'File non disponibile' }, { status: 409 })
  }

  // §397 — con il Range un video si scorre; senza, si scarica tutto e basta.
  return serveStoredFile(file.object_key, { name: file.name, mime: file.mime, size: Number(file.size ?? 0) }, req.headers.get('range'))
}

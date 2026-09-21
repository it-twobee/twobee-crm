import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getCaller, canDeleteFile, canShareFile, type Caller } from '@/lib/storage/guard'
import { isStorageUuid, validStorageObject } from '@/lib/storage/access'
import { S3_BUCKET } from '@/lib/storage/s3'
import type { StorageFile, FileShare } from '@/lib/storage/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TTL: Record<string, number | null> = {
  '24h': 24 * 3600e3,
  '7d': 7 * 24 * 3600e3,
  '30d': 30 * 24 * 3600e3,
  never: null,
}

function shareUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  return `${base}/api/public/files/${token}`
}

function activeShare(rows: FileShare[], nowMs: number): FileShare | null {
  const ok = rows
    .filter(s => !s.revoked && (!s.expires_at || new Date(s.expires_at).getTime() > nowMs))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return ok[0] ?? null
}

async function loadManageableFile(id: string): Promise<{ error: NextResponse } | { caller: Caller; file: StorageFile }> {
  const caller = await getCaller()
  if (!caller) return { error: NextResponse.json({ error: 'Non autorizzato' }, { status: 401 }) }
  if (!isStorageUuid(id)) return { error: NextResponse.json({ error: 'File non trovato' }, { status: 404 }) }
  const { data, error } = await caller.session.from('files').select('*').eq('id', id).single()
  if (error || !data) return { error: NextResponse.json({ error: 'File non trovato' }, { status: 404 }) }
  const file = data as StorageFile
  if (!canDeleteFile(caller, file)) return { error: NextResponse.json({ error: 'Solo chi ha caricato il file (o un admin) può condividerlo' }, { status: 403 }) }
  if (!validStorageObject(file, S3_BUCKET)) return { error: NextResponse.json({ error: 'File non disponibile' }, { status: 404 }) }
  return { caller, file }
}

// GET /api/files/:id/share — link attivo, se esiste.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const r = await loadManageableFile(params.id)
  if ('error' in r) return r.error
  if (!canShareFile(r.caller, r.file)) return NextResponse.json({ share: null, sharingAllowed: false })
  const { data, error } = await r.caller.session.from('file_shares').select('*').eq('file_id', params.id)
  if (error) return NextResponse.json({ error: 'Non è stato possibile leggere il link' }, { status: 500 })
  const share = activeShare((data ?? []) as FileShare[], Date.now())
  return NextResponse.json({ share: share ? { ...share, url: shareUrl(share.token) } : null, sharingAllowed: true })
}

// POST /api/files/:id/share { expiresIn } — crea/rinnova il link (revoca i precedenti).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await loadManageableFile(params.id)
  if ('error' in r) return r.error
  const { caller } = r
  if (!canShareFile(caller, r.file)) return NextResponse.json({ error: 'Questo documento richiede un accesso personale. Per i clienti usa la pubblicazione nel portale.' }, { status: 403 })

  let expiresIn = '7d'
  try { const b = await req.json(); if (b?.expiresIn) expiresIn = String(b.expiresIn) } catch {}
  if (!Object.hasOwn(TTL, expiresIn)) expiresIn = '7d'
  const ttl = TTL[expiresIn]
  const expires_at = ttl === null ? null : new Date(Date.now() + ttl).toISOString()

  const token = randomBytes(24).toString('base64url')
  const { data, error } = await caller.admin.rpc('storage_replace_share', { p_file: params.id, p_token: token, p_expires_at: expires_at })
  if (error || !data?.[0]) return NextResponse.json({ error: 'Non è stato possibile generare il link' }, { status: 500 })

  const share = data[0] as FileShare
  return NextResponse.json({ share: { ...share, url: shareUrl(share.token) } })
}

// DELETE /api/files/:id/share — revoca i link attivi.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const r = await loadManageableFile(params.id)
  if ('error' in r) return r.error
  const { error } = await r.caller.admin
    .rpc('storage_replace_share', { p_file: params.id, p_token: null, p_expires_at: null })
  if (error) return NextResponse.json({ error: 'Non è stato possibile revocare i link' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

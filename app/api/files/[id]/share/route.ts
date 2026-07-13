import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getCaller, canDeleteFile } from '@/lib/storage/guard'
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

async function loadManageableFile(id: string) {
  const caller = await getCaller()
  if (!caller) return { error: NextResponse.json({ error: 'Non autorizzato' }, { status: 401 }) }
  const { data, error } = await caller.admin.from('files').select('*').eq('id', id).single()
  if (error || !data) return { error: NextResponse.json({ error: 'File non trovato' }, { status: 404 }) }
  const file = data as StorageFile
  if (!canDeleteFile(caller, file)) return { error: NextResponse.json({ error: 'Solo chi ha caricato il file (o un admin) può condividerlo' }, { status: 403 }) }
  return { caller, file }
}

// GET /api/files/:id/share — link attivo, se esiste.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const r = await loadManageableFile(params.id)
  if ('error' in r) return r.error
  const { data } = await r.caller.admin.from('file_shares').select('*').eq('file_id', params.id)
  const share = activeShare((data ?? []) as FileShare[], Date.now())
  return NextResponse.json({ share: share ? { ...share, url: shareUrl(share.token) } : null })
}

// POST /api/files/:id/share { expiresIn } — crea/rinnova il link (revoca i precedenti).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await loadManageableFile(params.id)
  if ('error' in r) return r.error
  const { caller } = r

  let expiresIn = '7d'
  try { const b = await req.json(); if (b?.expiresIn) expiresIn = String(b.expiresIn) } catch {}
  if (!(expiresIn in TTL)) expiresIn = '7d'
  const ttl = TTL[expiresIn]
  const expires_at = ttl === null ? null : new Date(Date.now() + ttl).toISOString()

  // Un solo link attivo per file: revoco i precedenti e ne creo uno fresco.
  await caller.admin.from('file_shares').update({ revoked: true }).eq('file_id', params.id).eq('revoked', false)

  const token = randomBytes(24).toString('base64url')
  const { data, error } = await caller.admin
    .from('file_shares')
    .insert({ file_id: params.id, token, created_by: caller.userId, expires_at })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const share = data as FileShare
  return NextResponse.json({ share: { ...share, url: shareUrl(share.token) } })
}

// DELETE /api/files/:id/share — revoca i link attivi.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const r = await loadManageableFile(params.id)
  if ('error' in r) return r.error
  const { error } = await r.caller.admin
    .from('file_shares').update({ revoked: true }).eq('file_id', params.id).eq('revoked', false)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

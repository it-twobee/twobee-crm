import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canSeeEconomics } from '@/lib/permissions'
import { getObject } from '@/lib/storage/s3'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * §250 — GET /api/invoices/:id/download
 *
 * Proxy autenticato, come per le buste paga: **niente link firmato**. Una
 * fattura è un documento fiscale con dentro nomi, importi e partite IVA, e un
 * URL firmato che finisce in una chat resta valido finché non scade — anche per
 * chi non doveva vederlo. Qui il permesso si controlla a ogni richiesta, ed è
 * quello del dominio economico (§234), non «essere loggati».
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { data: profile } = await sb.from('profiles')
    .select('email, app_role').eq('id', user.id).maybeSingle()
  if (!canSeeEconomics(profile)) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: row } = await admin.from('invoices')
    .select('pdf_path, number, direction, counterparty_name').eq('id', params.id).maybeSingle()
  if (!row?.pdf_path) return NextResponse.json({ error: 'Nessun documento allegato' }, { status: 404 })

  let obj
  try {
    obj = await getObject(row.pdf_path as string)
  } catch (e) {
    return NextResponse.json({ error: 'Storage non disponibile: ' + (e as Error).message }, { status: 502 })
  }

  /* Il nome del file lo compone il server: «fattura-28-26-icura.pdf» si ritrova
     in una cartella download, «a3f9-…​.pdf» no. */
  const slug = [String(row.direction), String(row.number), String(row.counterparty_name)]
    .join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  const headers = new Headers({
    'Content-Type': obj.contentType || 'application/pdf',
    'Content-Disposition': `inline; filename="${slug || 'fattura'}.pdf"`,
    'Cache-Control': 'private, no-store',
  })
  if (obj.contentLength) headers.set('Content-Length', String(obj.contentLength))
  return new Response(obj.body, { headers })
}

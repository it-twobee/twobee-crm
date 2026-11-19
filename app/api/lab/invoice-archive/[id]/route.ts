import { NextResponse } from 'next/server'
import { archiveUuid } from '@/lib/archived-invoice'
import { requireLabAdmin } from '@/lib/lab-guard'
import { requireEconomicsAdmin } from '@/lib/economics-guard'
import { readArchivedInvoicePdf } from '@/lib/lab-invoice-archive'
import { getObject } from '@/lib/storage/s3'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try { await requireLabAdmin(); await requireEconomicsAdmin() }
  catch { return NextResponse.json({ message: 'Accesso non consentito.' }, { status: 403 }) }
  if (!archiveUuid.test(params.id)) return NextResponse.json({ message: 'Documento non valido.' }, { status: 400 })

  try {
    const row = await readArchivedInvoicePdf(params.id)
    if (!row) return NextResponse.json({ message: 'PDF non disponibile.' }, { status: 404 })
    const pdf = await getObject(row.storage_key)
    return new Response(pdf.body, { headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="originale.pdf"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(pdf.contentLength != null ? { 'Content-Length': String(pdf.contentLength) } : {}),
    } })
  } catch {
    return NextResponse.json({ message: 'Originale non leggibile dall’archivio.' }, { status: 503 })
  }
}

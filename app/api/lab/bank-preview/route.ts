import { NextResponse } from 'next/server'
import { requireLabAdmin } from '@/lib/lab-guard'
import { readLabRows } from '@/lib/lab-read'
import { romeToday } from '@/lib/lab-bank'
import { parseStatement, buildImportRows } from '@/lib/bank-import'
export const dynamic = 'force-dynamic'
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
export async function POST(request: Request) {
  try { await requireLabAdmin() } catch { return response({ message: 'Accesso non consentito.' }, 403) }
  if (Number(request.headers.get('content-length') ?? 0) > 600000) return response({ message: 'File troppo grande: massimo 500 KB.' }, 413)
  try {
    const reader = request.body?.getReader()
    if (!reader) return response({ message: 'File non ricevuto.' }, 400)
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > 600000) { await reader.cancel(); return response({ message: 'File troppo grande: massimo 500 KB.' }, 413) }
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData()
    const file = form.get('file'), accountId = form.get('conto')
    if (!(file instanceof File) || file.size === 0 || file.size > 500000 || typeof accountId !== 'string') return response({ message: 'Scegli conto e file CSV/camt fino a 500 KB.' }, 400)
    const today = romeToday()
    const [accounts, existing] = await Promise.all([readLabRows('bank_accounts', 'id,label,currency', today), readLabRows('bank_transactions', 'id,account_id,source,import_hash', today)])
    const account = accounts.find(a => a.id === accountId && a.currency === 'EUR')
    if (!account) return response({ message: 'Conto EUR non disponibile.' }, 400)
    const parsed = parseStatement(await file.text())
    if (parsed.rows.length > 5000) return response({ message: 'Massimo 5.000 movimenti per anteprima: usa un periodo più breve.' }, 400)
    const own = existing.filter(t => t.account_id === accountId && t.source === 'banca')
    const rows = buildImportRows(accountId, parsed.rows, own.flatMap(t => typeof t.import_hash === 'string' ? [t.import_hash] : []))
    return response({ account: String(account.label), accountId, dialect: parsed.dialect, rows, skipped: parsed.skipped, ignored: parsed.ignored, declared: parsed.declared ?? null,
      withoutHash: own.filter(t => !t.import_hash).length, observedAt: new Date().toISOString() })
  } catch { return response({ message: 'Anteprima non disponibile: verifica il formato CSV/camt e riprova. Nessun dato è stato scritto.' }, 400) }
}

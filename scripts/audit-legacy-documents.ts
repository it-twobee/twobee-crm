/**
 * Audit READ-ONLY dei documenti legacy su storage (D10, Fase 5).
 *
 * Non cancella nulla. Conta e classifica le righe `documents` il cui file_url NON
 * è un link Google Drive: sono i file caricati sul bucket pubblico prima del
 * passaggio a Drive-only (§23). Serve a decidere, con i numeri in mano, cosa
 * ripulire — la cancellazione è irreversibile e va approvata a parte.
 *
 *   npx tsx scripts/audit-legacy-documents.ts
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (carica .env.local).')
  process.exit(1)
}

const isDrive = (u: string | null) => !!u && /(?:drive|docs)\.google\.com/.test(u)

async function main() {
  const sb = createClient(url!, key!, { auth: { persistSession: false } })

  const { data, error } = await sb
    .from('documents')
    .select('id, name, file_url, file_type, created_at, client:clients(company_name)')
    .order('created_at', { ascending: false })

  if (error) { console.error('Errore query:', error.message); process.exit(1) }

  const rows = (data ?? []) as unknown as {
    id: string; name: string; file_url: string; file_type: string | null
    created_at: string; client: { company_name: string } | null
  }[]

  const drive = rows.filter(r => isDrive(r.file_url))
  const legacy = rows.filter(r => !isDrive(r.file_url))
  const publicUrls = legacy.filter(r => r.file_url?.includes('/storage/v1/object/public/'))

  console.log('\n── Audit documenti ──────────────────────────────────────────')
  console.log(`Totale righe .............. ${rows.length}`)
  console.log(`Riferimenti Drive ......... ${drive.length}`)
  console.log(`Legacy (non Drive) ........ ${legacy.length}`)
  console.log(`  di cui URL pubblici ..... ${publicUrls.length}  ← esposti senza auth`)

  if (legacy.length === 0) {
    console.log('\nNessun documento legacy: la migrazione a Drive-only è completa.\n')
    return
  }

  const byClient = new Map<string, number>()
  for (const r of legacy) {
    const k = r.client?.company_name ?? '(senza cliente)'
    byClient.set(k, (byClient.get(k) ?? 0) + 1)
  }

  console.log('\nLegacy per cliente:')
  for (const [c, n] of Array.from(byClient.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(4)}  ${c}`)
  }

  console.log('\nPrimi 20 legacy:')
  for (const r of legacy.slice(0, 20)) {
    const pub = r.file_url?.includes('/public/') ? ' [PUBBLICO]' : ''
    console.log(`  ${r.created_at.slice(0, 10)}  ${r.client?.company_name ?? '—'}  ${r.name}${pub}`)
  }

  console.log('\nNessuna modifica effettuata (audit read-only).')
  console.log('Per la pulizia serve approvazione esplicita: è irreversibile.\n')
}

main().catch(e => { console.error(e); process.exit(1) })

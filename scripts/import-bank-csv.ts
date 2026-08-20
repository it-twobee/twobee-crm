/**
 * Importa un estratto conto CSV nel conto indicato.
 *
 *   npx tsx scripts/import-bank-csv.ts <file.csv> [etichetta-conto]
 *
 * Usa `classify` di `lib/bank.ts` — la stessa normalizzazione della UI — e la
 * stessa impronta di `importBankCsv`, quindi rilanciarlo non duplica niente.
 * Serve per i caricamenti massivi da terminale; dall'app si fa col pulsante.
 */
import { readFileSync } from 'fs'
import { parseStatement, buildImportRows, byFamily } from '@/lib/bank-import'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))

const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = {
  apikey: KEY, Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json', Prefer: 'return=representation',
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: H })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.status === 204 ? ([] as unknown as T) : (r.json() as Promise<T>)
}

async function main() {
  const file = process.argv[2]
  const wanted = process.argv[3]
  if (!file) throw new Error('uso: npx tsx scripts/import-bank-csv.ts <file.csv> [etichetta-conto]')

  const accounts = await api<{ id: string; label: string; is_primary: boolean }[]>(
    'bank_accounts?select=id,label,is_primary&is_active=eq.true&order=is_primary.desc')
  if (!accounts.length) throw new Error('nessun conto: esegui prima la 189')
  const account = wanted
    ? accounts.find(a => a.label.toLowerCase().includes(wanted.toLowerCase()))
    : accounts[0]
  if (!account) throw new Error(`conto «${wanted}» non trovato fra: ${accounts.map(a => a.label).join(', ')}`)

  const { dialect, rows: parsed, skipped } = parseStatement(readFileSync(file, 'utf8'))
  if (!parsed.length) throw new Error('nessun movimento riconosciuto')

  const have = await api<{ import_hash: string | null }[]>(
    `bank_transactions?select=import_hash&account_id=eq.${account.id}`)
  const rows = buildImportRows(
    account.id, parsed, have.map(r => r.import_hash).filter((h): h is string => !!h))
  const nuovi = rows.filter(r => !r.duplicate).map(({ duplicate: _, ...r }) => r)

  for (let i = 0; i < nuovi.length; i += 100) {
    await api('bank_transactions', { method: 'POST', body: JSON.stringify(nuovi.slice(i, i + 100)) })
  }

  console.log(`\n${account.label} · dialetto ${dialect}`)
  console.log(`  ${nuovi.length} movimenti importati su ${rows.length} letti`
    + ` · ${rows.length - nuovi.length} già presenti`
    + (skipped.length ? ` · ${skipped.length} scartati` : ''))
  for (const s2 of skipped.slice(0, 5)) console.log(`    scartata ${s2}`)

  const all = await api<{ amount: number; kind: string; counterparty: string | null; doc_ref: string | null }[]>(
    `bank_transactions?select=amount,kind,counterparty,doc_ref&account_id=eq.${account.id}`)
  const s = (f: (t: typeof all[number]) => boolean) =>
    all.filter(f).reduce((n, t) => n + Number(t.amount), 0)
  const eur = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  console.log(`  saldo ${eur(s(() => true))} · entrate ${eur(s(t => t.amount > 0))} · uscite ${eur(s(t => t.amount < 0))}`)

  const perKind: Record<string, number> = {}
  for (const t of all) perKind[t.kind] = (perKind[t.kind] ?? 0) + 1
  console.log('  per tipo:', Object.entries(perKind).map(([k, v]) => `${k} ${v}`).join(' · '))
  console.log(`  controparte riconosciuta su ${all.filter(t => t.counterparty).length} di ${all.length}`)

  // le famiglie di spesa: dicono se il conto fa il lavoro per cui è stato aperto
  const full = await api<{ amount: number; counterparty: string | null; description: string }[]>(
    `bank_transactions?select=amount,counterparty,description&account_id=eq.${account.id}`)
  const fam = byFamily(full)
  if (fam.length) {
    console.log('\n  uscite per famiglia di spesa:')
    for (const f of fam) {
      console.log(`    ${f.label.padEnd(28)} ${eur(f.total).padStart(10)}  ${f.count}×  ${f.names.slice(0, 3).join(', ')}`)
    }
  }
  console.log()
}

main().catch(e => { console.error(e.message); process.exit(1) })

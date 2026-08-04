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
import { classify } from '@/lib/bank'

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

  const csv = readFileSync(file, 'utf8')
  const lines = csv.split(/\r?\n/).filter(l => l.trim())
  const cell = (l: string) => l.split(';').map(c => c.replace(/^"|"$/g, '').trim())
  const head = cell(lines[0]).map(h => h.toLowerCase())
  const col = {
    booked: head.findIndex(h => h.includes('contabile')),
    value: head.findIndex(h => h.includes('valuta')),
    amount: head.findIndex(h => h.includes('importo')),
    causal: head.findIndex(h => h.includes('causale')),
    desc: head.findIndex(h => h.includes('descrizione')),
    channel: head.findIndex(h => h.includes('canale')),
  }
  if (col.booked < 0 || col.amount < 0 || col.desc < 0) {
    throw new Error('colonne non riconosciute: servono «Data contabile», «Importo», «Descrizione»')
  }

  const iso = (d: string) => {
    const [g, m, a] = d.split('/')
    return g && m && a ? `${a}-${m.padStart(2, '0')}-${g.padStart(2, '0')}` : null
  }
  const num = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'))

  const rows = lines.slice(1).map((l, i) => {
    const c = cell(l)
    const booked = iso(c[col.booked] ?? '')
    const amount = num(c[col.amount] ?? '')
    const desc = c[col.desc] ?? ''
    if (!booked || !Number.isFinite(amount) || !desc) return null
    const causal = col.causal >= 0 ? c[col.causal] || null : null
    const { kind, counterparty, docRef } = classify(desc, amount, causal)
    return {
      account_id: account.id, booked_on: booked,
      value_on: col.value >= 0 ? iso(c[col.value] ?? '') : booked,
      amount, causal_code: causal, description: desc,
      channel: col.channel >= 0 ? c[col.channel] || null : null,
      counterparty, kind, doc_ref: docRef, source: 'banca' as const,
      import_hash: `${account.id}|${booked}|${amount.toFixed(2)}|${causal ?? ''}|${desc.slice(0, 80)}|${i + 1}`,
    }
  }).filter(Boolean) as NonNullable<ReturnType<typeof Object>>[]

  const have = await api<{ import_hash: string }[]>(
    `bank_transactions?select=import_hash&account_id=eq.${account.id}`)
  const già = new Set(have.map(r => r.import_hash))
  const nuovi = rows.filter((r: { import_hash: string }) => !già.has(r.import_hash))

  for (let i = 0; i < nuovi.length; i += 100) {
    await api('bank_transactions', { method: 'POST', body: JSON.stringify(nuovi.slice(i, i + 100)) })
  }

  console.log(`\n${account.label}`)
  console.log(`  ${nuovi.length} movimenti importati su ${rows.length} letti · ${rows.length - nuovi.length} già presenti`)

  const all = await api<{ amount: number; kind: string; counterparty: string | null; doc_ref: string | null }[]>(
    `bank_transactions?select=amount,kind,counterparty,doc_ref&account_id=eq.${account.id}`)
  const s = (f: (t: typeof all[number]) => boolean) =>
    all.filter(f).reduce((n, t) => n + Number(t.amount), 0)
  const eur = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  console.log(`  saldo ${eur(s(() => true))} · entrate ${eur(s(t => t.amount > 0))} · uscite ${eur(s(t => t.amount < 0))}`)

  const perKind: Record<string, number> = {}
  for (const t of all) perKind[t.kind] = (perKind[t.kind] ?? 0) + 1
  console.log('  per tipo:', Object.entries(perKind).map(([k, v]) => `${k} ${v}`).join(' · '))
  console.log(`  numero fattura riconosciuto su ${all.filter(t => t.doc_ref).length} movimenti`)
  console.log(`  controparte riconosciuta su ${all.filter(t => t.counterparty).length} di ${all.length}\n`)
}

main().catch(e => { console.error(e.message); process.exit(1) })

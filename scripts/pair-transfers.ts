/**
 * Appaia i due lati di un giroconto fra conti propri.
 *
 *   npx tsx scripts/pair-transfers.ts [--prova] [giorni]
 *
 * Stessa regola del pulsante in Banca: `transferPairs` di `lib/bank.ts`, che
 * qui non è ricopiata — è importata. Il bonifico esce da un conto ed entra
 * nell'altro: senza appaiarli la liquidità totale sembra scendere e la lista
 * dei «da riconciliare» chiede due volte lo stesso fatto.
 */
import { readFileSync } from 'fs'
import { transferPairs } from '@/lib/bank'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
  })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.status === 204 ? (null as T) : r.json() as Promise<T>
}

async function main() {
  const prova = process.argv.includes('--prova')
  const days = Number(process.argv.slice(2).find(a => /^\d+$/.test(a)) ?? 4)

  const conti = await api<{ id: string; label: string }[]>('bank_accounts?select=id,label')
  const nome = new Map(conti.map(c => [c.id, c.label]))

  const list = await api<{
    id: string; account_id: string; booked_on: string; amount: number
    transfer_pair_id: string | null; transfer_account_id: string | null
  }[]>('bank_transactions?select=id,account_id,booked_on,amount,transfer_pair_id,transfer_account_id'
    + '&kind=eq.giroconto&transfer_pair_id=is.null')

  const coppie = transferPairs(list, days)
  console.log(`\n${list.length} giroconti senza coppia · ${coppie.length} appaiabili entro ${days} giorni${prova ? '  ⟨PROVA⟩' : ''}`)
  for (const { out: u, in: m } of coppie) {
    console.log(`  ${u.booked_on}  ${u.amount.toFixed(2).padStart(10)} da ${nome.get(u.account_id)}`)
    console.log(`  ${m.booked_on}  ${m.amount.toFixed(2).padStart(10)} a  ${nome.get(m.account_id)}`)
  }
  const soli = list.filter(t => !coppie.some(c => c.out.id === t.id || c.in.id === t.id))
  if (soli.length) {
    console.log(`\n  ${soli.length} restano soli (l'altro lato non c'è, o è fuori dai ${days} giorni):`)
    for (const t of soli) console.log(`    ${t.booked_on}  ${t.amount.toFixed(2).padStart(10)}  ${nome.get(t.account_id)}`)
  }
  if (prova) { console.log(); return }

  for (const { out: u, in: m } of coppie) {
    await api(`bank_transactions?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({
      transfer_pair_id: m.id, transfer_account_id: m.account_id, no_match_needed: true }) })
    await api(`bank_transactions?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({
      transfer_pair_id: u.id, transfer_account_id: u.account_id, no_match_needed: true }) })
  }
  console.log(`\n  ${coppie.length} coppie scritte.\n`)
}

main().catch(e => { console.error(e.message); process.exit(1) })

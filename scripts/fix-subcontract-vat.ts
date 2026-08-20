/**
 * §295 — L'IVA sui subappalti che ce l'hanno spenta.
 *
 *   npx tsx scripts/fix-subcontract-vat.ts            # dice cosa farebbe
 *   npx tsx scripts/fix-subcontract-vat.ts --apply    # scrive
 *
 * Una lavorazione affidata a un fornitore italiano **ha l'IVA**, e su un
 * subappalto quell'IVA è detraibile: `addProjectCost` la accende di default e
 * lo dichiara in un commento. Ma il piano del CRM di Seven — sette tranche
 * Affinity S.r.l. per 18.402,64 € — è nato prima di quel default e le ha tutte
 * spente, mentre lo **stesso fornitore** sull'ISF ce l'ha accesa. Le fatture
 * dicono chi ha ragione: FPR 7/26 è 2.459,33 + 540,67, FPR 11/26 è 2.672 + 587.
 *
 * Due conseguenze, e nessuna delle due si vede guardando il margine:
 *
 *   · **la cassa sottostima ogni tranche di ~588 €**, perché dal conto esce il
 *     lordo e il tool si aspetta l'imponibile;
 *   · **il credito IVA non arriva al trimestre**, quindi la liquidazione da
 *     versare risulta più alta del vero. Sul 3º trimestre, ancora da versare al
 *     16 novembre, è la differenza fra quello che si mette da parte e quello che
 *     il modello chiederà.
 *
 * Il margine **non cambia**: `actual` resta l'imponibile, ed è su quello che si
 * calcolano quote e provvigioni. Per questo la correzione tocca anche luglio,
 * che è chiuso: non riscrive un numero distribuito, aggiunge un credito IVA che
 * quel mese aveva e che nessuno aveva contato.
 */
import { readFileSync } from 'fs'
import { eur } from '@/lib/money'

const APPLY = process.argv.includes('--apply')

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

const RATE = 0.22

async function main() {
  console.log(`\n${APPLY ? 'CORREGGO' : 'ANTEPRIMA — non scrivo niente'}\n`)

  /* Solo i subappalti: una voce di piano con un progetto è una lavorazione
     affidata fuori, e quella ha una fattura di fornitore dietro. Le voci di
     struttura no — un forfettario fattura senza IVA, e accenderla lì
     inventerebbe un credito che non esiste. */
  const items = await api<{ id: string; label: string; amount: number; supplier: string | null }[]>(
    'cost_items?select=id,label,amount,supplier&project_id=not.is.null&vat_applied=eq.false')

  console.log(`── Voci di piano con l'IVA spenta: ${items.length}`)
  let piano = 0
  for (const i of items) {
    piano += Number(i.amount) * RATE
    console.log(`   ${eur(Number(i.amount)).padStart(11)} + ${eur(Number(i.amount) * RATE)} di IVA`
      + `  ${(i.supplier ?? '—').padEnd(16)} ${i.label.slice(0, 44)}`)
  }
  console.log(`   → ${eur(piano)} di IVA detraibile che il piano non conta\n`)

  const lines = await api<{ id: string; label: string; budget: number; actual: number; month_id: string; paid: boolean }[]>(
    'pl_cost_lines?select=id,label,budget,actual,month_id,paid&project_id=not.is.null&vat_applied=eq.false')
  const months = await api<{ id: string; month: string; status: string }[]>('pl_months?select=id,month,status')
  const M = new Map(months.map(m => [m.id, m]))

  console.log(`── Occorrenze già nel mese: ${lines.length}`)
  let mese = 0
  for (const l of lines) {
    const m = M.get(l.month_id)
    const net = Number(l.actual) > 0 ? Number(l.actual) : Number(l.budget)
    mese += net * RATE
    console.log(`   ${m?.month.slice(0, 7)} ${m?.status === 'chiuso' ? '[chiuso]' : '[aperto]'}`
      + ` ${eur(net).padStart(11)} → lordo ${eur(net * (1 + RATE))}`
      + `${l.paid ? ' · già pagata' : ''}  ${l.label.slice(0, 40)}`)
  }
  console.log(`   → ${eur(mese)} di credito IVA che i mesi non hanno\n`)

  if (!APPLY) {
    console.log('Rilancia con --apply per accendere l\'IVA su queste voci.\n')
    return
  }

  for (const i of items) {
    await api(`cost_items?id=eq.${i.id}`, {
      method: 'PATCH', body: JSON.stringify({ vat_applied: true, vat_rate: RATE }),
    })
  }
  for (const l of lines) {
    await api(`pl_cost_lines?id=eq.${l.id}`, {
      method: 'PATCH', body: JSON.stringify({ vat_applied: true, vat_rate: RATE }),
    })
  }
  console.log(`Fatto: ${items.length} voci di piano e ${lines.length} occorrenze.`)
  console.log('Il margine non cambia — l\'imponibile è lo stesso. Cambiano la cassa attesa e il credito IVA.\n')
}

main().catch(e => { console.error(e.message); process.exit(1) })

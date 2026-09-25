'use server'

/**
 * §450 — quello che la pagina «Carica documenti» scrive oltre agli import di
 * sempre: cedolini e F24 letti dal PDF, il pagamento dell'F24 visto in banca,
 * l'IBAN imparato da un estratto, e cosa è già stato caricato.
 *
 * Ogni azione passa da `requireEconomicsAdmin()`: il file esporta endpoint.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient, createActorClient } from '@/lib/supabase/admin'
import { requireEconomicsAdmin as requireAdmin } from '@/lib/economics-guard'
import { upsertF24, upsertPayslip } from '@/app/actions/payroll'
import { saveF24, markPaid } from '@/app/actions/f24'
import { check, movimentoDelModello, righeDalModello } from '@/lib/f24'
import { normIban } from '@/lib/carica'
import type { CampiCedolino, F24Letto } from '@/lib/pdf-paghe'

const r2 = (n: number) => Math.round(n * 100) / 100

function rev() {
  revalidatePath('/economics/carica')
  revalidatePath('/economics/personale')
  revalidatePath('/economics/fiscale')
  revalidatePath('/economics/banca')
}

/** I file già in archivio, per impronta: la pagina lo dice prima di ricaricarli. */
export async function documentiNoti(hashes: string[]): Promise<Record<string, { quando: string; esito: string | null }>> {
  await requireAdmin()
  const h = hashes.filter(x => /^[0-9a-f]{64}$/.test(x)).slice(0, 500)
  if (!h.length) return {}
  const { data, error } = await createAdminClient().from('economics_documents')
    .select('sha256, uploaded_at, esito').in('sha256', h)
  if (error) return {}
  return Object.fromEntries((data ?? []).map((d: { sha256: string; uploaded_at: string; esito: string | null }) =>
    [d.sha256, { quando: d.uploaded_at, esito: d.esito }]))
}

/**
 * Un cedolino letto dal PDF. Il client decide se si salva da solo (quadra al
 * centesimo) o dopo la conferma: qui si ricontrolla la quadratura sui campi che
 * arrivano, perché un corpo JSON si scrive a mano, e un cedolino che non quadra
 * passa solo con `confermato`.
 */
export async function salvaCedolino(input: { personId: string; mese: string; campi: CampiCedolino; confermato: boolean }) {
  await requireAdmin()
  const c = input.campi
  if (!/^\d{4}-\d{2}-01$/.test(input.mese)) throw new Error('Mese non valido')
  const atteso = r2(c.total_earnings - c.employee_contrib - c.irpef - c.surcharges - c.other_deductions + c.rounding)
  const quadra = Math.abs(atteso - c.net_paid) < 0.005
  if (!quadra && !input.confermato) throw new Error(`Il netto non quadra di ${r2(c.net_paid - atteso).toFixed(2)} €: va confermato`)
  const { data: p } = await createAdminClient().from('hr_people').select('id').eq('id', input.personId).maybeSingle()
  if (!p) throw new Error('Persona non trovata in organico')
  /* gli oneri del datore restano NULL: arrivano dall'F24, non dal cedolino (§235) */
  await upsertPayslip(input.personId, input.mese, { ...c, note: quadra ? 'Dal PDF del consulente' : 'Dal PDF del consulente, confermato a mano' })
  rev()
  return { quadra }
}

/**
 * Un F24 letto dal PDF. Due scritture, come quando lo si trascrive a mano: la
 * parte del personale nel suo `hr_f24` (§182) e il modello intero come
 * documento (§301), che si lega da sé al mese. **Non si segna versato**:
 * versato lo dice la banca (`pagaF24DaBanca`).
 */
export async function salvaF24Letto(f: F24Letto): Promise<{ gia: boolean; id: string | null; pagato: boolean }> {
  await requireAdmin()
  if (!f.scadenza) throw new Error('Il modello non dice la scadenza')
  if (!f.competenza) throw new Error('Il modello non dice il mese di riferimento')
  const lines = righeDalModello(f.righe, f.competenza)
  const c = check({ dueDate: f.scadenza, total: f.saldoFinale, lines })
  if (!c.ok) throw new Error(c.why)

  const admin = createAdminClient()
  const { data: stessi } = await admin.from('f24_documents').select('id, total').eq('due_date', f.scadenza)
  const gia = ((stessi ?? []) as { id: string; total: number }[]).find(d => Math.abs(Number(d.total) - f.saldoFinale) < 0.01)
  if (gia) return { gia: true, id: gia.id, pagato: false }

  const somma = (k: string[]) => r2(lines.filter(l => k.includes(l.kind)).reduce((s, l) => s + l.amount, 0))
  const ritenute = somma(['ritenute']), crediti = somma(['credito'])
  const inps = somma(['inps']), inail = somma(['inail'])
  await upsertF24(f.competenza, {
    erario_gross: ritenute, credit_offset: crediti, erario_balance: r2(ritenute - crediti),
    inps, inail, other: 0, total: r2(ritenute - crediti + inps + inail),
  })
  const doc = await saveF24({ dueDate: f.scadenza, paidOn: null, total: f.saldoFinale, note: 'Dal PDF del consulente', lines })
  const p = await pagaF24DaBanca()
  rev()
  return { gia: false, id: doc.id, pagato: p.docs.includes(doc.id) }
}

/**
 * I modelli non versati che la banca mostra pagati: un'uscita dello stesso
 * importo intorno alla scadenza, e una sola (`movimentoDelModello`). Si aggancia
 * il movimento al modello e il modello dice ai suoi domini la data.
 */
export async function pagaF24DaBanca(): Promise<{ fatti: number; docs: string[] }> {
  const uid = await requireAdmin()
  const admin = createAdminClient()
  const { data: docs, error } = await admin.from('f24_documents').select('id, due_date, total').is('paid_on', null)
  if (error || !docs?.length) return { fatti: 0, docs: [] }
  const date = (docs as { due_date: string }[]).map(d => String(d.due_date).slice(0, 10)).sort()
  const piu = (d: string, n: number) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10)
  const [{ data: txs }, { data: usati }] = await Promise.all([
    admin.from('bank_transactions').select('id, booked_on, amount, description')
      .lt('amount', 0).gte('booked_on', piu(date[0], -5)).lte('booked_on', piu(date[date.length - 1], 5)),
    admin.from('payment_allocations').select('tx_id').not('f24_id', 'is', null),
  ])
  const presi = new Set(((usati ?? []) as { tx_id: string }[]).map(u => u.tx_id))
  const fatti: string[] = []
  for (const d of docs as { id: string; due_date: string; total: number }[]) {
    const m = movimentoDelModello({ dueDate: String(d.due_date).slice(0, 10), total: Number(d.total) },
      ((txs ?? []) as { id: string; booked_on: string; amount: number }[]).map(t => ({ ...t, amount: Number(t.amount) })), presi)
    if (!m) continue
    const { error: e } = await createActorClient(uid).from('payment_allocations').insert({
      tx_id: m.id, f24_id: d.id, amount: Number(d.total), evidence: 'certificata', created_by: uid,
      note: 'F24 agganciato da solo: importo al centesimo intorno alla scadenza',
    })
    if (e) continue
    presi.add(m.id)
    await markPaid(d.id, m.booked_on)
    fatti.push(d.id)
  }
  if (fatti.length) rev()
  return { fatti: fatti.length, docs: fatti }
}

/** La prima volta che si sceglie il conto per un IBAN, il conto se lo ricorda. */
export async function ricordaIban(accountId: string, iban: string) {
  const uid = await requireAdmin()
  const i = normIban(iban)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(i)) return
  const { error } = await createActorClient(uid).from('bank_accounts')
    .update({ iban: i, updated_at: new Date().toISOString() }).eq('id', accountId).is('iban', null)
  if (error && error.code !== '42703') throw new Error(error.code === '23505' ? 'Questo IBAN è già di un altro conto' : error.message)
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { classify, type TxKind } from '@/lib/bank'

const PATH = '/economics/banca'

/** Il conto corrente è il dato più sensibile che ci sia: admin e basta. */
async function requireAdmin(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role, email').eq('id', user.id).single()
  const ok = p?.role === 'admin' || SUPER_ADMIN_EMAILS.includes(p?.email ?? '')
  if (!ok) throw new Error('Permesso negato: il conto corrente è riservato agli admin')
  return user.id
}

function rev() {
  revalidatePath(PATH)
  revalidatePath('/economics')
}

// ═══════════════════════════════════════════════════════════════════════════
// Import dell'estratto conto
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Legge il CSV della banca e ne scrive i movimenti.
 *
 * Idempotente per **impronta**: data, importo, causale, descrizione e posizione
 * nel file. Due bonifici identici nello stesso giorno esistono davvero — due rate
 * uguali a due fornitori diversi — quindi l'impronta include l'ordine di comparsa,
 * altrimenti il secondo verrebbe scartato come doppione.
 *
 * Il formato è quello dell'home banking italiano: punto e virgola, virgola
 * decimale, date in gg/mm/aaaa, importo firmato in un solo campo.
 */
export async function importBankCsv(accountId: string, csv: string): Promise<{
  letti: number; nuovi: number; duplicati: number; dal: string | null; al: string | null
}> {
  await requireAdmin()
  const admin = createAdminClient()

  const lines = csv.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) throw new Error('Il file è vuoto')

  const cell = (l: string) => l.split(';').map(c => c.replace(/^"|"$/g, '').trim())
  const head = cell(lines[0]).map(h => h.toLowerCase())
  const idx = {
    booked: head.findIndex(h => h.includes('contabile')),
    value: head.findIndex(h => h.includes('valuta')),
    amount: head.findIndex(h => h.includes('importo')),
    causal: head.findIndex(h => h.includes('causale')),
    desc: head.findIndex(h => h.includes('descrizione')),
    channel: head.findIndex(h => h.includes('canale')),
  }
  if (idx.booked < 0 || idx.amount < 0 || idx.desc < 0) {
    throw new Error('Colonne non riconosciute: servono «Data contabile», «Importo» e «Descrizione»')
  }

  const iso = (d: string) => {
    const [g, m, a] = d.split('/')
    return g && m && a ? `${a}-${m.padStart(2, '0')}-${g.padStart(2, '0')}` : null
  }
  const num = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'))

  type Row = {
    account_id: string; booked_on: string; value_on: string | null; amount: number
    causal_code: string | null; description: string; channel: string | null
    counterparty: string | null; kind: TxKind; doc_ref: string | null
    source: 'banca'; import_hash: string
  }
  const rows: Row[] = []
  for (let i = 1; i < lines.length; i++) {
    const c = cell(lines[i])
    const booked = iso(c[idx.booked] ?? '')
    const amount = num(c[idx.amount] ?? '')
    const desc = c[idx.desc] ?? ''
    if (!booked || !Number.isFinite(amount) || !desc) continue

    const causal = idx.causal >= 0 ? c[idx.causal] || null : null
    const { kind, counterparty, docRef } = classify(desc, amount, causal)
    rows.push({
      account_id: accountId, booked_on: booked,
      value_on: idx.value >= 0 ? iso(c[idx.value] ?? '') : booked,
      amount, causal_code: causal, description: desc,
      channel: idx.channel >= 0 ? c[idx.channel] || null : null,
      counterparty, kind, doc_ref: docRef, source: 'banca',
      // l'indice di riga rende distinguibili due movimenti identici nello stesso giorno
      import_hash: `${accountId}|${booked}|${amount.toFixed(2)}|${causal ?? ''}|${desc.slice(0, 80)}|${i}`,
    })
  }
  if (!rows.length) throw new Error('Nessun movimento riconosciuto nel file')

  const { data: have } = await admin.from('bank_transactions')
    .select('import_hash').eq('account_id', accountId).not('import_hash', 'is', null)
  const già = new Set((have ?? []).map((r: { import_hash: string }) => r.import_hash))
  const nuovi = rows.filter(r => !già.has(r.import_hash))

  for (let i = 0; i < nuovi.length; i += 100) {
    const { error } = await admin.from('bank_transactions').insert(nuovi.slice(i, i + 100))
    if (error) throw new Error(error.message)
  }

  const date = rows.map(r => r.booked_on).sort()
  rev()
  return {
    letti: rows.length, nuovi: nuovi.length, duplicati: rows.length - nuovi.length,
    dal: date[0] ?? null, al: date.at(-1) ?? null,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Riconciliazione
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggancia un movimento a una riga del conto economico.
 *
 * È qui che il conto corrente e il conto economico diventano una cosa sola: il
 * trigger della 189 spegne l'eventuale movimento «dichiarato» della stessa riga e
 * la marca incassata. Nessun aggancio avviene da sé: lo conferma una persona,
 * perché un abbinamento sbagliato dichiara pagata una fattura che nessuno ha
 * pagato — e quello è un errore che poi nessuno cerca.
 */
export async function reconcile(
  txId: string, target: { revenueLineId?: string | null; costLineId?: string | null },
) {
  const uid = await requireAdmin()
  const { error } = await createActorClient(uid).from('bank_transactions').update({
    revenue_line_id: target.revenueLineId ?? null,
    cost_line_id: target.costLineId ?? null,
    matched_at: new Date().toISOString(),
    matched_by: uid,
    no_match_needed: false,
  }).eq('id', txId)
  if (error) throw new Error(error.message)
  rev()
}

/** Sgancia: la riga torna da riconciliare e non risulta più pagata da qui. */
export async function unreconcile(txId: string) {
  const uid = await requireAdmin()
  const { error } = await createActorClient(uid).from('bank_transactions').update({
    revenue_line_id: null, cost_line_id: null, matched_at: null, matched_by: null,
  }).eq('id', txId)
  if (error) throw new Error(error.message)
  rev()
}

/**
 * «Questo non ha niente da riconciliare»: commissioni, bolli, giroconti.
 *
 * Serve perché la lista dei movimenti aperti resti una lista di cose da fare. Con
 * ventidue commissioni dentro, nessuno la guarda più.
 */
export async function markNoMatch(txId: string, value = true) {
  await requireAdmin()
  const { error } = await createAdminClient().from('bank_transactions')
    .update({ no_match_needed: value }).eq('id', txId)
  if (error) throw new Error(error.message)
  rev()
}

/** Categoria e controparte a mano, quando la descrizione della banca non basta. */
export async function updateTx(txId: string, patch: Partial<{
  kind: TxKind; counterparty: string | null; doc_ref: string | null; note: string | null
}>) {
  await requireAdmin()
  const { error } = await createAdminClient().from('bank_transactions')
    .update(patch).eq('id', txId)
  if (error) throw new Error(error.message)
  rev()
}

/** Un movimento che non passa dal conto: contanti, carta di un socio. */
export async function addManualTx(accountId: string, input: {
  booked_on: string; amount: number; description: string
  kind?: TxKind; counterparty?: string | null
}) {
  const uid = await requireAdmin()
  if (!input.description.trim()) throw new Error('Serve una descrizione')
  if (!Number.isFinite(input.amount) || input.amount === 0) throw new Error('Serve un importo diverso da zero')

  const auto = classify(input.description, input.amount)
  const { error } = await createAdminClient().from('bank_transactions').insert({
    account_id: accountId, booked_on: input.booked_on, value_on: input.booked_on,
    amount: input.amount, description: input.description.trim(),
    kind: input.kind ?? auto.kind,
    counterparty: input.counterparty ?? auto.counterparty,
    doc_ref: auto.docRef, source: 'manuale', created_by: uid,
  })
  if (error) throw new Error(error.message)
  rev()
}

export async function deleteTx(txId: string) {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: tx } = await admin.from('bank_transactions').select('source').eq('id', txId).single()
  /* Un movimento della banca non si cancella: è un fatto. Se è sbagliato, si
     corregge la classificazione o si rifà l'import. */
  if ((tx as { source?: string } | null)?.source === 'banca') {
    throw new Error('Un movimento dell\'estratto conto non si cancella: correggi la categoria o rifai l\'import')
  }
  const { error } = await admin.from('bank_transactions').delete().eq('id', txId)
  if (error) throw new Error(error.message)
  rev()
}

/** Il saldo di apertura del conto: senza, il saldo calcolato è relativo. */
export async function updateAccount(id: string, patch: Partial<{
  label: string; bank_name: string | null; iban_last4: string | null
  opening_balance: number; opening_date: string; note: string | null
}>) {
  await requireAdmin()
  const { error } = await createAdminClient().from('bank_accounts').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

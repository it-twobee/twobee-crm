'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { classify, type TxKind } from '@/lib/bank'
import { parseStatement, merchant } from '@/lib/bank-import'

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
  letti: number; nuovi: number; duplicati: number; scartati: number
  dal: string | null; al: string | null; dialetto: string
}> {
  await requireAdmin()
  const admin = createAdminClient()

  const { dialect, rows: parsed, skipped } = parseStatement(csv)
  if (!parsed.length) throw new Error('Nessun movimento riconosciuto nel file')

  const rows = parsed.map((p, i) => {
    /* Due sorgenti di verità sul «chi»: la banca che lo mette in chiaro (Vivid) e
       la descrizione da cui va estratto (home banking). Dove c'è il nome in chiaro
       si passa da `merchant`, che riconduce ventisei codici FACEBK a «Meta Ads». */
    const auto = classify(p.description, p.amount, p.causal_code)
    const named = p.counterparty_raw ? merchant(p.counterparty_raw) : null
    const counterparty = named?.name ?? auto.counterparty
    /* Un accredito dal proprio conto è un giroconto, non un incasso: senza questo
       la provvista di un conto spese risulterebbe fatturato. */
    const isOwnTransfer = /two bee/i.test(p.counterparty_raw ?? p.description)
    const kind: TxKind = isOwnTransfer ? 'giroconto'
      : named?.family === 'banca' ? 'commissione'
      : auto.kind

    return {
      account_id: accountId, booked_on: p.booked_on, value_on: p.value_on,
      amount: p.amount, causal_code: p.causal_code, description: p.description,
      channel: p.channel, counterparty, kind, doc_ref: auto.docRef,
      source: 'banca' as const,
      no_match_needed: isOwnTransfer || named?.family === 'banca',
      // l'indice di riga distingue due movimenti identici nello stesso giorno
      import_hash: `${accountId}|${p.booked_on}|${p.amount.toFixed(2)}|${p.causal_code ?? ''}|${p.description.slice(0, 80)}|${i + 1}`,
    }
  })

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
    scartati: skipped.length, dialetto: dialect,
    dal: date[0] ?? null, al: date.at(-1) ?? null,
  }
}

/**
 * Appaia i due lati di un giroconto fra conti propri.
 *
 * Il bonifico esce da un conto ed entra nell'altro: sono due movimenti dello
 * stesso fatto. Appaiarli serve a due cose — la liquidità totale non sembra
 * scendere, e la lista dei «da riconciliare» non li chiede entrambi. Si abbinano
 * per importo opposto e data vicina, che su un giroconto interno bastano: non
 * capita di girare la stessa cifra due volte nello stesso giorno fra gli stessi
 * due conti, e se capita si vede e si corregge a mano.
 */
export async function pairTransfers(days = 4): Promise<{ coppie: number }> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: txs } = await admin.from('bank_transactions')
    .select('id, account_id, booked_on, amount, kind, transfer_pair_id, transfer_account_id')
    .eq('kind', 'giroconto').is('transfer_pair_id', null)

  const list = (txs ?? []) as {
    id: string; account_id: string; booked_on: string; amount: number
    transfer_pair_id: string | null; transfer_account_id: string | null
  }[]
  const uscite = list.filter(t => t.amount < 0)
  const entrate = list.filter(t => t.amount > 0)
  const distanza = (a: string, b: string) =>
    Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000

  let coppie = 0
  const usate = new Set<string>()
  for (const u of uscite) {
    const match = entrate.find(e =>
      !usate.has(e.id) && e.account_id !== u.account_id
      && Math.abs(e.amount + u.amount) < 0.01 && distanza(e.booked_on, u.booked_on) <= days)
    if (!match) continue
    usate.add(match.id)
    await admin.from('bank_transactions').update({
      transfer_pair_id: match.id, transfer_account_id: match.account_id, no_match_needed: true,
    }).eq('id', u.id)
    await admin.from('bank_transactions').update({
      transfer_pair_id: u.id, transfer_account_id: u.account_id, no_match_needed: true,
    }).eq('id', match.id)
    coppie++
  }

  rev()
  return { coppie }
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

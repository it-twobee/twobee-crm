'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { classify, type TxKind } from '@/lib/bank'
import { parseStatement, merchant, treatment, FAMILY_LABEL, type SpendFamily } from '@/lib/bank-import'

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
  /** §191 — il bonifico ricorrente, quando si accetta quello suggerito */
  funding_amount: number | null; funding_day: number | null
}>) {
  await requireAdmin()
  const { error } = await createAdminClient().from('bank_accounts').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

// ═══════════════════════════════════════════════════════════════════════════
// §191 — Le spese dei soci diventano costi del mese
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Porta nel conto economico quello che i soci hanno speso dai loro sottoconti.
 *
 * È il passaggio che rende reale il vantaggio: finché la spesa sta solo sul
 * conto, la società non la porta a costo e non ne detrae l'IVA. Qui diventa una
 * riga di conto economico con `partner_id`, quindi:
 *
 *   · **non** entra fra i costi di struttura — quei soldi erano già stanziati nel
 *     30% di erogato, contarli anche lì li pagherebbe due volte;
 *   · **si sottrae** dall'erogato in denaro del socio;
 *   · porta la sua deducibilità e la sua IVA detraibile, per famiglia di spesa.
 *
 * Una riga per **socio e famiglia**, non per movimento: il trattamento fiscale è
 * per famiglia, e trentadue righe «Meta Ads» in un conto economico non si leggono.
 *
 * Idempotente e **non distruttiva**: se la riga c'è già ne aggiorna l'importo e
 * lascia stare le percentuali. Un admin che ha corretto a mano la deducibilità di
 * un pranzo — perché quella volta la fattura c'era — non se la vede riscrivere.
 */
export async function pushPartnerSpend(month: string): Promise<{
  righe: number; nuove: number; totale: number; movimenti: number
  perSocio: { label: string; spent: number; deducibile: number; iva: number }[]
  skipped: string[]
}> {
  await requireAdmin()
  const admin = createAdminClient()
  const first = `${month.slice(0, 7)}-01`
  const skipped: string[] = []

  const { data: mese } = await admin.from('pl_months').select('id').eq('month', first).maybeSingle()
  if (!mese) throw new Error(`Il mese ${first} non è ancora aperto nel conto economico`)
  const monthId = (mese as { id: string }).id

  const { data: subs } = await admin.from('bank_accounts')
    .select('id, label, owner_partner_id, owner_label, allowance_amount')
    .not('owner_partner_id', 'is', null).eq('is_active', true)
  const pockets = (subs ?? []) as {
    id: string; label: string; owner_partner_id: string
    owner_label: string | null; allowance_amount: number | null
  }[]
  if (!pockets.length) throw new Error('Nessun sottoconto socio: esegui la 191')

  const { data: centro } = await admin.from('cost_centers')
    .select('id').ilike('name', 'Spese soci').maybeSingle()
  const centerId = (centro as { id: string } | null)?.id ?? null
  if (!centerId) skipped.push('area «Spese soci» assente: le righe restano senza area')

  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
  const to = `${month.slice(0, 7)}-${String(last.getDate()).padStart(2, '0')}`
  const { data: txRows } = await admin.from('bank_transactions')
    .select('id, account_id, amount, counterparty, description, kind')
    .in('account_id', pockets.map(p => p.id))
    .gte('booked_on', first).lte('booked_on', to).lt('amount', 0)

  const txs = (txRows ?? []) as {
    id: string; account_id: string; amount: number
    counterparty: string | null; description: string; kind: string
  }[]

  const { data: esistenti } = await admin.from('pl_cost_lines')
    .select('id, label, actual, partner_id').eq('month_id', monthId).not('partner_id', 'is', null)
  const have = new Map(((esistenti ?? []) as { id: string; label: string; actual: number }[])
    .map(r => [r.label, r]))

  let nuove = 0, righe = 0, totale = 0, movimenti = 0
  const perSocio: { label: string; spent: number; deducibile: number; iva: number }[] = []

  for (const pocket of pockets) {
    const mine = txs.filter(t => t.account_id === pocket.id && t.kind !== 'giroconto')
    const who = pocket.owner_label ?? pocket.label
    if (!mine.length) { perSocio.push({ label: who, spent: 0, deducibile: 0, iva: 0 }); continue }

    // per famiglia: è il livello a cui il trattamento fiscale cambia
    const groups = new Map<SpendFamily, { total: number; ids: string[]; why: string; cost: number; vat: number }>()
    for (const t of mine) {
      const tr: { family: SpendFamily; cost: number; vat: number; why: string } =
        treatment(t.counterparty ?? t.description)
      const cur = groups.get(tr.family)
        ?? { total: 0, ids: [], why: tr.why, cost: tr.cost, vat: tr.vat }
      cur.total = Math.round((cur.total + Math.abs(t.amount)) * 100) / 100
      cur.ids.push(t.id)
      groups.set(tr.family, cur)
    }

    let spent = 0, deducibile = 0, iva = 0
    for (const family of Array.from(groups.keys())) {
      const g = groups.get(family)!
      const label = `${who} · ${FAMILY_LABEL[family]}`
      const found = have.get(label)
      spent += g.total
      deducibile += Math.round(g.total * g.cost * 100) / 100
      iva += Math.round((g.total * 0.22 / 1.22) * g.vat * 100) / 100
      movimenti += g.ids.length

      if (found) {
        // solo l'importo: le percentuali possono essere state corrette a mano
        if (Math.abs(Number(found.actual) - g.total) > 0.01) {
          await admin.from('pl_cost_lines').update({ actual: g.total, budget: g.total }).eq('id', found.id)
        }
        await admin.from('bank_transactions').update({ cost_line_id: found.id }).in('id', g.ids)
        righe++
        continue
      }

      const { data: ins, error } = await admin.from('pl_cost_lines').insert({
        month_id: monthId, center_id: centerId, partner_id: pocket.owner_partner_id,
        category: 'Spese soci', label, cost_type: 'V',
        budget: g.total, actual: g.total, paid: true,
        vat_applied: g.vat > 0, vat_rate: 0.22,
        deductible_pct: g.cost, vat_deductible_pct: g.vat,
        note: `${g.ids.length} movimenti dal sottoconto. ${g.why}`,
      }).select('id').single()
      if (error) { skipped.push(`${label}: ${error.message}`); continue }

      await admin.from('bank_transactions')
        .update({ cost_line_id: (ins as { id: string }).id }).in('id', g.ids)
      righe++; nuove++
    }

    totale += spent
    perSocio.push({
      label: who,
      spent: Math.round(spent * 100) / 100,
      deducibile: Math.round(deducibile * 100) / 100,
      iva: Math.round(iva * 100) / 100,
    })
  }

  revalidatePath('/economics')
  rev()
  return {
    righe, nuove, movimenti, skipped,
    totale: Math.round(totale * 100) / 100,
    perSocio: perSocio.sort((a, b) => b.spent - a.spent),
  }
}

/** La quota mensile di un socio: è erogato, non un costo in più. */
export async function setAllowance(accountId: string, amount: number | null) {
  await requireAdmin()
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    throw new Error('La quota non può essere negativa')
  }
  const { error } = await createAdminClient().from('bank_accounts')
    .update({ allowance_amount: amount, funding_amount: amount }).eq('id', accountId)
  if (error) throw new Error(error.message)
  rev()
}

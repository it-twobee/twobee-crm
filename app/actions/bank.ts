'use server'

import { createAdminClient, createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin as requireAdmin } from '@/lib/economics-guard'
import { classify, type TxKind } from '@/lib/bank'
import {
  parseStatement, merchant, treatment, FAMILY_LABEL, CHECK_FAMILIES, DEDUCTIBILITY,
  type SpendFamily,
} from '@/lib/bank-import'

const PATH = '/economics/banca'


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
 * Idempotente per **impronta**: conto, data, importo, causale e descrizione.
 * Due bonifici identici nello stesso giorno esistono davvero — due rate uguali a
 * due fornitori diversi — quindi l'impronta porta anche **quale occorrenza è**,
 * altrimenti il secondo verrebbe scartato come doppione.
 *
 * §210 — quel numero era la **posizione nel file**, e trasformava l'import in
 * un'operazione da fare una volta sola con attenzione: riscaricare un periodo
 * sovrapposto — «gli ultimi 90 giorni» ogni lunedì — dava a ogni movimento una
 * posizione diversa, quindi una impronta diversa, quindi un duplicato. Il saldo
 * si allontanava da quello vero proprio mentre lo si aggiornava. Adesso conta
 * **quante volte quel movimento esiste già**: il file può sovrapporsi quanto
 * vuole, entra solo quello che manca.
 */
export async function importBankCsv(accountId: string, csv: string): Promise<{
  letti: number; nuovi: number; duplicati: number; scartati: number
  dal: string | null; al: string | null; dialetto: string
  /** §277 — perché una riga è stata scartata: il conteggio da solo non si corregge */
  motivi: string[]
}> {
  await requireAdmin()
  const admin = createAdminClient()

  const { dialect, rows: parsed, skipped } = parseStatement(csv)
  if (!parsed.length) throw new Error('Nessun movimento riconosciuto nel file')

  /* Le impronte già in archivio, contate per movimento. L'ultimo campo è il
     numero di occorrenza, quindi il taglio è all'ultima barra — e regge anche se
     la descrizione ne contiene una. */
  const { data: have } = await admin.from('bank_transactions')
    .select('import_hash').eq('account_id', accountId).not('import_hash', 'is', null)
  const esistenti = (have ?? []).map((r: { import_hash: string }) => r.import_hash)
  const impronte = new Set(esistenti)
  const inArchivio = new Map<string, number>()
  for (const h of esistenti) {
    const fp = h.slice(0, h.lastIndexOf('|'))
    inArchivio.set(fp, (inArchivio.get(fp) ?? 0) + 1)
  }

  const consumate = new Map<string, number>()
  const rows = parsed.map(p => {
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

    const fp = `${accountId}|${p.booked_on}|${p.amount.toFixed(2)}|${p.causal_code ?? ''}|${p.description.slice(0, 80)}`
    const vista = (consumate.get(fp) ?? 0) + 1
    consumate.set(fp, vista)
    // già in archivio tante volte quante ne ho viste finora: è la stessa, non una nuova
    const doppione = vista <= (inArchivio.get(fp) ?? 0)

    /* Il numero libero, non `vista`: le righe importate prima del §210 portano
       ancora la posizione nel file, e `fp|2` potrebbe essere occupato da un
       movimento diverso. Cercarlo evita di sbattere contro il vincolo unico. */
    let n = vista
    while (!doppione && impronte.has(`${fp}|${n}`)) n++
    const import_hash = `${fp}|${n}`
    if (!doppione) impronte.add(import_hash)

    return {
      account_id: accountId, booked_on: p.booked_on, value_on: p.value_on,
      amount: p.amount, causal_code: p.causal_code, description: p.description,
      channel: p.channel, counterparty, kind, doc_ref: auto.docRef,
      source: 'banca' as const,
      no_match_needed: isOwnTransfer || named?.family === 'banca',
      import_hash,
      doppione,
    }
  })

  const nuovi = rows.filter(r => !r.doppione).map(({ doppione: _, ...r }) => r)

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
    motivi: skipped.slice(0, 3),
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

/**
 * Divide una spesa fra più soci.
 *
 * Serve per quello che è uscito **prima** che i sottoconti esistessero, e per le
 * spese comuni: una cena con un cliente a cui c'erano tutti e tre non è di
 * nessuno in particolare. L'importo si divide in parti uguali e diventa una riga
 * di costo per ciascuno, con la deducibilità della sua famiglia.
 *
 * I movimenti divisi **non si agganciano** a una riga sola: `cost_line_id` è un
 * legame uno-a-uno, e puntarne uno di tre direbbe una cosa falsa. Si marcano
 * «niente da riconciliare» con scritto fra chi sono stati divisi, che è quello
 * che effettivamente è successo.
 */
export async function splitSpendToPartners(
  txIds: string[], partnerIds: string[], month: string,
): Promise<{ righe: number; totale: number; perSocio: { label: string; amount: number }[] }> {
  await requireAdmin()
  const admin = createAdminClient()
  if (!txIds.length) throw new Error('Nessun movimento selezionato')
  if (!partnerIds.length) throw new Error('Nessun socio selezionato')

  const first = `${month.slice(0, 7)}-01`
  const { data: mese } = await admin.from('pl_months').select('id').eq('month', first).maybeSingle()
  if (!mese) throw new Error(`Il mese ${first} non è ancora aperto nel conto economico`)
  const monthId = (mese as { id: string }).id

  const { data: soci } = await admin.from('pl_partners').select('id, label').in('id', partnerIds)
  const partners = (soci ?? []) as { id: string; label: string }[]
  if (partners.length !== partnerIds.length) throw new Error('Qualche socio non esiste più')

  const { data: txRows } = await admin.from('bank_transactions')
    .select('id, amount, counterparty, description').in('id', txIds).lt('amount', 0)
  const txs = (txRows ?? []) as {
    id: string; amount: number; counterparty: string | null; description: string
  }[]
  if (!txs.length) throw new Error('I movimenti selezionati non sono uscite')

  const { data: centro } = await admin.from('cost_centers')
    .select('id').ilike('name', 'Spese soci').maybeSingle()
  const centerId = (centro as { id: string } | null)?.id ?? null

  /* Quota per socio e famiglia. L'ultimo prende il resto dell'arrotondamento:
     tre parti da 174,00 su 522,00 tornano, ma su 91,00 no — e la differenza deve
     stare da qualche parte, non sparire. */
  const perGroup = new Map<string, {
    partner: { id: string; label: string }; family: SpendFamily
    total: number; cost: number; vat: number; why: string; count: number
  }>()
  for (const t of txs) {
    const tr: { family: SpendFamily; cost: number; vat: number; why: string } =
      treatment(t.counterparty ?? t.description)
    const importo = Math.abs(t.amount)
    const quota = Math.round((importo / partners.length) * 100) / 100
    partners.forEach((p, i) => {
      const share = i === partners.length - 1
        ? Math.round((importo - quota * (partners.length - 1)) * 100) / 100
        : quota
      const key = `${p.id}|${tr.family}`
      const cur = perGroup.get(key)
        ?? { partner: p, family: tr.family, total: 0, cost: tr.cost, vat: tr.vat, why: tr.why, count: 0 }
      cur.total = Math.round((cur.total + share) * 100) / 100
      cur.count += 1
      perGroup.set(key, cur)
    })
  }

  const { data: esistenti } = await admin.from('pl_cost_lines')
    .select('id, label, actual').eq('month_id', monthId).not('partner_id', 'is', null)
  const have = new Map(((esistenti ?? []) as { id: string; label: string; actual: number }[])
    .map(r => [r.label, r]))

  let righe = 0, totale = 0
  const perSocio = new Map<string, number>()
  for (const key of Array.from(perGroup.keys())) {
    const g = perGroup.get(key)!
    const label = `${g.partner.label} · ${FAMILY_LABEL[g.family]}`
    const found = have.get(label)
    totale += g.total
    perSocio.set(g.partner.label, Math.round(((perSocio.get(g.partner.label) ?? 0) + g.total) * 100) / 100)

    if (found) {
      await admin.from('pl_cost_lines')
        .update({ actual: g.total, budget: g.total }).eq('id', found.id)
    } else {
      await admin.from('pl_cost_lines').insert({
        month_id: monthId, center_id: centerId, partner_id: g.partner.id,
        category: 'Spese soci', label, cost_type: 'V',
        budget: g.total, actual: g.total, paid: true,
        vat_applied: g.vat > 0, vat_rate: 0.22,
        deductible_pct: g.cost, vat_deductible_pct: g.vat,
        note: `Quota di ${g.count} spese divise fra ${partners.map(p => p.label).join(', ')}. ${g.why}`,
      })
    }
    righe++
  }

  await admin.from('bank_transactions').update({
    no_match_needed: true,
    note: `Divisa fra ${partners.map(p => p.label).join(', ')}`,
  }).in('id', txs.map(t => t.id))

  revalidatePath('/economics')
  rev()
  return {
    righe, totale: Math.round(totale * 100) / 100,
    perSocio: Array.from(perSocio, ([label, amount]) => ({ label, amount })),
  }
}

/**
 * La fattura del socio per la parte di erogato che non è uscita come spesa.
 *
 * Le due strade non sono equivalenti e la scelta va fatta ogni mese. La spesa dal
 * sottoconto porta a costo quello che comunque si sarebbe speso, ma **con la
 * deducibilità della sua famiglia**: un pranzo vale il 75% e non recupera IVA. La
 * fattura del socio è deducibile per intero e l'IVA si detrae tutta, ma sposta
 * l'imposta sulla persona, che su quell'importo paga le sue.
 *
 * Il tool non sceglie: mostra i due numeri e registra la decisione. Quello che
 * impedisce è pagare due volte — la fattura copre solo quello che **non** è già
 * uscito come spesa.
 */
export async function registerPartnerInvoice(
  month: string, partnerId: string, amount: number, ref?: string | null,
): Promise<{ id: string; amount: number }> {
  await requireAdmin()
  const admin = createAdminClient()
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Serve un importo maggiore di zero')

  const first = `${month.slice(0, 7)}-01`
  const { data: mese } = await admin.from('pl_months').select('id').eq('month', first).maybeSingle()
  if (!mese) throw new Error(`Il mese ${first} non è ancora aperto nel conto economico`)
  const monthId = (mese as { id: string }).id

  const { data: socio } = await admin.from('pl_partners').select('label').eq('id', partnerId).single()
  const label = `${(socio as { label: string }).label} · Compenso fatturato`

  const { data: centro } = await admin.from('cost_centers')
    .select('id').ilike('name', 'Spese soci').maybeSingle()

  const { data: found } = await admin.from('pl_cost_lines')
    .select('id').eq('month_id', monthId).eq('label', label).maybeSingle()

  const row = {
    month_id: monthId, center_id: (centro as { id: string } | null)?.id ?? null,
    /* Categoria diversa dalla spesa: sono due modi di far uscire lo stesso
       erogato, con due trattamenti fiscali diversi, e vanno letti separati. */
    partner_id: partnerId, category: 'Compenso soci', label, cost_type: 'F' as const,
    budget: amount, actual: amount, paid: false,
    // compenso professionale: deducibile per intero, IVA interamente detraibile
    vat_applied: true, vat_rate: 0.22, deductible_pct: 1, vat_deductible_pct: 1,
    note: ref ? `Fattura ${ref}` : 'Compenso soci, fattura da ricevere',
  }

  if (found) {
    const id = (found as { id: string }).id
    const { error } = await admin.from('pl_cost_lines')
      .update({ budget: amount, actual: amount, note: row.note }).eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath('/economics'); rev()
    return { id, amount }
  }

  const { data: ins, error } = await admin.from('pl_cost_lines').insert(row).select('id').single()
  if (error) throw new Error(error.message)
  revalidatePath('/economics'); rev()
  return { id: (ins as { id: string }).id, amount }
}

/**
 * Porta nel conto economico le spese di un conto che il piano non prevede.
 *
 * Il piano dei costi conosce i canoni: ads, software, hosting. Non conosce la cena
 * col cliente di giovedì, il pieno per andare a Salerno, la risma di carta — e
 * quelle sono **costi della società** come gli altri: se non entrano nel conto
 * economico non si deducono e la loro IVA non si recupera.
 *
 * Perciò si portano dentro solo le famiglie **fuori piano** (`CHECK_FAMILIES` +
 * materiale d'ufficio): advertising, software e hosting hanno già la loro riga a
 * piano, e aggiungerne una seconda dal movimento bancario conterebbe due volte
 * lo stesso costo. Quelle si riconciliano, non si duplicano.
 *
 * **Non sono erogato dei soci.** Una cena aziendale con un cliente è un costo
 * dell'azienda, e attribuirla a un socio gli abbasserebbe il compenso per un
 * lavoro che ha fatto per l'azienda. L'erogato passa dai sottoconti dedicati
 * (`pushPartnerSpend`), e la differenza è il conto da cui il denaro esce.
 *
 * `overrides` rimappa una famiglia su un'altra quando il descrittore della carta
 * mente: «CONAD» dice supermercato, ma quella volta erano fogli e toner. Lo dice
 * una persona — indovinarlo qui vorrebbe dire dedurre la spesa di casa.
 */
export async function pushAccountSpend(accountId: string, month: string, overrides?: {
  from: SpendFamily[]; to: SpendFamily
}): Promise<{
  righe: number; nuove: number; totale: number; deducibile: number; iva: number
  movimenti: number; gruppi: { label: string; total: number; pct: number }[]
}> {
  await requireAdmin()
  const admin = createAdminClient()

  const first = `${month.slice(0, 7)}-01`
  const { data: mese } = await admin.from('pl_months').select('id').eq('month', first).maybeSingle()
  if (!mese) throw new Error(`Il mese ${first} non è ancora aperto nel conto economico`)
  const monthId = (mese as { id: string }).id

  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
  const to = `${month.slice(0, 7)}-${String(last.getDate()).padStart(2, '0')}`
  const { data: txRows } = await admin.from('bank_transactions')
    .select('id, amount, counterparty, description, kind')
    .eq('account_id', accountId).gte('booked_on', first).lte('booked_on', to).lt('amount', 0)

  const fuoriPiano: SpendFamily[] = [...CHECK_FAMILIES, 'ufficio']
  const remap = (f: SpendFamily): SpendFamily =>
    overrides && overrides.from.includes(f) ? overrides.to : f

  const groups = new Map<SpendFamily, {
    total: number; count: number; cost: number; vat: number; why: string
  }>()
  const usati: string[] = []
  for (const t of ((txRows ?? []) as {
    id: string; amount: number; counterparty: string | null; description: string; kind: string
  }[])) {
    if (t.kind === 'giroconto') continue
    const tr: { family: SpendFamily; cost: number; vat: number; why: string } =
      treatment(t.counterparty ?? t.description)
    const family = remap(tr.family)
    if (!fuoriPiano.includes(family)) continue
    const reg = DEDUCTIBILITY[family]
    const cur = groups.get(family)
      ?? { total: 0, count: 0, cost: reg.cost, vat: reg.vat, why: reg.why }
    cur.total = Math.round((cur.total + Math.abs(t.amount)) * 100) / 100
    cur.count += 1
    groups.set(family, cur)
    usati.push(t.id)
  }
  if (!groups.size) throw new Error('Nessuna spesa fuori piano in questo mese')

  const { data: centro } = await admin.from('cost_centers')
    .select('id').ilike('name', 'Sede & Overhead').maybeSingle()
  const centerId = (centro as { id: string } | null)?.id ?? null

  const { data: esistenti } = await admin.from('pl_cost_lines')
    .select('id, label, actual').eq('month_id', monthId).is('partner_id', null)
  const have = new Map(((esistenti ?? []) as { id: string; label: string; actual: number }[])
    .map(r => [r.label, r]))

  let righe = 0, nuove = 0, totale = 0, deducibile = 0, iva = 0
  const gruppi: { label: string; total: number; pct: number }[] = []

  for (const family of Array.from(groups.keys())) {
    const g = groups.get(family)!
    const label = FAMILY_LABEL[family]
    totale += g.total
    deducibile += Math.round(g.total * g.cost * 100) / 100
    // l'IVA sta dentro l'importo pagato con la carta: si scorpora
    iva += Math.round((g.total * 0.22 / 1.22) * g.vat * 100) / 100
    gruppi.push({ label, total: g.total, pct: g.cost })

    const found = have.get(label)
    if (found) {
      if (Math.abs(Number(found.actual) - g.total) > 0.01) {
        await admin.from('pl_cost_lines').update({ actual: g.total, budget: g.total }).eq('id', found.id)
      }
      righe++
      continue
    }
    const { error } = await admin.from('pl_cost_lines').insert({
      month_id: monthId, center_id: centerId, category: 'Spese fuori piano',
      label, cost_type: 'V', budget: g.total, actual: g.total, paid: true,
      vat_applied: g.vat > 0, vat_rate: 0.22,
      deductible_pct: g.cost, vat_deductible_pct: g.vat,
      note: `${g.count} movimenti dal conto. ${g.why}`,
    })
    if (error) throw new Error(error.message)
    righe++; nuove++
  }

  // i movimenti sono contabilizzati in aggregato: non restano «da riconciliare»
  if (usati.length) {
    await admin.from('bank_transactions')
      .update({ no_match_needed: true }).in('id', usati)
  }

  revalidatePath('/economics')
  rev()
  return {
    righe, nuove, movimenti: usati.length,
    totale: Math.round(totale * 100) / 100,
    deducibile: Math.round(deducibile * 100) / 100,
    iva: Math.round(iva * 100) / 100,
    gruppi: gruppi.sort((a, b) => b.total - a.total),
  }
}

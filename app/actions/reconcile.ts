'use server'

import { createAdminClient, createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin as requireAdmin } from '@/lib/economics-guard'
import { usedByTx } from '@/lib/tx-links'

/**
 * §254 — La riconciliazione è **molti a uno**, non uno a uno.
 *
 * Fin qui un movimento si agganciava a una riga e basta. Sui dati veri quella
 * forma non esiste quasi mai: il conto economico è fatto di voci mensili e la
 * banca di addebiti singoli. «Advertising online» è **una** riga nel mese e
 * **ventidue** movimenti sul conto; le commissioni bancarie sono trentaquattro
 * movimenti da un euro e mezzo e **zero** righe. Su 59 movimenti liberi, 57 non
 * avevano nessuna riga con quell'importo — non perché mancasse la riga, ma
 * perché nessun singolo movimento vale quanto lei.
 *
 * Tre forme, e sono la stessa operazione vista da tre lati:
 *
 *   1. **N movimenti → una riga** (`attachMany`): i ventidue Meta di luglio
 *      sull'unica riga della pubblicità. La riga risulta pagata quando la somma
 *      la **copre**, non al primo movimento: dichiararla pagata a un ventesimo
 *      del suo valore è peggio che lasciarla scoperta.
 *   2. **Un movimento → più fatture**: già in Banca, e resta lì — il verso
 *      giusto per quella domanda è dal movimento.
 *   3. **Una riga che non esiste ancora** (`createCostFromTx`): dal movimento
 *      si crea la voce di costo già compilata. È il caso delle commissioni e dei
 *      bolli, che a piano non ci sono e non ci saranno mai.
 */
function rev(month?: string) {
  revalidatePath('/economics')
  revalidatePath('/economics/banca')
  revalidatePath('/economics/prospetto')
  if (month) revalidatePath(`/economics?m=${month}`)
}

const r2 = (n: number) => Math.round(n * 100) / 100

const grossOfLine = (l: Record<string, unknown>, kind: 'ricavo' | 'costo') => {
  const net = kind === 'ricavo'
    ? Number(l.amount_net ?? 0)
    : (Number(l.actual ?? 0) || Number(l.budget ?? 0))
  const rate = kind === 'ricavo' ? Number(l.vat_rate ?? 0) : (l.vat_applied ? Number(l.vat_rate ?? 0) : 0)
  return r2(net * (1 + rate))
}

/**
 * §261 — Agganciare **una quota**, non il movimento intero.
 *
 * `attachMany` prende il movimento e lo dà tutto a una riga: giusto per i
 * ventisei addebiti Meta, sbagliato per il verso opposto — la fattura 36 di
 * Fatima Leo è 3.812,50 € e dentro ci sono due righe, growth 1.830 e marketing
 * 1.982,50. Finché l'unico gesto era «prendilo tutto», la prima riga se lo
 * portava via e la seconda restava spuntata senza prova (§226), con una nota a
 * spiegarlo.
 *
 * Qui ogni movimento dà alla riga **quello che le manca** e tiene libero il
 * resto, che resta visibile e si aggancia alla riga sorella. Le colonne vecchie
 * si scrivono solo se erano vuote: rubarle a un'altra riga romperebbe il trigger
 * della 189 e la certificazione della 226, che leggono quelle.
 */
async function allocateToLine(
  uid: string, lineId: string, kind: 'ricavo' | 'costo', txIds: string[],
): Promise<{ agganciati: number; saltati: number; coperto: number; lordo: number }> {
  const admin = createAdminClient()
  const db = createActorClient(uid)
  const table = kind === 'ricavo' ? 'pl_revenue_lines' : 'pl_cost_lines'
  const field = kind === 'ricavo' ? 'revenue_line_id' : 'cost_line_id'

  const { data: line } = await admin.from(table).select('*').eq('id', lineId).maybeSingle()
  if (!line) throw new Error('Riga non trovata')
  const lordo = grossOfLine(line as Record<string, unknown>, kind)

  const { data: txs } = await admin.from('bank_transactions')
    .select('id, amount, source, revenue_line_id, cost_line_id').in('id', txIds)
  const buoni = (txs ?? []).filter((t: Record<string, unknown>) =>
    t.source === 'banca' || t.source === 'manuale')
  if (!buoni.length) throw new Error('Nessuno dei movimenti scelti è passato da un conto')

  const somma = (rows: Record<string, unknown>[]) =>
    r2(rows.reduce((s, a) => s + Math.abs(Number(a.amount ?? 0)), 0))

  const { data: sullaRiga } = await admin.from('bank_tx_lines').select('amount').eq(field, lineId)
  let coperto = somma(sullaRiga ?? [])

  /* Quanto di ciascun movimento è già speso — con la **stessa** regola che usa
     la pagina per proporlo (§261, `usedByTx`): un'allocazione più grande della
     riga che descrive non è denaro speso, e se qui la si contasse per intero
     l'azione salterebbe proprio i candidati che l'elenco ha appena offerto. */
  const { data: altrove } = await admin.from('bank_tx_lines')
    .select('tx_id, revenue_line_id, cost_line_id, amount')
    .in('tx_id', buoni.map((t: Record<string, unknown>) => String(t.id)))
  const righeToccate = (altrove ?? []) as Record<string, unknown>[]
  const revIds = righeToccate.filter(a => a.revenue_line_id).map(a => String(a.revenue_line_id))
  const costIds = righeToccate.filter(a => a.cost_line_id).map(a => String(a.cost_line_id))
  const [{ data: revL }, { data: costL }] = await Promise.all([
    revIds.length
      ? admin.from('pl_revenue_lines').select('id, amount_net, vat_rate').in('id', revIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    costIds.length
      ? admin.from('pl_cost_lines').select('id, actual, budget, vat_applied, vat_rate').in('id', costIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const lordoDi = new Map<string, number>()
  for (const r of (revL ?? []) as Record<string, unknown>[]) lordoDi.set(String(r.id), grossOfLine(r, 'ricavo'))
  for (const c of (costL ?? []) as Record<string, unknown>[]) lordoDi.set(String(c.id), grossOfLine(c, 'costo'))
  const speso = usedByTx(
    righeToccate.map(a => ({
      txId: String(a.tx_id), lineId: String(a.revenue_line_id ?? a.cost_line_id ?? ''),
      amount: Number(a.amount ?? 0),
    })),
    id => lordoDi.get(id))
  const usato = (id: string) => speso.get(id) ?? 0

  let agganciati = 0, saltati = 0
  for (const t of buoni) {
    const id = String((t as { id: string }).id)
    const libero = r2(Math.abs(Number((t as { amount: number }).amount ?? 0)) - usato(id))
    const manca = r2(lordo - coperto)
    /* Zero non è un aggancio: un movimento già speso altrove, o una riga già
       coperta, non devono lasciare una riga di allocazione da zero euro che poi
       nessuno sa leggere. */
    const quota = r2(Math.min(libero, manca))
    if (quota <= 0.01) {
      /* Già su questa riga non è «saltato»: non c'è niente da aggiungere, e
         dirlo come uno scarto manderebbe a cercare un problema che non c'è. */
      const giàQui = righeToccate.some(a =>
        String(a.tx_id) === id && String(a[field] ?? '') === lineId)
      if (giàQui) agganciati++
      else saltati++
      continue
    }

    const { error } = await admin.from('bank_tx_lines').insert({
      tx_id: id, [field]: lineId, amount: quota, created_by: uid,
      note: quota < libero - 0.01 || usato(id) > 0.01
        ? 'Quota di un pagamento che copre più righe (§261)' : null,
    })
    if (error && !String(error.message).includes('duplicate')) throw new Error(error.message)
    coperto = r2(coperto + quota)
    agganciati++

    /* Il legame principale è ancora la colonna, e la si scrive solo se libera:
       il primo che arriva la tiene, gli altri vivono nell'allocazione. */
    const tx = t as Record<string, unknown>
    if (!tx.revenue_line_id && !tx.cost_line_id) {
      await db.from('bank_transactions').update({
        [field]: lineId, matched_at: new Date().toISOString(), matched_by: uid, no_match_needed: false,
      }).eq('id', id)
    }
  }

  return { agganciati, saltati, coperto, lordo }
}

export type AttachResult = {
  agganciati: number
  /** quanto coprono, in tutto, i movimenti attaccati a questa riga */
  coperto: number
  /** il lordo della riga: è quello che devono coprire */
  lordo: number
  /** true = la riga è stata marcata pagata perché la somma la copre */
  pagata: boolean
}

/**
 * Aggancia N movimenti a **una** riga.
 *
 * La riga si marca pagata solo quando la somma dei movimenti veri copre il suo
 * lordo (con la tolleranza di un centesimo per gli arrotondamenti). Non è
 * pignoleria: una riga da 900 € marcata pagata dal primo addebito da 2 € sparisce
 * dagli scoperti portandosi via 898 € che devono ancora uscire.
 */
export async function attachMany(
  lineId: string, kind: 'ricavo' | 'costo', txIds: string[],
): Promise<AttachResult> {
  const uid = await requireAdmin()
  if (!txIds.length) throw new Error('Nessun movimento selezionato')
  const db = createActorClient(uid)
  const admin = createAdminClient()

  const table = kind === 'ricavo' ? 'pl_revenue_lines' : 'pl_cost_lines'
  const field = kind === 'ricavo' ? 'revenue_line_id' : 'cost_line_id'

  const { data: line } = await admin.from(table).select('*').eq('id', lineId).maybeSingle()
  if (!line) throw new Error('Riga non trovata')
  const l = line as Record<string, unknown>
  const net = kind === 'ricavo'
    ? Number(l.amount_net ?? 0)
    : (Number(l.actual ?? 0) || Number(l.budget ?? 0))
  const rate = kind === 'ricavo' ? Number(l.vat_rate ?? 0) : (l.vat_applied ? Number(l.vat_rate ?? 0) : 0)
  const lordo = r2(net * (1 + rate))

  /* Si aggancia solo quello che è **passato davvero**: `banca` e `manuale`. Un
     `derivato` nasce dalla spunta che questo aggancio serve a dimostrare, e
     usarlo farebbe confermare a un'affermazione se stessa (§189). */
  const { data: txs } = await admin.from('bank_transactions')
    .select('id, amount, source, revenue_line_id, cost_line_id').in('id', txIds)
  const buoni = (txs ?? []).filter((t: Record<string, unknown>) =>
    t.source === 'banca' || t.source === 'manuale')
  if (!buoni.length) throw new Error('Nessuno dei movimenti scelti è passato da un conto')

  for (const t of buoni) {
    const id = String((t as { id: string }).id)
    const { error } = await db.from('bank_transactions').update({
      [field]: lineId,
      [kind === 'ricavo' ? 'cost_line_id' : 'revenue_line_id']: null,
      matched_at: new Date().toISOString(), matched_by: uid, no_match_needed: false,
    }).eq('id', id)
    if (error) throw new Error(error.message)
    /* §261 — l'allocazione va scritta anche qui, con l'importo intero che è la
       semantica di questo gesto: senza, il movimento risulterebbe **libero** e
       si riproporrebbe come candidato su un'altra riga, che è il doppio conteggio
       che `bank_tx_lines` esiste per impedire. */
    const { error: e2 } = await admin.from('bank_tx_lines').insert({
      tx_id: id, [field]: lineId, created_by: uid,
      amount: r2(Math.abs(Number((t as { amount: number }).amount ?? 0))),
    })
    if (e2 && !String(e2.message).includes('duplicate')) throw new Error(e2.message)
  }

  /* Quanto copre **tutto** quello che ora punta a questa riga, non solo quello
     appena aggiunto: agganciare il ventiduesimo Meta deve chiudere la riga, e
     per saperlo bisogna risommare i ventuno di prima. */
  const { data: tutti } = await admin.from('bank_transactions')
    .select('amount, source').eq(field, lineId)
  const coperto = r2((tutti ?? [])
    .filter((t: Record<string, unknown>) => t.source === 'banca' || t.source === 'manuale')
    .reduce((s: number, t: Record<string, unknown>) => s + Math.abs(Number(t.amount ?? 0)), 0))

  const pagata = lordo > 0 && coperto >= lordo - 0.01
  if (pagata && l.paid !== true) {
    await admin.from(table).update({ paid: true }).eq('id', lineId)
  }

  rev()
  return { agganciati: buoni.length, coperto, lordo, pagata }
}

/** Sgancia tutti i movimenti da una riga, e la riga torna scoperta. */
export async function detachAll(lineId: string, kind: 'ricavo' | 'costo') {
  const uid = await requireAdmin()
  const field = kind === 'ricavo' ? 'revenue_line_id' : 'cost_line_id'
  const table = kind === 'ricavo' ? 'pl_revenue_lines' : 'pl_cost_lines'
  const db = createActorClient(uid)
  const { error } = await db.from('bank_transactions')
    .update({ [field]: null, matched_at: null, matched_by: null }).eq(field, lineId)
  if (error) throw new Error(error.message)
  /* §261 — anche le quote: un'allocazione rimasta su una riga sganciata tiene
     occupato un movimento che nessuno vede più, e da lì in poi quel bonifico
     risulta speso senza che una riga lo dica. */
  await createAdminClient().from('bank_tx_lines').delete().eq(field, lineId)
  await createAdminClient().from(table).update({ paid: false }).eq('id', lineId)
  rev()
}

/**
 * §254/3 — La voce che non esiste ancora, creata dal movimento.
 *
 * Le commissioni bancarie, i bolli, un addebito che nessuno aveva previsto: a
 * piano non ci sono e non ci saranno mai, e finché l'unico modo di agganciarli
 * era trovare una riga esistente restavano scoperti per sempre. Qui la riga
 * nasce **dal movimento**, quindi con l'importo giusto per definizione, e il
 * movimento le si aggancia nello stesso gesto.
 *
 * L'importo è **lordo di quello che è uscito**: da un movimento non si sa
 * quanta IVA c'era dentro, e inventarne una scorporerebbe un credito che
 * nessuna fattura dimostra. Se poi la fattura arriva, si corregge dalla riga.
 */
export async function createCostFromTx(input: {
  txIds: string[]
  month: string
  category: string
  label?: string
}): Promise<{ lineId: string; importo: number }> {
  const uid = await requireAdmin()
  const admin = createAdminClient()
  if (!input.txIds.length) throw new Error('Nessun movimento selezionato')

  const { data: monthRow } = await admin.from('pl_months')
    .select('id, status').eq('month', input.month).maybeSingle()
  if (!monthRow) throw new Error('Apri prima il mese dal conto economico')
  if ((monthRow as { status: string }).status === 'chiuso') {
    throw new Error('Il mese è chiuso: riaprilo per aggiungere una voce')
  }

  const { data: txs } = await admin.from('bank_transactions')
    .select('id, amount, source, counterparty, description, booked_on').in('id', input.txIds)
  const buoni = (txs ?? []).filter((t: Record<string, unknown>) =>
    (t.source === 'banca' || t.source === 'manuale') && Number(t.amount ?? 0) < 0)
  if (!buoni.length) throw new Error('Servono movimenti in uscita passati da un conto')

  const importo = r2(buoni.reduce((s: number, t: Record<string, unknown>) =>
    s + Math.abs(Number(t.amount ?? 0)), 0))
  /* Il nome lo porta il movimento: «Commissioni bonifici» con dentro
     trentaquattro addebiti si ritrova, «Voce nuova» no. */
  const label = input.label?.trim()
    || String(buoni[0].counterparty ?? buoni[0].description ?? 'Spesa')
      .slice(0, 60) + (buoni.length > 1 ? ` (${buoni.length} movimenti)` : '')

  const { data: center } = await admin.from('cost_centers')
    .select('id').eq('name', input.category).maybeSingle()

  const { data: row, error } = await admin.from('pl_cost_lines').insert({
    month_id: monthRow.id,
    center_id: (center as { id: string } | null)?.id ?? null,
    category: input.category,
    label,
    cost_type: 'V',
    budget: 0,
    actual: importo,
    paid: true,
    vat_applied: false,
    note: `Creata da ${buoni.length} moviment${buoni.length === 1 ? 'o' : 'i'} di banca (§254)`,
  }).select('id').single()
  if (error) throw new Error(error.message)

  const lineId = String((row as { id: string }).id)
  const db = createActorClient(uid)
  for (const t of buoni) {
    await db.from('bank_transactions').update({
      cost_line_id: lineId, matched_at: new Date().toISOString(), matched_by: uid,
      no_match_needed: false,
    }).eq('id', String((t as { id: string }).id))
  }

  rev(input.month)
  return { lineId, importo }
}

/**
 * §255 — Le commissioni sono **una** voce, non trentaquattro.
 *
 * Un bonifico costa un euro e mezzo. In cinque mesi sono trentaquattro addebiti,
 * e ognuno di loro, preso da solo, non merita una riga: una lettura per area con
 * dentro trentaquattro voci da 1,50 € è una lettura che nessuno apre più. Ma
 * insieme fanno un numero vero, e soprattutto **esistono**: finché restavano
 * fuori dal conto economico, il ponte con la banca non poteva chiudere.
 *
 * Una riga al mese, nell'area «Banca», con tutti gli addebiti di quel mese
 * attaccati. Rilanciarla non ne crea una seconda: se la riga c'è già si
 * aggiungono solo i movimenti nuovi e l'importo si aggiorna — perché è la somma
 * di quello che è attaccato, non un numero scritto a parte.
 */
/* Non esportata: un file `'use server'` esporta **endpoint**, e ogni export
   diventa una funzione richiamabile dal browser. Una costante non lo è, e Next
   rifiuta il file intero. Serve solo qui, come valore di partenza. */
const COMMISSION_KINDS = ['commissione', 'imposta']

export async function groupCommissions(month: string, kinds = COMMISSION_KINDS): Promise<{
  righe: number; movimenti: number; importo: number
}> {
  const uid = await requireAdmin()
  const admin = createAdminClient()
  const db = createActorClient(uid)

  const { data: monthRow } = await admin.from('pl_months')
    .select('id, status').eq('month', month).maybeSingle()
  if (!monthRow) throw new Error('Apri prima il mese dal conto economico')
  if ((monthRow as { status: string }).status === 'chiuso') {
    throw new Error('Il mese è chiuso: riaprilo per aggiungere una voce')
  }

  const from = month.slice(0, 10)
  const to = `${month.slice(0, 8)}31`
  const { data: txs } = await admin.from('bank_transactions')
    .select('id, amount, kind, source, cost_line_id, revenue_line_id')
    .gte('booked_on', from).lte('booked_on', to)

  const mine = (txs ?? []).filter((t: Record<string, unknown>) =>
    kinds.includes(String(t.kind))
    && (t.source === 'banca' || t.source === 'manuale')
    && Number(t.amount ?? 0) < 0
    && !t.revenue_line_id)
  if (!mine.length) return { righe: 0, movimenti: 0, importo: 0 }

  const LABEL = 'Commissioni e oneri bancari'
  const { data: exists } = await admin.from('pl_cost_lines')
    .select('id').eq('month_id', monthRow.id).eq('label', LABEL).maybeSingle()

  let lineId = (exists as { id: string } | null)?.id ?? null
  if (!lineId) {
    const { data: center } = await admin.from('cost_centers')
      .select('id').eq('name', 'Banca').maybeSingle()
    const { data: row, error } = await admin.from('pl_cost_lines').insert({
      month_id: monthRow.id,
      center_id: (center as { id: string } | null)?.id ?? null,
      category: 'Banca', label: LABEL, cost_type: 'V',
      budget: 0, actual: 0, paid: true, vat_applied: false,
      note: 'Somma degli addebiti bancari del mese (§255): una voce, non trentaquattro',
    }).select('id').single()
    if (error) throw new Error(error.message)
    lineId = String((row as { id: string }).id)
  }

  const nuovi = mine.filter((t: Record<string, unknown>) => String(t.cost_line_id ?? '') !== lineId)
  for (const t of nuovi) {
    await db.from('bank_transactions').update({
      cost_line_id: lineId, matched_at: new Date().toISOString(), matched_by: uid,
      no_match_needed: false,
    }).eq('id', String((t as { id: string }).id))
  }

  /* L'importo è la **somma di quello che è attaccato**, non un numero scritto a
     parte: se domani se ne aggancia un altro, la riga vale di più senza che
     nessuno debba ricordarsi di aggiornarla. */
  const { data: tutti } = await admin.from('bank_transactions')
    .select('amount, source').eq('cost_line_id', lineId)
  const importo = r2((tutti ?? [])
    .filter((t: Record<string, unknown>) => t.source === 'banca' || t.source === 'manuale')
    .reduce((s: number, t: Record<string, unknown>) => s + Math.abs(Number(t.amount ?? 0)), 0))
  await admin.from('pl_cost_lines').update({ actual: importo, paid: true }).eq('id', lineId)

  rev(month)
  return { righe: exists ? 0 : 1, movimenti: nuovi.length, importo }
}

/**
 * §258 — Un movimento su più righe.
 *
 * `attachMany` fa il verso molti-a-uno: N addebiti su una riga. Questo fa
 * l'altro — **un** bonifico spalmato su N righe, ognuna con la sua quota — e
 * insieme coprono tutti i casi veri: iCura che paga due mensilità in 8.784 €,
 * Fatima Leo che paga growth e marketing in 3.812,50.
 *
 * La quota si può non passarla: `spread` la calcola dando a ogni riga quello
 * che le manca, **dalla più vecchia** — un pagamento chiude l'arretrato più
 * antico (§227). Quello che avanza resta libero sul movimento e si vede, invece
 * di essere spinto dentro una riga che non lo vale.
 */
export async function splitTx(input: {
  txId: string
  kind: 'ricavo' | 'costo'
  /** le righe su cui spalmare; senza `amount` la quota la calcola `spread` */
  targets: { lineId: string; amount?: number }[]
}): Promise<{ allocate: number; distribuito: number; libero: number }> {
  const uid = await requireAdmin()
  const admin = createAdminClient()
  const { spread, txUse } = await import('@/lib/tx-links')

  const { data: tx } = await admin.from('bank_transactions')
    .select('id, amount, source, booked_on').eq('id', input.txId).maybeSingle()
  if (!tx) throw new Error('Movimento non trovato')
  const t = tx as { amount: number; source: string; booked_on: string }
  if (t.source === 'derivato') {
    throw new Error('Un pagamento dichiarato non è passato da nessun conto: non si può spalmare')
  }
  const totale = Math.abs(Number(t.amount))

  const table = input.kind === 'ricavo' ? 'pl_revenue_lines' : 'pl_cost_lines'
  const field = input.kind === 'ricavo' ? 'revenue_line_id' : 'cost_line_id'
  const ids = input.targets.map(x => x.lineId)
  const { data: lines } = await admin.from(table).select('*').in('id', ids)
  if (!lines?.length) throw new Error('Nessuna riga trovata')

  const grossOf = (l: Record<string, unknown>) => {
    const net = input.kind === 'ricavo'
      ? Number(l.amount_net ?? 0)
      : (Number(l.actual ?? 0) || Number(l.budget ?? 0))
    const rate = input.kind === 'ricavo'
      ? Number(l.vat_rate ?? 0)
      : (l.vat_applied ? Number(l.vat_rate ?? 0) : 0)
    return r2(net * (1 + rate))
  }

  /* Quanto è già coperto da altri movimenti: senza, `spread` darebbe a una riga
     già pagata la sua quota una seconda volta. */
  const { data: giàAlloc } = await admin.from('bank_tx_lines')
    .select('tx_id, revenue_line_id, cost_line_id, amount').in(field, ids)
  const covertoOf = (id: string) => r2((giàAlloc ?? [])
    .filter((a: Record<string, unknown>) => String(a[field]) === id && String(a.tx_id) !== input.txId)
    .reduce((s2: number, a: Record<string, unknown>) => s2 + Math.abs(Number(a.amount ?? 0)), 0))

  const manuali = input.targets.filter(x => x.amount != null)
  const quote = manuali.length === input.targets.length
    ? { allocs: input.targets.map(x => ({ lineId: x.lineId, amount: r2(Number(x.amount)) })), left: 0 }
    : spread(totale, (lines as Record<string, unknown>[]).map(l => ({
        lineId: String(l.id), gross: grossOf(l), covered: covertoOf(String(l.id)),
        month: String(l.month_id ?? ''),
      })))

  const somma = r2(quote.allocs.reduce((s2, a) => s2 + a.amount, 0))
  if (somma > totale + 0.01) {
    throw new Error(`Le quote fanno ${somma.toFixed(2)} € e il movimento è ${totale.toFixed(2)} €: `
      + 'un bonifico non può pagare più di quello che vale')
  }

  for (const a of quote.allocs) {
    const { error } = await admin.from('bank_tx_lines').insert({
      tx_id: input.txId, [field]: a.lineId, amount: a.amount, created_by: uid,
      note: `Quota di un pagamento su ${quote.allocs.length} righe (§258)`,
    })
    if (error && !String(error.message).includes('duplicate')) throw new Error(error.message)

    /* La riga si marca pagata quando **tutte** le allocazioni la coprono, non
       perché una quota le è arrivata: è la stessa regola di `attachMany`. */
    const line = (lines as Record<string, unknown>[]).find(l => String(l.id) === a.lineId)!
    if (r2(covertoOf(a.lineId) + a.amount) >= grossOf(line) - 0.01) {
      await admin.from(table).update({ paid: true, paid_on: t.booked_on.slice(0, 10) }).eq('id', a.lineId)
    }
  }

  /* Il legame principale resta la colonna, e punta alla **prima** riga: la
     leggono il trigger della 189, la certificazione della 226 e tre pagine.
     Toglierla qui vorrebbe dire riscriverle tutte in una volta. */
  await createActorClient(uid).from('bank_transactions').update({
    [field]: quote.allocs[0]?.lineId ?? null,
    matched_at: new Date().toISOString(), matched_by: uid, no_match_needed: false,
  }).eq('id', input.txId)

  const { data: dopo } = await admin.from('bank_tx_lines')
    .select('tx_id, amount').eq('tx_id', input.txId)
  const uso = txUse(input.txId, totale, (dopo ?? []).map((a: Record<string, unknown>) => ({
    txId: String(a.tx_id), lineId: '', amount: Number(a.amount ?? 0) })))

  rev()
  return { allocate: quote.allocs.length, distribuito: uso.used, libero: uso.free }
}

/**
 * §259 — Spuntare «pagato» è un gesto solo, e deve chiudere tutto.
 *
 * Finora la casella scriveva un booleano. Da lì nascevano tre buchi che ho
 * passato una serata a ricucire a mano: la riga risultava pagata **senza una
 * data** (e allora la cassa non sapeva in che mese metterla), **senza un
 * movimento** (e allora era un'opinione, §226) e **senza una fattura** (e allora
 * l'IVA non si detraeva e nessuno se ne accorgeva).
 *
 * Adesso la spunta apre una domanda sola con tre risposte, e le scrive insieme.
 * Non è un passaggio in più: è lo stesso lavoro fatto una volta invece che tre
 * volte in tre schermate diverse.
 *
 * `paidOn` è **obbligatoria**. Una spunta senza data è il difetto originale:
 * senza, il mese di cassa se lo inventa il tool guardando la scadenza.
 */
export async function confirmPayment(input: {
  lineId: string
  kind: 'ricavo' | 'costo'
  paidOn: string
  txIds?: string[]
  invoiceId?: string | null
}): Promise<{ coperto: number; lordo: number; pagata: boolean; saltati: number }> {
  const uid = await requireAdmin()
  const admin = createAdminClient()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) {
    throw new Error('Serve la data del pagamento: senza, la cassa non sa in che mese metterlo')
  }
  const table = input.kind === 'ricavo' ? 'pl_revenue_lines' : 'pl_cost_lines'

  /* Prima i movimenti: se l'aggancio fallisce non deve restare una riga marcata
     pagata da niente — è esattamente lo stato da cui stiamo uscendo. */
  let coperto = 0, lordo = 0, saltati = 0
  if (input.txIds?.length) {
    /* §261 — a quota, non a movimento intero: il bonifico cumulativo dà a questa
       riga quello che le manca e resta disponibile per la sorella. */
    const r = await allocateToLine(uid, input.lineId, input.kind, input.txIds)
    coperto = r.coperto; lordo = r.lordo; saltati = r.saltati
  }
  /* La fattura può stare su più righe: la 36 di Fatima Leo copre growth e
     marketing, e chiedere un documento per riga vorrebbe dire inventarlo. */
  if (input.invoiceId) {
    await admin.from(table).update({ invoice_id: input.invoiceId }).eq('id', input.lineId)
  }
  const { error } = await admin.from(table)
    .update({ paid: true, paid_on: input.paidOn }).eq('id', input.lineId)
  if (error) throw new Error(error.message)

  rev()
  return { coperto, lordo, pagata: true, saltati }
}

/**
 * Togliere la spunta è l'operazione gemella, e deve **disfare tutto**: la data,
 * il pagato e gli agganci. Lasciare i movimenti attaccati a una riga che non
 * risulta più pagata è lo stato peggiore di tutti — la riga torna fra gli
 * scoperti e il movimento resta occupato, quindi non si può usare altrove.
 */
export async function undoPayment(lineId: string, kind: 'ricavo' | 'costo') {
  await requireAdmin()
  const table = kind === 'ricavo' ? 'pl_revenue_lines' : 'pl_cost_lines'
  await detachAll(lineId, kind)
  const { error } = await createAdminClient().from(table)
    .update({ paid: false, paid_on: null }).eq('id', lineId)
  if (error) throw new Error(error.message)
  rev()
}

/**
 * §276 — Confermare in blocco gli abbinamenti che non richiedono un giudizio.
 *
 * Non è una riconciliazione automatica: la conferma è la stessa di sempre,
 * chiesta **una volta invece che venti**, e riguarda solo le coppie che la
 * regola dichiara certe — importo lordo esatto, nome che torna, e nessuna
 * ambiguità in nessuna delle due direzioni (`lib/auto-match.ts`).
 *
 * La regola si **rilegge qui dal database**: l'elenco che il browser ha visto
 * poteva essere di dieci minuti fa, e nel frattempo qualcuno può aver spuntato
 * una riga o agganciato quel movimento. Chi arriva secondo non deve poter
 * disfare il lavoro del primo, e non deve nemmeno saperlo: le coppie che non
 * sono più certe semplicemente non ci sono.
 */
export async function confirmSureMatches(): Promise<{
  fatti: number; importo: number; saltati: number
}> {
  const uid = await requireAdmin()
  const admin = createAdminClient()
  const { sureMatches } = await import('@/lib/auto-match')

  const [{ data: months }, { data: txs }, { data: clients }] = await Promise.all([
    admin.from('pl_months').select('id, month'),
    admin.from('bank_transactions')
      .select('id, account_id, booked_on, amount, description, counterparty, kind, doc_ref, source, no_match_needed, revenue_line_id, cost_line_id'),
    admin.from('clients').select('id, display_name, company_name'),
  ])
  const monthOf = new Map((months ?? []).map((m: Record<string, unknown>) =>
    [String(m.id), String(m.month).slice(0, 10)]))
  const nameOf = new Map((clients ?? []).map((c: Record<string, unknown>) =>
    [String(c.id), String(c.display_name || c.company_name || '')]))

  const [{ data: revLines }, { data: costLines }] = await Promise.all([
    admin.from('pl_revenue_lines').select('id, month_id, label, client_id, amount_net, vat_rate, paid')
      .eq('paid', false),
    admin.from('pl_cost_lines').select('id, month_id, label, note, actual, budget, vat_applied, vat_rate, paid')
      .eq('paid', false),
  ])
  const n2 = (v: unknown) => Number(v ?? 0)
  const lines = [
    ...(revLines ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id), month: monthOf.get(String(r.month_id)) ?? '', label: String(r.label),
      clientName: nameOf.get(String(r.client_id ?? '')) ?? null,
      net: n2(r.amount_net), vatRate: n2(r.vat_rate), paid: false, direction: 'in' as const,
    })),
    ...(costLines ?? []).map((c: Record<string, unknown>) => ({
      id: String(c.id), month: monthOf.get(String(c.month_id)) ?? '', label: String(c.label),
      clientName: (c.note as string) ?? null,
      net: n2(c.actual) > 0 ? n2(c.actual) : n2(c.budget),
      vatRate: c.vat_applied ? n2(c.vat_rate) : 0, paid: false, direction: 'out' as const,
    })),
  ].filter(l => l.month && l.net > 0)

  const { pairs } = sureMatches((txs ?? []) as never, lines as never)

  let fatti = 0, saltati = 0, importo = 0
  for (const p of pairs) {
    try {
      /* Stessa strada della conferma singola (§261): quota, allocazione, colonna
         se libera. La data è quella del **movimento**, non di oggi: è il giorno
         in cui i soldi si sono mossi, ed è quello che decide il mese di cassa. */
      const r = await allocateToLine(uid, p.lineId, p.kind, [p.txId])
      if (!r.agganciati) { saltati++; continue }
      const table = p.kind === 'ricavo' ? 'pl_revenue_lines' : 'pl_cost_lines'
      await admin.from(table).update({ paid: true, paid_on: p.date }).eq('id', p.lineId)
      fatti++
      importo = r2(importo + Math.abs(p.amount))
    } catch { saltati++ }
  }

  rev()
  return { fatti, importo, saltati }
}

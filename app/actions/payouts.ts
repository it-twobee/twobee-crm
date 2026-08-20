'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin as requireAdmin } from '@/lib/economics-guard'
import { monthLabel } from '@/lib/pl'
import { syncPayouts, loadWindow } from '@/lib/payouts-plan'
import { allocate } from '@/app/actions/allocations'

/**
 * §243 — I compensi come righe che si possono spuntare.
 *
 * Il piano compensi si **ricalcola** a ogni lettura (§227), e va bene finché la
 * domanda è «quanto spetta». Quando la domanda diventa «l'ho pagato?» serve una
 * riga: una spunta ha bisogno di qualcosa su cui stare, e dedurre l'erogato dai
 * bonifici (§226) non basta — un bonifico a un socio che è anche commerciale
 * non dice quale dei due lavori sta pagando.
 *
 * Come per le entrate, **l'importo si copia**: un mese chiuso deve restare
 * quello che era anche se domani una rata si sposta. Rigenerare aggiorna solo le
 * righe **non ancora pagate**: quello che è uscito è un fatto, e un fatto non si
 * riscrive perché la base di calcolo è cambiata dopo.
 */
function rev(month: string) {
  revalidatePath('/economics')
  revalidatePath('/economics/prospetto')
  revalidatePath(`/economics?m=${month}`)
}

export async function materializePayouts(month: string) {
  await requireAdmin()
  const out = await syncPayouts(createAdminClient(), month)
  rev(month)
  return out
}

/**
 * §286 — La data in cui si eroga quello che è maturato in questo mese.
 *
 * Normalmente è il 20; ad agosto 2026 si è anticipata al 13, ed è esattamente
 * il genere di eccezione che senza un posto dove scriverla diventa un totale
 * che nessuno sa più ricostruire. Spostarla **cambia la base**: rientra o esce
 * quello che è stato incassato in mezzo, quindi si ricalcola subito — le righe
 * già pagate restano dove sono, perché quel bonifico è un fatto.
 */
export async function setMonthPayoutDate(month: string, date: string | null) {
  await requireAdmin()
  const db = createAdminClient()
  const iso = date ? date.slice(0, 10) : null
  if (iso && !/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Data non valida')

  const { data: row } = await db.from('pl_months').select('id').eq('month', month).maybeSingle()
  if (!row) throw new Error('Mese non trovato')
  const { error } = await db.from('pl_months').update({ payout_date: iso }).eq('id', row.id)
  if (error) throw new Error(error.message)

  const { data: existing } = await db.from('pl_payouts')
    .select('id').eq('month_id', row.id).limit(1)
  rev(month)
  if (existing?.length) return materializePayouts(month)
  return null
}

/**
 * §286 — L'erogazione spiegata prima di premere.
 *
 * «Genera i compensi» su una base che nessuno vede è il modo in cui si firma un
 * bonifico sbagliato: la finestra si dichiara — quali mesi guarda, entro quale
 * data, quanto è rientrato e quanto no — e solo dopo si scrive.
 */
export async function previewPayouts(month: string) {
  await requireAdmin()
  const { w, t, summary, taken } = await loadWindow(createAdminClient(), month)
  return {
    window: w,
    label: `${monthLabel(month)} · erogazione del ${w.date.split('-').reverse().join('/')}`,
    righe: taken.length,
    imponibile: summary.taken.amount,
    scoperto: summary.open,
    prossima: summary.next,
    presunte: summary.assumed.n,
    soci: t.perPartner.map(p => ({ label: p.partner.label, amount: p.total })),
    commerciali: t.salesByOwner.map(s => ({ label: s.label, amount: s.amount })),
  }
}

/**
 * La spunta. La data la scrive il trigger con **oggi** (§224): chiederla a mano
 * significa averla sbagliata la metà delle volte, e toglierla la porta via.
 */
export async function setPayoutPaid(id: string, paid: boolean, month: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('pl_payouts').update({ paid }).eq('id', id)
  if (error) throw new Error(error.message)
  rev(month)
}

/** La data si può correggere: il bonifico può essere di ieri. */
export async function setPayoutDate(id: string, paidOn: string | null, month: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('pl_payouts')
    .update({ paid_on: paidOn, paid: !!paidOn }).eq('id', id)
  if (error) throw new Error(error.message)
  rev(month)
}

/**
 * §251 — L'importo deciso a mano.
 *
 * Il piano calcola una percentuale; una **scelta strategica** è per definizione
 * fuori dalla formula. A giugno 2026 Marco e Toto hanno preso 3.000 € a testa
 * invece della loro quota, e senza un posto dove scriverlo quel numero sarebbe
 * rimasto solo in banca — dove un bonifico non dice se paga la quota, la
 * provvigione, o una decisione presa in riunione.
 *
 * Due garanzie, o diventerebbe un modo per far tornare i conti a mano:
 *
 * **La riga dichiara di essere stata decisa**, e conserva quanto diceva il
 * piano. Un numero scritto sopra un calcolo, senza il calcolo accanto, è un
 * numero che nessuno può più contestare.
 *
 * **Rigenerare non lo cancella**: `materializePayouts` salta le righe pagate, e
 * da qui in poi anche quelle decise a mano. Il piano non deve poter riscrivere
 * una decisione presa da una persona.
 */
export async function setPayoutAmount(id: string, amount: number, why: string, month: string) {
  await requireAdmin()
  const db = createAdminClient()
  const { data: cur } = await db.from('pl_payouts')
    .select('amount, note, person_label').eq('id', id).maybeSingle()
  if (!cur) throw new Error('Riga non trovata')

  const value = Math.round(Number(amount) * 100) / 100
  if (!Number.isFinite(value) || value < 0) throw new Error('Importo non valido')
  const reason = why.trim()
  if (!reason) throw new Error('Serve la ragione: un importo deciso a mano senza il perché non si legge')

  const piano = Number((cur as { amount: number }).amount)
  const note = `Deciso a mano: ${reason}. Il piano ne calcolava `
    + `${piano.toFixed(2).replace('.', ',')} €.`

  const { error } = await db.from('pl_payouts').update({ amount: value, note }).eq('id', id)
  if (error) throw new Error(error.message)
  rev(month)
}

/**
 * §260/§297 — Il bonifico che paga un compenso, o due.
 *
 * Il §260 scriveva questo legame **in una nota**, e diceva perché: un compenso
 * non è una riga di conto economico — si ricalcola (§227) — quindi
 * `bank_transactions` non aveva una colonna che potesse puntargli. Lo stesso
 * commento dichiarava la soluzione mancante: «quella elegante sarebbe una terza
 * colonna». Con la 214 esiste, ed è `payment_allocations.payout_id`.
 *
 * Il caso che la nota non poteva reggere è quello vero: a Marco a luglio sono
 * usciti **3.412 €**, che sono 3.191,12 di quota socio più 220,88 di
 * provvigione — la sua, divisa a metà con Toto, che ne ha presi altrettanti per
 * la ragione opposta. Una nota può dire *un* compenso; qui servono due
 * allocazioni sullo stesso bonifico, e la stessa provvigione risulta pagata da
 * **due** movimenti.
 *
 * La nota resta scritta: chi guarda l'elenco dei movimenti legge a chi è andato
 * il bonifico senza aprire il registro.
 */
export async function reconcilePayout(txId: string, payoutIds: string | string[]) {
  await requireAdmin()
  const db = createAdminClient()
  const ids = Array.isArray(payoutIds) ? payoutIds : [payoutIds]
  if (!ids.length) throw new Error('Non hai scelto nessun compenso')

  const { data: rows } = await db.from('pl_payouts')
    .select('id, person_label, kind, amount').in('id', ids)
  const people = (rows ?? []) as { id: string; person_label: string; kind: string; amount: number }[]
  if (people.length !== ids.length) throw new Error('Compenso non trovato')

  /* Il motore decide come si spartisce: ognuno prende il suo scoperto finché il
     bonifico tiene. Se avanza, avanza e si vede — inventare una destinazione per
     far tornare il conto è il modo in cui un registro smette di servire. */
  const esito = await allocate(txId, ids.map(id => {
    const p = people.find(x => x.id === id)!
    return { target: 'compenso' as const, targetId: id, amount: Number(p.amount) }
  }).filter(d => d.amount > 0))

  const { error } = await db.from('bank_transactions').update({
    no_match_needed: true,
    note: people.map(p =>
      `Compenso ${p.kind} a ${p.person_label} · ${p.amount.toFixed(2).replace('.', ',')} €`).join(' + ')
      + ' (§297)',
    matched_at: new Date().toISOString(),
  }).eq('id', txId)
  if (error) throw new Error(error.message)
  revalidatePath('/economics')
  revalidatePath('/economics/banca')
  return esito
}

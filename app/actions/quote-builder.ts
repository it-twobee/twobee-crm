'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { quoteTotals, quoteMargin } from '@/lib/quote-math'
import type { Quote, QuoteItem, QuoteExternalCost, QuoteStatus } from '@/lib/types/database'

export interface QuoteInput {
  id?: string
  title: string
  client_id: string | null
  deal_id: string | null
  items: QuoteItem[]
  external_costs: QuoteExternalCost[]
  target_margin: number
  final_price: number | null
  status: QuoteStatus
  valid_until: string | null
  notes: string | null
}

export async function saveQuote(input: QuoteInput): Promise<Quote> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  // Totali e margini ricalcolati server-side: il client non è fonte di verità
  const { totalCost } = quoteTotals(input.items, input.external_costs)
  const { amount, pct } = quoteMargin(input.final_price, totalCost)

  const payload = {
    title: input.title,
    client_id: input.client_id,
    deal_id: input.deal_id,
    items: input.items,
    external_costs: input.external_costs,
    total: input.final_price ?? 0,
    total_cost: Math.round(totalCost * 100) / 100,
    target_margin: input.target_margin,
    final_price: input.final_price,
    margin_amount: amount != null ? Math.round(amount * 100) / 100 : null,
    margin_percentage: pct != null ? Math.round(pct * 100) / 100 : null,
    status: input.status,
    valid_until: input.valid_until,
    notes: input.notes,
  }

  const { data, error } = input.id
    ? await sb.from('quotes').update(payload).eq('id', input.id).select().single()
    : await sb.from('quotes').insert({ ...payload, created_by: user.id }).select().single()

  if (error) throw new Error(error.message)
  revalidatePath('/commerciale')
  return data as Quote
}

export async function updateQuoteStatus(id: string, status: QuoteStatus) {
  const sb = await createClient()
  const { error } = await sb.from('quotes').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commerciale')
}

export async function deleteQuote(id: string) {
  const sb = await createClient()
  const { error } = await sb.from('quotes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/commerciale')
}

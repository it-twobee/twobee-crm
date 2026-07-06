import type { QuoteItem, QuoteExternalCost } from '@/lib/types/database'

export const MIN_MARGIN = 0.25
export const PREMIUM_MULTIPLIER = 1.25

export function quoteTotals(items: QuoteItem[], externalCosts: QuoteExternalCost[]) {
  const resourceCost = items.reduce((s, it) => s + (it.hours ?? 0) * (it.cost_rate ?? 0), 0)
  const externalCost = externalCosts.reduce((s, c) => s + (c.amount ?? 0), 0)
  const totalCost    = resourceCost + externalCost
  const salesTotal   = items.reduce((s, it) => s + (it.sale_price ?? 0), 0)
  return { resourceCost, externalCost, totalCost, salesTotal }
}

export function quotePrices(totalCost: number, targetMargin: number) {
  const safeTarget = Math.min(Math.max(targetMargin, 0), 0.95)
  return {
    minimumPrice:     totalCost > 0 ? totalCost / (1 - MIN_MARGIN) : 0,
    recommendedPrice: totalCost > 0 ? totalCost / (1 - safeTarget) : 0,
    premiumPrice:     totalCost > 0 ? (totalCost / (1 - safeTarget)) * PREMIUM_MULTIPLIER : 0,
  }
}

export function quoteMargin(finalPrice: number | null, totalCost: number) {
  if (finalPrice == null || finalPrice <= 0) return { amount: null, pct: null }
  const amount = finalPrice - totalCost
  return { amount, pct: (amount / finalPrice) * 100 }
}

export function marginBand(pct: number | null): { label: string; color: string } {
  if (pct == null)  return { label: '—',          color: '#555' }
  if (pct < 0)      return { label: 'Perdita',    color: '#EF4444' }
  if (pct < 25)     return { label: 'Critico',    color: '#EF4444' }
  if (pct < 40)     return { label: 'Attenzione', color: '#F59E0B' }
  if (pct < 60)     return { label: 'Buono',      color: '#84CC16' }
  return { label: 'Ottimo', color: '#22C55E' }
}

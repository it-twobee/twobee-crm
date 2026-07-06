'use client'

import { useState } from 'react'
import { X, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { saveQuote, type QuoteInput } from '@/app/actions/quote-builder'
import { quoteTotals, quotePrices, quoteMargin, marginBand, MIN_MARGIN } from '@/lib/quote-math'
import type { Quote, QuoteItem, QuoteExternalCost, ResourceCost, Deal, Client } from '@/lib/types/database'

const genId = () => crypto.randomUUID()
const eur = (v: number) => `€${Math.round(v).toLocaleString('it-IT')}`
const ic = 'bg-[#111] border border-[#2A2A2A] rounded-lg px-2.5 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-gold'

export function QuoteBuilder({ initial, clients, deals, resources, onClose, onSaved }: {
  initial: Quote | null
  clients: Pick<Client, 'id' | 'company_name'>[]
  deals: Deal[]
  resources: ResourceCost[]
  onClose: () => void
  onSaved: (q: Quote) => void
}) {
  const [title, setTitle]           = useState(initial?.title ?? '')
  const [clientId, setClientId]     = useState(initial?.client_id ?? '')
  const [dealId, setDealId]         = useState(initial?.deal_id ?? '')
  const [validUntil, setValidUntil] = useState(initial?.valid_until ?? '')
  const [notes, setNotes]           = useState(initial?.notes ?? '')
  const [targetMargin, setTarget]   = useState(initial?.target_margin ?? 0.6)
  const [items, setItems]           = useState<QuoteItem[]>(initial?.items ?? [])
  const [externals, setExternals]   = useState<QuoteExternalCost[]>(initial?.external_costs ?? [])
  const [finalPrice, setFinalPrice] = useState<number | null>(initial?.final_price ?? null)
  const [saving, setSaving]         = useState(false)

  const activeResources = resources.filter(r => r.is_active)

  const { resourceCost, externalCost, totalCost } = quoteTotals(items, externals)
  const { minimumPrice, recommendedPrice, premiumPrice } = quotePrices(totalCost, targetMargin)
  const { amount: marginAmount, pct: marginPct } = quoteMargin(finalPrice, totalCost)
  const band = marginBand(marginPct)

  const patchItem = (id: string, patch: Partial<QuoteItem>, recompute = true) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it
      const next = { ...it, ...patch }
      if (recompute) next.sale_price = Math.round(next.hours * next.cost_rate * next.markup * 100) / 100
      return next
    }))
  }

  const pickResource = (itemId: string, resourceId: string) => {
    const r = activeResources.find(x => x.id === resourceId)
    patchItem(itemId, {
      resource_cost_id: r?.id ?? null,
      resource_name: r?.name ?? null,
      cost_rate: r?.calculated_hourly_cost ?? 0,
      markup: r?.markup_default ?? 2,
    })
  }

  const addItem = () => setItems(p => [...p, {
    id: genId(), service_name: '', resource_cost_id: null, resource_name: null,
    hours: 0, cost_rate: 0, markup: 2, sale_price: 0,
  }])
  const addExternal = () => setExternals(p => [...p, { id: genId(), label: '', amount: 0 }])

  const submit = async () => {
    if (!title.trim()) { toast.error('Titolo obbligatorio'); return }
    setSaving(true)
    try {
      const payload: QuoteInput = {
        id: initial?.id,
        title: title.trim(),
        client_id: clientId || null,
        deal_id: dealId || null,
        items, external_costs: externals,
        target_margin: targetMargin,
        final_price: finalPrice,
        status: initial?.status ?? 'bozza',
        valid_until: validUntil || null,
        notes: notes || null,
      }
      const saved = await saveQuote(payload)
      onSaved(saved)
      toast.success(initial ? 'Preventivo aggiornato' : 'Preventivo creato')
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A] sticky top-0 bg-[#141414] z-10">
          <h2 className="text-base font-bold text-white">{initial ? 'Modifica preventivo' : 'Nuovo preventivo'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-[#888]" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Anagrafica */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-[#888] mb-1">Titolo *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="es. Sito web + campagne Q3" className={`w-full ${ic}`} />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Cliente</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)} className={`w-full ${ic}`}>
                <option value="">— Prospect —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Deal collegato</label>
              <select value={dealId} onChange={e => setDealId(e.target.value)} className={`w-full ${ic}`}>
                <option value="">— Nessuno —</option>
                {deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </div>
          </div>

          {/* Righe risorse */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black text-[#555] uppercase tracking-wider">Risorse e servizi</p>
              <button onClick={addItem} className="flex items-center gap-1 text-xs font-bold text-gold hover:text-yellow-400">
                <Plus className="w-3.5 h-3.5" /> Aggiungi riga
              </button>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-[#444] border border-dashed border-[#2A2A2A] rounded-xl py-6 text-center">
                Nessuna riga — aggiungi risorse e ore stimate per calcolare il costo
              </p>
            ) : (
              <div className="space-y-2 overflow-x-auto">
                <div className="grid grid-cols-[1fr_150px_64px_80px_64px_90px_28px] gap-2 text-[9px] text-[#555] uppercase tracking-wider px-1 min-w-[640px]">
                  <span>Servizio</span><span>Risorsa</span><span>Ore</span><span>Costo €/h</span><span>Markup</span><span className="text-right">Vendita €</span><span />
                </div>
                {items.map(it => (
                  <div key={it.id} className="grid grid-cols-[1fr_150px_64px_80px_64px_90px_28px] gap-2 items-center min-w-[640px]">
                    <input value={it.service_name} onChange={e => patchItem(it.id, { service_name: e.target.value }, false)}
                      placeholder="es. Sviluppo landing" className={ic} />
                    <select value={it.resource_cost_id ?? ''} onChange={e => pickResource(it.id, e.target.value)} className={ic}>
                      <option value="">Manuale</option>
                      {activeResources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <input type="number" min="0" value={it.hours || ''} onChange={e => patchItem(it.id, { hours: parseFloat(e.target.value) || 0 })} className={ic} />
                    <input type="number" min="0" step="0.01" value={it.cost_rate || ''} onChange={e => patchItem(it.id, { cost_rate: parseFloat(e.target.value) || 0 })} className={ic} />
                    <input type="number" min="0" step="0.1" value={it.markup || ''} onChange={e => patchItem(it.id, { markup: parseFloat(e.target.value) || 0 })} className={ic} />
                    <input type="number" min="0" step="0.01" value={it.sale_price || ''} onChange={e => patchItem(it.id, { sale_price: parseFloat(e.target.value) || 0 }, false)}
                      className={`${ic} text-right font-semibold`} />
                    <button onClick={() => setItems(p => p.filter(x => x.id !== it.id))} className="text-[#444] hover:text-error">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {activeResources.length === 0 && (
              <p className="text-[10px] text-[#555] mt-2">
                💡 Nessuna risorsa disponibile: censiscile in <span className="text-gold">Soldi → Costi risorse</span> (solo admin) oppure inserisci il costo €/h manualmente.
              </p>
            )}
          </div>

          {/* Costi esterni */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black text-[#555] uppercase tracking-wider">Costi esterni</p>
              <button onClick={addExternal} className="flex items-center gap-1 text-xs font-bold text-gold hover:text-yellow-400">
                <Plus className="w-3.5 h-3.5" /> Aggiungi costo
              </button>
            </div>
            {externals.length === 0 ? (
              <p className="text-xs text-[#444]">Nessun costo esterno (tool, media budget, licenze, fornitori…)</p>
            ) : (
              <div className="space-y-2">
                {externals.map(c => (
                  <div key={c.id} className="grid grid-cols-[1fr_120px_28px] gap-2 items-center">
                    <input value={c.label} onChange={e => setExternals(p => p.map(x => x.id === c.id ? { ...x, label: e.target.value } : x))}
                      placeholder="es. Budget Meta Ads" className={ic} />
                    <input type="number" min="0" step="0.01" value={c.amount || ''}
                      onChange={e => setExternals(p => p.map(x => x.id === c.id ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))}
                      className={`${ic} text-right`} />
                    <button onClick={() => setExternals(p => p.filter(x => x.id !== c.id))} className="text-[#444] hover:text-error">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Pannello margine ── */}
          <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[10px] font-black text-[#555] uppercase tracking-wider">Analisi margine</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#555]">Margine target</span>
                <select value={targetMargin} onChange={e => setTarget(parseFloat(e.target.value))} className={ic}>
                  {[0.4, 0.5, 0.6, 0.7].map(m => <option key={m} value={m}>{m * 100}%</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-center">
              <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-3">
                <p className="text-[9px] text-[#555] uppercase tracking-wider mb-1">Costo totale</p>
                <p className="text-lg font-black text-white">{eur(totalCost)}</p>
                <p className="text-[9px] text-[#444]">{eur(resourceCost)} risorse + {eur(externalCost)} esterni</p>
              </div>
              {[
                { l: `Minimo (${MIN_MARGIN * 100}%)`, v: minimumPrice, c: '#EF4444' },
                { l: `Consigliato (${targetMargin * 100}%)`, v: recommendedPrice, c: '#F5C800' },
                { l: 'Premium', v: premiumPrice, c: '#22C55E' },
              ].map(p => (
                <div key={p.l} onClick={() => setFinalPrice(Math.round(p.v))}
                  className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-3 cursor-pointer hover:border-gold/40 transition-colors"
                  title="Clicca per usare come prezzo finale">
                  <p className="text-[9px] text-[#555] uppercase tracking-wider mb-1">{p.l}</p>
                  <p className="text-lg font-black" style={{ color: p.c }}>{eur(p.v)}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#888]">Prezzo finale €</label>
                <input type="number" min="0" step="1" value={finalPrice ?? ''}
                  onChange={e => setFinalPrice(e.target.value === '' ? null : parseFloat(e.target.value))}
                  className={`${ic} w-32 text-right font-bold`} />
              </div>
              {marginPct != null && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black px-2 py-1 rounded-full" style={{ background: `${band.color}18`, color: band.color }}>
                    {band.label} · {marginPct.toFixed(1)}%
                  </span>
                  <span className="text-xs text-[#888]">margine {eur(marginAmount ?? 0)}</span>
                </div>
              )}
              {marginPct != null && marginPct < 25 && (
                <span className="flex items-center gap-1.5 text-[10px] text-error font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" /> Sotto il margine minimo — rivedi prezzo o costi
                </span>
              )}
            </div>
          </div>

          {/* Note + validità */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_180px] gap-3">
            <div>
              <label className="block text-xs text-[#888] mb-1">Note</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`w-full ${ic} resize-none`} />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Valido fino al</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={`w-full ${ic}`} />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-[#2A2A2A] rounded-lg text-sm text-[#888]">Annulla</button>
            <button onClick={submit} disabled={saving}
              className="flex-1 py-2.5 bg-gold text-black font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salva preventivo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

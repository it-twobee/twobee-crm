'use client'

import { useState, useEffect } from 'react'
import { Plus, Loader2, FileText, Trash2, Pencil, Send, Check, X as XIcon, Presentation, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { updateQuoteStatus, deleteQuote } from '@/app/actions/quote-builder'
import { updateProposalStatus, deleteProposal } from '@/app/actions/proposals'
import { marginBand } from '@/lib/quote-math'
import { buildProposalHtml } from '@/lib/proposal-html'
import { QuoteBuilder } from './QuoteBuilder'
import { ProposalGenerator } from './ProposalGenerator'
import type { Quote, QuoteStatus, ResourceCost, Deal, Client, ProposalDocument, ProposalStatus, BrandMode } from '@/lib/types/database'

const STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  bozza:     { label: 'Bozza',     color: '#6B7280' },
  inviata:   { label: 'Inviata',   color: '#3B82F6' },
  accettata: { label: 'Accettata', color: '#22C55E' },
  rifiutata: { label: 'Rifiutata', color: '#EF4444' },
  scaduta:   { label: 'Scaduta',   color: '#F59E0B' },
}

const eur = (v: number | null | undefined) => v == null ? '—' : `€${Math.round(v).toLocaleString('it-IT')}`

const PROPOSAL_STATUS: Record<ProposalStatus, { label: string; color: string }> = {
  draft:    { label: 'Bozza',     color: '#6B7280' },
  ready:    { label: 'Pronta',    color: '#F5C800' },
  sent:     { label: 'Inviata',   color: '#3B82F6' },
  accepted: { label: 'Accettata', color: '#22C55E' },
  rejected: { label: 'Rifiutata', color: '#EF4444' },
}
const BRAND_LABEL: Record<BrandMode, string> = {
  twobee: 'TWO BEE', white_label: 'White Label', partner_branded: 'Partner', neutral: 'Neutro',
}

export function QuotesSection({ clients, deals }: {
  clients: Pick<Client, 'id' | 'company_name'>[]
  deals: Deal[]
}) {
  const [quotes, setQuotes]         = useState<Quote[]>([])
  const [resources, setResources]   = useState<ResourceCost[]>([])
  const [proposals, setProposals]   = useState<ProposalDocument[]>([])
  const [loading, setLoading]       = useState(true)
  const [showBuilder, setBuilder]   = useState(false)
  const [editing, setEditing]       = useState<Quote | null>(null)
  const [proposalQuote, setProposalQuote] = useState<Quote | null>(null)

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('quotes').select('*').order('created_at', { ascending: false }),
      // RLS: solo admin legge i costi risorse — per gli altri il picker resta vuoto (rate manuale)
      sb.from('resource_costs').select('*').eq('is_active', true).order('name'),
      sb.from('proposal_documents').select('*').order('created_at', { ascending: false }),
    ]).then(([q, r, p]) => {
      if (q.error) toast.error('Errore caricamento preventivi: ' + q.error.message)
      setQuotes((q.data ?? []) as Quote[])
      setResources((r.data ?? []) as ResourceCost[])
      setProposals((p.data ?? []) as ProposalDocument[])
      setLoading(false)
    })
  }, [])

  const clientName = (id: string | null) => clients.find(c => c.id === id)?.company_name ?? 'Prospect'

  const setStatus = async (q: Quote, status: QuoteStatus) => {
    try {
      await updateQuoteStatus(q.id, status)
      setQuotes(prev => prev.map(x => x.id === q.id ? { ...x, status } : x))
      toast.success(`Preventivo ${STATUS_META[status].label.toLowerCase()}`)
    } catch (e) { toast.error((e as Error).message) }
  }

  const remove = async (q: Quote) => {
    if (!confirm(`Eliminare "${q.title}"?`)) return
    try {
      await deleteQuote(q.id)
      setQuotes(prev => prev.filter(x => x.id !== q.id))
      toast.success('Preventivo eliminato')
    } catch (e) { toast.error((e as Error).message) }
  }

  const openProposal = (p: ProposalDocument) => {
    const html = buildProposalHtml(p.content_json, p.brand_mode, p.white_label_partner_name, clientName(p.client_id))
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  const setProposalStatusLocal = async (p: ProposalDocument, status: ProposalStatus) => {
    try {
      await updateProposalStatus(p.id, status)
      setProposals(prev => prev.map(x => x.id === p.id ? { ...x, status } : x))
      toast.success(`Proposta ${PROPOSAL_STATUS[status].label.toLowerCase()}`)
    } catch (e) { toast.error((e as Error).message) }
  }

  const removeProposal = async (p: ProposalDocument) => {
    if (!confirm(`Eliminare la proposta "${p.title}"?`)) return
    try {
      await deleteProposal(p.id)
      setProposals(prev => prev.filter(x => x.id !== p.id))
      toast.success('Proposta eliminata')
    } catch (e) { toast.error((e as Error).message) }
  }

  const accepted = quotes.filter(q => q.status === 'accettata')
  const pending  = quotes.filter(q => q.status === 'inviata')
  const margins  = quotes.map(q => q.margin_percentage).filter((v): v is number => v != null)
  const avgMargin = margins.length ? margins.reduce((s, v) => s + v, 0) / margins.length : null

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 text-gold animate-spin" /></div>
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: 'Preventivi totali', v: String(quotes.length) },
          { l: 'In attesa risposta', v: String(pending.length) },
          { l: 'Valore accettati', v: eur(accepted.reduce((s, q) => s + (q.final_price ?? 0), 0)) },
          { l: 'Margine medio', v: avgMargin != null ? `${avgMargin.toFixed(0)}%` : '—' },
        ].map(k => (
          <div key={k.l} className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
            <p className="text-[10px] text-[#555] uppercase tracking-wider font-bold mb-1">{k.l}</p>
            <p className="text-2xl font-black text-gold">{k.v}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button onClick={() => { setEditing(null); setBuilder(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black text-sm font-bold rounded-lg hover:bg-yellow-400">
          <Plus className="w-4 h-4" /> Nuovo preventivo
        </button>
      </div>

      {/* Lista */}
      {quotes.length === 0 ? (
        <div className="flex flex-col items-center py-20 gap-3 text-center border border-dashed border-[#2A2A2A] rounded-2xl">
          <FileText className="w-8 h-8 text-[#2A2A2A]" />
          <p className="text-[#666] text-sm font-semibold">Nessun preventivo</p>
          <p className="text-[#444] text-xs max-w-sm">Crea il primo preventivo: il sistema calcola costi, margine e prezzo consigliato dalle risorse censite.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {quotes.map(q => {
            const sm = STATUS_META[q.status]
            const band = marginBand(q.margin_percentage)
            return (
              <div key={q.id} className="flex items-center gap-4 bg-surface border border-[#2A2A2A] rounded-xl px-4 py-3.5 hover:border-gold/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{q.title}</p>
                  <p className="text-[10px] text-[#555] mt-0.5">
                    {clientName(q.client_id)}
                    {q.valid_until && ` · valido fino al ${new Date(q.valid_until).toLocaleDateString('it-IT')}`}
                  </p>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <p className="text-sm font-black text-white">{eur(q.final_price)}</p>
                  <p className="text-[9px] text-[#555]">costo {eur(q.total_cost)}</p>
                </div>
                {q.margin_percentage != null && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: `${band.color}18`, color: band.color }}>
                    {q.margin_percentage.toFixed(0)}%
                  </span>
                )}
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: `${sm.color}18`, color: sm.color }}>
                  {sm.label}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {q.status === 'bozza' && (
                    <button onClick={() => setStatus(q, 'inviata')} title="Segna come inviata"
                      className="p-1.5 rounded-lg text-[#555] hover:text-[#3B82F6] hover:bg-white/5"><Send className="w-3.5 h-3.5" /></button>
                  )}
                  {q.status === 'inviata' && (
                    <>
                      <button onClick={() => setStatus(q, 'accettata')} title="Accettata"
                        className="p-1.5 rounded-lg text-[#555] hover:text-success hover:bg-white/5"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setStatus(q, 'rifiutata')} title="Rifiutata"
                        className="p-1.5 rounded-lg text-[#555] hover:text-error hover:bg-white/5"><XIcon className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                  <button onClick={() => setProposalQuote(q)} title="Genera proposta commerciale"
                    className="p-1.5 rounded-lg text-[#555] hover:text-gold hover:bg-white/5"><Presentation className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { setEditing(q); setBuilder(true) }} title="Modifica"
                    className="p-1.5 rounded-lg text-[#555] hover:text-white hover:bg-white/5"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(q)} title="Elimina"
                    className="p-1.5 rounded-lg text-[#555] hover:text-error hover:bg-white/5"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Proposte generate ── */}
      {proposals.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-[10px] font-black text-[#555] uppercase tracking-wider">Proposte commerciali ({proposals.length})</p>
          {proposals.map(p => {
            const ps = PROPOSAL_STATUS[p.status]
            return (
              <div key={p.id} className="flex items-center gap-4 bg-surface border border-[#2A2A2A] rounded-xl px-4 py-3 hover:border-gold/30 transition-colors">
                <Presentation className="w-4 h-4 text-[#555] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{p.title}</p>
                  <p className="text-[10px] text-[#555] mt-0.5">
                    {clientName(p.client_id)} · {new Date(p.created_at).toLocaleDateString('it-IT')}
                  </p>
                </div>
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 bg-[#1A1A1A] text-[#888]">
                  {BRAND_LABEL[p.brand_mode]}
                </span>
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: `${ps.color}18`, color: ps.color }}>
                  {ps.label}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openProposal(p)} title="Apri / Stampa PDF"
                    className="p-1.5 rounded-lg text-[#555] hover:text-gold hover:bg-white/5"><ExternalLink className="w-3.5 h-3.5" /></button>
                  {p.status === 'draft' && (
                    <button onClick={() => setProposalStatusLocal(p, 'sent')} title="Segna come inviata"
                      className="p-1.5 rounded-lg text-[#555] hover:text-[#3B82F6] hover:bg-white/5"><Send className="w-3.5 h-3.5" /></button>
                  )}
                  {p.status === 'sent' && (
                    <>
                      <button onClick={() => setProposalStatusLocal(p, 'accepted')} title="Accettata"
                        className="p-1.5 rounded-lg text-[#555] hover:text-success hover:bg-white/5"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setProposalStatusLocal(p, 'rejected')} title="Rifiutata"
                        className="p-1.5 rounded-lg text-[#555] hover:text-error hover:bg-white/5"><XIcon className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                  <button onClick={() => removeProposal(p)} title="Elimina"
                    className="p-1.5 rounded-lg text-[#555] hover:text-error hover:bg-white/5"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {proposalQuote && (
        <ProposalGenerator
          quote={proposalQuote}
          clients={clients}
          onClose={() => setProposalQuote(null)}
          onSaved={p => setProposals(prev => [p, ...prev])}
        />
      )}

      {showBuilder && (
        <QuoteBuilder
          initial={editing}
          clients={clients}
          deals={deals}
          resources={resources}
          onClose={() => setBuilder(false)}
          onSaved={q => setQuotes(prev => {
            const exists = prev.find(x => x.id === q.id)
            return exists ? prev.map(x => x.id === q.id ? q : x) : [q, ...prev]
          })}
        />
      )}
    </div>
  )
}

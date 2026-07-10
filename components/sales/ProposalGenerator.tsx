'use client'

import { useState } from 'react'
import { X, Loader2, Sparkles, Printer, Save, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { saveProposal } from '@/app/actions/proposals'
import { buildProposalHtml } from '@/lib/proposal-html'
import type { Quote, ProposalContent, ProposalDocument, BrandMode, Client } from '@/lib/types/database'

const BRAND_MODES: { id: BrandMode; label: string; desc: string }[] = [
  { id: 'twobee',          label: 'TWO BEE',        desc: 'Brand e metodologia TWO BEE in evidenza' },
  { id: 'white_label',     label: 'White Label',    desc: 'Nessuna menzione di TWO BEE, brand neutro o del partner' },
  { id: 'partner_branded', label: 'Brand Partner',  desc: 'A nome del partner; TWO BEE invisibile' },
  { id: 'neutral',         label: 'Neutro',         desc: 'Nessun logo, stile istituzionale pulito' },
]

const TONES = [
  { id: 'premium',       label: 'Premium' },
  { id: 'direct',        label: 'Diretto' },
  { id: 'institutional', label: 'Istituzionale' },
  { id: 'technical',     label: 'Tecnico' },
  { id: 'simple',        label: 'Semplice' },
] as const

const ic = 'bg-background border border-border rounded-lg px-2.5 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-gold'

export function ProposalGenerator({ quote, clients, onClose, onSaved }: {
  quote: Quote
  clients: Pick<Client, 'id' | 'company_name'>[]
  onClose: () => void
  onSaved: (p: ProposalDocument) => void
}) {
  const [brandMode, setBrandMode]     = useState<BrandMode>('twobee')
  const [partnerName, setPartnerName] = useState('')
  const [tone, setTone]               = useState<typeof TONES[number]['id']>('premium')
  const [generating, setGenerating]   = useState(false)
  const [saving, setSaving]           = useState(false)
  const [content, setContent]         = useState<ProposalContent | null>(null)
  const [openSection, setOpenSection] = useState<number | null>(null)

  const targetName = clients.find(c => c.id === quote.client_id)?.company_name ?? null
  const needsPartner = brandMode === 'white_label' || brandMode === 'partner_branded'

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/generate-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.id, clientId: quote.client_id, dealId: quote.deal_id,
          brandMode, partnerName: partnerName.trim() || undefined, tone,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore generazione')
      setContent(data as ProposalContent)
      setOpenSection(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setGenerating(false) }
  }

  const patchSection = (i: number, patch: Partial<ProposalContent['sections'][number]>) => {
    setContent(prev => prev ? {
      ...prev,
      sections: prev.sections.map((s, idx) => idx === i ? { ...s, ...patch } : s),
    } : prev)
  }

  const openPreview = () => {
    if (!content) return
    const html = buildProposalHtml(content, brandMode, partnerName.trim() || null, targetName)
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  const save = async () => {
    if (!content) return
    setSaving(true)
    try {
      const doc = await saveProposal({
        quote_id: quote.id, client_id: quote.client_id, deal_id: quote.deal_id,
        brand_mode: brandMode, white_label_partner_name: partnerName.trim() || null,
        content_json: content, target_name: targetName,
      })
      onSaved(doc)
      toast.success('Proposta salvata')
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface z-10">
          <div>
            <h2 className="text-base font-bold text-text-primary">Genera proposta commerciale</h2>
            <p className="text-2xs text-text-tertiary">Da preventivo: {quote.title}{targetName ? ` · ${targetName}` : ''}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* ── Config ── */}
          <div>
            <p className="text-2xs font-black text-text-tertiary uppercase tracking-wider mb-2">Modalità brand</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {BRAND_MODES.map(m => (
                <div key={m.id} onClick={() => setBrandMode(m.id)}
                  className={`cursor-pointer rounded-xl border p-3 transition-colors ${brandMode === m.id ? 'border-gold bg-gold/5' : 'border-border hover:border-border'}`}>
                  <p className={`text-xs font-bold ${brandMode === m.id ? 'text-gold-text' : 'text-text-primary'}`}>{m.label}</p>
                  <p className="text-2xs text-text-tertiary mt-1 leading-relaxed">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {needsPartner && (
              <div>
                <label className="block text-xs text-text-secondary mb-1">Nome partner / brand mittente</label>
                <input value={partnerName} onChange={e => setPartnerName(e.target.value)}
                  placeholder="es. Studio Partner Srl" className={`w-full ${ic}`} />
              </div>
            )}
            <div>
              <label className="block text-xs text-text-secondary mb-1">Tono</label>
              <select value={tone} onChange={e => setTone(e.target.value as typeof tone)} className={`w-full ${ic}`}>
                {TONES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <button onClick={generate} disabled={generating}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gold text-on-gold font-bold rounded-xl disabled:opacity-50 text-sm hover:bg-gold/90 transition-colors">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Generazione in corso…' : content ? 'Rigenera con AI' : 'Genera con AI dai dati reali'}
          </button>

          {/* ── Preview ── */}
          {content && (
            <div className="space-y-3">
              {content.missing_data.length > 0 && (
                <div className="flex items-start gap-2.5 bg-error/10 border border-error/30 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                  <div className="text-xs text-error">
                    <p className="font-bold mb-1">Dati mancanti da completare prima dell'invio:</p>
                    <ul className="list-disc ml-4 space-y-0.5">
                      {content.missing_data.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              <input value={content.title}
                onChange={e => setContent(p => p ? { ...p, title: e.target.value } : p)}
                className={`w-full ${ic} text-base font-bold`} />

              <div className="space-y-1.5">
                {content.sections.map((s, i) => (
                  <div key={i} className="border border-border rounded-xl overflow-hidden">
                    <div onClick={() => setOpenSection(openSection === i ? null : i)}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-hover">
                      <span className="text-2xs font-black text-gold-text w-5">{String(i + 1).padStart(2, '0')}</span>
                      <span className="flex-1 text-sm font-semibold text-text-primary truncate">{s.title}</span>
                      {openSection === i ? <ChevronUp className="w-3.5 h-3.5 text-text-tertiary" /> : <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />}
                    </div>
                    {openSection === i && (
                      <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
                        <textarea value={s.content} onChange={e => patchSection(i, { content: e.target.value })}
                          rows={3} className={`w-full ${ic} resize-none text-xs leading-relaxed`} />
                        <textarea
                          value={(s.bullets ?? []).join('\n')}
                          onChange={e => patchSection(i, { bullets: e.target.value.split('\n').filter(Boolean) })}
                          rows={Math.max(2, (s.bullets ?? []).length)}
                          placeholder="Un bullet per riga"
                          className={`w-full ${ic} resize-none text-xs`} />
                        {s.speaker_notes && (
                          <p className="text-2xs text-text-tertiary italic">🗣 Nota presentazione: {s.speaker_notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={openPreview}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors">
                  <Printer className="w-4 h-4" /> Anteprima / PDF
                </button>
                <button onClick={save} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gold text-on-gold font-bold rounded-lg disabled:opacity-50 text-sm">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva proposta
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { X, Plus, Trash2, Loader2, ChevronRight, ChevronLeft, Target, TrendingUp, Users, ShoppingCart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Client, ClientPackage, PaymentStatus, ClientStatus, ClientType, ClientLabel } from '@/lib/types/database'

const CHANNELS = ['Meta Ads', 'Google Ads', 'Email Marketing', 'CRM', 'WhatsApp', 'SEO', 'E-commerce', 'TikTok Ads', 'LinkedIn Ads', 'YouTube Ads', 'Copywriting', 'Web Design']
const PACKAGES: ClientPackage[] = ['Worker Bee Start', 'Worker Bee Basic', 'Hive Basic', 'Hive Custom', 'Royal Queen', 'IT Digital Partner', 'Partner Quota']

const INDUSTRY_BENCHMARKS: Record<string, { roas: number; ctr: number; cpa: number; conv_rate: number }> = {
  'E-commerce Moda': { roas: 4.5, ctr: 1.8, cpa: 22, conv_rate: 2.1 },
  'E-commerce Casa & Arredo': { roas: 3.8, ctr: 1.5, cpa: 35, conv_rate: 1.8 },
  'E-commerce Alimentare': { roas: 3.2, ctr: 1.2, cpa: 18, conv_rate: 2.5 },
  'Servizi B2B': { roas: 5.0, ctr: 2.1, cpa: 85, conv_rate: 3.2 },
  'Immobiliare': { roas: 6.0, ctr: 1.4, cpa: 120, conv_rate: 1.2 },
  'Ristorazione': { roas: 3.5, ctr: 1.6, cpa: 12, conv_rate: 4.0 },
  'Salute & Benessere': { roas: 4.0, ctr: 1.9, cpa: 28, conv_rate: 2.8 },
  'Turismo & Hospitality': { roas: 5.5, ctr: 2.0, cpa: 45, conv_rate: 2.2 },
  'Automotive': { roas: 7.0, ctr: 1.3, cpa: 180, conv_rate: 0.8 },
  'Formazione & Corsi': { roas: 4.2, ctr: 2.5, cpa: 38, conv_rate: 3.5 },
  'Professionisti (avv/med/comm)': { roas: 5.5, ctr: 2.2, cpa: 65, conv_rate: 2.5 },
  'Tecnologia / SaaS': { roas: 4.8, ctr: 2.8, cpa: 95, conv_rate: 3.8 },
  'Altro': { roas: 4.0, ctr: 1.8, cpa: 40, conv_rate: 2.5 },
}

interface Contact { full_name: string; email: string; phone: string; role: string; is_primary: boolean }
interface NewClientModalProps { onClose: () => void; onCreated: (client: Client) => void }

const STEPS = ['Anagrafica', 'Contratto', 'Obiettivi', 'Referenti']

export function NewClientModal({ onClose, onCreated }: NewClientModalProps) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    company_name: '', package: 'Hive Basic' as ClientPackage, mrr: '', ad_budget_monthly: '',
    contract_start: '', contract_end: '', payment_status: 'pagato' as PaymentStatus,
    active_channels: [] as string[], client_type: 'growth' as ClientType, client_label: 'stabile' as ClientLabel,
    notes: '', industry: '', market_area: '',
    target_leads_monthly: '', target_roas: '', target_revenue_monthly: '',
    target_cpa: '', target_followers_monthly: '', target_ctr: '', target_conv_rate: '', goals_notes: '',
  })
  const [contacts, setContacts] = useState<Contact[]>([])

  const f = (field: keyof typeof form, val: string) => setForm((p) => ({ ...p, [field]: val }))

  const applyBenchmark = () => {
    const b = INDUSTRY_BENCHMARKS[form.industry]
    if (!b) return
    setForm((p) => ({ ...p, target_roas: b.roas.toString(), target_ctr: b.ctr.toString(), target_cpa: b.cpa.toString(), target_conv_rate: b.conv_rate.toString() }))
    toast.success('Benchmark applicato!')
  }

  const toggleChannel = (ch: string) => setForm((p) => ({
    ...p, active_channels: p.active_channels.includes(ch) ? p.active_channels.filter((c) => c !== ch) : [...p.active_channels, ch],
  }))

  const canNext = () => {
    if (step === 0) return form.company_name.trim().length > 0
    if (step === 1) return !!(form.mrr && form.contract_start && form.contract_end)
    return true
  }

  const handleSubmit = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: client, error } = await supabase.from('clients').insert({
      company_name: form.company_name, package: form.package, mrr: parseFloat(form.mrr) || 0,
      ad_budget_monthly: form.ad_budget_monthly ? parseFloat(form.ad_budget_monthly) : null,
      contract_start: form.contract_start, contract_end: form.contract_end,
      payment_status: form.payment_status, active_channels: form.active_channels,
      client_type: form.client_type, client_label: form.client_label,
      notes: form.notes || null, industry: form.industry || null, market_area: form.market_area || null,
      target_leads_monthly: form.target_leads_monthly ? parseInt(form.target_leads_monthly) : null,
      target_roas: form.target_roas ? parseFloat(form.target_roas) : null,
      target_revenue_monthly: form.target_revenue_monthly ? parseFloat(form.target_revenue_monthly) : null,
      target_cpa: form.target_cpa ? parseFloat(form.target_cpa) : null,
      target_followers_monthly: form.target_followers_monthly ? parseInt(form.target_followers_monthly) : null,
      target_ctr: form.target_ctr ? parseFloat(form.target_ctr) : null,
      target_conv_rate: form.target_conv_rate ? parseFloat(form.target_conv_rate) : null,
      goals_notes: form.goals_notes || null,
    }).select().single()

    if (error) { toast.error('Errore: ' + error.message); setLoading(false); return }

    await Promise.all([
      contacts.length > 0 ? supabase.from('client_contacts').insert(contacts.map((c) => ({ ...c, client_id: client.id }))) : Promise.resolve(),
      supabase.from('projects').insert({ client_id: client.id, name: `Progetto ${form.company_name}`, status: 'attivo' }),
      supabase.from('chat_channels').insert([
        { name: form.company_name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40), type: 'cliente', client_id: client.id },
        { name: `cc-${form.company_name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 37)}`, type: 'customer_care', client_id: client.id },
      ]),
    ])

    toast.success(`"${form.company_name}" creato con canali e obiettivi!`)
    onCreated(client as Client)
  }

  const ic = "w-full bg-background border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-secondary focus:outline-none focus:border-gold/50"

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-[#2A2A2A] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
          <div>
            <h2 className="text-lg font-bold text-white">Nuovo Cliente</h2>
            <p className="text-xs text-text-secondary mt-0.5">Step {step + 1}/{STEPS.length} — {STEPS[step]}</p>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Progress */}
        <div className="h-1 bg-[#2A2A2A]">
          <div className="h-full bg-gold transition-all duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 py-3 border-b border-[#2A2A2A]">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${i < step ? 'bg-gold text-black' : i === step ? 'bg-gold/20 border border-gold text-gold' : 'bg-[#2A2A2A] text-text-secondary'}`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${i === step ? 'text-white font-medium' : 'text-text-secondary'}`}>{s}</span>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-[#333]" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* STEP 0: Anagrafica */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Ragione Sociale *</label>
                <input value={form.company_name} onChange={(e) => f('company_name', e.target.value)} placeholder="TWO BEE S.R.L." className={ic} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Tipo Cliente *</label>
                  <select value={form.client_type} onChange={(e) => f('client_type', e.target.value as ClientType)} className={ic}>
                    <option value="growth">🚀 Growth (marketing)</option>
                    <option value="digital">💻 Digital (AI/IT)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Label</label>
                  <select value={form.client_label} onChange={(e) => f('client_label', e.target.value as ClientLabel)} className={ic}>
                    <option value="stabile">✅ Stabile</option>
                    <option value="in_bilico">⚠️ In bilico</option>
                    <option value="perso">❌ Perso</option>
                    <option value="partner">🤝 Partner</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Settore</label>
                  <select value={form.industry} onChange={(e) => f('industry', e.target.value)} className={ic}>
                    <option value="">Seleziona settore...</option>
                    {Object.keys(INDUSTRY_BENCHMARKS).map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Area Geografica</label>
                  <input value={form.market_area} onChange={(e) => f('market_area', e.target.value)} placeholder="es. Napoli, Campania, Italia" className={ic} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-2">Canali Attivi</label>
                <div className="flex flex-wrap gap-2">
                  {CHANNELS.map((ch) => (
                    <button key={ch} type="button" onClick={() => toggleChannel(ch)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${form.active_channels.includes(ch) ? 'bg-gold/20 border-gold text-gold font-semibold' : 'bg-background border-[#2A2A2A] text-text-secondary hover:border-[#3A3A3A]'}`}>
                      {ch}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Note interne</label>
                <textarea value={form.notes} onChange={(e) => f('notes', e.target.value)} rows={2} placeholder="Note private..." className={ic + ' resize-none'} />
              </div>
            </div>
          )}

          {/* STEP 1: Contratto */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Pacchetto *</label>
                  <select value={form.package} onChange={(e) => f('package', e.target.value as ClientPackage)} className={ic}>
                    {PACKAGES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">MRR (€/mese) *</label>
                  <input type="number" value={form.mrr} onChange={(e) => f('mrr', e.target.value)} placeholder="1800" className={ic} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Budget ADV mensile cliente (€)</label>
                <input type="number" value={form.ad_budget_monthly} onChange={(e) => f('ad_budget_monthly', e.target.value)} placeholder="Spesa pubblicitaria del cliente" className={ic} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Inizio Contratto *</label>
                  <input type="date" value={form.contract_start} onChange={(e) => f('contract_start', e.target.value)} className={ic} />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Fine Contratto *</label>
                  <input type="date" value={form.contract_end} onChange={(e) => f('contract_end', e.target.value)} className={ic} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Stato Pagamenti</label>
                <select value={form.payment_status} onChange={(e) => f('payment_status', e.target.value as PaymentStatus)} className={ic}>
                  <option value="pagato">Pagato</option>
                  <option value="in_attesa">Attesa pagamento</option>
                  <option value="scaduto">Scaduto</option>
                </select>
              </div>
            </div>
          )}

          {/* STEP 2: Obiettivi */}
          {step === 2 && (
            <div className="space-y-5">
              {form.industry && INDUSTRY_BENCHMARKS[form.industry] && (
                <div className="bg-gold/5 border border-gold/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-gold" />
                    <p className="text-sm font-semibold text-gold">Benchmark: {form.industry}</p>
                  </div>
                  <p className="text-xs text-text-secondary mb-3">
                    ROAS {INDUSTRY_BENCHMARKS[form.industry].roas}× · CTR {INDUSTRY_BENCHMARKS[form.industry].ctr}% · CPA €{INDUSTRY_BENCHMARKS[form.industry].cpa} · Conv. {INDUSTRY_BENCHMARKS[form.industry].conv_rate}%
                  </p>
                  <button onClick={applyBenchmark} className="text-xs bg-gold/20 border border-gold/30 text-gold px-3 py-1.5 rounded-lg hover:bg-gold/30 transition-colors">
                    Applica benchmark di settore
                  </button>
                </div>
              )}

              {form.client_type === 'growth' && (
                <>
                  <div>
                    <div className="flex items-center gap-2 mb-3"><TrendingUp className="w-4 h-4 text-gold" /><h3 className="text-sm font-bold text-white">Performance ADV</h3></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">ROAS Target</label>
                        <input type="number" step="0.1" value={form.target_roas} onChange={(e) => f('target_roas', e.target.value)} placeholder="4.0" className={ic} />
                      </div>
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">CTR Target (%)</label>
                        <input type="number" step="0.1" value={form.target_ctr} onChange={(e) => f('target_ctr', e.target.value)} placeholder="2.0" className={ic} />
                      </div>
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">CPA Target (€)</label>
                        <input type="number" value={form.target_cpa} onChange={(e) => f('target_cpa', e.target.value)} placeholder="30" className={ic} />
                      </div>
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">Conv. Rate Target (%)</label>
                        <input type="number" step="0.1" value={form.target_conv_rate} onChange={(e) => f('target_conv_rate', e.target.value)} placeholder="2.5" className={ic} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-3"><ShoppingCart className="w-4 h-4 text-blue-400" /><h3 className="text-sm font-bold text-white">Obiettivi Business</h3></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">Lead/mese target</label>
                        <input type="number" value={form.target_leads_monthly} onChange={(e) => f('target_leads_monthly', e.target.value)} placeholder="50" className={ic} />
                      </div>
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">Revenue/mese target (€)</label>
                        <input type="number" value={form.target_revenue_monthly} onChange={(e) => f('target_revenue_monthly', e.target.value)} placeholder="15000" className={ic} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-purple-400" /><h3 className="text-sm font-bold text-white">Social Growth</h3></div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Nuovi follower/mese target</label>
                      <input type="number" value={form.target_followers_monthly} onChange={(e) => f('target_followers_monthly', e.target.value)} placeholder="500" className={ic} />
                    </div>
                  </div>
                </>
              )}

              {form.client_type === 'digital' && (
                <div>
                  <div className="flex items-center gap-2 mb-3"><Target className="w-4 h-4 text-gold" /><h3 className="text-sm font-bold text-white">Obiettivi Digital</h3></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Revenue/mese target (€)</label>
                      <input type="number" value={form.target_revenue_monthly} onChange={(e) => f('target_revenue_monthly', e.target.value)} placeholder="20000" className={ic} />
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Lead target/mese</label>
                      <input type="number" value={form.target_leads_monthly} onChange={(e) => f('target_leads_monthly', e.target.value)} placeholder="20" className={ic} />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Note sugli obiettivi</label>
                <textarea value={form.goals_notes} onChange={(e) => f('goals_notes', e.target.value)} rows={3}
                  placeholder="Obiettivi specifici concordati, KPI particolari, stagionalità, vincoli di budget..."
                  className={ic + ' resize-none'} />
              </div>
            </div>
          )}

          {/* STEP 3: Referenti */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-secondary">Referenti del cliente (opzionale)</p>
                <button type="button" onClick={() => setContacts((p) => [...p, { full_name: '', email: '', phone: '', role: '', is_primary: false }])}
                  className="flex items-center gap-1 text-xs text-gold hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Aggiungi
                </button>
              </div>
              {contacts.length === 0 && (
                <div className="border border-dashed border-[#2A2A2A] rounded-xl py-10 text-center text-text-secondary text-sm">
                  Nessun referente — puoi aggiungerli anche dopo dall'anagrafica
                </div>
              )}
              {contacts.map((c, i) => (
                <div key={i} className="bg-background border border-[#2A2A2A] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Referente {i + 1}</span>
                    <button onClick={() => setContacts((p) => p.filter((_, idx) => idx !== i))} className="text-error"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={c.full_name} onChange={(e) => setContacts((p) => p.map((x, idx) => idx === i ? { ...x, full_name: e.target.value } : x))} placeholder="Nome *" className={ic} />
                    <input type="email" value={c.email} onChange={(e) => setContacts((p) => p.map((x, idx) => idx === i ? { ...x, email: e.target.value } : x))} placeholder="Email *" className={ic} />
                    <input value={c.phone} onChange={(e) => setContacts((p) => p.map((x, idx) => idx === i ? { ...x, phone: e.target.value } : x))} placeholder="Telefono" className={ic} />
                    <input value={c.role} onChange={(e) => setContacts((p) => p.map((x, idx) => idx === i ? { ...x, role: e.target.value } : x))} placeholder="Ruolo" className={ic} />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <input type="checkbox" checked={c.is_primary} onChange={(e) => setContacts((p) => p.map((x, idx) => idx === i ? { ...x, is_primary: e.target.checked } : x))} className="accent-gold" />
                    Referente principale
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-[#2A2A2A]">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="flex items-center gap-1 px-4 py-2.5 border border-[#2A2A2A] rounded-lg text-sm text-text-secondary hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" /> Indietro
            </button>
          )}
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}
              className="flex items-center gap-1 px-6 py-2.5 bg-gold text-black font-bold rounded-lg hover:bg-gold/90 disabled:opacity-40 transition-colors">
              Avanti <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-gold text-black font-bold rounded-lg hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Crea Cliente
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

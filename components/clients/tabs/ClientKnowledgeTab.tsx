'use client'

import { useState, useEffect } from 'react'
import { Loader2, Save, Brain, Link2, ShieldAlert, Briefcase, Target, Palette, Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { AIPrefillPanel } from '@/components/shared/AIPrefillPanel'
import { upsertClientKnowledge, type ClientKnowledgeInput } from '@/app/actions/client-knowledge'
import type { ClientKnowledge } from '@/lib/types/database'

type FieldKey = keyof Omit<ClientKnowledgeInput, 'client_id'>

interface FieldDef { key: FieldKey; label: string; placeholder: string; rows?: number }
interface GroupDef { title: string; description: string; icon: string; fields: FieldDef[] }

const GROUPS: GroupDef[] = [
  {
    title: 'Business e offerta',
    description: 'Come funziona il business del cliente e cosa facciamo per lui',
    icon: 'briefcase',
    fields: [
      { key: 'business_model',  label: 'Modello di business', placeholder: 'es. E-commerce B2C con abbonamento mensile…', rows: 2 },
      { key: 'main_offer',      label: 'Offerta principale',  placeholder: 'Prodotti/servizi core, prezzi indicativi, USP…', rows: 2 },
      { key: 'services_active', label: 'Servizi attivi con noi', placeholder: 'es. Meta Ads + SEO + sito in manutenzione…', rows: 2 },
    ],
  },
  {
    title: 'Mercato e target',
    description: 'Chi è il cliente del cliente, dove opera e chi sono i competitor',
    icon: 'target',
    fields: [
      { key: 'target_audience', label: 'Target audience',  placeholder: 'Chi compra, dove, fascia età, geografia…', rows: 2 },
      { key: 'buyer_personas',  label: 'Buyer personas',   placeholder: 'Persona 1: … / Persona 2: …', rows: 3 },
      { key: 'competitors',     label: 'Competitor',       placeholder: 'Nomi, posizionamento, cosa fanno meglio/peggio…', rows: 2 },
    ],
  },
  {
    title: 'Comunicazione e brand',
    description: 'Come parla il brand, asset grafici e stato degli accessi alle piattaforme',
    icon: 'palette',
    fields: [
      { key: 'tone_of_voice',    label: 'Tone of voice',        placeholder: 'es. Diretto e ironico, mai formale, evita anglicismi…', rows: 2 },
      { key: 'brand_assets_url', label: 'Brand assets (URL)',   placeholder: 'Link Drive/Canva a logo, font, palette…', rows: 1 },
      { key: 'access_status',    label: 'Stato accessi',        placeholder: 'es. Meta BM ok, GA4 in attesa, hosting mancante…', rows: 2 },
    ],
  },
  {
    title: 'Strategia',
    description: 'Problemi, opportunità e direzione strategica — guida le scelte operative',
    icon: 'lightbulb',
    fields: [
      { key: 'pain_points',     label: 'Pain points',            placeholder: 'Problemi reali del cliente e del suo mercato…', rows: 3 },
      { key: 'opportunities',   label: 'Opportunità',            placeholder: 'Leve non ancora sfruttate, quick win…', rows: 2 },
      { key: 'strategic_notes', label: 'Note strategiche',       placeholder: 'Direzione concordata, vincoli, storia…', rows: 3 },
      { key: 'do_not_do',       label: 'Cosa NON fare',          placeholder: 'es. Mai sconti in comunicazione, non citare competitor X…', rows: 2 },
    ],
  },
]

const ALL_KEYS = GROUPS.flatMap(g => g.fields.map(f => f.key))
// Campi che l'AI Prefill può compilare dai dati reali (esclude URL/accessi)
const AI_FIELDS = GROUPS.flatMap(g => g.fields)
  .filter(f => !['brand_assets_url', 'access_status'].includes(f.key))
  .map(f => ({ key: f.key as string, label: f.label }))

const emptyForm = (clientId: string): ClientKnowledgeInput => ({
  client_id: clientId,
  business_model: null, main_offer: null, target_audience: null, competitors: null,
  tone_of_voice: null, brand_assets_url: null, access_status: null, pain_points: null,
  strategic_notes: null, buyer_personas: null, services_active: null, do_not_do: null,
  opportunities: null,
})

export function ClientKnowledgeTab({ clientId }: { clientId: string }) {
  const [form, setForm]       = useState<ClientKnowledgeInput>(emptyForm(clientId))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)

  useEffect(() => {
    createClient()
      .from('client_knowledge').select('*').eq('client_id', clientId).maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error('Errore caricamento knowledge: ' + error.message)
        if (data) {
          const { id: _i, created_at: _c, updated_at: _u, ...rest } = data as ClientKnowledge
          setForm(rest)
        }
        setLoading(false)
      })
  }, [clientId])

  const set = (k: FieldKey, v: string) => {
    setForm(p => ({ ...p, [k]: v || null }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      await upsertClientKnowledge(form)
      setDirty(false)
      toast.success('Knowledge base salvata')
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setSaving(false) }
  }

  const filled = ALL_KEYS.filter(k => (form[k] ?? '').toString().trim()).length
  const pct = Math.round((filled / ALL_KEYS.length) * 100)

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 text-gold animate-spin" /></div>
  }

  return (
    <div className="space-y-5">
      {/* Header + completezza */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
            <Brain className="w-4 h-4 text-gold" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Knowledge base cliente</p>
            <p className="text-[11px] text-text-secondary">Alimenta proposte commerciali, AI, report e onboarding — solo staff, mai visibile al cliente</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AIPrefillPanel
            entityType="client"
            entityId={clientId}
            fields={AI_FIELDS}
            onApply={vals => {
              setForm(p => ({ ...p, ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v || null])) }))
              setDirty(true)
            }}
          />
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 70 ? '#22C55E' : pct >= 40 ? '#F5C800' : '#EF4444' }} />
            </div>
            <span className="text-[10px] text-[#555] font-bold">{filled}/{ALL_KEYS.length}</span>
          </div>
          <button onClick={save} disabled={saving || !dirty}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-black text-xs font-bold rounded-lg disabled:opacity-40 hover:bg-yellow-400 transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {dirty ? 'Salva modifiche' : 'Salvato'}
          </button>
        </div>
      </div>

      {filled === 0 && (
        <div className="flex items-start gap-2.5 bg-gold/5 border border-gold/20 rounded-2xl px-4 py-3">
          <ShieldAlert className="w-4 h-4 text-gold shrink-0 mt-0.5" />
          <p className="text-xs text-[#999] leading-relaxed">
            Knowledge base vuota: compilarla migliora la qualità delle proposte AI e velocizza l'onboarding di chi entra sul cliente.
            Le note libere restano nella tab <span className="text-gold">Relazione</span> — qui vanno i dati strutturati.
          </p>
        </div>
      )}

      {GROUPS.map(g => {
        const GroupIcon = g.icon === 'briefcase' ? Briefcase : g.icon === 'target' ? Target : g.icon === 'palette' ? Palette : Lightbulb
        const iconColor = g.icon === 'briefcase' ? 'text-gold' : g.icon === 'target' ? 'text-blue-400' : g.icon === 'palette' ? 'text-purple-400' : 'text-green-400'
        return (
        <div key={g.title} className="bg-surface border border-[#2A2A2A] rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-3 pb-3 border-b border-[#2A2A2A]">
            <div className={`w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0`}>
              <GroupIcon className={`w-4 h-4 ${iconColor}`} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{g.title}</p>
              <p className="text-[11px] text-text-secondary mt-0.5">{g.description}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {g.fields.map(f => (
              <div key={f.key} className={f.rows && f.rows >= 3 ? 'sm:col-span-2' : ''}>
                <label className="block text-xs text-[#888] mb-1.5">
                  {f.key === 'brand_assets_url' && <Link2 className="w-3 h-3 inline mr-1 -mt-0.5" />}
                  {f.label}
                </label>
                {f.rows === 1 ? (
                  <input value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder}
                    className="w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white placeholder-[#3A3A3A] focus:outline-none focus:border-gold" />
                ) : (
                  <textarea value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder}
                    rows={f.rows ?? 2}
                    className="w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white placeholder-[#3A3A3A] focus:outline-none focus:border-gold resize-none" />
                )}
              </div>
            ))}
          </div>
        </div>
      )})}
    </div>
  )
}

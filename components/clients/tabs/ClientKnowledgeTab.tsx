'use client'

import { useState, useEffect } from 'react'
import {
  Loader2, Save, Brain, ShieldAlert, Briefcase, Target, Palette, Lightbulb,
  ChevronDown, ChevronRight, Plus, Trash2, Globe, Swords, Grid2x2, Lock, Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { AIPrefillPanel } from '@/components/shared/AIPrefillPanel'
import {
  upsertClientKnowledge, saveCompetitor, deleteCompetitor, saveIdea, deleteIdea,
  upsertClientEconomics, type ClientKnowledgeInput,
} from '@/app/actions/client-knowledge'
import type {
  ClientKnowledge, ClientCompetitor, ClientIdea, ClientEconomics,
  IdeaCategory, IdeaStatus, TaskPriority,
} from '@/lib/types/database'

// §26 — Knowledge come centro di conoscenza strategica: sezioni collassabili,
// competitor e idee come liste vere (tabelle dedicate, migration 107), SWOT,
// e area Marginalità RISERVATA agli admin (RLS client_economics_admin: nascondere
// la sezione non basterebbe, la barriera è nel DB).

type FieldKey = keyof Omit<ClientKnowledgeInput, 'client_id'>

interface FieldDef { key: FieldKey; label: string; placeholder: string; rows?: number }
interface GroupDef { key: string; title: string; description: string; icon: 'briefcase' | 'target' | 'palette' | 'lightbulb' | 'globe' | 'grid'; fields: FieldDef[] }

const GROUPS: GroupDef[] = [
  {
    key: 'mercato', title: 'Mercato', icon: 'globe',
    description: 'Settore, scenario, dimensione, trend, geografia, stagionalità, normative',
    fields: [
      { key: 'market_sector',      label: 'Settore',      placeholder: 'es. Arredamento di design, B2C premium…', rows: 1 },
      { key: 'market_size',        label: 'Dimensione',   placeholder: 'Volume del mercato, quota, ordine di grandezza…', rows: 1 },
      { key: 'market_scenario',    label: 'Scenario',     placeholder: 'Com\'è messo il mercato oggi, dinamiche in corso…', rows: 2 },
      { key: 'market_trends',      label: 'Trend',        placeholder: 'Dove sta andando, segnali, tecnologie emergenti…', rows: 2 },
      { key: 'market_geography',   label: 'Geografia',    placeholder: 'Aree servite, mercati target…', rows: 1 },
      { key: 'market_seasonality', label: 'Stagionalità', placeholder: 'Picchi e cali durante l\'anno…', rows: 1 },
      { key: 'market_regulations', label: 'Normative rilevanti', placeholder: 'Vincoli legali, compliance, restrizioni ADV…', rows: 2 },
    ],
  },
  {
    key: 'brand', title: 'Brand', icon: 'palette',
    description: 'Valori, missione, visione, tono di voce, percezione, cosa evitare',
    fields: [
      { key: 'brand_values',      label: 'Valori',         placeholder: 'I valori dichiarati e quelli reali…', rows: 2 },
      { key: 'brand_mission',     label: 'Missione',       placeholder: 'Perché esiste il brand…', rows: 2 },
      { key: 'brand_vision',      label: 'Visione',        placeholder: 'Dove vuole arrivare…', rows: 2 },
      { key: 'tone_of_voice',     label: 'Tono di voce',   placeholder: 'es. Diretto e ironico, mai formale, evita anglicismi…', rows: 2 },
      { key: 'brand_distinctive', label: 'Elementi distintivi', placeholder: 'Cosa lo rende riconoscibile…', rows: 2 },
      { key: 'brand_perception',  label: 'Percezione',     placeholder: 'Come lo vedono davvero i clienti…', rows: 2 },
      { key: 'brand_promises',    label: 'Promesse',       placeholder: 'Cosa promette al mercato…', rows: 2 },
      { key: 'do_not_do',         label: 'Da evitare',     placeholder: 'es. Mai sconti in comunicazione, non citare competitor X…', rows: 2 },
      { key: 'brand_assets_url',  label: 'Brand assets (URL)', placeholder: 'Link Drive/Canva a logo, font, palette…', rows: 1 },
    ],
  },
  {
    key: 'swot', title: 'SWOT', icon: 'grid',
    description: 'Punti di forza, debolezze, opportunità, minacce',
    fields: [
      { key: 'swot_strengths',     label: 'Strengths',     placeholder: 'Punti di forza reali, difendibili…', rows: 3 },
      { key: 'swot_weaknesses',    label: 'Weaknesses',    placeholder: 'Debolezze strutturali, gap…', rows: 3 },
      { key: 'swot_opportunities', label: 'Opportunities', placeholder: 'Leve non sfruttate, spazi di mercato…', rows: 3 },
      { key: 'swot_threats',       label: 'Threats',       placeholder: 'Minacce competitive, rischi esterni…', rows: 3 },
    ],
  },
  {
    key: 'offerta', title: 'Offerta', icon: 'briefcase',
    description: 'Servizi, target, buyer personas, value proposition, pricing, obiezioni',
    fields: [
      { key: 'business_model',        label: 'Modello di business', placeholder: 'es. E-commerce B2C con abbonamento mensile…', rows: 2 },
      { key: 'main_offer',            label: 'Servizi / prodotti',  placeholder: 'Prodotti/servizi core, prezzi indicativi…', rows: 2 },
      { key: 'services_active',       label: 'Servizi attivi con noi', placeholder: 'es. Meta Ads + SEO + sito in manutenzione…', rows: 2 },
      { key: 'target_audience',       label: 'Target',              placeholder: 'Chi compra, dove, fascia età, geografia…', rows: 2 },
      { key: 'buyer_personas',        label: 'Buyer personas',      placeholder: 'Persona 1: … / Persona 2: …', rows: 3 },
      { key: 'offer_value_prop',      label: 'Value proposition',   placeholder: 'Perché scegliere loro e non un altro…', rows: 2 },
      { key: 'offer_pricing',         label: 'Pricing',             placeholder: 'Fasce di prezzo, listino, politica sconti…', rows: 2 },
      { key: 'offer_objections',      label: 'Obiezioni',           placeholder: 'Cosa frena l\'acquisto…', rows: 2 },
      { key: 'offer_differentiators', label: 'Differenziatori',     placeholder: 'Cosa li distingue dai competitor…', rows: 2 },
    ],
  },
  {
    key: 'strategia', title: 'Informazioni strategiche', icon: 'lightbulb',
    description: 'Obiettivi, criticità, opportunità, rischi, dipendenze, prossimi step',
    fields: [
      { key: 'strat_objectives',   label: 'Obiettivi',      placeholder: 'Cosa vuole ottenere il cliente, con che numeri…', rows: 2 },
      { key: 'pain_points',        label: 'Criticità',      placeholder: 'Problemi reali del cliente e del suo mercato…', rows: 3 },
      { key: 'opportunities',      label: 'Opportunità',    placeholder: 'Leve non ancora sfruttate, quick win…', rows: 2 },
      { key: 'strat_risks',        label: 'Rischi',         placeholder: 'Cosa può andare storto…', rows: 2 },
      { key: 'strat_dependencies', label: 'Dipendenze',     placeholder: 'Da cosa/chi dipendiamo per consegnare…', rows: 2 },
      { key: 'strat_next_steps',   label: 'Prossimi step',  placeholder: 'Le prossime mosse concordate…', rows: 2 },
      { key: 'strategic_notes',    label: 'Note strategiche', placeholder: 'Direzione concordata, vincoli, storia…', rows: 3 },
      { key: 'access_status',      label: 'Stato accessi',  placeholder: 'es. Meta BM ok, GA4 in attesa, hosting mancante…', rows: 2 },
    ],
  },
]

const ALL_KEYS = GROUPS.flatMap(g => g.fields.map(f => f.key))
const AI_FIELDS = GROUPS.flatMap(g => g.fields)
  .filter(f => !['brand_assets_url', 'access_status'].includes(f.key))
  .map(f => ({ key: f.key as string, label: f.label }))

const emptyForm = (clientId: string): ClientKnowledgeInput => ({
  client_id: clientId,
  business_model: null, main_offer: null, target_audience: null, competitors: null,
  tone_of_voice: null, brand_assets_url: null, access_status: null, pain_points: null,
  strategic_notes: null, buyer_personas: null, services_active: null, do_not_do: null,
  opportunities: null,
  market_sector: null, market_scenario: null, market_size: null, market_trends: null,
  market_geography: null, market_seasonality: null, market_regulations: null,
  brand_values: null, brand_mission: null, brand_vision: null, brand_distinctive: null,
  brand_perception: null, brand_promises: null,
  swot_strengths: null, swot_weaknesses: null, swot_opportunities: null, swot_threats: null,
  offer_value_prop: null, offer_pricing: null, offer_objections: null, offer_differentiators: null,
  strat_objectives: null, strat_risks: null, strat_dependencies: null, strat_next_steps: null,
})

const ICONS = { briefcase: Briefcase, target: Target, palette: Palette, lightbulb: Lightbulb, globe: Globe, grid: Grid2x2 }
const ICON_COLOR: Record<string, string> = {
  briefcase: 'text-gold-text', target: 'text-info', palette: 'text-accent',
  lightbulb: 'text-success', globe: 'text-info', grid: 'text-warning',
}

const IDEA_CATEGORIES: IdeaCategory[] = ['growth', 'digital', 'ai', 'contenuti', 'advertising', 'prodotto', 'altro']
const IDEA_STATUSES: IdeaStatus[] = ['proposta', 'in_valutazione', 'approvata', 'scartata', 'realizzata']
const STATUS_STYLE: Record<IdeaStatus, string> = {
  proposta: 'bg-surface-hover text-text-secondary',
  in_valutazione: 'bg-info/10 text-info',
  approvata: 'bg-success/10 text-success',
  scartata: 'bg-error/10 text-error',
  realizzata: 'bg-gold/10 text-gold-text',
}

const inp = 'w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-gold'

export function ClientKnowledgeTab({ clientId, isAdmin = false }: { clientId: string; isAdmin?: boolean }) {
  const [form, setForm]       = useState<ClientKnowledgeInput>(emptyForm(clientId))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [open, setOpen]       = useState<Set<string>>(new Set(['mercato']))

  const [competitors, setCompetitors] = useState<ClientCompetitor[]>([])
  const [ideas, setIdeas]             = useState<ClientIdea[]>([])
  const [economics, setEconomics]     = useState<ClientEconomics | null>(null)

  useEffect(() => {
    const sb = createClient()
    const load = async () => {
      const [k, c, i] = await Promise.all([
        sb.from('client_knowledge').select('*').eq('client_id', clientId).maybeSingle(),
        sb.from('client_competitors').select('*').eq('client_id', clientId).order('position'),
        sb.from('client_ideas').select('*').eq('client_id', clientId).order('position'),
      ])
      if (k.data) {
        const { id: _i, created_at: _c, updated_at: _u, ...rest } = k.data as ClientKnowledge
        setForm({ ...emptyForm(clientId), ...rest })
      }
      setCompetitors((c.data ?? []) as ClientCompetitor[])
      setIdeas((i.data ?? []) as ClientIdea[])
      // Area riservata: la query parte solo per gli admin (la RLS la bloccherebbe comunque).
      if (isAdmin) {
        const { data } = await sb.from('client_economics').select('*').eq('client_id', clientId).maybeSingle()
        setEconomics((data as ClientEconomics) ?? null)
      }
      setLoading(false)
    }
    load()
  }, [clientId, isAdmin])

  const toggle = (k: string) => setOpen(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n
  })

  const set = (k: FieldKey, v: string) => {
    setForm(p => ({ ...p, [k]: v || null }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      await upsertClientKnowledge(form)
      setDirty(false)
      toast.success('Knowledge salvata')
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  const filled = ALL_KEYS.filter(k => (form[k] ?? '').toString().trim()).length
  const pct = Math.round((filled / ALL_KEYS.length) * 100)

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 text-gold-text animate-spin" /></div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
            <Brain className="w-4 h-4 text-gold-text" />
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary">Knowledge cliente</p>
            <p className="text-2xs text-text-secondary">Mercato, competitor, brand, SWOT, offerta, idee — solo staff, mai visibile al cliente</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AIPrefillPanel entityType="client" entityId={clientId} fields={AI_FIELDS}
            onApply={vals => {
              setForm(p => ({ ...p, ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v || null])) }))
              setDirty(true)
            }} />
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-surface rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: pct >= 70 ? 'var(--color-success)' : pct >= 40 ? 'var(--color-gold)' : 'var(--color-error)' }} />
            </div>
            <span className="text-2xs text-text-tertiary font-bold">{filled}/{ALL_KEYS.length}</span>
          </div>
          <button onClick={save} disabled={saving || !dirty}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-xs font-bold rounded-lg disabled:opacity-40 hover:bg-gold/90 transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {dirty ? 'Salva modifiche' : 'Salvato'}
          </button>
        </div>
      </div>

      {filled === 0 && competitors.length === 0 && ideas.length === 0 && (
        <div className="flex items-start gap-2.5 bg-gold/5 border border-gold/20 rounded-2xl px-4 py-3">
          <ShieldAlert className="w-4 h-4 text-gold-text shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary leading-relaxed">
            Knowledge vuota: compilarla migliora le proposte AI e velocizza l&apos;onboarding di chi entra sul cliente.
            Le note libere restano nella tab <span className="text-gold-text">Relazione</span>.
          </p>
        </div>
      )}

      {/* Sezioni a campi */}
      {GROUPS.map(g => {
        const GroupIcon = ICONS[g.icon]
        const isOpen = open.has(g.key)
        const done = g.fields.filter(f => (form[f.key] ?? '').toString().trim()).length
        return (
          <section key={g.key} className="bg-surface border border-border rounded-2xl overflow-hidden">
            <button onClick={() => toggle(g.key)}
              className="w-full flex items-center gap-3 p-4 hover:bg-surface-hover transition-colors text-left">
              <div className="w-8 h-8 rounded-lg bg-overlay/[0.04] flex items-center justify-center shrink-0">
                <GroupIcon className={`w-4 h-4 ${ICON_COLOR[g.icon]}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-primary">{g.title}</p>
                <p className="text-2xs text-text-secondary mt-0.5 truncate">{g.description}</p>
              </div>
              <span className="text-2xs text-text-tertiary shrink-0">{done}/{g.fields.length}</span>
              {isOpen ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />}
            </button>
            {isOpen && (
              <div className="px-5 pb-5 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border">
                {g.fields.map(f => (
                  <div key={f.key} className={f.rows && f.rows >= 3 ? 'sm:col-span-2' : ''}>
                    <label className="block text-xs text-text-secondary mb-1.5 mt-4">{f.label}</label>
                    {f.rows === 1 ? (
                      <input value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} className={inp} />
                    ) : (
                      <textarea value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder}
                        rows={f.rows ?? 2} className={`${inp} resize-none`} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}

      {/* Competitor (lista) */}
      <CompetitorSection clientId={clientId} items={competitors} setItems={setCompetitors}
        isOpen={open.has('competitor')} toggle={() => toggle('competitor')} />

      {/* Idee (lista) */}
      <IdeasSection clientId={clientId} items={ideas} setItems={setIdeas}
        isOpen={open.has('idee')} toggle={() => toggle('idee')} />

      {/* Marginalità — solo admin (§26 area riservata) */}
      {isAdmin && (
        <EconomicsSection clientId={clientId} value={economics} setValue={setEconomics}
          isOpen={open.has('marginalita')} toggle={() => toggle('marginalita')} />
      )}
    </div>
  )
}

// ── Competitor ───────────────────────────────────────────────────────────────
function CompetitorSection({ clientId, items, setItems, isOpen, toggle }: {
  clientId: string; items: ClientCompetitor[]; setItems: (f: (p: ClientCompetitor[]) => ClientCompetitor[]) => void
  isOpen: boolean; toggle: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', website: '', positioning: '', strengths: '', weaknesses: '', pricing: '', channels: '', notes: '' })
  const [busy, setBusy] = useState(false)

  const reset = () => { setEditing(null); setDraft({ name: '', website: '', positioning: '', strengths: '', weaknesses: '', pricing: '', channels: '', notes: '' }) }

  const openEdit = (c: ClientCompetitor) => {
    setEditing(c.id)
    setDraft({
      name: c.name, website: c.website ?? '', positioning: c.positioning ?? '', strengths: c.strengths ?? '',
      weaknesses: c.weaknesses ?? '', pricing: c.pricing ?? '', channels: c.channels ?? '', notes: c.notes ?? '',
    })
  }

  const submit = async () => {
    if (!draft.name.trim() || busy) return
    setBusy(true)
    try {
      const saved = await saveCompetitor(clientId, editing, { ...draft, position: items.length })
      setItems(prev => editing ? prev.map(c => c.id === saved.id ? saved : c) : [...prev, saved])
      reset()
      toast.success('Competitor salvato')
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Eliminare questo competitor?')) return
    try {
      await deleteCompetitor(clientId, id)
      setItems(prev => prev.filter(c => c.id !== id))
      toast.success('Eliminato')
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <section className="bg-surface border border-border rounded-2xl overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center gap-3 p-4 hover:bg-surface-hover transition-colors text-left">
        <div className="w-8 h-8 rounded-lg bg-overlay/[0.04] flex items-center justify-center shrink-0">
          <Swords className="w-4 h-4 text-error" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-primary">Competitor</p>
          <p className="text-2xs text-text-secondary mt-0.5">Chi compete, come si posiziona, punti di forza e debolezza</p>
        </div>
        <span className="text-2xs text-text-tertiary shrink-0">{items.length}</span>
        {isOpen ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />}
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-4 space-y-3 border-t border-border">
          {items.map(c => (
            <div key={c.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-text-primary">{c.name}</p>
                    {c.website && (
                      <a href={c.website} target="_blank" rel="noopener noreferrer"
                        className="text-2xs text-info hover:underline truncate max-w-[200px]">{c.website}</a>
                    )}
                  </div>
                  {c.positioning && <p className="text-xs text-text-secondary mt-1">{c.positioning}</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2">
                    {c.strengths && <p className="text-2xs text-success">+ {c.strengths}</p>}
                    {c.weaknesses && <p className="text-2xs text-error">− {c.weaknesses}</p>}
                    {c.pricing && <p className="text-2xs text-text-tertiary">Pricing: {c.pricing}</p>}
                    {c.channels && <p className="text-2xs text-text-tertiary">Canali: {c.channels}</p>}
                  </div>
                  {c.notes && <p className="text-2xs text-text-tertiary mt-1.5 italic">{c.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(c)} aria-label="Modifica competitor"
                    className="p-1 text-text-tertiary hover:text-text-primary"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(c.id)} aria-label="Elimina competitor"
                    className="p-1 text-text-tertiary hover:text-error"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-dashed border-border p-3 space-y-2">
            <p className="text-2xs uppercase tracking-wider font-bold text-text-tertiary">
              {editing ? 'Modifica competitor' : 'Nuovo competitor'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} placeholder="Nome *" className={inp} />
              <input value={draft.website} onChange={e => setDraft(p => ({ ...p, website: e.target.value }))} placeholder="Sito web" className={inp} />
              <input value={draft.positioning} onChange={e => setDraft(p => ({ ...p, positioning: e.target.value }))} placeholder="Posizionamento" className={`${inp} sm:col-span-2`} />
              <input value={draft.strengths} onChange={e => setDraft(p => ({ ...p, strengths: e.target.value }))} placeholder="Punti di forza" className={inp} />
              <input value={draft.weaknesses} onChange={e => setDraft(p => ({ ...p, weaknesses: e.target.value }))} placeholder="Punti di debolezza" className={inp} />
              <input value={draft.pricing} onChange={e => setDraft(p => ({ ...p, pricing: e.target.value }))} placeholder="Pricing (se noto)" className={inp} />
              <input value={draft.channels} onChange={e => setDraft(p => ({ ...p, channels: e.target.value }))} placeholder="Canali" className={inp} />
              <textarea value={draft.notes} onChange={e => setDraft(p => ({ ...p, notes: e.target.value }))} placeholder="Note / link" rows={2} className={`${inp} sm:col-span-2 resize-none`} />
            </div>
            <div className="flex justify-end gap-2">
              {editing && <button onClick={reset} className="text-xs text-text-secondary hover:text-text-primary px-3 py-1.5">Annulla</button>}
              <button onClick={submit} disabled={!draft.name.trim() || busy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-on-gold text-xs font-bold rounded-lg disabled:opacity-40">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                {editing ? 'Salva' : 'Aggiungi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// ── Idee ─────────────────────────────────────────────────────────────────────
function IdeasSection({ clientId, items, setItems, isOpen, toggle }: {
  clientId: string; items: ClientIdea[]; setItems: (f: (p: ClientIdea[]) => ClientIdea[]) => void
  isOpen: boolean; toggle: () => void
}) {
  const [draft, setDraft] = useState<{ title: string; description: string; category: IdeaCategory; priority: TaskPriority }>(
    { title: '', description: '', category: 'growth', priority: 'media' },
  )
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!draft.title.trim() || busy) return
    setBusy(true)
    try {
      const saved = await saveIdea(clientId, null, { ...draft, status: 'proposta', position: items.length })
      setItems(prev => [...prev, saved])
      setDraft({ title: '', description: '', category: 'growth', priority: 'media' })
      toast.success('Idea aggiunta')
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }

  const patch = async (idea: ClientIdea, p: Partial<ClientIdea>) => {
    setItems(prev => prev.map(i => i.id === idea.id ? { ...i, ...p } : i))
    try { await saveIdea(clientId, idea.id, { title: idea.title, ...p }) }
    catch (e) { toast.error((e as Error).message) }
  }

  const remove = async (id: string) => {
    if (!confirm('Eliminare questa idea?')) return
    try {
      await deleteIdea(clientId, id)
      setItems(prev => prev.filter(i => i.id !== id))
      toast.success('Eliminata')
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <section className="bg-surface border border-border rounded-2xl overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center gap-3 p-4 hover:bg-surface-hover transition-colors text-left">
        <div className="w-8 h-8 rounded-lg bg-overlay/[0.04] flex items-center justify-center shrink-0">
          <Lightbulb className="w-4 h-4 text-gold-text" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-primary">Idee</p>
          <p className="text-2xs text-text-secondary mt-0.5">Growth, digital, AI, contenuti, advertising, prodotto — con priorità e stato</p>
        </div>
        <span className="text-2xs text-text-tertiary shrink-0">{items.length}</span>
        {isOpen ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />}
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-4 space-y-2 border-t border-border">
          {items.map(i => (
            <div key={i.id} className="flex items-start gap-2.5 rounded-xl border border-border bg-background p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary font-medium">{i.title}</p>
                {i.description && <p className="text-2xs text-text-secondary mt-0.5">{i.description}</p>}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface-hover text-text-secondary">
                    {i.category}
                  </span>
                  <select value={i.priority} onChange={e => patch(i, { priority: e.target.value as TaskPriority })}
                    aria-label="Priorità idea"
                    className="bg-background border border-border rounded-md px-1.5 py-0.5 text-2xs text-text-primary focus:outline-none focus:border-gold/40">
                    <option value="alta">Alta</option><option value="media">Media</option><option value="bassa">Bassa</option>
                  </select>
                  <select value={i.status} onChange={e => patch(i, { status: e.target.value as IdeaStatus })}
                    aria-label="Stato idea"
                    className={`border-0 rounded-md px-1.5 py-0.5 text-2xs font-semibold focus:outline-none ${STATUS_STYLE[i.status]}`}>
                    {IDEA_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={() => remove(i.id)} aria-label="Elimina idea"
                className="p-1 text-text-tertiary hover:text-error shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}

          <div className="rounded-xl border border-dashed border-border p-3 space-y-2">
            <input value={draft.title} onChange={e => setDraft(p => ({ ...p, title: e.target.value }))}
              placeholder="Nuova idea…" className={inp} />
            <textarea value={draft.description} onChange={e => setDraft(p => ({ ...p, description: e.target.value }))}
              placeholder="Descrizione (opzionale)" rows={2} className={`${inp} resize-none`} />
            <div className="flex items-center gap-2 flex-wrap">
              <select value={draft.category} onChange={e => setDraft(p => ({ ...p, category: e.target.value as IdeaCategory }))}
                aria-label="Categoria idea"
                className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold">
                {IDEA_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={draft.priority} onChange={e => setDraft(p => ({ ...p, priority: e.target.value as TaskPriority }))}
                aria-label="Priorità nuova idea"
                className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold">
                <option value="alta">Alta</option><option value="media">Media</option><option value="bassa">Bassa</option>
              </select>
              <div className="flex-1" />
              <button onClick={add} disabled={!draft.title.trim() || busy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-on-gold text-xs font-bold rounded-lg disabled:opacity-40">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Aggiungi
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// ── Marginalità (admin-only) ─────────────────────────────────────────────────
function EconomicsSection({ clientId, value, setValue, isOpen, toggle }: {
  clientId: string; value: ClientEconomics | null; setValue: (v: ClientEconomics) => void
  isOpen: boolean; toggle: () => void
}) {
  const [form, setForm] = useState({
    margin_notes: value?.margin_notes ?? '', cost_notes: value?.cost_notes ?? '',
    pricing_notes: value?.pricing_notes ?? '', founder_notes: value?.founder_notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const set = (k: keyof typeof form, v: string) => { setForm(p => ({ ...p, [k]: v })); setDirty(true) }

  const save = async () => {
    setSaving(true)
    try {
      const saved = await upsertClientEconomics({
        client_id: clientId,
        margin_notes: form.margin_notes || null, cost_notes: form.cost_notes || null,
        pricing_notes: form.pricing_notes || null, founder_notes: form.founder_notes || null,
      })
      setValue(saved); setDirty(false)
      toast.success('Marginalità salvata')
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  const FIELDS: { k: keyof typeof form; label: string; ph: string }[] = [
    { k: 'margin_notes',  label: 'Marginalità',   ph: 'Margine stimato, andamento, criticità…' },
    { k: 'cost_notes',    label: 'Costi',         ph: 'Costi risorse, tool, media buying…' },
    { k: 'pricing_notes', label: 'Pricing',       ph: 'Fee concordata, revisioni, sconti applicati…' },
    { k: 'founder_notes', label: 'Note founder',  ph: 'Considerazioni riservate sulla relazione economica…' },
  ]

  return (
    <section className="bg-surface border border-error/20 rounded-2xl overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center gap-3 p-4 hover:bg-surface-hover transition-colors text-left">
        <div className="w-8 h-8 rounded-lg bg-error/10 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-error" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-primary">Marginalità e informazioni economiche</p>
          <p className="text-2xs text-error mt-0.5">Area riservata — visibile solo ad admin e founder, mai alle risorse</p>
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />}
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-4 space-y-3 border-t border-border">
          {FIELDS.map(f => (
            <div key={f.k}>
              <label className="block text-xs text-text-secondary mb-1.5">{f.label}</label>
              <textarea value={form[f.k]} onChange={e => set(f.k, e.target.value)} placeholder={f.ph}
                rows={2} className={`${inp} resize-none`} />
            </div>
          ))}
          <div className="flex justify-end">
            <button onClick={save} disabled={saving || !dirty}
              className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-xs font-bold rounded-lg disabled:opacity-40">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {dirty ? 'Salva' : 'Salvato'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

'use client'

import { useState } from 'react'
import { Plus, TrendingUp, Target, Clock, CheckCircle2, XCircle, Phone, Mail, Calendar, Pencil, Trash2, X, Loader2, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Deal, DealStage, Profile, Client } from '@/lib/types/database'
import { LeadGenModule } from './LeadGenModule'

interface Props {
  deals: Deal[]
  profiles: Profile[]
  clients: Pick<Client, 'id' | 'company_name'>[]
  currentUserId: string
}

const STAGES: { key: DealStage; label: string; color: string; bg: string }[] = [
  { key: 'lead',          label: 'Lead',          color: 'text-text-secondary', bg: 'bg-[#1A1A1A]' },
  { key: 'contatto',      label: 'Contatto',      color: 'text-blue-400',       bg: 'bg-blue-400/10' },
  { key: 'proposta',      label: 'Proposta',      color: 'text-warning',        bg: 'bg-warning/10' },
  { key: 'trattativa',    label: 'Trattativa',    color: 'text-gold',           bg: 'bg-gold/10' },
  { key: 'chiuso_vinto',  label: 'Vinto',         color: 'text-success',        bg: 'bg-success/10' },
  { key: 'chiuso_perso',  label: 'Perso',         color: 'text-error',          bg: 'bg-error/10' },
]

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  chiamata: Phone, email: Mail, meeting: Calendar, nota: Pencil, followup: Clock,
}

const ic = 'w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50'

function fmt(v: number) { return '€' + v.toLocaleString('it-IT') }

function StageBadge({ stage }: { stage: DealStage }) {
  const s = STAGES.find(x => x.key === stage)!
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.color} ${s.bg}`}>{s.label}</span>
}

function DealModal({ deal, profiles, clients, onClose, onSaved }: {
  deal?: Deal | null
  profiles: Profile[]
  clients: Pick<Client, 'id' | 'company_name'>[]
  onClose: () => void
  onSaved: (d: Deal) => void
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    title: deal?.title ?? '',
    company_name: deal?.company_name ?? '',
    contact_name: deal?.contact_name ?? '',
    contact_email: deal?.contact_email ?? '',
    contact_phone: deal?.contact_phone ?? '',
    value: deal?.value?.toString() ?? '',
    stage: deal?.stage ?? 'lead' as DealStage,
    probability: deal?.probability?.toString() ?? '50',
    expected_close: deal?.expected_close ?? '',
    source: deal?.source ?? '',
    notes: deal?.notes ?? '',
    assigned_to: deal?.assigned_to ?? '',
    client_id: deal?.client_id ?? '',
  })

  const f = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs text-text-secondary mb-1">{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder} className={ic} />
    </div>
  )

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.company_name) { toast.error('Titolo e azienda obbligatori'); return }
    setLoading(true)
    const supabase = createClient()
    const payload = {
      title: form.title, company_name: form.company_name,
      contact_name: form.contact_name || null, contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null, value: form.value ? parseFloat(form.value) : null,
      stage: form.stage, probability: parseInt(form.probability) || 50,
      expected_close: form.expected_close || null, source: form.source || null,
      notes: form.notes || null, assigned_to: form.assigned_to || null,
      client_id: form.client_id || null,
    }
    const result = deal
      ? await supabase.from('deals').update(payload).eq('id', deal.id).select().single()
      : await supabase.from('deals').insert(payload).select().single()
    setLoading(false)
    if (result.error) { toast.error(result.error.message); return }
    toast.success(deal ? 'Deal aggiornato' : 'Deal creato')
    onSaved(result.data as Deal)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#161616] border border-[#2A2A2A] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A] sticky top-0 bg-[#161616]">
          <h2 className="text-base font-bold text-white">{deal ? 'Modifica deal' : 'Nuovo deal'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary" /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-3">
          {f('Titolo *', 'title', 'text', 'es. Campagna Growth Farmacia Rossi')}
          {f('Azienda *', 'company_name', 'text', 'es. Farmacia Rossi Srl')}
          <div className="grid grid-cols-2 gap-3">
            {f('Referente', 'contact_name')}
            {f('Email', 'contact_email', 'email')}
            {f('Telefono', 'contact_phone', 'tel')}
            {f('Valore stimato (€)', 'value', 'number', 'es. 2400')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Stage</label>
              <select value={form.stage} onChange={e => setForm(p => ({ ...p, stage: e.target.value as DealStage }))} className={ic}>
                {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Probabilità %</label>
              <input type="number" min="0" max="100" value={form.probability}
                onChange={e => setForm(p => ({ ...p, probability: e.target.value }))} className={ic} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {f('Chiusura prevista', 'expected_close', 'date')}
            <div>
              <label className="block text-xs text-text-secondary mb-1">Assegnato a</label>
              <select value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))} className={ic}>
                <option value="">— Nessuno —</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Cliente esistente (se già attivo)</label>
            <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))} className={ic}>
              <option value="">— Nessuno —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Note</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2} className={`${ic} resize-none`} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-[#2A2A2A] rounded-lg text-sm text-text-secondary hover:text-white">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-black font-bold rounded-lg hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}{deal ? 'Aggiorna' : 'Crea deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function CommercialeClient({ deals: initialDeals, profiles, clients, currentUserId }: Props) {
  const [deals, setDeals] = useState(initialDeals)
  const [section, setSection] = useState<'pipeline' | 'leadgen'>('pipeline')
  const [view, setView] = useState<'kanban' | 'lista'>('kanban')
  const [showModal, setShowModal] = useState(false)
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [activityType, setActivityType] = useState<'nota' | 'chiamata' | 'email' | 'meeting' | 'followup'>('nota')
  const [activityText, setActivityText] = useState('')
  const [activities, setActivities] = useState<{ id: string; type: string; content: string; created_at: string }[]>([])
  const [loadingActivity, setLoadingActivity] = useState(false)

  const openDeal = async (d: Deal) => {
    setSelectedDeal(d)
    const supabase = createClient()
    const { data } = await supabase.from('deal_activities').select('*').eq('deal_id', d.id).order('created_at', { ascending: false })
    setActivities(data ?? [])
  }

  const addActivity = async () => {
    if (!activityText.trim() || !selectedDeal) return
    setLoadingActivity(true)
    const supabase = createClient()
    const { data } = await supabase.from('deal_activities').insert({
      deal_id: selectedDeal.id, type: activityType, content: activityText, created_by: currentUserId,
    }).select().single()
    setLoadingActivity(false)
    if (data) { setActivities(p => [data, ...p]); setActivityText('') }
  }

  const moveStage = async (deal: Deal, stage: DealStage) => {
    const supabase = createClient()
    await supabase.from('deals').update({ stage }).eq('id', deal.id)
    setDeals(p => p.map(d => d.id === deal.id ? { ...d, stage } : d))
    if (selectedDeal?.id === deal.id) setSelectedDeal(prev => prev ? { ...prev, stage } : prev)
  }

  const deleteDeal = async (id: string) => {
    if (!confirm('Eliminare questo deal?')) return
    const supabase = createClient()
    await supabase.from('deals').delete().eq('id', id)
    setDeals(p => p.filter(d => d.id !== id))
    if (selectedDeal?.id === id) setSelectedDeal(null)
    toast.success('Deal eliminato')
  }

  const handleSaved = (d: Deal) => {
    setDeals(p => {
      const exists = p.find(x => x.id === d.id)
      return exists ? p.map(x => x.id === d.id ? d : x) : [d, ...p]
    })
  }

  // Metriche
  const activeDeals = deals.filter(d => !['chiuso_vinto', 'chiuso_perso'].includes(d.stage))
  const wonDeals = deals.filter(d => d.stage === 'chiuso_vinto')
  const pipeline = activeDeals.reduce((s, d) => s + (d.value ?? 0) * (d.probability / 100), 0)
  const wonValue = wonDeals.reduce((s, d) => s + (d.value ?? 0), 0)
  const convRate = deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">Area Commerciale</h1>
          <p className="text-text-secondary text-sm mt-0.5">Pipeline, offerte e acquisizione nuovi clienti</p>
        </div>
        <div className="flex items-center gap-2">
          {section === 'pipeline' && (
            <>
              <div className="flex bg-surface border border-[#2A2A2A] rounded-lg overflow-hidden">
                {(['kanban', 'lista'] as const).map(v => (
                  <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${view === v ? 'bg-gold text-black' : 'text-text-secondary hover:text-white'}`}>{v}</button>
                ))}
              </div>
              <button onClick={() => { setEditingDeal(null); setShowModal(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-black text-sm font-bold rounded-lg hover:bg-yellow-400">
                <Plus className="w-4 h-4" /> Nuovo deal
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg overflow-hidden w-fit">
        {([['pipeline', 'Pipeline'], ['leadgen', 'Lead Gen']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setSection(key)}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${section === key ? 'bg-[#F5C800] text-black' : 'text-[#666] hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {section === 'leadgen' && <LeadGenModule clients={clients} />}
      {section === 'pipeline' && (<>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: 'Pipeline ponderata', v: fmt(Math.round(pipeline)), c: 'text-gold' },
          { l: 'Deal attivi', v: activeDeals.length.toString(), c: 'text-white' },
          { l: 'Valore chiuso', v: fmt(Math.round(wonValue)), c: 'text-success' },
          { l: 'Conv. rate', v: `${convRate}%`, c: convRate >= 30 ? 'text-success' : 'text-warning' },
        ].map(k => (
          <div key={k.l} className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
            <p className="text-xs text-text-secondary mb-1">{k.l}</p>
            <p className={`text-xl font-black ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* Vista Kanban */}
      {view === 'kanban' && (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-max">
            {STAGES.filter(s => s.key !== 'chiuso_perso').map(stage => {
              const stageDeals = deals.filter(d => d.stage === stage.key)
              const stageValue = stageDeals.reduce((s, d) => s + (d.value ?? 0), 0)
              return (
                <div key={stage.key} className="w-64 flex-shrink-0">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${stage.color}`}>{stage.label}</span>
                      <span className="text-[10px] text-text-secondary bg-[#2A2A2A] rounded-full px-1.5 py-0.5">{stageDeals.length}</span>
                    </div>
                    {stageValue > 0 && <span className="text-[10px] text-text-secondary">{fmt(stageValue)}</span>}
                  </div>
                  <div className="space-y-2">
                    {stageDeals.map(d => (
                      <div key={d.id} onClick={() => openDeal(d)}
                        className="bg-surface border border-[#2A2A2A] rounded-xl p-3 cursor-pointer hover:border-gold/30 transition-colors">
                        <p className="text-sm font-semibold text-white mb-0.5">{d.title}</p>
                        <p className="text-xs text-text-secondary mb-2">{d.company_name}</p>
                        {d.value && <p className="text-xs font-bold text-gold">{fmt(d.value)}</p>}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-text-secondary">{d.probability}%</span>
                          {d.expected_close && (
                            <span className={`text-[10px] ${new Date(d.expected_close) < new Date() ? 'text-error' : 'text-text-secondary'}`}>
                              {new Date(d.expected_close).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                        {d.probability > 0 && (
                          <div className="h-1 bg-[#2A2A2A] rounded-full overflow-hidden mt-2">
                            <div className="h-full bg-gold rounded-full" style={{ width: `${d.probability}%` }} />
                          </div>
                        )}
                      </div>
                    ))}
                    <button onClick={() => { setEditingDeal(null); setShowModal(true) }}
                      className="w-full py-2 border border-dashed border-[#2A2A2A] rounded-xl text-xs text-text-secondary hover:text-gold hover:border-gold/30 transition-colors">
                      + Aggiungi
                    </button>
                  </div>
                </div>
              )
            })}
            {/* Colonna persi */}
            <div className="w-64 flex-shrink-0 opacity-60">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-xs font-bold text-error">Perso</span>
                <span className="text-[10px] text-text-secondary bg-[#2A2A2A] rounded-full px-1.5 py-0.5">{deals.filter(d => d.stage === 'chiuso_perso').length}</span>
              </div>
              <div className="space-y-2">
                {deals.filter(d => d.stage === 'chiuso_perso').map(d => (
                  <div key={d.id} onClick={() => openDeal(d)}
                    className="bg-surface border border-[#2A2A2A] rounded-xl p-3 cursor-pointer hover:border-white/10 transition-colors">
                    <p className="text-xs font-semibold text-text-secondary">{d.title}</p>
                    <p className="text-[10px] text-[#444]">{d.company_name}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vista Lista */}
      {view === 'lista' && (
        <div className="bg-surface border border-[#2A2A2A] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2A2A2A] bg-[#111]">
                {['Deal', 'Azienda', 'Valore', 'Stage', 'Prob.', 'Chiusura', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2A]">
              {deals.map(d => (
                <tr key={d.id} className="hover:bg-white/3 cursor-pointer" onClick={() => openDeal(d)}>
                  <td className="px-4 py-3 text-sm font-semibold text-white">{d.title}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.company_name}</td>
                  <td className="px-4 py-3 text-sm font-bold text-gold">{d.value ? fmt(d.value) : '—'}</td>
                  <td className="px-4 py-3"><StageBadge stage={d.stage} /></td>
                  <td className="px-4 py-3 text-sm text-white">{d.probability}%</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.expected_close ? new Date(d.expected_close).toLocaleDateString('it-IT') : '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={e => { e.stopPropagation(); setEditingDeal(d); setShowModal(true) }} className="p-1 text-text-secondary hover:text-gold"><Pencil className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {deals.length === 0 && <p className="text-center py-12 text-text-secondary text-sm">Nessun deal ancora — crea il primo</p>}
        </div>
      )}

      {/* Pannello deal selezionato */}
      {selectedDeal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-end p-4"
          onClick={e => e.target === e.currentTarget && setSelectedDeal(null)}>
          <div className="bg-[#161616] border border-[#2A2A2A] rounded-2xl w-full max-w-md h-full max-h-[95vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A]">
              <div>
                <p className="text-sm font-bold text-white">{selectedDeal.title}</p>
                <p className="text-xs text-text-secondary">{selectedDeal.company_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditingDeal(selectedDeal); setShowModal(true) }} className="p-1.5 text-text-secondary hover:text-gold"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => deleteDeal(selectedDeal.id)} className="p-1.5 text-text-secondary hover:text-error"><Trash2 className="w-4 h-4" /></button>
                <button onClick={() => setSelectedDeal(null)}><X className="w-5 h-5 text-text-secondary" /></button>
              </div>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#111] rounded-lg p-3">
                  <p className="text-[10px] text-text-secondary">Valore</p>
                  <p className="text-base font-black text-gold">{selectedDeal.value ? fmt(selectedDeal.value) : '—'}</p>
                </div>
                <div className="bg-[#111] rounded-lg p-3">
                  <p className="text-[10px] text-text-secondary">Stage</p>
                  <StageBadge stage={selectedDeal.stage} />
                </div>
              </div>
              {selectedDeal.contact_email && (
                <a href={`mailto:${selectedDeal.contact_email}`} className="flex items-center gap-2 text-xs text-text-secondary hover:text-gold">
                  <Mail className="w-3.5 h-3.5" /> {selectedDeal.contact_email}
                </a>
              )}
              {selectedDeal.contact_phone && (
                <a href={`tel:${selectedDeal.contact_phone}`} className="flex items-center gap-2 text-xs text-text-secondary hover:text-gold">
                  <Phone className="w-3.5 h-3.5" /> {selectedDeal.contact_phone}
                </a>
              )}
              {/* Sposta stage */}
              <div>
                <p className="text-xs text-text-secondary mb-2">Sposta a</p>
                <div className="flex flex-wrap gap-1.5">
                  {STAGES.filter(s => s.key !== selectedDeal.stage).map(s => (
                    <button key={s.key} onClick={() => moveStage(selectedDeal, s.key)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${s.color} ${s.bg} border-current/20`}>
                      {s.label} <ChevronRight className="w-3 h-3 inline" />
                    </button>
                  ))}
                </div>
              </div>
              {selectedDeal.notes && (
                <div className="bg-[#111] rounded-lg p-3 text-xs text-text-secondary">{selectedDeal.notes}</div>
              )}
              {/* Attività */}
              <div>
                <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">Log attività</p>
                <div className="flex gap-2 mb-3">
                  <select value={activityType} onChange={e => setActivityType(e.target.value as typeof activityType)}
                    className="bg-[#111] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold/50">
                    <option value="nota">Nota</option>
                    <option value="chiamata">Chiamata</option>
                    <option value="email">Email</option>
                    <option value="meeting">Meeting</option>
                    <option value="followup">Follow-up</option>
                  </select>
                  <input value={activityText} onChange={e => setActivityText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addActivity()}
                    placeholder="Aggiungi nota..." className="flex-1 bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-gold/50" />
                  <button onClick={addActivity} disabled={loadingActivity || !activityText.trim()}
                    className="px-3 py-1.5 bg-gold text-black text-xs font-bold rounded-lg disabled:opacity-50">
                    {loadingActivity ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  </button>
                </div>
                <div className="space-y-2">
                  {activities.map(a => {
                    const Icon = ACTIVITY_ICONS[a.type] ?? Pencil
                    return (
                      <div key={a.id} className="flex gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#2A2A2A] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Icon className="w-3 h-3 text-text-secondary" />
                        </div>
                        <div>
                          <p className="text-xs text-white">{a.content}</p>
                          <p className="text-[10px] text-text-secondary">{new Date(a.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                    )
                  })}
                  {activities.length === 0 && <p className="text-xs text-[#444]">Nessuna attività ancora</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <DealModal
          deal={editingDeal}
          profiles={profiles}
          clients={clients}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
      </>)}
    </div>
  )
}

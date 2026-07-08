'use client'

import { useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import {
  Calculator, Brain, Loader2, Plus, Trash2, Pencil, Check, X,
  DollarSign, TrendingUp, Users, AlertTriangle, BarChart3,
  ChevronDown, ChevronRight, Building2, FolderKanban, ArrowRight,
  Target, PieChart, Upload, Sparkles, FileSpreadsheet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import type {
  Client, Project, Invoice, ResourceCost, ResourceCostType, ResourceType,
  ProjectCostEntry, ProjectCostCategory, BusinessCost, BusinessCostCategory, Profile,
} from '@/lib/types/database'

type ActiveTab = 'panoramica' | 'risorse' | 'costi_fissi' | 'progetti' | 'ai_analisi'

const TABS: { key: ActiveTab; label: string; icon: React.ReactNode }[] = [
  { key: 'panoramica', label: 'Panoramica', icon: <PieChart className="w-4 h-4" /> },
  { key: 'risorse', label: 'Costo Risorse', icon: <Users className="w-4 h-4" /> },
  { key: 'costi_fissi', label: 'Costi Fissi', icon: <Building2 className="w-4 h-4" /> },
  { key: 'progetti', label: 'Per Progetto', icon: <FolderKanban className="w-4 h-4" /> },
  { key: 'ai_analisi', label: 'AI Analisi', icon: <Brain className="w-4 h-4" /> },
]

const COST_CATEGORIES: { key: ProjectCostCategory; label: string; color: string }[] = [
  { key: 'risorsa', label: 'Risorsa', color: 'text-blue-400' },
  { key: 'software', label: 'Software', color: 'text-purple-400' },
  { key: 'provvigione', label: 'Provvigione', color: 'text-amber-400' },
  { key: 'cac', label: 'CAC', color: 'text-orange-400' },
  { key: 'produzione', label: 'Produzione', color: 'text-emerald-400' },
  { key: 'indiretto', label: 'Indiretto', color: 'text-gray-400' },
  { key: 'altro', label: 'Altro', color: 'text-white/50' },
]

const BIZ_CATEGORIES: { key: BusinessCostCategory; label: string }[] = [
  { key: 'affitto', label: 'Affitto' },
  { key: 'software', label: 'Software' },
  { key: 'amministrazione', label: 'Amministrazione' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'personale', label: 'Personale' },
  { key: 'formazione', label: 'Formazione' },
  { key: 'altro', label: 'Altro' },
]

const RESOURCE_TYPES: { key: ResourceType; label: string }[] = [
  { key: 'internal_employee', label: 'Dipendente' },
  { key: 'external_freelancer', label: 'Freelancer' },
  { key: 'partner', label: 'Partner' },
  { key: 'consultant', label: 'Consulente' },
  { key: 'contractor', label: 'Contractor' },
  { key: 'agency_supplier', label: 'Fornitore' },
]

const COST_TYPES: { key: ResourceCostType; label: string }[] = [
  { key: 'monthly_salary', label: 'Stipendio mensile' },
  { key: 'hourly', label: 'Tariffa oraria' },
  { key: 'daily', label: 'Tariffa giornaliera' },
  { key: 'retainer', label: 'Retainer' },
  { key: 'project_fee', label: 'Fee progetto' },
  { key: 'partner_percentage', label: '% partner' },
]

interface Props {
  clients: Client[]
  projects: Project[]
  invoices: Invoice[]
  resourceCosts: ResourceCost[]
  projectCosts: ProjectCostEntry[]
  businessCosts: BusinessCost[]
  profiles: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>[]
  currentProfile: Profile
}

interface AIResult {
  fatturato_totale: number
  costi_totali: number
  margine_netto_pct: number
  break_even_mensile: number
  saturazione_media_pct: number
  roi_medio_risorse: number
  top_clients: { name: string; margin_pct: number; revenue: number }[]
  alerts: { level: string; message: string }[]
  raccomandazioni: string[]
  analisi_narrativa: string
}

export function ControlloGestioneClient({
  clients: initClients, projects: initProjects, invoices,
  resourceCosts: initResources, projectCosts: initPCosts,
  businessCosts: initBizCosts, profiles,
}: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('panoramica')
  const [resources, setResources] = useState(initResources)
  const [bizCosts, setBizCosts] = useState(initBizCosts)
  const [pCosts, setPCosts] = useState(initPCosts)

  const [showAddResource, setShowAddResource] = useState(false)
  const [showAddBiz, setShowAddBiz] = useState(false)
  const [editingResource, setEditingResource] = useState<string | null>(null)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [showAddCost, setShowAddCost] = useState<string | null>(null)

  const [aiResult, setAiResult] = useState<AIResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<{ target: string; rows: Record<string, unknown>[] } | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadTarget, setUploadTarget] = useState<'resource_costs' | 'business_costs' | 'project_costs'>('resource_costs')

  const sb = createClient()

  const externalClients = initClients.filter(c => !c.is_internal)

  const totalRevenue = invoices.filter(i => i.status === 'pagata').reduce((s, i) => s + i.amount, 0)
  const totalMRR = externalClients.reduce((s, c) => s + (c.mrr ?? 0), 0)
  const totalDirectCosts = pCosts.filter(c => c.category !== 'indiretto').reduce((s, c) => s + c.amount, 0)
  const totalIndirectCosts = pCosts.filter(c => c.category === 'indiretto').reduce((s, c) => s + c.amount, 0)
  const monthlyOverhead = bizCosts.filter(b => b.is_active).reduce((s, b) => s + b.monthly_amount, 0)
  const totalCosts = totalDirectCosts + totalIndirectCosts
  const grossMargin = totalRevenue - totalCosts
  const marginPct = totalRevenue > 0 ? Math.round((grossMargin / totalRevenue) * 100) : 0
  const totalResourceCostMonthly = resources.filter(r => r.is_active).reduce((s, r) => s + (r.monthly_cost ?? 0), 0)

  const projectsWithCosts = useMemo(() => {
    return initProjects.map(p => {
      const client = initClients.find(c => c.id === p.client_id)
      const costs = pCosts.filter(c => c.project_id === p.id)
      const revenue = invoices
        .filter(i => i.client_id === p.client_id && i.status === 'pagata')
        .reduce((s, i) => s + i.amount, 0)
      const totalCost = costs.reduce((s, c) => s + c.amount, 0)
      return { ...p, client, costs, revenue, totalCost, margin: revenue - totalCost }
    }).sort((a, b) => b.totalCost - a.totalCost)
  }, [initProjects, initClients, pCosts, invoices])

  // ── Resource CRUD ──
  const addResource = async (form: Partial<ResourceCost> & { name: string }) => {
    const monthly = form.monthly_cost ?? 0
    const avail = form.availability_hours_month ?? 160
    const billable = form.billable_target_hours_month ?? 120
    const hourly = form.cost_type === 'monthly_salary'
      ? +(monthly / billable).toFixed(2)
      : (form.hourly_cost ?? 0)

    const { data, error } = await sb.from('resource_costs').insert({
      ...form,
      calculated_hourly_cost: hourly,
      availability_hours_month: avail,
      billable_target_hours_month: billable,
    }).select().single()
    if (error) { toast.error(error.message); return }
    setResources(prev => [...prev, data as ResourceCost])
    setShowAddResource(false)
    toast.success('Risorsa aggiunta')
  }

  const updateResource = async (id: string, updates: Partial<ResourceCost>) => {
    if (updates.monthly_cost !== undefined || updates.billable_target_hours_month !== undefined) {
      const curr = resources.find(r => r.id === id)
      if (curr) {
        const mc = updates.monthly_cost ?? curr.monthly_cost ?? 0
        const bt = updates.billable_target_hours_month ?? curr.billable_target_hours_month
        if (curr.cost_type === 'monthly_salary' && bt > 0) {
          updates.calculated_hourly_cost = +(mc / bt).toFixed(2)
        }
      }
    }
    const { error } = await sb.from('resource_costs').update(updates).eq('id', id)
    if (error) { toast.error(error.message); return }
    setResources(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
    setEditingResource(null)
    toast.success('Aggiornato')
  }

  const deleteResource = async (id: string) => {
    if (!confirm('Eliminare questa risorsa?')) return
    const { error } = await sb.from('resource_costs').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setResources(prev => prev.filter(r => r.id !== id))
    toast.success('Eliminata')
  }

  // ── Business costs CRUD ──
  const addBizCost = async (form: { category: BusinessCostCategory; description: string; monthly_amount: string }) => {
    const { data, error } = await sb.from('business_costs').insert({
      category: form.category,
      description: form.description.trim(),
      monthly_amount: parseFloat(form.monthly_amount) || 0,
    }).select().single()
    if (error) { toast.error(error.message); return }
    setBizCosts(prev => [...prev, data as BusinessCost])
    setShowAddBiz(false)
    toast.success('Costo fisso aggiunto')
  }

  const deleteBizCost = async (id: string) => {
    const { error } = await sb.from('business_costs').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setBizCosts(prev => prev.filter(b => b.id !== id))
    toast.success('Eliminato')
  }

  // ── Project cost CRUD ──
  const addProjectCost = async (projectId: string, clientId: string | null, form: {
    category: ProjectCostCategory; description: string; amount: string;
    hours: string; hourly_rate: string; resource_cost_id: string
  }) => {
    const hrs = parseFloat(form.hours) || null
    const rate = parseFloat(form.hourly_rate) || null
    const amt = (form.category === 'risorsa' && hrs && rate) ? hrs * rate : (parseFloat(form.amount) || 0)

    const { data, error } = await sb.from('project_cost_entries').insert({
      project_id: projectId,
      client_id: clientId,
      category: form.category,
      description: form.description.trim(),
      amount: amt,
      resource_cost_id: form.resource_cost_id || null,
      hours: hrs,
      hourly_rate: rate,
    }).select().single()
    if (error) { toast.error(error.message); return }
    setPCosts(prev => [...prev, data as ProjectCostEntry])
    setShowAddCost(null)
    toast.success('Costo aggiunto')
  }

  const deleteProjectCost = async (id: string) => {
    const { error } = await sb.from('project_cost_entries').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setPCosts(prev => prev.filter(c => c.id !== id))
    toast.success('Eliminato')
  }

  // ── Upload file ──
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('target', uploadTarget)
      const res = await fetch('/api/ai/parse-costs', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.error) { toast.error(data.error); return }
      setUploadPreview({ target: uploadTarget, rows: data.rows })
      toast.success(`${data.rows.length} righe estratte da ${file.name}`)
    } catch { toast.error('Errore upload') }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const confirmUpload = async () => {
    if (!uploadPreview) return
    setUploading(true)
    const { target, rows } = uploadPreview
    let count = 0
    for (const row of rows) {
      if (target === 'resource_costs') {
        const r = row as Record<string, unknown>
        const monthly = Number(r.monthly_cost) || 0
        const billable = Number(r.billable_target_hours_month) || 120
        const hourly = r.cost_type === 'monthly_salary' && billable > 0
          ? +(monthly / billable).toFixed(2)
          : (Number(r.hourly_cost) || 0)
        const { error } = await sb.from('resource_costs').insert({
          name: String(r.name ?? 'Risorsa'),
          resource_type: String(r.resource_type ?? 'internal_employee'),
          cost_type: String(r.cost_type ?? 'monthly_salary'),
          role_title: r.role_title ? String(r.role_title) : null,
          department: r.department ? String(r.department) : null,
          monthly_cost: monthly,
          hourly_cost: Number(r.hourly_cost) || null,
          availability_hours_month: Number(r.availability_hours_month) || 160,
          billable_target_hours_month: billable,
          calculated_hourly_cost: hourly,
          markup_default: Number(r.markup_default) || 2,
          tools_cost_monthly: Number(r.tools_cost_monthly) || 0,
          notes: r.notes ? String(r.notes) : null,
        })
        if (!error) count++
      } else if (target === 'business_costs') {
        const b = row as Record<string, unknown>
        const { error } = await sb.from('business_costs').insert({
          category: String(b.category ?? 'altro'),
          description: String(b.description ?? ''),
          monthly_amount: Number(b.monthly_amount) || 0,
          notes: b.notes ? String(b.notes) : null,
        })
        if (!error) count++
      }
    }
    toast.success(`${count} voci caricate`)
    setUploadPreview(null)
    setUploading(false)
    window.location.reload()
  }

  // ── AI Suggestions ──
  const fetchSuggestions = async (type: 'resource' | 'business' | 'project') => {
    setSuggesting(true)
    try {
      const context = type === 'resource'
        ? `Agenzia TwoBee: ${resources.length} risorse attuali, ${externalClients.length} clienti, servizi growth + digital + marketing + AI`
        : type === 'business'
        ? `Agenzia TwoBee: sede in Italia, ${resources.filter(r => r.is_active).length} risorse attive, costi fissi attuali: ${formatCurrency(monthlyOverhead)}/mese`
        : undefined
      const res = await fetch('/api/ai/cost-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, context }),
      })
      const data = await res.json()
      if (data.error) { toast.error(data.error); return }
      const target = type === 'resource' ? 'resource_costs' : type === 'business' ? 'business_costs' : 'project_costs'
      setUploadPreview({ target, rows: data.suggestions })
      toast.success(`${data.suggestions.length} suggerimenti AI generati`)
    } catch { toast.error('Errore AI suggestions') }
    finally { setSuggesting(false) }
  }

  // ── AI ──
  const runAI = async () => {
    setAiLoading(true)
    setActiveTab('ai_analisi')
    try {
      const clientSummaries = externalClients.map(c => {
        const rev = invoices.filter(i => i.client_id === c.id && i.status === 'pagata').reduce((s, i) => s + i.amount, 0)
        const costs = pCosts.filter(pc => pc.client_id === c.id).reduce((s, pc) => s + pc.amount, 0)
        return { name: c.company_name, type: c.client_type, mrr: c.mrr, revenue: rev, costs, margin: rev - costs }
      })

      const resourceSummaries = resources.filter(r => r.is_active).map(r => ({
        name: r.name, type: r.resource_type,
        hourlyCost: r.calculated_hourly_cost ?? r.hourly_cost,
        monthlyCost: r.monthly_cost,
        billableTarget: r.billable_target_hours_month,
        availability: r.availability_hours_month,
        markup: r.markup_default,
      }))

      const prompt = `Sei un controller di gestione specializzato in società di consulenza digitale.
Analizza i dati finanziari dell'azienda TwoBee a livello aggregato.

DATI AZIENDALI:
- Fatturato totale pagato: €${totalRevenue}
- MRR contrattuale: €${totalMRR}/mese
- Costi diretti progetti: €${totalDirectCosts}
- Costi indiretti progetti: €${totalIndirectCosts}
- Costi fissi aziendali: €${monthlyOverhead}/mese
- Costo risorse mensile: €${totalResourceCostMonthly}/mese
- N° clienti esterni: ${externalClients.length}
- N° progetti attivi: ${initProjects.filter(p => p.status === 'attivo').length}

CLIENTI:
${JSON.stringify(clientSummaries)}

RISORSE:
${JSON.stringify(resourceSummaries)}

COSTI FISSI:
${JSON.stringify(bizCosts.filter(b => b.is_active).map(b => ({ desc: b.description, cat: b.category, amount: b.monthly_amount })))}

ANALIZZA:
1. MARGINE NETTO AZIENDALE: fatturato - tutti i costi (diretti + indiretti + fissi). Target: >30% netto.
2. BREAK-EVEN MENSILE: quanto deve fatturare TwoBee al mese per coprire tutti i costi.
3. SATURAZIONE MEDIA RISORSE: basata su billable/availability. Target: 70-80%.
4. ROI MEDIO RISORSE: fatturato / costo risorse. Target: >2.5x.
5. TOP 5 CLIENTI per margine (migliori e peggiori).
6. ALERT critici: margini sotto soglia, saturazione bassa, clienti in perdita.
7. RACCOMANDAZIONI: 3-5 azioni concrete per ottimizzare marginalità.
8. ANALISI NARRATIVA: 3-4 paragrafi di analisi discorsiva in italiano per il fondatore.

Rispondi SOLO con JSON valido:
{
  "fatturato_totale": number,
  "costi_totali": number,
  "margine_netto_pct": number,
  "break_even_mensile": number,
  "saturazione_media_pct": number,
  "roi_medio_risorse": number,
  "top_clients": [{ "name": "string", "margin_pct": number, "revenue": number }],
  "alerts": [{ "level": "red|amber|green", "message": "string" }],
  "raccomandazioni": ["string"],
  "analisi_narrativa": "string"
}`

      const res = await fetch('/api/ai/margin-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: { company_name: 'TwoBee (Aziendale)', client_type: 'aggregato', mrr: totalMRR, package: 'n/a' },
          projects: initProjects,
          costs: pCosts,
          resourceCosts: resources,
          businessCosts: bizCosts,
          invoices,
          _customPrompt: prompt,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAiResult(data)
    } catch { toast.error('Errore analisi AI') }
    finally { setAiLoading(false) }
  }

  const inp = 'w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-gold/40 placeholder:text-[#444]'

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white font-heading">Controllo di Gestione</h1>
            <p className="text-xs text-text-secondary mt-0.5">Costi, margini e performance aziendale</p>
          </div>
        </div>
        <button
          onClick={runAI}
          disabled={aiLoading}
          className="flex items-center gap-2 px-5 py-2.5 bg-gold text-black rounded-xl text-sm font-bold hover:bg-yellow-400 transition-colors disabled:opacity-50"
        >
          {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          Analisi AI Completa
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-3">
        <KpiCard label="Fatturato pagato" value={formatCurrency(totalRevenue)} icon={<DollarSign className="w-4 h-4" />} color="text-gold" />
        <KpiCard label="MRR Contrattuale" value={formatCurrency(totalMRR) + '/m'} icon={<TrendingUp className="w-4 h-4" />} color="text-emerald-400" />
        <KpiCard label="Costi diretti" value={formatCurrency(totalDirectCosts)} icon={<BarChart3 className="w-4 h-4" />} color="text-red-400" />
        <KpiCard label="Costi fissi/mese" value={formatCurrency(monthlyOverhead)} icon={<Building2 className="w-4 h-4" />} color="text-orange-400" />
        <KpiCard
          label="Margine lordo"
          value={`${marginPct}%`}
          icon={<Target className="w-4 h-4" />}
          color={marginPct >= 60 ? 'text-emerald-400' : marginPct >= 40 ? 'text-amber-400' : 'text-red-400'}
          subtitle={formatCurrency(grossMargin)}
        />
        <KpiCard label="Risorse attive" value={String(resources.filter(r => r.is_active).length)} icon={<Users className="w-4 h-4" />} color="text-blue-400"
          subtitle={formatCurrency(totalResourceCostMonthly) + '/m'} />
      </div>

      {/* Break-even */}
      <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-white">Break-Even Floor mensile</p>
            <p className="text-[10px] text-text-secondary mt-0.5">
              Costi risorse ({formatCurrency(totalResourceCostMonthly)}) + costi fissi ({formatCurrency(monthlyOverhead)}) = soglia minima fatturato/mese
            </p>
          </div>
        </div>
        <p className="text-2xl font-black text-amber-400">{formatCurrency(totalResourceCostMonthly + monthlyOverhead)}</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-1 gap-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === tab.key ? 'bg-gold text-black' : 'text-text-secondary hover:text-white'
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ── PANORAMICA ── */}
      {activeTab === 'panoramica' && (
        <div className="space-y-4">
          {/* Cost breakdown by category */}
          <div className="bg-surface border border-[#2A2A2A] rounded-xl p-5">
            <p className="text-sm font-bold text-white mb-4">Distribuzione costi per categoria</p>
            <div className="grid grid-cols-7 gap-3">
              {COST_CATEGORIES.map(cat => {
                const total = pCosts.filter(c => c.category === cat.key).reduce((s, c) => s + c.amount, 0)
                const pct = totalCosts > 0 ? Math.round((total / totalCosts) * 100) : 0
                return (
                  <div key={cat.key} className="text-center">
                    <p className={`text-lg font-black ${cat.color}`}>{formatCurrency(total)}</p>
                    <p className="text-[10px] text-text-secondary mt-1">{cat.label}</p>
                    <div className="w-full h-1.5 bg-[#1A1A1A] rounded-full mt-2 overflow-hidden">
                      <div className="h-full rounded-full bg-gold/60 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[9px] text-text-secondary mt-1">{pct}%</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top clients by margin */}
          <div className="bg-surface border border-[#2A2A2A] rounded-xl p-5">
            <p className="text-sm font-bold text-white mb-4">Margine per cliente (top 10)</p>
            <div className="space-y-2">
              {externalClients
                .map(c => {
                  const rev = invoices.filter(i => i.client_id === c.id && i.status === 'pagata').reduce((s, i) => s + i.amount, 0)
                  const cost = pCosts.filter(pc => pc.client_id === c.id).reduce((s, pc) => s + pc.amount, 0)
                  const margin = rev - cost
                  const pct = rev > 0 ? Math.round((margin / rev) * 100) : 0
                  return { ...c, rev, cost, margin, pct }
                })
                .sort((a, b) => b.rev - a.rev)
                .slice(0, 10)
                .map(c => (
                  <Link key={c.id} href={`/clienti/${c.id}?tab=2`}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/[0.03] transition-colors group">
                    <span className="text-sm text-white font-medium flex-1">{c.company_name}</span>
                    <span className="text-xs text-text-secondary w-28 text-right">{formatCurrency(c.rev)}</span>
                    <span className="text-xs text-red-400 w-28 text-right">-{formatCurrency(c.cost)}</span>
                    <span className={`text-xs font-bold w-20 text-right ${c.pct >= 60 ? 'text-emerald-400' : c.pct >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                      {c.pct}%
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── RISORSE ── */}
      {activeTab === 'risorse' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white">Costo Uomo — Risorse Aziendali</p>
            <div className="flex items-center gap-2">
              <button onClick={() => fetchSuggestions('resource')} disabled={suggesting}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg text-xs font-semibold hover:bg-purple-500/20 transition-colors disabled:opacity-50">
                {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Suggerisci AI
              </button>
              <button onClick={() => { setUploadTarget('resource_costs'); fileInputRef.current?.click() }} disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-xs font-semibold hover:bg-blue-500/20 transition-colors disabled:opacity-50">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Carica file
              </button>
              <button onClick={() => setShowAddResource(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-gold text-black rounded-lg text-xs font-bold hover:bg-yellow-400 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Aggiungi risorsa
              </button>
            </div>
          </div>

          {showAddResource && (
            <AddResourceForm profiles={profiles} onAdd={addResource} onCancel={() => setShowAddResource(false)} />
          )}

          <div className="bg-surface border border-[#2A2A2A] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2A2A2A] text-text-secondary text-left">
                    {['Risorsa', 'Tipo', 'Costo/mese', '€/ora costo', 'Ore fatt.', 'Saturaz.', 'Markup', '€/ora vendita', ''].map(h => (
                      <th key={h} className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resources.map(r => {
                    const hourly = r.calculated_hourly_cost ?? r.hourly_cost ?? 0
                    const satPct = r.availability_hours_month > 0
                      ? Math.round((r.billable_target_hours_month / r.availability_hours_month) * 100) : 0
                    const sellRate = hourly * r.markup_default

                    if (editingResource === r.id) {
                      return <EditResourceRow key={r.id} resource={r} onSave={updateResource} onCancel={() => setEditingResource(null)} />
                    }

                    return (
                      <tr key={r.id} className={`border-b border-[#1A1A1A] hover:bg-white/[0.02] transition-colors ${!r.is_active ? 'opacity-40' : ''}`}>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-white">{r.name}</p>
                            {r.role_title && <p className="text-[10px] text-text-secondary">{r.role_title}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-text-secondary capitalize">{r.resource_type.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-white font-bold">{formatCurrency(r.monthly_cost ?? 0)}</td>
                        <td className="px-4 py-3 text-white font-bold">{formatCurrency(hourly)}</td>
                        <td className="px-4 py-3 text-white">{r.billable_target_hours_month}h/{r.availability_hours_month}h</td>
                        <td className="px-4 py-3">
                          <span className={`font-bold ${satPct >= 70 ? 'text-emerald-400' : satPct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                            {satPct}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{r.markup_default}x</td>
                        <td className="px-4 py-3 text-gold font-bold">{formatCurrency(sellRate)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditingResource(r.id)} className="p-1 text-text-secondary hover:text-gold"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteResource(r.id)} className="p-1 text-text-secondary hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {resources.length === 0 && (
              <p className="text-center text-text-secondary text-sm py-12">Nessuna risorsa configurata</p>
            )}
          </div>

          {/* Formule reference */}
          <div className="bg-[#111] border border-[#2A2A2A] rounded-xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-gold uppercase tracking-wider">Formule di riferimento</p>
            <div className="grid grid-cols-3 gap-4 text-[11px] text-text-secondary">
              <div>
                <p className="text-white font-semibold mb-1">Costo Uomo Orario</p>
                <p>CAA ÷ Ore Fatturabili Reali</p>
                <p className="text-[10px] mt-1">Dipendente: RAL × 1.35 ÷ ore billable</p>
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Saturation Rate</p>
                <p>Ore su clienti ÷ Ore totali × 100</p>
                <p className="text-[10px] mt-1">Target: 70-80% (specialist)</p>
              </div>
              <div>
                <p className="text-white font-semibold mb-1">ROI Risorsa</p>
                <p>Fatturato generato ÷ Costo aziendale</p>
                <p className="text-[10px] mt-1">Target: ≥ 2.5x — 3x</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── COSTI FISSI ── */}
      {activeTab === 'costi_fissi' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Costi Fissi Aziendali</p>
              <p className="text-[10px] text-text-secondary mt-0.5">
                Totale attivo: <strong className="text-orange-400">{formatCurrency(monthlyOverhead)}/mese</strong> — {formatCurrency(monthlyOverhead * 12)}/anno
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => fetchSuggestions('business')} disabled={suggesting}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg text-xs font-semibold hover:bg-purple-500/20 transition-colors disabled:opacity-50">
                {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Suggerisci AI
              </button>
              <button onClick={() => { setUploadTarget('business_costs'); fileInputRef.current?.click() }} disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-xs font-semibold hover:bg-blue-500/20 transition-colors disabled:opacity-50">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Carica file
              </button>
              <button onClick={() => setShowAddBiz(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-gold text-black rounded-lg text-xs font-bold hover:bg-yellow-400 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Aggiungi costo fisso
              </button>
            </div>
          </div>

          {showAddBiz && (
            <AddBizCostForm onAdd={addBizCost} onCancel={() => setShowAddBiz(false)} />
          )}

          <div className="bg-surface border border-[#2A2A2A] rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2A2A2A] text-text-secondary text-left">
                  {['Categoria', 'Descrizione', 'Importo/mese', 'Importo/anno', 'Stato', ''].map(h => (
                    <th key={h} className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bizCosts.map(b => {
                  const catLabel = BIZ_CATEGORIES.find(bc => bc.key === b.category)?.label ?? b.category
                  return (
                    <tr key={b.id} className={`border-b border-[#1A1A1A] hover:bg-white/[0.02] transition-colors ${!b.is_active ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-3 text-text-secondary capitalize">{catLabel}</td>
                      <td className="px-4 py-3 text-white font-medium">{b.description}</td>
                      <td className="px-4 py-3 text-white font-bold">{formatCurrency(b.monthly_amount)}</td>
                      <td className="px-4 py-3 text-text-secondary">{formatCurrency(b.monthly_amount * 12)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${b.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#2A2A2A] text-text-secondary'}`}>
                          {b.is_active ? 'Attivo' : 'Inattivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => deleteBizCost(b.id)} className="p-1 text-text-secondary hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {bizCosts.length === 0 && (
              <p className="text-center text-text-secondary text-sm py-12">Nessun costo fisso configurato</p>
            )}
          </div>

          {/* Summary by category */}
          <div className="grid grid-cols-7 gap-3">
            {BIZ_CATEGORIES.map(cat => {
              const total = bizCosts.filter(b => b.category === cat.key && b.is_active).reduce((s, b) => s + b.monthly_amount, 0)
              return (
                <div key={cat.key} className="bg-surface border border-[#2A2A2A] rounded-xl p-3 text-center">
                  <p className="text-[10px] text-text-secondary">{cat.label}</p>
                  <p className="text-sm font-bold text-white mt-1">{formatCurrency(total)}</p>
                  <p className="text-[9px] text-text-secondary">/mese</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── PER PROGETTO ── */}
      {activeTab === 'progetti' && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-white mb-3">Costi e margine per progetto</p>
          {projectsWithCosts.map(p => {
            const isExpanded = expandedProject === p.id
            const marginPct = p.revenue > 0 ? Math.round(((p.revenue - p.totalCost) / p.revenue) * 100) : 0
            return (
              <div key={p.id} className="bg-surface border border-[#2A2A2A] rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedProject(isExpanded ? null : p.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-text-secondary" /> : <ChevronRight className="w-3.5 h-3.5 text-text-secondary" />}
                    <div className="text-left">
                      <span className="text-sm font-semibold text-white">{p.name}</span>
                      {p.client && <span className="text-[10px] text-text-secondary ml-2">{p.client.company_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-text-secondary">Rev: {formatCurrency(p.revenue)}</span>
                    <span className="text-xs text-red-400">Costi: {formatCurrency(p.totalCost)}</span>
                    <span className={`text-xs font-bold ${marginPct >= 60 ? 'text-emerald-400' : marginPct >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                      Margine: {marginPct}%
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-[#2A2A2A] px-4 py-3 space-y-2">
                    {p.costs.length === 0 && <p className="text-xs text-text-secondary py-2">Nessun costo registrato</p>}
                    {p.costs.map(c => {
                      const catInfo = COST_CATEGORIES.find(cc => cc.key === c.category)
                      return (
                        <div key={c.id} className="group flex items-center gap-3 py-1.5">
                          <span className={`text-[10px] font-bold uppercase w-20 shrink-0 ${catInfo?.color ?? 'text-white/40'}`}>
                            {catInfo?.label ?? c.category}
                          </span>
                          <span className="text-sm text-white flex-1 truncate">{c.description}</span>
                          {c.hours && <span className="text-[10px] text-text-secondary shrink-0">{c.hours}h × €{c.hourly_rate}</span>}
                          <span className="text-sm font-bold text-white shrink-0 w-24 text-right">{formatCurrency(c.amount)}</span>
                          <button onClick={() => deleteProjectCost(c.id)}
                            className="p-1 text-text-secondary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}

                    {showAddCost === p.id ? (
                      <AddProjectCostForm resources={resources} onAdd={form => addProjectCost(p.id, p.client_id, form)} onCancel={() => setShowAddCost(null)} />
                    ) : (
                      <div className="flex items-center justify-between pt-2 border-t border-[#1A1A1A]">
                        <button onClick={() => setShowAddCost(p.id)} className="flex items-center gap-1.5 text-xs text-gold hover:text-yellow-400">
                          <Plus className="w-3 h-3" /> Aggiungi costo
                        </button>
                        <Link href={`/clienti/${p.client_id}/progetto/${p.id}`}
                          className="flex items-center gap-1 text-[10px] text-text-secondary hover:text-gold transition-colors">
                          Vai al progetto <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── AI ANALISI ── */}
      {activeTab === 'ai_analisi' && (
        <div className="space-y-4">
          {aiLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-gold mr-3" />
              <span className="text-sm text-text-secondary">Analisi AI in corso...</span>
            </div>
          )}

          {!aiLoading && !aiResult && (
            <div className="text-center py-20">
              <Brain className="w-12 h-12 text-[#2A2A2A] mx-auto mb-4" />
              <p className="text-white font-bold mb-1">Analisi AI non ancora eseguita</p>
              <p className="text-xs text-text-secondary mb-4">Clicca "Analisi AI Completa" per generare un report finanziario dettagliato</p>
              <button onClick={runAI} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gold text-black rounded-xl text-sm font-bold">
                <Brain className="w-4 h-4" /> Genera analisi
              </button>
            </div>
          )}

          {aiResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4 text-center">
                  <p className="text-[10px] text-text-secondary">Margine Netto</p>
                  <p className={`text-2xl font-black ${(aiResult.margine_netto_pct ?? 0) >= 30 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {aiResult.margine_netto_pct}%
                  </p>
                </div>
                <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4 text-center">
                  <p className="text-[10px] text-text-secondary">Break-Even/mese</p>
                  <p className="text-2xl font-black text-amber-400">{formatCurrency(aiResult.break_even_mensile)}</p>
                </div>
                <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4 text-center">
                  <p className="text-[10px] text-text-secondary">Saturazione Media</p>
                  <p className={`text-2xl font-black ${(aiResult.saturazione_media_pct ?? 0) >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {aiResult.saturazione_media_pct}%
                  </p>
                </div>
                <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4 text-center">
                  <p className="text-[10px] text-text-secondary">ROI Risorse</p>
                  <p className={`text-2xl font-black ${(aiResult.roi_medio_risorse ?? 0) >= 2.5 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {aiResult.roi_medio_risorse}x
                  </p>
                </div>
              </div>

              {aiResult.alerts?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Alert</p>
                  {aiResult.alerts.map((a, i) => (
                    <div key={i} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium ${
                      a.level === 'red' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                      a.level === 'amber' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {a.message}
                    </div>
                  ))}
                </div>
              )}

              {aiResult.top_clients?.length > 0 && (
                <div className="bg-surface border border-[#2A2A2A] rounded-xl p-5">
                  <p className="text-sm font-bold text-white mb-3">Top clienti per margine (AI)</p>
                  {aiResult.top_clients.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5">
                      <span className="text-xs text-text-secondary w-6">{i + 1}.</span>
                      <span className="text-sm text-white flex-1">{c.name}</span>
                      <span className="text-xs text-text-secondary">{formatCurrency(c.revenue)}</span>
                      <span className={`text-xs font-bold w-16 text-right ${c.margin_pct >= 60 ? 'text-emerald-400' : c.margin_pct >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                        {c.margin_pct}%
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {aiResult.raccomandazioni?.length > 0 && (
                <div className="bg-surface border border-gold/20 rounded-xl p-5">
                  <p className="text-[10px] font-bold text-gold uppercase tracking-wider mb-3">Raccomandazioni</p>
                  <div className="space-y-2">
                    {aiResult.raccomandazioni.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-white/80">
                        <span className="text-gold font-bold shrink-0 mt-0.5">{i + 1}.</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiResult.analisi_narrativa && (
                <div className="bg-[#111] border border-[#2A2A2A] rounded-xl p-5">
                  <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-3">Analisi dettagliata</p>
                  <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">{aiResult.analisi_narrativa}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.tsv" className="hidden" onChange={handleFileUpload} />

      {/* Upload/Suggest preview modal */}
      {uploadPreview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-8" onClick={() => setUploadPreview(null)}>
          <div className="bg-[#111] border border-[#2A2A2A] rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-gold" />
                <div>
                  <p className="text-sm font-bold text-white">
                    Anteprima dati — {uploadPreview.target === 'resource_costs' ? 'Risorse' : uploadPreview.target === 'business_costs' ? 'Costi Fissi' : 'Costi Progetto'}
                  </p>
                  <p className="text-[10px] text-text-secondary">{uploadPreview.rows.length} righe pronte per l&apos;importazione</p>
                </div>
              </div>
              <button onClick={() => setUploadPreview(null)} className="text-text-secondary hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {uploadPreview.target === 'resource_costs' && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#2A2A2A] text-text-secondary text-left">
                      {['Nome', 'Tipo', 'Ruolo', 'Costo/mese', '€/ora', 'Ore fatt.', 'Markup', 'Note'].map(h => (
                        <th key={h} className="px-3 py-2 font-semibold text-[10px] uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uploadPreview.rows.map((r, i) => (
                      <tr key={i} className="border-b border-[#1A1A1A]">
                        <td className="px-3 py-2 text-white font-medium">{String(r.name ?? '')}</td>
                        <td className="px-3 py-2 text-text-secondary capitalize">{String(r.resource_type ?? '').replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-text-secondary">{String(r.role_title ?? '')}</td>
                        <td className="px-3 py-2 text-white">{formatCurrency(Number(r.monthly_cost) || 0)}</td>
                        <td className="px-3 py-2 text-white">{formatCurrency(Number(r.hourly_cost) || 0)}</td>
                        <td className="px-3 py-2 text-text-secondary">{String(r.billable_target_hours_month ?? '120')}h</td>
                        <td className="px-3 py-2 text-text-secondary">{String(r.markup_default ?? '2')}x</td>
                        <td className="px-3 py-2 text-text-secondary truncate max-w-[150px]">{String(r.notes ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {uploadPreview.target === 'business_costs' && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#2A2A2A] text-text-secondary text-left">
                      {['Categoria', 'Descrizione', 'Importo/mese', 'Note'].map(h => (
                        <th key={h} className="px-3 py-2 font-semibold text-[10px] uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uploadPreview.rows.map((r, i) => (
                      <tr key={i} className="border-b border-[#1A1A1A]">
                        <td className="px-3 py-2 text-text-secondary capitalize">{String(r.category ?? '')}</td>
                        <td className="px-3 py-2 text-white font-medium">{String(r.description ?? '')}</td>
                        <td className="px-3 py-2 text-white font-bold">{formatCurrency(Number(r.monthly_amount) || 0)}</td>
                        <td className="px-3 py-2 text-text-secondary truncate max-w-[200px]">{String(r.notes ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {uploadPreview.target === 'project_costs' && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#2A2A2A] text-text-secondary text-left">
                      {['Categoria', 'Descrizione', 'Ore', 'Tariffa', 'Importo', 'Note'].map(h => (
                        <th key={h} className="px-3 py-2 font-semibold text-[10px] uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uploadPreview.rows.map((r, i) => (
                      <tr key={i} className="border-b border-[#1A1A1A]">
                        <td className="px-3 py-2 text-text-secondary capitalize">{String(r.category ?? '')}</td>
                        <td className="px-3 py-2 text-white font-medium">{String(r.description ?? '')}</td>
                        <td className="px-3 py-2 text-text-secondary">{r.hours ? `${r.hours}h` : '—'}</td>
                        <td className="px-3 py-2 text-text-secondary">{r.hourly_rate ? formatCurrency(Number(r.hourly_rate)) : '—'}</td>
                        <td className="px-3 py-2 text-white font-bold">{formatCurrency(Number(r.amount) || 0)}</td>
                        <td className="px-3 py-2 text-text-secondary truncate max-w-[150px]">{String(r.notes ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-[#2A2A2A]">
              <p className="text-[10px] text-text-secondary">Controlla i dati prima di importare. I valori verranno inseriti nel database.</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setUploadPreview(null)} className="px-4 py-2 text-xs text-text-secondary hover:text-white">Annulla</button>
                <button onClick={confirmUpload} disabled={uploading}
                  className="flex items-center gap-1.5 px-5 py-2 bg-gold text-black rounded-lg text-xs font-bold hover:bg-yellow-400 transition-colors disabled:opacity-50">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Conferma importazione ({uploadPreview.rows.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subcomponents ──

function KpiCard({ label, value, icon, color, subtitle }: {
  label: string; value: string; icon: React.ReactNode; color: string; subtitle?: string
}) {
  return (
    <div className="bg-surface border border-[#2A2A2A] rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={color}>{icon}</span>
        <span className="text-[10px] text-text-secondary">{label}</span>
      </div>
      <p className={`text-lg font-black ${color}`}>{value}</p>
      {subtitle && <p className="text-[10px] text-text-secondary mt-0.5">{subtitle}</p>}
    </div>
  )
}

function AddResourceForm({ profiles, onAdd, onCancel }: {
  profiles: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>[]
  onAdd: (form: Partial<ResourceCost> & { name: string }) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    name: '', profile_id: '', resource_type: 'internal_employee' as ResourceType,
    cost_type: 'monthly_salary' as ResourceCostType, role_title: '',
    monthly_cost: '', hourly_cost: '', availability_hours_month: '160',
    billable_target_hours_month: '120', markup_default: '2',
  })
  const [saving, setSaving] = useState(false)

  const handleProfileSelect = (pid: string) => {
    const p = profiles.find(pr => pr.id === pid)
    setForm(f => ({ ...f, profile_id: pid, name: p?.full_name ?? f.name }))
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await onAdd({
      name: form.name.trim(),
      profile_id: form.profile_id || null,
      resource_type: form.resource_type,
      cost_type: form.cost_type,
      role_title: form.role_title || null,
      monthly_cost: parseFloat(form.monthly_cost) || null,
      hourly_cost: parseFloat(form.hourly_cost) || null,
      availability_hours_month: parseFloat(form.availability_hours_month) || 160,
      billable_target_hours_month: parseFloat(form.billable_target_hours_month) || 120,
      markup_default: parseFloat(form.markup_default) || 2,
    })
    setSaving(false)
  }

  const inp = 'w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-gold/40 placeholder:text-[#444]'

  return (
    <div className="bg-surface border border-gold/20 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="text-[10px] text-text-secondary mb-1 block">Profilo (opzionale)</label>
          <select value={form.profile_id} onChange={e => handleProfileSelect(e.target.value)} className={inp}>
            <option value="">— Nessun profilo —</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-text-secondary mb-1 block">Nome *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome risorsa" className={inp} />
        </div>
        <div>
          <label className="text-[10px] text-text-secondary mb-1 block">Tipo</label>
          <select value={form.resource_type} onChange={e => setForm(f => ({ ...f, resource_type: e.target.value as ResourceType }))} className={inp}>
            {RESOURCE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-text-secondary mb-1 block">Ruolo</label>
          <input value={form.role_title} onChange={e => setForm(f => ({ ...f, role_title: e.target.value }))} placeholder="es. Strategist" className={inp} />
        </div>
      </div>
      <div className="grid grid-cols-5 gap-3">
        <div>
          <label className="text-[10px] text-text-secondary mb-1 block">Tipo costo</label>
          <select value={form.cost_type} onChange={e => setForm(f => ({ ...f, cost_type: e.target.value as ResourceCostType }))} className={inp}>
            {COST_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-text-secondary mb-1 block">Costo/mese €</label>
          <input type="number" value={form.monthly_cost} onChange={e => setForm(f => ({ ...f, monthly_cost: e.target.value }))} placeholder="3000" className={inp} />
        </div>
        <div>
          <label className="text-[10px] text-text-secondary mb-1 block">Ore disponibili/m</label>
          <input type="number" value={form.availability_hours_month} onChange={e => setForm(f => ({ ...f, availability_hours_month: e.target.value }))} className={inp} />
        </div>
        <div>
          <label className="text-[10px] text-text-secondary mb-1 block">Ore fatturabili/m</label>
          <input type="number" value={form.billable_target_hours_month} onChange={e => setForm(f => ({ ...f, billable_target_hours_month: e.target.value }))} className={inp} />
        </div>
        <div>
          <label className="text-[10px] text-text-secondary mb-1 block">Markup</label>
          <input type="number" step="0.1" value={form.markup_default} onChange={e => setForm(f => ({ ...f, markup_default: e.target.value }))} className={inp} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-2 text-xs text-text-secondary hover:text-white">Annulla</button>
        <button onClick={handleSubmit} disabled={saving || !form.name.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-gold text-black rounded-lg text-xs font-bold disabled:opacity-40">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Aggiungi
        </button>
      </div>
    </div>
  )
}

function EditResourceRow({ resource: r, onSave, onCancel }: {
  resource: ResourceCost
  onSave: (id: string, updates: Partial<ResourceCost>) => Promise<void>
  onCancel: () => void
}) {
  const [monthly, setMonthly] = useState(String(r.monthly_cost ?? ''))
  const [billable, setBillable] = useState(String(r.billable_target_hours_month))
  const [markup, setMarkup] = useState(String(r.markup_default))
  const [saving, setSaving] = useState(false)

  const inp = 'bg-[#111] border border-[#2A2A2A] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold/40 w-full'

  const handleSave = async () => {
    setSaving(true)
    await onSave(r.id, {
      monthly_cost: parseFloat(monthly) || null,
      billable_target_hours_month: parseFloat(billable) || 120,
      markup_default: parseFloat(markup) || 2,
    })
    setSaving(false)
  }

  return (
    <tr className="border-b border-gold/20 bg-gold/[0.03]">
      <td className="px-4 py-2 text-sm text-white font-medium">{r.name}</td>
      <td className="px-4 py-2 text-text-secondary capitalize text-xs">{r.resource_type.replace(/_/g, ' ')}</td>
      <td className="px-4 py-2"><input type="number" value={monthly} onChange={e => setMonthly(e.target.value)} className={inp} /></td>
      <td className="px-4 py-2 text-xs text-text-secondary">auto</td>
      <td className="px-4 py-2"><input type="number" value={billable} onChange={e => setBillable(e.target.value)} className={inp} /></td>
      <td className="px-4 py-2 text-xs text-text-secondary">auto</td>
      <td className="px-4 py-2"><input type="number" step="0.1" value={markup} onChange={e => setMarkup(e.target.value)} className={inp} /></td>
      <td className="px-4 py-2 text-xs text-text-secondary">auto</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <button onClick={handleSave} disabled={saving} className="p-1 text-gold hover:text-yellow-400">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onCancel} className="p-1 text-text-secondary hover:text-white"><X className="w-3.5 h-3.5" /></button>
        </div>
      </td>
    </tr>
  )
}

function AddBizCostForm({ onAdd, onCancel }: {
  onAdd: (form: { category: BusinessCostCategory; description: string; monthly_amount: string }) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({ category: 'altro' as BusinessCostCategory, description: '', monthly_amount: '' })
  const [saving, setSaving] = useState(false)
  const inp = 'bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-gold/40 placeholder:text-[#444]'

  return (
    <div className="flex items-end gap-3 bg-surface border border-gold/20 rounded-xl p-4">
      <div className="flex-none w-40">
        <label className="text-[10px] text-text-secondary mb-1 block">Categoria</label>
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as BusinessCostCategory }))} className={inp}>
          {BIZ_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div className="flex-1">
        <label className="text-[10px] text-text-secondary mb-1 block">Descrizione</label>
        <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="es. Google Workspace" className={inp} />
      </div>
      <div className="flex-none w-32">
        <label className="text-[10px] text-text-secondary mb-1 block">€/mese</label>
        <input type="number" value={form.monthly_amount} onChange={e => setForm(f => ({ ...f, monthly_amount: e.target.value }))} placeholder="100" className={inp} />
      </div>
      <button onClick={onCancel} className="px-3 py-2 text-xs text-text-secondary hover:text-white">Annulla</button>
      <button onClick={async () => { setSaving(true); await onAdd(form); setSaving(false) }}
        disabled={saving || !form.description.trim()}
        className="flex items-center gap-1.5 px-4 py-2 bg-gold text-black rounded-lg text-xs font-bold disabled:opacity-40">
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Aggiungi
      </button>
    </div>
  )
}

function AddProjectCostForm({ resources, onAdd, onCancel }: {
  resources: ResourceCost[]
  onAdd: (form: { category: ProjectCostCategory; description: string; amount: string; hours: string; hourly_rate: string; resource_cost_id: string }) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    category: 'risorsa' as ProjectCostCategory, description: '', amount: '',
    hours: '', hourly_rate: '', resource_cost_id: '',
  })
  const [saving, setSaving] = useState(false)
  const inp = 'bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-gold/40 placeholder:text-[#444]'

  const handleResourceSelect = (resId: string) => {
    const r = resources.find(rc => rc.id === resId)
    if (r) setForm(f => ({ ...f, resource_cost_id: resId, description: r.name, hourly_rate: String(r.calculated_hourly_cost ?? r.hourly_cost ?? '') }))
  }

  return (
    <div className="bg-[#111] border border-gold/20 rounded-xl p-3 space-y-2 mt-2">
      <div className="grid grid-cols-3 gap-2">
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as ProjectCostCategory }))} className={inp}>
          {COST_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        {form.category === 'risorsa' && resources.length > 0 && (
          <select value={form.resource_cost_id} onChange={e => handleResourceSelect(e.target.value)} className={inp}>
            <option value="">Seleziona risorsa...</option>
            {resources.map(r => <option key={r.id} value={r.id}>{r.name} (€{r.calculated_hourly_cost ?? r.hourly_cost}/h)</option>)}
          </select>
        )}
        <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrizione" className={inp} />
      </div>
      <div className="flex items-center gap-2">
        {form.category === 'risorsa' ? (
          <>
            <input type="number" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} placeholder="Ore" className={`${inp} w-20`} />
            <span className="text-[10px] text-text-secondary">×</span>
            <input type="number" value={form.hourly_rate} onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))} placeholder="€/h" className={`${inp} w-24`} />
            {form.hours && form.hourly_rate && (
              <span className="text-xs text-text-secondary">= <strong className="text-white">{formatCurrency(parseFloat(form.hours) * parseFloat(form.hourly_rate))}</strong></span>
            )}
          </>
        ) : (
          <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="Importo €" className={`${inp} w-32`} />
        )}
        <div className="flex-1" />
        <button onClick={onCancel} className="text-xs text-text-secondary hover:text-white px-2">Annulla</button>
        <button onClick={async () => { setSaving(true); await onAdd(form); setSaving(false) }}
          disabled={saving || !form.description.trim()}
          className="flex items-center gap-1 px-3 py-2 bg-gold text-black rounded-lg text-xs font-bold disabled:opacity-40">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Aggiungi
        </button>
      </div>
    </div>
  )
}

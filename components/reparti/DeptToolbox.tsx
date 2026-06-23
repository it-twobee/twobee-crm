'use client'

import { useState } from 'react'
import { Copy, Check, Calculator, Link2, ListChecks, BookOpen, Zap } from 'lucide-react'
import type { ProjectKind } from '@/lib/types/database'

/* ── UTM Builder ── */
function UtmBuilder() {
  const [f, setF] = useState({ url: '', source: '', medium: '', campaign: '', content: '' })
  const [copied, setCopied] = useState(false)
  const params = new URLSearchParams(
    Object.entries({ utm_source: f.source, utm_medium: f.medium, utm_campaign: f.campaign, utm_content: f.content })
      .filter(([, v]) => v) as [string, string][]
  ).toString()
  const result = f.url && params ? `${f.url}${f.url.includes('?') ? '&' : '?'}${params}` : ''

  const copy = () => {
    if (!result) return
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inp = 'w-full bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white placeholder-[#333] focus:outline-none focus:border-[#F5C800]'
  return (
    <div className="space-y-2">
      <input value={f.url} onChange={e => setF(p => ({ ...p, url: e.target.value }))} placeholder="URL destinazione" className={inp} />
      <div className="grid grid-cols-2 gap-2">
        <input value={f.source} onChange={e => setF(p => ({ ...p, source: e.target.value }))} placeholder="Source (es. facebook)" className={inp} />
        <input value={f.medium} onChange={e => setF(p => ({ ...p, medium: e.target.value }))} placeholder="Medium (es. cpc)" className={inp} />
        <input value={f.campaign} onChange={e => setF(p => ({ ...p, campaign: e.target.value }))} placeholder="Campaign" className={inp} />
        <input value={f.content} onChange={e => setF(p => ({ ...p, content: e.target.value }))} placeholder="Content (opzionale)" className={inp} />
      </div>
      {result && (
        <div className="flex items-center gap-2 bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg px-3 py-2">
          <p className="flex-1 text-[10px] text-[#666] truncate font-mono">{result}</p>
          <button onClick={copy} className="shrink-0 text-[#444] hover:text-[#F5C800] transition-colors">
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── ROI Calculator ── */
function RoiCalc() {
  const [spend, setSpend] = useState('')
  const [revenue, setRevenue] = useState('')
  const roi = spend && revenue ? (((+revenue - +spend) / +spend) * 100).toFixed(1) : null
  const roas = spend && revenue ? (+revenue / +spend).toFixed(2) : null
  const inp = 'w-full bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white placeholder-[#333] focus:outline-none focus:border-[#F5C800]'
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-[#555] mb-1">Spesa (€)</label>
          <input type="number" value={spend} onChange={e => setSpend(e.target.value)} placeholder="1000" className={inp} />
        </div>
        <div>
          <label className="block text-[10px] text-[#555] mb-1">Revenue (€)</label>
          <input type="number" value={revenue} onChange={e => setRevenue(e.target.value)} placeholder="3500" className={inp} />
        </div>
      </div>
      {roi && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg p-3 text-center">
            <p className="text-[10px] text-[#444] mb-1">ROI</p>
            <p className={`text-xl font-black ${+roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>{roi}%</p>
          </div>
          <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg p-3 text-center">
            <p className="text-[10px] text-[#444] mb-1">ROAS</p>
            <p className="text-xl font-black text-[#F5C800]">{roas}x</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Deploy Checklist ── */
const DEPLOY_ITEMS = [
  'Backup database effettuato',
  'Test su staging superati',
  'Variabili d\'ambiente aggiornate',
  'DNS/CDN configurato',
  'SSL attivo e valido',
  'Monitoring/alerting attivo',
  'Rollback plan pronto',
  'Cliente notificato',
]

function DeployChecklist() {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const toggle = (i: number) => setChecked(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })
  return (
    <div className="space-y-1.5">
      {DEPLOY_ITEMS.map((item, i) => (
        <div key={i} onClick={() => toggle(i)}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#111] cursor-pointer transition-colors">
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
            checked.has(i) ? 'bg-green-400 border-green-400' : 'border-[#2A2A2A]'
          }`}>
            {checked.has(i) && <Check className="w-2.5 h-2.5 text-black" />}
          </div>
          <span className={`text-xs ${checked.has(i) ? 'line-through text-[#444]' : 'text-white'}`}>{item}</span>
        </div>
      ))}
      <div className="pt-1 border-t border-[#1A1A1A]">
        <p className="text-[10px] text-[#444] text-center">{checked.size}/{DEPLOY_ITEMS.length} completati</p>
      </div>
    </div>
  )
}

/* ── Prompt Library ── */
const PROMPTS: { label: string; text: string }[] = [
  { label: 'Analisi competitiva', text: 'Analizza i principali competitor di [AZIENDA] nel settore [SETTORE]. Identifica punti di forza, debolezze e opportunità di differenziazione.' },
  { label: 'Email marketing', text: 'Scrivi una sequenza di 3 email per [OBIETTIVO] rivolte a [TARGET]. Tono: [TONO]. Include CTA chiara in ogni email.' },
  { label: 'Brief creativo', text: 'Crea un brief creativo per una campagna [CANALE] di [BRAND]. Obiettivo: [OBIETTIVO]. Budget: [BUDGET]. Target: [TARGET].' },
  { label: 'Report mensile', text: 'Analizza questi dati di performance [DATI] e crea un report esecutivo con: highlights, problemi, raccomandazioni per il mese successivo.' },
  { label: 'Audit SEO', text: 'Effettua un audit SEO on-page per [URL]. Analizza: title tag, meta description, heading structure, keyword density, internal linking, Core Web Vitals.' },
]

function PromptLibrary() {
  const [copied, setCopied] = useState<number | null>(null)
  const copy = (i: number, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(i)
    setTimeout(() => setCopied(null), 2000)
  }
  return (
    <div className="space-y-2">
      {PROMPTS.map((p, i) => (
        <div key={i} className="flex items-start gap-2 bg-[#0D0D0D] border border-[#1A1A1A] rounded-lg p-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-[#F5C800] mb-1">{p.label}</p>
            <p className="text-[10px] text-[#555] line-clamp-2">{p.text}</p>
          </div>
          <button onClick={() => copy(i, p.text)} className="shrink-0 text-[#444] hover:text-white transition-colors mt-0.5">
            {copied === i ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      ))}
    </div>
  )
}

/* ── Content Brief ── */
function ContentBrief() {
  const [f, setF] = useState({ topic: '', audience: '', goal: '', format: 'articolo' })
  const [result, setResult] = useState('')
  const inp = 'w-full bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white placeholder-[#333] focus:outline-none focus:border-[#F5C800]'
  const generate = () => {
    if (!f.topic) return
    setResult(
      `📝 BRIEF: ${f.format.toUpperCase()}\n\n` +
      `ARGOMENTO: ${f.topic}\n` +
      `TARGET: ${f.audience || 'da definire'}\n` +
      `OBIETTIVO: ${f.goal || 'awareness'}\n\n` +
      `STRUTTURA CONSIGLIATA:\n` +
      `1. Hook (problema/domanda provocatoria)\n` +
      `2. Contesto e rilevanza\n` +
      `3. Soluzione/contenuto principale (3-5 punti)\n` +
      `4. Esempio pratico o case study\n` +
      `5. CTA chiara\n\n` +
      `KPI: Reach, CTR, Time on page, Conversioni`
    )
  }
  return (
    <div className="space-y-2">
      <input value={f.topic} onChange={e => setF(p => ({ ...p, topic: e.target.value }))} placeholder="Argomento / topic" className={inp} />
      <input value={f.audience} onChange={e => setF(p => ({ ...p, audience: e.target.value }))} placeholder="Target audience" className={inp} />
      <div className="grid grid-cols-2 gap-2">
        <select value={f.format} onChange={e => setF(p => ({ ...p, format: e.target.value }))} className={inp}>
          {['articolo','video','reel','newsletter','post LinkedIn','thread X'].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <input value={f.goal} onChange={e => setF(p => ({ ...p, goal: e.target.value }))} placeholder="Obiettivo" className={inp} />
      </div>
      <button onClick={generate} className="w-full py-2 bg-[#F5C800] text-black text-xs font-bold rounded-lg hover:bg-yellow-400 transition-colors">
        Genera Brief
      </button>
      {result && (
        <pre className="text-[10px] text-[#888] bg-[#0D0D0D] border border-[#1A1A1A] rounded-lg p-3 whitespace-pre-wrap font-mono">
          {result}
        </pre>
      )}
    </div>
  )
}

/* ── Token Cost Estimator ── */
function TokenEstimator() {
  const [tokens, setTokens] = useState('')
  const [model, setModel] = useState('gpt-4o')
  const COSTS: Record<string, { in: number; out: number }> = {
    'gpt-4o':         { in: 0.0025, out: 0.01 },
    'claude-sonnet':  { in: 0.003,  out: 0.015 },
    'llama-70b':      { in: 0.00059, out: 0.00079 },
    'gemini-flash':   { in: 0.000075, out: 0.0003 },
  }
  const cost = tokens ? (((+tokens / 1000) * COSTS[model].in) + ((+tokens * 0.3 / 1000) * COSTS[model].out)).toFixed(4) : null
  const monthly = cost ? (+cost * 1000).toFixed(2) : null
  const inp = 'w-full bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white placeholder-[#333] focus:outline-none focus:border-[#F5C800]'
  return (
    <div className="space-y-2">
      <select value={model} onChange={e => setModel(e.target.value)} className={inp}>
        {Object.keys(COSTS).map(k => <option key={k} value={k}>{k}</option>)}
      </select>
      <input type="number" value={tokens} onChange={e => setTokens(e.target.value)} placeholder="Token per chiamata (es. 2000)" className={inp} />
      {cost && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-lg p-3 text-center">
            <p className="text-[10px] text-[#444] mb-1">Per chiamata</p>
            <p className="text-sm font-black text-white">${cost}</p>
          </div>
          <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-lg p-3 text-center">
            <p className="text-[10px] text-[#444] mb-1">×1000 chiamate</p>
            <p className="text-sm font-black text-[#F5C800]">${monthly}</p>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[#333]">Stima approssimativa. Output stimato al 30% dell'input.</p>
    </div>
  )
}

/* ── Config per reparto ── */
interface Tool { id: string; icon: React.ReactNode; label: string; desc: string; component: React.ReactNode }

const TOOLS: Record<ProjectKind, Tool[]> = {
  growth: [
    { id: 'utm',  icon: <Link2 className="w-4 h-4" />,       label: 'UTM Builder',    desc: 'Genera link tracciati per le campagne', component: <UtmBuilder /> },
    { id: 'roi',  icon: <Calculator className="w-4 h-4" />,   label: 'ROI / ROAS',    desc: 'Calcola ritorno sulle campagne',        component: <RoiCalc /> },
    { id: 'prompt', icon: <BookOpen className="w-4 h-4" />,   label: 'Prompt Library', desc: 'Prompt pronti per analisi e report',   component: <PromptLibrary /> },
  ],
  marketing: [
    { id: 'brief', icon: <BookOpen className="w-4 h-4" />,    label: 'Content Brief', desc: 'Genera brief per contenuti',           component: <ContentBrief /> },
    { id: 'utm',   icon: <Link2 className="w-4 h-4" />,       label: 'UTM Builder',   desc: 'Link tracciati per le campagne',       component: <UtmBuilder /> },
    { id: 'prompt', icon: <Zap className="w-4 h-4" />,        label: 'Prompt Library', desc: 'Prompt per copy e strategia',        component: <PromptLibrary /> },
  ],
  digital: [
    { id: 'deploy', icon: <ListChecks className="w-4 h-4" />, label: 'Deploy Checklist', desc: 'Lista di controllo pre-deploy',    component: <DeployChecklist /> },
    { id: 'prompt', icon: <BookOpen className="w-4 h-4" />,   label: 'Prompt Library', desc: 'Prompt per dev e audit tecnici',     component: <PromptLibrary /> },
    { id: 'roi',    icon: <Calculator className="w-4 h-4" />, label: 'ROI Calculator', desc: 'Stima ritorno su progetti digitali', component: <RoiCalc /> },
  ],
  ai: [
    { id: 'tokens', icon: <Calculator className="w-4 h-4" />, label: 'Token Estimator', desc: 'Stima costi AI per modello',       component: <TokenEstimator /> },
    { id: 'prompt', icon: <BookOpen className="w-4 h-4" />,   label: 'Prompt Library', desc: 'Libreria prompt ingegnerizzati',     component: <PromptLibrary /> },
    { id: 'roi',    icon: <Zap className="w-4 h-4" />,        label: 'ROI / ROAS',    desc: 'Calcola ritorno su automazioni',     component: <RoiCalc /> },
  ],
}

export function DeptToolbox({ dept }: { dept: ProjectKind }) {
  const tools = TOOLS[dept]
  const [active, setActive] = useState(tools[0].id)
  const current = tools.find(t => t.id === active)!

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-xl font-black text-white">Toolbox</h2>
        <p className="text-[#444] text-sm mt-0.5">Strumenti operativi per il reparto</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {tools.map(t => (
          <button key={t.id} onClick={() => setActive(t.id)}
            className={`p-4 rounded-2xl border text-left transition-all ${
              active === t.id
                ? 'bg-[#F5C800]/10 border-[#F5C800]/30 text-white'
                : 'bg-[#0D0D0D] border-[#1A1A1A] text-[#666] hover:border-[#2A2A2A] hover:text-white'
            }`}>
            <div className={`mb-2 ${active === t.id ? 'text-[#F5C800]' : 'text-[#444]'}`}>{t.icon}</div>
            <p className="text-sm font-bold truncate">{t.label}</p>
            <p className="text-[10px] mt-0.5 text-[#444] leading-tight">{t.desc}</p>
          </button>
        ))}
      </div>

      <div className="bg-[#0D0D0D] border border-[#1A1A1A] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[#F5C800]">{current.icon}</span>
          <h3 className="text-sm font-bold text-white">{current.label}</h3>
        </div>
        {current.component}
      </div>
    </div>
  )
}

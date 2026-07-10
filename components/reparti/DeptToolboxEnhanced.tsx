'use client'

import { useState } from 'react'
import {
  Calculator, Link2, FileText, ClipboardList, CheckSquare,
  Copy, RefreshCw, Zap, Hash, Search, AlertCircle,
  Globe, Cpu, DollarSign, BarChart2, Mail, Scissors,
  Target, TrendingUp, Layers, Code, Palette,
} from 'lucide-react'
import type { ProjectKind } from '@/lib/types/database'

// ─── Utility ──────────────────────────────────────────────────────────────────
const copy = (t: string) => navigator.clipboard.writeText(t)

function CopyBtn({ text, label = 'Copia' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { copy(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-2xs font-bold border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-border-strong transition-all">
      <Copy className="w-3 h-3" />
      {copied ? '✓ Copiato' : label}
    </button>
  )
}

function ToolCard({ icon, title, color, children }: {
  icon: React.ReactNode; title: string; color: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-background border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-background transition-colors text-left">
        <span className="p-2 rounded-xl shrink-0" style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, color }}>
          {icon}
        </span>
        <span className="text-sm font-bold text-text-primary flex-1">{title}</span>
        <span className="text-2xs text-text-tertiary">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-border space-y-3">{children}</div>}
    </div>
  )
}

const inp = 'w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-border placeholder:text-text-tertiary'
const lbl = 'block text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider'
const result = 'mt-2 p-3 bg-background border border-border rounded-xl text-xs text-text-primary font-mono break-all'

// ══════════════════════════════════════════════════════════════════════════════
// CORE TOOLS (all depts)
// ══════════════════════════════════════════════════════════════════════════════

function UTMBuilder() {
  const [f, setF] = useState({ url: '', source: '', medium: '', campaign: '', term: '', content: '' })
  const build = () => {
    if (!f.url) return ''
    const p = new URLSearchParams()
    if (f.source)   p.set('utm_source', f.source)
    if (f.medium)   p.set('utm_medium', f.medium)
    if (f.campaign) p.set('utm_campaign', f.campaign)
    if (f.term)     p.set('utm_term', f.term)
    if (f.content)  p.set('utm_content', f.content)
    return `${f.url}${f.url.includes('?') ? '&' : '?'}${p.toString()}`
  }
  const out = build()
  return (
    <ToolCard icon={<Link2 className="w-4 h-4" />} title="UTM Builder" color="#3B82F6">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2"><label className={lbl}>URL destinazione</label><input value={f.url} onChange={e => setF(p => ({...p, url: e.target.value}))} className={inp} placeholder="https://..." /></div>
        <div><label className={lbl}>Source</label><input value={f.source} onChange={e => setF(p => ({...p, source: e.target.value}))} className={inp} placeholder="google" /></div>
        <div><label className={lbl}>Medium</label><input value={f.medium} onChange={e => setF(p => ({...p, medium: e.target.value}))} className={inp} placeholder="cpc" /></div>
        <div><label className={lbl}>Campaign</label><input value={f.campaign} onChange={e => setF(p => ({...p, campaign: e.target.value}))} className={inp} placeholder="summer_sale" /></div>
        <div><label className={lbl}>Content</label><input value={f.content} onChange={e => setF(p => ({...p, content: e.target.value}))} className={inp} placeholder="banner_v1" /></div>
      </div>
      {out && <><div className={result}>{out}</div><div className="flex justify-end mt-2"><CopyBtn text={out} /></div></>}
    </ToolCard>
  )
}

function BriefGenerator() {
  const [f, setF] = useState({ client: '', obiettivo: '', target: '', budget: '', tempi: '', note: '' })
  const brief = f.client ? `# Brief di Progetto — ${f.client}

**Obiettivo:** ${f.obiettivo || '—'}
**Target audience:** ${f.target || '—'}
**Budget:** ${f.budget ? `€${f.budget}` : '—'}
**Tempistiche:** ${f.tempi || '—'}

**Note aggiuntive:**
${f.note || '—'}

---
*Generato il ${new Date().toLocaleDateString('it-IT')} — TwoBee*` : ''

  return (
    <ToolCard icon={<FileText className="w-4 h-4" />} title="Brief Generator" color="#F59E0B">
      <div className="grid grid-cols-2 gap-2">
        <div><label className={lbl}>Cliente</label><input value={f.client} onChange={e => setF(p => ({...p, client: e.target.value}))} className={inp} placeholder="Nome cliente" /></div>
        <div><label className={lbl}>Budget (€)</label><input value={f.budget} onChange={e => setF(p => ({...p, budget: e.target.value}))} className={inp} placeholder="5000" /></div>
        <div className="col-span-2"><label className={lbl}>Obiettivo</label><input value={f.obiettivo} onChange={e => setF(p => ({...p, obiettivo: e.target.value}))} className={inp} placeholder="Aumentare le vendite online del 30%" /></div>
        <div className="col-span-2"><label className={lbl}>Target audience</label><input value={f.target} onChange={e => setF(p => ({...p, target: e.target.value}))} className={inp} placeholder="Donne 25-45, amanti del fitness" /></div>
        <div><label className={lbl}>Tempistiche</label><input value={f.tempi} onChange={e => setF(p => ({...p, tempi: e.target.value}))} className={inp} placeholder="8 settimane" /></div>
        <div><label className={lbl}>Note</label><input value={f.note} onChange={e => setF(p => ({...p, note: e.target.value}))} className={inp} placeholder="Priorità mobile" /></div>
      </div>
      {brief && <><div className={result} style={{ whiteSpace: 'pre-wrap' }}>{brief}</div><div className="flex justify-end mt-2"><CopyBtn text={brief} /></div></>}
    </ToolCard>
  )
}

function TimeEstimator() {
  const ROLES = ['Strategist', 'Designer', 'Developer', 'Copywriter', 'PM']
  const RATES: Record<string, number> = { Strategist: 90, Designer: 75, Developer: 85, Copywriter: 60, PM: 70 }
  const [rows, setRows] = useState(ROLES.map(r => ({ role: r, hours: 0 })))
  const total = rows.reduce((s, r) => s + r.hours, 0)
  const cost  = rows.reduce((s, r) => s + r.hours * (RATES[r.role] ?? 0), 0)
  return (
    <ToolCard icon={<Calculator className="w-4 h-4" />} title="Stimatore Ore & Costi" color="#22C55E">
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.role} className="flex items-center gap-3">
            <span className="text-xs text-text-tertiary w-24 shrink-0">{r.role}</span>
            <input type="number" min={0} value={r.hours || ''} onChange={e => setRows(p => p.map((x, j) => j === i ? {...x, hours: +e.target.value} : x))}
              className="w-20 bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary focus:outline-none text-right" placeholder="0" />
            <span className="text-2xs text-text-tertiary">h</span>
            <span className="text-2xs text-text-tertiary ml-auto">€{(r.hours * (RATES[r.role] ?? 0)).toLocaleString('it-IT')}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
        <span className="text-sm font-bold text-text-primary">{total}h totali</span>
        <span className="text-sm font-black text-gold-text">€{cost.toLocaleString('it-IT')}</span>
      </div>
    </ToolCard>
  )
}

function ChecklistTool({ items, title, color }: { items: string[]; title: string; color: string }) {
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const toggle = (i: number) => setChecked(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n })
  const pct = Math.round((checked.size / items.length) * 100)
  return (
    <ToolCard icon={<CheckSquare className="w-4 h-4" />} title={title} color={color}>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-2xs font-bold text-text-tertiary">{checked.size}/{items.length}</span>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <label key={i} className="flex items-start gap-2.5 cursor-pointer group">
            <div onClick={() => toggle(i)}
              className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                checked.has(i) ? 'bg-success border-success' : 'border-border group-hover:border-border-strong'
              }`}>
              {checked.has(i) && <span className="text-[8px] text-on-gold font-black">✓</span>}
            </div>
            <span className={`text-xs transition-colors ${checked.has(i) ? 'line-through text-text-tertiary' : 'text-text-secondary'}`}>{item}</span>
          </label>
        ))}
      </div>
      {checked.size === items.length && (
        <p className="mt-3 text-center text-xs font-bold text-success">✓ Tutto completato!</p>
      )}
      <button onClick={() => setChecked(new Set())} className="mt-2 text-2xs text-text-tertiary hover:text-text-tertiary flex items-center gap-1">
        <RefreshCw className="w-3 h-3" /> Reset
      </button>
    </ToolCard>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// GROWTH TOOLS
// ══════════════════════════════════════════════════════════════════════════════

function MERCalc() {
  const [rev, setRev] = useState('')
  const [spend, setSpend] = useState('')
  const mer  = rev && spend ? (parseFloat(rev) / parseFloat(spend)).toFixed(2) : null
  const recs = mer ? parseFloat(mer) >= 4 ? '🟢 Ottimo — scala il budget' : parseFloat(mer) >= 2.5 ? '🟡 Buono — ottimizza creative' : '🔴 Sotto soglia — rivedi strategia' : ''
  return (
    <ToolCard icon={<TrendingUp className="w-4 h-4" />} title="MER Calculator (Media Efficiency Ratio)" color="#22C55E">
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Revenue totale (€)</label><input type="number" value={rev} onChange={e => setRev(e.target.value)} className={inp} placeholder="50000" /></div>
        <div><label className={lbl}>Ad Spend totale (€)</label><input type="number" value={spend} onChange={e => setSpend(e.target.value)} className={inp} placeholder="10000" /></div>
      </div>
      {mer && (
        <div className="mt-3 p-4 bg-background border border-border rounded-xl text-center">
          <p className="text-3xl font-black text-success">MER {mer}x</p>
          <p className="text-xs text-text-tertiary mt-1">{recs}</p>
          <p className="text-2xs text-text-tertiary mt-2">Breakeven MER: {spend && rev ? ((parseFloat(spend) / parseFloat(rev)) * 100).toFixed(1) : '—'}% of revenue</p>
        </div>
      )}
    </ToolCard>
  )
}

function LTVCalc() {
  const [aov, setAov] = useState('')
  const [freq, setFreq] = useState('')
  const [life, setLife] = useState('')
  const [margin, setMargin] = useState('')
  const ltv  = aov && freq && life ? parseFloat(aov) * parseFloat(freq) * parseFloat(life) : null
  const cltv = ltv && margin ? ltv * (parseFloat(margin) / 100) : null
  return (
    <ToolCard icon={<DollarSign className="w-4 h-4" />} title="LTV Calculator" color="#F5C800">
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>AOV — Valore medio ordine (€)</label><input type="number" value={aov} onChange={e => setAov(e.target.value)} className={inp} placeholder="85" /></div>
        <div><label className={lbl}>Frequenza acquisto/anno</label><input type="number" value={freq} onChange={e => setFreq(e.target.value)} className={inp} placeholder="4" /></div>
        <div><label className={lbl}>Durata media cliente (anni)</label><input type="number" value={life} onChange={e => setLife(e.target.value)} className={inp} placeholder="3" /></div>
        <div><label className={lbl}>Margine % (opzionale)</label><input type="number" value={margin} onChange={e => setMargin(e.target.value)} className={inp} placeholder="35" /></div>
      </div>
      {ltv && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="p-3 bg-background border border-border rounded-xl text-center">
            <p className="text-xl font-black text-gold-text">€{ltv.toLocaleString('it-IT')}</p>
            <p className="text-2xs text-text-tertiary">LTV grezzo</p>
          </div>
          {cltv && (
            <div className="p-3 bg-background border border-border rounded-xl text-center">
              <p className="text-xl font-black text-success">€{cltv.toLocaleString('it-IT')}</p>
              <p className="text-2xs text-text-tertiary">CLTV (con margine)</p>
            </div>
          )}
        </div>
      )}
    </ToolCard>
  )
}

function FunnelCalc() {
  const STAGES = ['Visite', 'Lead', 'MQL', 'SQL', 'Clienti']
  const [vals, setVals] = useState<number[]>([10000, 500, 150, 40, 12])
  const rates = vals.map((v, i) => i === 0 ? 100 : vals[i - 1] > 0 ? ((v / vals[i - 1]) * 100).toFixed(1) : '0')
  return (
    <ToolCard icon={<BarChart2 className="w-4 h-4" />} title="Funnel Conversion Analyzer" color="#A855F7">
      <div className="space-y-2">
        {STAGES.map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <span className="text-xs text-text-tertiary w-20 shrink-0">{s}</span>
            <input type="number" min={0} value={vals[i] || ''} onChange={e => setVals(p => p.map((x, j) => j === i ? +e.target.value : x))}
              className="w-24 bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary text-right focus:outline-none" />
            {i > 0 && <span className="text-2xs text-text-tertiary">→ {rates[i]}%</span>}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-text-tertiary">CPL (stima):</span>
        <span className="font-bold text-text-primary">
          {vals[1] > 0 && vals[0] > 0 ? `${((vals[0] * 0.5) / vals[1]).toFixed(2)} €/lead` : '—'}
        </span>
      </div>
    </ToolCard>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MARKETING TOOLS
// ══════════════════════════════════════════════════════════════════════════════

function ABTestCalc() {
  const [n1, setN1] = useState(''); const [c1, setC1] = useState('')
  const [n2, setN2] = useState(''); const [c2, setC2] = useState('')
  const cr1 = n1 && c1 ? parseFloat(c1) / parseFloat(n1) : null
  const cr2 = n2 && c2 ? parseFloat(c2) / parseFloat(n2) : null
  const lift = cr1 && cr2 && cr1 > 0 ? (((cr2 - cr1) / cr1) * 100).toFixed(1) : null
  const winner = cr1 && cr2 ? (cr2 > cr1 ? 'B' : cr1 > cr2 ? 'A' : '—') : null
  return (
    <ToolCard icon={<Scissors className="w-4 h-4" />} title="A/B Test Significance" color="#F59E0B">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-2xs font-bold text-text-tertiary mb-2">Variante A</p>
          <div className="space-y-2">
            <div><label className={lbl}>Visitatori</label><input type="number" value={n1} onChange={e => setN1(e.target.value)} className={inp} placeholder="1000" /></div>
            <div><label className={lbl}>Conversioni</label><input type="number" value={c1} onChange={e => setC1(e.target.value)} className={inp} placeholder="45" /></div>
          </div>
          {cr1 && <p className="text-xs text-text-secondary mt-2">CR: <strong className="text-text-primary">{(cr1 * 100).toFixed(2)}%</strong></p>}
        </div>
        <div>
          <p className="text-2xs font-bold text-gold-text mb-2">Variante B</p>
          <div className="space-y-2">
            <div><label className={lbl}>Visitatori</label><input type="number" value={n2} onChange={e => setN2(e.target.value)} className={inp} placeholder="1000" /></div>
            <div><label className={lbl}>Conversioni</label><input type="number" value={c2} onChange={e => setC2(e.target.value)} className={inp} placeholder="58" /></div>
          </div>
          {cr2 && <p className="text-xs text-text-secondary mt-2">CR: <strong className="text-text-primary">{(cr2 * 100).toFixed(2)}%</strong></p>}
        </div>
      </div>
      {lift && (
        <div className={`mt-3 p-3 rounded-xl text-center border ${parseFloat(lift) > 0 ? 'border-success/20 bg-success/5' : 'border-error/20 bg-error/5'}`}>
          <p className="text-sm font-black text-text-primary">Variante {winner} vince</p>
          <p className={`text-lg font-black ${parseFloat(lift) > 0 ? 'text-success' : 'text-error'}`}>{lift}% lift</p>
          <p className="text-2xs text-text-tertiary mt-1">
            {Math.abs(parseFloat(lift)) < 5 ? 'Differenza non significativa' : Math.abs(parseFloat(lift)) < 15 ? 'Risultato moderato' : 'Differenza significativa'}
          </p>
        </div>
      )}
    </ToolCard>
  )
}

function HashtagResearch() {
  const SUGGESTIONS: Record<string, string[]> = {
    ecommerce: ['#ecommerce', '#shopify', '#dropshipping', '#vendere', '#negozio'],
    fashion:   ['#fashion', '#moda', '#outfit', '#style', '#ootd'],
    fitness:   ['#fitness', '#workout', '#gym', '#allenamento', '#salute'],
    food:      ['#food', '#cucina', '#ricette', '#foodporn', '#chef'],
    travel:    ['#travel', '#viaggi', '#explore', '#adventure', '#tourism'],
    business:  ['#business', '#startup', '#imprenditore', '#marketing', '#crescita'],
  }
  const [category, setCategory] = useState<keyof typeof SUGGESTIONS>('business')
  const [custom, setCustom] = useState('')
  const tags = [...(SUGGESTIONS[category] ?? []), ...(custom ? [`#${custom.replace('#','')}`] : [])].join(' ')

  return (
    <ToolCard icon={<Hash className="w-4 h-4" />} title="Hashtag Toolkit" color="#EC4899">
      <div className="grid grid-cols-3 gap-2 mb-3">
        {Object.keys(SUGGESTIONS).map(c => (
          <button key={c} onClick={() => setCategory(c as any)}
            className={`px-2 py-1.5 rounded-lg text-2xs font-bold capitalize border transition-all ${category === c ? 'border-gold text-gold-text bg-gold/10' : 'border-border text-text-tertiary hover:border-border'}`}>
            {c}
          </button>
        ))}
      </div>
      <div><label className={lbl}>Aggiungi hashtag custom</label>
        <input value={custom} onChange={e => setCustom(e.target.value)} className={inp} placeholder="tuoBrand" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(SUGGESTIONS[category] ?? []).concat(custom ? [`#${custom.replace('#','')}`] : []).map(h => (
          <span key={h} onClick={() => copy(h)}
            className="text-2xs text-text-secondary bg-background border border-border px-2 py-1 rounded-full cursor-pointer hover:border-gold hover:text-text-primary transition-all">
            {h}
          </span>
        ))}
      </div>
      {tags && <div className="flex justify-end mt-2"><CopyBtn text={tags} label="Copia tutti" /></div>}
    </ToolCard>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DIGITAL TOOLS
// ══════════════════════════════════════════════════════════════════════════════

function MetaChecker() {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const tLen = title.length; const dLen = desc.length
  const tOk = tLen >= 50 && tLen <= 60
  const dOk = dLen >= 120 && dLen <= 160
  return (
    <ToolCard icon={<Search className="w-4 h-4" />} title="SEO Meta Checker" color="#3B82F6">
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={lbl + ' mb-0'}>Title tag</label>
            <span className={`text-2xs font-bold ${tOk ? 'text-success' : tLen > 60 ? 'text-error' : 'text-gold-text'}`}>
              {tLen}/60 {tOk ? '✓' : tLen > 60 ? '⚠ troppo lungo' : '⚠ troppo corto'}
            </span>
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} className={inp} placeholder="Il tuo title tag ottimale per Google…" maxLength={80} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={lbl + ' mb-0'}>Meta description</label>
            <span className={`text-2xs font-bold ${dOk ? 'text-success' : dLen > 160 ? 'text-error' : 'text-gold-text'}`}>
              {dLen}/160 {dOk ? '✓' : dLen > 160 ? '⚠ troppo lunga' : '⚠ troppo corta'}
            </span>
          </div>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} className={inp} rows={3} placeholder="Descrizione che appare nei risultati di ricerca…" maxLength={200} />
        </div>
        {title && (
          <div className="p-3 bg-background border border-border rounded-xl">
            <p className="text-2xs text-text-tertiary mb-2">Preview SERP</p>
            <p className="text-sm text-[#4285F4] font-medium truncate">{title || 'Titolo pagina'}</p>
            <p className="text-2xs text-[#34A853]">twobee.it › pagina</p>
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{desc || 'Nessuna meta description.'}</p>
          </div>
        )}
      </div>
    </ToolCard>
  )
}

function PageSpeedBudget() {
  const [total, setTotal] = useState('3000')
  const ASSETS = [
    { name: 'HTML', rec: 30, color: 'var(--color-gold-text)' },
    { name: 'CSS',  rec: 100, color: 'var(--color-info)' },
    { name: 'JS',   rec: 500, color: 'var(--color-error)' },
    { name: 'Immagini', rec: 1000, color: 'var(--color-success)' },
    { name: 'Font', rec: 100, color: 'var(--color-accent)' },
    { name: 'Altri', rec: 200, color: 'var(--color-warning)' },
  ]
  const used = ASSETS.reduce((s, a) => s + a.rec, 0)
  const budget = parseFloat(total) || 3000
  const ratio = used / budget
  return (
    <ToolCard icon={<Zap className="w-4 h-4" />} title="Performance Budget" color="#22C55E">
      <div className="flex items-center gap-3 mb-3">
        <label className={lbl + ' mb-0 shrink-0'}>Budget totale (KB)</label>
        <input type="number" value={total} onChange={e => setTotal(e.target.value)} className="w-24 bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary text-right focus:outline-none" />
      </div>
      <div className="space-y-2">
        {ASSETS.map(a => (
          <div key={a.name} className="flex items-center gap-3">
            <span className="text-xs text-text-tertiary w-20 shrink-0">{a.name}</span>
            <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.min((a.rec / budget) * 100, 100)}%`, background: a.color }} />
            </div>
            <span className="text-2xs text-text-tertiary w-14 text-right">{a.rec} KB</span>
          </div>
        ))}
      </div>
      <div className={`mt-3 pt-3 border-t border-border flex justify-between ${ratio > 1 ? 'text-error' : 'text-success'}`}>
        <span className="text-xs font-bold">Totale usato</span>
        <span className="text-xs font-black">{used} KB / {budget} KB {ratio > 1 ? '⚠ OVER BUDGET' : '✓ OK'}</span>
      </div>
    </ToolCard>
  )
}

function ColorContrastCheck() {
  const [fg, setFg] = useState('#FFFFFF')
  const [bg, setBg] = useState('var(--color-background)')

  const hex2rgb = (h: string) => {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h)
    return r ? [parseInt(r[1],16), parseInt(r[2],16), parseInt(r[3],16)] : [0,0,0]
  }
  const luminance = (r: number, g: number, b: number) => {
    const [rr,gg,bb] = [r,g,b].map(v => { const s = v/255; return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055,2.4) })
    return 0.2126*rr + 0.7152*gg + 0.0722*bb
  }
  const [r1,g1,b1] = hex2rgb(fg); const [r2,g2,b2] = hex2rgb(bg)
  const l1 = luminance(r1,g1,b1); const l2 = luminance(r2,g2,b2)
  const ratio = (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)
  const aa = ratio >= 4.5; const aaa = ratio >= 7

  return (
    <ToolCard icon={<Palette className="w-4 h-4" />} title="Color Contrast Checker" color="#EC4899">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Testo (foreground)</label>
          <div className="flex items-center gap-2">
            <input type="color" value={fg} onChange={e => setFg(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
            <input value={fg} onChange={e => setFg(e.target.value)} className={inp} placeholder="#FFFFFF" />
          </div>
        </div>
        <div>
          <label className={lbl}>Sfondo (background)</label>
          <div className="flex items-center gap-2">
            <input type="color" value={bg} onChange={e => setBg(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
            <input value={bg} onChange={e => setBg(e.target.value)} className={inp} placeholder="#111111" />
          </div>
        </div>
      </div>
      <div className="mt-3 p-4 rounded-xl flex flex-col items-center gap-2" style={{ background: bg }}>
        <p className="text-lg font-black" style={{ color: fg }}>Testo di esempio</p>
        <p className="text-xs" style={{ color: fg }}>Come appare il tuo testo</p>
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-2xl font-black text-text-primary">{ratio.toFixed(2)}:1</span>
        <div className="flex gap-2">
          <span className={`text-2xs font-black px-2 py-1 rounded-full ${aa ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>AA {aa ? '✓' : '✗'}</span>
          <span className={`text-2xs font-black px-2 py-1 rounded-full ${aaa ? 'bg-success/15 text-success' : 'bg-surface text-text-tertiary'}`}>AAA {aaa ? '✓' : '✗'}</span>
        </div>
      </div>
    </ToolCard>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// AI TOOLS
// ══════════════════════════════════════════════════════════════════════════════

function TokenEstimator() {
  const MODELS = [
    { name: 'GPT-4o', in: 0.005, out: 0.015 },
    { name: 'GPT-4o mini', in: 0.00015, out: 0.0006 },
    { name: 'Claude Opus', in: 0.015, out: 0.075 },
    { name: 'Claude Sonnet', in: 0.003, out: 0.015 },
    { name: 'Llama 3.3 70B (Groq)', in: 0.00059, out: 0.00079 },
    { name: 'Gemini 1.5 Pro', in: 0.00125, out: 0.005 },
  ]
  const [inTok, setIn] = useState('1000')
  const [outTok, setOut] = useState('500')
  const [calls, setCalls] = useState('1000')
  const n = parseFloat(calls) || 1

  return (
    <ToolCard icon={<Cpu className="w-4 h-4" />} title="Token Cost Estimator" color="#A855F7">
      <div className="grid grid-cols-3 gap-2">
        <div><label className={lbl}>Token input</label><input type="number" value={inTok} onChange={e => setIn(e.target.value)} className={inp} placeholder="1000" /></div>
        <div><label className={lbl}>Token output</label><input type="number" value={outTok} onChange={e => setOut(e.target.value)} className={inp} placeholder="500" /></div>
        <div><label className={lbl}>N° chiamate</label><input type="number" value={calls} onChange={e => setCalls(e.target.value)} className={inp} placeholder="1000" /></div>
      </div>
      <div className="mt-3 space-y-2">
        {MODELS.map(m => {
          const cost = ((parseFloat(inTok)*m.in + parseFloat(outTok)*m.out) / 1000) * n
          return (
            <div key={m.name} className="flex items-center gap-3">
              <span className="text-xs text-text-tertiary flex-1 truncate">{m.name}</span>
              <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min((cost / ((parseFloat(inTok)*MODELS[0].in + parseFloat(outTok)*MODELS[0].out) / 1000 * n)) * 100, 100)}%` }} />
              </div>
              <span className="text-xs font-bold text-text-primary w-16 text-right">${cost.toFixed(2)}</span>
            </div>
          )
        })}
      </div>
    </ToolCard>
  )
}

function PromptLibrary() {
  const PROMPTS: Record<string, { label: string; text: string }[]> = {
    growth:    [
      { label: 'Analisi competitor', text: 'Analizza i 5 principali competitor di [BRAND] nel mercato italiano. Per ciascuno: posizionamento, pricing, punti di forza e debolezza, canali di acquisizione principali.' },
      { label: 'Strategia di retention', text: 'Crea una strategia di retention a 90 giorni per clienti che hanno acquistato [PRODOTTO]. Includi: sequenza email, offerte personalizzate, programma fedeltà e metriche di successo.' },
      { label: 'OKR trimestrale', text: 'Definisci 3 OKR per il reparto Growth nel Q[N] [ANNO]. Focus su: acquisizione, conversione e retention. Ogni KR deve essere misurabile e raggiungibile in 90 giorni.' },
    ],
    marketing: [
      { label: 'Content calendar', text: 'Crea un content calendar di 4 settimane per [BRAND] su Instagram e LinkedIn. Includi: temi, format (reel/story/post), caption bozza, hashtag suggeriti e best timing di pubblicazione.' },
      { label: 'Copy per ADV', text: 'Scrivi 3 varianti di copy per campagna Meta Ads per [PRODOTTO/SERVIZIO]. Target: [AUDIENCE]. Obiettivo: [OBIETTIVO]. Include headline (max 40 char), primary text (max 125 char), CTA.' },
      { label: 'Brand positioning', text: 'Aiutami a definire il brand positioning di [BRAND]. Includi: unique value proposition, tono di voce, 3 pilastri di comunicazione, archetipi del brand e differenziazione dalla concorrenza.' },
    ],
    digital:   [
      { label: 'Tech stack review', text: 'Analizza il seguente stack tecnologico: [LISTA TECNOLOGIE]. Per [TIPO PROGETTO] da [N] utenti al mese. Identifica: colli di bottiglia, rischi di scalabilità, alternative consigliate e roadmap di ottimizzazione.' },
      { label: 'UX audit checklist', text: 'Esegui un UX audit della home page di [URL/DESCRIZIONE]. Analizza: primo impatto, chiarezza della value proposition, CTA, navigazione, mobile experience, accessibilità e velocità percepita.' },
      { label: 'API design review', text: 'Revisa il design di questa API REST: [DESCRIZIONE ENDPOINT]. Considera: naming conventions, HTTP methods, status codes, versionamento, autenticazione, rate limiting e documentazione.' },
    ],
    ai:        [
      { label: 'System prompt ottimale', text: 'Aiutami a scrivere il system prompt ottimale per un assistente AI che deve: [OBIETTIVO]. Il tone of voice deve essere [TONO]. Includi: istruzioni di comportamento, limitazioni, formato output preferito.' },
      { label: 'RAG architecture', text: 'Progetta l\'architettura RAG per [USE CASE]. Definisci: strategia di chunking, scelta del vector DB, embedding model, retrieval strategy, reranking, e come gestire le allucinazioni.' },
      { label: 'AI ROI calculation', text: 'Calcola il ROI stimato dell\'implementazione di [SOLUZIONE AI] per una azienda di [N] dipendenti nel settore [SETTORE]. Include: costi di implementazione, saving di ore, aumento efficienza, payback period.' },
    ],
  }

  const [dept, setDept] = useState<keyof typeof PROMPTS>('growth')
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <ToolCard icon={<Code className="w-4 h-4" />} title="Prompt Library" color="#F5C800">
      <div className="flex gap-2 mb-3">
        {Object.keys(PROMPTS).map(d => (
          <button key={d} onClick={() => { setDept(d as any); setSelected(null) }}
            className={`px-2 py-1 rounded-lg text-2xs font-bold capitalize border transition-all ${dept === d ? 'border-gold text-gold-text bg-gold/10' : 'border-border text-text-tertiary hover:border-border'}`}>
            {d}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {(PROMPTS[dept] ?? []).map(p => (
          <div key={p.label} className="border border-border rounded-xl overflow-hidden">
            <button onClick={() => setSelected(selected === p.label ? null : p.label)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-background transition-colors text-left">
              <span className="text-xs text-text-secondary font-semibold">{p.label}</span>
              <span className="text-text-tertiary text-xs">{selected === p.label ? '▲' : '▼'}</span>
            </button>
            {selected === p.label && (
              <div className="px-3 pb-3 border-t border-border">
                <p className="text-xs text-text-tertiary mt-2 leading-relaxed">{p.text}</p>
                <div className="flex justify-end mt-2"><CopyBtn text={p.text} /></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </ToolCard>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════════════════════

const LAUNCH_CHECKLIST = [
  'Funzionalità core testate su tutti i browser', 'Mobile responsive verificato (320px-1920px)',
  'Tempi di caricamento < 3s su 3G', 'Meta tag (title, description, OG) configurati',
  'Google Analytics / GTM installato e testato', 'Sitemap XML generata e inviata a Search Console',
  'SSL/HTTPS attivo e certificato valido', 'Form testati con notifiche email',
  'Backup automatici configurati', '404 e redirect gestiti correttamente',
  'GDPR: cookie banner e privacy policy presenti', 'Credenziali consegnate al cliente',
]

const DEPT_SPECIFIC: Record<ProjectKind, React.ReactNode[]> = {
  growth:    [<MERCalc key="mer" />, <LTVCalc key="ltv" />, <FunnelCalc key="funnel" />],
  marketing: [<ABTestCalc key="ab" />, <HashtagResearch key="hash" />, <BriefGenerator key="brief" />],
  digital:   [<MetaChecker key="meta" />, <PageSpeedBudget key="speed" />, <ColorContrastCheck key="color" />],
  ai:        [<TokenEstimator key="token" />, <PromptLibrary key="prompts" />, <TokenEstimator key="token2" />],
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function DeptToolboxEnhanced({ dept }: { dept: ProjectKind }) {
  const [section, setSection] = useState<'core' | 'specializzati'>('core')

  return (
    <div className="space-y-4">
      <div className="flex bg-surface border border-border rounded-xl p-1 gap-1 w-fit">
        {(['core', 'specializzati'] as const).map(s => (
          <button key={s} onClick={() => setSection(s)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${section === s ? 'text-on-gold bg-gold' : 'text-text-tertiary hover:text-text-primary'}`}>
            {s === 'core' ? '🔧 Tool Core' : `⚡ Tool ${dept.charAt(0).toUpperCase() + dept.slice(1)}`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {section === 'core' ? (
          <>
            <UTMBuilder />
            <TimeEstimator />
            <BriefGenerator />
            <ChecklistTool title="Pre-Launch Checklist" color="#22C55E" items={LAUNCH_CHECKLIST} />
            <PromptLibrary />
          </>
        ) : (
          DEPT_SPECIFIC[dept]
        )}
      </div>
    </div>
  )
}

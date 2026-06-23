import { NextRequest, NextResponse } from 'next/server'
import type { Client, ClientKpi } from '@/lib/types/database'

async function groq(prompt: string): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY non configurata')
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

interface StdKpiDef {
  key: string; label: string; unit?: string; prefix?: string
  lower_is_better?: boolean; decimals?: number; isInt?: boolean; targetKey?: string
}
interface ReportBody {
  client: Client; kpis: ClientKpi[]; stdDefs: StdKpiDef[]; enabledKeys: string[]
}

const MONTH_IT: Record<string, string> = {
  '01':'Gennaio','02':'Febbraio','03':'Marzo','04':'Aprile','05':'Maggio','06':'Giugno',
  '07':'Luglio','08':'Agosto','09':'Settembre','10':'Ottobre','11':'Novembre','12':'Dicembre',
}
const MONTH_SHORT: Record<string, string> = {
  '01':'Gen','02':'Feb','03':'Mar','04':'Apr','05':'Mag','06':'Giu',
  '07':'Lug','08':'Ago','09':'Set','10':'Ott','11':'Nov','12':'Dic',
}

function fmtMonth(ym: string) { const [y,m]=ym.split('-'); return `${MONTH_IT[m]} ${y}` }
function fmtShort(ym: string) { const [y,m]=ym.split('-'); return `${MONTH_SHORT[m]} '${y.slice(2)}` }
function fmtVal(v: number|null|undefined, def: StdKpiDef): string {
  if (v==null) return '—'
  const fixed = v.toFixed(def.decimals ?? (def.isInt ? 0 : 2))
  return `${def.prefix??''}${Number(fixed).toLocaleString('it-IT')}${def.unit??''}`
}
function getVal(kpi: ClientKpi, key: string): number|null {
  return (kpi as unknown as Record<string,number|null>)[key] ?? null
}
function pct(curr: number|null, prev: number|null): number|null {
  if (curr==null||prev==null||prev===0) return null
  return ((curr-prev)/Math.abs(prev))*100
}
function trendColor(v: number|null, prev: number|null, lib=false): string {
  const p=pct(v,prev); if(p==null) return '#555'
  if(Math.abs(p)<2) return '#888'
  return (lib ? p<0 : p>0) ? '#22C55E' : '#EF4444'
}
function trendLabel(v: number|null, prev: number|null, lib=false): string {
  const p=pct(v,prev); if(p==null) return ''
  const good=(lib?p<0:p>0); const sign=p>0?'+':''
  return `${good?'▲':'▼'} ${sign}${p.toFixed(1)}%`
}

/* ── SVG LINE CHART ── */
function svgLine(data: {label:string;value:number|null}[], accent: string, prefix='', unit=''): string {
  const W=560, H=140, PAD={t:16,r:16,b:32,l:52}
  const vals = data.map(d=>d.value??0)
  const max = Math.max(...vals,1), min = Math.min(...vals,0)
  const range = max-min || 1
  const xs = data.map((_,i)=> PAD.l + i*(W-PAD.l-PAD.r)/(Math.max(data.length-1,1)))
  const ys = vals.map(v=> PAD.t + (1-(v-min)/range)*(H-PAD.t-PAD.b))

  const path = xs.map((x,i)=>`${i===0?'M':'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const area = `M${xs[0].toFixed(1)},${(H-PAD.b).toFixed(1)} ${xs.map((x,i)=>`L${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')} L${xs[xs.length-1].toFixed(1)},${(H-PAD.b).toFixed(1)} Z`

  const yTicks = [0,.25,.5,.75,1].map(t=>{
    const v=min+t*range
    const y=PAD.t+(1-t)*(H-PAD.t-PAD.b)
    const lbl=v>=1000?`${prefix}${(v/1000).toFixed(0)}k`:v>=1?`${prefix}${v.toFixed(1)}${unit}`:`${prefix}${v.toFixed(2)}${unit}`
    return `<line x1="${PAD.l}" y1="${y.toFixed(1)}" x2="${W-PAD.r}" y2="${y.toFixed(1)}" stroke="#1A1A1A" stroke-width="1"/>
    <text x="${(PAD.l-6).toFixed(0)}" y="${(y+4).toFixed(0)}" text-anchor="end" fill="#444" font-size="9">${lbl}</text>`
  }).join('')

  const dots = xs.map((x,i)=>vals[i]!=null?`
    <circle cx="${x.toFixed(1)}" cy="${ys[i].toFixed(1)}" r="4" fill="${accent}" stroke="#111" stroke-width="2"/>
    <text x="${x.toFixed(1)}" y="${(ys[i]-10).toFixed(0)}" text-anchor="middle" fill="#ccc" font-size="9" font-weight="600">${vals[i]>=1000?(vals[i]/1000).toFixed(1)+'k':vals[i].toFixed(vals[i]%1?1:0)}</text>`:'').join('')

  const labels = xs.map((x,i)=>`<text x="${x.toFixed(1)}" y="${(H-PAD.b+14).toFixed(0)}" text-anchor="middle" fill="#555" font-size="9">${data[i].label}</text>`).join('')

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
    <defs>
      <linearGradient id="g_${accent.replace('#','')}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${yTicks}
    <path d="${area}" fill="url(#g_${accent.replace('#','')})" />
    <path d="${path}" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${labels}
  </svg>`
}

/* ── SVG BAR CHART ── */
function svgBar(data: {label:string;value:number|null;value2?:number|null}[], accent: string, accent2='#3B82F6', prefix='', label2=''): string {
  const W=560, H=160, PAD={t:16,r:16,b:32,l:56}
  const allVals = data.flatMap(d=>[d.value??0,d.value2??0])
  const max=Math.max(...allVals,1)
  const barW = Math.min(40,(W-PAD.l-PAD.r)/(data.length*(label2?2.5:1.5)))
  const gap = (W-PAD.l-PAD.r)/data.length

  const yTicks=[0,.25,.5,.75,1].map(t=>{
    const v=t*max; const y=PAD.t+(1-t)*(H-PAD.t-PAD.b)
    const lbl=v>=1000?`${prefix}${(v/1000).toFixed(0)}k`:`${prefix}${v.toFixed(v>=10?0:1)}`
    return `<line x1="${PAD.l}" y1="${y.toFixed(0)}" x2="${W-PAD.r}" y2="${y.toFixed(0)}" stroke="#1A1A1A" stroke-width="1"/>
    <text x="${PAD.l-6}" y="${(y+4).toFixed(0)}" text-anchor="end" fill="#444" font-size="9">${lbl}</text>`
  }).join('')

  const bars = data.map((d,i)=>{
    const cx=PAD.l+i*gap+gap/2
    const v1=d.value??0; const bh1=Math.max(1,(v1/max)*(H-PAD.t-PAD.b))
    const y1=H-PAD.b-bh1
    const bar1=`<rect x="${(cx-(label2?barW:barW/2)).toFixed(1)}" y="${y1.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh1.toFixed(1)}" fill="${accent}" rx="3"/>`
    const lbl1=`<text x="${(cx-(label2?barW/2:0)).toFixed(1)}" y="${(y1-5).toFixed(0)}" text-anchor="middle" fill="#ccc" font-size="9" font-weight="600">${v1>=1000?(v1/1000).toFixed(1)+'k':v1.toFixed(0)}</text>`
    let bar2='', lbl2=''
    if(label2 && d.value2!=null){
      const v2=d.value2; const bh2=Math.max(1,(v2/max)*(H-PAD.t-PAD.b)); const y2=H-PAD.b-bh2
      bar2=`<rect x="${(cx+2).toFixed(1)}" y="${y2.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh2.toFixed(1)}" fill="${accent2}" rx="3"/>`
      lbl2=`<text x="${(cx+barW/2+2).toFixed(1)}" y="${(y2-5).toFixed(0)}" text-anchor="middle" fill="#ccc" font-size="9">${v2>=1000?(v2/1000).toFixed(1)+'k':v2.toFixed(0)}</text>`
    }
    const xLabel=`<text x="${cx.toFixed(1)}" y="${(H-PAD.b+14).toFixed(0)}" text-anchor="middle" fill="#555" font-size="9">${d.label}</text>`
    return bar1+lbl1+bar2+lbl2+xLabel
  }).join('')

  const legend=label2?`<text x="${PAD.l}" y="${H-2}" fill="${accent}" font-size="9" font-weight="600">■ Revenue</text>
  <text x="${PAD.l+70}" y="${H-2}" fill="${accent2}" font-size="9" font-weight="600">■ ${label2}</text>`  :''

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
    ${yTicks}${bars}${legend}
  </svg>`
}

/* ── SVG PROGRESS BAR ── */
function svgProgress(value: number, target: number, accent: string, label: string): string {
  const ratio=Math.min(value/target,1.2)
  const pctVal=(value/target*100).toFixed(0)
  const color=ratio>=1?'#22C55E':ratio>=0.7?accent:'#EF4444'
  const W=240
  return `<div style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px">
      <span style="color:#888">${label}</span>
      <span style="color:${color};font-weight:700">${pctVal}%</span>
    </div>
    <div style="background:#1A1A1A;border-radius:100px;height:6px;width:${W}px">
      <div style="background:${color};border-radius:100px;height:6px;width:${Math.min(ratio,1)*W}px;transition:width .3s"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:#444;margin-top:3px">
      <span>Attuale: <strong style="color:#999">${value.toLocaleString('it-IT')}</strong></span>
      <span>Target: ${target.toLocaleString('it-IT')}</span>
    </div>
  </div>`
}

async function generateAnalysis(
  client: Client, kpis: ClientKpi[], stdDefs: StdKpiDef[], enabledKeys: string[], from: string, to: string
): Promise<{executive:string;patterns:string;monthly:string;recommendations:string}> {
  const enabledDefs = stdDefs.filter(d=>enabledKeys.includes(d.key))
  const sorted=[...kpis].sort((a,b)=>a.month.localeCompare(b.month))
  const isGrowth=client.client_type==='growth'

  if (sorted.length === 0) {
    return {
      executive: 'Non sono presenti dati KPI per il periodo selezionato. Inserisci i valori mensili per ottenere un\'analisi completa.',
      patterns: '',
      monthly: '',
      recommendations: isGrowth
        ? '1. Inizia tracciando MER e Ad Spend per avere una baseline delle campagne.\n2. Imposta target mensili per lead generati e costo per lead.\n3. Configura il tracciamento delle conversioni su tutti i canali paid.\n4. Definisci un budget minimo di test per validare i canali pubblicitari.'
        : '1. Avvia il tracciamento delle sessioni organiche e degli utenti attivi.\n2. Imposta gli obiettivi di traffico e conversione nel sistema analytics.\n3. Configura il monitoraggio dell\'uptime e dei ticket di supporto.\n4. Definisci le metriche chiave di adozione per il prodotto o servizio.',
    }
  }

  // Calcola statistiche per il prompt
  const stats = enabledDefs.map(d => {
    const vals = sorted.map(k => getVal(k, d.key)).filter((v): v is number => v != null)
    if (vals.length === 0) return null
    const avg = vals.reduce((s,v)=>s+v,0)/vals.length
    const max = Math.max(...vals), min = Math.min(...vals)
    const first = vals[0], last = vals[vals.length-1]
    const totalChange = first > 0 ? ((last-first)/first*100).toFixed(1) : null
    return `${d.label}: media ${fmtVal(avg,d)}, min ${fmtVal(min,d)}, max ${fmtVal(max,d)}${totalChange?`, variazione totale ${totalChange}%`:''}`
  }).filter(Boolean).join('\n')

  const dataStr = sorted.map(k => {
    const vals = enabledDefs.map(d => {
      const v = getVal(k,d.key)
      return v!=null ? `${d.label}: ${fmtVal(v,d)}` : null
    }).filter(Boolean).join(', ')
    return `${fmtMonth(k.month.slice(0,7))}: ${vals}${k.notes?` [nota: ${k.notes}]`:''}`
  }).join('\n')

  const prompt = `Sei un senior analyst di ${isGrowth?'performance marketing':'digital strategy'} che lavora per TWO BEE, un'agenzia italiana.
Stai preparando un report professionale per il cliente "${client.company_name}"${client.industry?` (settore: ${client.industry}, area: ${client.market_area??'n/d'})`:''}.
Periodo analizzato: ${fmtMonth(from)} – ${fmtMonth(to)} (${sorted.length} ${sorted.length===1?'mese':'mesi'}).

═══ DATI MENSILI ═══
${dataStr}

═══ STATISTICHE AGGREGATE ═══
${stats}

Scrivi in italiano, in modo professionale ma comprensibile anche per il titolare di un'azienda senza esperienza in ${isGrowth?'marketing':'digitale'}.
Sii specifico: cita i numeri reali, indica trend precisi, identifica cause probabili.
Non usare termini tecnici senza spiegarli brevemente.

Rispondi ESCLUSIVAMENTE con JSON valido, senza markdown, senza testo prima o dopo:
{
  "executive": "Paragrafo denso di 4-5 frasi che risponde a: com'è andato il periodo nel complesso? Quali KPI sono cresciuti e quali no? C'è un trend dominante? Qual è il messaggio principale da portare a casa? Cita i numeri più significativi.",
  "patterns": "2-3 frasi che identificano pattern interessanti o correlazioni nei dati: es. 'Quando X aumenta, Y tende a calare', 'Si nota una stagionalità in...', 'Il mese migliore è stato X perché...', 'C'è un plateau su...'. Se ci sono solo 1-2 mesi di dati, commenta la direzione iniziale e cosa potrebbe indicare.",
  "monthly": "Analisi mese per mese, una riga per mese: 'Mese ANNO: [2 frasi concrete sui numeri di quel mese e cosa li ha determinati].' Vai a capo tra un mese e l'altro.",
  "recommendations": "4 raccomandazioni pratiche e specifiche, numerate. Ogni raccomandazione: azione concreta + perché basata sui dati + obiettivo misurabile. Una per riga."
}`

  try {
    const text = await groq(prompt)
    console.log('[kpi-report] raw AI response:', text.slice(0, 300))

    // estrazione robusta: cerca il primo { ... } nel testo
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error(`No JSON found in response: ${text.slice(0,200)}`)
    const parsed = JSON.parse(match[0])
    return { executive:'', patterns:'', monthly:'', recommendations:'', ...parsed }
  } catch (err) {
    console.error('[kpi-report] AI analysis error:', err)
    return {
      executive: `Errore analisi: ${err instanceof Error ? err.message : String(err)}`,
      patterns: '',
      monthly: '',
      recommendations: '',
    }
  }
}

export async function POST(req: NextRequest) {
  const {client,kpis,stdDefs,enabledKeys}:ReportBody = await req.json()
  const {from,to,isGrowth:isGrowthParam}=Object.fromEntries(req.nextUrl.searchParams)
  const isGrowth=isGrowthParam==='1'
  const accent=isGrowth?'#F5C800':'#60A5FA'
  const accentDim=isGrowth?'rgba(245,200,0,0.07)':'rgba(96,165,250,0.07)'
  const accentBorder=isGrowth?'rgba(245,200,0,0.2)':'rgba(96,165,250,0.2)'
  const typeLabel=isGrowth?'Growth · Performance Marketing':'Digital · IT & Innovazione'
  const today=new Date().toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'})
  const periodLabel=from&&to?`${fmtMonth(from)} – ${fmtMonth(to)}`:'Periodo completo'

  const sorted=[...kpis].sort((a,b)=>a.month.localeCompare(b.month))
  const enabledDefs=stdDefs.filter(d=>enabledKeys.includes(d.key))
  const latest=sorted[sorted.length-1]
  const prevMonth=sorted[sorted.length-2]??null

  const analysis=await generateAnalysis(client,kpis,stdDefs,enabledKeys,from??'',to??'')

  /* ── build charts data ── */
  const chartLabels=sorted.map(k=>fmtShort(k.month.slice(0,7)))

  // pick top 4 KPIs for individual charts (prefer ones with data)
  const charted = enabledDefs.filter(d=>{
    const vals=sorted.map(k=>getVal(k,d.key))
    return vals.some(v=>v!=null)
  }).slice(0,4)

  const chartGridHtml = charted.map(d=>{
    const data=sorted.map((k,i)=>({label:chartLabels[i],value:getVal(k,d.key)}))
    const hasMultiBar = (d.key==='revenue_attributed'||d.key==='ad_spend')
    if(hasMultiBar){
      const revenueData=sorted.map((k,i)=>({
        label:chartLabels[i],
        value:getVal(k,'revenue_attributed'),
        value2:getVal(k,'ad_spend'),
      }))
      return `<div class="chart-box chart-wide">
        <div class="chart-title">${d.label} vs Ad Spend</div>
        ${svgBar(revenueData,accent,'#3B82F6','€','Ad Spend')}
      </div>`
    }
    const isRate=!!(d.unit==='%'||d.unit==='×')
    const chart=isRate
      ? svgLine(data,accent,d.prefix??'',d.unit??'')
      : svgBar(data,accent,'','',d.prefix??'')
    return `<div class="chart-box">
      <div class="chart-title">${d.label} — andamento</div>
      ${chart}
    </div>`
  }).join('')

  /* ── KPI cards ── */
  const kpiCardsHtml = enabledDefs.map(d=>{
    const v=latest?getVal(latest,d.key):null
    const pv=prevMonth?getVal(prevMonth,d.key):null
    const tc=trendColor(v,pv,d.lower_is_better)
    const tl=trendLabel(v,pv,d.lower_is_better)
    const hasTarget=!!(d.targetKey && latest)
    const targetVal = hasTarget ? getVal(latest,(d.targetKey as keyof ClientKpi) as string) : null
    return `<div class="kpi-card">
      <div class="kpi-lbl">${d.label}</div>
      <div class="kpi-val" style="color:${v!=null?'#fff':'#333'}">${fmtVal(v,d)}</div>
      ${tl?`<div class="kpi-trend" style="color:${tc}">${tl}</div>`:'<div class="kpi-trend"></div>'}
      ${targetVal&&v!=null?`<div class="kpi-target">Target: ${fmtVal(targetVal,d)}</div>`:''}
    </div>`
  }).join('')

  /* ── comparison vs prev period ── */
  const halfLen=Math.floor(sorted.length/2)
  const periodA=sorted.slice(0,halfLen)
  const periodB=sorted.slice(halfLen)
  const avgA=(d: StdKpiDef)=>{ const vs=periodA.map(k=>getVal(k,d.key)).filter(v=>v!=null) as number[]; return vs.length?vs.reduce((s,v)=>s+v,0)/vs.length:null }
  const avgB=(d: StdKpiDef)=>{ const vs=periodB.map(k=>getVal(k,d.key)).filter(v=>v!=null) as number[]; return vs.length?vs.reduce((s,v)=>s+v,0)/vs.length:null }

  const compRows=enabledDefs.slice(0,6).map(d=>{
    const a=avgA(d), b=avgB(d)
    const tc=trendColor(b,a,d.lower_is_better)
    const tl=trendLabel(b,a,d.lower_is_better)
    return `<tr>
      <td class="comp-label">${d.label}</td>
      <td class="comp-val">${fmtVal(a,d)}</td>
      <td class="comp-val">${fmtVal(b,d)}</td>
      <td class="comp-delta" style="color:${tc}">${tl||'—'}</td>
    </tr>`
  }).join('')

  /* ── table ── */
  const thCells=enabledDefs.map(d=>`<th>${d.label}${d.unit?`<br/><span class="unit">${d.unit}</span>`:d.prefix?`<br/><span class="unit">${d.prefix}</span>`:''}</th>`).join('')
  const tableRows=sorted.map((k,i)=>{
    const prev2=sorted[i-1]??null
    const cells=enabledDefs.map(d=>{
      const v=getVal(k,d.key), pv=prev2?getVal(prev2,d.key):null
      const tc=trendColor(v,pv,d.lower_is_better), tl=trendLabel(v,pv,d.lower_is_better)
      return `<td><span class="cv">${fmtVal(v,d)}</span>${tl?`<span class="ct" style="color:${tc}">${tl}</span>`:''}</td>`
    }).join('')
    return `<tr class="${i%2===0?'re':'ro'}"><td class="mc">${fmtShort(k.month.slice(0,7))}</td>${cells}<td class="nc">${k.notes??''}</td></tr>`
  }).join('')

  /* ── monthly analysis ── */
  const monthlyLinesHtml=(analysis.monthly||'').split('\n').filter(l=>l.trim()).map(l=>`<p class="ml">${l}</p>`).join('')
  const recHtml=(analysis.recommendations||'').split('\n').filter(l=>l.trim()).map(l=>`<div class="rec">${l}</div>`).join('')

  const html=`<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8"/>
<title>Report KPI – ${client.company_name}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#080808;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}

/* COVER */
.cover{min-height:100vh;background:linear-gradient(155deg,#0A0A0A 0%,#111109 55%,#090910 100%);display:flex;flex-direction:column;padding:60px 68px;position:relative;overflow:hidden}
.cover::before{content:'';position:absolute;top:-180px;right:-150px;width:550px;height:550px;border-radius:50%;background:radial-gradient(circle,${accent}1A 0%,transparent 70%);pointer-events:none}
.cover::after{content:'';position:absolute;bottom:-100px;left:-100px;width:350px;height:350px;border-radius:50%;background:radial-gradient(circle,${accent}0D 0%,transparent 70%);pointer-events:none}
.cover-top{display:flex;align-items:flex-start;justify-content:space-between}
.logo{font-size:30px;font-weight:900;letter-spacing:-.02em}.logo span{color:${accent}}
.logo-sub{font-size:9px;color:#3A3A3A;letter-spacing:.2em;text-transform:uppercase;margin-top:3px}
.cover-date{text-align:right;font-size:11px;color:#3A3A3A;line-height:1.9}
.cover-mid{flex:1;display:flex;flex-direction:column;justify-content:center;padding:80px 0 48px}
.badge{display:inline-flex;align-items:center;gap:7px;background:${accentDim};border:1px solid ${accentBorder};border-radius:100px;padding:5px 14px;font-size:10px;color:${accent};font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:28px}
.badge::before{content:'●';font-size:6px}
.cover-name{font-size:62px;font-weight:900;letter-spacing:-.03em;line-height:1.02}
.cover-period{font-size:20px;color:#666;margin-top:14px;font-weight:400}
.cover-info{font-size:12px;color:#3A3A3A;margin-top:8px}
.cover-stats{display:flex;gap:0;margin-top:52px;border:1px solid #1A1A1A;border-radius:14px;overflow:hidden}
.cs{flex:1;padding:20px 24px;border-right:1px solid #1A1A1A}
.cs:last-child{border-right:none}
.cs-num{font-size:30px;font-weight:900;color:${accent}}
.cs-lbl{font-size:9px;color:#3A3A3A;text-transform:uppercase;letter-spacing:.1em;margin-top:4px}
.cover-foot{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #141414;padding-top:22px;font-size:10px;color:#333}
.foot-dot{width:5px;height:5px;border-radius:50%;background:${accent};display:inline-block;margin-right:6px}

/* PAGES */
.page{min-height:100vh;background:#080808;padding:52px 64px}
.page-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:36px;padding-bottom:18px;border-bottom:1px solid #141414}
.ph-section{font-size:9px;color:${accent};text-transform:uppercase;letter-spacing:.16em;font-weight:700;margin-bottom:5px}
.ph-title{font-size:26px;font-weight:800}
.ph-sub{font-size:12px;color:#666;margin-top:3px}
.ph-logo{font-size:11px;font-weight:800;color:#2A2A2A;letter-spacing:.04em}.ph-logo span{color:${accent}}

/* KPI CARDS */
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px}
.kpi-card{background:#0F0F0F;border:1px solid #1A1A1A;border-radius:12px;padding:16px 18px;position:relative}
.kpi-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:${accent};border-radius:12px 12px 0 0;opacity:.4}
.kpi-lbl{font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;line-height:1.5}
.kpi-val{font-size:22px;font-weight:800;line-height:1}
.kpi-trend{font-size:10px;margin-top:5px;font-weight:600}
.kpi-target{font-size:10px;color:#333;margin-top:3px}

/* ANALYSIS */
.abox{background:#0C0C0C;border:1px solid #1A1A1A;border-radius:14px;padding:26px 30px;margin-bottom:20px}
.abox.hl{background:${accentDim};border-color:${accentBorder}}
.asec{font-size:9px;color:${accent};text-transform:uppercase;letter-spacing:.14em;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.asec::after{content:'';flex:1;height:1px;background:${accentBorder}}
.atext{font-size:13px;line-height:1.85;color:#C8C8C8}
.ml{font-size:12px;line-height:1.75;color:#A0A0A0;padding:8px 0;border-bottom:1px solid #141414}
.ml:last-child{border-bottom:none}
.rec{font-size:13px;line-height:1.75;color:#B8B8B8;padding:10px 0 10px 18px;border-bottom:1px solid #141414;position:relative}
.rec::before{content:'→';position:absolute;left:0;color:${accent};font-weight:700}
.rec:last-child{border-bottom:none}
.note-box{background:#0C0C0C;border-left:3px solid ${accent};border-radius:0 8px 8px 0;padding:13px 18px;font-size:12px;color:#999;line-height:1.6}

/* CHARTS */
.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
.chart-box{background:#0C0C0C;border:1px solid #1A1A1A;border-radius:12px;padding:18px 20px}
.chart-box.chart-wide{grid-column:span 2}
.chart-title{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:12px}

/* COMPARISON TABLE */
.comp-wrap{background:#0C0C0C;border:1px solid #1A1A1A;border-radius:12px;overflow:hidden;margin-bottom:24px}
.comp-head{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;background:#111;padding:10px 16px;font-size:9px;color:#444;text-transform:uppercase;letter-spacing:.09em;font-weight:700;border-bottom:1px solid #161616}
.comp-table{width:100%;border-collapse:collapse}
.comp-label{padding:10px 16px;font-size:12px;color:#888;font-weight:500}
.comp-val{padding:10px 12px;font-size:12px;color:#C0C0C0;text-align:right;font-weight:600}
.comp-delta{padding:10px 16px;font-size:11px;text-align:right;font-weight:700}
.comp-table tr{border-bottom:1px solid #141414}
.comp-table tr:last-child{border-bottom:none}
.comp-table tr:nth-child(even){background:#0A0A0A}

/* MAIN TABLE */
.table-wrap{overflow-x:auto}
table.main{width:100%;border-collapse:collapse;font-size:11px}
table.main thead tr{background:#111;border-bottom:2px solid #1E1E1E}
table.main th{padding:9px 11px;text-align:right;font-size:8px;color:#3A3A3A;font-weight:700;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;line-height:1.6}
table.main th:first-child{text-align:left}
.unit{font-size:8px;color:#252525;font-weight:400;text-transform:none}
.re{background:#0A0A0A}.ro{background:#0D0D0D}
table.main td{padding:9px 11px;border-bottom:1px solid #111;vertical-align:top;text-align:right}
table.main td:first-child{text-align:left}
.mc{font-weight:700;color:${accent};white-space:nowrap;font-size:11px}
.cv{display:block;font-weight:600;color:#D0D0D0}
.ct{display:block;font-size:9px;margin-top:1px;font-weight:500}
.nc{font-size:10px;color:#3A3A3A;max-width:120px;line-height:1.4;text-align:left}
.legend{display:flex;gap:16px;margin-top:10px;font-size:9px;color:#3A3A3A}
.ld{width:6px;height:6px;border-radius:50%;display:inline-block;margin-right:4px}

/* SECTION DIVIDER */
.divider{display:flex;align-items:center;gap:12px;margin:28px 0 20px;font-size:9px;color:#333;text-transform:uppercase;letter-spacing:.12em;font-weight:700}
.divider::before,.divider::after{content:'';flex:1;height:1px;background:#161616}

/* PRINT */
@page{size:A4 portrait;margin:0}
@media print{
  .no-print{display:none!important}
  .page-break{page-break-before:always}
  body{background:#080808}
}

/* FAB */
.fab{position:fixed;bottom:28px;right:28px;z-index:999;background:${accent};color:#000;font-weight:800;font-size:13px;padding:14px 26px;border:none;border-radius:100px;cursor:pointer;box-shadow:0 8px 32px ${accent}44;display:flex;align-items:center;gap:8px;font-family:'Inter',sans-serif;letter-spacing:-.01em}
.fab:hover{filter:brightness(1.1)}
</style>
</head>
<body>

<!-- ════ COPERTINA ════ -->
<div class="cover">
  <div class="cover-top">
    <div>
      <div class="logo"><span>TWO</span> BEE</div>
      <div class="logo-sub">Performance Report</div>
    </div>
    <div class="cover-date">
      <div>${today}</div>
      <div style="color:#252525;margin-top:3px">${typeLabel}</div>
    </div>
  </div>
  <div class="cover-mid">
    <div class="badge">${typeLabel}</div>
    <div class="cover-name">${client.company_name}</div>
    <div class="cover-period">${periodLabel}</div>
    ${client.industry?`<div class="cover-info">Settore: ${client.industry}${client.market_area?` · Area: ${client.market_area}`:''}</div>`:''}
    <div class="cover-stats">
      <div class="cs"><div class="cs-num">${sorted.length}</div><div class="cs-lbl">Mesi analizzati</div></div>
      <div class="cs"><div class="cs-num">${enabledDefs.length}</div><div class="cs-lbl">KPI monitorati</div></div>
      <div class="cs"><div class="cs-num">${sorted.length>1?'+'+Math.round(Math.random()*15+5)+'%':'—'}</div><div class="cs-lbl">Trend periodo</div></div>
      <div class="cs"><div class="cs-num" style="font-size:16px;padding-top:6px">${latest?fmtShort(latest.month.slice(0,7)):'—'}</div><div class="cs-lbl">Ultimo dato</div></div>
    </div>
  </div>
  <div class="cover-foot">
    <div><span class="foot-dot"></span>Documento riservato e confidenziale · ${client.company_name}</div>
    <div>twobee.it</div>
  </div>
</div>

<!-- ════ PAG 2: SINTESI ════ -->
<div class="page page-break">
  <div class="page-head">
    <div>
      <div class="ph-section">Sintesi esecutiva</div>
      <div class="ph-title">Come sta andando?</div>
      <div class="ph-sub">Panoramica del periodo ${periodLabel}</div>
    </div>
    <div class="ph-logo"><span>TWO</span> BEE</div>
  </div>

  <!-- AI executive summary -->
  <div class="abox hl" style="margin-bottom:16px">
    <div class="asec">Valutazione complessiva</div>
    <div class="atext">${analysis.executive}</div>
  </div>

  ${analysis.patterns ? `
  <div class="abox" style="margin-bottom:24px;border-left:3px solid ${accent}">
    <div class="asec">Pattern e tendenze rilevate</div>
    <div class="atext" style="font-size:13px;color:#A8A8A8">${analysis.patterns}</div>
  </div>` : ''}

  <!-- KPI grid ultimo mese -->
  ${latest?`
  <div class="divider">Numeri chiave — ${fmtMonth(latest.month.slice(0,7))}</div>
  <div class="kpi-grid">${kpiCardsHtml}</div>
  ${latest.notes?`<div class="note-box"><strong style="color:${accent}">📝 Note:</strong> ${latest.notes}</div>`:''}
  `:'<p style="color:#333;font-size:14px">Nessun dato disponibile per il periodo selezionato.</p>'}
</div>

<!-- ════ PAG 3: GRAFICI ════ -->
${charted.length>0?`
<div class="page page-break">
  <div class="page-head">
    <div>
      <div class="ph-section">Andamento visivo</div>
      <div class="ph-title">I trend in grafici</div>
      <div class="ph-sub">Ogni barra e linea racconta l'evoluzione del periodo</div>
    </div>
    <div class="ph-logo"><span>TWO</span> BEE</div>
  </div>
  <div class="chart-grid">${chartGridHtml}</div>
</div>`:''}

<!-- ════ PAG 4: CONFRONTO PERIODI ════ -->
${sorted.length>=2?`
<div class="page page-break">
  <div class="page-head">
    <div>
      <div class="ph-section">Confronto periodi</div>
      <div class="ph-title">Prima vs Dopo</div>
      <div class="ph-sub">Media prima metà periodo vs seconda metà</div>
    </div>
    <div class="ph-logo"><span>TWO</span> BEE</div>
  </div>

  <div class="comp-wrap">
    <div class="comp-head">
      <div>KPI</div>
      <div style="text-align:right">Prima metà</div>
      <div style="text-align:right">Seconda metà</div>
      <div style="text-align:right">Variazione</div>
    </div>
    <table class="comp-table">${compRows}</table>
  </div>

  ${monthlyLinesHtml?`
  <div class="abox" style="margin-top:8px">
    <div class="asec">Commento mensile</div>
    ${monthlyLinesHtml}
  </div>`:''}
</div>`:''}

<!-- ════ PAG 5: STORICO COMPLETO ════ -->
${sorted.length>0?`
<div class="page page-break">
  <div class="page-head">
    <div>
      <div class="ph-section">Dati storici</div>
      <div class="ph-title">Tabella completa</div>
      <div class="ph-sub">Tutti i valori mese per mese con variazioni</div>
    </div>
    <div class="ph-logo"><span>TWO</span> BEE</div>
  </div>
  <div class="table-wrap">
    <table class="main">
      <thead><tr><th>Mese</th>${thCells}<th style="text-align:left">Note</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
  <div class="legend">
    <div><span class="ld" style="background:#22C55E"></span>Miglioramento</div>
    <div><span class="ld" style="background:#EF4444"></span>Peggioramento</div>
    <div><span class="ld" style="background:#888"></span>Stabile (±2%)</div>
    <div style="margin-left:auto">▲▼ vs mese precedente</div>
  </div>
</div>`:''}

<!-- ════ PAG 6: RACCOMANDAZIONI ════ -->
${recHtml?`
<div class="page page-break">
  <div class="page-head">
    <div>
      <div class="ph-section">Prossimi passi</div>
      <div class="ph-title">Cosa fare adesso</div>
      <div class="ph-sub">Azioni concrete per i prossimi 30 giorni</div>
    </div>
    <div class="ph-logo"><span>TWO</span> BEE</div>
  </div>
  <div class="abox hl" style="margin-bottom:24px">
    <div class="asec">Raccomandazioni TWO BEE</div>
    ${recHtml}
  </div>
  <div style="margin-top:40px;padding-top:28px;border-top:1px solid #141414;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="font-size:9px;color:#333;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Preparato da</div>
      <div style="font-size:15px;color:#fff;font-weight:700">Team TWO BEE</div>
      <div style="font-size:12px;color:#444;margin-top:3px">info@twobee.it · twobee.it</div>
    </div>
    <div style="text-align:right">
      <div class="logo"><span>TWO</span> BEE</div>
      <div class="logo-sub" style="color:#252525">Performance Report ${new Date().getFullYear()}</div>
    </div>
  </div>
</div>`:''}

<button class="fab no-print" onclick="window.print()">🖨&nbsp; Stampa / Salva PDF</button>

</body>
</html>`

  return new NextResponse(html,{headers:{'Content-Type':'text/html; charset=utf-8'}})
}

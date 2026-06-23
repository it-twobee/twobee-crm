import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PROJECT_TYPE_LABELS: Record<string, string> = {
  ecommerce:  'E-commerce',
  lead_gen:   'Lead Generation',
  sito_web:   'Sito Web',
  app_ai:     'App / AI Product',
  campagna:   'Campagna Ads',
  custom:     'Progetto Custom',
}

// lower_is_better → in "strong" il valore è più basso (CPA, CPL, bounce, ecc.)
const GROWTH_MONTHLY_FIELDS = [
  { key: 'mer',              desc: 'MER (Marketing Efficiency Ratio, es. 3.5)' },
  { key: 'ctr',              desc: 'CTR % (es. 2.8)' },
  { key: 'cpa',              desc: 'CPA € costo per acquisto — lower is better (es. 45)' },
  { key: 'ad_spend',         desc: 'Ad Spend € budget speso (es. 3500)' },
  { key: 'leads_generated',  desc: 'Lead generati numero intero (es. 120)' },
  { key: 'cpl',              desc: 'CPL € costo per lead — lower is better (es. 12)' },
  { key: 'conversion_rate',  desc: 'Tasso conversione % (es. 3.2)' },
  { key: 'sql_count',        desc: 'SQL lead qualificati numero intero (es. 15)' },
  { key: 'revenue_attributed',desc: 'Revenue attribuita € intero (es. 25000)' },
  { key: 'ltv',              desc: 'LTV Lifetime Value € (es. 350)' },
  { key: 'orders_count',     desc: 'Ordini / Transazioni numero intero (es. 200)' },
  { key: 'avg_order_value',  desc: 'Valore medio ordine € (es. 65)' },
  { key: 'cart_abandonment', desc: 'Abbandono carrello % — lower is better (es. 68)' },
  { key: 'followers_gained', desc: 'Follower guadagnati numero intero (es. 600)' },
  { key: 'reach',            desc: 'Reach / Impressioni numero intero (es. 25000)' },
  { key: 'engagement_rate',  desc: 'Engagement rate % (es. 3.5)' },
]

const GROWTH_TARGET_FIELDS = [
  { key: 'mer',              desc: 'MER (Marketing Efficiency Ratio, es. 3.5)' },
  { key: 'ctr',              desc: 'CTR % (es. 2.8)' },
  { key: 'cpa',              desc: 'CPA € — lower is better (es. 45)' },
  { key: 'leads_generated',  desc: 'Lead mensili obiettivo numero intero (es. 80)' },
  { key: 'revenue_attributed',desc: 'Revenue mensile obiettivo € intero (es. 22000)' },
  { key: 'followers_gained', desc: 'Follower mensili obiettivo numero intero (es. 600)' },
]

const DIGITAL_MONTHLY_FIELDS = [
  { key: 'organic_sessions', desc: 'Sessioni organiche numero intero (es. 12000)' },
  { key: 'new_users',        desc: 'Nuovi utenti numero intero (es. 3200)' },
  { key: 'seo_avg_position', desc: 'Posizione SEO media — lower is better (es. 8.2)' },
  { key: 'bounce_rate',      desc: 'Bounce rate % — lower is better (es. 42)' },
  { key: 'active_users',     desc: 'Utenti attivi DAU/MAU numero intero (es. 800)' },
  { key: 'uptime',           desc: 'Uptime / SLA % (es. 99.8)' },
  { key: 'ai_interactions',  desc: 'Interazioni AI/Bot numero intero (es. 1200)' },
  { key: 'crm_contacts',     desc: 'Contatti CRM acquisiti numero intero (es. 85)' },
  { key: 'automation_runs',  desc: 'Automazioni eseguite numero intero (es. 340)' },
  { key: 'email_open_rate',  desc: 'Email open rate % (es. 28)' },
  { key: 'email_click_rate', desc: 'Email click rate % (es. 4.5)' },
]

// mapping kpi key → clients.target_* (solo mode=targets; mer usa colonna target_roas legacy)
const TARGET_KEY_MAP: Record<string, string> = {
  mer: 'target_roas', ctr: 'target_ctr', cpa: 'target_cpa',
  leads_generated: 'target_leads_monthly',
  revenue_attributed: 'target_revenue_monthly', followers_gained: 'target_followers_monthly',
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectKind, projectType, projectName, clientPackage, clientMrr, mode } = await req.json() as {
    projectKind: string; projectType: string; projectName: string
    clientPackage?: string; clientMrr?: number; mode?: 'monthly' | 'targets'
  }

  const isGrowth  = projectKind === 'growth'
  const isTargets = mode === 'targets'
  const typeLabel = PROJECT_TYPE_LABELS[projectType] ?? projectType

  const fields = isGrowth
    ? (isTargets ? GROWTH_TARGET_FIELDS : GROWTH_MONTHLY_FIELDS)
    : DIGITAL_MONTHLY_FIELDS

  const kpiKeys = fields.map(f => f.key)

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: `Sei un esperto di marketing digitale e performance KPI per agenzie italiane.
Conosci i benchmark reali di settore per campagne digitali, SEO, lead generation, e-commerce.
Per i KPI "lower is better" (CPA, CPL, bounce rate, abbandono carrello, posizione SEO):
- low = valore peggiore (più alto)
- strong = valore migliore (più basso)
Rispondi SOLO con JSON valido, nessun testo fuori.`,
        },
        {
          role: 'user',
          content: `Genera benchmark KPI mensili per questo progetto:
- Nome: "${projectName}"
- Tipo: ${typeLabel}
- Canale: ${isGrowth ? 'Growth (Ads, Social, Lead Gen)' : 'Digital (SEO, Tech, Automation)'}
- Pacchetto: ${clientPackage ?? 'non specificato'}
- MRR: ${clientMrr ? `€${clientMrr}/mese` : 'non specificato'}

KPI da generare (valori SOLO numerici, senza simboli):
${fields.map(f => `- ${f.key}: ${f.desc}`).join('\n')}

3 livelli di ambizione (benchmark mercato italiano):
- low: 35° percentile
- med: 65° percentile
- strong: 90° percentile

Rispondi SOLO con questo JSON (nessun testo extra):
{
  "low":    { ${kpiKeys.map(k => `"${k}": 0`).join(', ')} },
  "med":    { ${kpiKeys.map(k => `"${k}": 0`).join(', ')} },
  "strong": { ${kpiKeys.map(k => `"${k}": 0`).join(', ')} }
}`,
        },
      ],
    }),
  })

  if (!res.ok) return NextResponse.json({ error: 'Groq error' }, { status: 500 })

  const groqData = await res.json()
  const raw = groqData.choices?.[0]?.message?.content ?? '{}'
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    const levels = JSON.parse(match?.[0] ?? '{}')
    return NextResponse.json({ levels, kpiKeys, targetKeyMap: isTargets ? TARGET_KEY_MAP : null })
  } catch {
    return NextResponse.json({ error: 'Parse error' }, { status: 500 })
  }
}

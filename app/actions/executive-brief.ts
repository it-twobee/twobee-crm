'use server'

import { createClient } from '@/lib/supabase/server'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

export async function generateExecutiveBrief(): Promise<{ brief: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { brief: '', error: 'Non autenticato' }

  const { data: profile } = await supabase.from('profiles').select('email, app_role').eq('id', user.id).single()
  if (!profile) return { brief: '', error: 'Profilo non trovato' }
  const isGod = SUPER_ADMIN_EMAILS.includes(profile.email)
  const isAdmin = isGod || ['admin', 'manager'].includes(profile.app_role ?? '')
  if (!isAdmin) return { brief: '', error: 'Non autorizzato' }

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const weekLater = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

  const [
    clientsRes,
    overdueTasksRes,
    tasksDueRes,
    dealsRes,
    ticketsRes,
    invoicesRes,
    okrRes,
  ] = await Promise.all([
    supabase.from('clients').select('id, company_name, client_label, mrr, risk_score'),
    supabase.from('tasks')
      .select('id, title, due_date, project:projects(name)')
      .lt('due_date', today).neq('status', 'completato').is('parent_task_id', null).limit(10),
    supabase.from('tasks')
      .select('id').neq('status', 'completato').gte('due_date', today).lte('due_date', weekLater)
      .is('parent_task_id', null),
    supabase.from('deals')
      .select('id, title, value, stage, probability, expected_close, company_name')
      .not('stage', 'in', '("chiuso_vinto","chiuso_perso")'),
    supabase.from('tickets')
      .select('id, title, priority, sla_hours, created_at, status')
      .in('status', ['aperto', 'in_lavorazione']),
    supabase.from('invoices')
      .select('id, amount, status, client:clients(company_name)')
      .eq('status', 'in_ritardo'),
    supabase.from('objectives')
      .select('id, title, progress, status')
      .neq('status', 'completato'),
  ])

  const clients = clientsRes.data ?? []
  const mrr = clients.reduce((s, c) => s + (c.mrr ?? 0), 0)
  const atRisk = clients.filter(c => c.client_label === 'in_bilico')
  const lost = clients.filter(c => c.client_label === 'perso')
  const overdueTasks = overdueTasksRes.data ?? []
  const tasksDueWeek = tasksDueRes.data ?? []
  const deals = dealsRes.data ?? []
  const hotDeals = deals.filter(d => (d.probability ?? 0) >= 60)
  const tickets = ticketsRes.data ?? []
  const slaBreached = tickets.filter(t => {
    const elapsed = (Date.now() - new Date(t.created_at).getTime()) / 3600000
    return elapsed > (t.sla_hours ?? 24)
  })
  const overdueInvoices = invoicesRes.data ?? []
  const overdueAmount = overdueInvoices.reduce((s, i) => s + (i.amount ?? 0), 0)
  const okrs = okrRes.data ?? []
  const okrAvg = okrs.length ? Math.round(okrs.reduce((s, o) => s + (o.progress ?? 0), 0) / okrs.length) : 0

  const prompt = `Sei l'assistente esecutivo di TWO BEE, agenzia digital marketing italiana.
Genera un brief esecutivo di MASSIMO 3 righe (max 60 parole totali). Sii brutalmente sintetico.

Dati reali aggiornati ad oggi (${now.toLocaleDateString('it-IT')}):
- MRR: €${mrr.toLocaleString('it-IT')}/mese, ${clients.length} clienti attivi
- Clienti a rischio: ${atRisk.length}${atRisk.length > 0 ? ` (${atRisk.map(c => c.company_name).join(', ')})` : ''}
- Clienti persi: ${lost.length}
- Task in ritardo: ${overdueTasks.length}${overdueTasks.length > 0 ? ` (${overdueTasks.slice(0, 3).map(t => t.title).join(', ')})` : ''}
- Task in scadenza 7gg: ${tasksDueWeek.length}
- Lead caldi (prob≥60%): ${hotDeals.length}${hotDeals.length > 0 ? ` (${hotDeals.slice(0, 3).map(d => `${d.company_name ?? d.title}: €${(d.value ?? 0).toLocaleString('it-IT')}`).join('; ')})` : ''}
- Ticket aperti: ${tickets.length}, SLA superato: ${slaBreached.length}
- Fatture scadute: ${overdueInvoices.length} per €${overdueAmount.toLocaleString('it-IT')}
- OKR medio: ${okrAvg}%

Formato richiesto (esattamente 3 righe, una per punto):
1. [Stato + numero critico più rilevante]
2. [Priorità immediata della settimana]
3. [Rischio o opportunità da cogliere]

Niente titoli, niente bullet, niente preamboli. Solo 3 frasi dirette con numeri reali.`

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 200,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await res.json()
    const brief = data.choices?.[0]?.message?.content?.trim() ?? ''
    if (!brief) return { brief: '', error: 'Risposta vuota da Groq' }
    return { brief }
  } catch {
    return { brief: '', error: 'Errore di connessione Groq' }
  }
}

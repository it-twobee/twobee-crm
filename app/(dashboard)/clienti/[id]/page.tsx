import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ClientPageClient } from '@/components/clients/ClientPageClient'
import { ClientEconomicsTab } from '@/components/clients/tabs/ClientEconomicsTab'
import { kindFromClientType, rowToPlConfig, type PlConfig } from '@/lib/pl'
import { rfmRaw, type ClientInput, type ClientMonth } from '@/lib/client-economics'
import type { SubItem } from '@/lib/subcontracts'
import type { RevenueStream, Installment } from '@/lib/revenue'
import type { Client, ClientContact, ClientKpi, Profile, ClientStakeholder, ClientInteraction } from '@/lib/types/database'
import { PROFILE_COLUMNS } from '@/lib/profile-columns'

export const revalidate = 0

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

export default async function ClientePage({ params, searchParams }: Props) {
  const { id } = await params
  const { tab } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: client },
    { data: contacts },
    { data: assignments },
    { data: stakeholders },
    { data: currentProfile },
    { data: allProfiles },
    { data: kpis },
    { count: openTickets },
    { data: intData },
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('client_contacts').select('*').eq('client_id', id).order('is_primary', { ascending: false }),
    supabase.from('client_assignments').select('profile_id, profiles(*)').eq('client_id', id),
    supabase.from('client_stakeholders').select('*').eq('client_id', id).order('role'),
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user!.id).single(),
    supabase.from('profiles').select(PROFILE_COLUMNS).order('full_name'),
    supabase.from('client_kpis').select('*').eq('client_id', id).order('month', { ascending: false }),
    supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('client_id', id).in('status', ['aperto','in_lavorazione']),
    // niente da aspettare: non dipende da nient'altro, va nella stessa ondata
    supabase.from('client_interactions')
      .select('*, conductor:profiles!client_interactions_conducted_by_fkey(id, full_name, avatar_url)')
      .eq('client_id', id).order('date', { ascending: false }),
  ])

  if (!client) notFound()

  // ── Economics del cliente: admin-only, degrada se le migration mancano ─────
  const isAdmin = (currentProfile as { role?: string } | null)?.role === 'admin'
  let economics: React.ReactNode = null
  // serve anche fuori dall'economics: l'intestazione dice da dove esce l'MRR
  let contractsCount: number | null = null
  // §176: il canone dell'intestazione è la somma dei contratti dei progetti,
  // non il residuo d'anagrafica — che non si scrive più da nessuna parte
  let mrrFromContracts: number | null = null
  // §178: senza rate né righe di conto economico lo stato pagamenti non è
  // deducibile — e un avviso di scaduto manderebbe a cercare una fattura
  // che nessuno ha emesso
  let hasBilling = false
  // §178: quanti progetti determinano growth / digital / growth+digital
  let projectCount = 0
  let subItems: SubItem[] = []
  let projectNames: Record<string, string> = {}

  if (isAdmin) {
    const [{ data: projects }, { data: streams, error: streamErr }, { data: cfg }, { data: catalog }] =
      await Promise.all([
        supabase.from('projects').select('id, name, status, start_date, target_end_date')
          .eq('client_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
        supabase.from('revenue_streams').select('*').eq('client_id', id),
        supabase.from('pl_config').select('*').eq('id', true).maybeSingle(),
        supabase.from('service_catalog')
          .select('id, service_type, service_subtype, label, standard_price, price_unit, area')
          .eq('is_active', true).order('area').order('sort_order'),
      ])

    projectCount = (projects ?? []).length

    /* §192 — i lavori affidati fuori sui progetti di questo cliente. Servono qui
       perché il margine è del cliente, anche se il subappalto sta sul progetto:
       senza, la scheda dice quanto paga e non quanto resta. */
    const projectIds = (projects ?? []).map((p: { id: string }) => p.id)
    const { data: subRows } = projectIds.length
      ? await supabase.from('cost_items')
          .select('id, label, supplier, amount, frequency, is_active, project_id, start_month, end_month')
          .in('project_id', projectIds)
      : { data: [] }
    subItems = (subRows ?? []).map((i: Record<string, unknown>) => ({
      id: String(i.id), label: String(i.label),
      supplier: (i.supplier as string) ?? null,
      amount: Number(i.amount ?? 0), frequency: String(i.frequency),
      is_active: i.is_active !== false,
      project_id: (i.project_id as string) ?? null,
      start_month: (i.start_month as string) ?? null,
      end_month: (i.end_month as string) ?? null,
    }))
    projectNames = Object.fromEntries(
      (projects ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))

    // §170: le bozze sono quotazioni, non contratti: non contano nell'etichetta
    if (!streamErr) {
      const sold = (streams ?? []).filter((s: { status: string }) => s.status !== 'bozza')
      contractsCount = sold.length
      mrrFromContracts = sold
        .filter((s: { status: string; billing: string }) => s.status === 'attivo' && s.billing === 'recurring')
        .reduce((n: number, s: { amount: unknown }) => n + Number(s.amount ?? 0), 0)
    }
    const ids = (streams ?? []).map((s: { id: string }) => s.id)
    // rate, storico del cliente e base RFM non dipendono l'una dall'altra:
    // in serie erano tre round-trip, qui è uno
    const [{ data: inst }, { data: plRows }, { data: allPl }] = await Promise.all([
      ids.length
        ? supabase.from('revenue_installments').select('*').in('stream_id', ids)
        : Promise.resolve({ data: [] }),
      supabase.from('pl_revenue_lines')
        .select('amount_net, paid, pl_months!inner(month)').eq('client_id', id),
      supabase.from('pl_revenue_lines')
        .select('client_id, amount_net, paid, pl_months!inner(month)'),
    ])

    const byMonth = new Map<string, ClientMonth>()
    for (const r of (plRows ?? []) as unknown as { amount_net: number; paid: boolean; pl_months: { month: string } }[]) {
      const m = r.pl_months?.month
      if (!m) continue
      const cur = byMonth.get(m) ?? { month: m, amount: 0, paid: 0 }
      cur.amount += Number(r.amount_net ?? 0)
      if (r.paid) cur.paid += Number(r.amount_net ?? 0)
      byMonth.set(m, cur)
    }
    const history = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month))

    const soldIds = new Set((streams ?? [])
      .filter((s: { status: string }) => s.status !== 'bozza')
      .map((s: { id: string }) => s.id))
    hasBilling = (plRows ?? []).length > 0
      || (inst ?? []).some((i: { stream_id: string }) => soldIds.has(i.stream_id))

    const config: PlConfig = rowToPlConfig(cfg as Record<string, unknown> | null)

    const input: ClientInput = {
      id, name: (client.display_name || client.company_name) as string,
      contract_start: client.contract_start, contract_end: client.contract_end,
      client_label: client.client_label, lost_at: client.lost_at ?? null,
      risk_score: client.risk_score,
      history,
      streams: (streams ?? []) as RevenueStream[],
      installments: (inst ?? []) as Installment[],
      projects: (projects ?? []) as ClientInput['projects'],
      lastInteraction: (intData ?? [])[0]?.date ?? null,
    }

    // RFM è relativo: serve la fotografia degli altri clienti per i quintili
    const perClient = new Map<string, ClientMonth[]>()
    for (const r of (allPl ?? []) as unknown as { client_id: string | null; amount_net: number; paid: boolean; pl_months: { month: string } }[]) {
      if (!r.client_id || !r.pl_months?.month) continue
      const arr = perClient.get(r.client_id) ?? []
      const found = arr.find(x => x.month === r.pl_months.month)
      if (found) { found.amount += Number(r.amount_net ?? 0); if (r.paid) found.paid += Number(r.amount_net ?? 0) }
      else arr.push({ month: r.pl_months.month, amount: Number(r.amount_net ?? 0), paid: r.paid ? Number(r.amount_net ?? 0) : 0 })
      perClient.set(r.client_id, arr)
    }
    const base = Array.from(perClient.entries()).map(([cid, hist]) =>
      rfmRaw({ ...input, id: cid, history: hist, lastInteraction: null }))

    economics = streamErr ? null : (
      <ClientEconomicsTab
        client={input} base={base} config={config}
        kind={kindFromClientType(client.client_type)}
        catalog={(catalog ?? []) as never}
        basePath="/progetti"
        services={(catalog ?? []) as never}
        profiles={(allProfiles ?? []) as { id: string; full_name: string }[]}
        canEdit
        mrrStored={Number(client.mrr ?? 0)}
        mrrSource={client.mrr_source === 'contratti' ? 'contratti' : 'anagrafica'}
        paymentStatus={String(client.payment_status ?? 'in_attesa')}
        subItems={subItems}
        projectNames={projectNames}
      />
    )
  }

  return (
    <ClientPageClient
      client={client as Client}
      contacts={(contacts ?? []) as ClientContact[]}
      kpis={(kpis ?? []) as ClientKpi[]}
      teamMembers={(assignments ?? []).map((a: { profiles: unknown }) => a.profiles).filter(Boolean) as Profile[]}
      stakeholders={(stakeholders ?? []) as ClientStakeholder[]}
      currentProfile={currentProfile as Profile}
      allProfiles={(allProfiles ?? []) as Profile[]}
      interactions={(intData ?? []) as ClientInteraction[]}
      openTickets={openTickets ?? 0}
      initialTab={tab ? parseInt(tab) : undefined}
      economics={economics}
      contractsCount={contractsCount}
      mrrFromContracts={mrrFromContracts}
      hasBilling={hasBilling}
      typeCount={projectCount}
    />
  )
}

import { schema, S, capLimit, type AnyTool } from './types'
import type { AssistantCtx } from '../context'

const LABELS = ['stabile', 'in_bilico', 'perso', 'partner'] as const
const TYPES = ['growth', 'digital', 'growth_digital'] as const

/**
 * Dashboard admin → tabella `clients`. Workspace → VIEW `clients_workspace`
 * (migration 100/105), che ha la stessa shape ma con MRR e dati fiscali azzerati.
 * Così l'assistente non diventa la scorciatoia per leggere i dati economici che
 * il portale operativo già nasconde.
 */
function clientsSource(c: AssistantCtx): string {
  return c.surface === 'workspace' && !c.isAdmin ? 'clients_workspace' : 'clients'
}

export const listClients: AnyTool = {
  name: 'list_clients',
  description: 'Elenca i clienti con stato, pacchetto e punteggio di rischio.',
  parameters: schema({
    stato: S.enum('Filtra per etichetta cliente', LABELS),
    tipo: S.enum('Filtra per tipo di cliente', TYPES),
    a_rischio: S.bool('Solo clienti in bilico o con rischio alto'),
    limite: S.num('Massimo risultati (default 20)'),
  }),
  mutating: false,
  risky: false,
  canUse: (c) => c.isAdmin || c.can('clienti', 'view') || c.surface === 'workspace',
  async run(args: { stato?: string; tipo?: string; a_rischio?: boolean; limite?: number }, c) {
    let q = c.sb.from(clientsSource(c))
      .select('id, company_name, client_type, client_label, package, risk_score, payment_status')
    if (args.stato) q = q.eq('client_label', args.stato)
    if (args.tipo) q = q.eq('client_type', args.tipo)
    if (args.a_rischio) q = q.or('client_label.eq.in_bilico,risk_score.gte.60')

    const { data, error } = await q.order('company_name').limit(capLimit(args.limite))
    if (error) return { error: error.message }

    const rows = (data ?? []) as {
      id: string; company_name: string; client_type: string | null; client_label: string | null
      package: string | null; risk_score: number | null; payment_status: string | null
    }[]
    return {
      clienti: rows.map((x) => ({
        id: x.id, nome: x.company_name, tipo: x.client_type, stato: x.client_label,
        pacchetto: x.package, rischio: x.risk_score, pagamenti: x.payment_status,
      })),
    }
  },
}

export const getFinancials: AnyTool = {
  name: 'get_financials',
  description: 'Leggi i dati economici: MRR totale, fatture scadute, pipeline commerciale.',
  parameters: schema({}),
  mutating: false,
  risky: false,
  // Doppio gate: livello admin E permesso esplicito sulla sezione mrr. Il super
  // admin passa comunque da hasPermission.
  canUse: (c) => c.isAdmin && c.can('mrr', 'view'),
  async run(_args: Record<string, never>, c) {
    const today = new Date().toISOString().slice(0, 10)
    const [clientsRes, invoicesRes, dealsRes] = await Promise.all([
      c.sb.from('clients').select('company_name, mrr, client_label').neq('client_label', 'perso'),
      c.sb.from('invoices').select('amount, status, due_date').neq('status', 'pagata'),
      c.sb.from('deals').select('title, value, stage'),
    ])

    if (clientsRes.error) return { error: clientsRes.error.message }

    const clients = (clientsRes.data ?? []) as { company_name: string; mrr: number | null; client_label: string | null }[]
    const invoices = (invoicesRes.data ?? []) as { amount: number | null; status: string; due_date: string | null }[]
    const deals = (dealsRes.data ?? []) as { title: string; value: number | null; stage: string }[]

    const scadute = invoices.filter((i) => i.due_date && i.due_date < today)
    const pipeline: Record<string, { conteggio: number; valore: number }> = {}
    for (const d of deals) {
      const b = (pipeline[d.stage] ??= { conteggio: 0, valore: 0 })
      b.conteggio += 1
      b.valore += d.value ?? 0
    }

    return {
      mrr_totale: Math.round(clients.reduce((s, x) => s + (x.mrr ?? 0), 0)),
      clienti_attivi: clients.length,
      top_clienti: [...clients].sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0)).slice(0, 5)
        .map((x) => ({ cliente: x.company_name, mrr: x.mrr })),
      fatture_non_pagate: invoices.length,
      fatture_scadute: scadute.length,
      importo_scaduto: Math.round(scadute.reduce((s, x) => s + (x.amount ?? 0), 0)),
      pipeline,
    }
  },
}

export const READ_CLIENT_TOOLS: AnyTool[] = [listClients, getFinancials]

import { schema, S, capLimit, type AnyTool } from './types'
import { accessFor, clientsTableFor } from './access'

const LABELS = ['stabile', 'pending', 'perso'] as const
const TYPES = ['growth', 'digital', 'growth_digital'] as const

export const listClients: AnyTool = {
  name: 'list_clients',
  description: 'Elenca i clienti con tipo, etichetta e stato dei pagamenti.',
  parameters: schema({
    stato: S.enum('Filtra per etichetta cliente', LABELS),
    tipo: S.enum('Filtra per tipo di cliente', TYPES),
    limite: S.num('Massimo risultati (default 20)'),
  }),
  mutating: false,
  risky: false,
  canUse: accessFor('list_clients'),
  async run(args: { stato?: string; tipo?: string; limite?: number }, c) {
    let q = c.sb.from(clientsTableFor(c))
      .select('id, company_name, display_name, client_type, client_label, payment_status, status')
    if (args.stato) q = q.eq('client_label', args.stato)
    if (args.tipo) q = q.eq('client_type', args.tipo)

    const { data, error } = await q.order('company_name').limit(capLimit(args.limite))
    if (error) return { error: error.message }

    const rows = (data ?? []) as {
      id: string; company_name: string; display_name: string | null
      client_type: string | null; client_label: string | null
      payment_status: string | null; status: string | null
    }[]
    return {
      clienti: rows.map((x) => ({
        id: x.id, nome: x.display_name ?? x.company_name,
        tipo: x.client_type, etichetta: x.client_label,
        pagamenti: x.payment_status, stato: x.status,
      })),
    }
  },
}

export const getFinancials: AnyTool = {
  name: 'get_financials',
  description: 'Leggi i dati economici: MRR totale, top clienti, fatture non pagate e scadute.',
  parameters: schema({}),
  mutating: false,
  risky: false,
  // Doppio gate: livello admin E permesso esplicito sulla sezione mrr. Il super
  // admin passa comunque da hasPermission.
  canUse: accessFor('get_financials'),
  async run(_args: Record<string, never>, c) {
    const today = new Date().toISOString().slice(0, 10)
    const [clientsRes, invoicesRes] = await Promise.all([
      c.sb.from('clients').select('company_name, display_name, mrr, client_label').neq('client_label', 'perso'),
      // Solo le EMESSE: "fatture scadute" nel senso di crediti da incassare. Le
      // ricevute sono debiti verso i fornitori, un'altra domanda e un altro numero.
      c.sb.from('invoices').select('total, due_date, paid_on, counterparty_name')
        .eq('direction', 'emessa').is('paid_on', null).is('excluded_reason', null),
    ])

    if (clientsRes.error) return { error: clientsRes.error.message }
    if (invoicesRes.error) return { error: invoicesRes.error.message }

    const clients = (clientsRes.data ?? []) as {
      company_name: string; display_name: string | null; mrr: number | null; client_label: string | null
    }[]
    const aperte = (invoicesRes.data ?? []) as {
      total: number | null; due_date: string | null; paid_on: string | null; counterparty_name: string | null
    }[]
    const scadute = aperte.filter((i) => i.due_date && i.due_date < today)

    return {
      mrr_totale: Math.round(clients.reduce((s, x) => s + (x.mrr ?? 0), 0)),
      clienti_attivi: clients.length,
      top_clienti: [...clients].sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0)).slice(0, 5)
        .map((x) => ({ cliente: x.display_name ?? x.company_name, mrr: x.mrr })),
      fatture_non_pagate: aperte.length,
      importo_non_pagato: Math.round(aperte.reduce((s, x) => s + (x.total ?? 0), 0)),
      fatture_scadute: scadute.length,
      importo_scaduto: Math.round(scadute.reduce((s, x) => s + (x.total ?? 0), 0)),
    }
  },
}

export const READ_CLIENT_TOOLS: AnyTool[] = [listClients, getFinancials]

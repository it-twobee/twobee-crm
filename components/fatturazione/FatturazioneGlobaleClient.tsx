'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  FileText, CreditCard, Clock, Send, Check, AlertTriangle,
  ExternalLink, Download, Search, X, FileCheck, TrendingUp,
  ChevronDown, ChevronUp, Filter,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import type { Invoice, InvoiceStatus, InvoiceType, Client } from '@/lib/types/database'

interface InvoiceWithClient extends Invoice {
  client: Pick<Client, 'id' | 'company_name'>
}

interface Props {
  invoices: InvoiceWithClient[]
}

type Tab = 'tutte' | 'da_inviare' | 'inviate' | 'da_saldare' | 'note_credito' | 'incassi'

const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

const statusConfig: Record<InvoiceStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  da_inviare: { label: 'Da inviare', cls: 'bg-[#2A2A2A] text-text-secondary', icon: <Clock className="w-3 h-3" /> },
  inviata: { label: 'Inviata', cls: 'bg-blue-500/20 text-blue-400', icon: <Send className="w-3 h-3" /> },
  pagata: { label: 'Pagata', cls: 'bg-success/20 text-success', icon: <Check className="w-3 h-3" /> },
  in_ritardo: { label: 'In ritardo', cls: 'bg-error/20 text-error', icon: <AlertTriangle className="w-3 h-3" /> },
  accettata: { label: 'Accettata', cls: 'bg-purple-500/20 text-purple-400', icon: <FileCheck className="w-3 h-3" /> },
}

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'tutte', label: 'Tutte', icon: <FileText className="w-4 h-4" /> },
  { key: 'da_inviare', label: 'Da Inviare', icon: <Clock className="w-4 h-4" /> },
  { key: 'inviate', label: 'Inviate', icon: <Send className="w-4 h-4" /> },
  { key: 'da_saldare', label: 'Da Saldare', icon: <AlertTriangle className="w-4 h-4" /> },
  { key: 'note_credito', label: 'Note di Credito', icon: <CreditCard className="w-4 h-4" /> },
  { key: 'incassi', label: 'Dashboard Incassi', icon: <TrendingUp className="w-4 h-4" /> },
]

function fmt(m: string) {
  const d = new Date(m)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function FatturazioneGlobaleClient({ invoices: initialInvoices }: Props) {
  const [invoices, setInvoices] = useState(initialInvoices)
  const [activeTab, setActiveTab] = useState<Tab>('tutte')
  const [search, setSearch] = useState('')
  const [filterYear, setFilterYear] = useState<string>('tutti')
  const [filterMonth, setFilterMonth] = useState<string>('tutti')
  const [sortDesc, setSortDesc] = useState(true)

  const years = useMemo(() => {
    const ys = Array.from(new Set(invoices.map((i) => new Date(i.month).getFullYear().toString()))).sort((a, b) => +b - +a)
    return ys
  }, [invoices])

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const d = new Date(inv.month)
      const matchTab =
        activeTab === 'tutte' ? true :
        activeTab === 'da_inviare' ? inv.status === 'da_inviare' && inv.invoice_type === 'fattura' :
        activeTab === 'inviate' ? inv.status === 'inviata' :
        activeTab === 'da_saldare' ? inv.status === 'in_ritardo' :
        activeTab === 'note_credito' ? inv.invoice_type === 'nota_credito' : true
      const matchSearch = !search || inv.client.company_name.toLowerCase().includes(search.toLowerCase()) ||
        (inv.invoice_number ?? '').toLowerCase().includes(search.toLowerCase())
      const matchYear = filterYear === 'tutti' || d.getFullYear().toString() === filterYear
      const matchMonth = filterMonth === 'tutti' || d.getMonth().toString() === filterMonth
      return matchTab && matchSearch && matchYear && matchMonth
    }).sort((a, b) => {
      const cmp = new Date(a.month).getTime() - new Date(b.month).getTime()
      return sortDesc ? -cmp : cmp
    })
  }, [invoices, activeTab, search, filterYear, filterMonth, sortDesc])

  const fatture = invoices.filter((i) => i.invoice_type === 'fattura')
  const noteCredito = invoices.filter((i) => i.invoice_type === 'nota_credito')

  const kpi = {
    totalAnno: fatture.filter((i) => i.status === 'pagata' && new Date(i.month).getFullYear() === new Date().getFullYear()).reduce((s, i) => s + i.amount, 0),
    daRiscuotere: fatture.filter((i) => ['da_inviare', 'inviata', 'in_ritardo'].includes(i.status)).reduce((s, i) => s + i.amount, 0),
    inRitardo: fatture.filter((i) => i.status === 'in_ritardo').reduce((s, i) => s + i.amount, 0),
    noteCredito: noteCredito.reduce((s, i) => s + i.amount, 0),
    daInviare: fatture.filter((i) => i.status === 'da_inviare').length,
    inviate: fatture.filter((i) => i.status === 'inviata').length,
  }

  const badgeCount = (tab: Tab) => {
    if (tab === 'tutte') return invoices.length
    if (tab === 'da_inviare') return invoices.filter((i) => i.status === 'da_inviare' && i.invoice_type === 'fattura').length
    if (tab === 'inviate') return invoices.filter((i) => i.status === 'inviata').length
    if (tab === 'da_saldare') return invoices.filter((i) => i.status === 'in_ritardo').length
    if (tab === 'note_credito') return noteCredito.length
    return 0
  }

  const sendSollecito = async (inv: InvoiceWithClient) => {
    const supabase = createClient()
    await supabase.from('invoices').update({
      reminder_sent_at: new Date().toISOString(),
      reminder_count: ((inv as any).reminder_count ?? 0) + 1,
    }).eq('id', inv.id)
    setInvoices(prev => prev.map(i => i.id === inv.id ? {
      ...i,
      reminder_sent_at: new Date().toISOString(),
      reminder_count: ((i as any).reminder_count ?? 0) + 1,
    } : i))
    toast.success(`Sollecito #${((inv as any).reminder_count ?? 0) + 1} inviato a ${inv.client.company_name}`)
  }

  const markAs = async (id: string, status: InvoiceStatus) => {
    const supabase = createClient()
    const updates: Partial<Invoice> = { status }
    if (status === 'inviata') updates.sent_at = new Date().toISOString()
    if (status === 'pagata') updates.paid_at = new Date().toISOString()
    await supabase.from('invoices').update(updates).eq('id', id)
    setInvoices((prev) => prev.map((i) => i.id === id ? { ...i, ...updates } : i))
    toast.success(`Aggiornata: ${statusConfig[status].label}`)
  }

  const exportCsv = () => {
    const headers = ['Cliente', 'N° Fattura', 'Mese', 'Importo', 'Tipo', 'Stato', 'Scadenza', 'Inviata', 'Pagata']
    const rows = filtered.map((i) => [
      i.client.company_name, i.invoice_number ?? '', fmt(i.month), i.amount,
      i.invoice_type, i.status, i.due_date ?? '', i.sent_at ?? '', i.paid_at ?? '',
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `fatturazione-${new Date().toISOString().slice(0, 7)}.csv`; a.click()
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Fatturazione</h1>
          <p className="text-text-secondary text-sm mt-0.5">Gestione centralizzata di tutte le fatture</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary border border-[#2A2A2A] rounded-lg hover:text-white transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          {/* Aruba CTA */}
          <button className="flex items-center gap-2 px-4 py-2 text-sm border border-orange-500/30 text-orange-400 rounded-lg hover:bg-orange-500/10 transition-colors">
            <FileText className="w-4 h-4" /> Collega Aruba
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-[#2A2A2A] rounded-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-gold" />
            <p className="text-xs text-text-secondary">Fatturato {new Date().getFullYear()}</p>
          </div>
          <p className="text-2xl font-black text-gold">{formatCurrency(kpi.totalAnno)}</p>
        </div>
        <div className="bg-surface border border-[#2A2A2A] rounded-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-warning" />
            <p className="text-xs text-text-secondary">Da Riscuotere</p>
          </div>
          <p className="text-2xl font-black text-warning">{formatCurrency(kpi.daRiscuotere)}</p>
          <p className="text-xs text-text-secondary mt-1">{kpi.daInviare} da inviare · {kpi.inviate} in attesa</p>
        </div>
        <div className="bg-surface border border-[#2A2A2A] rounded-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-error" />
            <p className="text-xs text-text-secondary">Scadute / In Ritardo</p>
          </div>
          <p className="text-2xl font-black text-error">{formatCurrency(kpi.inRitardo)}</p>
        </div>
        <div className="bg-surface border border-[#2A2A2A] rounded-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-4 h-4 text-purple-400" />
            <p className="text-xs text-text-secondary">Note di Credito</p>
          </div>
          <p className="text-2xl font-black text-purple-400">-{formatCurrency(kpi.noteCredito)}</p>
        </div>
      </div>

      {/* Aruba banner */}
      <div className="flex items-center gap-4 bg-[#1A1A1A] border border-orange-500/20 rounded-xl px-5 py-4">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-orange-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Aruba Fatturazione Elettronica</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Collega il tuo account Aruba per emettere fatture elettroniche direttamente dal gestionale, con invio automatico allo SDI.
            Richiede P.IVA e Codice SDI nei dati fiscali del cliente.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="text-xs px-3 py-2 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-lg hover:bg-orange-500/20 transition-colors">
            Configura API
          </button>
          <a href="https://www.aruba.it/fattura-elettronica.aspx" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-white transition-colors px-2 py-2">
            <ExternalLink className="w-3.5 h-3.5" /> Aruba
          </a>
        </div>
      </div>

      {/* Tabs + filtri */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-1 gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const count = badgeCount(tab.key)
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === tab.key ? 'bg-gold text-black' : 'text-text-secondary hover:text-white'}`}>
                {tab.icon}{tab.label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-black/20 text-black' : 'bg-[#2A2A2A] text-text-secondary'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Ricerca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente o n° fattura..."
              className="bg-surface border border-[#2A2A2A] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-text-secondary focus:outline-none focus:border-gold/40 w-44" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary"><X className="w-3 h-3" /></button>}
          </div>
          {/* Anno */}
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
            className="bg-surface border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-gold/40">
            <option value="tutti">Tutti gli anni</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {/* Mese */}
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
            className="bg-surface border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-gold/40">
            <option value="tutti">Tutti i mesi</option>
            {MONTHS.map((m, i) => <option key={i} value={i.toString()}>{m}</option>)}
          </select>
          {/* Sort */}
          <button onClick={() => setSortDesc((v) => !v)} className="flex items-center gap-1 text-xs text-text-secondary border border-[#2A2A2A] px-2.5 py-1.5 rounded-lg hover:text-white transition-colors">
            {sortDesc ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            {sortDesc ? 'Più recenti' : 'Più vecchie'}
          </button>
        </div>
      </div>

      {/* Riepilogo riga */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-text-secondary">
          <span>{filtered.length} documenti</span>
          <span>Totale: <span className="text-gold font-semibold">{formatCurrency(filtered.reduce((s, i) => s + i.amount, 0))}</span></span>
        </div>
      )}

      {/* Dashboard Incassi */}
      {activeTab === 'incassi' && (() => {
        const pagateAnno = fatture.filter(i => i.status === 'pagata' && new Date(i.month).getFullYear() === new Date().getFullYear())
        const byMonth: Record<number, number> = {}
        pagateAnno.forEach(i => { const m = new Date(i.month).getMonth(); byMonth[m] = (byMonth[m] ?? 0) + i.amount })
        const max = Math.max(...Object.values(byMonth), 1)
        const attualeMonth = new Date().getMonth()
        const mesiPassati = Array.from({ length: attualeMonth + 1 }, (_, i) => i)
        const mrr = pagateAnno.length > 0 ? pagateAnno.reduce((s, i) => s + i.amount, 0) / (attualeMonth + 1) : 0

        const topClienti = Object.entries(
          fatture.filter(i => i.status === 'pagata').reduce((acc, i) => {
            acc[i.client.company_name] = (acc[i.client.company_name] ?? 0) + i.amount
            return acc
          }, {} as Record<string, number>)
        ).sort((a, b) => b[1] - a[1]).slice(0, 5)

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
                <p className="text-xs text-text-secondary mb-1">MRR medio {new Date().getFullYear()}</p>
                <p className="text-2xl font-black text-gold">{formatCurrency(mrr)}</p>
              </div>
              <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
                <p className="text-xs text-text-secondary mb-1">Incassato {MONTHS[attualeMonth]}</p>
                <p className="text-2xl font-black text-white">{formatCurrency(byMonth[attualeMonth] ?? 0)}</p>
              </div>
              <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
                <p className="text-xs text-text-secondary mb-1">Proiezione anno</p>
                <p className="text-2xl font-black text-success">{formatCurrency(mrr * 12)}</p>
              </div>
            </div>
            {/* Grafico a barre mensile */}
            <div className="bg-surface border border-[#2A2A2A] rounded-xl p-5">
              <p className="text-sm font-bold text-white mb-4">Incassi mensili {new Date().getFullYear()}</p>
              <div className="flex items-end gap-2 h-32">
                {mesiPassati.map(m => (
                  <div key={m} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] text-text-secondary">{formatCurrency(byMonth[m] ?? 0).replace('€','').trim()}</span>
                    <div className="w-full rounded-t-sm" style={{
                      height: `${Math.round(((byMonth[m] ?? 0) / max) * 100)}%`,
                      minHeight: 2,
                      background: m === attualeMonth ? '#F5C800' : '#2A2A2A',
                    }} />
                    <span className="text-[9px] text-text-secondary">{MONTHS[m]}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Top clienti */}
            <div className="bg-surface border border-[#2A2A2A] rounded-xl p-5">
              <p className="text-sm font-bold text-white mb-3">Top clienti per fatturato</p>
              <div className="space-y-2">
                {topClienti.map(([name, amount], idx) => (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary w-4">{idx + 1}</span>
                    <span className="text-xs text-white flex-1">{name}</span>
                    <div className="flex-1 h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden">
                      <div className="h-full bg-gold rounded-full" style={{ width: `${(amount / topClienti[0][1]) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-gold w-24 text-right">{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Tabella */}
      {activeTab !== 'incassi' && <div className="bg-surface border border-[#2A2A2A] rounded-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-text-secondary text-sm">Nessun documento trovato</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2A2A2A]">
                {['Cliente', 'Periodo', 'N° Documento', 'Importo', 'Tipo', 'Stato', 'Scadenza', 'Inviata', 'Pagata', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv, i) => {
                const cfg = statusConfig[inv.status]
                const overdue = inv.due_date && new Date(inv.due_date) < new Date() && !['pagata', 'accettata'].includes(inv.status)
                return (
                  <tr key={inv.id} className={`hover:bg-white/3 transition-colors ${i < filtered.length - 1 ? 'border-b border-[#2A2A2A]' : ''}`}>
                    <td className="px-4 py-3">
                      <Link href={`/clienti/${inv.client.id}?tab=2`} className="text-sm font-semibold text-white hover:text-gold transition-colors">
                        {inv.client.company_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{fmt(inv.month)}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{inv.invoice_number ?? '—'}</td>
                    <td className="px-4 py-3 text-sm font-bold text-gold">{formatCurrency(inv.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${inv.invoice_type === 'nota_credito' ? 'bg-purple-500/20 text-purple-400' : 'bg-[#2A2A2A] text-text-secondary'}`}>
                        {inv.invoice_type === 'nota_credito' ? 'Nota Credito' : 'Fattura'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded w-fit ${cfg.cls}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-xs ${overdue ? 'text-error font-semibold' : 'text-text-secondary'}`}>
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString('it-IT') : '—'}
                      {overdue && ' ⚠'}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{inv.sent_at ? new Date(inv.sent_at).toLocaleDateString('it-IT') : '—'}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('it-IT') : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {inv.status === 'da_inviare' && inv.invoice_type === 'fattura' && (
                          <button onClick={() => markAs(inv.id, 'inviata')} className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                            <Send className="w-3 h-3" /> Invia
                          </button>
                        )}
                        {inv.status === 'inviata' && (
                          <button onClick={() => markAs(inv.id, 'pagata')} className="text-xs text-success hover:underline flex items-center gap-1">
                            <Check className="w-3 h-3" /> Pagata
                          </button>
                        )}
                        {inv.status === 'in_ritardo' && (
                          <>
                            <button onClick={() => markAs(inv.id, 'inviata')} className="text-xs text-warning hover:underline">Reinvia</button>
                            <button onClick={() => sendSollecito(inv)} className="text-xs text-error hover:underline flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Sollecito {(inv as any).reminder_count > 0 ? `#${(inv as any).reminder_count + 1}` : ''}
                            </button>
                          </>
                        )}
                        <Link href={`/clienti/${inv.client.id}?tab=2`} className="text-text-secondary hover:text-gold transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>}
    </div>
  )
}

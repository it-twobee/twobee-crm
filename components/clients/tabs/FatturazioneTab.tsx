'use client'

import { useState } from 'react'
import { Plus, Check, Send, AlertTriangle, Loader2, Trash2, Pencil, X, FileText, CreditCard, Clock, FileCheck, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import type { Invoice, InvoiceStatus, InvoiceType, Client } from '@/lib/types/database'

interface Props {
  client: Client
  invoices: Invoice[]
}

const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

const statusConfig: Record<InvoiceStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  da_inviare: { label: 'Da inviare', cls: 'bg-surface-active text-text-secondary', icon: <Clock className="w-3 h-3" /> },
  inviata: { label: 'Inviata', cls: 'bg-blue-500/20 text-blue-400', icon: <Send className="w-3 h-3" /> },
  pagata: { label: 'Pagata', cls: 'bg-success/20 text-success', icon: <Check className="w-3 h-3" /> },
  in_ritardo: { label: 'In ritardo', cls: 'bg-error/20 text-error', icon: <AlertTriangle className="w-3 h-3" /> },
  accettata: { label: 'Accettata', cls: 'bg-purple-500/20 text-purple-400', icon: <FileCheck className="w-3 h-3" /> },
}

type Tab = 'da_inviare' | 'inviate' | 'da_saldare' | 'note_credito'

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'da_inviare', label: 'Da Inviare', icon: <Clock className="w-4 h-4" /> },
  { key: 'inviate', label: 'Inviate', icon: <Send className="w-4 h-4" /> },
  { key: 'da_saldare', label: 'Da Saldare', icon: <AlertTriangle className="w-4 h-4" /> },
  { key: 'note_credito', label: 'Note di Credito', icon: <CreditCard className="w-4 h-4" /> },
]

function formatMonth(monthStr: string) {
  const d = new Date(monthStr)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function FatturazioneTab({ client, invoices: initialInvoices }: Props) {
  const [invoices, setInvoices] = useState(initialInvoices)
  const [activeTab, setActiveTab] = useState<Tab>('da_inviare')
  const [showModal, setShowModal] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [modalType, setModalType] = useState<InvoiceType>('fattura')

  const fatture = invoices.filter((i) => i.invoice_type !== 'nota_credito')
  const noteCredito = invoices.filter((i) => i.invoice_type === 'nota_credito')

  const byTab = (tab: Tab): Invoice[] => {
    if (tab === 'da_inviare') return fatture.filter((i) => i.status === 'da_inviare')
    if (tab === 'inviate') return fatture.filter((i) => i.status === 'inviata')
    if (tab === 'da_saldare') return fatture.filter((i) => i.status === 'in_ritardo')
    if (tab === 'note_credito') return noteCredito
    return []
  }

  const badgeCount = (tab: Tab) => byTab(tab).length

  const totalPagato = fatture.filter((i) => i.status === 'pagata').reduce((s, i) => s + i.amount, 0)
  const totalDaRiscuotere = fatture.filter((i) => i.status !== 'pagata').reduce((s, i) => s + i.amount, 0)
  const totalNoteCredito = noteCredito.reduce((s, i) => s + i.amount, 0)

  const markAs = async (id: string, status: InvoiceStatus) => {
    const supabase = createClient()
    const updates: Partial<Invoice> = { status }
    if (status === 'inviata') updates.sent_at = new Date().toISOString()
    if (status === 'pagata') updates.paid_at = new Date().toISOString()
    const { error } = await supabase.from('invoices').update(updates).eq('id', id)
    if (error) { toast.error('Errore'); return }
    setInvoices((prev) => prev.map((i) => i.id === id ? { ...i, ...updates } : i))
    toast.success(`Fattura aggiornata: ${statusConfig[status].label}`)
  }

  const deleteInvoice = async (id: string) => {
    if (!confirm('Eliminare questa fattura?')) return
    const supabase = createClient()
    await supabase.from('invoices').delete().eq('id', id)
    setInvoices((prev) => prev.filter((i) => i.id !== id))
    toast.success('Eliminata')
  }

  const openNew = (type: InvoiceType) => {
    setEditingInvoice(null)
    setModalType(type)
    setShowModal(true)
  }

  const openEdit = (inv: Invoice) => {
    setEditingInvoice(inv)
    setModalType(inv.invoice_type)
    setShowModal(true)
  }

  const tabList = byTab(activeTab)

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-card p-4">
          <p className="text-xs text-text-secondary mb-1">Fatturato (pagato)</p>
          <p className="text-xl font-black text-gold">{formatCurrency(totalPagato)}</p>
        </div>
        <div className="bg-surface border border-border rounded-card p-4">
          <p className="text-xs text-text-secondary mb-1">Da Riscuotere</p>
          <p className="text-xl font-black text-warning">{formatCurrency(totalDaRiscuotere)}</p>
        </div>
        <div className="bg-surface border border-border rounded-card p-4">
          <p className="text-xs text-text-secondary mb-1">MRR Contrattuale</p>
          <p className="text-xl font-black text-text-primary">{formatCurrency(client.mrr)}</p>
        </div>
        <div className="bg-surface border border-border rounded-card p-4">
          <p className="text-xs text-text-secondary mb-1">Note di Credito</p>
          <p className="text-xl font-black text-purple-400">-{formatCurrency(totalNoteCredito)}</p>
        </div>
      </div>

      {/* Aruba banner */}
      <div className="flex items-center justify-between bg-surface border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <FileText className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Fatturazione Elettronica Aruba</p>
            <p className="text-xs text-text-secondary">Collegamento non configurato — aggiungi P.IVA e dati fiscali nell'anagrafica</p>
          </div>
        </div>
        <button className="flex items-center gap-1.5 text-xs text-text-secondary border border-border px-3 py-1.5 rounded-lg hover:border-orange-400/40 hover:text-orange-400 transition-colors">
          <ExternalLink className="w-3.5 h-3.5" /> Configura
        </button>
      </div>

      {/* Header con tabs e bottoni */}
      <div className="flex items-center justify-between">
        <div className="flex bg-surface border border-border rounded-xl p-1 gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors relative ${activeTab === tab.key ? 'bg-gold text-black' : 'text-text-secondary hover:text-text-primary'}`}
            >
              {tab.icon}{tab.label}
              {badgeCount(tab.key) > 0 && (
                <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-black/20 text-black' : 'bg-surface-active text-text-secondary'}`}>
                  {badgeCount(tab.key)}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => openNew('nota_credito')} className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border text-text-secondary rounded-lg hover:border-purple-400/40 hover:text-purple-400 transition-colors">
            <CreditCard className="w-3.5 h-3.5" /> Nota di Credito
          </button>
          <button onClick={() => openNew('fattura')} className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-gold text-black rounded-lg hover:bg-yellow-400 transition-colors">
            <Plus className="w-4 h-4" /> Nuova Fattura
          </button>
        </div>
      </div>

      {/* Tabella */}
      <div className="bg-surface border border-border rounded-card overflow-hidden">
        {tabList.length === 0 ? (
          <div className="px-5 py-12 text-center text-text-secondary text-sm">
            {activeTab === 'da_inviare' && 'Nessuna fattura da inviare'}
            {activeTab === 'inviate' && 'Nessuna fattura inviata in attesa di pagamento'}
            {activeTab === 'da_saldare' && 'Nessuna fattura in ritardo'}
            {activeTab === 'note_credito' && 'Nessuna nota di credito'}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['Periodo', 'N° Documento', 'Importo', 'Scadenza', 'Stato', 'Inviata', 'Pagata', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabList.map((inv, i) => {
                const cfg = statusConfig[inv.status]
                const isLast = i === tabList.length - 1
                const overdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'pagata'
                return (
                  <tr key={inv.id} className={`hover:bg-overlay/3 transition-colors ${!isLast ? 'border-b border-border' : ''}`}>
                    <td className="px-4 py-3 text-sm font-semibold text-text-primary">{formatMonth(inv.month)}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{inv.invoice_number ?? '—'}</td>
                    <td className="px-4 py-3 text-sm font-bold text-gold">{formatCurrency(inv.amount)}</td>
                    <td className={`px-4 py-3 text-xs ${overdue ? 'text-error font-semibold' : 'text-text-secondary'}`}>
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString('it-IT') : '—'}
                      {overdue && ' ⚠'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded w-fit ${cfg.cls}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {inv.sent_at ? new Date(inv.sent_at).toLocaleDateString('it-IT') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('it-IT') : '—'}
                    </td>
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
                          <button onClick={() => markAs(inv.id, 'inviata')} className="text-xs text-warning hover:underline flex items-center gap-1">
                            <Send className="w-3 h-3" /> Reinvia
                          </button>
                        )}
                        {inv.invoice_type === 'nota_credito' && inv.status === 'da_inviare' && (
                          <button onClick={() => markAs(inv.id, 'accettata')} className="text-xs text-purple-400 hover:underline flex items-center gap-1">
                            <FileCheck className="w-3 h-3" /> Accettata
                          </button>
                        )}
                        <button onClick={() => openEdit(inv)} className="text-text-secondary hover:text-gold transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteInvoice(inv.id)} className="text-text-secondary hover:text-error transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <InvoiceModal
          client={client}
          invoice={editingInvoice}
          type={modalType}
          onClose={() => setShowModal(false)}
          onSaved={(inv) => {
            if (editingInvoice) {
              setInvoices((prev) => prev.map((i) => i.id === inv.id ? inv : i))
            } else {
              setInvoices((prev) => [inv, ...prev])
            }
            setShowModal(false)
          }}
        />
      )}

    </div>
  )
}

function InvoiceModal({ client, invoice, type, onClose, onSaved }: {
  client: Client
  invoice: Invoice | null
  type: InvoiceType
  onClose: () => void
  onSaved: (inv: Invoice) => void
}) {
  const isEdit = !!invoice
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    month: invoice?.month?.slice(0, 7) ?? new Date().toISOString().slice(0, 7),
    amount: invoice?.amount.toString() ?? client.mrr.toString(),
    invoice_number: invoice?.invoice_number ?? '',
    status: invoice?.status ?? (type === 'nota_credito' ? 'da_inviare' as InvoiceStatus : 'da_inviare' as InvoiceStatus),
    notes: invoice?.notes ?? '',
    description: invoice?.description ?? '',
    due_date: invoice?.due_date?.slice(0, 10) ?? '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const payload = {
      client_id: client.id,
      month: form.month + '-01',
      amount: parseFloat(form.amount),
      invoice_number: form.invoice_number || null,
      status: form.status,
      notes: form.notes || null,
      description: form.description || null,
      due_date: form.due_date || null,
      invoice_type: type,
    }
    const { data, error } = isEdit
      ? await supabase.from('invoices').update(payload).eq('id', invoice!.id).select().single()
      : await supabase.from('invoices').insert(payload).select().single()
    setLoading(false)
    if (error) { toast.error('Errore: ' + error.message); return }
    toast.success(isEdit ? 'Modifiche salvate' : type === 'nota_credito' ? 'Nota di credito creata' : 'Fattura registrata!')
    onSaved(data as Invoice)
  }

  const title = isEdit ? 'Modifica ' + (type === 'nota_credito' ? 'Nota di Credito' : 'Fattura') : 'Nuova ' + (type === 'nota_credito' ? 'Nota di Credito' : 'Fattura')

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold flex items-center gap-2">
            {type === 'nota_credito' ? <CreditCard className="w-5 h-5 text-purple-400" /> : <FileText className="w-5 h-5 text-gold" />}
            {title}
          </h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Mese di riferimento *</label>
              <input type="month" value={form.month} onChange={(e) => setForm((p) => ({ ...p, month: e.target.value }))} required
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Importo (€) *</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">N° Documento</label>
              <input value={form.invoice_number} onChange={(e) => setForm((p) => ({ ...p, invoice_number: e.target.value }))} placeholder="es. 2026/001"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Scadenza pagamento</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Stato</label>
            <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as InvoiceStatus }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
              {type === 'fattura' ? (
                <>
                  <option value="da_inviare">Da inviare</option>
                  <option value="inviata">Inviata</option>
                  <option value="pagata">Pagata</option>
                  <option value="in_ritardo">In ritardo</option>
                </>
              ) : (
                <>
                  <option value="da_inviare">Da inviare</option>
                  <option value="inviata">Inviata</option>
                  <option value="accettata">Accettata</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Descrizione</label>
            <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Oggetto della fattura..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Note interne</label>
            <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-black font-bold rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}{isEdit ? 'Salva modifiche' : 'Registra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

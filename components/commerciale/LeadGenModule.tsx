'use client'

import { useState, useEffect } from 'react'
import { Plus, X, Loader2, UserCheck, TrendingDown, AlertTriangle, CheckCircle2, Phone, Mail, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { sendLeadSms } from '@/app/actions/lead-notify'
import type { Client, Lead, LeadStatus, LeadSource } from '@/lib/types/database'

interface Props {
  clients: Pick<Client, 'id' | 'company_name'>[]
}

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  nuovo:       { label: 'Nuovo',       color: 'text-blue-400',   bg: 'bg-blue-400/10' },
  contattato:  { label: 'Contattato',  color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  qualificato: { label: 'Qualificato', color: 'text-gold',  bg: 'bg-gold-dim' },
  convertito:  { label: 'Convertito',  color: 'text-green-400',  bg: 'bg-green-400/10' },
  perso:       { label: 'Perso',       color: 'text-red-400',    bg: 'bg-red-400/10' },
}

const SOURCE_LABELS: Record<LeadSource, string> = {
  facebook: 'Facebook', google: 'Google', linkedin: 'LinkedIn',
  organic: 'Organico', referral: 'Referral', email: 'Email',
  evento: 'Evento', altro: 'Altro',
}

const ic = 'w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/50'

function LeadModal({ lead, clients, onClose, onSaved }: {
  lead?: Lead | null
  clients: Pick<Client, 'id' | 'company_name'>[]
  onClose: () => void
  onSaved: (l: Lead) => void
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name:       lead?.name ?? '',
    company:    lead?.company ?? '',
    email:      lead?.email ?? '',
    phone:      lead?.phone ?? '',
    source:     lead?.source ?? 'altro' as LeadSource,
    status:     lead?.status ?? 'nuovo' as LeadStatus,
    notes:      lead?.notes ?? '',
    value:      lead?.value?.toString() ?? '',
    client_id:  lead?.client_id ?? '',
  })

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) { toast.error('Nome obbligatorio'); return }
    setLoading(true)
    const supabase = createClient()
    const payload = {
      name: form.name,
      company: form.company || null,
      email: form.email || null,
      phone: form.phone || null,
      source: form.source,
      status: form.status,
      notes: form.notes || null,
      value: form.value ? parseFloat(form.value) : null,
      client_id: form.client_id || null,
    }
    const result = lead
      ? await supabase.from('leads').update(payload).eq('id', lead.id).select().single()
      : await supabase.from('leads').insert(payload).select().single()
    setLoading(false)
    if (result.error) { toast.error(result.error.message); return }
    // Notifiche in-app gestite dal trigger DB; qui solo l'SMS opzionale per i nuovi lead
    if (!lead) {
      sendLeadSms({ name: payload.name, company: payload.company, source: payload.source, phone: payload.phone })
        .catch(() => {})
      toast.success('Lead creato — team notificato')
    } else {
      toast.success('Lead aggiornato')
    }
    onSaved(result.data as Lead)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface">
          <h2 className="text-base font-bold text-text-primary">{lead ? 'Modifica lead' : 'Nuovo lead'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary" /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Nome *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="es. Mario Rossi" className={ic} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Azienda</label>
              <input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))}
                placeholder="es. Rossi Srl" className={ic} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Valore stimato (€)</label>
              <input type="number" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))}
                placeholder="es. 1200" className={ic} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={ic} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Telefono</label>
              <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={ic} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Fonte</label>
              <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value as LeadSource }))} className={ic}>
                {(Object.entries(SOURCE_LABELS) as [LeadSource, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as LeadStatus }))} className={ic}>
                {(Object.entries(STATUS_CONFIG) as [LeadStatus, typeof STATUS_CONFIG[LeadStatus]][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          {clients.length > 0 && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Cliente (campagna)</label>
              <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))} className={ic}>
                <option value="">— Nessun cliente —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-text-secondary mb-1">Note</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={3} className={ic + ' resize-none'} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-surface border border-border text-text-secondary text-sm font-semibold rounded-lg hover:text-text-primary">
              Annulla
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-gold text-black text-sm font-bold rounded-lg hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {lead ? 'Salva modifiche' : 'Crea lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function LeadGenModule({ clients }: Props) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [filterStatus, setFilterStatus] = useState<LeadStatus | 'tutti'>('tutti')
  const [filterClient, setFilterClient] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.from('leads').select('*').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setLeads((data ?? []) as Lead[])
        setLoading(false)
      })
  }, [])

  const handleSaved = (l: Lead) => {
    setLeads(p => {
      const exists = p.find(x => x.id === l.id)
      return exists ? p.map(x => x.id === l.id ? l : x) : [l, ...p]
    })
  }

  const deleteLead = async (id: string) => {
    if (!confirm('Eliminare questo lead?')) return
    const supabase = createClient()
    await supabase.from('leads').delete().eq('id', id)
    setLeads(p => p.filter(l => l.id !== id))
    toast.success('Lead eliminato')
  }

  const updateStatus = async (id: string, status: LeadStatus) => {
    const supabase = createClient()
    await supabase.from('leads').update({ status }).eq('id', id)
    setLeads(p => p.map(l => l.id === id ? { ...l, status } : l))
  }

  const filtered = leads.filter(l => {
    if (filterStatus !== 'tutti' && l.status !== filterStatus) return false
    if (filterClient && l.client_id !== filterClient) return false
    if (search) {
      const q = search.toLowerCase()
      if (!l.name.toLowerCase().includes(q) && !(l.company ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const stats = {
    totali:     leads.length,
    nuovi:      leads.filter(l => l.status === 'nuovo').length,
    qualificati: leads.filter(l => l.status === 'qualificato').length,
    convertiti: leads.filter(l => l.status === 'convertito').length,
    convRate:   leads.length ? Math.round((leads.filter(l => l.status === 'convertito').length / leads.length) * 100) : 0,
  }

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.company_name]))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-text-primary">Lead Generation</h2>
          <p className="text-text-secondary text-sm mt-0.5">Lead raccolti dalle campagne growth dei clienti</p>
        </div>
        <button onClick={() => { setEditingLead(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black text-sm font-bold rounded-lg hover:bg-yellow-400">
          <Plus className="w-4 h-4" /> Nuovo lead
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: 'Lead totali',   v: stats.totali,      c: 'text-text-primary',        Icon: UserCheck },
          { l: 'Nuovi',         v: stats.nuovi,       c: 'text-blue-400',     Icon: TrendingDown },
          { l: 'Qualificati',   v: stats.qualificati, c: 'text-gold',    Icon: AlertTriangle },
          { l: 'Conv. rate',    v: `${stats.convRate}%`, c: stats.convRate >= 20 ? 'text-green-400' : 'text-text-secondary', Icon: CheckCircle2 },
        ].map(k => (
          <div key={k.l} className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
            <k.Icon className="w-5 h-5 text-text-tertiary shrink-0" />
            <div>
              <p className="text-xs text-text-secondary mb-0.5">{k.l}</p>
              <p className={`text-xl font-black ${k.c}`}>{k.v}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca nome o azienda…"
            className="pl-7 pr-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-gold/50 w-48" />
        </div>
        <div className="flex bg-surface border border-border rounded-lg overflow-hidden">
          {(['tutti', ...Object.keys(STATUS_CONFIG)] as (LeadStatus | 'tutti')[]).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${filterStatus === s ? 'bg-gold text-black' : 'text-text-secondary hover:text-text-primary'}`}>
              {s === 'tutti' ? 'Tutti' : STATUS_CONFIG[s as LeadStatus].label}
            </button>
          ))}
        </div>
        {clients.length > 0 && (
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
            className="px-2 py-1.5 text-xs bg-surface border border-border rounded-lg text-text-secondary focus:outline-none">
            <option value="">Tutti i clienti</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
        )}
      </div>

      {/* Tabella */}
      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-text-tertiary">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Caricamento…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <UserCheck className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
            <p className="text-text-tertiary text-sm">{leads.length === 0 ? 'Nessun lead ancora. Aggiungine uno!' : 'Nessun risultato per i filtri selezionati.'}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['Nome', 'Contatti', 'Fonte', 'Cliente', 'Valore', 'Status', ''].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold text-text-tertiary uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(lead => {
                const cfg = STATUS_CONFIG[lead.status]
                return (
                  <tr key={lead.id} className="hover:bg-surface group">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-text-primary">{lead.name}</p>
                      {lead.company && <p className="text-xs text-text-secondary">{lead.company}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {lead.email && (
                          <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-text-secondary hover:text-gold">
                            <Mail className="w-3 h-3" />{lead.email}
                          </a>
                        )}
                        {lead.phone && (
                          <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-text-secondary hover:text-gold">
                            <Phone className="w-3 h-3" />{lead.phone}
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-text-secondary">{SOURCE_LABELS[lead.source]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-text-secondary">{lead.client_id ? (clientMap[lead.client_id] ?? '—') : '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-text-secondary">{lead.value ? `€${lead.value.toLocaleString('it-IT')}` : '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <select value={lead.status}
                        onChange={e => updateStatus(lead.id, e.target.value as LeadStatus)}
                        className={`text-xs font-bold px-2 py-0.5 rounded-full border-0 outline-none cursor-pointer ${cfg.color} ${cfg.bg}`}>
                        {(Object.entries(STATUS_CONFIG) as [LeadStatus, typeof STATUS_CONFIG[LeadStatus]][]).map(([k, v]) => (
                          <option key={k} value={k} className="bg-surface text-text-primary">{v.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingLead(lead); setShowModal(true) }}
                          className="text-text-tertiary hover:text-gold text-xs">Modifica</button>
                        <button onClick={() => deleteLead(lead.id)}
                          className="text-text-tertiary hover:text-red-400 text-xs">Elimina</button>
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
        <LeadModal
          lead={editingLead}
          clients={clients}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

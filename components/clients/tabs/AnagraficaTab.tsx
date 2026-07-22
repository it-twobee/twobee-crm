'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Trash2, Pencil, Save, X, Check, Building2, Receipt, FileText, Users2, Crown } from 'lucide-react'
import { formatDate, getInitials } from '@/lib/utils'
import { createClient as createSupabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Client, ClientContact, Profile, ClientStakeholder, StakeholderRole, ClientPackage, PaymentStatus, ClientStatus, ClientType, ClientLabel } from '@/lib/types/database'

interface Props {
  client: Client
  contacts: ClientContact[]
  teamMembers: Profile[]
  stakeholders: ClientStakeholder[]
  hideEconomics?: boolean
}

const PACKAGES: ClientPackage[] = ['Worker Bee Start', 'Worker Bee Basic', 'Hive Basic', 'Hive Custom', 'Royal Queen', 'IT Digital Partner', 'Partner Quota']
const CHANNELS = ['Meta Ads', 'Google Ads', 'SEO', 'Social Organic', 'Email Marketing', 'TikTok Ads', 'LinkedIn Ads', 'YouTube Ads', 'Copywriting', 'Web Design']
const INDUSTRIES = [
  'E-commerce Moda', 'E-commerce Casa & Arredo', 'E-commerce Alimentare',
  'Servizi B2B', 'Immobiliare', 'Ristorazione', 'Salute & Benessere',
  'Turismo & Hospitality', 'Automotive', 'Formazione & Corsi',
  'Professionisti (avv/med/comm)', 'Tecnologia / SaaS', 'Altro',
]

const roleLabel: Record<StakeholderRole, string> = {
  owner: 'Owner',
  stakeholder: 'Stakeholder',
  collaboratore_esterno: 'Collaboratore Esterno',
  agenzia_supporto: 'Agenzia di Supporto',
}
const roleBadge: Record<StakeholderRole, string> = {
  owner: 'bg-gold/20 text-gold-text',
  stakeholder: 'bg-info/20 text-info',
  collaboratore_esterno: 'bg-accent/20 text-accent',
  agenzia_supporto: 'bg-success/20 text-success',
}

function Field({ label, value, editMode, children }: { label: string; value: React.ReactNode; editMode: boolean; children: React.ReactNode }) {
  return (
    <div className={editMode ? '' : 'bg-surface rounded-lg px-3 py-2.5'}>
      <p className="text-text-secondary text-2xs uppercase tracking-wider font-semibold mb-1">{label}</p>
      {editMode ? children : <p className="text-text-primary text-sm font-medium">{value || <span className="text-text-secondary italic text-xs">Non compilato</span>}</p>}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold/60 placeholder:text-text-secondary"
    />
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold/60"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function AnagraficaTab({ client: initialClient, contacts, teamMembers, stakeholders: initialStakeholders, hideEconomics = false }: Props) {
  const [client, setClient] = useState(initialClient)
  const router = useRouter()
  const [stakeholders, setStakeholders] = useState(initialStakeholders)
  const [editAzienda, setEditAzienda] = useState(false)
  const [editFiscale, setEditFiscale] = useState(false)
  const [editContratto, setEditContratto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showStakeholderModal, setShowStakeholderModal] = useState(false)
  const [form, setForm] = useState(client)

  const save = async (section: string) => {
    setSaving(true)
    const supabase = createSupabase()
    // `mrr` è derivato da revenue_streams: non va mai rispedito in UPDATE.
    const { mrr: _derivedMrr, ...payload } = form
    const { error } = await supabase.from('clients').update(payload).eq('id', client.id)
    setSaving(false)
    if (error) { toast.error('Errore nel salvataggio'); return }
    setClient(form)
    if (section === 'azienda') setEditAzienda(false)
    if (section === 'fiscale') setEditFiscale(false)
    if (section === 'contratto') setEditContratto(false)
    toast.success('Modifiche salvate')
    router.refresh()
  }

  const cancel = () => {
    setForm(client)
    setEditAzienda(false)
    setEditFiscale(false)
    setEditContratto(false)
  }

  const toggleChannel = (ch: string) => {
    const current = form.active_channels ?? []
    setForm((p) => ({
      ...p,
      active_channels: current.includes(ch) ? current.filter((c) => c !== ch) : [...current, ch],
    }))
  }

  const deleteStakeholder = async (id: string) => {
    const supabase = createSupabase()
    await supabase.from('client_stakeholders').delete().eq('id', id)
    setStakeholders((prev) => prev.filter((s) => s.id !== id))
    toast.success('Rimosso')
  }

  const sectionIcons: Record<string, React.ReactNode> = {
    azienda: <Building2 className="w-4 h-4 text-gold-text" />,
    fiscale: <Receipt className="w-4 h-4 text-info" />,
    contratto: <FileText className="w-4 h-4 text-accent" />,
  }

  const SectionHeader = ({ title, section, editing }: { title: string; section: string; editing: boolean }) => (
    <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
      <div className="flex items-center gap-2.5">
        {sectionIcons[section]}
        <h3 className="text-sm font-bold text-text-primary">{title}</h3>
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <button onClick={cancel} className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors">
            <X className="w-3.5 h-3.5" /> Annulla
          </button>
          <button onClick={() => save(section)} disabled={saving} className="flex items-center gap-1.5 text-xs bg-gold text-on-gold px-3 py-1 rounded-lg font-semibold hover:bg-gold/90 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Salva
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setForm(client); if (section === 'azienda') setEditAzienda(true); if (section === 'fiscale') setEditFiscale(true); if (section === 'contratto') setEditContratto(true) }}
          className="flex items-center gap-1 text-xs text-text-secondary hover:text-gold-text transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" /> Modifica
        </button>
      )}
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Dati Aziendali */}
      <section className="bg-surface border border-border rounded-2xl p-5">
        <SectionHeader title="Dati Aziendali" section="azienda" editing={editAzienda} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* §24: nome visualizzato ≠ ragione sociale */}
          <Field label="Nome visualizzato" value={client.display_name ?? client.company_name} editMode={editAzienda}>
            <Input value={form.display_name ?? form.company_name ?? ''} onChange={(v) => setForm((p) => ({ ...p, display_name: v }))} />
          </Field>
          <Field label="Ragione Sociale" value={client.legal_name} editMode={editAzienda}>
            <Input value={form.legal_name ?? ''} onChange={(v) => setForm((p) => ({ ...p, legal_name: v }))} placeholder="es. Seven Holding S.r.l." />
          </Field>
          <Field label="Telefono" value={client.phone} editMode={editAzienda}>
            <Input value={form.phone ?? ''} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} placeholder="+39 ..." />
          </Field>
          <Field label="Sito Web" value={client.website} editMode={editAzienda}>
            <Input value={form.website ?? ''} onChange={(v) => setForm((p) => ({ ...p, website: v }))} placeholder="https://..." />
          </Field>
          <Field label="Tipo Cliente" value={(client.client_type ?? 'growth').toUpperCase()} editMode={editAzienda}>
            <Select value={form.client_type} onChange={(v) => setForm((p) => ({ ...p, client_type: v as ClientType }))}
              options={[{ value: 'growth', label: 'Growth' }, { value: 'digital', label: 'Digital' }]} />
          </Field>
          <Field label="Label" value={(client.client_label ?? '').replace('_', ' ')} editMode={editAzienda}>
            <Select value={form.client_label} onChange={(v) => setForm((p) => ({ ...p, client_label: v as ClientLabel }))}
              options={[{ value: 'stabile', label: 'Stabile' }, { value: 'in_bilico', label: 'In Bilico' }, { value: 'perso', label: 'Perso' }, { value: 'partner', label: 'Partner' }]} />
          </Field>
          <Field label="Settore" value={client.industry} editMode={editAzienda}>
            <select value={form.industry ?? ''} onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value || null }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold/60">
              <option value="">— Seleziona settore —</option>
              {INDUSTRIES.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
            </select>
          </Field>
          <Field label="Area di Mercato" value={client.market_area} editMode={editAzienda}>
            <Input value={form.market_area ?? ''} onChange={(v) => setForm((p) => ({ ...p, market_area: v }))} placeholder="es. Nord Italia, Nazionale, Europa..." />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Note Interne" value={client.notes} editMode={editAzienda}>
              <textarea value={form.notes ?? ''} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3}
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold/60 resize-none" />
            </Field>
          </div>
        </div>

        {/* Canali */}
        <div className="mt-4">
          <p className="text-text-secondary text-xs mb-2">Canali Attivi</p>
          {editAzienda ? (
            <div className="flex gap-2 flex-wrap">
              {CHANNELS.map((ch) => (
                <button key={ch} onClick={() => toggleChannel(ch)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${form.active_channels?.includes(ch) ? 'bg-gold/20 border-gold/40 text-gold-text' : 'bg-background border-border text-text-secondary hover:border-border-strong'}`}>
                  {form.active_channels?.includes(ch) && <Check className="w-3 h-3 inline mr-1" />}{ch}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {client.active_channels.map((ch) => (
                <span key={ch} className="bg-background border border-border text-text-secondary text-xs px-2.5 py-1 rounded">{ch}</span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Dati Fiscali (per Aruba) */}
      <section className="bg-surface border border-border rounded-2xl p-5">
        <SectionHeader title="Dati Fiscali & Fatturazione Elettronica" section="fiscale" editing={editFiscale} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="P.IVA" value={client.piva} editMode={editFiscale}>
            <Input value={form.piva ?? ''} onChange={(v) => setForm((p) => ({ ...p, piva: v }))} placeholder="IT12345678901" />
          </Field>
          <Field label="Codice Fiscale" value={client.fiscal_code} editMode={editFiscale}>
            <Input value={form.fiscal_code ?? ''} onChange={(v) => setForm((p) => ({ ...p, fiscal_code: v }))} />
          </Field>
          <Field label="Indirizzo" value={client.address} editMode={editFiscale}>
            <Input value={form.address ?? ''} onChange={(v) => setForm((p) => ({ ...p, address: v }))} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="CAP" value={client.cap} editMode={editFiscale}>
              <Input value={form.cap ?? ''} onChange={(v) => setForm((p) => ({ ...p, cap: v }))} placeholder="80100" />
            </Field>
            <Field label="Città" value={client.city} editMode={editFiscale}>
              <Input value={form.city ?? ''} onChange={(v) => setForm((p) => ({ ...p, city: v }))} placeholder="Napoli" />
            </Field>
          </div>
          <Field label="Codice SDI" value={client.sdi_code} editMode={editFiscale}>
            <Input value={form.sdi_code ?? ''} onChange={(v) => setForm((p) => ({ ...p, sdi_code: v }))} placeholder="XXXXXXX" />
          </Field>
          <Field label="PEC" value={client.pec} editMode={editFiscale}>
            <Input value={form.pec ?? ''} onChange={(v) => setForm((p) => ({ ...p, pec: v }))} placeholder="nome@pec.it" type="email" />
          </Field>
        </div>
        {!editFiscale && !client.piva && (
          <p className="text-xs text-text-secondary mt-3 italic">Dati fiscali non ancora inseriti — necessari per integrazione Aruba</p>
        )}
      </section>

      {/* Contratto & Pagamenti — nascosto nel portale operativo (dati economici) */}
      {!hideEconomics && (
        <section className="bg-surface border border-border rounded-2xl p-5">
          <SectionHeader title="Contratto & Pagamenti" section="contratto" editing={editContratto} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Pacchetto" value={client.package} editMode={editContratto}>
              <Select value={form.package} onChange={(v) => setForm((p) => ({ ...p, package: v as ClientPackage }))}
                options={PACKAGES.map((pk) => ({ value: pk, label: pk }))} />
            </Field>
            {/* Sola lettura: `mrr` è derivato da revenue_streams (migration 116).
                Scriverlo qui verrebbe sovrascritto alla prima refresh_all_client_mrr(). */}
            <div>
              <p className="text-2xs text-text-tertiary mb-1">MRR (€/mese)</p>
              <p className="text-sm text-text-primary">€{client.mrr.toLocaleString('it-IT')}</p>
              <p className="text-2xs text-text-tertiary mt-0.5">Calcolato dagli accordi economici attivi</p>
            </div>
            <Field label="Inizio Contratto" value={formatDate(client.contract_start)} editMode={editContratto}>
              <Input type="date" value={form.contract_start?.slice(0, 10) ?? ''} onChange={(v) => setForm((p) => ({ ...p, contract_start: v }))} />
            </Field>
            <Field label="Fine Contratto" value={formatDate(client.contract_end)} editMode={editContratto}>
              <Input type="date" value={form.contract_end?.slice(0, 10) ?? ''} onChange={(v) => setForm((p) => ({ ...p, contract_end: v }))} />
            </Field>
            <Field label="Stato Pagamenti" value={client.payment_status} editMode={editContratto}>
              <Select value={form.payment_status} onChange={(v) => setForm((p) => ({ ...p, payment_status: v as PaymentStatus }))}
                options={[{ value: 'pagato', label: 'Pagato' }, { value: 'in_attesa', label: 'In Attesa' }, { value: 'scaduto', label: 'Scaduto' }]} />
            </Field>
          </div>
        </section>
      )}

      {/* Referenti Cliente */}
      <section className="bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
          <Users2 className="w-4 h-4 text-success" />
          <h3 className="text-sm font-bold text-text-primary">Referenti Cliente</h3>
        </div>
        {contacts.length === 0 ? (
          <p className="text-text-secondary text-sm">Nessun referente inserito</p>
        ) : (
          <div className="space-y-3">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold-text text-xs font-bold shrink-0">
                  {getInitials(c.full_name)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-text-primary">{c.full_name}</p>
                    {c.is_primary && <span className="text-xs bg-gold/20 text-gold-text px-1.5 py-0.5 rounded">Principale</span>}
                  </div>
                  {c.role && <p className="text-xs text-text-secondary">{c.role}</p>}
                  <div className="flex gap-3 mt-0.5 text-xs text-text-secondary">
                    <a href={`mailto:${c.email}`} className="hover:text-gold-text transition-colors">{c.email}</a>
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Stakeholders */}
      <section className="bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Crown className="w-4 h-4 text-warning" />
            <h3 className="text-sm font-bold text-text-primary">Owner, Stakeholder & Collaboratori</h3>
          </div>
          <button onClick={() => setShowStakeholderModal(true)} className="flex items-center gap-1 text-xs text-gold-text hover:underline">
            <Plus className="w-3.5 h-3.5" /> Aggiungi
          </button>
        </div>
        {stakeholders.length === 0 ? (
          <p className="text-text-secondary text-sm">Nessuno stakeholder inserito</p>
        ) : (
          <div className="space-y-3">
            {stakeholders.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent text-xs font-bold shrink-0">
                    {getInitials(s.full_name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary">{s.full_name}</p>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${roleBadge[s.role]}`}>{roleLabel[s.role]}</span>
                    </div>
                    {s.company && <p className="text-xs text-text-secondary">{s.company}{s.piva ? ` · P.IVA ${s.piva}` : ''}</p>}
                    <div className="flex gap-3 mt-0.5 text-xs text-text-secondary">
                      <a href={`mailto:${s.email}`} className="hover:text-gold-text transition-colors">{s.email}</a>
                      {s.phone && <span>{s.phone}</span>}
                    </div>
                    {s.notes && <p className="text-xs text-text-secondary mt-0.5 italic">{s.notes}</p>}
                  </div>
                </div>
                <button onClick={() => deleteStakeholder(s.id)} className="text-text-secondary hover:text-error transition-colors shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Team TWO BEE */}
      <section className="bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
          <Users2 className="w-4 h-4 text-gold-text" />
          <h3 className="text-sm font-bold text-text-primary">Team TWO BEE Assegnato</h3>
        </div>
        {teamMembers.length === 0 ? (
          <p className="text-text-secondary text-sm">Nessun membro assegnato</p>
        ) : (
          <div className="flex gap-3 flex-wrap">
            {teamMembers.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold-text text-xs font-bold">
                  {getInitials(m.full_name)}
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{m.full_name}</p>
                  <p className="text-xs text-text-secondary capitalize">{m.role}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showStakeholderModal && (
        <StakeholderModal
          clientId={client.id}
          onClose={() => setShowStakeholderModal(false)}
          onCreated={(s) => { setStakeholders((prev) => [...prev, s]); setShowStakeholderModal(false) }}
        />
      )}
    </div>
  )
}

function StakeholderModal({ clientId, onClose, onCreated }: { clientId: string; onClose: () => void; onCreated: (s: ClientStakeholder) => void }) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', role: 'stakeholder' as StakeholderRole, company: '', piva: '', notes: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createSupabase()
    const { data, error } = await supabase.from('client_stakeholders').insert({ client_id: clientId, ...form, phone: form.phone || null, company: form.company || null, piva: form.piva || null, notes: form.notes || null }).select().single()
    setLoading(false)
    if (error) { toast.error('Errore'); return }
    toast.success('Aggiunto!')
    onCreated(data as ClientStakeholder)
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold">Aggiungi Stakeholder</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-text-secondary mb-1">Nome *</label><input value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} required className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" /></div>
            <div><label className="block text-xs text-text-secondary mb-1">Ruolo *</label>
              <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as StakeholderRole }))} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                <option value="owner">Owner</option>
                <option value="stakeholder">Stakeholder</option>
                <option value="collaboratore_esterno">Collaboratore Esterno</option>
                <option value="agenzia_supporto">Agenzia di Supporto</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-text-secondary mb-1">Email *</label><input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" /></div>
            <div><label className="block text-xs text-text-secondary mb-1">Telefono</label><input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-text-secondary mb-1">Azienda</label><input value={form.company} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" /></div>
            <div><label className="block text-xs text-text-secondary mb-1">P.IVA</label><input value={form.piva} onChange={(e) => setForm((p) => ({ ...p, piva: e.target.value }))} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" /></div>
          </div>
          <div><label className="block text-xs text-text-secondary mb-1">Note</label><textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold resize-none" /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Aggiungi
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

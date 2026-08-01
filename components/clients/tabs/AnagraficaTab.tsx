'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Trash2, Pencil, Save, X, Check, Building2, Receipt, Users2, Crown } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import {
  updateClientRecord, createClientContact, updateClientContact, deleteClientContact,
  saveClientStakeholder, deleteClientStakeholder, setClientTeam,
  type ClientPatch, type ContactInput, type StakeholderInput,
} from '@/app/actions/clients'
import {
  CLIENT_PACKAGES, CLIENT_CHANNELS, INDUSTRIES,
  CLIENT_TYPE_OPTIONS, CLIENT_LABEL_OPTIONS,
} from '@/lib/client-options'
import type { Client, ClientContact, Profile, ClientStakeholder, StakeholderRole, ClientPackage, ClientType, ClientLabel } from '@/lib/types/database'

interface Props {
  client: Client
  contacts: ClientContact[]
  teamMembers: Profile[]
  stakeholders: ClientStakeholder[]
  allProfiles?: Profile[]
  hideEconomics?: boolean
  /** Anagrafica, fiscali, contratto, stakeholder, team: solo admin nel portale admin. */
  canEdit?: boolean
  /** Referenti del cliente: anche i manager, anche dal workspace. */
  canEditContacts?: boolean
}

type Section = 'azienda' | 'fiscale'

/** Si salva solo la sezione aperta: prima partiva l'intera riga, risk score e created_at compresi. */
const SECTION_FIELDS: Record<Section, readonly (keyof ClientPatch)[]> = {
  azienda: ['display_name', 'legal_name', 'phone', 'website', 'client_type', 'client_label', 'package', 'industry', 'market_area', 'notes', 'active_channels', 'is_internal', 'sales_owner_id', 'sales_owner_name'],
  fiscale: ['piva', 'fiscal_code', 'address', 'city', 'cap', 'country', 'sdi_code', 'pec'],
}

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

const inputCls = 'w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold/60 placeholder:text-text-secondary'

function Field({ label, value, editMode, children }: { label: string; value: React.ReactNode; editMode: boolean; children: React.ReactNode }) {
  return (
    <div className={editMode ? '' : 'bg-surface rounded-lg px-3 py-2.5'}>
      <p className="text-text-secondary text-2xs uppercase tracking-wider font-semibold mb-1">{label}</p>
      {editMode ? children : <p className="text-text-primary text-sm font-medium">{value || <span className="text-text-secondary italic text-xs">Non compilato</span>}</p>}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', label }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; label?: string }) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} aria-label={label ?? placeholder} className={inputCls} />
  )
}

function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
      className={inputCls}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">{children}</section>
}

function CardHead({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
      <div className="flex items-center gap-2.5">
        {icon}
        <h3 className="text-sm font-bold text-text-primary">{title}</h3>
      </div>
      {action}
    </div>
  )
}

export function AnagraficaTab({
  client: initialClient, contacts, teamMembers, stakeholders: initialStakeholders,
  allProfiles = [], hideEconomics = false, canEdit = false, canEditContacts = false,
}: Props) {
  const [client, setClient] = useState(initialClient)
  const router = useRouter()
  const [editAzienda, setEditAzienda] = useState(false)
  const [editFiscale, setEditFiscale] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(client)

  const save = async (section: Section) => {
    const patch: ClientPatch = {}
    for (const k of SECTION_FIELDS[section]) (patch as Record<string, unknown>)[k] = form[k]

    setSaving(true)
    try {
      await updateClientRecord(client.id, patch)
      setClient((prev) => ({ ...prev, ...patch }))
      if (section === 'azienda') setEditAzienda(false)
      if (section === 'fiscale') setEditFiscale(false)
      toast.success('Modifiche salvate')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setForm(client)
    setEditAzienda(false)
    setEditFiscale(false)
  }

  const toggleChannel = (ch: string) => {
    const current = form.active_channels ?? []
    setForm((p) => ({
      ...p,
      active_channels: current.includes(ch) ? current.filter((c) => c !== ch) : [...current, ch],
    }))
  }

  const sectionIcons: Record<Section, React.ReactNode> = {
    azienda: <Building2 className="w-4 h-4 text-gold-text" />,
    fiscale: <Receipt className="w-4 h-4 text-info" />,
  }

  const SectionHeader = ({ title, section, editing }: { title: string; section: Section; editing: boolean }) => (
    <CardHead
      icon={sectionIcons[section]}
      title={title}
      action={!canEdit ? undefined : editing ? (
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
          onClick={() => { setForm(client); if (section === 'azienda') setEditAzienda(true); if (section === 'fiscale') setEditFiscale(true) }}
          className="flex items-center gap-1 text-xs text-text-secondary hover:text-gold-text transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" /> Modifica
        </button>
      )}
    />
  )

  return (
    <div className="space-y-6">

      {/* Dati Aziendali */}
      <SectionCard>
        <SectionHeader title="Dati Aziendali" section="azienda" editing={editAzienda} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* §24: nome visualizzato ≠ ragione sociale */}
          <Field label="Nome visualizzato" value={client.display_name ?? client.company_name} editMode={editAzienda}>
            <Input label="Nome visualizzato" value={form.display_name ?? form.company_name ?? ''} onChange={(v) => setForm((p) => ({ ...p, display_name: v }))} />
          </Field>
          <Field label="Ragione Sociale" value={client.legal_name} editMode={editAzienda}>
            <Input label="Ragione sociale" value={form.legal_name ?? ''} onChange={(v) => setForm((p) => ({ ...p, legal_name: v }))} placeholder="es. Seven Holding S.r.l." />
          </Field>
          <Field label="Telefono" value={client.phone} editMode={editAzienda}>
            <Input label="Telefono" value={form.phone ?? ''} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} placeholder="+39 ..." />
          </Field>
          <Field label="Sito Web" value={client.website} editMode={editAzienda}>
            <Input label="Sito web" value={form.website ?? ''} onChange={(v) => setForm((p) => ({ ...p, website: v }))} placeholder="https://..." />
          </Field>
          <Field label="Tipo Cliente" value={CLIENT_TYPE_OPTIONS.find((o) => o.value === (client.client_type ?? 'growth'))?.label} editMode={editAzienda}>
            <Select label="Tipo cliente" value={form.client_type} onChange={(v) => setForm((p) => ({ ...p, client_type: v as ClientType }))}
              options={CLIENT_TYPE_OPTIONS} />
          </Field>
          <Field label="Label" value={CLIENT_LABEL_OPTIONS.find((o) => o.value === client.client_label)?.label} editMode={editAzienda}>
            <Select label="Label" value={form.client_label} onChange={(v) => setForm((p) => ({ ...p, client_label: v as ClientLabel }))}
              options={CLIENT_LABEL_OPTIONS} />
          </Field>
          {/* §176: il pacchetto è un'etichetta commerciale, non un contratto:
              resta qui anche ora che il blocco Contratto è sparito */}
          <Field label="Pacchetto" value={client.package} editMode={editAzienda}>
            <Select label="Pacchetto" value={form.package}
              onChange={(v) => setForm((p) => ({ ...p, package: v as ClientPackage }))}
              options={CLIENT_PACKAGES.map((pk) => ({ value: pk, label: pk }))} />
          </Field>
          <Field label="Settore" value={client.industry} editMode={editAzienda}>
            <select value={form.industry ?? ''} onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value || null }))}
              aria-label="Settore" className={inputCls}>
              <option value="">— Seleziona settore —</option>
              {INDUSTRIES.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
            </select>
          </Field>
          <Field label="Area di Mercato" value={client.market_area} editMode={editAzienda}>
            <Input label="Area di mercato" value={form.market_area ?? ''} onChange={(v) => setForm((p) => ({ ...p, market_area: v }))} placeholder="es. Nord Italia, Nazionale, Europa..." />
          </Field>
          {/* §166: il commerciale si definisce qui, non riga per riga nel P&L */}
          <Field label="Commerciale"
            value={allProfiles.find((p) => p.id === client.sales_owner_id)?.full_name ?? client.sales_owner_name}
            editMode={editAzienda}>
            <div className="space-y-1.5">
              <Select label="Commerciale interno" value={form.sales_owner_id ?? ''}
                onChange={(v) => setForm((p) => ({ ...p, sales_owner_id: v || null }))}
                options={[{ value: '', label: '— esterno o non assegnato —' },
                  ...allProfiles.map((p) => ({ value: p.id, label: p.full_name }))]} />
              {!form.sales_owner_id && (
                <Input label="Commerciale esterno" value={form.sales_owner_name ?? ''}
                  onChange={(v) => setForm((p) => ({ ...p, sales_owner_name: v || null }))}
                  placeholder="Nome di chi ha portato il cliente" />
              )}
            </div>
          </Field>
          <Field label="Cliente interno" value={client.is_internal ? 'Sì — fuori dalle statistiche' : 'No'} editMode={editAzienda}>
            <label className="flex items-center gap-2 h-9 cursor-pointer">
              <input type="checkbox" checked={!!form.is_internal} onChange={(e) => setForm((p) => ({ ...p, is_internal: e.target.checked }))} className="accent-gold" />
              <span className="text-sm text-text-secondary">Escluso da statistiche commerciali</span>
            </label>
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Note Interne" value={client.notes} editMode={editAzienda}>
              <textarea value={form.notes ?? ''} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3}
                aria-label="Note interne" className={`${inputCls} resize-none`} />
            </Field>
          </div>
        </div>

        {/* Canali */}
        <div className="mt-4">
          <p className="text-text-secondary text-xs mb-2">Canali Attivi</p>
          {editAzienda ? (
            <div className="flex gap-2 flex-wrap">
              {CLIENT_CHANNELS.map((ch) => (
                <button key={ch} onClick={() => toggleChannel(ch)} aria-pressed={form.active_channels?.includes(ch)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${form.active_channels?.includes(ch) ? 'bg-gold/20 border-gold/40 text-gold-text' : 'bg-background border-border text-text-secondary hover:border-border-strong'}`}>
                  {form.active_channels?.includes(ch) && <Check className="w-3 h-3 inline mr-1" />}{ch}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {client.active_channels.length === 0
                ? <span className="text-text-secondary italic text-xs">Nessun canale attivo</span>
                : client.active_channels.map((ch) => (
                  <span key={ch} className="bg-background border border-border text-text-secondary text-xs px-2.5 py-1 rounded">{ch}</span>
                ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Dati Fiscali — nel workspace la vista li restituisce NULL: mostrarli sarebbe una bugia */}
      {!hideEconomics && (
        <SectionCard>
          <SectionHeader title="Dati Fiscali & Fatturazione Elettronica" section="fiscale" editing={editFiscale} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="P.IVA" value={client.piva} editMode={editFiscale}>
              <Input label="P.IVA" value={form.piva ?? ''} onChange={(v) => setForm((p) => ({ ...p, piva: v }))} placeholder="IT12345678901" />
            </Field>
            <Field label="Codice Fiscale" value={client.fiscal_code} editMode={editFiscale}>
              <Input label="Codice fiscale" value={form.fiscal_code ?? ''} onChange={(v) => setForm((p) => ({ ...p, fiscal_code: v }))} />
            </Field>
            <Field label="Indirizzo" value={client.address} editMode={editFiscale}>
              <Input label="Indirizzo" value={form.address ?? ''} onChange={(v) => setForm((p) => ({ ...p, address: v }))} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="CAP" value={client.cap} editMode={editFiscale}>
                <Input label="CAP" value={form.cap ?? ''} onChange={(v) => setForm((p) => ({ ...p, cap: v }))} placeholder="80100" />
              </Field>
              <Field label="Città" value={client.city} editMode={editFiscale}>
                <Input label="Città" value={form.city ?? ''} onChange={(v) => setForm((p) => ({ ...p, city: v }))} placeholder="Napoli" />
              </Field>
            </div>
            <Field label="Paese" value={client.country} editMode={editFiscale}>
              <Input label="Paese" value={form.country ?? ''} onChange={(v) => setForm((p) => ({ ...p, country: v }))} placeholder="Italia" />
            </Field>
            <Field label="Codice SDI" value={client.sdi_code} editMode={editFiscale}>
              <Input label="Codice SDI" value={form.sdi_code ?? ''} onChange={(v) => setForm((p) => ({ ...p, sdi_code: v }))} placeholder="XXXXXXX" />
            </Field>
            <Field label="PEC" value={client.pec} editMode={editFiscale}>
              <Input label="PEC" value={form.pec ?? ''} onChange={(v) => setForm((p) => ({ ...p, pec: v }))} placeholder="nome@pec.it" type="email" />
            </Field>
          </div>
          {!editFiscale && !client.piva && (
            <p className="text-xs text-text-secondary mt-3 italic">Dati fiscali non ancora inseriti — necessari per integrazione Aruba</p>
          )}
        </SectionCard>
      )}

      <ContactsSection clientId={client.id} initial={contacts} canEdit={canEditContacts} />

      <StakeholdersSection clientId={client.id} initial={initialStakeholders} canEdit={canEdit} />

      <TeamSection clientId={client.id} members={teamMembers} allProfiles={allProfiles} canEdit={canEdit} />
    </div>
  )
}

// ── Referenti del cliente ────────────────────────────────────────────────────

type ContactForm = { full_name: string; email: string; phone: string; role: string; is_primary: boolean }
const emptyContact: ContactForm = { full_name: '', email: '', phone: '', role: '', is_primary: false }

function ContactsSection({ clientId, initial, canEdit }: { clientId: string; initial: ClientContact[]; canEdit: boolean }) {
  const router = useRouter()
  const [list, setList] = useState(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<ContactForm>(emptyContact)
  const [pending, start] = useTransition()

  const openNew = () => { setEditingId(null); setForm(emptyContact); setAdding(true) }
  const openEdit = (c: ClientContact) => {
    setAdding(false)
    setEditingId(c.id)
    setForm({ full_name: c.full_name, email: c.email, phone: c.phone ?? '', role: c.role ?? '', is_primary: c.is_primary })
  }
  const close = () => { setAdding(false); setEditingId(null); setForm(emptyContact) }

  const submit = () => start(async () => {
    const input: ContactInput = { ...form }
    try {
      if (editingId) {
        const saved = await updateClientContact(editingId, clientId, input)
        setList((prev) => prev.map((c) => c.id === saved.id ? saved : form.is_primary ? { ...c, is_primary: c.id === saved.id } : c))
        toast.success('Referente aggiornato')
      } else {
        const saved = await createClientContact(clientId, input)
        setList((prev) => [...(form.is_primary ? prev.map((c) => ({ ...c, is_primary: false })) : prev), saved])
        toast.success('Referente aggiunto')
      }
      close()
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const remove = (c: ClientContact) => start(async () => {
    try {
      await deleteClientContact(c.id, clientId)
      setList((prev) => prev.filter((x) => x.id !== c.id))
      toast.success('Referente rimosso')
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  return (
    <SectionCard>
      <CardHead icon={<Users2 className="w-4 h-4 text-success" />} title="Referenti Cliente"
        action={canEdit && !adding ? (
          <button onClick={openNew} className="flex items-center gap-1 text-xs text-gold-text hover:underline">
            <Plus className="w-3.5 h-3.5" /> Aggiungi
          </button>
        ) : undefined} />

      {adding && (
        <div className="mb-3">
          <ContactFields form={form} setForm={setForm} onCancel={close} onSave={submit} pending={pending} title="Nuovo referente" />
        </div>
      )}

      {list.length === 0 && !adding ? (
        <p className="text-text-secondary text-sm">Nessun referente inserito</p>
      ) : (
        <div className="space-y-3">
          {list.map((c) => editingId === c.id ? (
            <ContactFields key={c.id} form={form} setForm={setForm} onCancel={close} onSave={submit} pending={pending} title={`Modifica ${c.full_name}`} />
          ) : (
            <div key={c.id} className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold-text text-xs font-bold shrink-0">
                  {getInitials(c.full_name)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-text-primary truncate">{c.full_name}</p>
                    {c.is_primary && <span className="text-xs bg-gold/20 text-gold-text px-1.5 py-0.5 rounded shrink-0">Principale</span>}
                  </div>
                  {c.role && <p className="text-xs text-text-secondary">{c.role}</p>}
                  <div className="flex gap-3 mt-0.5 text-xs text-text-secondary flex-wrap">
                    <a href={`mailto:${c.email}`} className="hover:text-gold-text transition-colors">{c.email}</a>
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openEdit(c)} aria-label={`Modifica ${c.full_name}`}
                    className="text-text-secondary hover:text-gold-text transition-colors"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(c)} disabled={pending} aria-label={`Rimuovi ${c.full_name}`}
                    className="text-text-secondary hover:text-error transition-colors disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function ContactFields({ form, setForm, onCancel, onSave, pending, title }: {
  form: ContactForm; setForm: (f: ContactForm) => void
  onCancel: () => void; onSave: () => void; pending: boolean; title: string
}) {
  const ok = form.full_name.trim() && form.email.trim()
  return (
    <div className="bg-background border border-border rounded-xl p-4 space-y-3">
      <p className="text-2xs font-semibold text-text-secondary uppercase tracking-wider">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input label="Nome referente" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} placeholder="Nome e cognome *" />
        <Input label="Email referente" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="email@azienda.it *" />
        <Input label="Telefono referente" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="Telefono" />
        <Input label="Ruolo referente" value={form.role} onChange={(v) => setForm({ ...form, role: v })} placeholder="Ruolo in azienda" />
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} className="accent-gold" />
          Referente principale
        </label>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors">
            <X className="w-3.5 h-3.5" /> Annulla
          </button>
          <button onClick={onSave} disabled={pending || !ok}
            className="flex items-center gap-1.5 text-xs bg-gold text-on-gold px-3 py-1 rounded-lg font-semibold hover:bg-gold/90 transition-colors disabled:opacity-50">
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Salva
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Owner, stakeholder e collaboratori ───────────────────────────────────────

type StakeForm = { full_name: string; email: string; phone: string; role: StakeholderRole; company: string; piva: string; notes: string }
const emptyStake: StakeForm = { full_name: '', email: '', phone: '', role: 'stakeholder', company: '', piva: '', notes: '' }

function StakeholdersSection({ clientId, initial, canEdit }: { clientId: string; initial: ClientStakeholder[]; canEdit: boolean }) {
  const router = useRouter()
  const [list, setList] = useState(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<StakeForm>(emptyStake)
  const [pending, start] = useTransition()

  const openNew = () => { setEditingId(null); setForm(emptyStake); setAdding(true) }
  const openEdit = (s: ClientStakeholder) => {
    setAdding(false)
    setEditingId(s.id)
    setForm({
      full_name: s.full_name, email: s.email, phone: s.phone ?? '', role: s.role,
      company: s.company ?? '', piva: s.piva ?? '', notes: s.notes ?? '',
    })
  }
  const close = () => { setAdding(false); setEditingId(null); setForm(emptyStake) }

  const submit = () => start(async () => {
    const input: StakeholderInput = { ...form }
    try {
      const saved = await saveClientStakeholder(clientId, input, editingId ?? undefined)
      setList((prev) => editingId ? prev.map((s) => s.id === saved.id ? saved : s) : [...prev, saved])
      toast.success(editingId ? 'Aggiornato' : 'Aggiunto')
      close()
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const remove = (s: ClientStakeholder) => start(async () => {
    try {
      await deleteClientStakeholder(s.id, clientId)
      setList((prev) => prev.filter((x) => x.id !== s.id))
      toast.success('Rimosso')
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  return (
    <SectionCard>
      <CardHead icon={<Crown className="w-4 h-4 text-warning" />} title="Owner, Stakeholder & Collaboratori"
        action={canEdit && !adding ? (
          <button onClick={openNew} className="flex items-center gap-1 text-xs text-gold-text hover:underline">
            <Plus className="w-3.5 h-3.5" /> Aggiungi
          </button>
        ) : undefined} />

      {adding && (
        <div className="mb-3">
          <StakeFields form={form} setForm={setForm} onCancel={close} onSave={submit} pending={pending} title="Nuovo stakeholder" />
        </div>
      )}

      {list.length === 0 && !adding ? (
        <p className="text-text-secondary text-sm">Nessuno stakeholder inserito</p>
      ) : (
        <div className="space-y-3">
          {list.map((s) => editingId === s.id ? (
            <StakeFields key={s.id} form={form} setForm={setForm} onCancel={close} onSave={submit} pending={pending} title={`Modifica ${s.full_name}`} />
          ) : (
            <div key={s.id} className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent text-xs font-bold shrink-0">
                  {getInitials(s.full_name)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-text-primary">{s.full_name}</p>
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${roleBadge[s.role]}`}>{roleLabel[s.role]}</span>
                  </div>
                  {s.company && <p className="text-xs text-text-secondary">{s.company}{s.piva ? ` · P.IVA ${s.piva}` : ''}</p>}
                  <div className="flex gap-3 mt-0.5 text-xs text-text-secondary flex-wrap">
                    <a href={`mailto:${s.email}`} className="hover:text-gold-text transition-colors">{s.email}</a>
                    {s.phone && <span>{s.phone}</span>}
                  </div>
                  {s.notes && <p className="text-xs text-text-secondary mt-0.5 italic">{s.notes}</p>}
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openEdit(s)} aria-label={`Modifica ${s.full_name}`}
                    className="text-text-secondary hover:text-gold-text transition-colors"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(s)} disabled={pending} aria-label={`Rimuovi ${s.full_name}`}
                    className="text-text-secondary hover:text-error transition-colors disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function StakeFields({ form, setForm, onCancel, onSave, pending, title }: {
  form: StakeForm; setForm: (f: StakeForm) => void
  onCancel: () => void; onSave: () => void; pending: boolean; title: string
}) {
  const ok = form.full_name.trim() && form.email.trim()
  return (
    <div className="bg-background border border-border rounded-xl p-4 space-y-3">
      <p className="text-2xs font-semibold text-text-secondary uppercase tracking-wider">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input label="Nome stakeholder" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} placeholder="Nome e cognome *" />
        <Select label="Ruolo stakeholder" value={form.role} onChange={(v) => setForm({ ...form, role: v as StakeholderRole })}
          options={(Object.keys(roleLabel) as StakeholderRole[]).map((r) => ({ value: r, label: roleLabel[r] }))} />
        <Input label="Email stakeholder" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="email@azienda.it *" />
        <Input label="Telefono stakeholder" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="Telefono" />
        <Input label="Azienda stakeholder" value={form.company} onChange={(v) => setForm({ ...form, company: v })} placeholder="Azienda" />
        <Input label="P.IVA stakeholder" value={form.piva} onChange={(v) => setForm({ ...form, piva: v })} placeholder="P.IVA" />
      </div>
      <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
        aria-label="Note stakeholder" placeholder="Note" className={`${inputCls} resize-none`} />
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors">
          <X className="w-3.5 h-3.5" /> Annulla
        </button>
        <button onClick={onSave} disabled={pending || !ok}
          className="flex items-center gap-1.5 text-xs bg-gold text-on-gold px-3 py-1 rounded-lg font-semibold hover:bg-gold/90 transition-colors disabled:opacity-50">
          {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Salva
        </button>
      </div>
    </div>
  )
}

// ── Team TWO BEE assegnato ───────────────────────────────────────────────────

function TeamSection({ clientId, members, allProfiles, canEdit }: {
  clientId: string; members: Profile[]; allProfiles: Profile[]; canEdit: boolean
}) {
  const router = useRouter()
  const [ids, setIds] = useState<string[]>(members.map((m) => m.id))
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()

  const staff = allProfiles.filter((p) => (p.role === 'admin' || p.role === 'team') && p.is_active !== false)
  const byId = new Map<string, Profile>([...staff, ...members].map((p) => [p.id, p]))
  const selected = ids.map((id) => byId.get(id)).filter(Boolean) as Profile[]

  const save = () => start(async () => {
    try {
      await setClientTeam(clientId, ids)
      toast.success('Team aggiornato')
      setEditing(false)
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  return (
    <SectionCard>
      <CardHead icon={<Users2 className="w-4 h-4 text-gold-text" />} title="Team TWO BEE Assegnato"
        action={!canEdit ? undefined : editing ? (
          <div className="flex items-center gap-2">
            <button onClick={() => { setIds(members.map((m) => m.id)); setEditing(false) }}
              className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors">
              <X className="w-3.5 h-3.5" /> Annulla
            </button>
            <button onClick={save} disabled={pending}
              className="flex items-center gap-1.5 text-xs bg-gold text-on-gold px-3 py-1 rounded-lg font-semibold hover:bg-gold/90 transition-colors disabled:opacity-50">
              {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Salva
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-text-secondary hover:text-gold-text transition-colors">
            <Pencil className="w-3.5 h-3.5" /> Modifica
          </button>
        )} />

      {editing ? (
        <>
          <p className="text-xs text-text-secondary mb-2">L&apos;assegnazione decide anche chi vede questo cliente nei portali.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
            {staff.map((p) => {
              const on = ids.includes(p.id)
              return (
                <button key={p.id} onClick={() => setIds((prev) => on ? prev.filter((x) => x !== p.id) : [...prev, p.id])}
                  aria-pressed={on}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors ${on ? 'bg-gold/20 border-gold/40' : 'bg-background border-border hover:border-border-strong'}`}>
                  <span className="w-7 h-7 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold-text text-2xs font-bold shrink-0">
                    {getInitials(p.full_name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm text-text-primary truncate">{p.full_name}</span>
                    <span className="block text-2xs text-text-secondary capitalize truncate">{p.app_role ?? p.role}</span>
                  </span>
                  {on && <Check className="w-3.5 h-3.5 text-gold-text ml-auto shrink-0" />}
                </button>
              )
            })}
          </div>
        </>
      ) : selected.length === 0 ? (
        <p className="text-text-secondary text-sm">Nessun membro assegnato</p>
      ) : (
        <div className="flex gap-3 flex-wrap">
          {selected.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold-text text-xs font-bold">
                {getInitials(m.full_name)}
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{m.full_name}</p>
                <p className="text-xs text-text-secondary capitalize">{m.app_role ?? m.role}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

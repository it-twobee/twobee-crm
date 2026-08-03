'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Building2, ChevronDown, Plus, Trash2, Target, Landmark } from 'lucide-react'
import { createClientRecord } from '@/app/actions/clients'
import { ModalShell, Group, Field, Segmented, inputCls } from '@/components/shared/formkit'
import { CLIENT_CHANNELS, INDUSTRIES, INDUSTRY_BENCHMARKS,
  CLIENT_TYPE_OPTIONS, CLIENT_LABEL_OPTIONS, PAYMENT_STATUS_OPTIONS,
  hasGrowth,
} from '@/lib/client-options'
import type { Client, ClientType, ClientLabel, PaymentStatus } from '@/lib/types/database'

type Contact = { full_name: string; email: string; phone: string; role: string; is_primary: boolean }

const iso = (d: Date) => d.toISOString().slice(0, 10)
const num = (v: string) => (v.trim() ? Number(v) : null)

export function NewClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (client: Client) => void }) {
  const [pending, start] = useTransition()

  const [name, setName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [type, setType] = useState<ClientType>('growth')
  const [label, setLabel] = useState<ClientLabel>('stabile')
  const [isInternal, setIsInternal] = useState(false)
  const [industry, setIndustry] = useState('')
  const [marketArea, setMarketArea] = useState('')
  const [channels, setChannels] = useState<string[]>([])
  const [notes, setNotes] = useState('')

  const [adBudget, setAdBudget] = useState('')

  const [tRoas, setTRoas] = useState('')
  const [tCtr, setTCtr] = useState('')
  const [tCpa, setTCpa] = useState('')
  const [tConv, setTConv] = useState('')
  const [tLeads, setTLeads] = useState('')
  const [tRevenue, setTRevenue] = useState('')
  const [tFollowers, setTFollowers] = useState('')
  const [goalsNotes, setGoalsNotes] = useState('')

  const [contacts, setContacts] = useState<Contact[]>([])

  const benchmark = INDUSTRY_BENCHMARKS[industry]
  const applyBenchmark = () => {
    if (!benchmark) return
    setTRoas(String(benchmark.roas)); setTCtr(String(benchmark.ctr))
    setTCpa(String(benchmark.cpa)); setTConv(String(benchmark.conv_rate))
    toast.success('Benchmark di settore applicato')
  }

  const toggleChannel = (ch: string) =>
    setChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch])

  const patchContact = (i: number, patch: Partial<Contact>) =>
    setContacts(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c))

  const submit = () => start(async () => {
    try {
      const client = await createClientRecord({
        display_name: name, legal_name: legalName, client_type: type, client_label: label,
        is_internal: isInternal, industry, market_area: marketArea,
        active_channels: channels, notes,
        ad_budget_monthly: num(adBudget),
        // colonne NOT NULL a DB, ma non più decisioni dell'utente: le riscrive
        // il primo contratto venduto (§169). L'avvio è oggi, che è vero: da
        // oggi il cliente esiste nei conti.
        mrr: 0, contract_start: iso(new Date()), contract_end: null, payment_status: 'in_attesa',
        target_roas: num(tRoas), target_ctr: num(tCtr), target_cpa: num(tCpa),
        target_conv_rate: num(tConv), target_leads_monthly: num(tLeads),
        target_revenue_monthly: num(tRevenue), target_followers_monthly: num(tFollowers),
        goals_notes: goalsNotes, contacts,
      })
      toast.success(`«${name.trim()}» in anagrafica`)
      onCreated(client)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  return (
    <ModalShell title="Nuova anagrafica" hint={name.trim() || 'Chi stiamo aggiungendo?'}
      icon={<Building2 className="w-4 h-4 text-gold-text" />}
      onClose={onClose} onSubmit={submit} pending={pending} canSubmit={!!name.trim()} submitLabel="Crea cliente">

      <Field label="Nome" hint="come lo chiamiamo in TWO BEE">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input value={name} onChange={e => setName(e.target.value)} autoFocus className={inputCls} placeholder="es. Seven" />
      </Field>

      <Field label="Ragione sociale" hint="fatture e documenti fiscali">
        <input value={legalName} onChange={e => setLegalName(e.target.value)} className={inputCls} placeholder="es. Seven Holding S.r.l." />
      </Field>

      <Field label="Tipo di cliente">
        <Segmented ariaLabel="Tipo di cliente" value={type} onChange={setType} options={CLIENT_TYPE_OPTIONS} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Label">
          <select value={label} onChange={e => setLabel(e.target.value as ClientLabel)} className={inputCls} aria-label="Label">
            {CLIENT_LABEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Settore">
          <select value={industry} onChange={e => setIndustry(e.target.value)} className={inputCls} aria-label="Settore">
            <option value="">— nessuno —</option>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Area geografica">
        <input value={marketArea} onChange={e => setMarketArea(e.target.value)} className={inputCls} placeholder="es. Napoli, Campania, Italia" />
      </Field>

      <button type="button" onClick={() => setIsInternal(v => !v)} aria-pressed={isInternal}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${
          isInternal ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'
        }`}>
        <Landmark className={`w-4 h-4 shrink-0 ${isInternal ? 'text-gold-text' : 'text-text-tertiary'}`} />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-text-primary">Cliente interno</span>
          <span className="block text-2xs text-text-tertiary">Fuori dalle statistiche commerciali (TwoBee, scambi merce)</span>
        </span>
      </button>

      <Group label="Canali attivi">
        <div className="flex flex-wrap gap-1.5">
          {CLIENT_CHANNELS.map(ch => {
            const on = channels.includes(ch)
            return (
              <button key={ch} type="button" onClick={() => toggleChannel(ch)} aria-pressed={on}
                className={`text-2xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  on ? 'border-gold bg-gold-dim text-gold-text font-semibold' : 'border-border text-text-secondary hover:bg-surface-hover'
                }`}>{ch}</button>
            )
          })}
        </div>
      </Group>

      <Field label="Note interne">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Contesto, storia, avvertenze…" />
      </Field>

      <Disclosure title="Inquadramento" hint="budget pubblicitario" defaultOpen>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Budget ADV (€/mese)" hint="speso dal cliente, non da noi">
            <input type="number" value={adBudget} onChange={e => setAdBudget(e.target.value)} className={inputCls} placeholder="2000" />
          </Field>
        </div>
        {/* §176: quota, durata e rate si decidono nel progetto, dove esiste un
            accordo vero. Chiederle qui produceva numeri che nessun contratto
            sosteneva, e che poi smentivano l'economics. */}
        <p className="text-2xs text-text-tertiary mt-2">
          Niente MRR né date qui: l&apos;accordo economico si scrive quando crei il progetto — quota, durata,
          rate ed eventuale subappalto. Da lì tornano indietro MRR, periodo contrattuale e stato pagamenti.
        </p>
      </Disclosure>

      <Disclosure title="Obiettivi" hint="target concordati, anche dopo">
        {benchmark && (
          <div className="rounded-xl border border-gold bg-gold-dim p-3">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-gold-text" />
              <p className="text-2xs font-semibold text-gold-text">Benchmark {industry}</p>
            </div>
            <p className="text-2xs text-text-secondary mb-2">
              ROAS {benchmark.roas}× · CTR {benchmark.ctr}% · CPA €{benchmark.cpa} · Conv. {benchmark.conv_rate}%
            </p>
            <button type="button" onClick={applyBenchmark} className="text-2xs font-semibold text-gold-text underline">
              Applica al cliente
            </button>
          </div>
        )}

        {hasGrowth(type) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ROAS target"><input type="number" step="0.1" value={tRoas} onChange={e => setTRoas(e.target.value)} className={inputCls} placeholder="4.0" /></Field>
            <Field label="CTR target (%)"><input type="number" step="0.1" value={tCtr} onChange={e => setTCtr(e.target.value)} className={inputCls} placeholder="2.0" /></Field>
            <Field label="CPA target (€)"><input type="number" value={tCpa} onChange={e => setTCpa(e.target.value)} className={inputCls} placeholder="30" /></Field>
            <Field label="Conv. rate target (%)"><input type="number" step="0.1" value={tConv} onChange={e => setTConv(e.target.value)} className={inputCls} placeholder="2.5" /></Field>
            <Field label="Follower/mese"><input type="number" value={tFollowers} onChange={e => setTFollowers(e.target.value)} className={inputCls} placeholder="500" /></Field>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Lead/mese target"><input type="number" value={tLeads} onChange={e => setTLeads(e.target.value)} className={inputCls} placeholder="50" /></Field>
          <Field label="Revenue/mese target (€)"><input type="number" value={tRevenue} onChange={e => setTRevenue(e.target.value)} className={inputCls} placeholder="15000" /></Field>
        </div>

        <Field label="Note sugli obiettivi">
          <textarea value={goalsNotes} onChange={e => setGoalsNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`}
            placeholder="KPI particolari, stagionalità, vincoli di budget…" />
        </Field>
      </Disclosure>

      <Disclosure title="Referenti" hint={contacts.length ? `${contacts.length} da creare` : 'puoi aggiungerli dopo'}>
        {contacts.map((c, i) => (
          <div key={i} className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-semibold text-text-secondary">Referente {i + 1}</span>
              <button type="button" aria-label={`Rimuovi referente ${i + 1}`}
                onClick={() => setContacts(prev => prev.filter((_, idx) => idx !== i))}
                className="text-text-tertiary hover:text-error transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={c.full_name} onChange={e => patchContact(i, { full_name: e.target.value })} className={inputCls} placeholder="Nome e cognome" aria-label="Nome referente" />
              <input type="email" value={c.email} onChange={e => patchContact(i, { email: e.target.value })} className={inputCls} placeholder="email@azienda.it" aria-label="Email referente" />
              <input value={c.phone} onChange={e => patchContact(i, { phone: e.target.value })} className={inputCls} placeholder="Telefono" aria-label="Telefono referente" />
              <input value={c.role} onChange={e => patchContact(i, { role: e.target.value })} className={inputCls} placeholder="Ruolo" aria-label="Ruolo referente" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={c.is_primary} onChange={e => patchContact(i, { is_primary: e.target.checked })} />
              <span className="text-2xs text-text-secondary">Referente principale</span>
            </label>
          </div>
        ))}
        <button type="button"
          onClick={() => setContacts(prev => [...prev, { full_name: '', email: '', phone: '', role: '', is_primary: prev.length === 0 }])}
          className="flex items-center gap-1.5 text-2xs font-semibold text-gold-text">
          <Plus className="w-3.5 h-3.5" />Aggiungi referente
        </button>
        <p className="text-2xs text-text-tertiary">Nome ed email servono entrambi: le righe incomplete non vengono salvate.</p>
      </Disclosure>
    </ModalShell>
  )
}

function Disclosure({ title, hint, defaultOpen, children }: {
  title: string; hint?: string; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors">
        <ChevronDown className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-text-primary">{title}</span>
          {hint && <span className="block text-2xs text-text-tertiary truncate">{hint}</span>}
        </span>
      </button>
      {open && <div className="px-3 pb-3 pt-1 space-y-3">{children}</div>}
    </div>
  )
}

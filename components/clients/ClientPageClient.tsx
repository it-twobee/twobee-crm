'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, Edit3, Check, X, ChevronDown, Loader2 } from 'lucide-react'
import { formatCurrency, formatDate, getPaymentBadge } from '@/lib/utils'
import type { Client, ClientContact, Project, Sprint, Task, MeetingNote, ClientKpi, Profile, Invoice, ClientStakeholder, Document, ClientInteraction } from '@/lib/types/database'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { ProjectStatusTab } from './tabs/ProjectStatusTab'
import { KpiTab } from './tabs/KpiTab'
import { AnagraficaTab } from './tabs/AnagraficaTab'
import { FatturazioneTab } from './tabs/FatturazioneTab'
import { DocumentsTab } from './tabs/DocumentsTab'
import { PanoramicaTab } from './tabs/PanoramicaTab'
import { RelazioneTab } from './tabs/RelazioneTab'
import { ClientAlertBanner } from './ClientAlertBanner'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface Props {
  client: Client
  contacts: ClientContact[]
  projects: Project[]
  sprints: Sprint[]
  tasks: Task[]
  meetings: MeetingNote[]
  kpis: ClientKpi[]
  kpiConfigs: import('@/lib/types/database').ClientKpiConfig[]
  teamMembers: Profile[]
  stakeholders: ClientStakeholder[]
  invoices: Invoice[]
  documents: Document[]
  interactions: ClientInteraction[]
  currentProfile: Profile
  allProfiles: Profile[]
  openTickets: number
  initialTab?: number
}

const labelBadge: Record<string, string> = {
  stabile: 'border-success/30 text-success bg-success/10',
  in_bilico: 'border-warning/30 text-warning bg-warning/10',
  perso: 'border-error/30 text-error bg-error/10',
  partner: 'border-gold/30 text-gold bg-gold/10',
}
const labelOptions = ['stabile', 'in_bilico', 'perso', 'partner']
const packageOptions = ['Start', 'Growth', 'Pro', 'Enterprise', 'Custom'] as const

// Inline text field that turns into an <input> on click
function InlineTextField({ value, field, clientId, canEdit, className = '' }: {
  value: string; field: string; clientId: string; canEdit: boolean; className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const save = async () => {
    if (val === value) { setEditing(false); return }
    setSaving(true)
    const sb = createBrowserClient()
    const { error } = await sb.from('clients').update({ [field]: val }).eq('id', clientId)
    setSaving(false)
    if (error) { toast.error('Errore nel salvataggio'); setVal(value) }
    else toast.success('Aggiornato')
    setEditing(false)
  }

  if (!canEdit) return <span className={className}>{value}</span>

  if (editing) return (
    <span className="inline-flex items-center gap-1">
      <input ref={ref} autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(value); setEditing(false) } }}
        className={`bg-[#1A1A1A] border border-gold/40 rounded px-2 py-0.5 outline-none text-white ${className}`}
        style={{ minWidth: '120px', width: `${Math.max(val.length + 2, 10)}ch` }} />
      {saving
        ? <Loader2 className="w-3 h-3 text-gold animate-spin" />
        : <>
          <button onClick={save}><Check className="w-3 h-3 text-success" /></button>
          <button onClick={() => { setVal(value); setEditing(false) }}><X className="w-3 h-3 text-error" /></button>
        </>}
    </span>
  )

  return (
    <span className={`group/inline cursor-pointer hover:text-white transition-colors inline-flex items-center gap-1 ${className}`}
      onClick={() => setEditing(true)}>
      {val}
      <Edit3 className="w-2.5 h-2.5 opacity-0 group-hover/inline:opacity-60 shrink-0" />
    </span>
  )
}

// Inline select/badge that opens a dropdown on click
function InlineBadgeSelect({ value, options, field, clientId, canEdit, badgeClass, labelFn }: {
  value: string; options: string[]; field: string; clientId: string; canEdit: boolean;
  badgeClass: (v: string) => string; labelFn?: (v: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [current, setCurrent] = useState(value)

  const select = async (v: string) => {
    setOpen(false)
    if (v === current) return
    setSaving(true)
    const sb = createBrowserClient()
    const { error } = await sb.from('clients').update({ [field]: v }).eq('id', clientId)
    if (error) { toast.error('Errore nel salvataggio'); setSaving(false); return }
    // Auto-archivia tutti i canali del cliente quando diventa "perso"
    if (field === 'client_label' && v === 'perso') {
      await sb.from('chat_channels')
        .update({ is_archived: true, is_read_only: true })
        .eq('client_id', clientId)
    }
    // Riattiva se il cliente non è più perso
    if (field === 'client_label' && v !== 'perso' && current === 'perso') {
      await sb.from('chat_channels')
        .update({ is_archived: false, is_read_only: false })
        .eq('client_id', clientId)
    }
    setSaving(false)
    setCurrent(v)
    toast.success(v === 'perso' ? 'Cliente perso — chat archiviata' : 'Aggiornato')
  }

  const label = labelFn ? labelFn(current) : current.replace('_', ' ')

  return (
    <div className="relative inline-block">
      <button onClick={() => canEdit && setOpen(o => !o)}
        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border capitalize transition-colors ${badgeClass(current)} ${canEdit ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}>
        {saving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : label}
        {canEdit && <ChevronDown className="w-2.5 h-2.5 opacity-60" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg shadow-xl z-20 min-w-[120px] overflow-hidden">
            {options.map(opt => (
              <button key={opt} onClick={() => select(opt)}
                className={`w-full text-left px-3 py-2 text-xs capitalize hover:bg-[#2A2A2A] transition-colors ${opt === current ? 'text-gold font-bold' : 'text-white'}`}>
                {labelFn ? labelFn(opt) : opt.replace('_', ' ')}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Inline number field (MRR)
function InlineNumberField({ value, field, clientId, canEdit, prefix = '', suffix = '' }: {
  value: number; field: string; clientId: string; canEdit: boolean; prefix?: string; suffix?: string
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const num = parseFloat(val)
    if (isNaN(num) || num === value) { setEditing(false); return }
    setSaving(true)
    const sb = createBrowserClient()
    const { error } = await sb.from('clients').update({ [field]: num }).eq('id', clientId)
    setSaving(false)
    if (error) { toast.error('Errore'); setVal(String(value)) }
    else toast.success('MRR aggiornato')
    setEditing(false)
  }

  if (!canEdit) return <span className="text-gold font-black">{prefix}{formatCurrency(value)}{suffix}</span>

  if (editing) return (
    <span className="inline-flex items-center gap-1">
      <span className="text-gold font-black">{prefix}€</span>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)} type="number"
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(String(value)); setEditing(false) } }}
        className="bg-[#1A1A1A] border border-gold/40 rounded px-2 py-0.5 outline-none text-gold font-black w-24" />
      {saving
        ? <Loader2 className="w-3 h-3 text-gold animate-spin" />
        : <>
          <button onClick={save}><Check className="w-3 h-3 text-success" /></button>
          <button onClick={() => { setVal(String(value)); setEditing(false) }}><X className="w-3 h-3 text-error" /></button>
        </>}
    </span>
  )

  return (
    <span className="group/inline cursor-pointer inline-flex items-center gap-1" onClick={() => setEditing(true)}>
      <span className="text-gold font-black hover:text-yellow-400 transition-colors">{prefix}{formatCurrency(value)}{suffix}</span>
      <Edit3 className="w-2.5 h-2.5 text-gold opacity-0 group-hover/inline:opacity-60 shrink-0" />
    </span>
  )
}

export function ClientPageClient({
  client, contacts, projects, sprints, tasks, meetings, kpis, kpiConfigs,
  teamMembers, stakeholders, invoices, documents, interactions, currentProfile, allProfiles,
  openTickets, initialTab
}: Props) {
  const isAdmin = SUPER_ADMIN_EMAILS.includes(currentProfile?.email ?? '') || currentProfile?.app_role === 'admin'
  const isAdminLevel = isAdmin || currentProfile?.app_role === 'manager'
  const canSeeFatturazione = isAdminLevel
  const canSeeAnagrafica = isAdminLevel || currentProfile?.app_role === 'senior'
  const canSeeMrr = isAdminLevel

  const visibleTabs = [
    { label: 'Panoramica', index: 0 },
    { label: 'KPI & Performance', index: 1 },
    ...(canSeeFatturazione ? [{ label: 'Fatturazione', index: 2 }] : []),
    { label: 'Documenti', index: 3 },
    ...(canSeeAnagrafica ? [{ label: 'Anagrafica', index: 4 }] : []),
    ...(isAdminLevel ? [{ label: 'Relazione', index: 5 }] : []),
  ]

  const [activeTab, setActiveTab] = useState(initialTab ?? 0)

  return (
    <div className="flex flex-col h-full">
      {/* Back */}
      <div className="px-6 pt-5 pb-3">
        <Link href="/clienti" className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" /> Tutti i clienti
        </Link>
      </div>

      {/* Alert banner contestuale */}
      <ClientAlertBanner client={client} invoices={invoices} />

      {/* Header cliente — tutto editabile per admin */}
      <div className="px-6 pb-5 border-b border-[#2A2A2A]">
        <div className="flex items-start gap-4 flex-wrap">
          {/* Avatar azienda */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/20 flex items-center justify-center text-xl font-black text-gold shrink-0">
            {client.company_name[0].toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            {/* Nome azienda + badges status */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h1 className="text-2xl font-black text-white">
                <InlineTextField value={client.company_name} field="company_name" clientId={client.id}
                  canEdit={isAdmin} className="text-2xl font-black text-white" />
              </h1>
              <InlineBadgeSelect value={client.client_type ?? 'growth'} options={['growth','digital','growth_digital']} field="client_type"
                clientId={client.id} canEdit={isAdmin}
                labelFn={v => v === 'growth_digital' ? 'Growth + Digital' : v}
                badgeClass={v =>
                  v === 'growth'         ? 'bg-gold/15 text-gold border-gold/30' :
                  v === 'growth_digital' ? 'bg-purple-500/15 text-purple-400 border-purple-400/30' :
                                           'bg-blue-500/15 text-blue-400 border-blue-400/30'
                } />
              <InlineBadgeSelect value={client.client_label ?? 'stabile'} options={labelOptions} field="client_label"
                clientId={client.id} canEdit={isAdmin}
                badgeClass={v => labelBadge[v] ?? 'border-[#2A2A2A] text-text-secondary bg-transparent'} />
            </div>

            {/* Info riga */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {/* Pacchetto */}
              <InlineBadgeSelect value={client.package} options={[...packageOptions]} field="package"
                clientId={client.id} canEdit={isAdmin}
                badgeClass={() => 'bg-gold/20 text-gold border-gold/30'} />

              {/* MRR */}
              {canSeeMrr && (
                <InlineNumberField value={client.mrr} field="mrr" clientId={client.id} canEdit={isAdmin} suffix="/mese" />
              )}

              {/* Date contratto */}
              <span className="text-text-secondary text-xs">
                {formatDate(client.contract_start)} → {formatDate(client.contract_end)}
              </span>

              {/* Payment status */}
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getPaymentBadge(client.payment_status)}`}>
                {client.payment_status === 'in_attesa' ? 'Attesa pagamento' : client.payment_status === 'pagato' ? 'Pagato' : 'Scaduto'}
              </span>
            </div>

            {/* Canali attivi */}
            {client.active_channels.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {client.active_channels.map((ch) => (
                  <span key={ch} className="text-xs bg-background border border-[#2A2A2A] px-2 py-0.5 rounded text-text-secondary">{ch}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-[#2A2A2A] px-6 overflow-x-auto">
        {visibleTabs.map(({ label, index }) => (
          <button key={label} onClick={() => setActiveTab(index)}
            className={`px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === index ? 'border-gold text-gold' : 'border-transparent text-text-secondary hover:text-white'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 0 && (
          <PanoramicaTab client={client} tasks={tasks} invoices={invoices} kpis={kpis} projects={projects}
            sprints={sprints} meetings={meetings} allProfiles={allProfiles}
            teamMembers={teamMembers} interactions={interactions} isAdmin={isAdmin} openTickets={openTickets}
            onTabChange={setActiveTab} />
        )}
        {activeTab === 1 && <KpiTab client={client} kpis={kpis} kpiConfigs={kpiConfigs} projects={projects} />}
        {activeTab === 2 && <FatturazioneTab client={client} invoices={invoices} />}
        {activeTab === 3 && <DocumentsTab client={client} documents={documents} />}
        {activeTab === 4 && (
          <AnagraficaTab client={client} contacts={contacts} teamMembers={teamMembers} stakeholders={stakeholders} />
        )}
        {activeTab === 5 && (
          <RelazioneTab clientId={client.id} client={client} interactions={interactions} allProfiles={allProfiles}
            currentProfile={currentProfile} isAdmin={isAdmin} />
        )}

      </div>
    </div>
  )
}

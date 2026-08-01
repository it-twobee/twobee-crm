'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, Edit3, Check, X, ChevronDown, Loader2 } from 'lucide-react'
import { formatCurrency, formatDate, getPaymentBadge } from '@/lib/utils'
import type { Client, ClientContact, ClientKpi, Profile, ClientStakeholder, ClientInteraction, ClientLabel } from '@/lib/types/database'
import { setClientLabel } from '@/app/actions/clients'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { clientName } from '@/lib/utils'
import { mrrOrigin, economicsHref, CONTRACT_PERIOD_HINT, PAYMENT_STATUS_HINT } from '@/lib/economics-source'
import { paymentLabel } from '@/lib/clients'
import dynamic from 'next/dynamic'
// una scheda sola è a video per volta: le altre non devono pesare sul primo
// carico. /clienti/[id] era la rotta più grossa dell'app.
const AnagraficaTab = dynamic(() => import('./tabs/AnagraficaTab').then(m => ({ default: m.AnagraficaTab })))
const PanoramicaTab = dynamic(() => import('./tabs/PanoramicaTab').then(m => ({ default: m.PanoramicaTab })))
const ClientProjectsTab = dynamic(() => import('./tabs/ClientProjectsTab').then(m => ({ default: m.ClientProjectsTab })))
const ClientAdHocTab = dynamic(() => import('./tabs/ClientAdHocTab').then(m => ({ default: m.ClientAdHocTab })))
import { ClientAlertBanner } from './ClientAlertBanner'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface Props {
  client: Client
  contacts: ClientContact[]
  kpis: ClientKpi[]
  teamMembers: Profile[]
  stakeholders: ClientStakeholder[]
  interactions: ClientInteraction[]
  currentProfile: Profile
  allProfiles: Profile[]
  openTickets: number
  initialTab?: number
  /** Portale operativo: oscura MRR e pagamenti. */
  hideEconomics?: boolean
  backHref?: string
  /** scheda Economics del cliente: la pagina la passa solo agli admin */
  economics?: React.ReactNode
  /** quanti contratti ha il cliente: rende esplicito da dove esce l'MRR */
  contractsCount?: number | null
  /** §176: canone calcolato dai contratti dei progetti. null = non calcolabile qui */
  mrrFromContracts?: number | null
}

const LABEL_TEXT: Record<string, string> = {
  stabile: 'Stabile', in_bilico: 'In bilico', pending: 'In pending', perso: 'Perso', partner: 'Partner',
}

const labelBadge: Record<string, string> = {
  stabile: 'border-success/30 text-success bg-success/10',
  in_bilico: 'border-warning/30 text-warning bg-warning/10',
  pending: 'border-warning/40 text-warning bg-warning/15',
  perso: 'border-error/30 text-error bg-error/10',
  partner: 'border-gold/30 text-gold-text bg-gold/10',
}
const labelOptions = ['stabile', 'in_bilico', 'pending', 'perso', 'partner']
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
        className={`bg-surface border border-gold/40 rounded px-2 py-0.5 outline-none text-text-primary ${className}`}
        style={{ minWidth: '120px', width: `${Math.max(val.length + 2, 10)}ch` }} />
      {saving
        ? <Loader2 className="w-3 h-3 text-gold-text animate-spin" />
        : <>
          <button onClick={save} aria-label="Salva"><Check className="w-3 h-3 text-success" /></button>
          <button onClick={() => { setVal(value); setEditing(false) }} aria-label="Annulla"><X className="w-3 h-3 text-error" /></button>
        </>}
    </span>
  )

  return (
    <span className={`group/inline cursor-pointer hover:text-text-primary transition-colors inline-flex items-center gap-1 ${className}`}
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
    try {
      // il label passa dal server: archivia le chat e notifica la prima perdita
      if (field === 'client_label') await setClientLabel(clientId, v as ClientLabel)
      else {
        const { error } = await createBrowserClient().from('clients').update({ [field]: v }).eq('id', clientId)
        if (error) throw new Error(error.message)
      }
      setCurrent(v)
      toast.success(v === 'perso' ? 'Cliente perso — chat archiviata' : 'Aggiornato')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
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
          <div className="absolute top-full left-0 mt-1 bg-surface border border-border rounded-lg shadow-xl z-20 min-w-[120px] overflow-hidden">
            {options.map(opt => (
              <button key={opt} onClick={() => select(opt)}
                className={`w-full text-left px-3 py-2 text-xs capitalize hover:bg-surface-hover transition-colors ${opt === current ? 'text-gold-text font-bold' : 'text-text-primary'}`}>
                {labelFn ? labelFn(opt) : opt.replace('_', ' ')}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function ClientPageClient({
  client, contacts, kpis,
  teamMembers, stakeholders, interactions, currentProfile, allProfiles,
  openTickets, initialTab, hideEconomics = false, backHref = '/clienti', economics,
  contractsCount = null, mrrFromContracts = null,
}: Props) {
  /* §176: il canone è la somma dei contratti attivi dei progetti. L'anagrafica
     non si scrive più, quindi un numero «da anagrafica» è un residuo: meglio
     dire «da quotare» e mandare dove si quota. */
  const quoted = contractsCount != null && contractsCount > 0
  const mrr = mrrFromContracts ?? client.mrr
  const origin = mrrOrigin(quoted ? 'contratti' : 'anagrafica', contractsCount)
  const isAdmin = SUPER_ADMIN_EMAILS.includes(currentProfile?.email ?? '') || currentProfile?.app_role === 'admin'
  const isAdminLevel = isAdmin || currentProfile?.app_role === 'manager'
  // D3 (Fase 0): l'anagrafica (P.IVA/dati fiscali) è visibile SOLO ad admin.
  const canSeeAnagrafica = isAdmin
  const canSeeMrr = isAdminLevel && !hideEconomics
  // dal workspace le rotte admin sono rimbalzate dal middleware
  const portalBase = backHref.startsWith('/workspace') ? '/workspace' : ''

  const visibleTabs = [
    { label: 'Panoramica', index: 0 },
    { label: 'Progetti', index: 2 },
    { label: 'Task Ad Hoc', index: 3 },
    { label: 'Task al cliente', index: 4 },
    ...(canSeeAnagrafica ? [{ label: 'Anagrafica', index: 1 }] : []),
    // Economics: dati economici aggregati, admin-only e mai nel workspace
    ...(economics ? [{ label: 'Economics', index: 5 }] : []),
  ]

  // ?tab= arriva da link vecchi: fuori range mostrerebbe una pagina vuota
  const [activeTab, setActiveTab] = useState(
    visibleTabs.some(t => t.index === initialTab) ? initialTab! : 0
  )

  return (
    <div className="flex flex-col h-full">
      {/* Back */}
      <div className="px-4 sm:px-6 pt-5 pb-3">
        <Link href={backHref} className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" /> Tutti i clienti
        </Link>
      </div>

      {/* Alert banner contestuale */}
      <ClientAlertBanner client={client} hideEconomics={hideEconomics} />

      {/* Header cliente — tutto editabile per admin */}
      <div className="px-4 sm:px-6 pb-5 border-b border-border">
        <div className="flex items-start gap-4 flex-wrap">
          {/* Avatar azienda */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/20 flex items-center justify-center text-xl font-black text-gold-text shrink-0">
            {clientName(client)[0].toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            {/* Nome azienda + badges status */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h1 className="text-2xl font-black text-text-primary">
                {/* §24: si edita il nome VISUALIZZATO; la ragione sociale sta in Anagrafica */}
                <InlineTextField value={client.display_name ?? client.company_name} field="display_name" clientId={client.id}
                  canEdit={isAdmin} className="text-2xl font-black text-text-primary" />
              </h1>
              <InlineBadgeSelect value={client.client_type ?? 'growth'} options={['growth','digital','growth_digital']} field="client_type"
                clientId={client.id} canEdit={isAdmin}
                labelFn={v => v === 'growth_digital' ? 'Growth + Digital' : v}
                badgeClass={v =>
                  v === 'growth'         ? 'bg-gold/15 text-gold-text border-gold/30' :
                  v === 'growth_digital' ? 'bg-accent/15 text-accent border-accent/30' :
                                           'bg-info/15 text-info border-info/30'
                } />
              <InlineBadgeSelect value={client.client_label ?? 'stabile'} options={labelOptions} field="client_label"
                clientId={client.id} canEdit={isAdmin}
                labelFn={v => LABEL_TEXT[v] ?? v}
                badgeClass={v => labelBadge[v] ?? 'border-border text-text-secondary bg-transparent'} />
            </div>

            {/* Info riga */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {/* Pacchetto */}
              <InlineBadgeSelect value={client.package} options={[...packageOptions]} field="package"
                clientId={client.id} canEdit={isAdmin}
                badgeClass={() => 'bg-gold/20 text-gold-text border-gold/30'} />

              {/* §169: l'MRR è una somma di contratti, non un campo. Qui si legge
                  e si dice da dove viene; si cambia in Economics e solo lì. */}
              {canSeeMrr && (
                <Link href={economicsHref(client.id)}
                  title={quoted ? origin.hint : 'Nessun contratto: il canone si genera quotando i progetti in Economics'}
                  className="flex items-baseline gap-1.5 group">
                  {quoted ? (
                    <>
                      <span className="text-sm font-bold text-gold-text tabular">
                        {formatCurrency(mrr)}<span className="font-semibold">/mese</span>
                      </span>
                      <span className="text-2xs text-text-tertiary group-hover:text-gold-text">{origin.label}</span>
                    </>
                  ) : (
                    <span className="text-2xs font-semibold text-warning">da quotare</span>
                  )}
                </Link>
              )}

              {/* Date contratto */}
              <span className="text-text-secondary text-xs" title={CONTRACT_PERIOD_HINT}>
                {formatDate(client.contract_start)} → {client.contract_end ? formatDate(client.contract_end) : 'indeterminato'}
              </span>

              {/* Payment status */}
              {!hideEconomics && (
                <span title={PAYMENT_STATUS_HINT}
                  className={`text-xs font-semibold px-2 py-0.5 rounded ${getPaymentBadge(client.payment_status)}`}>
                  {paymentLabel(client.payment_status)}
                </span>
              )}
            </div>

            {/* Canali attivi */}
            {client.active_channels.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {client.active_channels.map((ch) => (
                  <span key={ch} className="text-xs bg-background border border-border px-2 py-0.5 rounded text-text-secondary">{ch}</span>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-border px-4 sm:px-6 scroll-x-touch">
        {visibleTabs.map(({ label, index }) => (
          <button key={label} onClick={() => setActiveTab(index)}
            className={`px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === index ? 'border-gold text-gold-text' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {activeTab === 0 && (
          <PanoramicaTab client={client} kpis={kpis} allProfiles={allProfiles}
            teamMembers={teamMembers} interactions={interactions} isAdmin={isAdmin} openTickets={openTickets}
            onTabChange={setActiveTab} hideEconomics={hideEconomics} contractsCount={contractsCount} />
        )}
        {activeTab === 1 && canSeeAnagrafica && (
          <AnagraficaTab client={client} contacts={contacts} teamMembers={teamMembers} stakeholders={stakeholders}
            allProfiles={allProfiles} hideEconomics={hideEconomics}
            // nel workspace la vista `clients_workspace` restituisce NULL su fiscali e note:
            // salvare da lì cancellerebbe i dati veri
            canEdit={isAdmin && !hideEconomics}
            canEditContacts={isAdminLevel} />
        )}
        {activeTab === 2 && (
          <ClientProjectsTab clientId={client.id} clientName={clientName(client)}
            canCreate={isAdminLevel} basePath={`${portalBase}/progetti`} />
        )}
        {activeTab === 3 && (
          <ClientAdHocTab clientId={client.id} clientName={clientName(client)}
            profiles={allProfiles} canManage={isAdminLevel} kind="ad_hoc" />
        )}
        {activeTab === 4 && (
          <ClientAdHocTab clientId={client.id} clientName={clientName(client)}
            profiles={allProfiles} canManage={isAdminLevel} kind="cliente" />
        )}
        {activeTab === 5 && economics}
      </div>
    </div>
  )
}

'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Plus, Trash2, Repeat, Package, CalendarRange, Play, Lock, Tag, Briefcase, Unlink, AlertTriangle,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  currentMonth, monthSpan, scheduled,
  type Installment, type RevenueStream, type ScheduleSpec,
} from '@/lib/revenue'
import {
  addStream, updateStream, deleteStream,
  generateInstallments, addInstallment, updateInstallment, deleteInstallment, activateStream,
  type RevCtx,
} from '@/app/actions/revenue'
import { Draft, Money } from './fields'
import { CustomPlan } from './CustomPlan'

export type CatalogService = {
  id: string
  service_type: string
  service_subtype: string | null
  label: string
  standard_price: number | null
  price_unit: string
  area: string
}

/**
 * Lo stesso pannello serve due domande diverse: «quanto vale questo progetto»
 * e «quanto vale questo cliente». Cambia solo il perimetro — nel cliente i
 * contratti si raggruppano per progetto e si possono spostare.
 */
export type ContractScope =
  | { kind: 'project'; projectId: string; clientId: string | null }
  | { kind: 'client'; clientId: string }

const eur = (n: number) => formatCurrency(Math.round(n))

const STATUS_TONE: Record<string, string> = {
  bozza: 'bg-surface-active border-border-strong text-text-secondary',
  attivo: 'bg-success-dim border-success/40 text-success',
  sospeso: 'bg-warning-dim border-warning/40 text-warning',
  concluso: 'bg-info-dim border-info/40 text-info',
}

export function ContractsPanel({
  scope, streams, installments, services, profiles, projects, canEdit,
  defaultKind, defaultStart = null, defaultEnd = null, title, subtitle,
}: {
  scope: ContractScope
  streams: RevenueStream[]
  installments: Installment[]
  services: CatalogService[]
  profiles: { id: string; full_name: string }[]
  /** progetti del cliente: uno per gruppo, anche quelli ancora da quotare. Vuoto in scheda progetto. */
  projects: { id: string; name: string; status?: string }[]
  canEdit: boolean
  defaultKind: 'growth' | 'digital'
  defaultStart?: string | null
  defaultEnd?: string | null
  title?: string
  subtitle?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState<string | null>(null)

  const byClient = scope.kind === 'client'

  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  /**
   * Un gruppo per progetto — **anche senza contratti**: un progetto attivo che
   * nessuno ha quotato è la cosa più importante da vedere qui, e mostrarlo solo
   * quando ha già una riga lo rendeva invisibile proprio quando serviva.
   * In coda gli accordi che un progetto non ce l'hanno (quote, consulenze).
   */
  const groups = useMemo(() => {
    if (!byClient) return [{ id: null as string | null, name: '', status: undefined as string | undefined, rows: streams }]
    const known = new Set(projects.map(p => p.id))
    const out = projects.map(p => ({
      id: p.id as string | null, name: p.name, status: p.status,
      rows: streams.filter(s => s.project_id === p.id),
    }))
    const loose = streams.filter(s => !s.project_id || !known.has(s.project_id))
    if (loose.length) out.push({ id: null, name: 'Accordi senza progetto', status: undefined, rows: loose })
    return out
  }, [byClient, projects, streams])

  const addFromService = (svc: CatalogService | null, projectId: string | null) => {
    const isRecurring = svc ? svc.price_unit === 'mese' : defaultKind === 'growth'
    run(() => addStream({
      label: svc?.label ?? 'Nuova voce',
      project_id: projectId,
      client_id: scope.clientId,
      service_type: svc?.service_type ?? null,
      service_subtype: svc?.service_subtype ?? null,
      // il prezzo di listino è un default: resta «standard» finché non lo tocchi
      amount: svc?.standard_price ?? 0,
      price_source: svc?.standard_price != null ? 'standard' : 'custom',
      // il piano compensi segue il servizio, non il contenitore: un CRM dentro
      // un progetto growth resta digital, ed è quello che cambia le percentuali
      kind: svc ? (svc.area === 'digital' ? 'digital' : 'growth') : defaultKind,
      billing: isRecurring ? 'recurring' : 'one_off',
      start_date: defaultStart,
      end_date: isRecurring ? null : defaultEnd,
      status: 'bozza',
    }, { projectId, clientId: scope.clientId }), 'Voce aggiunta')
  }

  return (
    <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-text-primary">{title ?? 'Servizi a contratto'}</h3>
          <p className="text-2xs text-text-tertiary mt-0.5">
            {subtitle ?? 'Una riga per servizio erogato: così si vede quale regge il margine'}
            <span className="text-text-tertiary"> · tutti gli importi sono IVA esclusa</span>
          </p>
        </div>
        {canEdit && (
          <Add services={services} pending={pending}
            label={byClient ? 'Accordo senza progetto' : 'Accordo custom'}
            selectLabel={byClient ? 'Senza progetto, da listino…' : 'Aggiungi da listino…'}
            onAdd={svc => addFromService(svc, scope.kind === 'project' ? scope.projectId : null)} />
        )}
      </div>

      {groups.length === 0 ? (
        <div className="p-5">
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <p className="text-2xs text-text-tertiary">
              Nessun contratto. Prendi un servizio dal listino — il prezzo parte da lì e lo correggi qui —
              oppure scrivi un accordo custom.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {groups.map(g => (
            <div key={g.id ?? 'none'}>
              {byClient && (
                <div className="flex items-center gap-2 px-5 py-2.5 bg-background/40 flex-wrap">
                  {g.id ? <Briefcase className="w-3.5 h-3.5 text-gold-text shrink-0" />
                        : <Unlink className="w-3.5 h-3.5 text-text-tertiary shrink-0" />}
                  {g.id ? (
                    <Link href={`/progetti/${g.id}?tab=economics`}
                      className="text-2xs font-semibold text-text-primary hover:text-gold-text truncate">
                      {g.name}
                    </Link>
                  ) : (
                    <span className="text-2xs font-semibold text-text-secondary">{g.name}</span>
                  )}
                  {g.status && g.status !== 'active' && (
                    <span className="text-2xs text-text-tertiary">· {PROJECT_STATUS[g.status] ?? g.status}</span>
                  )}
                  {/* un progetto attivo senza quotazione è la cosa da vedere per prima */}
                  {g.rows.length === 0 ? (
                    <span className="flex items-center gap-1 text-2xs font-semibold text-warning">
                      <AlertTriangle className="w-3 h-3 shrink-0" />da quotare
                    </span>
                  ) : (
                    <span className="text-2xs text-text-tertiary">
                      · {g.rows.length} vo{g.rows.length === 1 ? 'ce' : 'ci'}
                    </span>
                  )}
                  {canEdit && g.id && (
                    <span className="ml-auto">
                      <Add services={services} pending={pending} label="Accordo custom" compact
                        onAdd={svc => addFromService(svc, g.id)} />
                    </span>
                  )}
                </div>
              )}

              {g.rows.length === 0 ? (
                byClient && (
                  <p className="px-5 py-3 text-2xs text-text-tertiary">
                    Nessuna quotazione su questo progetto: finché non c&apos;è, il lavoro non porta ricavo nel conto economico.
                  </p>
                )
              ) : (
                <div className="divide-y divide-border/60">
                  {g.rows.map(s => (
                    <Row key={s.id} s={s} streams={streams} installments={installments}
                      profiles={profiles} projects={projects} canEdit={canEdit} byClient={byClient}
                      isOpen={open === s.id} toggle={() => setOpen(open === s.id ? null : s.id)}
                      ctx={{ projectId: s.project_id, clientId: scope.clientId }} run={run} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

const PROJECT_STATUS: Record<string, string> = {
  draft: 'bozza', on_hold: 'in pausa', completed: 'concluso', archived: 'archiviato',
}

/** Le due strade per quotare: prezzo di listino o accordo scritto a mano. */
function Add({ services, pending, label, selectLabel, compact, onAdd }: {
  services: CatalogService[]
  pending: boolean
  label: string
  selectLabel?: string
  compact?: boolean
  onAdd: (svc: CatalogService | null) => void
}) {
  const pad = compact ? 'px-2 py-1' : 'px-2 py-2'
  return (
    <span className="flex items-center gap-2 flex-wrap">
      <select value="" aria-label={selectLabel ?? 'Aggiungi da listino'} disabled={pending}
        onChange={e => { const s = services.find(x => x.id === e.target.value); if (s) onAdd(s) }}
        className={`bg-background border border-border-interactive rounded-xl ${pad} text-2xs text-text-secondary max-w-[220px]`}>
        <option value="">{selectLabel ?? 'Aggiungi da listino…'}</option>
        {services.map(s => (
          <option key={s.id} value={s.id}>
            {s.label}{s.standard_price != null ? ` — ${eur(s.standard_price)}/${s.price_unit === 'mese' ? 'mese' : 'una tantum'}` : ' — senza listino'}
          </option>
        ))}
      </select>
      <button onClick={() => onAdd(null)} disabled={pending}
        className={`flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl ${compact ? 'px-2 py-1' : 'px-3 py-2'} text-text-secondary hover:text-text-primary hover:bg-surface-hover press`}>
        <Plus className="w-3.5 h-3.5" />{label}
      </button>
    </span>
  )
}

function Row({
  s, streams, installments, profiles, projects, canEdit, byClient, isOpen, toggle, ctx, run,
}: {
  s: RevenueStream
  streams: RevenueStream[]
  installments: Installment[]
  profiles: { id: string; full_name: string }[]
  projects: { id: string; name: string }[]
  canEdit: boolean
  byClient: boolean
  isOpen: boolean
  toggle: () => void
  ctx: RevCtx
  run: (fn: () => Promise<unknown>, ok?: string) => void
}) {
  const [custom, setCustom] = useState<string | null>(null)
  const rows = installments.filter(i => i.stream_id === s.id)
  const planned = scheduled(installments, s.id)
  const gap = Math.round((s.amount - planned) * 100) / 100
  const parent = s.activates_after_id ? streams.find(x => x.id === s.activates_after_id) : null

  return (
    <div className="px-5 py-3">
      <div className="flex items-center gap-2.5 flex-wrap">
        {s.billing === 'recurring'
          ? <Repeat className="w-4 h-4 text-success shrink-0" />
          : <Package className="w-4 h-4 text-accent shrink-0" />}

        <Draft value={s.label} disabled={!canEdit} label="Nome del servizio"
          onSave={v => run(() => updateStream(s.id, { label: v }, ctx))}
          className="flex-1 min-w-[140px] bg-transparent text-sm font-semibold text-text-primary border-b border-transparent focus:border-border-interactive outline-none" />

        <span className="flex items-center gap-1">
          <Money value={s.amount} disabled={!canEdit}
            onSave={v => run(() => updateStream(s.id, { amount: v, price_source: 'custom' }, ctx))} />
          <span className="text-2xs text-text-tertiary">{s.billing === 'recurring' ? '/mese' : 'totale'}</span>
        </span>

        <span className={`flex items-center gap-1 text-2xs ${s.price_source === 'standard' ? 'text-text-tertiary' : 'text-accent'}`}
          title={s.price_source === 'standard' ? 'Prezzo preso dal listino' : 'Prezzo negoziato con questo cliente'}>
          <Tag className="w-3 h-3 shrink-0" />{s.price_source === 'standard' ? 'listino' : 'custom'}
        </span>

        <select value={s.status} disabled={!canEdit} aria-label="Stato"
          onChange={e => run(() => updateStream(s.id, { status: e.target.value as never }, ctx))}
          className={`text-2xs font-semibold px-2 py-1 rounded-full border ${STATUS_TONE[s.status]}`}>
          <option value="bozza">bozza</option>
          <option value="attivo">attivo</option>
          <option value="sospeso">sospeso</option>
          <option value="concluso">concluso</option>
        </select>

        {canEdit && (
          <>
            <button onClick={toggle} aria-expanded={isOpen}
              className="text-2xs font-semibold text-gold-text hover:opacity-80">
              {isOpen ? 'Chiudi' : 'Dettagli'}
            </button>
            <button onClick={() => run(() => deleteStream(s.id, ctx), 'Voce eliminata')}
              aria-label={`Elimina ${s.label}`} className="text-text-tertiary hover:text-error">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* la manutenzione aspetta la fine del lavoro che la genera */}
      {parent && s.status === 'bozza' && (
        <div className="mt-2 flex items-center gap-2 flex-wrap text-2xs">
          <Lock className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          <span className="text-text-secondary">
            Si attiva alla chiusura di «{parent.label}»
            {parent.status === 'concluso' ? ' — concluso, è pronta' : ` — ora ${parent.status}`}
          </span>
          {parent.status === 'concluso' && canEdit && (
            <button onClick={() => run(() => activateStream(s.id, ctx), 'Manutenzione attivata')}
              className="flex items-center gap-1 font-semibold text-success border border-success/40 rounded-lg px-2 py-1">
              <Play className="w-3 h-3" />Attiva
            </button>
          )}
        </div>
      )}

      {isOpen && (
        <div className="mt-3 rounded-xl border border-border bg-background/40 p-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            {byClient && (
              <Field label="Progetto">
                <select value={s.project_id ?? ''} disabled={!canEdit} aria-label="Progetto"
                  onChange={e => run(() => updateStream(s.id, { project_id: e.target.value || null },
                    // si aggiorna anche il progetto di destinazione, non solo quello che lo perde
                    { ...ctx, projectId: e.target.value || s.project_id }), 'Contratto spostato')}
                  className={inp}>
                  <option value="">— senza progetto —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Tipo">
              <select value={s.kind} disabled={!canEdit} aria-label="Tipologia"
                onChange={e => run(() => updateStream(s.id, { kind: e.target.value as never }, ctx))}
                className={inp}>
                <option value="growth">Growth</option>
                <option value="digital">Digital</option>
              </select>
            </Field>
            <Field label="Fatturazione">
              <select value={s.billing} disabled={!canEdit} aria-label="Modalità"
                onChange={e => run(() => updateStream(s.id, { billing: e.target.value as never }, ctx))}
                className={inp}>
                <option value="recurring">Canone mensile</option>
                <option value="one_off">A corpo</option>
              </select>
            </Field>
            <Field label="Inizio">
              <Draft type="date" value={s.start_date ?? ''} disabled={!canEdit} label="Inizio"
                onSave={v => run(() => updateStream(s.id, { start_date: v || null }, ctx))} className={inp} />
            </Field>
            <Field label="Fine">
              <Draft type="date" value={s.end_date ?? ''} disabled={!canEdit} label="Fine"
                onSave={v => run(() => updateStream(s.id, { end_date: v || null }, ctx))} className={inp} />
            </Field>
            <Field label="Pagamento">
              {/* come si paga, non solo quanto: è quello che il subappalto ricalca */}
              <Draft value={s.payment_terms ?? ''} label="Metodo di pagamento" className={inp}
                placeholder="30gg d.f.f.m." disabled={!canEdit}
                onSave={v => run(() => updateStream(s.id, { payment_terms: v || null }, ctx))} />
            </Field>
            <Field label="Commerciale">
              <select value={s.sales_owner_id ?? ''} disabled={!canEdit} aria-label="Commerciale"
                onChange={e => run(() => updateStream(s.id, { sales_owner_id: e.target.value || null }, ctx))}
                className={inp}>
                <option value="">—</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
            <Field label="Si attiva dopo">
              <select value={s.activates_after_id ?? ''} disabled={!canEdit} aria-label="Si attiva dopo"
                onChange={e => run(() => updateStream(s.id, { activates_after_id: e.target.value || null }, ctx))}
                className={inp}>
                <option value="">— subito —</option>
                {streams.filter(x => x.id !== s.id).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </Field>
          </div>

          {s.billing === 'one_off' && (
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <span className="flex items-center gap-1.5 text-2xs font-semibold text-text-secondary">
                  <CalendarRange className="w-3.5 h-3.5" />Piano di fatturazione
                </span>
                {canEdit && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* suggerimenti: coprono i casi che tornano più spesso.
                        Quello che non ci sta si costruisce con «Su misura» */}
                    <Gen label="Unica" onClick={() => run(() => generateInstallments(s.id, {
                      mode: 'percent', percents: [100],
                      startMonth: (s.end_date ?? s.start_date ?? currentMonth()).slice(0, 8) + '01',
                    }, ctx), 'Piano generato')} />
                    <Gen label="50/50" onClick={() => run(() => generateInstallments(s.id, {
                      mode: 'percent', percents: [50, 50],
                      startMonth: (s.start_date ?? currentMonth()).slice(0, 8) + '01',
                    }, ctx), 'Piano generato')} />
                    <Gen label="40/30/30" onClick={() => run(() => generateInstallments(s.id, {
                      mode: 'percent', percents: [40, 30, 30],
                      startMonth: (s.start_date ?? currentMonth()).slice(0, 8) + '01',
                    }, ctx), 'Piano generato')} />
                    <Gen label="30% + 3 rate" onClick={() => run(() => generateInstallments(s.id, {
                      mode: 'deposit', depositPct: 30, count: 3,
                      startMonth: (s.start_date ?? currentMonth()).slice(0, 8) + '01',
                    }, ctx), 'Piano generato')} />
                    {s.start_date && s.end_date && (
                      <Gen label={`${monthSpan(s.start_date, s.end_date)} rate uguali`}
                        onClick={() => run(() => generateInstallments(s.id, {
                          mode: 'even', count: monthSpan(s.start_date!, s.end_date!), startMonth: s.start_date!.slice(0, 8) + '01',
                        }, ctx), 'Piano generato')} />
                    )}
                    <button onClick={() => setCustom(custom === s.id ? null : s.id)} aria-expanded={custom === s.id}
                      className="text-2xs font-semibold border border-gold/40 bg-gold-dim rounded-lg px-2 py-1 text-gold-text press">
                      Su misura
                    </button>
                  </div>
                )}
              </div>

              {custom === s.id && canEdit && (
                <CustomPlan
                  defaultMonth={(s.start_date ?? currentMonth()).slice(0, 7)}
                  onBuild={spec => { setCustom(null); run(() => generateInstallments(s.id, spec, ctx), 'Piano generato') }} />
              )}

              {rows.length === 0 ? (
                <p className="text-2xs text-text-tertiary">
                  Nessuna rata: senza piano questo lavoro non entra in nessun mese del conto economico.
                </p>
              ) : (
                <div className="space-y-1">
                  {rows.map(i => (
                    <div key={i.id} className="flex items-center gap-2 flex-wrap">
                      <Draft type="month" value={i.due_month.slice(0, 7)} disabled={!canEdit} label="Mese di competenza"
                        onSave={v => { if (v) run(() => updateInstallment(i.id, { due_month: `${v}-01` }, ctx)) }}
                        className="bg-background border border-border rounded-lg px-2 py-1 text-2xs text-text-secondary" />
                      <span className="text-2xs text-text-tertiary flex-1 min-w-[60px] truncate">{i.label}</span>
                      <Money value={i.amount} disabled={!canEdit} small
                        onSave={v => run(() => updateInstallment(i.id, { amount: v }, ctx))} />
                      <Toggle on={i.invoiced} label="Fatturata" disabled={!canEdit}
                        onClick={() => run(() => updateInstallment(i.id, { invoiced: !i.invoiced }, ctx))} />
                      <Toggle on={i.paid} label="Pagata" disabled={!canEdit}
                        onClick={() => run(() => updateInstallment(i.id, { paid: !i.paid }, ctx))} />
                      {canEdit && (
                        <button onClick={() => run(() => deleteInstallment(i.id, ctx))}
                          aria-label="Elimina rata" className="text-text-tertiary hover:text-error">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <button onClick={() => run(() => addInstallment(s.id, ctx), 'Rata aggiunta')}
                      className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80 mt-1">
                      <Plus className="w-3 h-3" />Rata a mano
                    </button>
                  )}
                  {gap !== 0 && (
                    <p className={`text-2xs font-semibold ${gap > 0 ? 'text-warning' : 'text-error'}`}>
                      {gap > 0
                        ? `Mancano ${eur(gap)} da pianificare rispetto al totale del contratto`
                        : `Le rate superano il contratto di ${eur(-gap)}`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const inp = 'w-full bg-background border border-border rounded-lg px-2 py-1 text-2xs text-text-primary'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-2xs font-semibold text-text-secondary mb-1">{label}</span>
      {children}
    </label>
  )
}

function Gen({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="text-2xs font-semibold border border-border rounded-lg px-2 py-1 text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
      {label}
    </button>
  )
}

function Toggle({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={on} title={label}
      className={`text-2xs font-semibold px-2 py-1 rounded-lg border ${
        on ? 'bg-success-dim border-success/40 text-success' : 'border-border text-text-tertiary hover:bg-surface-hover'
      }`}>
      {label}
    </button>
  )
}

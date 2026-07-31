'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, Trash2, Repeat, Package, CalendarRange, Play, Lock, Wallet, Tag, Info,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { monthLabel, shiftMonth } from '@/lib/pl'
import {
  linesForMonth, scheduled, currentMonth, monthSpan,
  type RevenueStream, type Installment,
} from '@/lib/revenue'
import {
  addStream, updateStream, deleteStream,
  generateInstallments, updateInstallment, deleteInstallment, activateStream,
} from '@/app/actions/revenue'

type Service = { id: string; service_type: string; service_subtype: string | null; label: string; standard_price: number | null; price_unit: string }

const eur = (n: number) => formatCurrency(Math.round(n))

const STATUS_TONE: Record<string, string> = {
  bozza: 'bg-surface-active border-border-strong text-text-secondary',
  attivo: 'bg-success-dim border-success/40 text-success',
  sospeso: 'bg-warning-dim border-warning/40 text-warning',
  concluso: 'bg-info-dim border-info/40 text-info',
}

export function ProjectEconomics({
  projectId, projectKind, projectStart, projectEnd, streams, installments, services, profiles, canEdit,
}: {
  projectId: string
  projectKind: 'growth' | 'digital'
  projectStart: string | null
  projectEnd: string | null
  streams: RevenueStream[]
  installments: Installment[]
  services: Service[]
  profiles: { id: string; full_name: string }[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState<string | null>(null)

  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const totals = useMemo(() => {
    const rec = streams.filter(s => s.billing === 'recurring' && s.status === 'attivo')
    const one = streams.filter(s => s.billing === 'one_off')
    const draft = streams.filter(s => s.status === 'bozza')
    return {
      mrr: rec.reduce((n, s) => n + s.amount, 0),
      oneOff: one.filter(s => s.status !== 'bozza').reduce((n, s) => n + s.amount, 0),
      quoted: draft.reduce((n, s) => n + s.amount, 0),
      thisMonth: linesForMonth(streams, installments, currentMonth())
        .reduce((n, l) => n + l.amount_net, 0),
    }
  }, [streams, installments])

  const addFromService = (svc: Service | null) => {
    const isRecurring = svc ? svc.price_unit === 'mese' : projectKind === 'growth'
    run(() => addStream(projectId, {
      label: svc?.label ?? 'Nuova voce',
      service_type: svc?.service_type ?? null,
      service_subtype: svc?.service_subtype ?? null,
      // il prezzo di listino è un default: resta «standard» finché non lo tocchi
      amount: svc?.standard_price ?? 0,
      price_source: svc?.standard_price != null ? 'standard' : 'custom',
      kind: projectKind,
      billing: isRecurring ? 'recurring' : 'one_off',
      start_date: projectStart,
      end_date: isRecurring ? null : projectEnd,
      status: 'bozza',
    }), 'Voce aggiunta')
  }

  return (
    <div className="space-y-4 max-w-6xl animate-fade-in">

      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi icon={<Repeat className="w-4 h-4 text-success" />} label="Canone mensile" value={eur(totals.mrr)} />
        <Kpi icon={<Package className="w-4 h-4 text-accent" />} label="Lavori a corpo" value={eur(totals.oneOff)} />
        <Kpi icon={<Tag className="w-4 h-4 text-text-tertiary" />} label="Quotato non venduto" value={eur(totals.quoted)} />
        <Kpi icon={<Wallet className="w-4 h-4 text-gold-text" />} label={`Ricavo di ${monthLabel(currentMonth())}`} value={eur(totals.thisMonth)} />
      </div>

      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-text-primary">Servizi a contratto</h3>
            <p className="text-2xs text-text-tertiary mt-0.5">
              Una riga per servizio erogato: così si vede quale regge il margine
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <select value="" aria-label="Aggiungi da catalogo" disabled={pending}
                onChange={e => { const s = services.find(x => x.id === e.target.value); if (s) addFromService(s) }}
                className="bg-background border border-border-interactive rounded-xl px-2 py-2 text-2xs text-text-secondary max-w-[220px]">
                <option value="">Aggiungi da catalogo…</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label}{s.standard_price != null ? ` — ${eur(s.standard_price)}/${s.price_unit === 'mese' ? 'mese' : 'una tantum'}` : ' — senza listino'}
                  </option>
                ))}
              </select>
              <button onClick={() => addFromService(null)} disabled={pending}
                className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
                <Plus className="w-3.5 h-3.5" />Voce libera
              </button>
            </div>
          )}
        </div>

        {streams.length === 0 ? (
          <div className="p-5">
            <div className="text-center py-8 border border-dashed border-border rounded-xl">
              <p className="text-2xs text-text-tertiary">
                Nessun contratto. Aggiungi i servizi da catalogo: il prezzo parte dal listino e lo correggi qui.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {streams.map(s => {
              const rows = installments.filter(i => i.stream_id === s.id)
              const planned = scheduled(installments, s.id)
              const gap = Math.round((s.amount - planned) * 100) / 100
              const parent = s.activates_after_id ? streams.find(x => x.id === s.activates_after_id) : null
              const isOpen = open === s.id

              return (
                <div key={s.id} className="px-5 py-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {s.billing === 'recurring'
                      ? <Repeat className="w-4 h-4 text-success shrink-0" />
                      : <Package className="w-4 h-4 text-accent shrink-0" />}

                    <input value={s.label} disabled={!canEdit} aria-label="Nome del servizio"
                      onChange={e => run(() => updateStream(s.id, projectId, { label: e.target.value }))}
                      className="flex-1 min-w-[140px] bg-transparent text-sm font-semibold text-text-primary border-b border-transparent focus:border-border-interactive outline-none" />

                    <span className="flex items-center gap-1">
                      <input type="number" value={s.amount} disabled={!canEdit} aria-label="Importo"
                        onChange={e => run(() => updateStream(s.id, projectId, {
                          amount: Number(e.target.value) || 0, price_source: 'custom',
                        }))}
                        className="w-24 bg-background border border-border rounded-lg px-2 py-1 text-sm text-right tabular text-text-primary" />
                      <span className="text-2xs text-text-tertiary">{s.billing === 'recurring' ? '/mese' : 'totale'}</span>
                    </span>

                    {s.price_source === 'standard' && (
                      <span className="text-2xs text-text-tertiary" title="Prezzo preso dal listino">listino</span>
                    )}

                    <select value={s.status} disabled={!canEdit} aria-label="Stato"
                      onChange={e => run(() => updateStream(s.id, projectId, { status: e.target.value as never }))}
                      className={`text-2xs font-semibold px-2 py-1 rounded-full border ${STATUS_TONE[s.status]}`}>
                      <option value="bozza">bozza</option>
                      <option value="attivo">attivo</option>
                      <option value="sospeso">sospeso</option>
                      <option value="concluso">concluso</option>
                    </select>

                    {canEdit && (
                      <>
                        <button onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}
                          className="text-2xs font-semibold text-gold-text hover:opacity-80">
                          {isOpen ? 'Chiudi' : 'Dettagli'}
                        </button>
                        <button onClick={() => run(() => deleteStream(s.id, projectId), 'Voce eliminata')}
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
                        <button onClick={() => run(() => activateStream(s.id, projectId), 'Manutenzione attivata')}
                          className="flex items-center gap-1 font-semibold text-success border border-success/40 rounded-lg px-2 py-1">
                          <Play className="w-3 h-3" />Attiva
                        </button>
                      )}
                    </div>
                  )}

                  {isOpen && (
                    <div className="mt-3 rounded-xl border border-border bg-background/40 p-3 space-y-3">
                      <div className="grid gap-2 sm:grid-cols-4">
                        <Field label="Tipo">
                          <select value={s.kind} disabled={!canEdit} aria-label="Tipologia"
                            onChange={e => run(() => updateStream(s.id, projectId, { kind: e.target.value as never }))}
                            className={inp}>
                            <option value="growth">Growth</option>
                            <option value="digital">Digital</option>
                          </select>
                        </Field>
                        <Field label="Fatturazione">
                          <select value={s.billing} disabled={!canEdit} aria-label="Modalità"
                            onChange={e => run(() => updateStream(s.id, projectId, { billing: e.target.value as never }))}
                            className={inp}>
                            <option value="recurring">Canone mensile</option>
                            <option value="one_off">A corpo</option>
                          </select>
                        </Field>
                        <Field label="Inizio">
                          <input type="date" value={s.start_date ?? ''} disabled={!canEdit} aria-label="Inizio"
                            onChange={e => run(() => updateStream(s.id, projectId, { start_date: e.target.value || null }))}
                            className={inp} />
                        </Field>
                        <Field label="Fine">
                          <input type="date" value={s.end_date ?? ''} disabled={!canEdit} aria-label="Fine"
                            onChange={e => run(() => updateStream(s.id, projectId, { end_date: e.target.value || null }))}
                            className={inp} />
                        </Field>
                        <Field label="Commerciale">
                          <select value={s.sales_owner_id ?? ''} disabled={!canEdit} aria-label="Commerciale"
                            onChange={e => run(() => updateStream(s.id, projectId, { sales_owner_id: e.target.value || null }))}
                            className={inp}>
                            <option value="">—</option>
                            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                          </select>
                        </Field>
                        <Field label="Si attiva dopo">
                          <select value={s.activates_after_id ?? ''} disabled={!canEdit} aria-label="Si attiva dopo"
                            onChange={e => run(() => updateStream(s.id, projectId, { activates_after_id: e.target.value || null }))}
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
                                {s.start_date && s.end_date && (
                                  <Gen label={`${monthSpan(s.start_date, s.end_date)} rate uguali`}
                                    onClick={() => run(() => generateInstallments(s.id, projectId, {
                                      mode: 'even', count: monthSpan(s.start_date!, s.end_date!), startMonth: s.start_date!.slice(0, 8) + '01',
                                    }), 'Piano generato')} />
                                )}
                                <Gen label="40/30/30" onClick={() => run(() => generateInstallments(s.id, projectId, {
                                  mode: 'percent', percents: [40, 30, 30],
                                  startMonth: (s.start_date ?? currentMonth()).slice(0, 8) + '01',
                                }), 'Piano generato')} />
                                <Gen label="Unica" onClick={() => run(() => generateInstallments(s.id, projectId, {
                                  mode: 'percent', percents: [100],
                                  startMonth: (s.end_date ?? s.start_date ?? currentMonth()).slice(0, 8) + '01',
                                }), 'Piano generato')} />
                              </div>
                            )}
                          </div>

                          {rows.length === 0 ? (
                            <p className="text-2xs text-text-tertiary">
                              Nessuna rata: senza piano questo lavoro non entra in nessun mese del conto economico.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {rows.map(i => (
                                <div key={i.id} className="flex items-center gap-2 flex-wrap">
                                  <input type="month" value={i.due_month.slice(0, 7)} disabled={!canEdit} aria-label="Mese di competenza"
                                    onChange={e => run(() => updateInstallment(i.id, projectId, { due_month: `${e.target.value}-01` }))}
                                    className="bg-background border border-border rounded-lg px-2 py-1 text-2xs text-text-secondary" />
                                  <span className="text-2xs text-text-tertiary flex-1 min-w-[60px] truncate">{i.label}</span>
                                  <input type="number" value={i.amount} disabled={!canEdit} aria-label="Importo rata"
                                    onChange={e => run(() => updateInstallment(i.id, projectId, { amount: Number(e.target.value) || 0 }))}
                                    className="w-24 bg-background border border-border rounded-lg px-2 py-1 text-2xs text-right tabular text-text-primary" />
                                  <Toggle on={i.invoiced} label="Fatturata" disabled={!canEdit}
                                    onClick={() => run(() => updateInstallment(i.id, projectId, { invoiced: !i.invoiced }))} />
                                  <Toggle on={i.paid} label="Pagata" disabled={!canEdit}
                                    onClick={() => run(() => updateInstallment(i.id, projectId, { paid: !i.paid }))} />
                                  {canEdit && (
                                    <button onClick={() => run(() => deleteInstallment(i.id, projectId))}
                                      aria-label="Elimina rata" className="text-text-tertiary hover:text-error">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
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
            })}
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 text-2xs text-text-tertiary">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Solo i contratti <strong className="font-semibold">attivi</strong> entrano nel conto economico: una bozza è
        quotata ma non venduta. Un canone pesa in ogni mese fra inizio e fine; un lavoro a corpo pesa attraverso
        le rate, nel mese in cui ciascuna cade.
      </p>
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

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
      <div className="flex items-center gap-2 mb-1.5">{icon}
        <span className="text-2xs font-semibold text-text-secondary uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className="text-lg font-bold text-text-primary tabular">{value}</div>
    </div>
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

'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, ChevronLeft, ChevronRight, Check, AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import {
  listCatalog, clientContext, createProjectFromWizard,
  type CatalogService, type WizardPayload,
} from '@/app/actions/project-wizard'
import { routineSeed, focusOf } from '@/lib/growth-routines'

/**
 * Il wizard unico (§6). Sostituisce gli otto form di creazione progetto.
 *
 * Progressive disclosure: uno step per volta, e l'utente non legge mai
 * `delivery_engine` o `revenue_model` — li sceglie il catalogo. Le domande sono
 * in italiano: "è continuativo o ha una fine?", non "seleziona il motore".
 *
 * Lo step 7 mostra esattamente ciò che verrà creato, modificabile. La creazione
 * è atomica: passa da `create_project_from_wizard`.
 */

const LINE_LABEL: Record<string, string> = {
  growth: 'Growth', digital: 'Digital', marketing: 'Marketing',
  ai: 'AI', consulting: 'Consulenza', hybrid: 'Ibrido', other: 'Altro',
}

const LINE_ORDER = ['growth', 'digital', 'marketing', 'ai', 'consulting']

const ENGINE_HUMAN: Record<string, string> = {
  growth_program: 'Programma continuativo con routine ricorrenti',
  digital_project: 'Progetto con fasi, sprint e una data di fine',
  recurring_service: 'Servizio continuativo a richieste',
  structured_one_off: 'Lavoro una tantum con fasi definite',
  hybrid_delivery: 'Misto',
}

const DIGITAL_PHASES = [
  'Discovery', 'Analisi', 'Progettazione', 'UX/UI', 'Sviluppo',
  'Integrazione', 'Test interno', 'Test cliente', 'Revisioni', 'Rilascio',
]

const ONEOFF_PHASES = ['Brief', 'Analisi', 'Proposte', 'Revisioni', 'Consegna']

interface Props {
  open: boolean
  onClose: () => void
  clients: { id: string; company_name: string }[]
  profiles: { id: string; full_name: string | null }[]
  isAdmin: boolean
  /** Precompilato se il wizard è aperto dalla scheda cliente. */
  defaultClientId?: string
}

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6

const STEP_LABEL = ['Cliente', 'Servizio', 'Configurazione', 'Accordo', 'Team', 'Struttura', 'Anteprima']

export function ProjectWizard({ open, onClose, clients, profiles, isAdmin, defaultClientId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(defaultClientId ? 1 : 0)
  const [catalog, setCatalog] = useState<CatalogService[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [clientId, setClientId] = useState(defaultClientId ?? '')
  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof clientContext>> | null>(null)
  const [line, setLine] = useState<string | null>(null)
  const [serviceKey, setServiceKey] = useState('')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [desiredEnd, setDesiredEnd] = useState('')
  const [vertical, setVertical] = useState<string>('')
  const [startupDays, setStartupDays] = useState(21)
  const [managerId, setManagerId] = useState('')
  const [sprintName, setSprintName] = useState('')

  const [amount, setAmount] = useState('')
  const [billingFreq, setBillingFreq] = useState('mensile')

  const [phases, setPhases] = useState<{ name: string }[]>([])
  const [routines, setRoutines] = useState<{ key?: string; title: string; frequency: string; hours?: number }[]>([])

  useEffect(() => {
    if (!open) return
    listCatalog().then(r => { setCatalog(r.services); setLoading(false) })
  }, [open])

  useEffect(() => {
    if (!clientId) { setCtx(null); return }
    clientContext(clientId).then(setCtx)
  }, [clientId])

  const service = catalog.find(s => s.key === serviceKey) ?? null

  /** Il catalogo precompila; da qui in poi l'utente modifica quello che vede. */
  const applyService = useCallback((s: CatalogService) => {
    setServiceKey(s.key)
    setName(prev => prev || `${s.name} — ${clients.find(c => c.id === clientId)?.company_name ?? ''}`.trim())
    setVertical(s.growth_vertical ?? '')
    setBillingFreq(s.default_billing_frequency ?? 'una_tantum')

    if (s.delivery_engine === 'growth_program') {
      const seed = routineSeed(focusOf(s.growth_vertical))
      setRoutines(seed.map(r => ({ key: r.key, title: r.title, frequency: r.frequency, hours: r.hours })))
      setPhases([])
      setSprintName('')
    } else if (s.delivery_engine === 'digital_project') {
      setPhases(DIGITAL_PHASES.map(n => ({ name: n })))
      setRoutines([])
      setSprintName('Sprint 1')
    } else if (s.delivery_engine === 'structured_one_off') {
      setPhases(ONEOFF_PHASES.map(n => ({ name: n })))
      setRoutines([])
      setSprintName('')
    } else {
      setPhases([]); setRoutines([]); setSprintName('')
    }

    if (s.suggested_duration_days) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + s.suggested_duration_days)
      setDesiredEnd(d.toISOString().slice(0, 10))
    } else {
      setDesiredEnd('')
    }
  }, [clientId, clients, startDate])

  if (!open) return null

  const isGrowth = service?.delivery_engine === 'growth_program'
  const isDigital = service?.delivery_engine === 'digital_project'
  const canNext =
    step === 0 ? !!clientId :
    step === 1 ? !!serviceKey :
    step === 2 ? name.trim().length > 0 :
    true

  const submit = async () => {
    if (!service) return
    setSaving(true)
    const payload: WizardPayload = {
      client_id: clientId,
      service_key: service.key,
      name: name.trim(),
      description: description.trim() || undefined,
      growth_vertical: isGrowth ? (vertical || null) : null,
      start_date: startDate,
      desired_end_date: desiredEnd || null,
      manager_id: managerId || null,
      startup_target_days: isGrowth ? startupDays : undefined,
      sprint_name: sprintName || null,
      phases: phases.map(p => ({ name: p.name })),
      routines,
      startup_tasks: [],
      agreement: isAdmin && amount
        ? {
            label: service.name,
            amount: parseFloat(amount),
            revenue_model: service.default_revenue_model,
            billing_frequency: billingFreq,
          }
        : null,
    }

    const res = await createProjectFromWizard(payload)
    setSaving(false)
    if (!res.ok) { toast.error(res.error ?? 'Errore nella creazione'); return }

    const r = res.result
    toast.success(
      `Progetto creato${r.routines ? ` · ${r.routines} routine` : ''}${r.phases ? ` · ${r.phases} fasi` : ''}` +
      (r.economic_status === 'da_definire' ? ' · accordo economico da definire' : ''),
    )
    onClose()
    router.push(`/clienti/${clientId}/progetto/${r.project_id}`)
  }

  const inputCls = 'w-full bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/50'

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Nuovo progetto</h2>
            <p className="text-2xs text-text-tertiary mt-0.5">
              Step {step + 1}/7 — {STEP_LABEL[step]}
            </p>
          </div>
          <button onClick={onClose} aria-label="Chiudi"
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-text-secondary py-10 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Caricamento catalogo…
            </div>
          ) : (
            <>
              {/* ── 1. Cliente ── */}
              {step === 0 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-2xs text-text-tertiary mb-1.5">Cliente *</label>
                    <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls}>
                      <option value="">Seleziona…</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                    </select>
                  </div>
                  {ctx?.projects && ctx.projects.length > 0 && (
                    <div className="bg-background border border-border rounded-xl p-4">
                      <p className="text-2xs text-text-tertiary mb-2">Servizi già attivi su questo cliente</p>
                      <ul className="space-y-1">
                        {ctx.projects.map(p => (
                          <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-text-primary truncate">{p.name}</span>
                            <span className="text-2xs text-text-tertiary shrink-0">
                              {LINE_LABEL[p.service_line] ?? p.service_line}
                              {p.economic_status === 'da_definire' && ' · senza accordo'}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-2xs text-text-tertiary mt-2">
                        Un cliente può avere più servizi in parallelo. Controlla solo di non duplicarne uno.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── 2. Servizio ── */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {LINE_ORDER.filter(l => catalog.some(s => s.service_line === l)).map(l => (
                      <button key={l} onClick={() => { setLine(l); setServiceKey('') }}
                        className={`text-sm font-semibold px-3 py-2 rounded-lg border transition-colors ${
                          line === l ? 'bg-surface-active text-text-primary border-border-strong'
                            : 'bg-transparent text-text-secondary border-border hover:text-text-primary'
                        }`}>
                        {LINE_LABEL[l]}
                      </button>
                    ))}
                  </div>

                  {line && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {catalog.filter(s => s.service_line === line).map(s => (
                        <button key={s.key} onClick={() => applyService(s)}
                          className={`text-left p-3 rounded-xl border transition-colors ${
                            serviceKey === s.key ? 'border-gold bg-gold-dim' : 'border-border bg-background hover:border-border-strong'
                          }`}>
                          <p className="text-sm font-semibold text-text-primary">
                            {s.icon} {s.name}
                          </p>
                          {s.description && <p className="text-2xs text-text-tertiary mt-0.5">{s.description}</p>}
                          <p className="text-2xs text-text-secondary mt-1.5">
                            {ENGINE_HUMAN[s.delivery_engine]}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  {!line && (
                    <p className="text-2xs text-text-tertiary">Scegli prima l&apos;area, poi il servizio.</p>
                  )}
                </div>
              )}

              {/* ── 3. Configurazione ── */}
              {step === 2 && service && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-2xs text-text-tertiary mb-1.5">Nome del progetto *</label>
                    <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-2xs text-text-tertiary mb-1.5">Obiettivo principale</label>
                    <input value={description} onChange={e => setDescription(e.target.value)}
                      placeholder="Cosa deve ottenere questo lavoro" className={inputCls} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-2xs text-text-tertiary mb-1.5">Data di partenza *</label>
                      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
                    </div>
                    {!isGrowth && (
                      <div>
                        <label className="block text-2xs text-text-tertiary mb-1.5">Data di fine concordata</label>
                        <input type="date" value={desiredEnd} onChange={e => setDesiredEnd(e.target.value)} className={inputCls} />
                      </div>
                    )}
                  </div>

                  {isGrowth && (
                    <>
                      <div>
                        <label className="block text-2xs text-text-tertiary mb-1.5">Verticale *</label>
                        <div className="flex gap-2">
                          {[{ v: 'ecommerce', l: 'E-commerce' }, { v: 'lead_gen', l: 'Lead generation' }].map(o => (
                            <button key={o.v} onClick={() => {
                              setVertical(o.v)
                              const seed = routineSeed(focusOf(o.v))
                              setRoutines(seed.map(r => ({ key: r.key, title: r.title, frequency: r.frequency, hours: r.hours })))
                            }}
                              className={`flex-1 text-sm font-semibold px-3 py-2 rounded-lg border transition-colors ${
                                vertical === o.v ? 'bg-surface-active text-text-primary border-border-strong'
                                  : 'bg-transparent text-text-secondary border-border hover:text-text-primary'
                              }`}>
                              {o.l}
                            </button>
                          ))}
                        </div>
                        <p className="text-2xs text-text-tertiary mt-1.5">
                          Decide quali routine si creano e quali KPI vedrai in Panoramica.
                        </p>
                      </div>
                      <div>
                        <label className="block text-2xs text-text-tertiary mb-1.5">Durata della fase iniziale (giorni)</label>
                        <input type="number" value={startupDays}
                          onChange={e => setStartupDays(parseInt(e.target.value) || 21)} className={inputCls} />
                        <p className="text-2xs text-text-tertiary mt-1">Default 21 giorni. Modificabile per cliente.</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── 4. Accordo ── */}
              {step === 3 && service && (
                <div className="space-y-4">
                  {isAdmin ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-2xs text-text-tertiary mb-1.5">
                            {service.default_revenue_model === 'recurring' ? 'Canone (€)' : 'Importo (€)'}
                          </label>
                          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                            placeholder="1800" className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-2xs text-text-tertiary mb-1.5">Frequenza</label>
                          <select value={billingFreq} onChange={e => setBillingFreq(e.target.value)} className={inputCls}>
                            {['mensile','bimestrale','trimestrale','semestrale','annuale','una_tantum'].map(f =>
                              <option key={f} value={f}>{f}</option>)}
                          </select>
                        </div>
                      </div>
                      <p className="text-2xs text-text-tertiary">
                        Se lo lasci vuoto il progetto nasce senza valore economico e finisce
                        nella coda «da definire».
                      </p>
                    </>
                  ) : (
                    <div className="bg-background border border-border rounded-xl p-4 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-text-primary">L&apos;accordo economico lo definisce un admin</p>
                        <p className="text-2xs text-text-tertiary mt-1">
                          Il progetto nasce comunque e tu puoi lavorarci subito. Comparirà nella
                          coda dell&apos;amministrazione finché non gli viene assegnato un valore.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── 5. Team ── */}
              {step === 4 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-2xs text-text-tertiary mb-1.5">Responsabile di progetto</label>
                    <select value={managerId} onChange={e => setManagerId(e.target.value)} className={inputCls}>
                      <option value="">Nessuno</option>
                      {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? '—'}</option>)}
                    </select>
                    <p className="text-2xs text-text-tertiary mt-1.5">
                      Il PM può modificare task e scadenze di questo progetto dal Workload.
                    </p>
                  </div>
                </div>
              )}

              {/* ── 6. Struttura ── */}
              {step === 5 && service && (
                <div className="space-y-4">
                  {isGrowth && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-text-primary">Routine ricorrenti</p>
                        <span className="text-2xs text-text-tertiary">{routines.length} attività</span>
                      </div>
                      <div className="bg-background border border-border rounded-xl divide-y divide-border max-h-64 overflow-y-auto">
                        {routines.map((r, i) => (
                          <div key={i} className="p-2.5 flex items-center gap-2">
                            <input value={r.title}
                              onChange={e => setRoutines(rs => rs.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                              className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none" />
                            <select value={r.frequency}
                              onChange={e => setRoutines(rs => rs.map((x, j) => j === i ? { ...x, frequency: e.target.value } : x))}
                              className="text-2xs bg-surface border border-border rounded px-1.5 py-0.5 text-text-secondary">
                              {['settimanale','quindicinale','mensile','trimestrale'].map(f =>
                                <option key={f} value={f}>{f}</option>)}
                            </select>
                            <button onClick={() => setRoutines(rs => rs.filter((_, j) => j !== i))}
                              aria-label="Rimuovi routine"
                              className="p-1 text-text-tertiary hover:text-error transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setRoutines(rs => [...rs, { title: '', frequency: 'mensile', hours: 1 }])}
                        className="mt-2 flex items-center gap-1.5 text-2xs text-text-secondary hover:text-text-primary transition-colors">
                        <Plus className="w-3 h-3" /> Aggiungi routine
                      </button>
                    </div>
                  )}

                  {phases.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-text-primary">Fasi</p>
                        <span className="text-2xs text-text-tertiary">{phases.length}</span>
                      </div>
                      <div className="bg-background border border-border rounded-xl divide-y divide-border max-h-64 overflow-y-auto">
                        {phases.map((p, i) => (
                          <div key={i} className="p-2.5 flex items-center gap-2">
                            <input value={p.name}
                              onChange={e => setPhases(ps => ps.map((x, j) => j === i ? { name: e.target.value } : x))}
                              className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none" />
                            <button onClick={() => setPhases(ps => ps.filter((_, j) => j !== i))}
                              aria-label="Rimuovi fase"
                              className="p-1 text-text-tertiary hover:text-error transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setPhases(ps => [...ps, { name: '' }])}
                        className="mt-2 flex items-center gap-1.5 text-2xs text-text-secondary hover:text-text-primary transition-colors">
                        <Plus className="w-3 h-3" /> Aggiungi fase
                      </button>
                    </div>
                  )}

                  {isDigital && (
                    <div>
                      <label className="block text-2xs text-text-tertiary mb-1.5">Primo sprint</label>
                      <input value={sprintName} onChange={e => setSprintName(e.target.value)}
                        placeholder="Sprint 1" className={inputCls} />
                    </div>
                  )}

                  {!isGrowth && phases.length === 0 && !isDigital && (
                    <p className="text-2xs text-text-tertiary">
                      Questo servizio non prevede una struttura predefinita: la costruirai dal progetto.
                    </p>
                  )}
                </div>
              )}

              {/* ── 7. Anteprima ── */}
              {step === 6 && service && (
                <div className="space-y-3">
                  <div className="bg-background border border-border rounded-xl p-4 space-y-2">
                    {[
                      ['Cliente', clients.find(c => c.id === clientId)?.company_name ?? '—'],
                      ['Servizio', `${service.icon ?? ''} ${service.name}`],
                      ['Come si lavora', ENGINE_HUMAN[service.delivery_engine]],
                      ['Nome progetto', name],
                      ['Partenza', startDate],
                      ...(desiredEnd ? [['Fine concordata', desiredEnd]] : []),
                      ...(isGrowth && vertical ? [['Verticale', vertical === 'ecommerce' ? 'E-commerce' : 'Lead generation']] : []),
                      ...(isGrowth ? [['Fase iniziale', `${startupDays} giorni`]] : []),
                      ['Responsabile', profiles.find(p => p.id === managerId)?.full_name ?? 'da assegnare'],
                    ].map(([k, v]) => (
                      <div key={k as string} className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-text-tertiary text-2xs">{k}</span>
                        <span className="text-text-primary text-right">{v}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-background border border-border rounded-xl p-4">
                    <p className="text-2xs text-text-tertiary mb-2">Verrà creato</p>
                    <ul className="text-sm text-text-primary space-y-1">
                      <li>1 progetto</li>
                      {routines.length > 0 && <li>{routines.length} routine ricorrenti</li>}
                      {phases.length > 0 && <li>{phases.length} fasi</li>}
                      {sprintName && <li>1 sprint «{sprintName}»</li>}
                      {isAdmin && amount && (
                        <li>1 accordo economico da {formatCurrency(parseFloat(amount) || 0)} · {billingFreq}</li>
                      )}
                    </ul>
                  </div>

                  {(!isAdmin || !amount) && (
                    <div className="bg-warning-dim border border-warning/30 rounded-xl p-3 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                      <p className="text-2xs text-text-secondary">
                        Nessun accordo economico: il progetto nascerà «da definire» e comparirà
                        nella coda dell&apos;amministrazione.
                      </p>
                    </div>
                  )}

                  {routines.some(r => !r.title.trim()) && (
                    <p className="text-2xs text-error">Alcune routine non hanno titolo: correggile prima di creare.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <button onClick={() => setStep(s => Math.max(0, s - 1) as Step)} disabled={step === 0}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Indietro
          </button>

          {step < 6 ? (
            <button onClick={() => setStep(s => (s + 1) as Step)} disabled={!canNext}
              className="flex items-center gap-1.5 bg-gold text-on-gold text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity">
              Avanti <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={submit} disabled={saving || routines.some(r => !r.title.trim())}
              className="flex items-center gap-2 bg-gold text-on-gold text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Crea progetto
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown, Plus, Trash2, FileText, Receipt, Landmark, PiggyBank,
  AlertTriangle, Check, Loader2, Info,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  payslipViews, invoiceViews, tfrLedger, checkF24, contractSpec,
  type PayrollParams, type Payslip, type CollabInvoice, type F24, type TfrMovement,
} from '@/lib/payroll'
import { PAYSLIP_FIELDS, type PersonRow } from '@/lib/payroll-map'
import {
  upsertPayslip, deletePayslip, upsertInvoice, deleteInvoice,
  upsertF24, addTfrMovement,
} from '@/app/actions/payroll'
import { Money } from '@/components/economics/fields'

const eur = (n: number) => formatCurrency(n)
const eur0 = (n: number) => formatCurrency(Math.round(n))

type Run = (fn: () => Promise<unknown>, ok?: string) => void

const box = 'bg-surface border border-border rounded-2xl shadow-soft overflow-hidden'
const head = 'px-5 py-4 border-b border-border'

/**
 * I cedolini del mese.
 *
 * Ogni riga chiusa mostra i tre valori che non vanno confusi: quanto è costata
 * la persona (competenza), quanto è uscito dalla banca (cassa), quanto ha preso
 * lei (netto). Aperta, la trascrizione del cedolino voce per voce — perché il
 * totale di un cedolino si copia, non si ricalcola.
 */
export function PayslipsTab({ people, slips, params, month, pending, run }: {
  people: PersonRow[]
  slips: Payslip[]
  params: PayrollParams
  month: string
  pending: boolean
  run: Run
}) {
  const [open, setOpen] = useState<string | null>(null)
  const subordinati = people.filter(p =>
    ['subordinato', 'parasubordinato'].includes(contractSpec(p.kind).employment) && p.active)
  const byPerson = new Map(slips.map(s => [s.personId, s]))

  if (!subordinati.length) {
    return (
      <div className={box}>
        <p className="px-5 py-10 text-center text-2xs text-text-tertiary">
          Nessun dipendente, apprendista o tirocinante in organico: i cedolini riguardano loro.
        </p>
      </div>
    )
  }

  return (
    <div className={box}>
      <div className={head}>
        <h2 className="text-sm font-bold text-text-primary">Cedolini del mese</h2>
        <p className="text-2xs text-text-tertiary mt-0.5">
          I numeri si trascrivono dal cedolino. Dove il dato manca il tool stima e lo dichiara,
          invece di far finta di saperlo
        </p>
      </div>

      <div className="divide-y divide-border/60">
        {subordinati.map(p => {
          const slip = byPerson.get(p.id)
          const v = slip ? payslipViews(slip, p.kind, params) : null
          const isOpen = open === p.id
          const set = (patch: Record<string, unknown>) => run(() => upsertPayslip(p.id, month, patch))

          return (
            <div key={p.id} className="px-5 py-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-sm font-semibold text-text-primary flex-1 min-w-[140px]">
                  {p.name}
                  {p.role && <span className="text-2xs font-normal text-text-tertiary"> · {p.role}</span>}
                </span>

                {v ? (
                  <>
                    <Three label="costo" value={v.economic} tone="error" hint="competenza: entra nel conto economico" />
                    <Three label="cassa" value={v.cash} tone="warning" hint="uscita di banca: netto + F24" />
                    <Three label="netto" value={v.net ?? 0} tone="success" hint="quanto ha ricevuto la persona" />
                    {v.estimated && (
                      <span className="text-2xs font-semibold text-warning" title="Contributi datore non ancora avuti dal consulente">
                        stimato
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-2xs text-text-tertiary">nessun cedolino per questo mese</span>
                )}

                <button onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}
                  className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80">
                  {slip ? 'cedolino' : 'inserisci'}
                  <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {slip && (
                  <button onClick={() => run(() => deletePayslip(slip.id), 'Cedolino eliminato')} disabled={pending}
                    aria-label={`Elimina cedolino di ${p.name}`} className="text-text-tertiary hover:text-error">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="mt-3 space-y-3">
                  {(['competenze', 'imponibili', 'trattenute', 'datore'] as const).map(g => (
                    <div key={g} className="rounded-xl border border-border bg-background p-3">
                      <p className="text-2xs font-bold text-text-primary uppercase tracking-wider mb-2">
                        {g === 'datore' ? 'A carico azienda' : g}
                      </p>
                      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {PAYSLIP_FIELDS.filter(f => f.group === g).map(f => {
                          const raw = slip ? (slip as unknown as Record<string, unknown>) : null
                          const camel = f.key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
                          const val = raw ? raw[camel] : 0
                          const isNull = val === null || val === undefined
                          return (
                            <div key={f.key} className="flex items-center justify-between gap-2">
                              <span className="text-2xs text-text-secondary truncate" title={f.hint}>
                                {f.label}
                                {f.hint && <span className="text-text-tertiary"> ⓘ</span>}
                              </span>
                              <span className="flex items-center gap-1 shrink-0">
                                {isNull && <span className="text-2xs text-warning">stimato</span>}
                                <Money value={isNull ? 0 : Number(val ?? 0)} small
                                  onSave={x => set({ [f.key]: x })} />
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  {slip && v && (
                    <div className="rounded-xl border border-info/30 bg-info-dim p-3">
                      <p className="flex items-start gap-1.5 text-2xs text-text-secondary">
                        <Info className="w-3 h-3 mt-0.5 shrink-0 text-info" aria-hidden="true" />
                        <span>
                          Nel conto economico entrano <strong className="text-text-primary">{eur(v.economic)}</strong>.
                          Dalla banca escono <strong className="text-text-primary">{eur(v.cash)}</strong>: netto{' '}
                          {eur(slip.netPaid)} più {eur(slip.employeeContrib + slip.irpef + slip.surcharges)} di
                          trattenute e gli oneri del datore, versati con l&apos;F24. La differenza fra i due è il
                          TFR di {eur(slip.tfrAccrued)}, che matura adesso e uscirà alla fine del rapporto:
                          non va contato due volte.
                        </span>
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-2xs text-text-secondary">Stato pagamento</span>
                    {(['da_pagare', 'parziale', 'pagato'] as const).map(st => (
                      <button key={st} onClick={() => set({ payment_status: st })} disabled={pending}
                        className={`text-2xs font-semibold px-2 py-1 rounded-lg border transition-colors ${
                          slip?.paymentStatus === st
                            ? 'bg-gold-dim border-gold/40 text-gold-text'
                            : 'bg-background border-border text-text-secondary hover:text-text-primary'}`}>
                        {st === 'da_pagare' ? 'Da pagare' : st === 'parziale' ? 'Parziale' : 'Pagato'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Le fatture dei collaboratori.
 *
 * Qui non esistono lordo e netto: esistono imponibile, IVA, ritenuta e importo
 * pagato. Il netto personale di chi fattura dipende dal suo regime e dai suoi
 * altri redditi — Two Bee non lo conosce e non deve fingere di conoscerlo.
 */
export function InvoicesTab({ people, invoices, month, pending, run }: {
  people: PersonRow[]
  invoices: CollabInvoice[]
  month: string
  pending: boolean
  run: Run
}) {
  const autonomi = people.filter(p => contractSpec(p.kind).employment === 'autonomo' && p.active)
  const byPerson = new Map(invoices.map(i => [i.personId, i]))
  const [open, setOpen] = useState<string | null>(null)

  if (!autonomi.length) {
    return (
      <div className={box}>
        <p className="px-5 py-10 text-center text-2xs text-text-tertiary">
          Nessun collaboratore a partita IVA in organico.
        </p>
      </div>
    )
  }

  return (
    <div className={box}>
      <div className={head}>
        <h2 className="text-sm font-bold text-text-primary">Fatture dei collaboratori</h2>
        <p className="text-2xs text-text-tertiary mt-0.5">
          Imponibile, IVA e ritenuta si leggono dalla fattura. L&apos;IVA detraibile non è un costo: si recupera
        </p>
      </div>

      <div className="divide-y divide-border/60">
        {autonomi.map(p => {
          const inv = byPerson.get(p.id)
          const v = inv ? invoiceViews(inv) : null
          const isOpen = open === p.id
          const set = (patch: Record<string, unknown>) => run(() => upsertInvoice(p.id, month, patch))

          return (
            <div key={p.id} className="px-5 py-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-sm font-semibold text-text-primary flex-1 min-w-[140px]">
                  {p.name}
                  {p.role && <span className="text-2xs font-normal text-text-tertiary"> · {p.role}</span>}
                </span>
                {v ? (
                  <>
                    <Three label="costo" value={v.economic} tone="error" hint="imponibile: l'IVA detraibile non è un costo" />
                    <Three label="pagato" value={v.cash} tone="warning" hint="importo pagato al collaboratore" />
                    {!inv?.hasDocument && (
                      <span className="text-2xs font-semibold text-error" title="Senza documento il costo non è deducibile">
                        senza fattura
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-2xs text-text-tertiary">nessuna fattura per questo mese</span>
                )}
                <button onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}
                  className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80">
                  {inv ? 'dettaglio' : 'inserisci'}
                  <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {inv && (
                  <button onClick={() => run(() => deleteInvoice(inv.id), 'Fattura eliminata')} disabled={pending}
                    aria-label={`Elimina fattura di ${p.name}`} className="text-text-tertiary hover:text-error">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="mt-3 rounded-xl border border-border bg-background p-3 space-y-2">
                  <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {([
                      ['taxable', 'Imponibile'],
                      ['pension_fund', 'Cassa previdenziale'],
                      ['vat', 'IVA'],
                      ['withholding', 'Ritenuta d\'acconto'],
                      ['total_invoice', 'Totale fattura'],
                      ['amount_to_pay', 'Importo da pagare'],
                    ] as const).map(([k, label]) => {
                      const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
                      const val = inv ? Number((inv as unknown as Record<string, unknown>)[camel] ?? 0) : 0
                      return (
                        <div key={k} className="flex items-center justify-between gap-2">
                          <span className="text-2xs text-text-secondary truncate">{label}</span>
                          <Money value={val} small onSave={x => set({ [k]: x })} />
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex items-center gap-3 flex-wrap pt-1">
                    <label className="flex items-center gap-1.5 text-2xs text-text-secondary">
                      <input type="checkbox" checked={inv?.vatDeductible !== false} className="accent-gold w-3.5 h-3.5"
                        onChange={e => set({ vat_deductible: e.target.checked })} />
                      IVA detraibile
                    </label>
                    <label className="flex items-center gap-1.5 text-2xs text-text-secondary">
                      <input type="checkbox" checked={!!inv?.hasDocument} className="accent-gold w-3.5 h-3.5"
                        onChange={e => set({ has_document: e.target.checked })} />
                      Fattura ricevuta
                    </label>
                    <label className="flex items-center gap-1.5 text-2xs text-text-secondary">
                      <input type="checkbox" checked={inv?.paymentStatus === 'pagata'} className="accent-gold w-3.5 h-3.5"
                        onChange={e => set({
                          payment_status: e.target.checked ? 'pagata' : 'da_pagare',
                          paid_on: e.target.checked ? new Date().toISOString().slice(0, 10) : null,
                        })} />
                      Pagata
                    </label>
                  </div>

                  {v && (
                    <p className="text-2xs text-warning pt-1">
                      {eur(v.cash)} è l&apos;<strong>importo pagato al collaboratore</strong>, non il suo netto
                      personale: quanto gli resta dopo le sue imposte dipende dal suo regime, e Two Bee non lo conosce.
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * L'F24 del mese, contro i cedolini.
 *
 * Due cose si possono dire con certezza: se l'IRPEF trattenuta combacia con
 * l'erario del modello, e quanto dell'INPS resta a carico azienda una volta
 * tolte le trattenute. **Quanto** di quel residuo tocchi a ciascuno non si può
 * dedurre dall'F24, e infatti non lo si scrive da nessuna parte.
 */
export function F24Tab({ f24, slips, month, pending, run }: {
  f24: F24 | null
  slips: Payslip[]
  month: string
  pending: boolean
  run: Run
}) {
  const chk = useMemo(() => (f24 ? checkF24(f24, slips) : null), [f24, slips])
  const set = (patch: Record<string, unknown>) => run(() => upsertF24(month, patch))

  const FIELDS = [
    ['erario_gross', 'Ritenute Erario lorde', 'IRPEF e addizionali trattenute alle persone'],
    ['credit_offset', 'Credito compensato', 'quello che si porta in compensazione'],
    ['erario_balance', 'Saldo Erario', 'lordo meno credito'],
    ['inps', 'INPS', 'contributi dei lavoratori più quelli a carico azienda'],
    ['inail', 'INAIL', ''],
    ['other', 'Altro', ''],
    ['total', 'Totale F24', 'quello che esce dalla banca'],
  ] as const

  return (
    <div className="space-y-4">
      <div className={box}>
        <div className={head}>
          <h2 className="text-sm font-bold text-text-primary">Modello F24 del mese</h2>
          <p className="text-2xs text-text-tertiary mt-0.5">
            Un dato aziendale aggregato: non si ripartisce sui singoli senza il prospetto del consulente
          </p>
        </div>
        <div className="p-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map(([k, label, hint]) => {
            const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
            const val = f24 ? Number((f24 as unknown as Record<string, unknown>)[camel] ?? 0) : 0
            return (
              <div key={k} className="rounded-xl border border-border bg-background p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xs text-text-secondary">{label}</span>
                  <Money value={val} small onSave={x => set({ [k]: x })} />
                </div>
                {hint && <p className="text-2xs text-text-tertiary mt-0.5">{hint}</p>}
              </div>
            )
          })}
        </div>
        <div className="px-4 pb-4 flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-2xs text-text-secondary">
            <input type="checkbox" checked={!!f24?.paidOn} className="accent-gold w-3.5 h-3.5"
              onChange={e => set({ paid_on: e.target.checked ? new Date().toISOString().slice(0, 10) : null })} />
            Versato
          </label>
          <label className="flex items-center gap-1.5 text-2xs text-text-secondary">
            <input type="checkbox" checked={!!f24?.individualDetail} className="accent-gold w-3.5 h-3.5"
              onChange={e => set({ individual_detail: e.target.checked })} />
            Ho il prospetto individuale del consulente
          </label>
        </div>
      </div>

      {chk && slips.length > 0 && (
        <div className={box}>
          <div className={head}>
            <h2 className="text-sm font-bold text-text-primary">L&apos;F24 contro i cedolini</h2>
          </div>
          <div className="p-4 space-y-2">
            <Row label="IRPEF e addizionali trattenute nei cedolini" value={chk.withheldIrpef} />
            <Row label="Erario lordo del modello" value={f24!.erarioGross} />
            <div className={`rounded-xl border p-2.5 ${chk.irpefMatches ? 'border-success/30 bg-success-dim' : 'border-warning/40 bg-warning-dim'}`}>
              <p className="flex items-center gap-1.5 text-2xs font-semibold">
                {chk.irpefMatches
                  ? <><Check className="w-3.5 h-3.5 text-success" /><span className="text-text-primary">Combaciano: i cedolini spiegano tutta la ritenuta del modello.</span></>
                  : <><AlertTriangle className="w-3.5 h-3.5 text-warning" /><span className="text-text-primary">Differenza di {eur(chk.irpefDelta)}: o manca un cedolino, o l&apos;F24 comprende ritenute che non vengono dalle paghe.</span></>}
              </p>
            </div>

            <Row label="Contributi trattenuti alle persone" value={chk.withheldContrib} />
            <Row label="INPS del modello" value={f24!.inps} />
            <Row label="Residuo a carico azienda" value={chk.employerResidual} strong />

            {chk.aggregateOnly && (
              <div className="rounded-xl border border-warning/40 bg-warning-dim p-3">
                <p className="text-2xs font-bold text-text-primary">
                  Dato aziendale aggregato — ripartizione individuale non verificata
                </p>
                <p className="text-2xs text-text-secondary mt-1">
                  {eur(chk.employerResidual)} di contributi a carico azienda non sono attribuibili a testa
                  partendo dall&apos;F24. Per il costo esatto per persona serve uno di questi documenti:
                  prospetto costo aziendale per dipendente, riepilogo contributivo individuale, prospetto paghe
                  del consulente, dettaglio UniEmens.
                </p>
                <p className="text-2xs text-gold-text font-semibold mt-1.5">
                  Da chiedere al consulente: «Per ogni risorsa, potete inviarmi il prospetto mensile del costo
                  aziendale completo, con dettaglio di contributi a carico del datore, INAIL, TFR e altri oneri?»
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Il TFR: quanto matura, quanto se n'è andato, quanto resta.
 *
 * Quello che resta in azienda è un debito verso chi lavora, non liquidità: è
 * la distinzione che si scopre il giorno delle dimissioni, e conviene saperla
 * prima.
 */
export function TfrTab({ people, yearSlips, moves, month, pending, run }: {
  people: PersonRow[]
  yearSlips: Payslip[]
  moves: TfrMovement[]
  month: string
  pending: boolean
  run: Run
}) {
  const withTfr = people.filter(p => contractSpec(p.kind).tfr)
  const [adding, setAdding] = useState<string | null>(null)

  if (!withTfr.length) {
    return (
      <div className={box}>
        <p className="px-5 py-10 text-center text-2xs text-text-tertiary">
          Nessuno in organico matura TFR: lo maturano solo i contratti di lavoro subordinato.
        </p>
      </div>
    )
  }

  const total = withTfr.reduce((t, p) =>
    t + tfrLedger(p.id, yearSlips, moves, p.tfrOpening, month).inCompany, 0)

  return (
    <div className={box}>
      <div className={head}>
        <h2 className="text-sm font-bold text-text-primary">TFR</h2>
        <p className="text-2xs text-text-tertiary mt-0.5">
          <strong className="text-text-primary">{eur(total)}</strong> restano in azienda: è un debito verso
          le persone, non cassa disponibile
        </p>
      </div>

      <div className="divide-y divide-border/60">
        {withTfr.map(p => {
          const l = tfrLedger(p.id, yearSlips, moves, p.tfrOpening, month)
          const notAccrued = l.accruedMonth === 0
          return (
            <div key={p.id} className="px-5 py-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-sm font-semibold text-text-primary flex-1 min-w-[130px]">{p.name}</span>
                <Three label="nel mese" value={l.accruedMonth} tone={notAccrued ? 'warning' : 'success'}
                  hint={notAccrued ? 'nessun TFR registrato per questo mese' : undefined} />
                <Three label="nell'anno" value={l.accruedYear} />
                <Three label="in azienda" value={l.inCompany} tone="error" hint="debito verso la persona" />
                <button onClick={() => setAdding(adding === p.id ? null : p.id)}
                  className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80">
                  <Plus className="w-3 h-3" />movimento
                </button>
              </div>

              {(l.toFund > 0 || l.liquidated > 0 || l.advances > 0) && (
                <p className="text-2xs text-text-tertiary mt-1">
                  {l.toFund > 0 && `${eur(l.toFund)} al fondo · `}
                  {l.liquidated > 0 && `${eur(l.liquidated)} liquidati · `}
                  {l.advances > 0 && `${eur(l.advances)} di anticipi`}
                </p>
              )}
              {notAccrued && (
                <p className="text-2xs text-warning mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                  Nessun TFR nel mese: il costo di competenza è sottostimato finché non lo si inserisce nel cedolino.
                </p>
              )}

              {adding === p.id && (
                <TfrForm personId={p.id} month={month} pending={pending} run={run}
                  onDone={() => setAdding(null)} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TfrForm({ personId, month, pending, run, onDone }: {
  personId: string; month: string; pending: boolean; run: Run; onDone: () => void
}) {
  const [kind, setKind] = useState<'fondo' | 'liquidazione' | 'anticipo' | 'rivalutazione'>('fondo')
  const [amount, setAmount] = useState(0)

  return (
    <div className="mt-2 rounded-xl border border-border bg-background p-3 flex items-center gap-2 flex-wrap">
      <select value={kind} aria-label="Tipo di movimento"
        onChange={e => setKind(e.target.value as typeof kind)}
        className="bg-surface border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary">
        <option value="fondo">Versato a fondo pensione</option>
        <option value="liquidazione">Liquidato alla persona</option>
        <option value="anticipo">Anticipo</option>
        <option value="rivalutazione">Rivalutazione annua</option>
      </select>
      <Money value={amount} small onSave={setAmount} />
      <button
        onClick={() => run(async () => { await addTfrMovement(personId, month, kind, amount); onDone() }, 'Movimento registrato')}
        disabled={pending || amount === 0}
        className="flex items-center gap-1.5 text-2xs font-bold bg-gold text-on-gold rounded-lg px-2.5 py-1.5 press disabled:opacity-40">
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}Registra
      </button>
      <button onClick={onDone} className="text-2xs text-text-secondary hover:text-text-primary">Annulla</button>
    </div>
  )
}

// ── pezzi comuni ─────────────────────────────────────────────────────────────

function Three({ label, value, tone, hint }: {
  label: string; value: number; tone?: 'error' | 'warning' | 'success'; hint?: string
}) {
  return (
    <span className="text-2xs text-text-tertiary shrink-0" title={hint}>
      {label}{' '}
      <strong className={`tabular ${
        tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning'
        : tone === 'success' ? 'text-success' : 'text-text-primary'}`}>
        {eur0(value)}
      </strong>
    </span>
  )
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-2xs ${strong ? 'font-bold text-text-primary' : 'text-text-secondary'}`}>{label}</span>
      <span className={`text-2xs tabular ${strong ? 'font-bold text-text-primary' : 'text-text-secondary'}`}>{eur(value)}</span>
    </div>
  )
}

export const LEDGER_ICONS = { FileText, Receipt, Landmark, PiggyBank }

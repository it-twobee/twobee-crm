'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowUpRight, Check, Clock, Plus, Search, Target, X } from 'lucide-react'
import { addSalesContact, createSalesDeal, getSalesActivities, getSalesData, recordSalesOutcome, saveSalesDelivery, setSalesPermission, updateSalesDeal } from '@/app/actions/sales'
import { OUTCOMES, SALES_STAGES, isClosed, plusDays, salesMetrics, salesPriority, salesToday, type DealInput, type Delivery, type SalesActivity, type SalesData, type SalesDeal, type SalesOutcome } from '@/lib/sales'

const inputClass = 'w-full rounded-lg border border-border-interactive bg-background px-3 py-2 text-sm text-text-primary'
const secondary = 'rounded-lg border border-border-interactive px-3 py-2 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50'
const primary = 'rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-on-gold disabled:opacity-50'
const money = (n: number | null) => n === null ? 'n/d' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)
const dateLabel = (d: string | null) => d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : 'Da definire'
const stamp = (d: string) => new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })
type Run = (operation: () => Promise<unknown>, close?: boolean) => Promise<boolean>

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1 text-sm text-text-secondary"><span>{label}</span>{children}</label>
}
function Dialog({ title, onClose, busy, children }: { title: string; onClose: () => void; busy: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const el = ref.current; el?.showModal(); return () => el?.close() }, [])
  return <dialog ref={ref} aria-label={title} onCancel={e => { e.preventDefault(); if (!busy) onClose() }}
    className="m-auto max-h-[92dvh] w-[min(960px,96vw)] overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary backdrop:bg-scrim">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-surface px-5 py-4">
      <h2 className="text-lg font-semibold">{title}</h2><button type="button" aria-label="Chiudi" disabled={busy} onClick={onClose} className={secondary}><X className="h-4 w-4" /></button>
    </div><div className="p-5">{children}</div>
  </dialog>
}

export function SalesWorkspace({ initial, base }: { initial: SalesData; base: string }) {
  const [data, setData] = useState(initial)
  const [tab, setTab] = useState('oggi')
  const [search, setSearch] = useState('')
  const [owner, setOwner] = useState('')
  const [stage, setStage] = useState('')
  const [source, setSource] = useState('')
  const [board, setBoard] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const today = salesToday()
  const [from, setFrom] = useState(today.slice(0, 7) + '-01')
  const [to, setTo] = useState(today)
  const [accessOpen, setAccessOpen] = useState(false)
  useEffect(() => { setData(initial) }, [initial])

  const run: Run = async (operation, close = false) => {
    if (lock.current) return false
    lock.current = true; setBusy(true); setError('')
    let saved = false
    try {
      await operation()
      saved = true
      const fresh = await getSalesData()
      setData(fresh)
      if (close) { setCreating(false); setSelected(null) }
      toast.success('Salvato')
      return true
    } catch (e) {
      setError(saved ? 'Salvataggio riuscito, ma non è stato possibile aggiornare la schermata. Ricarica i dati prima di continuare.' : e instanceof Error ? e.message : 'Salvataggio non riuscito')
      return false
    } finally { lock.current = false; setBusy(false) }
  }
  async function reload() {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { setData(await getSalesData()); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Aggiornamento non riuscito') }
    finally { lock.current = false; setBusy(false) }
  }
  const errorNotice = error && <div role="alert" className="mt-3 space-y-2 rounded-lg bg-error-dim p-3 text-sm text-error"><p>{error}</p><button type="button" disabled={busy} className={secondary} onClick={() => void reload()}>Ricarica i dati salvati</button></div>
  const filtered = data.deals.filter(d => {
    const contact = data.contacts.find(c => c.id === d.contact_id)
    return (!owner || d.assigned_to === owner) && (!stage || d.stage === stage)
      && (!source || (d.source ?? 'Non dichiarata') === source)
      && [d.title, d.company_name, d.need, contact?.full_name, contact?.email, contact?.phone].join(' ').toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'))
  })
  const priorities = filtered.filter(d => salesPriority(d, today)).sort((a, b) => (a.resume_on ?? a.next_action_on ?? '').localeCompare(b.resume_on ?? b.next_action_on ?? ''))
  const current = data.deals.find(d => d.id === selected)
  const metrics = salesMetrics(filtered, from, to)
  const person = (id: string | null) => data.people.find(p => p.id === id)?.full_name ?? 'Da assegnare'
  const open = (id: string) => { setError(''); setSelected(id) }
  const card = (d: SalesDeal) => <button key={d.id} onClick={() => open(d.id)} className="w-full rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-hover">
    <div className="flex items-start justify-between gap-3"><div><p className="text-2xs text-text-tertiary">{d.company_name}</p><p className="mt-1 font-semibold text-text-primary">{d.title}</p></div><ArrowUpRight className="h-4 w-4 shrink-0 text-text-tertiary" /></div>
    <p className="mt-2 text-sm text-text-secondary">{d.resume_on ? `Da riprendere il ${dateLabel(d.resume_on)}` : d.next_action ?? (d.stage === 'chiuso_vinto' ? 'Passaggio alla delivery' : 'Trattativa chiusa')}</p>
    {salesPriority(d, today) && <p className="mt-2 text-2xs font-medium text-warning">{salesPriority(d, today)}</p>}
    <div className="mt-3 flex flex-wrap justify-between gap-2 text-2xs text-text-tertiary"><span>{person(d.assigned_to)}</span><span>{d.next_action_on ? dateLabel(d.next_action_on) : SALES_STAGES.find(s => s[0] === d.stage)?.[1]}</span></div>
  </button>

  return <div className="min-h-full space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-2xs uppercase tracking-widest text-gold-text">Relazioni e nuove opportunità</p><h1 className="mt-1 text-3xl font-semibold text-text-primary">Commerciale</h1>
      <p className="mt-2 text-sm text-text-secondary">{data.access === 'owner' ? 'Le tue trattative, il prossimo passo.' : 'Dalla prima conversazione al passaggio al team.'}</p></div>
      <div className="flex flex-wrap gap-2">{data.access === 'admin' && <button className={secondary} onClick={() => { setAccessOpen(!accessOpen); setError('') }}>Accessi</button>}
        <button className={primary + ' flex items-center gap-2'} onClick={() => { setError(''); setCreating(true) }}><Plus className="h-4 w-4" />Nuova opportunità</button></div>
    </header>
    <nav aria-label="Sezioni commerciale" className="flex gap-1 border-b border-border">{[['oggi', 'Oggi'], ['opportunita', 'Opportunità'], ['risultati', 'Risultati']].map(([key, label]) =>
      <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)} className={`px-4 py-3 text-sm ${tab === key ? 'border-b-2 border-gold font-semibold text-gold-text' : 'text-text-secondary hover:text-text-primary'}`}>{label}{key === 'oggi' && ` · ${priorities.length}`}</button>)}</nav>
    {!current && !creating && errorNotice}
    {accessOpen && data.access === 'admin' && <section className="rounded-xl border border-border bg-surface p-4"><h2 className="font-semibold">Accessi commerciali</h2>
      <p className="my-2 text-sm text-text-secondary">Le persone abilitate gestiscono le proprie opportunità. I manager abilitati vedono e coordinano tutte le trattative. Gli admin hanno già accesso.</p>
      <div className="grid gap-2 sm:grid-cols-2">{data.people.filter(p => !['admin', 'founder', 'super_admin'].includes(p.app_role ?? '')).map(p => <label key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
        <input type="checkbox" checked={p.enabled} disabled={busy} onChange={e => void run(() => setSalesPermission(p.id, e.target.checked))} />{p.full_name}<span className="text-text-tertiary">{p.app_role}</span>
      </label>)}</div>
    </section>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="relative"><span className="sr-only">Cerca opportunità, aziende e referenti</span><Search className="absolute left-3 top-3 h-4 w-4 text-text-tertiary" /><input className={inputClass + ' pl-9'} placeholder="Cerca azienda, referente, esigenza…" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <select aria-label="Responsabile" className={inputClass} value={owner} onChange={e => setOwner(e.target.value)}><option value="">Tutti i responsabili</option>{data.people.filter(p => p.enabled).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
      <select aria-label="Fase" className={inputClass} value={stage} onChange={e => setStage(e.target.value)}><option value="">Tutte le fasi</option>{SALES_STAGES.map(s => <option key={s[0]} value={s[0]}>{s[1]}</option>)}</select>
      <select aria-label="Fonte" className={inputClass} value={source} onChange={e => setSource(e.target.value)}><option value="">Tutte le fonti</option>{Array.from(new Set(data.deals.map(d => d.source ?? 'Non dichiarata'))).sort().map(s => <option key={s}>{s}</option>)}</select>
    </div>
    {tab === 'oggi' && <section className="space-y-4"><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-gold-text" /><h2 className="text-lg font-semibold">Da seguire oggi</h2><span className="text-sm text-text-tertiary">{dateLabel(today)}</span></div>
      {priorities.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{priorities.map(card)}</div> : <Empty text="Nessuna azione da gestire oggi con questi filtri." />}
      <p className="text-2xs text-text-tertiary">Comprende follow-up scaduti, riprese da confermare, informazioni mancanti, opportunità ferme da 14 giorni e passaggi alla delivery aperti.</p>
    </section>}
    {tab === 'opportunita' && <section className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{filtered.length} opportunità</h2><button className={secondary} onClick={() => setBoard(!board)}>{board ? 'Mostra elenco' : 'Mostra pipeline'}</button></div>
      {board ? <div className="flex gap-3 overflow-x-auto pb-4">{SALES_STAGES.map(s => <div key={s[0]} className="w-72 shrink-0 space-y-3 rounded-xl bg-surface-hover p-3"><h3 className="font-semibold">{s[1]} <span className="text-text-tertiary">{filtered.filter(d => d.stage === s[0] && !d.resume_on).length}</span></h3><p className="min-h-10 text-2xs text-text-tertiary">{s[2]}</p>{filtered.filter(d => d.stage === s[0] && !d.resume_on).map(card)}</div>)}
        <div className="w-72 shrink-0 space-y-3 rounded-xl bg-surface-hover p-3"><h3 className="font-semibold">Da riprendere</h3>{filtered.filter(d => d.resume_on).map(card)}</div>
      </div> : filtered.length ? <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-left text-sm"><thead className="bg-surface-hover text-text-secondary"><tr>{['Opportunità', 'Fase', 'Prossima azione', 'Responsabile', 'Canone / mese', 'Setup', 'Una tantum'].map(x => <th key={x} className="whitespace-nowrap p-3 font-medium">{x}</th>)}</tr></thead><tbody>{filtered.map(d => <tr key={d.id} className="border-t border-border"><td className="p-3"><button className="text-left font-medium text-gold-text hover:underline" onClick={() => open(d.id)}>{d.title}</button><p className="text-2xs text-text-tertiary">{d.company_name}</p></td><td className="p-3">{d.resume_on ? 'Da riprendere' : SALES_STAGES.find(s => s[0] === d.stage)?.[1]}</td><td className="p-3">{d.next_action ?? '—'}<p className="text-2xs text-text-tertiary">{d.resume_on || d.next_action_on ? dateLabel(d.resume_on ?? d.next_action_on) : ''}</p></td><td className="p-3">{person(d.assigned_to)}</td>{[d.monthly_value, d.setup_value, d.one_off_value].map((v, i) => <td key={i} className="whitespace-nowrap p-3 tabular-nums">{money(v)}</td>)}</tr>)}</tbody></table></div> : <Empty text="Nessuna opportunità. Inizia da un nome e un recapito." />}
    </section>}
    {tab === 'risultati' && <section className="space-y-5"><div className="flex flex-wrap gap-3"><Field label="Dal"><input className={inputClass} type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="Al"><input className={inputClass} type="date" value={to} onChange={e => setTo(e.target.value)} /></Field></div>
      {!from || !to || from > to ? <p role="alert" className="text-warning">Scegli un periodo valido.</p> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Aperte nel periodo', String(metrics.opened)], ['Vinte / perse nel periodo', `${metrics.won} / ${metrics.lost}`], ['Win rate', metrics.winRate === null ? 'n/d' : `${metrics.winRate.toFixed(1)}%`], ['Ciclo medio apertura → vittoria', metrics.cycleDays === null ? 'n/d' : `${metrics.cycleDays.toFixed(1)} giorni`]].map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div>
      <p className="text-2xs text-text-tertiary">Win rate = vinte / (vinte + perse), per data di chiusura. Fonte: opportunità CRM visibili con i filtri selezionati. Le chiusure storiche senza data non entrano nei risultati.</p>
      </>}
      <h3 className="font-semibold">Previsione ponderata delle opportunità aperte adesso</h3><div className="grid gap-3 sm:grid-cols-3">{[['Canoni mensili', metrics.monthly], ['Setup', metrics.setup], ['Una tantum', metrics.oneOff]].map(([label, m]) => { const value = m as typeof metrics.monthly; return <Metric key={String(label)} label={String(label)} value={money(value.value)} hint={`${value.missing} importi non dichiarati`} /> })}</div>
      <p className="text-2xs text-text-tertiary">Stime commerciali, IVA esclusa. Probabilità iniziali per fase: {SALES_STAGES.slice(0, 6).map(s => `${s[1]} ${s[3]}%`).join(' · ')}. Le opportunità da riprendere sono escluse. Il forecast rappresenta la pipeline attuale, indipendentemente dal periodo scelto.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left font-semibold">Distribuzione attuale per fase</caption><tbody>{SALES_STAGES.map(s => <tr key={s[0]} className="border-b border-border"><th className="py-2 font-normal">{s[1]}</th><td>{filtered.filter(d => d.stage === s[0] && !d.resume_on).length}</td></tr>)}</tbody></table></div>
      <p className="rounded-lg bg-surface-hover p-4 text-sm text-text-secondary">CPC, CPL e conversione clic → lead: n/d. Le fonti pubblicitarie e l’import marketing non sono ancora collegati.</p>
      <p className="text-2xs text-text-tertiary">Ultimo caricamento: {stamp(data.loadedAt)}. Gli importi storici senza tipologia non vengono riclassificati automaticamente.</p>
    </section>}
    {creating && <Dialog title="Nuova opportunità" busy={busy} onClose={() => setCreating(false)}><DealForm data={data} busy={busy} run={run} />{errorNotice}</Dialog>}
    {current && <Dialog title={current.title} busy={busy} onClose={() => setSelected(null)}><DealDetail key={`${current.id}:${current.revision}`} deal={current} data={data} base={base} busy={busy} run={run} />{errorNotice}</Dialog>}
  </div>
}

function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-border p-10 text-center text-text-secondary"><Target className="mx-auto mb-3 h-7 w-7 text-text-tertiary" />{text}</div> }
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) { return <div className="rounded-xl border border-border bg-surface p-4"><p className="text-sm text-text-secondary">{label}</p><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>{hint && <p className="mt-2 text-2xs text-text-tertiary">{hint}</p>}</div> }

function DealForm({ deal, data, busy, run }: { deal?: SalesDeal; data: SalesData; busy: boolean; run: Run }) {
  const [requestId] = useState(() => crypto.randomUUID())
  const [client, setClient] = useState(deal?.client_id ?? '')
  const [company, setCompany] = useState(deal?.company_name ?? '')
  const [name, setName] = useState(deal?.title ?? '')
  const [touched, setTouched] = useState(!!deal)
  const [confirmNew, setConfirmNew] = useState(false)
  const [expanded, setExpanded] = useState(!!deal)
  const matches = company.trim().length >= 2 ? data.clients.filter(c => c.name.toLocaleLowerCase('it').includes(company.toLocaleLowerCase('it').trim())).slice(0, 6) : []
  const clients = deal ? data.clients.filter(c => c.id === deal.client_id) : data.clients
  async function submit(form: HTMLFormElement) {
    if (!deal && !client && matches.length && !confirmNew) { toast.error('Scegli una corrispondenza o conferma che è una nuova azienda'); return }
    const f = new FormData(form)
    const text = (k: string) => String(f.get(k) ?? '').trim()
    const number = (k: string) => text(k) === '' ? null : Number(text(k))
    const input: DealInput = {
      title: name.trim() || company.trim(), client_id: client || null, company_name: company,
      contact_name: text('contact_name'), contact_email: text('contact_email'), contact_phone: text('contact_phone'),
      contact_id: text('contact_id') || null, assigned_to: text('assigned_to') || data.actor,
      source: text('source'), need: text('need'), blocker: text('blocker'),
      stage: (text('stage') || 'lead') as DealInput['stage'], next_action: text('next_action') || 'Primo contatto',
      next_action_on: text('next_action_on') || salesToday(), monthly_value: number('monthly_value'),
      setup_value: number('setup_value'), one_off_value: number('one_off_value'), proposal_ref: text('proposal_ref'),
    }
    await run(() => deal ? updateSalesDeal(requestId, deal.id, deal.revision, input) : createSalesDeal(requestId, input), !deal)
  }
  return <form onSubmit={e => { e.preventDefault(); void submit(e.currentTarget) }}><fieldset disabled={busy} className="space-y-4">
    {!deal && <Field label="Azienda già in anagrafica"><select className={inputClass} value={client} onChange={e => { setClient(e.target.value); const c = data.clients.find(x => x.id === e.target.value); if (c) { setCompany(c.name); if (!touched) setName(c.name) } }}><option value="">Nuova azienda o contatto</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
    {!client && !deal && <><Field label="Nome azienda o contatto"><input required maxLength={500} className={inputClass} value={company} onChange={e => { setCompany(e.target.value); setConfirmNew(false); if (!touched) setName(e.target.value) }} /></Field>
      {matches.length > 0 && <div className="rounded-lg border border-border p-3 text-sm"><p className="mb-2 text-text-secondary">Possibili corrispondenze</p>{matches.map(c => <button type="button" key={c.id} className="mr-2 mb-2 rounded-lg bg-surface-hover px-3 py-2 text-gold-text" onClick={() => { setClient(c.id); setCompany(c.name); if (!touched) setName(c.name) }}>{c.name}</button>)}<label className="flex gap-2"><input type="checkbox" checked={confirmNew} onChange={e => setConfirmNew(e.target.checked)} />È un’altra azienda: crea una nuova anagrafica.</label></div>}
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Email"><input name="contact_email" type="email" maxLength={500} className={inputClass} /></Field><Field label="Telefono (in alternativa all’email)"><input name="contact_phone" type="tel" maxLength={500} className={inputClass} /></Field></div>
      <Field label="Nome referente, se conosciuto"><input name="contact_name" maxLength={500} className={inputClass} /></Field>
    </>}
    <Field label="Opportunità"><input required className={inputClass} maxLength={500} value={name} onChange={e => { setName(e.target.value); setTouched(true) }} /></Field>
    {client && <Field label="Referente"><select key={client} className={inputClass} name="contact_id" defaultValue={deal?.contact_id ?? ''}><option value="">Da individuare</option>{data.contacts.filter(c => c.client_id === client).map(c => <option key={c.id} value={c.id}>{c.full_name} · {c.email || c.phone}</option>)}</select></Field>}
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Fonte, se conosciuta"><input className={inputClass} name="source" maxLength={500} defaultValue={deal?.source ?? ''} placeholder="Referral, sito, evento…" /></Field><Field label="Responsabile"><select name="assigned_to" className={inputClass} defaultValue={deal?.assigned_to ?? data.actor}>{data.people.filter(p => p.enabled && (data.access !== 'owner' || p.id === data.actor)).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field></div>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Prossima azione"><input required className={inputClass} name="next_action" maxLength={500} defaultValue={deal?.next_action ?? 'Primo contatto'} /></Field><Field label="Data"><input required type="date" className={inputClass} name="next_action_on" defaultValue={deal?.next_action_on ?? salesToday()} /></Field></div>
    <button type="button" className="text-sm text-gold-text" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Nascondi approfondimenti' : 'Esigenza, proposta e stime'}</button>
    <div hidden={!expanded} className="space-y-4"><Field label="Esigenza"><textarea className={inputClass} name="need" rows={3} maxLength={8000} defaultValue={deal?.need ?? ''} /></Field><Field label="Impedimento attuale"><textarea className={inputClass} name="blocker" rows={2} maxLength={8000} defaultValue={deal?.blocker ?? ''} /></Field>
      {deal && <Field label="Fase"><select className={inputClass} name="stage" defaultValue={deal.stage}>{SALES_STAGES.filter(s => !isClosed(s[0])).map(s => <option key={s[0]} value={s[0]}>{s[1]} — {s[2]}</option>)}</select></Field>}
      <div className="grid gap-3 sm:grid-cols-3">{[['monthly_value', 'Canone mensile stimato'], ['setup_value', 'Setup stimato'], ['one_off_value', 'Una tantum stimata']].map(([key, label]) => <Field key={key} label={label}><input className={inputClass} name={key} type="number" min="0" max="999999999" step="0.01" placeholder="n/d" defaultValue={deal?.[key as 'monthly_value'] ?? ''} /></Field>)}</div>
      <p className="text-2xs text-text-tertiary">Stime in euro, IVA esclusa. Non alimentano fatturato, MRR o contratti.</p><Field label="Proposta · riferimento e versione"><input name="proposal_ref" maxLength={500} className={inputClass} defaultValue={deal?.proposal_ref ?? ''} placeholder="Es. Proposta sito v2 del 15/09/2026" /></Field>
    </div><div className="flex justify-end"><button className={primary} type="submit">{busy ? 'Salvataggio…' : deal ? 'Salva scheda' : 'Crea opportunità'}</button></div>
  </fieldset></form>
}

function DealDetail({ deal, data, base, busy, run }: { deal: SalesDeal; data: SalesData; base: string; busy: boolean; run: Run }) {
  const [section, setSection] = useState(deal.stage === 'chiuso_vinto' ? 'delivery' : 'esito')
  const [activities, setActivities] = useState<SalesActivity[]>([])
  const [historyError, setHistoryError] = useState('')
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  useEffect(() => { let alive = true; getSalesActivities(deal.id).then(rows => { if (alive) { setActivities(rows); setMore(rows.length === 50) } }).catch(e => { if (alive) setHistoryError(e.message) }).finally(() => { if (alive) setLoading(false) }); return () => { alive = false } }, [deal.id, deal.revision])
  const contact = data.contacts.find(c => c.id === deal.contact_id)
  return <div className="space-y-5">
    <div className="grid gap-4 rounded-xl bg-surface-hover p-4 sm:grid-cols-2"><div><p className="text-2xs text-text-tertiary">Azienda e referente</p><p className="mt-1 font-medium">{deal.company_name}</p><p className="text-sm text-text-secondary">{contact ? `${contact.full_name} · ${contact.email || contact.phone}` : 'Referente da individuare'}</p>{deal.client_id && <Link className="mt-2 inline-block text-sm text-gold-text" href={`${base}/clienti/${deal.client_id}`}>Apri anagrafica ↗</Link>}</div><div><p className="text-2xs text-text-tertiary">{SALES_STAGES.find(s => s[0] === deal.stage)?.[1]} · {data.people.find(p => p.id === deal.assigned_to)?.full_name ?? 'Da assegnare'}</p><p className="mt-1 font-medium">{deal.next_action ?? (deal.stage === 'chiuso_vinto' ? 'Passaggio alla delivery' : 'Trattativa chiusa')}</p><p className="text-sm text-text-secondary">{deal.resume_on ? `Da riprendere: ${dateLabel(deal.resume_on)}` : deal.next_action_on ? dateLabel(deal.next_action_on) : ''}</p></div>
      <div><p className="text-2xs text-text-tertiary">Esigenza</p><p className="whitespace-pre-wrap text-sm">{deal.need || 'Da approfondire'}</p></div><div><p className="text-2xs text-text-tertiary">Impedimento</p><p className="whitespace-pre-wrap text-sm">{deal.blocker || 'Nessuno dichiarato'}</p></div>
    </div>
    <nav aria-label="Dettaglio opportunità" className="flex flex-wrap gap-2">{[['esito', 'Cosa è successo?'], ...(!isClosed(deal.stage) ? [['scheda', 'Scheda']] : []), ...(!deal.delivery_completed_at ? [['referente', 'Aggiungi referente']] : []), ...(deal.stage === 'chiuso_vinto' ? [['delivery', 'Passaggio alla delivery']] : []), ['storico', 'Storico']].map(([key, label]) => <button key={key} type="button" onClick={() => setSection(key)} aria-current={section === key ? 'page' : undefined} className={section === key ? primary : secondary}>{label}</button>)}</nav>
    {section === 'referente' && <ContactForm deal={deal} busy={busy} run={run} />}
    {section === 'scheda' && <DealForm deal={deal} data={data} busy={busy} run={run} />}
    {section === 'esito' && <OutcomeForm deal={deal} busy={busy} run={run} />}
    {section === 'delivery' && <DeliveryForm deal={deal} data={data} base={base} busy={busy} run={run} />}
    {(section === 'storico' || section === 'esito') && <section className="space-y-3 border-t border-border pt-4"><h3 className="font-semibold">Storico della relazione</h3>{loading && <p role="status" className="text-sm text-text-secondary">Caricamento…</p>}{historyError && <p role="alert" className="text-error">{historyError}</p>}{!loading && !activities.length && !historyError && <p className="text-sm text-text-tertiary">Nessuna attività registrata.</p>}
      {activities.map(a => <article key={a.id} className="border-l-2 border-border pl-4"><p className="text-2xs text-text-tertiary">{stamp(a.created_at)} · {data.people.find(p => p.id === a.created_by)?.full_name ?? 'Autore non disponibile'}{a.outcome && Object.hasOwn(OUTCOMES, a.outcome) ? ` · ${OUTCOMES[a.outcome as SalesOutcome]}` : ''}</p><p className="mt-1 whitespace-pre-wrap text-sm">{a.content}</p>{a.next_action_on && <p className="text-2xs text-text-secondary">Prossimo appuntamento: {dateLabel(a.next_action_on)}</p>}</article>)}
      {more && <button className={secondary} disabled={loading} onClick={async () => { setLoading(true); try { const rows = await getSalesActivities(deal.id, activities.length); setActivities([...activities, ...rows]); setMore(rows.length === 50) } catch (e) { setHistoryError(e instanceof Error ? e.message : 'Errore di caricamento') } finally { setLoading(false) } }}>Carica precedenti</button>}
    </section>}
  </div>
}

function ContactForm({ deal, busy, run }: { deal: SalesDeal; busy: boolean; run: Run }) {
  const [requestId] = useState(() => crypto.randomUUID())
  return <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(() => addSalesContact(requestId, deal.id, deal.revision, {
    full_name: String(f.get('full_name') ?? '').trim(), email: String(f.get('email') ?? '').trim(),
    phone: String(f.get('phone') ?? '').trim(), role: String(f.get('role') ?? '').trim(),
  })) }}><fieldset disabled={busy} className="space-y-3"><p className="text-sm text-text-secondary">Il referente viene aggiunto all’anagrafica di {deal.company_name} e collegato a questa opportunità.</p>
    <Field label="Nome e cognome"><input name="full_name" required maxLength={500} className={inputClass} /></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Email"><input name="email" type="email" maxLength={500} className={inputClass} /></Field><Field label="Telefono"><input name="phone" type="tel" maxLength={500} className={inputClass} /></Field></div>
    <Field label="Ruolo in azienda"><input name="role" maxLength={500} className={inputClass} /></Field><button className={primary} type="submit">Aggiungi e collega</button>
  </fieldset></form>
}

function OutcomeForm({ deal, busy, run }: { deal: SalesDeal; busy: boolean; run: Run }) {
  const [requestId] = useState(() => crypto.randomUUID())
  const [outcome, setOutcome] = useState<SalesOutcome>('nota')
  const [date, setDate] = useState('')
  return <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(() => recordSalesOutcome(requestId, deal.id, deal.revision, { outcome, content: String(f.get('content') ?? ''), date: date || null, next_action: String(f.get('next_action') ?? ''), proposal_ref: String(f.get('proposal_ref') ?? '') })) }}><fieldset disabled={busy} className="space-y-3">
    <Field label="Esito"><select className={inputClass} value={outcome} onChange={e => setOutcome(e.target.value as SalesOutcome)}>{Object.entries(OUTCOMES).filter(([key]) => !isClosed(deal.stage) || key === 'nota').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
    <Field label={outcome === 'persa' ? 'Motivo della perdita' : outcome === 'vinta' ? 'Conferma dell’accettazione ricevuta' : 'Cosa è successo?'}><textarea required maxLength={8000} name="content" className={inputClass} rows={3} placeholder="Registra ciò che è effettivamente avvenuto…" /></Field>
    {!['vinta', 'persa', 'nota'].includes(outcome) && <><div className="flex flex-wrap items-end gap-2"><Field label={outcome === 'incontro' ? 'Data dell’incontro' : 'Prossima data'}><input className={inputClass} type="date" value={date} required={['ricontattare', 'incontro', 'pausa', 'riattiva'].includes(outcome)} onChange={e => setDate(e.target.value)} /></Field><button type="button" className={secondary} onClick={() => setDate(plusDays(salesToday(), 1))}>Domani</button><button type="button" className={secondary} onClick={() => setDate(plusDays(salesToday(), 7))}>Tra una settimana</button></div><Field label="Prossima azione"><input name="next_action" className={inputClass} maxLength={500} placeholder={outcome === 'incontro' ? 'Incontro' : 'Ricontattare'} /></Field></>}
    {outcome === 'proposta' && <Field label="Riferimento e versione della proposta inviata"><input required name="proposal_ref" className={inputClass} maxLength={500} defaultValue={deal.proposal_ref ?? ''} /></Field>}
    {outcome === 'vinta' && <p className="rounded-lg bg-info-dim p-3 text-sm text-info">Proposta accettata: {deal.proposal_ref || 'da indicare nella scheda'}. La vittoria apre il passaggio guidato alla delivery; ricavi, fatture e MRR dipendono dai contratti.</p>}
    {outcome === 'persa' && <p className="text-sm text-text-secondary">Verrà chiusa questa opportunità. L’anagrafica mantiene il proprio stato.</p>}
    <button type="submit" className={primary}>{busy ? 'Registrazione…' : 'Registra esito'}</button>
  </fieldset></form>
}

const deliveryLabels: [keyof Delivery, string][] = [['goals', 'Esigenza e obiettivi'], ['services', 'Servizi venduti'], ['included', 'Inclusioni'], ['excluded', 'Esclusioni'], ['promises', 'Promesse e dipendenze'], ['materials', 'Materiali necessari'], ['missing', 'Cosa manca per il passaggio']]
function DeliveryForm({ deal, data, base, busy, run }: { deal: SalesDeal; data: SalesData; base: string; busy: boolean; run: Run }) {
  const [requestId] = useState(() => crypto.randomUUID())
  const [destination, setDestination] = useState('new')
  const [confirmed, setConfirmed] = useState(false)
  async function submit(form: HTMLFormElement, complete: boolean) {
    const f = new FormData(form)
    const delivery = Object.fromEntries(deliveryLabels.map(([k]) => [k, String(f.get(k) ?? '')])) as Delivery
    await run(() => saveSalesDelivery(requestId, deal.id, deal.revision, {
      delivery, delivery_owner_id: String(f.get('delivery_owner_id') ?? '') || null,
      contact_id: String(f.get('contact_id') ?? '') || null, proposal_ref: String(f.get('proposal_ref') ?? ''),
      project_id: destination === 'new' ? null : destination,
      service_id: String(f.get('service_id') ?? '') || null, complete,
    }))
  }
  if (deal.delivery_completed_at) return <div className="space-y-4"><p className="flex items-center gap-2 text-success"><Check className="h-5 w-5" />Passaggio confermato il {dateLabel(deal.delivery_completed_at)}</p>{data.projects.some(p => p.id === deal.delivery_project_id) ? <Link className={primary + ' inline-block'} href={`${base}/progetti/${deal.delivery_project_id}`}>Apri il progetto</Link> : <p className="text-sm text-text-secondary">Il progetto è in carico al team operativo.</p>}<dl className="space-y-3">{deliveryLabels.map(([key, label]) => <div key={key}><dt className="text-2xs text-text-tertiary">{label}</dt><dd className="whitespace-pre-wrap text-sm">{deal.delivery[key] || 'Nessuno dichiarato'}</dd></div>)}</dl></div>
  return <form onSubmit={e => { e.preventDefault(); const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; void submit(e.currentTarget, submitter?.value === 'complete') }}><fieldset disabled={busy} className="space-y-4">
    <p className="text-sm text-text-secondary">Verifica il riepilogo con il team. Puoi salvarlo e riprendere il passaggio quando le informazioni sono complete. Dove non serve nulla, scrivilo esplicitamente.</p>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Chi deve completare il passaggio"><select className={inputClass} name="delivery_owner_id" defaultValue={deal.delivery_owner_id ?? ''}><option value="">Da assegnare</option>{data.people.filter(p => p.enabled).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field><Field label="Referente cliente"><select className={inputClass} name="contact_id" defaultValue={deal.contact_id ?? ''}><option value="">Da individuare</option>{data.contacts.filter(c => c.client_id === deal.client_id).map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></Field></div>
    <Field label="Proposta accettata · riferimento e versione"><input name="proposal_ref" maxLength={500} className={inputClass} defaultValue={deal.proposal_ref ?? ''} /></Field>
    <div className="grid gap-4 sm:grid-cols-2">{deliveryLabels.map(([key, label]) => <Field key={key} label={label}><textarea className={inputClass} name={key} rows={3} maxLength={8000} defaultValue={deal.delivery[key] ?? (key === 'goals' ? deal.need ?? '' : '')} /></Field>)}</div>
    {data.access !== 'owner' && <><Field label="Destinazione del lavoro"><select value={destination} className={inputClass} onChange={e => setDestination(e.target.value)}><option value="new">Apri un nuovo progetto in bozza</option>{data.projects.filter(p => p.client_id === deal.client_id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      {destination === 'new' && <Field label="Servizio di partenza per il progetto"><select name="service_id" className={inputClass}><option value="">Scegli dal catalogo</option>{data.services.map(s => <option key={s.id} value={s.id}>{s.label} · {s.area}</option>)}</select></Field>}
      <p className="text-sm text-text-secondary">Il team potrà completare workstream e milestone dalla scheda progetto. Contratti e condizioni economiche vengono gestiti dagli admin in Economics.</p>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Ho verificato proposta, perimetro, referenti e materiali. Confermo il passaggio al team.</label>
    </>}
    <div className="flex flex-wrap gap-3"><button type="submit" value="save" className={secondary}>Salva e riprendi dopo</button>{data.access !== 'owner' && <button type="submit" value="complete" className={primary} disabled={!confirmed || busy}>Conferma passaggio alla delivery</button>}</div>
  </fieldset></form>
}

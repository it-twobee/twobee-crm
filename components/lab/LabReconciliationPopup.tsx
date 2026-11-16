'use client'
import { useEffect, useRef, useState } from 'react'
import { X, Search } from 'lucide-react'
import Link from '@/components/lab/LabLink'
import { matchingPlan, type MatchMovement, type MatchDocument } from '@/lib/lab-matching'
import type { ReconciliationData } from '@/lib/lab-reconciliation-types'
import type { ReconciliationRequest } from '@/components/lab/LabReconciliationProvider'
import { eur2 } from '@/lib/money'
const field = 'min-h-11 min-w-0 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary'
const button = 'min-h-11 rounded-xl border border-border-interactive px-3 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50'
const money = (v: number | null, c: string) => v == null ? 'Da verificare' : c === 'EUR' ? eur2(v) : `${v.toFixed(2)} ${c}`
type Filter = { q: string; from: string; to: string; account: string; side: string; all: boolean }
const empty: Filter = { q: '', from: '', to: '', account: '', side: '', all: false }
export default function LabReconciliationPopup({ request, onClose, onSaved }: { request: ReconciliationRequest; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), search = useRef<HTMLInputElement>(null), intent = useRef({ signature: '', command: '' }), initial = useRef('')
  const [data, setData] = useState<ReconciliationData | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [pending, setPending] = useState(false), [discard, setDiscard] = useState(false)
  const [movements, setMovements] = useState<string[]>([]), [invoices, setInvoices] = useState<string[]>([]), [note, setNote] = useState('')
  const [left, setLeft] = useState<Filter>(empty), [right, setRight] = useState<Filter>(empty), [limits, setLimits] = useState([40, 40]), [tab, setTab] = useState<'movimenti' | 'fatture'>('movimenti')
  const operation = request.operation ?? 'save', readOnly = operation !== 'save'
  const load = async (preserve = false) => {
    setLoading(true); setError('')
    try {
      const p = new URLSearchParams({ ...(request.editId ? { edit: request.editId } : {}), ...(request.adoptMovement ? { adopt: request.adoptMovement } : {}), ...(request.movementId ? { movement: request.movementId } : {}) })
      const response = await fetch(`/api/lab/reconciliations?${p}`, { cache: 'no-store' }); const body = await response.json()
      if (!response.ok) throw new Error(body.message)
      const next = body as ReconciliationData
      const ms = next.pairs.length ? Array.from(new Set(next.pairs.map(p => p.movementId))) : request.movementId ? [request.movementId] : next.adoptMovement ? [next.adoptMovement] : []
      const ds = next.pairs.length ? Array.from(new Set(next.pairs.map(p => p.documentId))) : request.documentId ? [request.documentId] : next.adoptInvoice ? [next.adoptInvoice] : []
      const savedNote = next.records.find(r => r.id === next.editId)?.note ?? ''
      if (ms.some(id => !next.movements.some(m => m.id === id)) || ds.some(id => !next.invoices.some(d => d.id === id))) setError('Una voce richiesta non è disponibile: seleziona le fonti aggiornate.')
      setData(next); setMovements(preserve ? movements.filter(id => next.movements.some(m => m.id === id)) : ms.filter(id => next.movements.some(m => m.id === id))); setInvoices(preserve ? invoices.filter(id => next.invoices.some(d => d.id === id)) : ds.filter(id => next.invoices.some(d => d.id === id))); setNote(preserve ? note : savedNote); initial.current = JSON.stringify([ms, ds, savedNote]); intent.current = { signature: '', command: '' }
    } catch (e) { setError(e instanceof Error ? e.message : 'Fonti non disponibili. Riprova.'); setData(null) }
    finally { setLoading(false) }
  }
  useEffect(() => { dialog.current?.showModal(); void load(); return () => dialog.current?.close() }, [])
  useEffect(() => { if (data) search.current?.focus() }, [data])
  const close = () => { if (pending) return; if (!readOnly && data && initial.current !== JSON.stringify([movements, invoices, note])) setDiscard(true); else onClose() }
  const plan = matchingPlan(data?.movements ?? [], data?.invoices ?? [], movements, invoices)
  const selectedCurrency = data?.movements.find(m => movements.includes(m.id))?.currency ?? data?.invoices.find(d => invoices.includes(d.id))?.currency ?? 'EUR'
  const selectedDirection = data?.movements.find(m => movements.includes(m.id))?.signedAmount
  const filterRows = <T extends MatchMovement | MatchDocument>(rows: T[], f: Filter, selected: string[]) => rows.filter(row => selected.includes(row.id) ||
    ((!f.q || `${row.label} ${row.id} ${row.date} ${'account' in row ? `${row.account} ${row.description ?? ''} ${money(row.signedAmount, row.currency)} ${row.signedAmount}` : `${money(row.total, row.currency)} ${row.total ?? ''}`} ${money('available' in row ? row.available : row.remaining, row.currency)}`.toLocaleLowerCase('it').includes(f.q.toLocaleLowerCase('it')))
    && (!f.from || row.date >= f.from) && (!f.to || row.date <= f.to)
    && (!f.account || 'accountId' in row && row.accountId === f.account)
    && (!f.side || ('signedAmount' in row ? f.side === 'in' ? row.signedAmount > 0 : row.signedAmount < 0 : row.side === f.side))
    && (f.all || !row.why && ('available' in row ? row.available ?? 0 : row.remaining ?? 0) > 0)))
    .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
  const leftRows = filterRows(data?.movements ?? [], left, movements), rightRows = filterRows(data?.invoices ?? [], right, invoices)
  const save = async () => {
    if (!data || pending) return
    setPending(true); setError('')
    const payload = { id: request.editId ?? null, version: data.version, operation, basis: data.basis, movements, invoices, note, adoptMovement: data.adoptMovement }
    const signature = JSON.stringify(payload)
    if (signature !== intent.current.signature) intent.current = { signature, command: crypto.randomUUID() }
    try {
      const response = await fetch('/api/lab/reconciliations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, command: intent.current.command }) })
      const body = await response.json(); if (!response.ok) throw new Error(body.message)
      onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'Salvataggio non completato. Puoi riprovare senza duplicare il raccordo.') }
    finally { setPending(false) }
  }
  return <dialog ref={dialog} onCancel={e => { e.preventDefault(); close() }} aria-labelledby="raccordo-title" className="m-auto max-h-[96dvh] w-[96vw] max-w-7xl rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-pop backdrop:bg-scrim">
    <div className="flex max-h-[94dvh] flex-col">
      <header className="shrink-0 border-b border-border p-4 sm:px-6"><div className="flex items-start justify-between gap-3"><div><h2 id="raccordo-title" className="text-lg font-semibold">{operation === 'cancel' || operation === 'unlink_legacy' ? 'Rimuovi raccordo' : operation === 'verify' ? 'Verifica raccordo' : request.editId ? 'Modifica e ottimizza il raccordo' : 'Collega banca e fatture'}</h2><p className="mt-1 text-sm text-text-secondary">Cerca nei due elenchi, spunta le voci e controlla le quote prima di confermare.</p></div><button type="button" onClick={close} disabled={pending} aria-label="Chiudi raccordo" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border-interactive"><X className="h-5 w-5" aria-hidden /></button></div></header>
      {loading ? <p role="status" className="p-8 text-sm text-text-secondary">Caricamento movimenti, fatture e quote già collegate…</p> : <>
        {data?.setupMessage && <p role="alert" className="shrink-0 bg-warning-dim px-4 py-3 text-sm text-warning">{data.setupMessage}</p>}
        {data && <fieldset disabled={pending} className="contents"><div className="flex shrink-0 gap-2 border-b border-border px-4 py-2 md:hidden">{(['movimenti', 'fatture'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`${button} flex-1 ${tab === value ? 'bg-surface-active' : ''}`}>{value === 'movimenti' ? 'Movimenti' : 'Fatture'} · {value === 'movimenti' ? movements.length : invoices.length}</button>)}</div>
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-2 md:overflow-visible">
            {([0, 1] as const).map(side => {
              const f = side === 0 ? left : right, setFilter = side === 0 ? setLeft : setRight, rows = side === 0 ? leftRows : rightRows, selected = side === 0 ? movements : invoices
              return <section key={side} className={`${(side === 0 ? tab !== 'movimenti' : tab !== 'fatture') ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-border md:first:border-r`}>
                <div className="shrink-0 space-y-2 border-b border-border p-3 sm:p-4"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{side === 0 ? 'Movimenti bancari' : 'Fatture emesse e ricevute'}</h3><span className="text-2xs text-text-secondary">{selected.length} selezionati</span></div><label className="relative block"><span className="sr-only">{side === 0 ? 'Cerca movimento, causale o conto' : 'Cerca fattura, cliente o fornitore'}</span><Search aria-hidden className="absolute left-3 top-3 h-5 w-5 text-text-tertiary" /><input ref={side === (request.movementId ? 1 : 0) ? search : undefined} value={f.q} maxLength={200} onChange={e => { setFilter({ ...f, q: e.target.value }); setLimits([40, 40]) }} className={`${field} pl-10`} placeholder={side === 0 ? 'Controparte, causale, conto…' : 'Numero, cliente, fornitore…'} /></label>
                  <details><summary className="cursor-pointer py-1 text-2xs text-gold-text">Filtri · {rows.length} risultati</summary><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-2xs text-text-secondary">Dal<input type="date" value={f.from} onChange={e => setFilter({ ...f, from: e.target.value })} className={field} /></label><label className="text-2xs text-text-secondary">Al<input type="date" value={f.to} onChange={e => setFilter({ ...f, to: e.target.value })} className={field} /></label><label className="text-2xs text-text-secondary">Tipo<select value={f.side} onChange={e => setFilter({ ...f, side: e.target.value })} className={field}><option value="">Tutti</option>{side === 0 ? <><option value="in">Entrate</option><option value="out">Uscite</option></> : <><option value="emessa">Emesse</option><option value="ricevuta">Ricevute</option></>}</select></label>{side === 0 && <label className="text-2xs text-text-secondary">Conto<select value={f.account} onChange={e => setFilter({ ...f, account: e.target.value })} className={field}><option value="">Tutti i conti</option>{Array.from(new Map(data.movements.map(m => [m.accountId ?? m.account, m.account])).entries()).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}</div><label className="flex min-h-11 items-center gap-2 text-2xs text-text-secondary"><input type="checkbox" checked={f.all} onChange={e => setFilter({ ...f, all: e.target.checked })} />Mostra anche voci già collegate o da verificare</label><button type="button" onClick={() => setFilter(empty)} className="min-h-9 text-2xs text-gold-text underline">Azzera filtri</button></details>
                  {f.from && f.to && f.from > f.to && <p className="text-2xs text-warning">La data iniziale supera quella finale.</p>}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"><ul className="space-y-2">{rows.slice(0, limits[side]).map(row => {
                  const checked = selected.includes(row.id), amount = 'available' in row ? row.available : row.remaining
                  const multiple = !checked && (side === 0 ? invoices.length > 1 && movements.length >= 1 : movements.length > 1 && invoices.length >= 1)
                  const sameListConflict = side === 0 ? data.movements.filter(m => movements.includes(m.id)).some(m => m.currency !== row.currency || Math.sign(m.signedAmount) !== Math.sign((row as MatchMovement).signedAmount)) : data.invoices.filter(d => invoices.includes(d.id)).some(d => d.currency !== row.currency || d.direction !== (row as MatchDocument).direction)
                  const wrong = sameListConflict || (side === 0 ? data.invoices.filter(d => invoices.includes(d.id)).some(d => d.currency !== row.currency || d.direction !== Math.sign((row as MatchMovement).signedAmount)) : movements.length > 0 && (row.currency !== selectedCurrency || (row as MatchDocument).direction !== Math.sign(selectedDirection ?? 0)))
                  const locked = readOnly || !!row.why || amount == null || amount <= 0 || multiple || wrong || checked && data.adoptMovement === row.id
                  return <li key={row.id} className={`rounded-xl border p-3 ${checked ? 'border-border-strong bg-surface-active' : 'border-border'}`}><label className="flex min-h-11 cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1" checked={checked} disabled={locked && (!checked || readOnly || data.adoptMovement === row.id)} onChange={() => { const ids = checked ? selected.filter(id => id !== row.id) : [...selected, row.id]; if (side === 0) setMovements(ids); else setInvoices(ids); setError('') }} /><span className="min-w-0 flex-1"><strong className="block break-words text-sm">{row.label}</strong><span className="mt-1 block text-2xs text-text-secondary">{row.date}{'account' in row ? ` · ${row.account}` : ''}{checked ? ' · selezionato' : ''}</span>{'description' in row && row.description && row.description !== row.label && <span className="mt-1 block line-clamp-2 break-words text-2xs text-text-secondary">{row.description}</span>}<span className="mt-1 block text-2xs text-text-secondary">Totale {money('signedAmount' in row ? row.signedAmount : row.total, row.currency)}</span><span className="mt-1 block text-sm font-semibold">{money(amount, row.currency)} <span className="text-2xs font-normal text-text-secondary">{side === 0 ? 'disponibili' : 'residuo'}</span></span>{row.why && <span className="mt-1 block text-2xs text-warning">{row.why}</span>}{wrong && <span className="block text-2xs text-warning">Verso o valuta diversi dalle voci selezionate</span>}{multiple && <span className="block text-2xs text-text-secondary">Per aggiungere più movimenti scegli una sola fattura, e viceversa.</span>}</span></label><Link href={row.href} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center text-2xs text-gold-text underline">Apri prova in una nuova scheda</Link></li>
                })}</ul>{!rows.length && <p className="p-4 text-sm text-text-secondary">Nessuna voce con questi filtri. Cerca nello storico o mostra anche le voci collegate.</p>}{rows.length > limits[side] && <button type="button" className={`${button} mt-3 w-full`} onClick={() => setLimits(side === 0 ? [limits[0] + 40, limits[1]] : [limits[0], limits[1] + 40])}>Mostra altre 40 voci</button>}</div>
              </section>
            })}
          </div>
          <div className="max-h-[30dvh] shrink-0 overflow-y-auto border-t border-border bg-surface-hover p-3 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{movements.length} movimenti ↔ {invoices.length} fatture</h3>{!plan.issues.length && <strong className="text-base tabular-nums">Quote: {money(plan.total, selectedCurrency)}</strong>}</div>
            {movements.length > 0 && invoices.length > 0 && plan.issues.map(issue => <p key={issue} className="mt-2 text-sm text-warning">{issue}</p>)}
            {(!movements.length || !invoices.length) && <p className="mt-1 text-sm text-text-secondary">Spunta le voci da collegare nei due elenchi. Puoi scegliere un bonifico per più fatture, oppure più bonifici per una fattura.</p>}
            {!plan.issues.length && <details open><summary className="cursor-pointer py-2 text-2xs text-gold-text">Quote e residui · {plan.pairs.length} collegamenti</summary><ul className="space-y-1 text-2xs text-text-secondary">{plan.pairs.map(p => <li key={`${p.movementId}:${p.documentId}`}>{data.movements.find(m => m.id === p.movementId)?.label} → {data.invoices.find(d => d.id === p.documentId)?.label}: <strong className="text-text-primary">{money(p.amount, selectedCurrency)}</strong></li>)}</ul><p className="mt-2 text-2xs text-text-secondary">Resta sui movimenti: {money(plan.movementRemainders.reduce((s, r) => s + r.amount, 0), selectedCurrency)} · Resta sulle fatture: {money(plan.documentRemainders.reduce((s, r) => s + r.amount, 0), selectedCurrency)}. Quote già collegate ad altri raccordi escluse dalla disponibilità.</p></details>}
            {!readOnly && <label className="mt-2 block text-2xs text-text-secondary">Nota del raccordo<input value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder="Facoltativa: riferimento o motivo della modifica" className={`mt-1 ${field}`} /></label>}
            {(operation === 'cancel' || operation === 'unlink_legacy') && <p className="mt-2 text-sm text-warning">La conferma rimuove i collegamenti attivi e libera le quote. Movimenti, fatture e storico delle decisioni vengono conservati.</p>}
            {operation === 'verify' && <p className="mt-2 text-sm text-text-secondary">Confermi di aver controllato queste quote sulle fonti. La verifica viene registrata con autore e data.</p>}
          </div>
        </fieldset>}
      </>}
      <footer className="shrink-0 space-y-2 border-t border-border p-3 sm:px-6">{error && <p role="alert" className="text-sm text-error">{error}</p>}{discard ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-text-secondary">Scartare le modifiche non salvate?</p><div className="flex gap-2"><button type="button" className={button} onClick={() => setDiscard(false)}>Continua a modificare</button><button type="button" className={button} onClick={onClose}>Scarta e chiudi</button></div></div> : <div className="flex flex-wrap justify-between gap-2"><button type="button" className={button} onClick={close} disabled={pending}>Chiudi</button><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={pending || loading} onClick={() => void load(true)}>Ricarica fonti</button><button type="button" disabled={pending || loading || !data?.ready || !readOnly && !!plan.issues.length} onClick={() => void save()} className="min-h-11 rounded-xl bg-gold px-5 text-sm font-semibold text-on-gold disabled:opacity-50">{pending ? 'Salvataggio…' : operation === 'cancel' || operation === 'unlink_legacy' ? 'Conferma rimozione' : operation === 'verify' ? 'Conferma verifica' : 'Salva e conferma'}</button></div></div>}</footer>
    </div>
  </dialog>
}

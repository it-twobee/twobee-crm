'use client'

import { useState } from 'react'
import Link from '@/components/lab/LabLink'
import { acquireArchivedInvoice, selectArchivedInvoices } from '@/app/actions/lab-invoice-archive'
import { parseArchiveInvoice, type ArchiveInvoiceDraft } from '@/lib/archived-invoice'
import { readArchivedInvoiceDraft } from '@/lib/read-archived-invoice-pdf'
import { ARCHIVE_PAGE_SIZES } from '@/lib/archive-page-sizes'

type ArchiveRow = { id: string; filename: string; uploadedAt: string | null; invoiceId: string | null }
type ReviewRow = { id: string; filename: string; draft?: ArchiveInvoiceDraft; message?: string; invoiceId?: string; manual?: boolean }
const secondary = 'inline-flex min-h-11 items-center rounded-lg border border-border-interactive px-3 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50'
const primary = 'min-h-11 rounded-lg bg-gold px-3 text-sm font-semibold text-on-gold disabled:opacity-50'
const batchLimit = 100

export default function LabInvoiceArchiveList({ rows, query, page, more, size, total }: { rows: ArchiveRow[]; query: string; page: number; more: boolean; size: number; total: number | null }) {
  const [selection, setSelection] = useState<Record<string, ArchiveRow>>({})
  const [registered, setRegistered] = useState<Record<string, string>>({})
  const [review, setReview] = useState<ReviewRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState('')
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({})
  const selectionCount = Object.keys(selection).length
  const ready = review?.filter(row => row.draft && !row.invoiceId && confirmed[row.id]) ?? []
  const pages = total ? Math.max(1, Math.ceil(total / size)) : null
  const href = (next: number, id?: string, rows = size) => `/lab/fonti?${new URLSearchParams({
    ...(query ? { archivio: query } : {}), ...(next ? { pagina: String(next) } : {}), ...(rows !== ARCHIVE_PAGE_SIZES[0] ? { righe: String(rows) } : {}), ...(id ? { pdf: id } : {}),
  })}#${id ? 'acquisisci-pdf' : 'archivio-documenti'}`

  function add(next: ArchiveRow[]) {
    const combined = { ...selection }
    for (const row of next) if (!registered[row.id]) combined[row.id] = row
    if (Object.keys(combined).length > batchLimit) {
      setMessage('Puoi includere fino a 100 PDF in un lotto.')
      return
    }
    setSelection(combined)
  }

  async function selectAll() {
    setMessage('')
    setBusy(true)
    try {
      const result = await selectArchivedInvoices(query)
      if (!result.ok) setMessage(result.message)
      else if (!result.rows.some(row => !registered[row.id])) setMessage('Nessun nuovo PDF da selezionare in questa ricerca.')
      else add(result.rows)
    } catch { setMessage('Selezione non disponibile. Riprova.') }
    finally { setBusy(false) }
  }

  async function prepare() {
    setConfirmed({})
    setMessage('')
    setBusy(true)
    const list = Object.values(selection)
    const checked: ReviewRow[] = []
    try {
      for (let i = 0; i < list.length; i++) {
        const row = list[i]
        setProgress(`Lettura PDF ${i + 1} di ${list.length}`)
        try {
          const result = await readArchivedInvoiceDraft(row.id)
          if (result.blocked) checked.push({ id: row.id, filename: row.filename, message: result.blocked })
          else {
            parseArchiveInvoice(result.draft)
            checked.push({ id: row.id, filename: row.filename, draft: result.draft })
          }
        } catch {
          checked.push({ id: row.id, filename: row.filename, message: 'Dati incompleti o PDF illeggibile.', manual: true })
        }
      }
      setReview(checked)
    } finally { setBusy(false); setProgress('') }
  }

  async function save() {
    setMessage('')
    setBusy(true)
    try {
      for (let i = 0; i < ready.length; i++) {
        const row = ready[i]
        setProgress(`Salvataggio ${i + 1} di ${ready.length}`)
        try {
          const result = await acquireArchivedInvoice(row.id, row.draft!)
          if (result.ok) {
            setRegistered(current => ({ ...current, [row.id]: result.id }))
            setSelection(current => {
              const next = { ...current }
              delete next[row.id]
              return next
            })
          }
          setReview(current => current?.map(item => item.id === row.id
            ? { ...item, ...(result.ok ? { invoiceId: result.id, message: result.reused ? 'Già nel registro.' : 'Acquisita.' } : { message: result.message }) }
            : item) ?? null)
        } catch {
          setReview(current => current?.map(item => item.id === row.id ? { ...item, message: 'Risposta non disponibile. Puoi riprovare.' } : item) ?? null)
        }
      }
    } finally { setBusy(false); setProgress('') }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-hover p-2">
        <span className="px-2 text-sm font-medium text-text-primary" role="status">{selectionCount} PDF selezionati</span>
        <button type="button" className={secondary} onClick={selectAll} disabled={busy || !!review || !rows.length}>Seleziona tutte</button>
        <button type="button" className={secondary} onClick={() => { setMessage(''); add(rows.filter(row => !row.invoiceId)) }} disabled={busy || !!review || !rows.some(row => !row.invoiceId && !registered[row.id])}>Seleziona questa pagina</button>
        <button type="button" className={secondary} disabled={busy || !selectionCount} onClick={() => { setSelection({}); setReview(null); setMessage('') }}>Deseleziona tutte</button>
        {!review && <button type="button" className={primary} disabled={busy || !selectionCount} onClick={prepare}>Controlla selezione</button>}
      </div>
      {!review && <p className="text-2xs text-text-secondary">Seleziona tutte include i risultati della ricerca. Fino a 100 PDF per lotto.</p>}
      {message && <p role="alert" className="text-sm text-warning">{message}</p>}
      {progress && <p role="status" className="text-sm text-text-secondary">{progress}</p>}
      {review ? (
        <section aria-label="Controllo del lotto" className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-text-primary">Acquisizione in blocco</h3>
              <p className="text-2xs text-text-secondary">{ready.length} verificati per acquisizione · {review.filter(row => row.invoiceId).length} nel registro · {review.filter(row => !row.draft).length} da controllare. Apri i layout non riconosciuti singolarmente per usare l’AI.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondary} onClick={() => setReview(null)} disabled={busy}>Torna alla selezione</button>
              <button type="button" className={primary} onClick={save} disabled={busy || !ready.length}>Acquisisci {ready.length} fatture</button>
            </div>
          </div>
          <ul className="divide-y divide-border">
            {review.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-3 py-2">
              {row.draft && !row.invoiceId && <label className="inline-flex min-h-11 items-center gap-2 pr-3 text-2xs text-text-primary"><input type="checkbox" checked={!!confirmed[row.id]} disabled={busy} onChange={event => setConfirmed(current => ({ ...current, [row.id]: event.target.checked }))} />Verificato sul PDF</label>}
              <div className="min-w-0 flex-1 basis-60">
                <p className="break-words text-sm font-semibold text-text-primary">{row.draft ? `${row.draft.supplier} · ${row.draft.number}` : row.filename}</p>
                {row.draft && <p className="text-2xs text-text-secondary">{row.draft.date} · {row.draft.vatId} · {row.draft.total} {row.draft.currency} · Imponibile {row.draft.net} · IVA {row.draft.vat}</p>}
                {row.message && <p className={`text-2xs ${row.invoiceId ? 'text-success' : 'text-warning'}`}>{row.message}</p>}
              </div>
              <a href={`/api/lab/invoice-archive/${row.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-2xs text-gold-text underline">Apri PDF</a>
              {row.invoiceId && <Link href={`/lab/abbina?documento=${row.invoiceId}`} className={secondary}>Raccorda con la banca</Link>}
              {row.manual && <Link href={`/lab/fonti?${new URLSearchParams({ archivio: row.filename, pdf: row.id })}#acquisisci-pdf`} className={secondary}>Compila singolarmente</Link>}
              {!row.invoiceId && row.draft && <button type="button" className={secondary} disabled={busy} onClick={() => {
                setReview(current => current?.filter(item => item.id !== row.id) ?? null)
                setSelection(current => {
                  const next = { ...current }
                  delete next[row.id]
                  return next
                })
              }}>Escludi dal lotto</button>}
            </li>)}
          </ul>
        </section>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {rows.map(row => {
              const invoiceId = registered[row.id] ?? row.invoiceId
              return <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-1">
                <label className="flex min-h-11 min-w-0 flex-1 basis-52 cursor-pointer items-center gap-3 py-1">
                  <input type="checkbox" checked={!!selection[row.id] && !invoiceId} disabled={!!invoiceId || busy} onChange={event => {
                    if (event.target.checked) add([row])
                    else {
                      const next = { ...selection }
                      delete next[row.id]
                      setSelection(next)
                    }
                  }} className="h-4 w-4 shrink-0 accent-gold" />
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-medium text-text-primary">{row.filename}</span>
                    <span className="text-2xs text-text-secondary">{row.uploadedAt?.slice(0, 10)} · {invoiceId ? 'Associato al registro' : 'PDF in archivio'}</span>
                  </span>
                </label>
                <a href={`/api/lab/invoice-archive/${row.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-2xs text-gold-text underline">Apri PDF</a>
                <Link href={invoiceId ? `/lab/fatturazione?documento=${invoiceId}` : href(page, row.id)} className="inline-flex min-h-11 items-center rounded-lg bg-gold-dim px-3 text-2xs font-semibold text-gold-text">
                  {invoiceId ? 'Apri fattura' : 'Acquisisci come fattura'}
                </Link>
              </li>
            })}
          </ul>
          <nav aria-label="Pagine archivio" className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {page > 0 && <Link href={href(page - 1)} className="inline-flex min-h-11 items-center text-sm text-gold-text underline">Precedenti</Link>}
            <span className="text-sm text-text-secondary">Pagina {page + 1}{pages ? ` di ${pages}` : ''}{total != null ? ` · ${total} PDF` : ''}</span>
            {more && <Link href={href(page + 1)} className="inline-flex min-h-11 items-center text-sm text-gold-text underline">Successivi</Link>}
            <span className="ml-auto flex items-center gap-2 text-sm text-text-secondary">Righe
              {ARCHIVE_PAGE_SIZES.map(n => n === size
                ? <span key={n} aria-current="true" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-gold-dim px-2 font-semibold text-gold-text">{n}</span>
                : <Link key={n} href={href(0, undefined, n)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-interactive px-2 text-text-primary hover:bg-surface-hover">{n}</Link>)}
            </span>
          </nav>
        </>
      )}
    </div>
  )
}

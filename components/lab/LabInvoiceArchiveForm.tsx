'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/lab/LabLink'
import { acquireArchivedInvoice } from '@/app/actions/lab-invoice-archive'
import { readArchivedInvoiceDraft } from '@/lib/read-archived-invoice-pdf'
import { emptyArchiveInvoice, type ArchiveInvoiceDraft } from '@/lib/archived-invoice'

const control = 'mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary'
const fields = [
  { key: 'supplier', label: 'Fornitore' }, { key: 'vatId', label: 'Identificativo fiscale' },
  { key: 'number', label: 'Numero fattura' }, { key: 'date', label: 'Data di emissione', type: 'date' },
  { key: 'due', label: 'Scadenza', type: 'date', optional: true }, { key: 'currency', label: 'Valuta' },
  { key: 'net', label: 'Imponibile', decimal: true }, { key: 'vat', label: 'IVA addebitata', decimal: true },
  { key: 'total', label: 'Totale documento', decimal: true }, { key: 'reference', label: 'Riferimento bancario nel PDF', optional: true },
] as const

export default function LabInvoiceArchiveForm({ id, filename }: { id: string; filename: string }) {
  const [draft, setDraft] = useState<ArchiveInvoiceDraft>(emptyArchiveInvoice)
  const [reading, setReading] = useState(true)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [readError, setReadError] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof acquireArchivedInvoice>> | null>(null)
  const pdfUrl = `/api/lab/invoice-archive/${id}`

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    async function read() {
      try {
        const suggestion = await readArchivedInvoiceDraft(id, controller.signal)
        if (active) { setDraft(suggestion.draft); setBlocked(suggestion.blocked) }
      } catch {
        if (active) setReadError('Lettura automatica non disponibile. Apri il PDF e verifica i dati prima di compilare.')
      } finally {
        if (active) setReading(false)
      }
    }
    void read()
    return () => { active = false; controller.abort() }
  }, [id])

  return (
    <section id="acquisisci-pdf" className="scroll-mt-4 space-y-3 rounded-xl border border-border bg-surface-hover p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-text-primary">Acquisisci come fattura ricevuta</h3>
          <p className="break-words text-2xs text-text-secondary">{filename}</p>
        </div>
        <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm text-gold-text underline">Apri originale PDF</a>
      </div>
      {reading && <p role="status" className="text-sm text-text-secondary">Lettura dell’originale…</p>}
      {blocked && <p role="alert" className="text-sm text-warning">{blocked}</p>}
      {readError && <p role="status" className="text-sm text-warning">{readError}</p>}
      {result?.ok ? <div className="space-y-2 text-sm">
        <p role="status" className="text-text-primary">{result.reused ? 'Fattura già presente nel registro.' : 'Fattura acquisita con il PDF originale.'} {result.hasOtherOriginal && 'L’allegato già presente è conservato.'}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/lab/fatturazione?documento=${result.id}`} className="inline-flex min-h-11 items-center text-gold-text underline">Apri fattura</Link>
          <Link href={`/lab/abbina?documento=${result.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-gold px-3 font-semibold text-on-gold">Raccorda con la banca</Link>
        </div>
      </div> : !reading && !blocked && <form onSubmit={async event => {
        event.preventDefault()
        if (pending) return
        setPending(true)
        try { setResult(await acquireArchivedInvoice(id, draft)) }
        catch { setResult({ ok: false, message: 'Risposta non disponibile. Puoi riprovare senza duplicare la fattura.' }) }
        finally { setPending(false) }
      }} className="space-y-3">
        <p className="text-sm text-text-secondary">Controlla i dati proposti sul PDF e completa i campi mancanti.</p>
        <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(field => <label key={field.key} className="min-w-0 text-2xs text-text-secondary">
            {field.label}<input className={control} type={'type' in field ? field.type : 'text'}
              inputMode={'decimal' in field ? 'decimal' : undefined} maxLength={250} required={!('optional' in field)}
              value={draft[field.key]} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} />
          </label>)}
          <label className="text-2xs text-text-secondary">Tipo di documento
            <select className={control} value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as ArchiveInvoiceDraft['kind'] })}>
              <option value="TD01">Fattura</option><option value="TD04">Nota di credito</option><option value="TD05">Nota di debito</option>
            </select>
          </label>
        </fieldset>
        {result && !result.ok && <p role="alert" className="text-sm text-warning">{result.message}</p>}
        <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-gold px-4 text-sm font-semibold text-on-gold disabled:opacity-60">
          {pending ? 'Registro la fattura…' : 'Conferma acquisizione'}
        </button>
      </form>}
    </section>
  )
}

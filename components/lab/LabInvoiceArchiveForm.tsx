'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/lab/LabLink'
import { acquireArchivedInvoice } from '@/app/actions/lab-invoice-archive'
import { readArchivedInvoiceDraft, readArchivedInvoiceText } from '@/lib/read-archived-invoice-pdf'
import { emptyArchiveInvoice, type ArchiveInvoiceDraft } from '@/lib/archived-invoice'
import type { InvoiceExtraction } from '@/lib/invoice-extraction'

const control = 'mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary'
const fields = [
  { key: 'supplier', label: 'Fornitore' }, { key: 'vatId', label: 'Identificativo fiscale del fornitore', optional: true },
  { key: 'taxCode', label: 'Codice fiscale del prestatore', optional: true },
  { key: 'number', label: 'Numero fattura' }, { key: 'date', label: 'Data del documento', type: 'date' },
  { key: 'due', label: 'Scadenza', type: 'date', optional: true }, { key: 'currency', label: 'Valuta' },
  { key: 'net', label: 'Imponibile', decimal: true }, { key: 'vat', label: 'IVA addebitata', decimal: true },
  { key: 'total', label: 'Totale documento', decimal: true }, { key: 'reference', label: 'Riferimento nel PDF', optional: true },
  { key: 'withholding', label: 'Ritenuta sul documento', decimal: true, optional: true },
  { key: 'stamp', label: 'Bollo addebitato incluso nel lordo', decimal: true, optional: true },
  { key: 'payable', label: 'Netto da pagare al prestatore', decimal: true, optional: true },
] as const

export default function LabInvoiceArchiveForm({ id, filename }: { id: string; filename: string }) {
  const [draft, setDraft] = useState<ArchiveInvoiceDraft>(emptyArchiveInvoice)
  const [reading, setReading] = useState(true)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [readError, setReadError] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof acquireArchivedInvoice>> | null>(null)
  const [ai, setAi] = useState<InvoiceExtraction | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [reviewed, setReviewed] = useState(false)
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
          <h3 className="font-semibold text-text-primary">Acquisisci fattura o ricevuta occasionale</h3>
          <p className="break-words text-2xs text-text-secondary">{filename}</p>
        </div>
        <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm text-gold-text underline">Apri originale PDF</a>
      </div>
      {reading && <p role="status" className="text-sm text-text-secondary">Lettura dell’originale…</p>}
      {blocked && <p role="alert" className="text-sm text-warning">{blocked}</p>}
      {readError && <p role="status" className="text-sm text-warning">{readError}</p>}
      {!result?.ok && <div className="space-y-2"><button type="button" disabled={reading || pending || aiBusy} onClick={async () => {
        setAiBusy(true); setReadError(''); setResult(null)
        try {
          const source = await readArchivedInvoiceText(id)
          const response = await fetch(`/api/lab/invoice-archive/${id}/extract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(source), signal: AbortSignal.timeout(150000) })
          const data = await response.json()
          if (!response.ok) throw Error(data.message || 'Lettura AI non disponibile.')
          setAi(data); setDraft(data.draft); setBlocked(data.blocked); setReviewed(false)
        } catch (error) { setReadError(error instanceof Error ? error.message : 'Lettura AI non disponibile.') }
        finally { setAiBusy(false) }
      }} className="min-h-11 rounded-xl border border-border-interactive px-4 text-sm font-semibold text-text-primary disabled:opacity-50">{aiBusy ? 'Leggo tutte le pagine con AI…' : 'Estrai con AI · layout differenti'}</button><p className="text-2xs text-text-secondary">Invia testo e, per scansioni, immagini dell’originale al servizio AI configurato. Non acquisisce dati e non certifica pagamenti. Fino a 20 pagine e 15 MB; OCR visivo opzionale fino a tre pagine.</p></div>}
      {ai && <details className="rounded-xl border border-border p-3" open><summary className="text-sm font-semibold text-text-primary">Proposta AI · {ai.pages} pagine · controlla sul documento</summary><p className="mt-2 text-2xs text-text-secondary">{ai.method}</p><ul className="mt-2 space-y-1 text-2xs text-warning">{ai.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul><p className="text-2xs text-text-secondary mt-2">Le citazioni dimostrano la presenza del testo, non la correttezza contabile. I campi senza riscontro restano vuoti.</p></details>}
      {result?.ok ? <div className="space-y-2 text-sm">
        <p role="status" className="text-text-primary">{result.reused ? 'Fattura già presente nel registro.' : 'Fattura acquisita con il PDF originale.'} {result.hasOtherOriginal && 'L’allegato già presente è conservato.'}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/lab/fatturazione?documento=${result.id}`} className="inline-flex min-h-11 items-center text-gold-text underline">Apri fattura</Link>
          <Link href={`/lab/abbina?documento=${result.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-gold px-3 font-semibold text-on-gold">Raccorda con la banca</Link>
        </div>
      </div> : !reading && !blocked && <form onSubmit={async event => {
        event.preventDefault()
        if (pending || aiBusy || !reviewed) return
        setPending(true)
        try { setResult(await acquireArchivedInvoice(id, draft)) }
        catch { setResult({ ok: false, message: 'Risposta non disponibile. Puoi riprovare senza duplicare la fattura.' }) }
        finally { setPending(false) }
      }} className="space-y-3">
        <p className="text-sm text-text-secondary">Controlla i dati proposti sul PDF e completa i campi mancanti.
          {draft.supplier === 'Anthropic, PBC' && draft.reference && ' Per la ricevuta viene proposta la data indicata come pagamento quando manca la data di emissione.'}</p>
        <fieldset disabled={pending || aiBusy} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(field => <label key={field.key} className="min-w-0 text-2xs text-text-secondary">
            {field.label}<input className={control} type={'type' in field ? field.type : 'text'}
              inputMode={'decimal' in field ? 'decimal' : undefined} maxLength={250} required={!('optional' in field)}
              value={draft[field.key] ?? ''} onChange={event => { setDraft({ ...draft, [field.key]: event.target.value }); setReviewed(false) }} />
            {ai?.evidence[field.key] && <span className="mt-1 block text-2xs text-text-tertiary">Nel PDF: «{ai.evidence[field.key]}»</span>}
          </label>)}
          <label className="text-2xs text-text-secondary">Tipo di documento
            <select className={control} value={draft.kind} onChange={event => { setDraft({ ...draft, kind: event.target.value as ArchiveInvoiceDraft['kind'] }); setReviewed(false) }}>
              <option value="TD01">Fattura</option><option value="TD04">Nota di credito</option><option value="TD05">Nota di debito</option><option value="RICEVUTA_OCCASIONALE">Ricevuta · prestazione occasionale</option>
            </select>
          </label>
        </fieldset>
        {draft.kind === 'RICEVUTA_OCCASIONALE' && <p className="text-sm text-text-secondary">Indica compenso lordo, IVA indicata nel documento, ritenuta, eventuale bollo addebitato e netto da pagare. Non si applica automaticamente una percentuale. La ricevuta non diventa una fattura SdI; il pagamento al prestatore non certifica il versamento della ritenuta.</p>}
        <label className="flex items-start gap-2 text-sm text-text-primary"><input type="checkbox" checked={reviewed} disabled={pending || aiBusy} onChange={event => setReviewed(event.target.checked)} className="mt-1" />Ho verificato sull’originale tipo documento, emittente, date, importi e componenti fiscali.</label>
        {result && !result.ok && <p role="alert" className="text-sm text-warning">{result.message}</p>}
        <button type="submit" disabled={pending || aiBusy || !reviewed} className="min-h-11 rounded-xl bg-gold px-4 text-sm font-semibold text-on-gold disabled:opacity-60">
          {pending ? 'Registro la fattura…' : 'Conferma acquisizione'}
        </button>
      </form>}
    </section>
  )
}

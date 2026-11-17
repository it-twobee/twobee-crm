'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, ClipboardPaste, Plus, X } from 'lucide-react'
import { importBankCsv, addManualTx } from '@/app/actions/bank'
import { parseStatement } from '@/lib/bank-import'
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-interactive px-3 text-sm font-semibold disabled:opacity-50'
const field = 'mt-1 min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary'
export default function LabBankActions({ accountId, label, today }: { accountId: string; label: string; today: string }) {
  const router = useRouter(), dialog = useRef<HTMLDialogElement>(null), file = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'import' | 'paste' | 'manual'>('import'), [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState('')
  const [manual, setManual] = useState({ booked_on: today, amount: '', description: '' })
  const parsed = text.trim() ? (() => { try { return parseStatement(text) } catch { return null } })() : null
  const open = (next: typeof mode) => { setMode(next); setText(''); setError(''); setResult(''); dialog.current?.showModal() }
  const close = () => { if (!busy && (!(text.trim() || manual.amount || manual.description) || window.confirm('Chiudere senza salvare i dati inseriti?'))) dialog.current?.close() }
  return <><div className="flex flex-wrap gap-2"><input ref={file} type="file" accept=".csv,.txt,.tsv,.xml" className="hidden" aria-label="Estratto conto" onChange={async e => {
    const selected = e.target.files?.[0]; e.target.value = ''; if (!selected) return
    open('import'); if (selected.size > 500 * 1024) { setError('File troppo grande: massimo 500 KB.'); return }
    try { setText(await selected.text()) } catch { setError('File non leggibile. Riprova.') }
  }} /><button type="button" className={`${button} bg-gold text-on-gold`} onClick={() => file.current?.click()}><Upload aria-hidden className="h-4 w-4" />Importa estratto conto</button><button type="button" className={button} onClick={() => open('paste')}><ClipboardPaste aria-hidden className="h-4 w-4" />Incolla righe</button><button type="button" className={button} onClick={() => open('manual')}><Plus aria-hidden className="h-4 w-4" />Movimento a mano</button></div>
    <dialog ref={dialog} aria-label={`Caricamento movimenti · ${label}`} onCancel={e => { e.preventDefault(); close() }} className="m-auto max-h-[90dvh] w-[95vw] max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-text-primary backdrop:bg-scrim"><header className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{mode === 'manual' ? 'Movimento a mano' : 'Importa estratto conto'}</h3><p className="mt-1 text-sm text-text-secondary">Conto di destinazione: <strong>{label}</strong></p></div><button type="button" aria-label="Chiudi caricamento" disabled={busy} onClick={close} className={button}><X aria-hidden className="h-4 w-4" /></button></header>
      <form className="mt-4 space-y-3" onSubmit={async e => {
        e.preventDefault(); if (busy) return; setBusy(true); setError(''); setResult('')
        try {
          if (mode === 'manual') { await addManualTx(accountId, { ...manual, amount: Number(manual.amount) }); setManual({ booked_on: today, amount: '', description: '' }); setResult('Movimento manuale registrato. Escluso dal saldo bancario consolidato.') }
          else { const r = await importBankCsv(accountId, text); setResult(`${r.nuovi} nuovi · ${r.duplicati} già presenti · ${r.riscritte} riscritture riconosciute · ${r.scartati} righe scartate${r.dal && r.al ? ` · ${r.dal} → ${r.al}` : ''}.${r.motivi.length ? ` Scarti: ${r.motivi.join(' · ')}` : ''}${r.nascosti.length ? ` Nascosti operativi, inclusi in cassa: ${r.nascosti.join(' · ')}` : ''}`); setText('') }
          router.refresh()
        } catch (e) { setError(e instanceof Error ? e.message : 'Operazione non completata.') } finally { setBusy(false) }
      }}><fieldset disabled={busy} className="space-y-3">
        {mode === 'manual' ? <><p className="text-sm text-info">Una registrazione manuale è una dichiarazione: non crea una prova bancaria e non entra nel saldo consolidato del Laboratorio.</p><label className="block text-2xs text-text-secondary">Data<input required type="date" value={manual.booked_on} onChange={e => setManual({ ...manual, booked_on: e.target.value })} className={field} /></label><label className="block text-2xs text-text-secondary">Importo EUR · negativo per uscita<input required type="number" step="0.01" value={manual.amount} onChange={e => setManual({ ...manual, amount: e.target.value })} className={field} /></label><label className="block text-2xs text-text-secondary">Descrizione<input required maxLength={1000} value={manual.description} onChange={e => setManual({ ...manual, description: e.target.value })} className={field} /></label></> : <><p className="text-sm text-text-secondary">Verifica conto e valuta EUR sull’originale prima di confermare. Le impronte vengono ricontrollate dal flusso di importazione esistente; nessun raccordo fattura viene confermato automaticamente.</p><label className="block text-2xs text-text-secondary">{mode === 'paste' ? 'Incolla intestazione e righe dall’home banking' : 'Contenuto del file · CSV o camt'}<textarea required rows={6} maxLength={512000} value={text} onChange={e => setText(e.target.value)} className={`${field} py-2 font-mono`} /></label>{text.trim() && <p role="status" className="text-sm text-text-secondary">{parsed ? `${parsed.rows.length} movimenti leggibili · ${parsed.skipped.length} scarti · formato ${parsed.dialect}. Il controllo duplicati avviene durante l’importazione.` : 'Formato non riconosciuto: verifica il contenuto.'}</p>}</>}
        <button disabled={busy || (mode === 'manual' ? !manual.description.trim() || !Number.isFinite(Number(manual.amount)) || Number(manual.amount) === 0 : !parsed?.rows.length)} className={`${button} bg-gold text-on-gold`}>{busy ? 'Salvataggio…' : mode === 'manual' ? 'Conferma movimento manuale' : 'Conferma importazione'}</button>
      </fieldset></form>{error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}{result && <p role="status" className="mt-3 text-sm text-info">{result}</p>}</dialog>
  </>
}

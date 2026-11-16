'use client'
import { useRef, useState } from 'react'
import Link from '@/components/lab/LabLink'
import type { ImportRow } from '@/lib/bank-import'
import { chartCsv } from '@/lib/lab-chart'
import { eur2 } from '@/lib/money'
type Preview = { account: string; accountId: string; dialect: string; rows: ImportRow[]; skipped: string[]; ignored: string[]; declared: { amount: number; on: string } | null; withoutHash: number; observedAt: string }
export default function LabBankPreview({ accounts }: { accounts: { id: string; label: string }[] }) {
  const [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [filter, setFilter] = useState('tutte')
  const current = useRef(0)
  const cancel = () => { current.current++; setPreview(null); setMessage(''); setBusy(false) }
  const rows = preview?.rows.filter(r => filter === 'tutte' || (filter === 'duplicate' ? r.duplicate : !r.duplicate)) ?? []
  return <section className="rounded-2xl border border-border bg-surface p-4 space-y-4">
    <h2 className="text-base font-semibold text-text-primary">Prova un estratto prima dell’importazione</h2><p className="text-sm text-text-secondary">Legge CSV o camt con lo stesso parser dell’importazione esistente e confronta le impronte già in archivio. Questa anteprima non salva file, movimenti o collegamenti. Il conto scelto e la valuta del file vanno verificati sull’originale.</p>
    <form onChange={cancel} onSubmit={async e => {
      e.preventDefault(); const form = new FormData(e.currentTarget), ticket = ++current.current; setBusy(true); setPreview(null); setMessage('')
      try { const r = await fetch('/api/lab/bank-preview', { method: 'POST', body: form, cache: 'no-store' }); const data = await r.json(); if (ticket !== current.current) return; if (!r.ok) throw new Error(data.message); setPreview(data); setFilter('tutte') }
      catch (error) { if (ticket === current.current) setMessage(error instanceof Error ? error.message : 'Anteprima non disponibile.') }
      finally { if (ticket === current.current) setBusy(false) }
    }} className="grid gap-3 sm:grid-cols-2"><label className="text-2xs text-text-secondary">Conto EUR<select required name="conto" className="mt-1 min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary"><option value="">Scegli il conto dell’estratto</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label><label className="text-2xs text-text-secondary">Estratto CSV o camt · massimo 500 KB<input required name="file" type="file" accept=".csv,.xml,.txt" className="mt-2 block w-full max-w-full text-sm text-text-primary" /></label><button disabled={busy || !accounts.length} className="min-h-11 rounded-xl bg-gold px-4 text-sm font-semibold text-on-gold disabled:opacity-50">{busy ? 'Analisi in corso…' : 'Verifica senza importare'}</button></form>
    {message && <p role="alert" className="text-sm text-warning">{message}</p>}
    {preview && <div className="space-y-4"><p role="status" className="text-sm text-text-primary">{preview.account} · formato {preview.dialect} · {preview.rows.length} movimenti letti · {preview.rows.filter(r => r.duplicate).length} già presenti secondo le impronte · {preview.skipped.length} righe scartate.</p>
      {preview.withoutHash > 0 && <p className="text-sm text-warning">{preview.withoutHash} movimenti storici del conto non hanno impronta: il controllo duplicati è incompleto.</p>}
      {preview.declared && <p className="text-sm text-text-secondary">Saldo dichiarato nel file: {eur2(preview.declared.amount)} al {preview.declared.on}. Non è una quadratura del saldo ricostruito.</p>}
      <p className="text-2xs text-text-secondary">Le righe segnalate come nascoste restano fatti di cassa. Le classificazioni proposte dal parser non confermano fatture o destinatari.</p>
      <div className="flex flex-wrap gap-3"><label className="text-2xs text-text-secondary">Mostra<select value={filter} onChange={e => setFilter(e.target.value)} className="ml-2 min-h-11 rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary"><option value="tutte">Tutte le righe lette</option><option value="nuove">Non presenti per impronta</option><option value="duplicate">Già presenti per impronta</option></select></label><button type="button" className="min-h-11 rounded-xl border border-border-interactive px-3 text-sm text-text-primary" onClick={() => {
        const csv = chartCsv('Anteprima estratto · nessuna importazione', 'Importi dal file; duplicazione per impronta, non riconciliazione.', rows.map(r => ({ id: r.import_hash, label: `${r.counterparty ?? ''} · ${r.description}`, group: r.duplicate ? 'Già presente' : 'Non presente per impronta', date: r.booked_on, values: { amount: r.amount } })), [{ key: 'amount', label: 'Importo EUR · verificare valuta originale' }], `${preview.account} · lettura ${preview.observedAt}`)
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'anteprima-estratto.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}>Esporta anteprima filtrata CSV</button><button type="button" onClick={cancel} className="min-h-11 px-3 text-sm text-gold-text underline">Chiudi anteprima</button></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-2xs text-text-primary"><caption className="py-2 text-left text-text-secondary">Prime 200 di {rows.length} righe filtrate · CSV completo</caption><thead><tr><th className="p-2">Data</th><th className="p-2">Controparte / causale</th><th className="p-2">Importo</th><th className="p-2">Impronta</th></tr></thead><tbody>{rows.slice(0, 200).map(r => <tr key={r.import_hash} className="border-t border-border"><td className="p-2 whitespace-nowrap">{r.booked_on}</td><td className="p-2 min-w-48">{r.counterparty}<p className="text-text-secondary">{r.description}</p>{r.hidden_reason && <p className="text-warning">Nascosto: {r.hidden_reason}</p>}</td><td className="p-2 whitespace-nowrap tabular-nums">{eur2(r.amount)}</td><td className="p-2">{r.duplicate ? 'Già presente' : 'Non presente'}</td></tr>)}</tbody></table></div>
      {(preview.skipped.length > 0 || preview.ignored.length > 0) && <details><summary className="cursor-pointer py-2 text-sm text-warning">Scarti e regole del parser</summary><ul className="text-2xs text-text-secondary space-y-1">{[...preview.skipped, ...preview.ignored].map((s, n) => <li key={n}>{s}</li>)}</ul></details>}
      <Link href="/economics/carica" className="inline-flex min-h-11 items-center text-sm text-gold-text underline">Apri caricamento esistente · operazione separata</Link>
    </div>}
  </section>
}

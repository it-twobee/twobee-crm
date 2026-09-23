'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { TEXT_PREVIEW_BYTES } from '@/lib/portal/materials'
import { CSV_PREVIEW_ROWS as MAX_ROWS, parseCsv } from '@/lib/portal/csv'

/* §415 — Un file di testo, o un CSV, letto per il primo mega: basta a capire
   cos'è senza scaricarlo. Il testo entra in un `<pre>` e le celle in una
   tabella: niente viene interpretato come HTML. */
export function TextPreview({ href, csv }: { href: string; csv: boolean }) {
  const [text, setText] = useState<string | null>(null)
  const [cut, setCut] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(href, { headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` }, credentials: 'same-origin' })
      .then(async response => {
        if (!response.ok) throw new Error(String(response.status))
        const total = Number(response.headers.get('Content-Range')?.split('/')[1] ?? 0)
        const body = new TextDecoder('utf-8').decode(await response.arrayBuffer())
        if (!cancelled) { setText(body); setCut(total > TEXT_PREVIEW_BYTES) }
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [href])

  if (failed) return <p className="px-4 py-10 text-center text-sm text-text-secondary">Questo file non si legge nell’anteprima: scaricalo.</p>
  if (text === null) return <p className="flex items-center justify-center gap-2 py-10 text-sm text-text-secondary">
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Leggo il file…
  </p>
  const rows = csv ? parseCsv(text) : null
  return <div className="h-[75vh] w-full overflow-auto">
    {cut && <p className="mb-2 text-2xs text-text-secondary">Qui il primo mega del file: il resto nel file scaricato.</p>}
    {rows
      ? <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-2xs">
            <tbody>
              {rows.map((cells, r) => <tr key={r} className={r === 0 ? 'bg-surface-hover font-semibold' : 'border-t border-border'}>
                {cells.map((cell, c) => <td key={c} className="whitespace-nowrap px-2 py-1 text-text-primary">{cell}</td>)}
              </tr>)}
            </tbody>
          </table>
          {rows.length >= MAX_ROWS && <p className="mt-2 text-2xs text-text-secondary">Le prime {MAX_ROWS} righe.</p>}
        </div>
      : <pre className="whitespace-pre-wrap break-words font-mono text-xs text-text-primary">{text}</pre>}
  </div>
}

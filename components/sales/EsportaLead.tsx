'use client'

/**
 * §441 — scaricare i lead: cosa, quali righe, in che formato. Tre scelte e
 * un bottone, con le scelte già fatte per il caso comune: se hai spuntato
 * delle righe esporta quelle, altrimenti quello che l'elenco ti mostra.
 *
 * Il bottone c'è solo per super admin, founder e admin, ma la porta vera è la route
 * (`/api/sales/export`), che rilegge il ruolo: nascondere un bottone non è una
 * barriera (§329).
 */

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Loader2 } from 'lucide-react'
import { Popover } from './Popover'
import type { Formato, TipoExport } from '@/lib/sales-export'

const chip = (on: boolean) =>
  `flex-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${on
    ? 'border-gold/40 bg-gold-dim text-gold-text font-semibold'
    : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`

type Righe = 'selezione' | 'mostrate' | 'tutte'

export function EsportaLead({ selezionati, mostrati, tutti, filtri, compatto = false }: {
  selezionati: string[]
  mostrati: string[]
  tutti: string[]
  /** la vista in una frase, per la testa del PDF */
  filtri: string
  /** nella barra della selezione: solo le righe spuntate */
  compatto?: boolean
}) {
  const [aperto, setAperto] = useState(false)
  const [tipo, setTipo] = useState<TipoExport>('lead')
  const [formato, setFormato] = useState<Formato>('xlsx')
  const [scelta, setScelta] = useState<Righe | null>(null)
  const [lavoro, setLavoro] = useState(false)
  const bottone = useRef<HTMLButtonElement>(null)

  const righe: Righe = compatto ? 'selezione' : scelta ?? (selezionati.length ? 'selezione' : mostrati.length < tutti.length ? 'mostrate' : 'tutte')
  const ids = righe === 'selezione' ? selezionati : righe === 'mostrate' ? mostrati : tutti

  const scarica = async () => {
    if (!ids.length || lavoro) return
    setLavoro(true)
    try {
      const res = await fetch('/api/sales/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, formato, ids, filtri: righe === 'selezione' ? `${ids.length} righe scelte a mano` : righe === 'tutte' ? '' : filtri }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || 'Export non riuscito')
      }
      const nome = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `${tipo}-twobee.${formato}`
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url; a.download = nome
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast.success(`Scaricato ${nome}`)
      setAperto(false)
    } catch (e) { toast.error((e as Error).message) } finally { setLavoro(false) }
  }

  return (
    <>
      <button ref={bottone} type="button" onClick={() => setAperto(v => !v)} aria-expanded={aperto}
        aria-label="Esporta i lead" title="Esporta i lead"
        className={compatto
          ? 'flex items-center gap-1.5 text-xs font-semibold text-text-secondary border border-border px-3 py-1.5 rounded-lg hover:text-text-primary'
          : 'flex items-center gap-1.5 text-xs font-semibold text-text-secondary border border-border px-3 py-2 rounded-xl hover:text-text-primary hover:bg-surface-hover transition-colors'}>
        <Download className="w-3.5 h-3.5" />{compatto ? 'Esporta' : <span className="hidden xl:inline">Esporta</span>}
      </button>
      <Popover ancora={bottone} aperto={aperto} onChiudi={() => setAperto(false)} etichetta="Esporta i lead" larghezza={320}>
        <div className="p-3 space-y-3">
          <div>
            <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">Cosa</p>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Cosa esportare">
              <button type="button" role="radio" aria-checked={tipo === 'lead'} onClick={() => setTipo('lead')} className={chip(tipo === 'lead')}>Lead completo</button>
              <button type="button" role="radio" aria-checked={tipo === 'contatti'} onClick={() => setTipo('contatti')} className={chip(tipo === 'contatti')}>Contatti</button>
            </div>
            <p className="text-2xs text-text-tertiary mt-1">
              {tipo === 'lead' ? 'Tutti i campi, le note e le interazioni.' : 'Nome, azienda, email, telefono, owner e fase.'}
            </p>
          </div>

          {!compatto && (
            <div>
              <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">Quali</p>
              <div className="space-y-1" role="radiogroup" aria-label="Quali lead">
                {([
                  ...(selezionati.length ? [['selezione', `Le ${selezionati.length} selezionate`] as const] : []),
                  ...(mostrati.length < tutti.length ? [['mostrate', `Le ${mostrati.length} che vedi con i filtri`] as const] : []),
                  ['tutte', `Tutti i lead (${tutti.length})`] as const,
                ]).map(([k, etichetta]) => (
                  <label key={k} className="flex items-center gap-2 text-xs text-text-primary cursor-pointer">
                    <input type="radio" name="righe-export" checked={righe === k} onChange={() => setScelta(k)} className="accent-gold" />{etichetta}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">Formato</p>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Formato">
              {([['xlsx', 'Excel'], ['csv', 'CSV'], ['pdf', 'PDF']] as const).map(([f, e]) => (
                <button key={f} type="button" role="radio" aria-checked={formato === f} onClick={() => setFormato(f)} className={chip(formato === f)}>{e}</button>
              ))}
            </div>
          </div>

          <button type="button" onClick={() => void scarica()} disabled={lavoro || !ids.length}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-3 py-2 rounded-xl disabled:opacity-40">
            {lavoro ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Scarica {ids.length} {tipo === 'lead' ? 'lead' : ids.length === 1 ? 'contatto' : 'contatti'}
          </button>
        </div>
      </Popover>
    </>
  )
}

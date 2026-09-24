'use client'

/**
 * §371 — una cella che si apre al click e si chiude quando hai finito.
 *
 * Il patto è uno solo e vale per tutti i tipi: **Invio salva, Esc annulla,
 * uscire dal campo salva.** Un editor in cella che chiede di premere un
 * bottone non è un editor in cella — e uno che perde quello che hai scritto
 * quando clicchi altrove è peggio di un form.
 *
 * Il valore mostrato è quello che il server ha confermato, non quello che hai
 * digitato: se il salvataggio fallisce — un'email storta, una data che non è
 * una data — la cella torna com'era e lo dice. Mostrare il valore nuovo
 * mentre il database ha quello vecchio è il modo di far scoprire l'errore
 * tre giorni dopo a qualcun altro.
 */

import { useState, useRef, useEffect } from 'react'
import { Check, X } from 'lucide-react'
import { useFasi } from './FasiContext'
import { eLista } from '@/lib/sales-scelte'
import { ETICHETTA_QUALIFICA } from '@/lib/sales-table'
import { MenuFase } from './MenuFase'
import type { Colonna } from '@/lib/sales-table'

const inputCls = 'w-full bg-background border border-border-interactive rounded px-1.5 py-1 text-2xs text-text-primary'

/** una data ISO come la legge un italiano; il resto della riga resta com'è */
const dataIt = (v: string) => {
  const g = v.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(g) ? `${g.slice(8)}/${g.slice(5, 7)}/${g.slice(0, 4)}` : v
}

const euro = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export function CrmCella({ colonna, valore, onSalva, disabilitato }: {
  colonna: Colonna
  valore: unknown
  onSalva: (nuovo: unknown) => Promise<void>
  disabilitato?: boolean
}) {
  const { MOTIVI, etichettaScelta, vociPer } = useFasi()
  const [aperta, setAperta] = useState(false)
  const [bozza, setBozza] = useState('')
  const [pending, setPending] = useState(false)
  const rif = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null)

  useEffect(() => { if (aperta) rif.current?.focus() }, [aperta])

  const testo = (): string => {
    if (valore === null || valore === undefined) return ''
    if (Array.isArray(valore)) return valore.join(', ')
    if (typeof valore === 'boolean') return valore ? 'true' : ''
    if (colonna.tipo === 'data') return String(valore).slice(0, 10)
    return String(valore)
  }

  const salva = async (nuovo: unknown) => {
    setPending(true)
    try { await onSalva(nuovo); setAperta(false) } finally { setPending(false) }
  }

  const apri = () => {
    if (disabilitato) return
    setBozza(testo())
    setAperta(true)
  }

  // ── sola lettura ──────────────────────────────────────────────────────────
  if (colonna.tipo === 'sola_lettura') {
    const v = testo()
    return (
      <span className="block truncate text-2xs text-text-tertiary" title={v}>
        {colonna.campo === 'created_at' && v ? dataIt(v) : v || '—'}
      </span>
    )
  }

  // ── il sì/no non ha bisogno di aprirsi ───────────────────────────────────
  if (colonna.tipo === 'si_no') {
    return (
      <button type="button" disabled={disabilitato || pending}
        onClick={() => salva(!valore)}
        aria-label={`${colonna.etichetta}: ${valore ? 'sì' : 'no'}`}
        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
          valore ? 'bg-success border-success text-on-success' : 'border-border-strong hover:border-border-interactive'}`}>
        {valore ? <Check className="w-3 h-3" /> : null}
      </button>
    )
  }

  // ── il motivo del perso: elenco dal database, mai testo libero ───────────
  /* §428 — un campo libero qui diventa quaranta grafie di «prezzo» e rende
     inservibile il grafico dei persi prima ancora di disegnarlo. L'elenco
     arriva dalle impostazioni, come le fasi. */
  if (colonna.tipo === 'motivo') {
    return (
      <select value={String(valore ?? '')} disabled={disabilitato || pending}
        aria-label={colonna.etichetta}
        onChange={e => salva(e.target.value || null)}
        className="w-full bg-background border border-border-interactive rounded-lg px-2 py-1 text-2xs text-text-primary">
        <option value="">— non indicato —</option>
        {MOTIVI.map(m => <option key={m.chiave} value={m.chiave}>{m.etichetta}</option>)}
      </select>
    )
  }

  // ── la fase: sempre un menu, mai un testo libero ─────────────────────────
  if (colonna.tipo === 'fase') {
    /* §426 — un solo menu per tutta la sezione. Prima qui c'era un `select`
       nativo e nella scheda un'etichetta morta: due comportamenti per lo stesso
       chip, e il colore — che è metà dell'informazione di una fase — nel menu di
       sistema non si vede. Niente doppio clic per aprirlo: il chip **è** il
       bottone, come lo è ovunque altro. */
    return (
      <MenuFase
        valore={String(valore ?? '')}
        disabilitato={disabilitato || pending}
        onScegli={salva}
      />
    )
  }

  // ── le scelte chiuse ──────────────────────────────────────────────────────
  if (colonna.tipo === 'scelta') {
    /* §436 — priorità e membership vengono dal database e si leggono con la
       loro etichetta; la qualifica ha le sue. Si salva sempre la chiave. */
    const nome = (k: string) => eLista(colonna.campo) ? etichettaScelta(colonna.campo, k)
      : colonna.campo === 'qualifica' ? ETICHETTA_QUALIFICA[k] ?? k : k
    const voci = eLista(colonna.campo)
      ? vociPer(colonna.campo, testo()).map(v => v.chiave)
      : [...(colonna.valori ?? [])]
    if (!aperta) {
      const v = testo() ? nome(testo()) : ''
      return (
        <button type="button" onClick={apri} disabled={disabilitato}
          className="block w-full text-left truncate text-2xs text-text-primary hover:text-gold-text">
          {v || <span className="text-text-tertiary">—</span>}
        </button>
      )
    }
    return (
      <select ref={r => { rif.current = r }} defaultValue={testo()} disabled={pending}
        aria-label={colonna.etichetta} className={inputCls}
        onChange={e => salva(e.target.value)} onBlur={() => setAperta(false)}>
        <option value="">—</option>
        {voci.map(v => <option key={v} value={v}>{nome(v)}</option>)}
      </select>
    )
  }

  // ── etichette: chip in lettura, testo separato da virgole in scrittura ───
  if (colonna.tipo === 'etichette' && !aperta) {
    const lista = Array.isArray(valore) ? valore : []
    return (
      <button type="button" onClick={apri} disabled={disabilitato}
        className="flex flex-wrap gap-1 w-full text-left">
        {lista.length
          ? lista.map(t => (
              <span key={t} className="px-1.5 py-0.5 rounded bg-surface-active text-text-secondary text-2xs">{t}</span>
            ))
          : <span className="text-2xs text-text-tertiary">—</span>}
      </button>
    )
  }

  // ── tutto il resto: testo, con la tastiera che fa quello che ci si aspetta ─
  if (!aperta) {
    const v = testo()
    const mostrato =
      colonna.tipo === 'data' && v ? dataIt(v)
      : colonna.tipo === 'numero' && v ? euro(Number(v))
      : v
    if (colonna.tipo === 'url' && v) {
      return (
        <span className="flex items-center gap-1 min-w-0">
          <a href={v} target="_blank" rel="noopener noreferrer"
            className="truncate text-2xs text-gold-text hover:underline" title={v}>{v.replace(/^https?:\/\//, '')}</a>
          <button type="button" onClick={apri} aria-label={`Modifica ${colonna.etichetta}`}
            className="text-text-tertiary hover:text-text-primary text-2xs shrink-0">✎</button>
        </span>
      )
    }
    return (
      <button type="button" onClick={apri} disabled={disabilitato} title={mostrato}
        className="block w-full text-left truncate text-2xs text-text-primary hover:text-gold-text">
        {mostrato || <span className="text-text-tertiary">—</span>}
      </button>
    )
  }

  const tastiera = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setAperta(false) }
    if (e.key === 'Enter' && colonna.tipo !== 'lunga') { e.preventDefault(); salva(bozza) }
  }

  if (colonna.tipo === 'lunga') {
    return (
      <textarea ref={r => { rif.current = r }} value={bozza} disabled={pending} rows={3}
        aria-label={colonna.etichetta} className={inputCls}
        onChange={e => setBozza(e.target.value)} onKeyDown={tastiera} onBlur={() => salva(bozza)} />
    )
  }

  return (
    <input
      ref={r => { rif.current = r }}
      type={colonna.tipo === 'data' ? 'date' : colonna.tipo === 'email' ? 'email' : 'text'}
      value={bozza} disabled={pending} aria-label={colonna.etichetta} className={inputCls}
      onChange={e => setBozza(e.target.value)} onKeyDown={tastiera} onBlur={() => salva(bozza)} />
  )
}

export { dataIt, euro }
export const IconaX = X

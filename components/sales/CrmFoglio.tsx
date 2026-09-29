'use client'

/**
 * La vista Foglio: le stesse righe dell'elenco, in una griglia compatta.
 *
 * Risponde a «scorro decine di trattative e voglio vederle tutte insieme», che
 * l'elenco a tre righe per lead risolve male. Prende le righe **già cercate e
 * filtrate** da `CrmTable` (due viste sotto gli stessi filtri devono mostrare
 * lo stesso insieme, §379) e ci aggiunge quello che è solo del foglio: colonne
 * scelte, ordinate e ridimensionate, ordine e filtro per colonna, gruppi.
 *
 * Questo passo è in sola lettura; la modifica delle celle arriva dopo. Clic su
 * una riga apre la scheda, come nell'elenco.
 *
 * Le colonne e i filtri si ricordano per browser (`localStorage`), e la
 * memoria può mancare: senza, il foglio si apre lo stesso con i default.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, ChevronRight, ClipboardCopy, Columns3, Download, Filter, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { useFasi } from './FasiContext'
import { giorniFa } from '@/lib/sales-timeline'
import {
  COLONNE_FOGLIO, ETICHETTA_GRUPPAZIONE, STATO_FOGLIO, colonneVisibili, comeCsv, comeTsv, distinti, filtraColonne,
  leggiStato, ordinaRighe, raggruppa, testoCella, totali, colFoglio,
  type ColFoglio, type CtxFoglio, type Gruppazione, type RigaFoglio, type StatoFoglio,
} from '@/lib/sales-foglio'

const MEMORIA = 'twobee-crm-foglio'
const ALTEZZA_RIGA = 'h-7'

type Props = {
  righe: RigaFoglio[]
  apertaId: string | null
  onApri: (id: string) => void
  nomeDi: Map<string, string>
  /** id → il rilievo più pesante di igiene su quella riga, con la frase da mostrare */
  rilievi: Map<string, { peso: 'grave' | 'attenzione'; frase: string }>
  adessoMs: number
}

export function CrmFoglio({ righe, apertaId, onApri, nomeDi, rilievi, adessoMs }: Props) {
  const { TUTTE, etichettaFase, classiFase } = useFasi()
  const [stato, setStatoGrezzo] = useState<StatoFoglio>(STATO_FOGLIO)
  const [pronto, setPronto] = useState(false)
  const [chiusi, setChiusi] = useState<string[]>([])

  useEffect(() => {
    try {
      const s = window.localStorage.getItem(MEMORIA)
      if (s) setStatoGrezzo(leggiStato(JSON.parse(s)))
    } catch { /* senza memoria si parte dai default */ }
    setPronto(true)
  }, [])
  const setStato = useCallback((f: (s: StatoFoglio) => StatoFoglio) => {
    setStatoGrezzo(prima => {
      const dopo = f(prima)
      try { window.localStorage.setItem(MEMORIA, JSON.stringify(dopo)) } catch { /* resta in memoria */ }
      return dopo
    })
  }, [])

  const ctx: CtxFoglio = useMemo(() => ({
    etichettaFase, nomeDi: id => nomeDi.get(id) ?? 'Ex collega', adessoMs,
  }), [etichettaFase, nomeDi, adessoMs])

  const colonne = useMemo(() => colonneVisibili(stato), [stato])
  const larg = (c: ColFoglio) => stato.larghezze[c.chiave] ?? c.largh

  /* il filtro di colonna offre i valori delle righe già filtrate dagli altri
     filtri **tranne il proprio**, come Sheets: altrimenti, spuntato un valore,
     gli altri sparirebbero e non si potrebbe cambiare idea. */
  const dopoColonne = useMemo(() => filtraColonne(righe, stato.filtri, ctx), [righe, stato.filtri, ctx])
  const ordinate = useMemo(() => ordinaRighe(dopoColonne, stato.sort, ctx), [dopoColonne, stato.sort, ctx])
  const sezioni = useMemo(() => raggruppa(TUTTE, ordinate, stato.gruppo, ctx), [TUTTE, ordinate, stato.gruppo, ctx])
  const somme = useMemo(() => totali(ordinate, ctx), [ordinate, ctx])
  const nFiltri = Object.keys(stato.filtri).length

  const ordina = (chiave: string) => setStato(s => ({
    ...s,
    sort: s.sort?.chiave !== chiave ? { chiave, dir: 'asc' }
      : s.sort.dir === 'asc' ? { chiave, dir: 'desc' } : null,
  }))

  const copia = async () => {
    try {
      await navigator.clipboard.writeText(comeTsv(ordinate, colonne, ctx))
      toast.success(`${ordinate.length} righe copiate: incollale in Google Sheets`)
    } catch { toast.error('Copia non riuscita: il browser non ha dato il permesso') }
  }
  const scarica = () => {
    const url = URL.createObjectURL(new Blob([comeCsv(ordinate, colonne, ctx)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `commerciale-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── ridimensionare: trascinando il bordo destro dell'intestazione
  const trascina = (e: React.PointerEvent, c: ColFoglio) => {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, l0 = larg(c)
    const muovi = (ev: PointerEvent) => {
      const l = Math.max(48, Math.min(700, Math.round(l0 + ev.clientX - x0)))
      setStatoGrezzo(s => ({ ...s, larghezze: { ...s.larghezze, [c.chiave]: l } }))
    }
    const fine = () => {
      window.removeEventListener('pointermove', muovi); window.removeEventListener('pointerup', fine)
      setStatoGrezzo(s => { try { window.localStorage.setItem(MEMORIA, JSON.stringify(s)) } catch { /* ok */ } return s })
    }
    window.addEventListener('pointermove', muovi); window.addEventListener('pointerup', fine)
  }

  // ── riordinare: si trascina l'intestazione sopra un'altra
  const [daSpostare, setDaSpostare] = useState<string | null>(null)
  const sposta = (verso: string) => {
    if (!daSpostare || daSpostare === verso) return
    setStato(s => {
      const o = s.ordine.filter(k => k !== daSpostare)
      o.splice(o.indexOf(verso), 0, daSpostare)
      return { ...s, ordine: o }
    })
    setDaSpostare(null)
  }

  const celle = (r: RigaFoglio, c: ColFoglio) => {
    const t = testoCella(r, c.chiave, ctx)
    if (c.chiave === 'stage') {
      return <span className={`inline-block max-w-full truncate text-2xs font-semibold px-2 rounded-full leading-5 ${classiFase(r.stage as string)}`}>{t}</span>
    }
    if (c.chiave === 'next_followup_at' || c.chiave === 'last_interaction_at' || c.chiave === 'created_at' || c.chiave === 'started_on') {
      const scaduto = c.chiave === 'next_followup_at' && (giorniFa(r.next_followup_at as string | null, adessoMs) ?? 0) > 0
      return <span className={scaduto ? 'text-error font-semibold' : ''} title={scaduto ? 'Richiamo scaduto' : undefined}>{t}</span>
    }
    if (c.chiave === 'giorni_contatto') {
      return <span className={Number(t) > 14 ? 'text-warning' : ''}>{t}</span>
    }
    return t
  }

  if (!pronto) return null
  return (
    <div className="min-w-0 border border-border rounded-xl overflow-hidden bg-background">
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-border bg-surface">
        <MenuColonne stato={stato} setStato={setStato} />
        <label className="flex items-center gap-1.5 text-2xs text-text-secondary">
          Raggruppa
          <select value={stato.gruppo} onChange={e => setStato(s => ({ ...s, gruppo: e.target.value as Gruppazione }))}
            className="bg-background border border-border-interactive rounded-lg text-xs text-text-primary px-2 py-1">
            {(Object.keys(ETICHETTA_GRUPPAZIONE) as Gruppazione[]).map(g => (
              <option key={g} value={g}>{ETICHETTA_GRUPPAZIONE[g]}</option>
            ))}
          </select>
        </label>
        {(nFiltri > 0 || stato.sort) && (
          <button onClick={() => setStato(s => ({ ...s, filtri: {}, sort: null }))}
            className="flex items-center gap-1 text-2xs font-semibold text-text-secondary hover:text-text-primary">
            <RotateCcw className="w-3 h-3" />
            {nFiltri > 0 && `${nFiltri} filtri di colonna`}{nFiltri > 0 && stato.sort && ' · '}{stato.sort && 'ordinato'} · azzera
          </button>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <button onClick={copia} title="Copia la vista come TSV, da incollare in Google Sheets"
            className="flex items-center gap-1.5 text-2xs font-semibold text-text-secondary border border-border px-2.5 py-1 rounded-lg hover:text-text-primary hover:bg-surface-hover">
            <ClipboardCopy className="w-3.5 h-3.5" />Copia
          </button>
          <button onClick={scarica} title="Scarica la vista come CSV"
            className="flex items-center gap-1.5 text-2xs font-semibold text-text-secondary border border-border px-2.5 py-1 rounded-lg hover:text-text-primary hover:bg-surface-hover">
            <Download className="w-3.5 h-3.5" />CSV
          </button>
        </span>
      </div>

      <div className="overflow-auto max-h-[calc(100vh-14rem)]">
        <table className="border-separate border-spacing-0 text-xs text-text-primary" style={{ tableLayout: 'fixed', width: colonne.reduce((s, c) => s + larg(c), 0) }}>
          <colgroup>{colonne.map(c => <col key={c.chiave} style={{ width: larg(c) }} />)}</colgroup>
          <thead>
            <tr>
              {colonne.map((c, i) => {
                const ord = stato.sort?.chiave === c.chiave ? stato.sort.dir : null
                return (
                  <th key={c.chiave} scope="col"
                    aria-sort={ord === 'asc' ? 'ascending' : ord === 'desc' ? 'descending' : undefined}
                    draggable onDragStart={() => setDaSpostare(c.chiave)} onDragOver={e => e.preventDefault()} onDrop={() => sposta(c.chiave)}
                    className={`sticky top-0 ${i === 0 ? 'left-0 z-30' : 'z-20'} relative bg-surface border-b border-border-strong border-r border-r-border text-left font-semibold text-text-secondary ${ALTEZZA_RIGA} p-0`}>
                    <div className="flex items-center h-full pl-2 pr-1 gap-1">
                      <button onClick={() => ordina(c.chiave)} className="flex items-center gap-1 min-w-0 flex-1 text-left hover:text-text-primary"
                        title={`Ordina per ${c.etichetta}`}>
                        <span className="truncate">{c.etichetta}</span>
                        {ord === 'asc' && <ArrowUp className="w-3 h-3 shrink-0 text-gold-text" />}
                        {ord === 'desc' && <ArrowDown className="w-3 h-3 shrink-0 text-gold-text" />}
                      </button>
                      <FiltroColonna col={c} righe={filtraColonne(righe, { ...stato.filtri, [c.chiave]: [] }, ctx)} ctx={ctx}
                        scelti={stato.filtri[c.chiave] ?? []}
                        onScegli={v => setStato(s => {
                          const f = { ...s.filtri }
                          if (v.length) f[c.chiave] = v; else delete f[c.chiave]
                          return { ...s, filtri: f }
                        })} />
                    </div>
                    <span onPointerDown={e => trascina(e, c)} role="separator" aria-orientation="vertical" aria-label={`Larghezza di ${c.etichetta}`}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-gold-dim" />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sezioni.map(s => {
              const chiuso = s.persi ? !chiusi.includes('aperto:persi') : chiusi.includes(s.chiave)
              const alterna = () => setChiusi(p => {
                const k = s.persi ? 'aperto:persi' : s.chiave
                return p.includes(k) ? p.filter(x => x !== k) : [...p, k]
              })
              return (
                <SezioneFoglio key={s.chiave} titolo={s.titolo} quante={s.righe.length} colonne={colonne.length}
                  chiuso={chiuso} onAlterna={s.titolo ? alterna : undefined}>
                  {s.righe.map(r => {
                    const scelta = apertaId === r.id
                    const rilievo = rilievi.get(r.id)
                    return (
                      <tr key={`${s.chiave}:${r.id}`} onClick={() => onApri(r.id)} aria-selected={scelta}
                        className={`group cursor-pointer ${ALTEZZA_RIGA} ${scelta ? 'bg-gold-dim' : 'hover:bg-surface-hover'}`}>
                        {colonne.map((c, i) => (
                          <td key={c.chiave}
                            className={`${ALTEZZA_RIGA} px-2 border-b border-border border-r border-r-border truncate whitespace-nowrap ${
                              i === 0 ? `sticky left-0 z-10 font-semibold ${scelta ? 'bg-gold-dim' : 'bg-background group-hover:bg-surface-hover'}` : ''} ${
                              colFoglio(c.chiave)?.tipo === 'numero' ? 'text-right tabular' : ''}`}
                            title={c.chiave === 'stage' ? undefined : testoCella(r, c.chiave, ctx) || undefined}>
                            {i === 0 && rilievo && (
                              <span role="img" aria-label={rilievo.frase} title={rilievo.frase}
                                className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${rilievo.peso === 'grave' ? 'bg-error' : 'bg-warning'}`} />
                            )}
                            {celle(r, c)}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </SezioneFoglio>
              )
            })}
            {!ordinate.length && (
              <tr><td colSpan={colonne.length} className="px-3 py-10 text-center text-sm text-text-tertiary">Nessuna riga con questi filtri.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={colonne.length} className="sticky bottom-0 left-0 bg-surface border-t border-border-strong px-3 h-7 text-2xs text-text-secondary">
                <span className="tabular font-semibold text-text-primary">{somme.righe}</span> righe
                {somme.tentativi > 0 && <> · <span className="tabular font-semibold text-text-primary">{somme.tentativi}</span> tentativi a vuoto</>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function SezioneFoglio({ titolo, quante, colonne, chiuso, onAlterna, children }: {
  titolo: string; quante: number; colonne: number; chiuso: boolean; onAlterna?: () => void; children: React.ReactNode
}) {
  return (
    <>
      {titolo && (
        <tr>
          <td colSpan={colonne} className="bg-surface border-b border-border p-0">
            <button onClick={onAlterna} aria-expanded={!chiuso}
              className="sticky left-0 flex items-center gap-1.5 h-7 px-2 text-xs font-semibold text-text-secondary hover:text-text-primary">
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${chiuso ? '' : 'rotate-90'}`} />
              {titolo}<span className="text-2xs font-normal text-text-tertiary tabular">{quante}</span>
            </button>
          </td>
        </tr>
      )}
      {!chiuso && children}
    </>
  )
}

/** Un popover ancorato a un bottone, in un portale: l'area del foglio scorre e taglierebbe un menu assoluto. */
function Popover({ ancora, onChiudi, larghezza = 224, children }: {
  ancora: HTMLElement | null; onChiudi: () => void; larghezza?: number; children: React.ReactNode
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!ancora) return
    const r = ancora.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - larghezza - 8)) })
  }, [ancora, larghezza])
  useEffect(() => {
    const fuori = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !ancora?.contains(e.target as Node)) onChiudi()
    }
    const tasto = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi() }
    document.addEventListener('mousedown', fuori); document.addEventListener('keydown', tasto)
    window.addEventListener('scroll', onChiudi, true)
    return () => {
      document.removeEventListener('mousedown', fuori); document.removeEventListener('keydown', tasto)
      window.removeEventListener('scroll', onChiudi, true)
    }
  }, [ancora, onChiudi])
  if (!pos) return null
  return createPortal(
    <div ref={ref} style={{ top: pos.top, left: pos.left, width: larghezza }}
      className="fixed z-50 bg-surface border border-border-strong rounded-xl shadow-pop max-h-80 overflow-auto p-1.5">
      {children}
    </div>, document.body)
}

function MenuColonne({ stato, setStato }: { stato: StatoFoglio; setStato: (f: (s: StatoFoglio) => StatoFoglio) => void }) {
  const [aperto, setAperto] = useState(false)
  const bottone = useRef<HTMLButtonElement>(null)
  const chiudi = useCallback(() => setAperto(false), [])
  return (
    <>
      <button ref={bottone} onClick={() => setAperto(a => !a)} aria-expanded={aperto}
        className="flex items-center gap-1.5 text-2xs font-semibold text-text-secondary border border-border px-2.5 py-1 rounded-lg hover:text-text-primary hover:bg-surface-hover">
        <Columns3 className="w-3.5 h-3.5" />Colonne
        <span className="tabular text-text-tertiary">{stato.visibili.length}/{COLONNE_FOGLIO.length}</span>
      </button>
      {aperto && (
        <Popover ancora={bottone.current} onChiudi={chiudi}>
          {stato.ordine.map(k => {
            const c = colFoglio(k)
            if (!c) return null
            const on = stato.visibili.includes(k)
            return (
              <label key={k} className="flex items-center gap-2 px-2 py-1 rounded-lg text-xs text-text-primary hover:bg-surface-hover cursor-pointer">
                <input type="checkbox" checked={on} className="accent-gold"
                  disabled={on && stato.visibili.length === 1}
                  onChange={() => setStato(s => ({ ...s, visibili: on ? s.visibili.filter(x => x !== k) : [...s.visibili, k] }))} />
                {c.etichetta}
                {c.calcolata && <span className="ml-auto text-2xs text-text-tertiary">calcolata</span>}
              </label>
            )
          })}
          <button onClick={() => setStato(s => ({ ...s, visibili: STATO_FOGLIO.visibili, ordine: STATO_FOGLIO.ordine, larghezze: {} }))}
            className="w-full text-left px-2 py-1 mt-1 border-t border-border text-2xs text-text-secondary hover:text-text-primary">
            Ripristina colonne di partenza
          </button>
        </Popover>
      )}
    </>
  )
}

function FiltroColonna({ col, righe, ctx, scelti, onScegli }: {
  col: ColFoglio; righe: RigaFoglio[]; ctx: CtxFoglio; scelti: string[]; onScegli: (v: string[]) => void
}) {
  const [aperto, setAperto] = useState(false)
  const bottone = useRef<HTMLButtonElement>(null)
  const chiudi = useCallback(() => setAperto(false), [])
  const valori = useMemo(() => aperto ? distinti(righe, col.chiave, ctx) : [], [aperto, righe, col.chiave, ctx])
  const attivo = scelti.length > 0
  return (
    <>
      <button ref={bottone} onClick={() => setAperto(a => !a)} aria-label={`Filtra ${col.etichetta}`} aria-expanded={aperto}
        className={`shrink-0 p-0.5 rounded ${attivo ? 'text-gold-text bg-gold-dim' : 'text-text-tertiary hover:text-text-primary'}`}>
        <Filter className="w-3 h-3" />
      </button>
      {aperto && (
        <Popover ancora={bottone.current} onChiudi={chiudi}>
          {valori.map(({ valore, quante }) => (
            <label key={valore} className="flex items-center gap-2 px-2 py-1 rounded-lg text-xs text-text-primary hover:bg-surface-hover cursor-pointer">
              <input type="checkbox" className="accent-gold" checked={scelti.includes(valore)}
                onChange={() => onScegli(scelti.includes(valore) ? scelti.filter(x => x !== valore) : [...scelti, valore])} />
              <span className="truncate">{valore}</span>
              <span className="ml-auto text-2xs text-text-tertiary tabular">{quante}</span>
            </label>
          ))}
          {!valori.length && <p className="px-2 py-1 text-2xs text-text-tertiary">Nessun valore.</p>}
          {attivo && (
            <button onClick={() => onScegli([])} className="w-full text-left px-2 py-1 mt-1 border-t border-border text-2xs text-text-secondary hover:text-text-primary">
              Toglie il filtro
            </button>
          )}
        </Popover>
      )}
    </>
  )
}

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
 * **Si modifica sopra una copia.** Le celle toccate vivono in `bozza` finché non
 * si preme «Salva»: un solo giro (`salvaBatchDeal`), con il valore che si
 * vedeva all'inizio per accorgersi di un collega. Una cella non valida diventa
 * rossa e le altre si salvano; una riga cambiata da un altro si ferma intera e
 * chiede «Tieni la mia / Prendi la sua». Sotto i 768px il foglio è in sola
 * lettura e il clic su una riga apre la scheda, come nell'elenco.
 *
 * Le colonne e i filtri si ricordano per browser (`localStorage`), e la
 * memoria può mancare: senza, il foglio si apre lo stesso con i default.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, ChevronRight, ClipboardCopy, Columns3, Download, ExternalLink, Filter, RotateCcw, Save, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { useFasi } from './FasiContext'
import { giorniFa } from '@/lib/sales-timeline'
import { salvaBatchDeal, type ModificaRiga } from '@/app/actions/sales'
import { ETICHETTA_QUALIFICA, QUALIFICHE, colonnaDi } from '@/lib/sales-table'
import { ammesse } from '@/lib/sales-scelte'
import {
  COLONNE_FOGLIO, colonnaModificabile, interpreta, leggiTsv, ripeti, stessoValore, testoEditor, ETICHETTA_GRUPPAZIONE, STATO_FOGLIO, colonneVisibili, comeCsv, comeTsv, distinti, filtraColonne,
  leggiStato, ordinaRighe, raggruppa, testoCella, totali, colFoglio,
  type ColFoglio, type CtxFoglio, type Gruppazione, type RigaFoglio, type StatoFoglio,
} from '@/lib/sales-foglio'

const MEMORIA = 'twobee-crm-foglio'
const ALTEZZA_RIGA = 'h-7'

type Bozza = Record<string, Record<string, { testo: string; valore?: unknown; errore?: string }>>
type Pos = { r: number; c: number }

type Props = {
  righe: RigaFoglio[]
  persone: { id: string; nome: string; assegnabile: boolean }[]
  puoiAssegnare: boolean
  /** scrive nella tabella dell'elenco i valori che il server ha confermato */
  onAggiorna: (id: string, valori: Record<string, unknown>) => void
  apertaId: string | null
  onApri: (id: string) => void
  nomeDi: Map<string, string>
  /** id → il rilievo più pesante di igiene su quella riga, con la frase da mostrare */
  rilievi: Map<string, { peso: 'grave' | 'attenzione'; frase: string }>
  adessoMs: number
}

export function CrmFoglio({ righe, persone, puoiAssegnare, onAggiorna, apertaId, onApri, nomeDi, rilievi, adessoMs }: Props) {
  const { TUTTE, FASI, MOTIVI, SCELTE, etichettaFase, classiFase, etichettaScelta } = useFasi()
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

  // ── modifica ────────────────────────────────────────────────────────────────
  const [largo, setLargo] = useState(true)
  useEffect(() => {
    const m = window.matchMedia('(min-width: 768px)')
    const f = () => setLargo(m.matches)
    f(); m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  const modifica = largo

  const [bozza, setBozza] = useState<Bozza>({})
  const [storia, setStoria] = useState<Bozza[]>([])
  const [conflitti, setConflitti] = useState<Record<string, Record<string, unknown>>>({})
  const [salvando, setSalvando] = useState(false)
  const base = useRef<Record<string, Record<string, unknown>>>({})
  const [sel, setSel] = useState<Pos | null>(null)
  const [ancora, setAncora] = useState<Pos | null>(null)
  const [editing, setEditing] = useState<{ pos: Pos; testo: string } | null>(null)
  const premuto = useRef(false)
  const area = useRef<HTMLDivElement>(null)

  const persona = useMemo(() => persone.filter(p => p.assegnabile), [persone])
  const perId = useMemo(() => new Map(righe.map(r => [r.id, r])), [righe])
  const ctxI = useMemo(() => ({
    fasi: TUTTE, ammesse: ammesse(SCELTE), motivi: MOTIVI, persone: persona,
    etichettaScelta: (campo: string, chiave: string) => etichettaScelta(campo, chiave), oggi: new Date(),
  }), [TUTTE, SCELTE, MOTIVI, persona, etichettaScelta])

  const chiusa = (s: { chiave: string; persi?: boolean }) => s.persi ? !chiusi.includes('aperto:persi') : chiusi.includes(s.chiave)
  const piatte = useMemo(() => sezioni.flatMap(s => chiusa(s) ? [] : s.righe),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sezioni, chiusi])
  const indice = useMemo(() => new Map(piatte.map((r, i) => [r.id, i])), [piatte])
  const scrivibile = (c: ColFoglio) => colonnaModificabile(c.chiave) && (c.chiave !== 'owners' || puoiAssegnare)

  const testoDi = (r: RigaFoglio, chiave: string) => bozza[r.id]?.[chiave]?.testo ?? testoCella(r, chiave, ctx)
  const grezzoDi = (r: RigaFoglio, chiave: string) => {
    const b = bozza[r.id]?.[chiave]
    return b ? b.testo : testoEditor(r[chiave], chiave, ctx)
  }

  const applica = (mod: { id: string; chiave: string; testo: string }[]) => {
    if (!mod.length) return
    const dopo: Bozza = { ...bozza }
    for (const { id, chiave, testo } of mod) {
      const riga = perId.get(id)
      if (!riga) continue
      const i = interpreta(chiave, testo, ctxI)
      const b = (base.current[id] ??= {})
      if (!(chiave in b)) b[chiave] = riga[chiave]
      const celle = { ...(dopo[id] ?? {}) }
      if (i.ok && stessoValore(i.valore, b[chiave])) delete celle[chiave]
      else celle[chiave] = i.ok ? { testo, valore: i.valore } : { testo, errore: i.motivo }
      if (Object.keys(celle).length) dopo[id] = celle
      else { delete dopo[id]; delete base.current[id] }
    }
    setStoria(s => [...s.slice(-49), bozza])
    setBozza(dopo)
  }

  const annulla = () => {
    const u = storia[storia.length - 1]
    if (!u) return
    setBozza(u); setStoria(s => s.slice(0, -1))
    for (const id of Object.keys(base.current)) if (!u[id]) delete base.current[id]
  }
  const scarta = () => { setBozza({}); setStoria([]); setConflitti({}); base.current = {} }

  const nModifiche = Object.values(bozza).reduce((n, r) => n + Object.values(r).filter(c => !c.errore).length, 0)
  const nErrori = Object.values(bozza).reduce((n, r) => n + Object.values(r).filter(c => c.errore).length, 0)
  const sporco = nModifiche + nErrori > 0
  useEffect(() => {
    if (!sporco) return
    const f = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [sporco])

  const salva = async (soloId?: string) => {
    const modifiche: ModificaRiga[] = []
    for (const [id, celle] of Object.entries(bozza)) {
      if (soloId && id !== soloId) continue
      const ok = Object.entries(celle).filter(([, c]) => !c.errore)
      if (!ok.length) continue
      modifiche.push({
        id,
        base: Object.fromEntries(ok.map(([k]) => [k, base.current[id]?.[k] ?? null])),
        campi: Object.fromEntries(ok.map(([k, c]) => [k, c.valore])),
      })
    }
    if (!modifiche.length) return
    setSalvando(true)
    try {
      const esiti = await salvaBatchDeal(modifiche)
      const dopo: Bozza = { ...bozza }
      const nuoviConflitti = { ...conflitti }
      let salvate = 0
      for (const e of esiti) {
        if (Object.keys(e.conflitti).length) { nuoviConflitti[e.id] = e.conflitti; continue }
        delete nuoviConflitti[e.id]
        if (Object.keys(e.salvati).length) { onAggiorna(e.id, e.salvati); salvate += Object.keys(e.salvati).length }
        const celle = { ...(dopo[e.id] ?? {}) }
        for (const k of Object.keys(e.salvati)) { delete celle[k]; if (base.current[e.id]) base.current[e.id][k] = e.salvati[k] }
        for (const [k, motivo] of Object.entries(e.errori)) if (celle[k]) celle[k] = { ...celle[k], errore: motivo }
        if (Object.keys(celle).length) dopo[e.id] = celle; else { delete dopo[e.id]; delete base.current[e.id] }
      }
      setBozza(dopo); setConflitti(nuoviConflitti); setStoria([])
      const nc = Object.keys(nuoviConflitti).length
      if (salvate) toast.success(`${salvate} ${salvate === 1 ? 'cella salvata' : 'celle salvate'}`)
      if (nc) toast.error(`${nc} ${nc === 1 ? 'riga è stata cambiata' : 'righe sono state cambiate'} da un collega: scegli cosa tenere`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setSalvando(false) }
  }

  const prendiLaSua = (id: string) => {
    const loro = conflitti[id]
    if (loro) onAggiorna(id, loro)
    const dopo = { ...bozza }; delete dopo[id]; delete base.current[id]
    const c = { ...conflitti }; delete c[id]
    setBozza(dopo); setConflitti(c)
  }
  const tieniLaMia = async (id: string) => {
    base.current[id] = { ...(base.current[id] ?? {}), ...conflitti[id] }
    const c = { ...conflitti }; delete c[id]
    setConflitti(c)
    await salva(id)
  }

  const intervallo = (): { r0: number; r1: number; c0: number; c1: number } | null => {
    if (!sel) return null
    const a = ancora ?? sel
    return { r0: Math.min(a.r, sel.r), r1: Math.max(a.r, sel.r), c0: Math.min(a.c, sel.c), c1: Math.max(a.c, sel.c) }
  }
  const dentro = (r: number, c: number) => { const x = intervallo(); return !!x && r >= x.r0 && r <= x.r1 && c >= x.c0 && c <= x.c1 }

  const vai = (r: number, c: number, estendi = false) => {
    const rr = Math.max(0, Math.min(piatte.length - 1, r)), cc = Math.max(0, Math.min(colonne.length - 1, c))
    if (!estendi) setAncora(null)
    else if (!ancora && sel) setAncora(sel)
    setSel({ r: rr, c: cc })
  }
  const apriEditor = (pos: Pos, testo?: string) => {
    const r = piatte[pos.r], c = colonne[pos.c]
    if (!r || !c || !scrivibile(c)) return
    setEditing({ pos, testo: testo ?? grezzoDi(r, c.chiave) })
  }
  const chiudiEditor = (conferma: boolean) => {
    const e = editing
    setEditing(null)
    if (e && conferma) {
      const r = piatte[e.pos.r], c = colonne[e.pos.c]
      if (r && c && e.testo !== grezzoDi(r, c.chiave)) applica([{ id: r.id, chiave: c.chiave, testo: e.testo }])
    }
    area.current?.focus()
  }

  const celleSelezionate = () => {
    const x = intervallo(); if (!x) return []
    const out: string[][] = []
    for (let r = x.r0; r <= x.r1; r++) out.push(colonne.slice(x.c0, x.c1 + 1).map(c => testoDi(piatte[r], c.chiave)))
    return out
  }
  const incolla = (blocco: string[][]) => {
    const x = intervallo(); if (!x || !blocco.length) return
    const singola = blocco.length === 1 && blocco[0].length === 1
    const righeN = singola ? x.r1 - x.r0 + 1 : blocco.length
    const colN = singola ? x.c1 - x.c0 + 1 : Math.max(...blocco.map(b => b.length))
    const sorgente = singola ? ripeti(blocco, righeN) : blocco
    const mod: { id: string; chiave: string; testo: string }[] = []
    for (let i = 0; i < righeN && x.r0 + i < piatte.length; i++) {
      for (let j = 0; j < colN && x.c0 + j < colonne.length; j++) {
        const c = colonne[x.c0 + j]
        if (!scrivibile(c)) continue
        mod.push({ id: piatte[x.r0 + i].id, chiave: c.chiave, testo: singola ? sorgente[i][0] : sorgente[i][j] ?? '' })
      }
    }
    applica(mod)
  }
  const riempiGiu = () => {
    const x = intervallo(); if (!x || x.r1 === x.r0) return
    const mod: { id: string; chiave: string; testo: string }[] = []
    for (let j = x.c0; j <= x.c1; j++) {
      const c = colonne[j]; if (!scrivibile(c)) continue
      const t = testoDi(piatte[x.r0], c.chiave) === '' ? '' : grezzoDi(piatte[x.r0], c.chiave)
      for (let r = x.r0 + 1; r <= x.r1; r++) mod.push({ id: piatte[r].id, chiave: c.chiave, testo: t })
    }
    applica(mod)
  }
  const svuota = () => {
    const x = intervallo(); if (!x) return
    const mod: { id: string; chiave: string; testo: string }[] = []
    for (let r = x.r0; r <= x.r1; r++) for (let j = x.c0; j <= x.c1; j++) {
      if (scrivibile(colonne[j])) mod.push({ id: piatte[r].id, chiave: colonne[j].chiave, testo: '' })
    }
    applica(mod)
  }

  const tasto = (e: React.KeyboardEvent) => {
    if (editing || !modifica) return
    const mod = e.metaKey || e.ctrlKey
    const k = e.key
    if (mod && k.toLowerCase() === 's') { e.preventDefault(); void salva(); return }
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); annulla(); return }
    if (!sel) return
    if (mod && k.toLowerCase() === 'd') { e.preventDefault(); riempiGiu(); return }
    if (mod && k.toLowerCase() === 'a') { e.preventDefault(); setAncora({ r: 0, c: 0 }); setSel({ r: piatte.length - 1, c: colonne.length - 1 }); return }
    if (mod) return
    const passo: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (passo[k]) { e.preventDefault(); vai(sel.r + passo[k][0], sel.c + passo[k][1], e.shiftKey); return }
    if (k === 'Tab') { e.preventDefault(); vai(sel.r, sel.c + (e.shiftKey ? -1 : 1)); return }
    if (k === 'Enter' || k === 'F2') { e.preventDefault(); apriEditor(sel); return }
    if (k === 'Escape') { setAncora(null); return }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); svuota(); return }
    if (k.length === 1 && !e.altKey) { e.preventDefault(); apriEditor(sel, k) }
  }
  const copiaCelle = (e: React.ClipboardEvent) => {
    if (editing || !modifica || !sel) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', celleSelezionate().map(r => r.join('\t')).join('\n'))
  }
  const incollaCelle = (e: React.ClipboardEvent) => {
    if (editing || !modifica || !sel) return
    e.preventDefault()
    incolla(leggiTsv(e.clipboardData.getData('text/plain')))
  }

  const opzioni = (chiave: string): string[] => {
    const c = colonnaDi(chiave)
    if (!c) return []
    if (c.tipo === 'fase') return FASI.map(f => f.etichetta)
    if (c.tipo === 'motivo') return MOTIVI.map(m => m.etichetta)
    if (chiave === 'qualifica') return QUALIFICHE.map(q => ETICHETTA_QUALIFICA[q])
    if (c.tipo === 'scelta') return (ammesse(SCELTE)[chiave] ?? c.valori ?? []).map(v => etichettaScelta(chiave, v))
    if (chiave === 'owners') return persona.map(p => p.nome)
    return []
  }

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
        {modifica && sporco && (
          <span className="flex items-center gap-1.5 text-2xs">
            <span className="text-text-secondary">
              <span className="tabular font-semibold text-text-primary">{nModifiche}</span> da salvare
              {nErrori > 0 && <> · <span className="tabular font-semibold text-error">{nErrori}</span> da correggere</>}
            </span>
            <button onClick={() => void salva()} disabled={salvando || nModifiche === 0} title="Salva tutto (Ctrl+S)"
              className="flex items-center gap-1.5 font-semibold bg-gold text-on-gold px-2.5 py-1 rounded-lg disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />{salvando ? 'Salvo…' : 'Salva'}
            </button>
            <button onClick={annulla} disabled={!storia.length} title="Annulla l'ultima modifica (Ctrl+Z)"
              className="flex items-center gap-1 font-semibold text-text-secondary border border-border px-2 py-1 rounded-lg hover:text-text-primary hover:bg-surface-hover disabled:opacity-40">
              <Undo2 className="w-3.5 h-3.5" />Annulla
            </button>
            <button onClick={scarta} className="font-semibold text-text-secondary hover:text-text-primary">Scarta tutto</button>
          </span>
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

      {Object.keys(conflitti).length > 0 && (
        <div role="alert" className="px-3 py-2 border-b border-border bg-warning-dim text-2xs text-text-primary space-y-1">
          <p className="font-semibold">Un collega ha cambiato queste righe mentre lavoravi: non le ho toccate.</p>
          {Object.keys(conflitti).map(id => (
            <p key={id} className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{String(perId.get(id)?.company_name || 'Lead senza nome')}</span>
              <span className="text-text-secondary">
                {Object.entries(conflitti[id]).map(([k, v]) => `${colFoglio(k)?.etichetta ?? k}: ${testoEditor(v, k, ctx) || '—'}`).join(' · ')}
              </span>
              <button onClick={() => void tieniLaMia(id)} className="font-semibold text-gold-text hover:underline">Tieni la mia</button>
              <button onClick={() => prendiLaSua(id)} className="font-semibold text-text-secondary hover:text-text-primary hover:underline">Prendi la sua</button>
            </p>
          ))}
        </div>
      )}

      <div ref={area} tabIndex={modifica ? 0 : undefined} onKeyDown={tasto} onCopy={copiaCelle} onPaste={incollaCelle}
        onMouseUp={() => { premuto.current = false }} onMouseLeave={() => { premuto.current = false }}
        className="overflow-auto max-h-[calc(100vh-14rem)] outline-none">
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
                    const ri = indice.get(r.id) ?? -1
                    return (
                      <tr key={`${s.chiave}:${r.id}`} onClick={modifica ? undefined : () => onApri(r.id)} aria-selected={scelta}
                        className={`group ${modifica ? '' : 'cursor-pointer'} ${ALTEZZA_RIGA} ${scelta ? 'bg-gold-dim' : 'hover:bg-surface-hover'}`}>
                        {colonne.map((c, i) => {
                          const b = bozza[r.id]?.[c.chiave]
                          const inSel = modifica && dentro(ri, i)
                          const attiva = modifica && sel?.r === ri && sel.c === i
                          const inEditor = editing?.pos.r === ri && editing.pos.c === i
                          const inConflitto = !!conflitti[r.id] && c.chiave in conflitti[r.id]
                          return (
                            <td key={c.chiave}
                              onMouseDown={modifica ? e => {
                                if (e.button !== 0 || inEditor) return
                                premuto.current = true
                                if (e.shiftKey && sel) setAncora(a => a ?? sel); else setAncora(null)
                                setSel({ r: ri, c: i })
                                area.current?.focus()
                              } : undefined}
                              onMouseEnter={modifica ? () => { if (premuto.current && sel) { setAncora(a => a ?? sel); setSel({ r: ri, c: i }) } } : undefined}
                              onDoubleClick={modifica ? () => apriEditor({ r: ri, c: i }) : undefined}
                              aria-invalid={b?.errore ? true : undefined}
                              className={`${ALTEZZA_RIGA} px-2 border-b border-border border-r border-r-border truncate whitespace-nowrap ${
                                i === 0 ? `sticky left-0 z-10 font-semibold ${scelta ? 'bg-gold-dim' : 'bg-background group-hover:bg-surface-hover'}` : ''} ${
                                colFoglio(c.chiave)?.tipo === 'numero' ? 'text-right tabular' : ''} ${
                                b?.errore ? 'bg-error-dim text-error' : b ? 'bg-warning-dim' : ''} ${
                                inSel && !attiva ? 'bg-gold-dim' : ''} ${
                                attiva ? 'outline outline-2 -outline-offset-2 outline-gold relative z-10' : ''} ${
                                inConflitto ? 'outline outline-1 -outline-offset-1 outline-warning' : ''} ${
                                modifica && !scrivibile(c) ? 'text-text-secondary' : ''} select-none`}
                              title={b?.errore ?? (c.chiave === 'stage' ? undefined : testoDi(r, c.chiave) || undefined)}>
                              {inEditor && editing ? (
                                <>
                                  <input autoFocus value={editing.testo} list={`opz-${c.chiave}`}
                                    onChange={e => setEditing({ pos: editing.pos, testo: e.target.value })}
                                    onBlur={() => chiudiEditor(true)}
                                    onKeyDown={e => {
                                      e.stopPropagation()
                                      if (e.key === 'Enter') { e.preventDefault(); const p = editing.pos; chiudiEditor(true); vai(p.r + 1, p.c) }
                                      else if (e.key === 'Tab') { e.preventDefault(); const p = editing.pos; chiudiEditor(true); vai(p.r, p.c + (e.shiftKey ? -1 : 1)) }
                                      else if (e.key === 'Escape') { e.preventDefault(); chiudiEditor(false) }
                                    }}
                                    aria-label={`Modifica ${c.etichetta}`}
                                    className="w-full h-full bg-background text-xs text-text-primary outline-none" />
                                  <datalist id={`opz-${c.chiave}`}>{opzioni(c.chiave).map(o => <option key={o} value={o} />)}</datalist>
                                </>
                              ) : (
                                <>
                                  {i === 0 && rilievo && (
                                    <span role="img" aria-label={rilievo.frase} title={rilievo.frase}
                                      className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${rilievo.peso === 'grave' ? 'bg-error' : 'bg-warning'}`} />
                                  )}
                                  {b ? b.testo : celle(r, c)}
                                  {modifica && i === 0 && (
                                    <button onClick={e => { e.stopPropagation(); onApri(r.id) }} aria-label={`Apri la scheda di ${testoCella(r, c.chiave, ctx) || 'questo lead'}`}
                                      className="float-right mt-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 text-text-tertiary hover:text-text-primary">
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          )
                        })}
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

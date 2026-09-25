'use client'

/**
 * §440 — cercare, filtrare, ordinare, e ritrovare quello che si è fatto.
 *
 * Prima i filtri stavano in un pannello di chip che si apriva sotto la barra,
 * l'ordinamento era un `select` con una freccia a parte, e al ricarico sparivano
 * tutti e due. Qui ogni filtro attivo è **una frase che si legge** («Fase:
 * Nuovo lead, In contatto ×») e si cambia cliccandola; se ne aggiunge uno da
 * «+ Filtro», che elenca solo le variabili che hanno valori; le date hanno gli
 * intervalli pronti e il calendario per quello libero. Sopra, le tre domande
 * che si fanno ogni mattina sono un clic: miei, da richiamare, fermi.
 *
 * Lo stato non vive qui: arriva dal componente e torna al componente, che lo
 * scrive nell'indirizzo e lo ricorda (`lib/sales-vista.ts`).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Search, Plus, X, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, Bookmark, Check, Trash2, Share2, Users, PhoneCall, Hourglass, CalendarRange,
} from 'lucide-react'
import { FILTRABILI, opzioni, type Riga, type Scelte } from '@/lib/sales-filtri'
import {
  CAMPI_DATA, CRITERI, CRITERI_FREQUENTI, ETICHETTA_DATA, ETICHETTA_RAPIDA, ORDINE_BASE, PRONTI, RAPIDE, VUOTO,
  etichettaFiltroData, quantiAttivi, scrivi, type CampoData, type Criterio, type FiltroData, type Rapida, type StatoElenco,
} from '@/lib/sales-vista'
import { leggiViste, salvaVista, eliminaVista, type VistaSalvata } from '@/app/actions/sales-viste'
import { giornoEOraRoma } from '@/lib/sales-timeline'
import { Popover } from './Popover'
import { MiniCalendario } from './MiniCalendario'

const chip = (on: boolean) =>
  `text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors ${on
    ? 'border-gold/40 bg-gold-dim text-gold-text'
    : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`
const voce = 'w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-text-primary hover:bg-surface-hover'
const ICONA_RAPIDA: Record<Rapida, typeof Users> = { miei: Users, richiamare: PhoneCall, fermi: Hourglass }

type Etichette = {
  valore: (campo: string, v: string) => string
}

/** una variabile da filtrare: una scelta multipla o una data */
type Variabile = { tipo: 'scelta'; campo: string; etichetta: string } | { tipo: 'data'; campo: CampoData; etichetta: string }

function PassoScelta({ campo, etichetta, righe, scelti, onCambia, etichette, onIndietro }: {
  campo: string; etichetta: string; righe: Riga[]; scelti: string[]
  onCambia: (v: string[]) => void; etichette: Etichette; onIndietro?: () => void
}) {
  const f = FILTRABILI.find(x => x.campo === campo)!
  const ops = opzioni(righe, f)
  const [q, setQ] = useState('')
  const viste = ops.filter(o => !q || etichette.valore(campo, o.valore).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="py-1">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border">
        {onIndietro && <button type="button" onClick={onIndietro} aria-label="Torna alle variabili" className="p-1 text-text-tertiary hover:text-text-primary"><ChevronLeft className="w-4 h-4" /></button>}
        <span className="text-xs font-semibold text-text-primary flex-1">{etichetta}</span>
        {scelti.length > 0 && <button type="button" onClick={() => onCambia([])} className="text-2xs text-text-tertiary hover:text-text-primary">Nessuno</button>}
      </div>
      {ops.length > 8 && (
        <div className="px-2 pt-2">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Cerca in ${etichetta.toLowerCase()}`} aria-label={`Cerca in ${etichetta}`}
            className="w-full bg-background border border-border-interactive rounded-lg px-2 py-1 text-xs text-text-primary" />
        </div>
      )}
      <div role="group" aria-label={etichetta} className="py-1">
        {viste.map(o => {
          const on = scelti.includes(o.valore)
          return (
            <button key={o.valore} type="button" role="checkbox" aria-checked={on}
              onClick={() => onCambia(on ? scelti.filter(x => x !== o.valore) : [...scelti, o.valore])} className={voce}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-gold border-gold text-on-gold' : 'border-border-strong'}`}>
                {on && <Check className="w-3 h-3" strokeWidth={3} />}
              </span>
              <span className="flex-1 truncate">{etichette.valore(campo, o.valore)}</span>
              <span className="text-2xs text-text-tertiary tabular">{o.quante}</span>
            </button>
          )
        })}
        {!viste.length && <p className="px-3 py-2 text-2xs text-text-tertiary">Nessun valore</p>}
      </div>
    </div>
  )
}

function PassoData({ campo, attuale, onCambia, onIndietro }: {
  campo: CampoData; attuale: FiltroData | undefined; onCambia: (f: FiltroData | undefined) => void; onIndietro?: () => void
}) {
  const oggi = giornoEOraRoma(Date.now()).giorno
  const [libero, setLibero] = useState(attuale?.tipo === 'intervallo')
  const [dal, setDal] = useState(attuale?.tipo === 'intervallo' ? attuale.dal : null)
  const [al, setAl] = useState(attuale?.tipo === 'intervallo' ? attuale.al : null)
  /* il primo clic è l'inizio, il secondo la fine; un terzo ricomincia.
     Cliccare prima della data di partenza la sposta invece di fare un
     intervallo rovesciato. */
  const clic = (g: string) => {
    if (!dal || (dal && al)) { setDal(g); setAl(null); return }
    if (g < dal) { setDal(g); return }
    setAl(g)
    onCambia({ tipo: 'intervallo', dal, al: g })
  }
  return (
    <div className="py-1">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border">
        {onIndietro && <button type="button" onClick={onIndietro} aria-label="Torna alle variabili" className="p-1 text-text-tertiary hover:text-text-primary"><ChevronLeft className="w-4 h-4" /></button>}
        <span className="text-xs font-semibold text-text-primary flex-1">{ETICHETTA_DATA[campo]}</span>
        {attuale && <button type="button" onClick={() => onCambia(undefined)} className="text-2xs text-text-tertiary hover:text-text-primary">Togli</button>}
      </div>
      <div className="py-1">
        {PRONTI[campo].map(p => {
          const on = JSON.stringify(p.filtro) === JSON.stringify(attuale)
          return (
            <button key={p.etichetta} type="button" role="radio" aria-checked={on} onClick={() => { setLibero(false); onCambia(p.filtro) }} className={voce}>
              <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${on ? 'bg-gold border-gold' : 'border-border-strong'}`}>
                {on && <Check className="w-3 h-3 text-on-gold" strokeWidth={3} />}
              </span>
              {p.etichetta}
            </button>
          )
        })}
        <button type="button" onClick={() => setLibero(v => !v)} aria-expanded={libero} className={voce}>
          <CalendarRange className="w-4 h-4 text-text-tertiary" />Intervallo dal calendario…
        </button>
      </div>
      {libero && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-2xs text-text-tertiary">
            {!dal ? 'Clicca il primo giorno' : !al ? 'Ora l’ultimo giorno' : etichettaFiltroData(campo, { tipo: 'intervallo', dal, al })}
          </p>
          <MiniCalendario valore={al ?? dal ?? oggi} oggi={oggi} intervallo={{ dal, al }} onScegli={clic} etichetta={`Intervallo di ${ETICHETTA_DATA[campo].toLowerCase()}`} />
          {dal && !al && (
            <div className="flex gap-2">
              <button type="button" onClick={() => onCambia({ tipo: 'intervallo', dal, al: null })} className="text-2xs text-gold-text underline">Solo dal {dal.slice(8)}/{dal.slice(5, 7)} in poi</button>
              <button type="button" onClick={() => { setAl(dal); onCambia({ tipo: 'intervallo', dal, al: dal }) }} className="text-2xs text-gold-text underline">Solo quel giorno</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Filtro({ variabile, stato, setStato, righe, etichette }: {
  variabile: Variabile; stato: StatoElenco; setStato: (s: StatoElenco) => void; righe: Riga[]; etichette: Etichette
}) {
  const [aperto, setAperto] = useState(false)
  const bottone = useRef<HTMLButtonElement>(null)
  const togli = () => variabile.tipo === 'scelta'
    ? setStato({ ...stato, scelte: { ...stato.scelte, [variabile.campo]: [] } })
    : setStato({ ...stato, date: Object.fromEntries(Object.entries(stato.date).filter(([k]) => k !== variabile.campo)) })
  let testo = ''
  if (variabile.tipo === 'scelta') {
    const v = stato.scelte[variabile.campo] ?? []
    const nomi = v.map(x => etichette.valore(variabile.campo, x))
    testo = nomi.length > 2 ? `${nomi.slice(0, 2).join(', ')} +${nomi.length - 2}` : nomi.join(', ')
  } else {
    testo = etichettaFiltroData(variabile.campo, stato.date[variabile.campo]!)
  }
  return (
    <span className="inline-flex items-center rounded-xl border border-gold/40 bg-gold-dim text-gold-text text-xs max-w-full">
      <button ref={bottone} type="button" onClick={() => setAperto(v => !v)} aria-expanded={aperto}
        className="pl-3 pr-1 py-1.5 truncate max-w-[18rem]" title={`${variabile.etichetta}: ${testo}`}>
        <span className="text-text-secondary">{variabile.etichetta}:</span> <span className="font-semibold">{testo}</span>
      </button>
      <button type="button" onClick={togli} aria-label={`Togli il filtro ${variabile.etichetta}`} className="px-1.5 py-1.5 hover:text-text-primary">
        <X className="w-3.5 h-3.5" />
      </button>
      <Popover ancora={bottone} aperto={aperto} onChiudi={() => setAperto(false)} etichetta={`Filtro ${variabile.etichetta}`} larghezza={300}>
        {variabile.tipo === 'scelta'
          ? <PassoScelta campo={variabile.campo} etichetta={variabile.etichetta} righe={righe} scelti={stato.scelte[variabile.campo] ?? []}
              etichette={etichette} onCambia={v => setStato({ ...stato, scelte: { ...stato.scelte, [variabile.campo]: v } })} />
          : <PassoData campo={variabile.campo} attuale={stato.date[variabile.campo]}
              onCambia={f => { setStato({ ...stato, date: f ? { ...stato.date, [variabile.campo]: f } : Object.fromEntries(Object.entries(stato.date).filter(([k]) => k !== variabile.campo)) }); if (f && f.tipo !== 'intervallo') setAperto(false) }} />}
      </Popover>
    </span>
  )
}

function AggiungiFiltro({ stato, setStato, righe, etichette }: {
  stato: StatoElenco; setStato: (s: StatoElenco) => void; righe: Riga[]; etichette: Etichette
}) {
  const [aperto, setAperto] = useState(false)
  const [passo, setPasso] = useState<Variabile | null>(null)
  const [q, setQ] = useState('')
  const bottone = useRef<HTMLButtonElement>(null)
  const variabili: Variabile[] = useMemo(() => [
    ...CAMPI_DATA.map(c => ({ tipo: 'data' as const, campo: c, etichetta: ETICHETTA_DATA[c] })),
    // si offrono solo le variabili che hanno valori: un filtro senza opzioni è un vicolo cieco
    ...FILTRABILI.filter(f => opzioni(righe, f).length > 0).map(f => ({ tipo: 'scelta' as const, campo: f.campo, etichetta: f.etichetta })),
  ], [righe])
  const chiudi = () => { setAperto(false); setPasso(null); setQ('') }
  const filtrate = variabili.filter(v => !q || v.etichetta.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <button ref={bottone} type="button" onClick={() => aperto ? chiudi() : setAperto(true)} aria-expanded={aperto}
        className="inline-flex items-center gap-1 text-xs font-semibold text-text-secondary border border-dashed border-border-strong px-3 py-1.5 rounded-xl hover:text-text-primary hover:bg-surface-hover">
        <Plus className="w-3.5 h-3.5" />Filtro
      </button>
      <Popover ancora={bottone} aperto={aperto} onChiudi={chiudi} etichetta="Aggiungi un filtro" larghezza={300}>
        {!passo ? (
          <div className="py-1">
            <div className="px-2 py-1.5 border-b border-border">
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Filtra per…" aria-label="Cerca una variabile"
                className="w-full bg-background border border-border-interactive rounded-lg px-2 py-1 text-xs text-text-primary" />
            </div>
            {filtrate.map((v, i) => {
              const attivo = v.tipo === 'data' ? !!stato.date[v.campo] : !!stato.scelte[v.campo]?.length
              const primaScelta = v.tipo === 'scelta' && filtrate[i - 1]?.tipo === 'data'
              return (
                <div key={v.campo}>
                  {primaScelta && <div className="border-t border-border my-1" />}
                  <button type="button" onClick={() => setPasso(v)} className={voce}>
                    {v.tipo === 'data' ? <CalendarRange className="w-3.5 h-3.5 text-text-tertiary" /> : <span className="w-3.5" />}
                    <span className="flex-1">{v.etichetta}</span>
                    {attivo && <span className="w-1.5 h-1.5 rounded-full bg-gold" aria-label="attivo" />}
                  </button>
                </div>
              )
            })}
          </div>
        ) : passo.tipo === 'scelta' ? (
          <PassoScelta campo={passo.campo} etichetta={passo.etichetta} righe={righe} scelti={stato.scelte[passo.campo] ?? []} etichette={etichette}
            onIndietro={() => setPasso(null)} onCambia={v => setStato({ ...stato, scelte: { ...stato.scelte, [passo.campo]: v } })} />
        ) : (
          <PassoData campo={passo.campo} attuale={stato.date[passo.campo]} onIndietro={() => setPasso(null)}
            onCambia={f => {
              setStato({ ...stato, date: f ? { ...stato.date, [passo.campo]: f } : Object.fromEntries(Object.entries(stato.date).filter(([k]) => k !== passo.campo)) })
              if (f && f.tipo !== 'intervallo') chiudi()
            }} />
        )}
      </Popover>
    </>
  )
}

function Ordina({ stato, setStato }: { stato: StatoElenco; setStato: (s: StatoElenco) => void }) {
  const [aperto, setAperto] = useState(false)
  const [tutti, setTutti] = useState(false)
  const bottone = useRef<HTMLButtonElement>(null)
  const ordine = stato.ordine.length ? stato.ordine : ORDINE_BASE
  const nome = (campo: string) => CRITERI.find(c => c.campo === campo)?.etichetta ?? campo
  const primo = ordine[0], secondo = ordine[1]
  const imposta = (o: Criterio[]) => setStato({ ...stato, ordine: o })
  const elenco = tutti ? CRITERI : CRITERI.slice(0, CRITERI_FREQUENTI)
  /* il verso che ci si aspetta: le date dalla più recente, i nomi dalla A */
  const versoNaturale = (campo: string) => ['company_name', 'stage', 'priority'].includes(campo) ? 'su' as const : 'giu' as const

  const riga = (c: { campo: string; etichetta: string }, n: 0 | 1) => {
    const sel = n === 0 ? primo : secondo
    const on = sel?.campo === c.campo
    return (
      <div key={c.campo} className={`flex items-center ${on ? 'bg-gold-dim' : ''}`}>
        <button type="button" role="radio" aria-checked={on}
          onClick={() => n === 0
            ? imposta([{ campo: c.campo, verso: on ? primo.verso : versoNaturale(c.campo) }, ...(secondo && secondo.campo !== c.campo ? [secondo] : [])])
            : imposta([primo, { campo: c.campo, verso: on ? secondo!.verso : versoNaturale(c.campo) }])}
          className="flex-1 flex items-center gap-2 px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover">
          <span className="w-3.5">{on && <Check className="w-3.5 h-3.5 text-gold-text" />}</span>{c.etichetta}
        </button>
        {on && (
          <div className="flex pr-2" role="radiogroup" aria-label="Verso">
            {(['su', 'giu'] as const).map(v => (
              <button key={v} type="button" role="radio" aria-checked={sel!.verso === v} aria-label={v === 'su' ? 'Crescente' : 'Decrescente'}
                onClick={() => n === 0 ? imposta([{ ...primo, verso: v }, ...(secondo ? [secondo] : [])]) : imposta([primo, { ...secondo!, verso: v }])}
                className={`p-1 rounded ${sel!.verso === v ? 'text-gold-text' : 'text-text-tertiary hover:text-text-primary'}`}>
                {v === 'su' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <button ref={bottone} type="button" onClick={() => setAperto(v => !v)} aria-expanded={aperto}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary border border-border px-3 py-1.5 rounded-xl hover:text-text-primary hover:bg-surface-hover">
        <ArrowUpDown className="w-3.5 h-3.5" />
        <span className="truncate max-w-[14rem]">{nome(primo.campo)} {primo.verso === 'su' ? '↑' : '↓'}{secondo ? `, poi ${nome(secondo.campo).toLowerCase()} ${secondo.verso === 'su' ? '↑' : '↓'}` : ''}</span>
      </button>
      <Popover ancora={bottone} aperto={aperto} onChiudi={() => setAperto(false)} etichetta="Ordina l'elenco" larghezza={280}>
        <div className="py-1">
          <p className="px-3 pt-1.5 pb-1 text-2xs font-semibold text-text-tertiary uppercase tracking-wide">Ordina per</p>
          <div role="radiogroup" aria-label="Ordina per">{elenco.map(c => riga(c, 0))}</div>
          {!tutti && <button type="button" onClick={() => setTutti(true)} className="px-3 py-1.5 text-2xs text-gold-text underline">Altri campi…</button>}
          <div className="border-t border-border mt-1 pt-1">
            <p className="px-3 pt-1 pb-1 text-2xs font-semibold text-text-tertiary uppercase tracking-wide">Poi per</p>
            <button type="button" role="radio" aria-checked={!secondo} onClick={() => imposta([primo])}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-hover">
              <span className="w-3.5">{!secondo && <Check className="w-3.5 h-3.5 text-gold-text" />}</span>Nient’altro
            </button>
            <div role="radiogroup" aria-label="Poi per">{elenco.filter(c => c.campo !== primo.campo).map(c => riga(c, 1))}</div>
          </div>
        </div>
      </Popover>
    </>
  )
}

function Viste({ stato, setStato, leggiQuery }: { stato: StatoElenco; setStato: (s: StatoElenco) => void; leggiQuery: (q: string) => StatoElenco }) {
  const [aperto, setAperto] = useState(false)
  const [viste, setViste] = useState<VistaSalvata[] | null>(null)
  const [nome, setNome] = useState('')
  const [condivisa, setCondivisa] = useState(false)
  const [lavoro, setLavoro] = useState(false)
  const bottone = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (aperto && !viste) leggiViste().then(setViste).catch(() => setViste([])) }, [aperto, viste])
  const attuale = scrivi(stato)
  const corrente = viste?.find(v => v.query === attuale)

  const esegui = async (fn: () => Promise<VistaSalvata[]>, ok?: string) => {
    setLavoro(true)
    try { setViste(await fn()); if (ok) toast.success(ok) } catch (e) { toast.error((e as Error).message) } finally { setLavoro(false) }
  }
  const mie = (viste ?? []).filter(v => v.mia)
  const altrui = (viste ?? []).filter(v => !v.mia)

  const riga = (v: VistaSalvata) => (
    <div key={v.id} className={`group flex items-center ${v.query === attuale ? 'bg-gold-dim' : ''}`}>
      <button type="button" onClick={() => { setStato(leggiQuery(v.query)); setAperto(false) }} className="flex-1 min-w-0 px-3 py-1.5 text-left hover:bg-surface-hover">
        <span className="block text-xs text-text-primary truncate">{v.nome}</span>
        {!v.mia && <span className="block text-2xs text-text-tertiary truncate">di {v.autore}</span>}
      </button>
      {v.mia && (
        <div className="flex items-center pr-2 gap-0.5">
          {v.query !== attuale && (
            <button type="button" disabled={lavoro} title="Salva i filtri di adesso in questa vista" aria-label={`Aggiorna ${v.nome} con i filtri di adesso`}
              onClick={() => void esegui(() => salvaVista({ id: v.id, nome: v.nome, query: attuale, condivisa: v.condivisa }), 'Vista aggiornata')}
              className="p-1 text-text-tertiary hover:text-text-primary"><Check className="w-3.5 h-3.5" /></button>
          )}
          <button type="button" disabled={lavoro} aria-pressed={v.condivisa} aria-label={v.condivisa ? `Smetti di condividere ${v.nome}` : `Condividi ${v.nome} con il team`}
            title={v.condivisa ? 'Condivisa con il team' : 'Solo tua'}
            onClick={() => void esegui(() => salvaVista({ id: v.id, nome: v.nome, query: v.query, condivisa: !v.condivisa }))}
            className={`p-1 ${v.condivisa ? 'text-gold-text' : 'text-text-tertiary hover:text-text-primary'}`}><Share2 className="w-3.5 h-3.5" /></button>
          <button type="button" disabled={lavoro} aria-label={`Elimina ${v.nome}`}
            onClick={() => void esegui(() => eliminaVista(v.id))}
            className="p-1 text-text-tertiary hover:text-error"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  )

  return (
    <>
      <button ref={bottone} type="button" onClick={() => setAperto(v => !v)} aria-expanded={aperto}
        className={`inline-flex items-center gap-1.5 ${chip(!!corrente)}`}>
        <Bookmark className="w-3.5 h-3.5" /><span className="truncate max-w-[10rem]">{corrente ? corrente.nome : 'Viste'}</span>
      </button>
      <Popover ancora={bottone} aperto={aperto} onChiudi={() => setAperto(false)} etichetta="Viste salvate" larghezza={300}>
        <div className="py-1">
          {!viste && <p className="px-3 py-2 text-2xs text-text-tertiary">Carico…</p>}
          {viste && !viste.length && <p className="px-3 py-2 text-2xs text-text-tertiary">Nessuna vista salvata. Imposta filtri e ordine, poi dagli un nome qui sotto.</p>}
          {mie.length > 0 && <p className="px-3 pt-1.5 pb-0.5 text-2xs font-semibold text-text-tertiary uppercase tracking-wide">Le mie</p>}
          {mie.map(riga)}
          {altrui.length > 0 && <p className="px-3 pt-2 pb-0.5 text-2xs font-semibold text-text-tertiary uppercase tracking-wide">Del team</p>}
          {altrui.map(riga)}
          <form className="border-t border-border mt-1 px-3 py-2 space-y-1.5"
            onSubmit={e => { e.preventDefault(); if (!nome.trim()) return; void esegui(() => salvaVista({ nome, query: attuale, condivisa }), 'Vista salvata').then(() => { setNome(''); setCondivisa(false) }) }}>
            <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide">Salva la vista di adesso</p>
            <div className="flex gap-1.5">
              <input value={nome} onChange={e => setNome(e.target.value)} maxLength={60} placeholder="Nome, es. «I miei caldi»" aria-label="Nome della vista"
                className="flex-1 min-w-0 bg-background border border-border-interactive rounded-lg px-2 py-1 text-xs text-text-primary" />
              <button type="submit" disabled={lavoro || !nome.trim()} className="text-xs font-semibold bg-gold text-on-gold px-2.5 py-1 rounded-lg disabled:opacity-40">Salva</button>
            </div>
            <label className="flex items-center gap-1.5 text-2xs text-text-secondary">
              <input type="checkbox" checked={condivisa} onChange={e => setCondivisa(e.target.checked)} className="accent-gold" />Visibile a tutto il team
            </label>
          </form>
        </div>
      </Popover>
    </>
  )
}

export function BarraFiltri({ stato, setStato, righe, etichette, conteggio, gruppi, conOrdine, leggiQuery }: {
  stato: StatoElenco
  setStato: (s: StatoElenco) => void
  /** tutte le righe: le opzioni dei filtri si contano su quello che esiste */
  righe: Riga[]
  etichette: Etichette
  conteggio: { mostrate: number; totali: number }
  /** i gruppi di fase, col loro numero; assenti nella vista dei numeri */
  gruppi?: { chiave: string; etichetta: string; quante: number }[]
  conOrdine: boolean
  leggiQuery: (q: string) => StatoElenco
}) {
  const attivi = quantiAttivi(stato)
  const filtriScelta = FILTRABILI.filter(f => stato.scelte[f.campo]?.length)
  const filtriData = CAMPI_DATA.filter(c => stato.date[c])
  const [q, setQ] = useState(stato.q)
  // la ricerca aspetta che smetti di scrivere: l'indirizzo non cambia a ogni tasto
  useEffect(() => { setQ(stato.q) }, [stato.q])
  useEffect(() => {
    if (q === stato.q) return
    const t = setTimeout(() => setStato({ ...stato, q }), 250)
    return () => clearTimeout(t)
  }, [q, stato, setStato])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} aria-label="Cerca fra i lead" placeholder="Azienda, referente, telefono…"
            className="w-full bg-surface border border-border-interactive rounded-xl pl-8 pr-8 py-2 text-sm text-text-primary" />
          {q && <button type="button" onClick={() => { setQ(''); setStato({ ...stato, q: '' }) }} aria-label="Svuota la ricerca"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>}
        </label>
        {/* le tre domande di ogni mattina, a un clic: si escludono a vicenda */}
        <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label="Viste rapide">
          {RAPIDE.map(r => {
            const I = ICONA_RAPIDA[r]
            const on = stato.rapida === r
            return (
              <button key={r} type="button" role="radio" aria-checked={on} onClick={() => setStato({ ...stato, rapida: on ? null : r })}
                className={`inline-flex items-center gap-1.5 ${chip(on)}`}>
                <I className="w-3.5 h-3.5" />{ETICHETTA_RAPIDA[r]}
              </button>
            )
          })}
        </div>
        <Viste stato={stato} setStato={setStato} leggiQuery={leggiQuery} />
        <span className="ml-auto text-2xs text-text-tertiary tabular" aria-live="polite">
          {conteggio.mostrate === conteggio.totali ? `${conteggio.totali} lead` : `${conteggio.mostrate} di ${conteggio.totali} lead`}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {gruppi?.map(g => (
          <button key={g.chiave} type="button" onClick={() => setStato({ ...stato, gruppo: g.chiave })} aria-pressed={stato.gruppo === g.chiave}
            className={chip(stato.gruppo === g.chiave)}>
            {g.etichetta}<span className="ml-1.5 tabular text-text-tertiary">{g.quante}</span>
          </button>
        ))}
        {gruppi && <span className="w-px h-5 bg-border mx-1" aria-hidden />}
        {filtriData.map(c => <Filtro key={c} variabile={{ tipo: 'data', campo: c, etichetta: ETICHETTA_DATA[c] }} stato={stato} setStato={setStato} righe={righe} etichette={etichette} />)}
        {filtriScelta.map(f => <Filtro key={f.campo} variabile={{ tipo: 'scelta', campo: f.campo, etichetta: f.etichetta }} stato={stato} setStato={setStato} righe={righe} etichette={etichette} />)}
        <AggiungiFiltro stato={stato} setStato={setStato} righe={righe} etichette={etichette} />
        {conOrdine && <Ordina stato={stato} setStato={setStato} />}
        {(attivi > 0 || stato.q || stato.gruppo !== 'tutti') && (
          <button type="button" onClick={() => { setQ(''); setStato({ ...VUOTO, ordine: stato.ordine }) }}
            className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary px-1">
            <X className="w-3.5 h-3.5" />Azzera
          </button>
        )}
      </div>
    </div>
  )
}

export type { Scelte }

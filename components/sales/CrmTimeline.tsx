'use client'

/**
 * §438 — il diario del lead, e l'ultimo contatto che ne discende.
 *
 * Prima c'erano due campi scritti a mano, «Last Contact» (una data senza ora)
 * e «Tentativi» (un numero), che potevano dire due cose diverse e nessuno dei
 * due raccontava cosa fosse successo. Adesso si registra **cosa è successo** —
 * una chiamata non risposta, un messaggio ricevuto, un meeting — e ultimo
 * contatto, tentativi e prossimo follow-up li ricalcola il database.
 *
 * Il gesto più frequente costa un clic: «Oggi» registra una chiamata risposta
 * adesso, e per dieci secondi resta sotto una barra per dire che era un'altra
 * cosa. Chi non tocca niente ha fatto il caso comune; chi ha chiamato a vuoto
 * lo corregge con un secondo clic, senza aprire un modulo.
 *
 * Lo stato vive in un contesto perché la stessa informazione compare in due
 * punti della scheda — la riga «Last Contact» dove la si cerca, e il riquadro
 * della timeline dove la si legge — e due copie dello stesso stato sono due
 * numeri che prima o poi non coincidono.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Phone, Mail, MessageCircle, Users, StickyNote, CalendarClock, History, Loader2, Plus, CalendarDays, Pencil, Trash2,
} from 'lucide-react'
import { leggiTimeline, registraVoce, modificaVoce, eliminaVoce, esitoFollowup } from '@/app/actions/sales-timeline'
import {
  ETICHETTA_ESITO, ETICHETTA_VERSO, ESITI, TIPI, ETICHETTA_TIPO, giornoEOraRoma, istanteRoma, quandoContatto, titoloVoce,
  type Derivati, type Direzione, type TipoVoce, type Voce,
} from '@/lib/sales-timeline'
import { MiniCalendario } from './MiniCalendario'
import { PianificaFollowup, type FollowupDaSpostare } from './PianificaFollowup'
import { annullaFollowup } from '@/app/actions/sales-agenda'

const ICONA: Record<TipoVoce, typeof Phone> = {
  chiamata: Phone, email: Mail, whatsapp: MessageCircle, meeting: Users, nota: StickyNote, followup: CalendarClock, contatto: History,
}
const chip = (on: boolean) =>
  `text-2xs px-2 py-1 rounded-lg border transition-colors ${on
    ? 'border-gold/40 bg-gold/10 text-gold-text font-semibold'
    : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`
const bottone = 'text-2xs font-semibold px-2.5 py-1 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-40'

type Ctx = {
  voci: Voce[] | null
  errore: string | null
  derivati: Derivati
  lavoro: boolean
  /** l'ultima voce registrata con «Oggi»: sotto, la barra per correggerla */
  appena: { id: string; fino: number } | null
  oggi: () => Promise<void>
  registra: (input: Bozza) => Promise<boolean>
  modifica: (id: string, input: Bozza) => Promise<boolean>
  elimina: (id: string) => Promise<void>
  esito: (id: string, input: Bozza | { annulla: true }) => Promise<void>
  chiudiAppena: () => void
  ricarica: () => void
  /** apre il selettore: vuoto per un follow-up nuovo, con la voce per spostarlo */
  pianifica: (v?: Voce) => void
  annulla: (v: Voce) => Promise<void>
}
const TimelineCtx = createContext<Ctx | null>(null)
const useTimeline = () => {
  const c = useContext(TimelineCtx)
  if (!c) throw new Error('TimelineProvider mancante')
  return c
}

type Bozza = {
  type: TipoVoce
  outcome: string | null
  direction: Direzione | null
  occurred_at: string
  has_time: boolean
  content: string | null
}

const PIENO: Derivati = { last_interaction_at: null, last_interaction_has_time: true, tentativi: 0, ultimo_tentativo_at: null, next_followup_at: null }

export function TimelineProvider({ dealId, company, email, iniziali, onDerivati, children }: {
  dealId: string
  company: string
  email: string | null
  /** quello che l'elenco sa già: la riga si legge prima che il diario arrivi */
  iniziali: Partial<Derivati>
  onDerivati: (d: Derivati) => void
  children: React.ReactNode
}) {
  const [voci, setVoci] = useState<Voce[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [derivati, setDerivati] = useState<Derivati>({ ...PIENO, ...iniziali })
  const [lavoro, setLavoro] = useState(false)
  const [appena, setAppena] = useState<{ id: string; fino: number } | null>(null)
  const [selettore, setSelettore] = useState<{ sposta?: FollowupDaSpostare } | null>(null)
  const onD = useRef(onDerivati)
  onD.current = onDerivati

  const carica = useCallback(async () => {
    try {
      const r = await leggiTimeline(dealId)
      setVoci(r.voci); setDerivati(r.derivati); setErrore(null)
      onD.current(r.derivati)
    } catch (e) { setErrore((e as Error).message) }
  }, [dealId])
  useEffect(() => { void carica() }, [carica])

  /* ogni scrittura ricarica il diario: l'ordine, gli autori e i ricalcoli sono
     del server, e ricostruirli qui sarebbe la seconda copia della regola */
  const esegui = async <T,>(fn: () => Promise<{ derivati: Derivati } & T>): Promise<(T & { derivati: Derivati }) | null> => {
    setLavoro(true)
    try {
      const r = await fn()
      setDerivati(r.derivati); onD.current(r.derivati)
      await carica()
      return r
    } catch (e) {
      toast.error((e as Error).message)
      return null
    } finally { setLavoro(false) }
  }

  const ctx: Ctx = {
    voci, errore, derivati, lavoro, appena,
    oggi: async () => {
      const r = await esegui(() => registraVoce(dealId, {
        type: 'chiamata', outcome: 'risposto', direction: null, occurred_at: new Date().toISOString(), has_time: true, content: null,
      }))
      if (r) setAppena({ id: r.id, fino: Date.now() + 10_000 })
    },
    registra: async input => !!(await esegui(() => registraVoce(dealId, input).then(x => ({ derivati: x.derivati })))),
    modifica: async (id, input) => !!(await esegui(() => modificaVoce(id, input))),
    elimina: async id => { await esegui(() => eliminaVoce(id)); setAppena(a => a?.id === id ? null : a) },
    esito: async (id, input) => { await esegui(() => esitoFollowup(id, input)) },
    chiudiAppena: () => setAppena(null),
    ricarica: () => { void carica() },
    pianifica: v => setSelettore(v
      ? { sposta: { id: v.id, inizio: v.occurred_at, durata: v.duration_min ?? 30, titolo: v.content ?? `Follow-up · ${company}`, googleEventId: v.google_event_id } }
      : {}),
    /* un follow-up su Google si annulla su Google — con i suoi invitati — e il
       diario lo segue dalla route; uno solo nostro si annulla qui */
    annulla: async v => {
      if (!v.google_event_id) { await esegui(() => annullaFollowup(v.id)); return }
      setLavoro(true)
      try {
        const lista = await fetch(`/api/sales/follow-up?dealId=${encodeURIComponent(dealId)}`, { cache: 'no-store' })
        const dati = await lista.json()
        if (!lista.ok) throw new Error(dati.error || 'Google Calendar non risponde')
        const ev = (dati.events as { id: string; etag: string }[]).find(e => e.id === v.google_event_id)
        if (!ev) throw new Error('L’appuntamento non è più su Google Calendar')
        const res = await fetch('/api/sales/follow-up', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealId, eventId: ev.id, etag: ev.etag }) })
        const r = await res.json()
        if (!res.ok) throw new Error(r.error || 'Annullamento non riuscito')
        toast.success('Follow-up annullato')
        await carica()
      } catch (e) { toast.error((e as Error).message) } finally { setLavoro(false) }
    },
  }
  return (
    <TimelineCtx.Provider value={ctx}>
      {children}
      {selettore && (
        <PianificaFollowup dealId={dealId} company={company} email={email} sposta={selettore.sposta}
          onFatto={() => { void carica() }} onChiudi={() => setSelettore(null)} />
      )}
    </TimelineCtx.Provider>
  )
}

/** il giorno e l'ora di Roma di adesso: il browser può stare altrove */
const adessoRoma = () => giornoEOraRoma(Date.now())

/**
 * Tipo, esito, quando, nota. I valori di partenza sono il caso comune —
 * chiamata, risposto, adesso — così registrare quello che è appena successo
 * è un clic su «Salva».
 */
function ModuloVoce({ iniziale, titolo, onSalva, onChiudi, tipi = TIPI }: {
  iniziale?: Partial<Bozza>
  titolo: string
  onSalva: (b: Bozza) => Promise<boolean>
  onChiudi: () => void
  tipi?: readonly TipoVoce[]
}) {
  const { lavoro } = useTimeline()
  const a = adessoRoma()
  const partenza = iniziale?.occurred_at ? giornoEOraRoma(Date.parse(iniziale.occurred_at)) : a
  const [type, setType] = useState<TipoVoce>(iniziale?.type && tipi.includes(iniziale.type) ? iniziale.type : tipi[0])
  const [outcome, setOutcome] = useState<string | null>(iniziale?.outcome ?? 'risposto')
  const [direction, setDirection] = useState<Direzione>(iniziale?.direction ?? 'uscita')
  const [giorno, setGiorno] = useState(partenza.giorno)
  const [ora, setOra] = useState(iniziale?.has_time === false ? '' : partenza.ora)
  const [calendario, setCalendario] = useState(false)
  const [nota, setNota] = useState(iniziale?.content ?? '')
  const [problema, setProblema] = useState<string | null>(null)

  const esiti = ESITI[type]
  const conVerso = type === 'email' || type === 'whatsapp'
  const scegliTipo = (t: TipoVoce) => {
    setType(t)
    const e = ESITI[t]
    setOutcome(e ? (e.includes(outcome ?? '') ? outcome : e[0]) : null)
  }

  const salva = async (e: React.FormEvent) => {
    e.preventDefault()
    const senzaOra = !ora
    const istante = istanteRoma(giorno, senzaOra ? '12:00' : ora)
    if (!istante) { setProblema('Data o ora non valida'); return }
    if (Date.parse(istante) > Date.now() + 5 * 60_000) { setProblema('È nel futuro: per un contatto da fare c’è il follow-up'); return }
    setProblema(null)
    const fatto = await onSalva({
      type, outcome: esiti ? outcome : null, direction: conVerso ? direction : null,
      occurred_at: istante, has_time: !senzaOra, content: nota.trim() || null,
    })
    if (fatto) onChiudi()
  }

  const ieri = giornoEOraRoma(Date.now() - 86_400_000).giorno
  const etichettaGiorno = giorno === a.giorno ? 'Oggi' : giorno === ieri ? 'Ieri'
    : new Date(`${giorno}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

  return (
    <form onSubmit={salva} className="space-y-2.5 rounded-xl border border-gold/30 bg-surface p-3" aria-label={titolo}>
      <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide">{titolo}</p>

      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Che cosa">
        {tipi.map(t => {
          const I = ICONA[t]
          return (
            <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => scegliTipo(t)}
              className={`${chip(type === t)} inline-flex items-center gap-1`}>
              <I className="w-3.5 h-3.5" aria-hidden />{ETICHETTA_TIPO[t]}
            </button>
          )
        })}
      </div>

      {esiti && (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Com’è andata">
          {esiti.map(o => (
            <button key={o} type="button" role="radio" aria-checked={outcome === o} onClick={() => setOutcome(o)} className={chip(outcome === o)}>
              {ETICHETTA_ESITO[o]}
            </button>
          ))}
        </div>
      )}
      {conVerso && (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Verso">
          {(['uscita', 'entrata'] as const).map(d => (
            <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)} className={chip(direction === d)}>
              {ETICHETTA_VERSO[d]}
            </button>
          ))}
        </div>
      )}

      {/* Quando: i due giorni che contano a un clic, il calendario solo se
          serve, e l'ora con «adesso» accanto. Senza ora si può: meglio un
          giorno vero che un'ora inventata. */}
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={chip(giorno === a.giorno && ora === a.ora)}
          onClick={() => { const x = adessoRoma(); setGiorno(x.giorno); setOra(x.ora); setCalendario(false) }}>Adesso</button>
        <button type="button" className={chip(giorno === ieri)} onClick={() => { setGiorno(ieri); setCalendario(false) }}>Ieri</button>
        <button type="button" aria-expanded={calendario} onClick={() => setCalendario(v => !v)}
          className={`${chip(calendario)} inline-flex items-center gap-1`}>
          <CalendarDays className="w-3.5 h-3.5" aria-hidden />{etichettaGiorno}
        </button>
        <label className="inline-flex items-center gap-1 text-2xs text-text-tertiary">
          <span className="sr-only">Ora</span>
          <input type="time" value={ora} step={300} onChange={e => setOra(e.target.value)}
            className="bg-background border border-border-interactive rounded-lg px-1.5 py-1 text-2xs text-text-primary tabular" />
        </label>
        {ora
          ? <button type="button" onClick={() => setOra('')} className="text-2xs text-text-tertiary hover:text-text-primary underline">non ricordo l’ora</button>
          : <span className="text-2xs text-text-tertiary">ora non segnata</span>}
      </div>
      {calendario && (
        <MiniCalendario valore={giorno} oggi={a.giorno} max={a.giorno} etichetta="Giorno del contatto"
          onScegli={g => { setGiorno(g); setCalendario(false) }} />
      )}

      <label className="block">
        <span className="sr-only">Nota</span>
        <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} maxLength={2000}
          placeholder={type === 'nota' ? 'Scrivi la nota' : 'Nota (facoltativa): cosa vi siete detti'}
          className="w-full bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary" />
      </label>

      {problema && <p role="alert" className="text-2xs text-error">{problema}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={lavoro}
          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg disabled:opacity-40">
          {lavoro && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Salva
        </button>
        <button type="button" onClick={onChiudi} className={bottone}>Annulla</button>
      </div>
    </form>
  )
}

/**
 * Dopo «Oggi»: dieci secondi per dire che era un'altra cosa. Si ferma finché
 * il mouse o il fuoco ci sono sopra — sparire mentre stai per cliccare è il
 * modo più sicuro di far registrare la cosa sbagliata.
 */
function BarraAppena() {
  const { appena, voci, modifica, elimina, chiudiAppena, lavoro } = useTimeline()
  const [fermo, setFermo] = useState(false)
  const [nota, setNota] = useState<string | null>(null)
  useEffect(() => {
    if (!appena || fermo || nota !== null) return
    const t = setTimeout(chiudiAppena, Math.max(0, appena.fino - Date.now()))
    return () => clearTimeout(t)
  }, [appena, fermo, nota, chiudiAppena])
  if (!appena) return null
  const voce = voci?.find(v => v.id === appena.id)
  if (!voce) return null

  const cambia = async (b: Partial<Bozza>) => {
    await modifica(voce.id, {
      type: voce.type, outcome: voce.outcome, direction: voce.direction, occurred_at: voce.occurred_at,
      has_time: voce.has_time, content: voce.content, ...b,
    })
  }
  const scelte: { etichetta: string; b: Partial<Bozza>; on: boolean }[] = [
    { etichetta: 'Risposto', b: { type: 'chiamata', outcome: 'risposto', direction: null }, on: voce.type === 'chiamata' && voce.outcome === 'risposto' },
    { etichetta: 'Non risposto', b: { type: 'chiamata', outcome: 'non_risposto', direction: null }, on: voce.outcome === 'non_risposto' },
    { etichetta: 'Segreteria', b: { type: 'chiamata', outcome: 'segreteria', direction: null }, on: voce.outcome === 'segreteria' },
    { etichetta: 'Email', b: { type: 'email', outcome: null, direction: 'uscita' }, on: voce.type === 'email' },
    { etichetta: 'Messaggio', b: { type: 'whatsapp', outcome: null, direction: 'uscita' }, on: voce.type === 'whatsapp' },
    { etichetta: 'Meeting', b: { type: 'meeting', outcome: 'fatto', direction: null }, on: voce.type === 'meeting' },
  ]

  return (
    <div role="status" onMouseEnter={() => setFermo(true)} onMouseLeave={() => setFermo(false)}
      onFocus={() => setFermo(true)} onBlur={() => setFermo(false)}
      className="mt-1.5 rounded-lg border border-gold/30 bg-gold-dim px-2 py-1.5 space-y-1.5">
      <p className="text-2xs text-text-primary">
        <span className="font-semibold">{titoloVoce(voce)}</span> registrata adesso. Era un’altra cosa?
      </p>
      <div className="flex flex-wrap gap-1">
        {scelte.map(s => (
          <button key={s.etichetta} type="button" disabled={lavoro} aria-pressed={s.on} onClick={() => void cambia(s.b)} className={chip(s.on)}>
            {s.etichetta}
          </button>
        ))}
        {nota === null && <button type="button" onClick={() => setNota(voce.content ?? '')} className={chip(false)}>+ Nota</button>}
        <button type="button" disabled={lavoro} onClick={() => void elimina(voce.id)} className="text-2xs px-2 py-1 text-error hover:underline">Annulla</button>
      </div>
      {nota !== null && (
        <div className="flex gap-1.5 items-start">
          <textarea autoFocus value={nota} onChange={e => setNota(e.target.value)} rows={2} maxLength={2000}
            placeholder="Cosa vi siete detti" aria-label="Nota"
            className="flex-1 bg-background border border-border-interactive rounded-lg px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary" />
          <button type="button" disabled={lavoro} className={bottone}
            onClick={async () => { await cambia({ content: nota.trim() || null }); setNota(null); chiudiAppena() }}>Salva</button>
        </div>
      )}
    </div>
  )
}

/**
 * La riga «Last Contact» della scheda: quando, e i due modi di aggiornarlo.
 * Sta dove la si cerca — nel riquadro «A che punto è» e in «Cosa manca
 * adesso» — e scrive nel diario, come tutto il resto.
 */
export function UltimoContatto() {
  const { derivati, oggi, lavoro, registra } = useTimeline()
  const [modulo, setModulo] = useState(false)
  const quando = quandoContatto(derivati.last_interaction_at, derivati.last_interaction_has_time, Date.now())
  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-2xs mr-auto ${quando ? 'text-text-primary' : 'text-text-tertiary'}`}>
          {quando || 'Mai sentito'}
          {derivati.tentativi > 0 && (
            <span className="text-warning"> · {derivati.tentativi} {derivati.tentativi === 1 ? 'tentativo' : 'tentativi'} senza risposta</span>
          )}
        </span>
        <button type="button" disabled={lavoro} onClick={() => void oggi()}
          title="Registra una chiamata risposta adesso"
          className="inline-flex items-center gap-1 text-2xs font-semibold text-gold-text border border-gold/40 px-2 py-0.5 rounded-lg hover:bg-gold/10 disabled:opacity-40">
          {lavoro ? <Loader2 className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3" />}Oggi
        </button>
        <button type="button" onClick={() => setModulo(v => !v)} aria-expanded={modulo}
          className="inline-flex items-center gap-1 text-2xs text-text-secondary border border-border px-2 py-0.5 rounded-lg hover:text-text-primary hover:bg-surface-hover">
          <CalendarDays className="w-3 h-3" />Scegli
        </button>
      </div>
      <BarraAppena />
      {modulo && (
        <div className="mt-2">
          <ModuloVoce titolo="Registra un contatto" onSalva={registra} onChiudi={() => setModulo(false)} />
        </div>
      )}
    </div>
  )
}

function VoceRiga({ v }: { v: Voce }) {
  const { modifica, elimina, esito, lavoro, pianifica, annulla } = useTimeline()
  const [modo, setModo] = useState<'leggi' | 'modifica' | 'elimina' | 'annulla'>('leggi')
  const I = ICONA[v.type]
  const ms = Date.parse(v.occurred_at)
  const passato = ms <= Date.now()
  const inProgramma = v.type === 'followup' && v.stato === 'in_programma'
  const daChiudere = inProgramma && passato
  const quando = quandoContatto(v.occurred_at, v.has_time, Date.now())

  const esiti: { etichetta: string; b: Bozza | { annulla: true } }[] = [
    { etichetta: 'Risposto', b: { type: 'chiamata', outcome: 'risposto', direction: null, occurred_at: v.occurred_at, has_time: true, content: null } },
    { etichetta: 'Non risposto', b: { type: 'chiamata', outcome: 'non_risposto', direction: null, occurred_at: v.occurred_at, has_time: true, content: null } },
    { etichetta: 'Segreteria', b: { type: 'chiamata', outcome: 'segreteria', direction: null, occurred_at: v.occurred_at, has_time: true, content: null } },
    { etichetta: 'Meeting fatto', b: { type: 'meeting', outcome: 'fatto', direction: null, occurred_at: v.occurred_at, has_time: true, content: null } },
    { etichetta: 'Non si è presentato', b: { type: 'meeting', outcome: 'non_presentato', direction: null, occurred_at: v.occurred_at, has_time: true, content: null } },
    { etichetta: 'Non fatto', b: { annulla: true } },
  ]

  if (modo === 'modifica') {
    return (
      <li className="py-2">
        <ModuloVoce titolo="Correggi l’interazione" iniziale={{ ...v, type: v.type === 'contatto' ? 'chiamata' : v.type }}
          onSalva={b => modifica(v.id, b)} onChiudi={() => setModo('leggi')} />
      </li>
    )
  }

  return (
    <li className={`relative flex gap-2.5 py-2 ${v.stato === 'annullata' ? 'opacity-60' : ''}`}>
      <span className={`shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center border ${
        daChiudere ? 'border-warning/40 bg-warning-dim text-warning'
          : inProgramma ? 'border-gold/40 bg-gold-dim text-gold-text'
          : 'border-border bg-surface text-text-secondary'}`}>
        <I className="w-3.5 h-3.5" aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-semibold text-text-primary">{titoloVoce(v)}</span>
          <span className="text-2xs text-text-tertiary tabular">{quando}{v.duration_min && inProgramma ? ` · ${v.duration_min} min` : ''}</span>
          {!v.has_time && <span className="text-2xs text-text-tertiary">· ora non registrata</span>}
        </div>
        {v.content && <p className="text-2xs text-text-secondary whitespace-pre-line break-words mt-0.5">{v.content}</p>}
        <p className="text-2xs text-text-tertiary mt-0.5">
          {v.type === 'contatto' ? 'Segnato prima della timeline' : v.autore ?? 'Sistema'}
        </p>

        {daChiudere && (
          <div className="mt-1.5 space-y-1">
            <p className="text-2xs font-semibold text-warning">Com’è andato?</p>
            <div className="flex flex-wrap gap-1">
              {esiti.map(e => (
                <button key={e.etichetta} type="button" disabled={lavoro} onClick={() => void esito(v.id, e.b)} className={chip(false)}>
                  {e.etichetta}
                </button>
              ))}
              <button type="button" disabled={lavoro} onClick={() => pianifica(v)} className={chip(false)}>Rimanda…</button>
            </div>
          </div>
        )}

        {inProgramma && !daChiudere && (
          modo === 'annulla' ? (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-2xs text-text-secondary">Annullare il follow-up?{v.google_event_id ? ' Gli invitati ricevono l’annullamento.' : ''}</span>
              <button type="button" disabled={lavoro} onClick={() => { void annulla(v); setModo('leggi') }} className="text-2xs font-semibold text-error hover:underline">Annulla il follow-up</button>
              <button type="button" onClick={() => setModo('leggi')} className="text-2xs text-text-tertiary hover:text-text-primary">Tienilo</button>
            </div>
          ) : (
            <div className="flex gap-2 mt-1">
              <button type="button" disabled={lavoro} onClick={() => pianifica(v)} className="inline-flex items-center gap-1 text-2xs text-text-tertiary hover:text-text-primary">
                <CalendarDays className="w-3 h-3" />Sposta
              </button>
              <button type="button" disabled={lavoro} onClick={() => setModo('annulla')} className="inline-flex items-center gap-1 text-2xs text-text-tertiary hover:text-error">
                <Trash2 className="w-3 h-3" />Annulla
              </button>
              {!v.google_event_id && <span className="text-2xs text-text-tertiary">· promemoria in campanella</span>}
            </div>
          )
        )}

        {modo === 'elimina' ? (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-2xs text-text-secondary">Eliminare questa voce? Ultimo contatto e tentativi si ricalcolano.</span>
            <button type="button" disabled={lavoro} onClick={() => void elimina(v.id)} className="text-2xs font-semibold text-error hover:underline">Elimina</button>
            <button type="button" onClick={() => setModo('leggi')} className="text-2xs text-text-tertiary hover:text-text-primary">No</button>
          </div>
        ) : v.modificabile && !inProgramma && (
          <div className="flex gap-2 mt-1">
            <button type="button" onClick={() => setModo('modifica')} className="inline-flex items-center gap-1 text-2xs text-text-tertiary hover:text-text-primary">
              <Pencil className="w-3 h-3" />Correggi
            </button>
            <button type="button" onClick={() => setModo('elimina')} className="inline-flex items-center gap-1 text-2xs text-text-tertiary hover:text-error">
              <Trash2 className="w-3 h-3" />Elimina
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

const PRIMA = 8

/**
 * Il riquadro: in cima quello che deve ancora succedere (e quello che è
 * passato senza che nessuno dicesse com'è andato), poi il diario dal più
 * recente. Otto voci e poi «mostra tutte»: la scheda serve a lavorare il
 * lead, non a scorrere sei mesi di chiamate.
 */
export function CrmTimeline() {
  const { voci, errore, derivati, registra, ricarica, pianifica } = useTimeline()
  const [modulo, setModulo] = useState(false)
  const [tutte, setTutte] = useState(false)

  const aperti = (voci ?? []).filter(v => v.type === 'followup' && v.stato === 'in_programma')
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
  const diario = (voci ?? []).filter(v => !(v.type === 'followup' && v.stato === 'in_programma'))
  const mostrate = tutte ? diario : diario.slice(0, PRIMA)
  const prossimo = quandoContatto(derivati.next_followup_at, true, Date.now())

  return (
    <section className="border border-border rounded-xl overflow-hidden" aria-label="Timeline dei contatti">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <h3 className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide mr-auto">Contatti</h3>
        <button type="button" onClick={() => pianifica()}
          className="inline-flex items-center gap-1 text-2xs font-semibold bg-gold text-on-gold px-2 py-0.5 rounded-lg">
          <CalendarClock className="w-3 h-3" />Pianifica follow-up
        </button>
        <button type="button" onClick={() => setModulo(v => !v)} aria-expanded={modulo}
          className="inline-flex items-center gap-1 text-2xs font-semibold text-gold-text border border-gold/40 px-2 py-0.5 rounded-lg hover:bg-gold/10">
          <Plus className="w-3 h-3" />Registra
        </button>
      </div>
      <div className="px-3 py-2 space-y-2">
        <p className="text-2xs text-text-secondary">
          {derivati.last_interaction_at
            ? <>Ultimo contatto <span className="text-text-primary font-semibold">{quandoContatto(derivati.last_interaction_at, derivati.last_interaction_has_time, Date.now())}</span></>
            : 'Non l’ha ancora sentito nessuno'}
          {derivati.tentativi > 0 && <span className="text-warning"> · {derivati.tentativi} {derivati.tentativi === 1 ? 'tentativo' : 'tentativi'} senza risposta</span>}
          {prossimo && <> · prossimo follow-up <span className="text-text-primary">{prossimo}</span></>}
        </p>
        {modulo && <ModuloVoce titolo="Registra un’interazione" onSalva={registra} onChiudi={() => setModulo(false)} />}

        {errore && (
          <p role="alert" className="text-2xs text-warning">
            {errore} <button type="button" onClick={ricarica} className="underline">Riprova</button>
          </p>
        )}
        {!voci && !errore && <p className="text-2xs text-text-tertiary flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />Carico la timeline…</p>}

        {aperti.length > 0 && <ul className="divide-y divide-border">{aperti.map(v => <VoceRiga key={v.id} v={v} />)}</ul>}
        {voci && diario.length === 0 && aperti.length === 0 && (
          <p className="text-2xs text-text-tertiary">Ancora nessuna interazione. «Oggi» qui sopra registra una chiamata in un clic.</p>
        )}
        {mostrate.length > 0 && (
          <ul className={`divide-y divide-border ${aperti.length ? 'border-t border-border' : ''}`}>
            {mostrate.map(v => <VoceRiga key={v.id} v={v} />)}
          </ul>
        )}
        {diario.length > PRIMA && (
          <button type="button" onClick={() => setTutte(v => !v)} className="text-2xs text-gold-text underline">
            {tutte ? 'Mostra le ultime' : `Mostra tutte (${diario.length})`}
          </button>
        )}
      </div>
    </section>
  )
}

export { useTimeline }

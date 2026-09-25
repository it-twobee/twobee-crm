'use client'

/**
 * §439 — fissare un follow-up guardando la propria giornata.
 *
 * Prima c'era un `datetime-local` e un numero di minuti: si sceglieva l'ora
 * al buio, poi si scopriva su Google di averla messa sopra un'altra call. Qui
 * il giorno si sceglie su un mese intero, accanto c'è **la propria agenda di
 * quel giorno** — Google, eventi del tool, altri follow-up, ferie, task in
 * scadenza — e l'ora si fissa cliccando una fascia libera. Il caso comune costa
 * un clic: si apre già sul primo buco libero, e le scorciatoie («domani
 * mattina», «lunedì prossimo») mettono giorno e ora insieme.
 *
 * I conflitti **avvisano e non bloccano** (fuori orario, festivi, ferie,
 * sovrapposizioni), e accanto all'avviso c'è il primo momento libero dopo
 * quello scelto: l'avviso dice cosa non va, il bottone dice cosa fare.
 *
 * Senza Google si salva lo stesso: resta nel diario del lead e la campanella
 * lo ricorda un quarto d'ora prima.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, Loader2, X, Sparkles, TriangleAlert, Check } from 'lucide-react'
import { toast } from 'sonner'
import { usePathname } from 'next/navigation'
import { leggiAgenda, pianificaFollowup, spostaFollowup, type StatoGoogle } from '@/app/actions/sales-agenda'
import {
  DURATE, conflitti, fasce, giornataLavorativa, primoLibero, scorciatoie, spiegaConflitto, alPasso, type Impegno,
} from '@/lib/sales-agenda'
import { giornoEOraRoma, istanteRoma, quandoContatto } from '@/lib/sales-timeline'
import { MiniCalendario } from './MiniCalendario'

const MIN = 60_000
const ALTEZZA = 26 // px per mezz'ora
const chip = (on: boolean) =>
  `text-2xs px-2 py-1 rounded-lg border transition-colors ${on
    ? 'border-gold/40 bg-gold/10 text-gold-text font-semibold'
    : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`

const COLORE: Record<Impegno['tipo'], string> = {
  google: 'bg-info-dim border-info/40 text-info',
  interno: 'bg-info-dim border-info/40 text-info',
  followup: 'bg-gold-dim border-gold/40 text-gold-text',
  ferie: 'bg-warning-dim border-warning/40 text-warning',
  task: 'bg-surface-active border-border text-text-secondary',
}

export type FollowupDaSpostare = { id: string; inizio: string; durata: number; titolo: string; googleEventId: string | null }

const fineMese = (giorno: string) => {
  const [a, m] = giorno.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}
const primoMese = (giorno: string) => `${giorno.slice(0, 8)}01`

/** l'etag e l'invito dell'evento Google: spostarlo non deve togliere l'invito a chi l'aveva */
async function eventoGoogle(dealId: string, eventId: string) {
  const res = await fetch(`/api/sales/follow-up?dealId=${encodeURIComponent(dealId)}`, { cache: 'no-store' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Google Calendar non risponde')
  const e = (data.events as { id: string; etag: string; invitedEmail: string | null }[]).find(x => x.id === eventId)
  if (!e) throw new Error('L’appuntamento non è più su Google Calendar: aggiorna la scheda')
  return e
}

export function PianificaFollowup({ dealId, company, email, sposta, onFatto, onChiudi }: {
  dealId: string
  company: string
  email: string | null
  sposta?: FollowupDaSpostare
  onFatto: () => void
  onChiudi: () => void
}) {
  const adesso = useRef(Date.now()).current
  const oggi = giornoEOraRoma(adesso).giorno
  const pathname = usePathname()

  const [inizio, setInizio] = useState<number | null>(sposta ? Date.parse(sposta.inizio) : null)
  const [giorno, setGiorno] = useState(sposta ? giornoEOraRoma(Date.parse(sposta.inizio)).giorno : oggi)
  const [durata, setDurata] = useState(sposta?.durata ?? 30)
  const [titolo, setTitolo] = useState(sposta?.titolo ?? `Follow-up · ${company}`)
  const [invita, setInvita] = useState(false)
  /* un mese alla volta, e ogni mese letto resta: tornare indietro non rilegge */
  const [perMese, setPerMese] = useState<Record<string, Impegno[]>>({})
  const [google, setGoogle] = useState<StatoGoogle | null>(null)
  const [mese, setMese] = useState(primoMese(giorno))
  const impegni = mese in perMese ? Object.values(perMese).flat() : null
  const [salvo, setSalvo] = useState(false)
  const griglia = useRef<HTMLDivElement>(null)

  // l'agenda si legge un mese alla volta: quello del giorno scelto
  useEffect(() => {
    if (mese in perMese) return
    let vivo = true
    const dal = mese < oggi ? oggi : mese
    const al = fineMese(mese)
    if (al < dal) { setPerMese(p => ({ ...p, [mese]: [] })); return }
    leggiAgenda(dal, al).then(r => {
      if (!vivo) return
      setPerMese(p => ({ ...p, [mese]: r.impegni }))
      setGoogle(r.google)
    }).catch(e => { if (vivo) { setPerMese(p => ({ ...p, [mese]: [] })); toast.error((e as Error).message) } })
    return () => { vivo = false }
  }, [mese, oggi, perMese])

  /* un impegno lungo due mesi si legge due volte: si tiene una copia sola */
  const propri = useMemo(() => {
    const visti = new Set<string>()
    return (impegni ?? []).filter(i => !(sposta && i.id === `f:${sposta.id}`) && !visti.has(i.id) && !!visti.add(i.id))
  }, [impegni, sposta])

  // si apre sul primo buco libero: il caso comune costa zero clic
  const scelto = useRef(!!sposta)
  useEffect(() => {
    if (scelto.current || !impegni) return
    scelto.current = true
    const t = primoLibero(adesso, durata, propri)
    if (t) { setInizio(t); setGiorno(giornoEOraRoma(t).giorno) }
  }, [impegni, propri, adesso, durata])

  useEffect(() => { const m = primoMese(giorno); if (m !== mese) setMese(m) }, [giorno, mese])

  // porta l'agenda sull'ora scelta, o sulle 8
  useEffect(() => {
    const el = griglia.current
    if (!el) return
    const base = Date.parse(istanteRoma(giorno, '07:00') ?? '')
    const riferimento = inizio && giornoEOraRoma(inizio).giorno === giorno ? inizio : Date.parse(istanteRoma(giorno, '08:00') ?? '')
    el.scrollTop = Math.max(0, ((riferimento - base) / (30 * MIN)) * ALTEZZA - ALTEZZA)
  }, [giorno, inizio])

  const delGiorno = propri.filter(i => giornoEOraRoma(Date.parse(i.inizio)).giorno <= giorno && Date.parse(i.fine) > Date.parse(istanteRoma(giorno, '00:00') ?? ''))
    .filter(i => Date.parse(i.inizio) < Date.parse(istanteRoma(giorno, '23:59') ?? ''))
  const aOra = delGiorno.filter(i => !i.tuttoIlGiorno)
  const interaGiornata = delGiorno.filter(i => i.tuttoIlGiorno)
  const giorniSegnati = useMemo(() => new Set(propri.filter(i => i.occupa || i.tipo === 'ferie').map(i => giornoEOraRoma(Date.parse(i.inizio)).giorno)), [propri])

  const problemi = inizio ? conflitti(inizio, durata, propri, Date.now()) : []
  const alternativa = problemi.length && inizio ? primoLibero(Math.max(inizio, Date.now()), durata, propri) : null
  const lavoro = giornataLavorativa(giorno)
  const righe = fasce(giorno)
  const base = righe[0] ?? 0

  const scegli = (ms: number) => { setInizio(ms); setGiorno(giornoEOraRoma(ms).giorno) }
  const ora = inizio && giornoEOraRoma(inizio).giorno === giorno ? giornoEOraRoma(inizio).ora : ''

  const salva = async () => {
    if (!inizio || salvo) return
    setSalvo(true)
    try {
      const start = new Date(inizio).toISOString()
      if (sposta?.googleEventId) {
        const ev = await eventoGoogle(dealId, sposta.googleEventId)
        const res = await fetch('/api/sales/follow-up', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealId, requestId: crypto.randomUUID(), title: titolo, start, duration: durata, timezone: 'Europe/Rome',
            inviteContact: !!ev.invitedEmail, eventId: sposta.googleEventId, etag: ev.etag }) })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Spostamento non riuscito')
      } else if (sposta) {
        await spostaFollowup(sposta.id, { inizio: start, durata, titolo })
      } else if (google === 'collegato') {
        const res = await fetch('/api/sales/follow-up', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealId, requestId: crypto.randomUUID(), title: titolo, start,
            duration: durata, timezone: 'Europe/Rome', inviteContact: invita }) })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Salvataggio non riuscito')
        if (data.warning) toast.warning(data.warning)
      } else {
        await pianificaFollowup(dealId, { inizio: start, durata, titolo })
      }
      toast.success(`Follow-up ${sposta ? 'spostato a' : 'fissato per'} ${quandoContatto(start, true, Date.now()).toLowerCase()}`)
      onFatto()
      onChiudi()
    } catch (e) { toast.error((e as Error).message) } finally { setSalvo(false) }
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChiudi()
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void salva() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const rapide = scorciatoie(adesso)
  const libero = impegni ? primoLibero(adesso, durata, propri) : null
  const giornoLungo = new Date(`${giorno}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-scrim sm:p-4" onClick={onChiudi}>
      <div role="dialog" aria-label={`Pianifica un follow-up con ${company}`} onClick={e => e.stopPropagation()}
        className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-pop overflow-hidden">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <span className="w-9 h-9 rounded-xl bg-gold-dim flex items-center justify-center shrink-0"><CalendarClock className="w-4 h-4 text-gold-text" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-text-primary font-heading truncate">{sposta ? 'Sposta il follow-up' : 'Pianifica un follow-up'}</h2>
            <p className="text-2xs text-text-tertiary truncate">{company}</p>
          </div>
          <button type="button" onClick={onChiudi} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary"><X className="w-5 h-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {/* un clic mette giorno e ora insieme */}
          <div className="flex flex-wrap gap-1" aria-label="Scorciatoie">
            {libero && (
              <button type="button" onClick={() => scegli(libero)} className={`${chip(inizio === libero)} inline-flex items-center gap-1`}>
                <Sparkles className="w-3 h-3" aria-hidden />Primo libero · {quandoContatto(new Date(libero).toISOString(), true, adesso)}
              </button>
            )}
            {rapide.map(s => (
              <button key={s.chiave} type="button" onClick={() => scegli(Date.parse(s.istante))} className={chip(inizio === Date.parse(s.istante))}>
                {s.etichetta}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-[17rem_1fr]">
            <div className="space-y-3">
              <MiniCalendario valore={giorno} oggi={oggi} min={oggi} segnati={giorniSegnati} etichetta="Giorno del follow-up"
                onScegli={g => {
                  setGiorno(g)
                  // tiene l'ora già scelta, spostata sul giorno nuovo
                  const o = inizio ? giornoEOraRoma(inizio).ora : '10:00'
                  const t = istanteRoma(g, o)
                  if (t) setInizio(Date.parse(t))
                }} />
              <div>
                <p className="text-2xs text-text-tertiary mb-1">Durata</p>
                <div className="flex gap-1" role="radiogroup" aria-label="Durata">
                  {DURATE.map(d => (
                    <button key={d} type="button" role="radio" aria-checked={durata === d} onClick={() => setDurata(d)} className={chip(durata === d)}>{d} min</button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="text-2xs text-text-tertiary">Titolo</span>
                <input value={titolo} onChange={e => setTitolo(e.target.value)} maxLength={200}
                  className="mt-1 w-full bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-xs text-text-primary" />
              </label>
              {google === 'collegato' && !sposta?.id ? (
                <label className="flex items-start gap-2 text-2xs text-text-secondary">
                  <input type="checkbox" checked={invita} disabled={!email} onChange={e => setInvita(e.target.checked)} className="mt-0.5 accent-gold" />
                  <span>Invita il contatto{email ? <span className="block text-text-tertiary break-all">{email}</span> : <span className="block text-text-tertiary">Serve l’email nella scheda.</span>}</span>
                </label>
              ) : google && google !== 'collegato' ? (
                <p className="text-2xs text-text-tertiary">
                  Google Calendar {google === 'non_collegato' ? 'non è collegato' : google === 'non_configurato' ? 'non è ancora attivo sul tool' : 'non risponde'}:
                  il follow-up resta qui e la campanella te lo ricorda 15 minuti prima.
                  {google === 'non_collegato' && <> <a className="text-gold-text underline" href={`/api/google/auth?returnTo=${encodeURIComponent(pathname)}`}>Collega Google</a></>}
                </p>
              ) : null}
            </div>

            {/* la giornata: fasce da mezz'ora, gli impegni disegnati sopra, l'orario di lavoro in chiaro */}
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <p className="text-xs font-semibold text-text-primary first-letter:uppercase">{giornoLungo}</p>
                <label className="inline-flex items-center gap-1 text-2xs text-text-tertiary">Ora
                  <input type="time" step={300} value={ora} onChange={e => { const t = istanteRoma(giorno, e.target.value); if (t) setInizio(Date.parse(t)) }}
                    className="bg-background border border-border-interactive rounded-lg px-1.5 py-0.5 text-2xs text-text-primary tabular" />
                </label>
              </div>
              {interaGiornata.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {interaGiornata.map(i => (
                    <span key={i.id} className={`text-2xs px-1.5 py-0.5 rounded border ${COLORE[i.tipo]}`}>
                      {i.tipo === 'task' ? `Scade: ${i.titolo}` : i.daConfermare ? `${i.titolo} (da approvare)` : i.titolo}
                    </span>
                  ))}
                </div>
              )}
              {!lavoro && <p className="text-2xs text-warning mb-1.5">Non è un giorno lavorativo.</p>}
              <div ref={griglia} className="relative max-h-[20rem] overflow-y-auto rounded-lg border border-border">
                {!impegni && <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/60"><Loader2 className="w-4 h-4 animate-spin text-text-tertiary" /></div>}
                <div className="relative" style={{ height: righe.length * ALTEZZA }}>
                  {righe.map(t => {
                    const dentro = !!lavoro && t >= lavoro.da && t < lavoro.a
                    const passato = t + 30 * MIN <= Date.now()
                    const o = giornoEOraRoma(t).ora
                    return (
                      <button key={t} type="button" disabled={passato} onClick={() => scegli(alPasso(Math.max(t, Date.now())))}
                        aria-label={`Fissa alle ${o}`}
                        className={`absolute left-0 right-0 flex items-start gap-2 px-1.5 border-t border-border text-left disabled:cursor-not-allowed ${
                          dentro ? 'hover:bg-gold/10' : 'bg-surface-hover hover:bg-gold/10'} ${passato ? 'opacity-40' : ''}`}
                        style={{ top: ((t - base) / (30 * MIN)) * ALTEZZA, height: ALTEZZA }}>
                        <span className="text-2xs text-text-tertiary tabular w-9 shrink-0 pt-0.5">{o.endsWith(':00') ? o : ''}</span>
                      </button>
                    )
                  })}
                  {aOra.map(i => {
                    const da = Math.max(Date.parse(i.inizio), base)
                    const a = Math.min(Date.parse(i.fine), base + righe.length * 30 * MIN)
                    if (a <= da) return null
                    return (
                      <div key={i.id} aria-hidden
                        className={`absolute left-11 right-1 rounded border px-1.5 text-2xs truncate pointer-events-none ${COLORE[i.tipo]} ${i.occupa ? '' : 'border-dashed'}`}
                        style={{ top: ((da - base) / (30 * MIN)) * ALTEZZA + 1, height: Math.max(ALTEZZA - 2, ((a - da) / (30 * MIN)) * ALTEZZA - 2) }}>
                        {giornoEOraRoma(Date.parse(i.inizio)).ora} {i.titolo}
                      </div>
                    )
                  })}
                  {inizio && giornoEOraRoma(inizio).giorno === giorno && (
                    <div className={`absolute left-11 right-1 rounded border-2 px-1.5 text-2xs font-semibold pointer-events-none ${
                      problemi.length ? 'border-warning bg-warning-dim text-warning' : 'border-gold bg-gold/15 text-gold-text'}`}
                      style={{ top: ((inizio - base) / (30 * MIN)) * ALTEZZA, height: Math.max(ALTEZZA, (durata / 30) * ALTEZZA) }}>
                      {giornoEOraRoma(inizio).ora} · {company}
                    </div>
                  )}
                </div>
              </div>
              <ul className="sr-only">
                {aOra.map(i => <li key={i.id}>{giornoEOraRoma(Date.parse(i.inizio)).ora}–{giornoEOraRoma(Date.parse(i.fine)).ora} {i.titolo}</li>)}
              </ul>
            </div>
          </div>
        </div>

        <footer className="border-t border-border px-4 py-3 space-y-2 shrink-0">
          {problemi.length > 0 && (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-dim px-2.5 py-1.5">
              <TriangleAlert className="w-4 h-4 text-warning shrink-0 mt-px" />
              <div className="text-2xs text-warning space-y-0.5 flex-1">
                {problemi.map((c, n) => <p key={n}>{spiegaConflitto(c)}</p>)}
                <p className="text-text-secondary">Puoi salvarlo lo stesso.</p>
              </div>
              {alternativa && (
                <button type="button" onClick={() => scegli(alternativa)} className="shrink-0 text-2xs font-semibold text-gold-text border border-gold/40 px-2 py-1 rounded-lg hover:bg-gold/10">
                  Primo libero: {quandoContatto(new Date(alternativa).toISOString(), true, Date.now())}
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-3">
            <p className="text-xs text-text-primary min-w-0 truncate">
              {inizio
                ? <>{quandoContatto(new Date(inizio).toISOString(), true, Date.now())}–{giornoEOraRoma(inizio + durata * MIN).ora}</>
                : <span className="text-text-tertiary">Scegli un momento</span>}
            </p>
            <span className="ml-auto hidden sm:block text-2xs text-text-tertiary"><kbd className="px-1.5 py-0.5 rounded bg-surface-active font-sans">⌘⏎</kbd> salva</span>
            <button type="button" onClick={onChiudi} className="text-sm text-text-secondary hover:text-text-primary">Annulla</button>
            <button type="button" onClick={() => void salva()} disabled={!inizio || salvo || !titolo.trim()}
              className="flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2 rounded-xl disabled:opacity-40">
              {salvo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{sposta ? 'Sposta' : 'Fissa'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

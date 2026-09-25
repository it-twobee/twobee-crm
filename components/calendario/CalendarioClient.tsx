'use client'

/**
 * §446 — il calendario: una barra per scegliere cosa vedere, e le viste che lo
 * disegnano.
 *
 * Prima Giorno e Settimana erano elenchi di card senza orari, le assenze non
 * c'erano, le task arrivavano come elenco vuoto, e i colleghi si sceglievano da
 * un menu chiamato «I miei calendari». Adesso tutto passa da `VoceCal`
 * (`lib/calendario.ts`) e le viste disegnano voci: Giorno e Settimana sono una
 * griglia oraria con le voci che si sovrappongono affiancate, Mese, Anno e
 * Periodo leggono le stesse voci. La barra laterale sceglie **chi** (io, i
 * colleghi) e **cosa** (eventi, task, ferie, milestone), e se lo ricorda.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Plus, Loader2, Link2, X, Search, Lock, SlidersHorizontal, Calendar as CalIcon, ExternalLink,
} from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import { colorFor } from '@/lib/calendar-colors'
import { leggiCalendario } from '@/app/actions/calendario'
import {
  FILTRI, delGiorno, disponi, filtra, giornoDopo, grigliaMese, settimanaDi, tuttoIlGiorno, type VoceCal,
} from '@/lib/calendario'
import { giornoEOraRoma, istanteRoma } from '@/lib/sales-timeline'
import { nomeFestivo } from '@/lib/calendario-lavorativo'
import { MiniCalendario } from '@/components/shared/MiniCalendario'
import { Avatar } from '@/components/shared/formkit'
import { CalendarEventForm, type EventForm } from './CalendarEventForm'

/** Forma restituita da /api/google/events */
interface GoogleEvent {
  id: string; profileId: string; summary: string; start: string; end: string; allDay: boolean
  masked: boolean; privato?: boolean
  description?: string | null; location?: string | null; meetLink?: string | null; attendeeEmails?: string[]
}
interface LocalMeeting { id: string; title: string; meeting_date: string; duration_minutes?: number; description?: string }
type Persona = Pick<Profile, 'id' | 'full_name' | 'avatar_url'>
type Vista = 'giorno' | 'settimana' | 'mese' | 'anno' | 'periodo'

const MEMORIA = 'twobee-calendario'
const ORE = { da: 7, a: 21 }
const PX_ORA = 48
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const GG = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const oggiRoma = () => giornoEOraRoma(Date.now()).giorno
const ora = (iso: string) => giornoEOraRoma(Date.parse(iso)).ora
const numero = (g: string) => Number(g.slice(8))
const etichettaGiorno = (g: string) => new Date(`${g}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** i colori di una voce: la persona per eventi e assenze, un tono fisso per task e milestone */
function stile(v: VoceCal): React.CSSProperties & { className?: string } {
  if (v.tipo === 'task') return { background: 'var(--color-gold-dim)', color: 'var(--color-gold-text)', borderColor: 'var(--color-gold)' }
  if (v.tipo === 'milestone') return { background: 'var(--color-accent-dim)', color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }
  const c = colorFor(v.profileId ?? '')
  if (v.tipo === 'ferie' || v.tipo === 'permesso') {
    return {
      background: `repeating-linear-gradient(135deg, ${c.bg} 0 6px, color-mix(in srgb, ${c.bg} 55%, transparent) 6px 12px)`,
      color: c.text, borderColor: c.dot,
    }
  }
  if (v.mascherato) return { background: 'var(--color-surface-active)', color: 'var(--color-text-secondary)', borderColor: 'var(--color-border-strong)' }
  return { background: c.bg, color: c.text, borderColor: c.dot }
}

function giornoDa(vista: Vista, g: string, n: number) {
  if (vista === 'giorno') return giornoDopo(g, n)
  if (vista === 'settimana') return giornoDopo(g, 7 * n)
  const [a, m] = g.split('-').map(Number)
  if (vista === 'anno') return `${a + n}-${String(m).padStart(2, '0')}-01`
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return d.toISOString().slice(0, 10)
}

function intervallo(vista: Vista, g: string, periodo: { dal: string; al: string }): { dal: string; al: string } {
  if (vista === 'giorno') return { dal: g, al: g }
  if (vista === 'settimana') { const s = settimanaDi(g); return { dal: s[0], al: s[6] } }
  if (vista === 'mese') { const m = grigliaMese(g); return { dal: m[0], al: m[41] } }
  if (vista === 'anno') return { dal: `${g.slice(0, 4)}-01-01`, al: `${g.slice(0, 4)}-12-31` }
  return periodo
}

function eventoAForm(e: GoogleEvent): EventForm {
  const s = giornoEOraRoma(Date.parse(e.start)), f = giornoEOraRoma(Date.parse(e.end))
  return {
    id: e.id, title: e.summary, allDay: e.allDay,
    date: e.allDay ? e.start.slice(0, 10) : s.giorno, endDate: e.allDay ? giornoDopo(e.end.slice(0, 10), -1) : f.giorno,
    startTime: s.ora, endTime: f.ora, location: e.location ?? '', description: e.description ?? '',
    addMeet: !!e.meetLink, meetLink: e.meetLink ?? null, attendeeIds: [], attendeeEmails: e.attendeeEmails ?? [],
    privato: !!e.privato,
  }
}
const nuovo = (date: string, startTime = '09:00', endTime = '10:00'): EventForm => ({
  id: null, title: '', allDay: false, date, endDate: date, startTime, endTime, location: '', description: '',
  addMeet: false, meetLink: null, attendeeIds: [], attendeeEmails: [], privato: false,
})

export function CalendarioClient({ isGoogleConnected, localMeetings = [], profiles = [], currentUserId, base = '' }: {
  isGoogleConnected: boolean
  localMeetings: LocalMeeting[]
  profiles: Persona[]
  currentUserId: string
  /** '' nel portale admin, '/workspace' nel workspace: dove portano task e milestone */
  base?: string
}) {
  const [giorno, setGiorno] = useState(oggiRoma())
  const [vista, setVista] = useState<Vista>('settimana')
  const [periodo, setPeriodo] = useState({ dal: oggiRoma(), al: giornoDopo(oggiRoma(), 30) })
  const [persone, setPersone] = useState<string[]>([currentUserId])
  const [filtri, setFiltri] = useState<Set<string>>(new Set(['eventi', 'assenze', 'milestone']))
  const [cerca, setCerca] = useState('')
  const [google, setGoogle] = useState<GoogleEvent[]>([])
  const [altre, setAltre] = useState<VoceCal[]>([])
  const [nonCollegati, setNonCollegati] = useState<string[]>([])
  const [carico, setCarico] = useState(false)
  const [editor, setEditor] = useState<EventForm | null>(null)
  const [aperta, setAperta] = useState<VoceCal | null>(null)
  const [barra, setBarra] = useState(false)
  const [qColleghi, setQColleghi] = useState('')

  /* ricorda chi e cosa, per questo browser: una preferenza, non un dato */
  useEffect(() => {
    try {
      const m = JSON.parse(window.localStorage.getItem(MEMORIA) ?? '{}') as { persone?: string[]; filtri?: string[]; vista?: Vista }
      const valide = new Set(profiles.map(p => p.id))
      if (m.persone?.length) setPersone(Array.from(new Set([currentUserId, ...m.persone.filter(p => valide.has(p))])))
      if (m.filtri) setFiltri(new Set(m.filtri.filter(f => FILTRI.some(x => x.chiave === f))))
      if (m.vista && ['giorno', 'settimana', 'mese', 'anno', 'periodo'].includes(m.vista)) setVista(m.vista)
    } catch { /* senza memoria si parte dal default */ }
  }, [profiles, currentUserId])
  useEffect(() => {
    try { window.localStorage.setItem(MEMORIA, JSON.stringify({ persone, filtri: Array.from(filtri), vista })) } catch { /* pazienza */ }
  }, [persone, filtri, vista])

  const range = intervallo(vista, giorno, periodo)
  const carica = useCallback(async () => {
    setCarico(true)
    try {
      const qs = new URLSearchParams({
        timeMin: istanteRoma(range.dal, '00:00') ?? `${range.dal}T00:00:00Z`,
        timeMax: istanteRoma(giornoDopo(range.al), '00:00') ?? `${range.al}T23:59:59Z`,
        profileIds: persone.join(','),
      })
      const [g, a] = await Promise.all([
        fetch(`/api/google/events?${qs}`).then(r => r.ok ? r.json() : { events: [], notConnected: [] }).catch(() => ({ events: [], notConnected: [] })),
        leggiCalendario(range.dal, range.al, persone, base).catch(e => { toast.error((e as Error).message); return [] as VoceCal[] }),
      ])
      setGoogle(g.events ?? []); setNonCollegati(g.notConnected ?? []); setAltre(a)
    } finally { setCarico(false) }
  }, [range.dal, range.al, persone, base])
  useEffect(() => { void carica() }, [carica])

  const voci = useMemo<VoceCal[]>(() => {
    const ev: VoceCal[] = google.map(e => ({
      id: `g:${e.profileId}:${e.id}`, tipo: 'evento', titolo: e.summary,
      ...(e.allDay ? tuttoIlGiorno(e.start.slice(0, 10), giornoDopo(e.end.slice(0, 10), -1)) : { inizio: e.start, fine: e.end }),
      tuttoIlGiorno: e.allDay, profileId: e.profileId, mascherato: e.masked, privato: e.privato,
      modificabile: e.profileId === currentUserId, dettaglio: e.location ?? null, origine: e,
    }))
    const riunioni: VoceCal[] = localMeetings.map(m => ({
      id: `r:${m.id}`, tipo: 'riunione', titolo: m.title, inizio: m.meeting_date,
      fine: new Date(Date.parse(m.meeting_date) + (m.duration_minutes ?? 60) * 60_000).toISOString(),
      tuttoIlGiorno: false, profileId: null, dettaglio: m.description ?? null,
    }))
    return filtra([...ev, ...riunioni, ...altre], { filtri, cerca })
  }, [google, localMeetings, altre, filtri, cerca, currentUserId])

  const conta = useMemo(() => {
    const tutte = [...google.map(() => 'evento'), ...localMeetings.map(() => 'riunione'), ...altre.map(a => a.tipo)]
    return Object.fromEntries(FILTRI.map(f => [f.chiave, tutte.filter(t => (f.tipi as string[]).includes(t)).length]))
  }, [google, localMeetings, altre])

  const apri = (v: VoceCal) => {
    if (v.modificabile && v.origine) { setEditor(eventoAForm(v.origine as GoogleEvent)); return }
    setAperta(v)
  }
  const crea = (g: string, oraDa?: string) => {
    if (!isGoogleConnected) { toast.message('Collega Google Calendar per creare eventi'); return }
    const [h] = (oraDa ?? '09:00').split(':').map(Number)
    setEditor(nuovo(g, oraDa ?? '09:00', `${String(Math.min(23, h + 1)).padStart(2, '0')}:${(oraDa ?? '09:00').slice(3)}`))
  }

  const titolo = vista === 'giorno' ? etichettaGiorno(giorno)
    : vista === 'settimana' ? (() => { const s = settimanaDi(giorno); return `${numero(s[0])} ${MESI[Number(s[0].slice(5, 7)) - 1].slice(0, 3)} – ${numero(s[6])} ${MESI[Number(s[6].slice(5, 7)) - 1].slice(0, 3)} ${s[6].slice(0, 4)}` })()
    : vista === 'mese' ? `${MESI[Number(giorno.slice(5, 7)) - 1]} ${giorno.slice(0, 4)}`
    : vista === 'anno' ? giorno.slice(0, 4) : 'Periodo'

  const colleghi = profiles.filter(p => p.id !== currentUserId && (!qColleghi || p.full_name.toLowerCase().includes(qColleghi.toLowerCase())))
  const io = profiles.find(p => p.id === currentUserId)
  const tuttiColleghi = profiles.filter(p => p.id !== currentUserId).every(p => persone.includes(p.id))

  const Barra = (
    <aside className="space-y-5">
      <MiniCalendario valore={giorno} oggi={oggiRoma()} etichetta="Vai al giorno"
        onScegli={g => { setGiorno(g); if (vista === 'anno' || vista === 'periodo') setVista('giorno'); setBarra(false) }} />

      <section>
        <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">Cosa vedere</p>
        <div className="space-y-0.5">
          {FILTRI.map(f => {
            const on = filtri.has(f.chiave)
            const tinta = f.chiave === 'task' ? 'var(--color-gold)' : f.chiave === 'milestone' ? 'var(--color-accent)' : f.chiave === 'assenze' ? 'var(--color-warning)' : 'var(--color-info)'
            return (
              <button key={f.chiave} type="button" role="switch" aria-checked={on}
                onClick={() => setFiltri(s => { const n = new Set(s); if (n.has(f.chiave)) n.delete(f.chiave); else n.add(f.chiave); return n })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-surface-hover text-left">
                <span className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
                  style={{ background: on ? tinta : 'transparent', borderColor: tinta }} aria-hidden />
                <span className={`flex-1 ${on ? 'text-text-primary' : 'text-text-tertiary'}`}>{f.etichetta}</span>
                <span className="text-2xs text-text-tertiary tabular">{conta[f.chiave] || ''}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">Il mio calendario</p>
        {io && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorFor(io.id).dot }} aria-hidden />
            <span className="flex-1 truncate text-text-primary">{io.full_name} (tu)</span>
            {nonCollegati.includes(io.id) && <span className="text-2xs text-text-tertiary">Google non collegato</span>}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide">Calendario colleghi</p>
          <button type="button" className="text-2xs text-gold-text hover:underline"
            onClick={() => setPersone(tuttiColleghi ? [currentUserId] : profiles.map(p => p.id))}>
            {tuttiColleghi ? 'Nessuno' : 'Tutto il team'}
          </button>
        </div>
        {profiles.length > 8 && (
          <label className="relative block mb-1.5">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" aria-hidden />
            <input value={qColleghi} onChange={e => setQColleghi(e.target.value)} placeholder="Cerca un collega" aria-label="Cerca un collega"
              className="w-full bg-background border border-border-interactive rounded-lg pl-7 pr-2 py-1 text-xs text-text-primary" />
          </label>
        )}
        <div className="space-y-0.5 max-h-72 overflow-y-auto">
          {colleghi.map(p => {
            const on = persone.includes(p.id)
            const c = colorFor(p.id)
            return (
              <button key={p.id} type="button" role="checkbox" aria-checked={on}
                onClick={() => setPersone(s => on ? s.filter(x => x !== p.id) : [...s, p.id])}
                className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-xs hover:bg-surface-hover text-left">
                <span className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
                  style={{ background: on ? c.dot : 'transparent', borderColor: c.dot }} aria-hidden />
                <Avatar name={p.full_name} url={p.avatar_url} size={20} />
                <span className={`flex-1 truncate ${on ? 'text-text-primary' : 'text-text-secondary'}`}>{p.full_name}</span>
                {on && nonCollegati.includes(p.id) && <span className="text-2xs text-text-tertiary" title="Google non collegato: si vedono solo ferie e permessi">senza Google</span>}
              </button>
            )
          })}
        </div>
      </section>
    </aside>
  )

  return (
    <div className="flex min-h-full">
      <div className="hidden lg:block w-64 shrink-0 border-r border-border p-4">{Barra}</div>
      {barra && (
        <div className="lg:hidden fixed inset-0 z-50 bg-scrim" onClick={() => setBarra(false)}>
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface border-r border-border p-4 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end mb-2"><button type="button" onClick={() => setBarra(false)} aria-label="Chiudi i filtri" className="text-text-tertiary hover:text-text-primary"><X className="w-5 h-5" /></button></div>
            {Barra}
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 p-4 sm:p-6 space-y-4">
        <header className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => setBarra(true)} className="lg:hidden p-2 rounded-lg border border-border text-text-secondary" aria-label="Filtri e colleghi">
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setGiorno(oggiRoma())} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover">Oggi</button>
          {vista !== 'periodo' && (
            <div className="flex items-center">
              <button type="button" onClick={() => setGiorno(g => giornoDa(vista, g, -1))} aria-label="Precedente" className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-hover"><ChevronLeft className="w-4 h-4" /></button>
              <button type="button" onClick={() => setGiorno(g => giornoDa(vista, g, 1))} aria-label="Successivo" className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-hover"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
          <h1 className="text-lg sm:text-xl font-bold text-text-primary font-heading first-letter:uppercase">{titolo}</h1>
          {carico && <Loader2 className="w-4 h-4 text-gold-text animate-spin" aria-label="Carico" />}

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <label className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" aria-hidden />
              <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca" aria-label="Cerca nel calendario"
                className="w-40 bg-surface border border-border-interactive rounded-lg pl-8 pr-2 py-1.5 text-xs text-text-primary" />
            </label>
            <div className="flex bg-surface-active rounded-xl p-0.5" role="radiogroup" aria-label="Vista">
              {(['giorno', 'settimana', 'mese', 'anno', 'periodo'] as Vista[]).map(v => (
                <button key={v} type="button" role="radio" aria-checked={vista === v} onClick={() => setVista(v)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${vista === v ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary hover:text-text-primary'}`}>
                  {v === 'giorno' ? 'Giorno' : v === 'settimana' ? 'Settimana' : v === 'mese' ? 'Mese' : v === 'anno' ? 'Anno' : 'Periodo'}
                </button>
              ))}
            </div>
            {isGoogleConnected ? (
              <button type="button" onClick={() => crea(giorno)} className="flex items-center gap-1.5 text-xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg">
                <Plus className="w-3.5 h-3.5" />Evento
              </button>
            ) : (
              <a href="/api/google/auth" className="flex items-center gap-1.5 text-xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg">
                <Link2 className="w-3.5 h-3.5" />Collega Google
              </a>
            )}
          </div>
        </header>

        {!isGoogleConnected && (
          <div className="flex items-center gap-3 p-3 rounded-xl border border-gold/30 bg-gold-dim">
            <CalIcon className="w-5 h-5 text-gold-text shrink-0" aria-hidden />
            <p className="text-xs text-text-secondary flex-1">
              Collega il tuo Google Calendar per vedere i tuoi eventi e crearne di nuovi da qui. Ferie, permessi, task e milestone si vedono comunque.
            </p>
          </div>
        )}

        {vista === 'periodo' && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            Dal <input type="date" value={periodo.dal} onChange={e => setPeriodo(p => ({ ...p, dal: e.target.value }))} className="bg-surface border border-border-interactive rounded-lg px-2 py-1 text-xs text-text-primary" />
            al <input type="date" value={periodo.al} min={periodo.dal} onChange={e => setPeriodo(p => ({ ...p, al: e.target.value }))} className="bg-surface border border-border-interactive rounded-lg px-2 py-1 text-xs text-text-primary" />
          </div>
        )}

        {vista === 'giorno' || vista === 'settimana'
          ? <Griglia giorni={vista === 'giorno' ? [giorno] : settimanaDi(giorno)} voci={voci} onApri={apri} onCrea={crea}
              onGiorno={g => { setGiorno(g); setVista('giorno') }} />
          : vista === 'mese'
          ? <Mese giorno={giorno} voci={voci} onApri={apri} onGiorno={g => { setGiorno(g); setVista('giorno') }} />
          : vista === 'anno'
          ? <Anno anno={giorno.slice(0, 4)} voci={voci} onGiorno={g => { setGiorno(g); setVista('giorno') }} />
          : <Elenco dal={periodo.dal} al={periodo.al} voci={voci} onApri={apri} />}
      </div>

      {aperta && <Dettaglio voce={aperta} persona={profiles.find(p => p.id === aperta.profileId) ?? null} onChiudi={() => setAperta(null)} />}
      {editor && (
        <CalendarEventForm form={editor} profiles={profiles} currentUserId={currentUserId}
          onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void carica() }} />
      )}
    </div>
  )
}

function Chip({ v, onApri, compatto }: { v: VoceCal; onApri: (v: VoceCal) => void; compatto?: boolean }) {
  const s = stile(v)
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onApri(v) }} title={v.titolo}
      className={`w-full flex items-center gap-1 rounded-md border-l-2 px-1.5 ${compatto ? 'py-0' : 'py-0.5'} text-2xs text-left truncate hover:brightness-95`}
      style={s}>
      {v.privato && <Lock className="w-2.5 h-2.5 shrink-0" aria-label="privato" />}
      {!v.tuttoIlGiorno && <span className="tabular opacity-80 shrink-0">{ora(v.inizio)}</span>}
      <span className={`truncate ${v.mascherato ? 'italic' : 'font-medium'}`}>{v.tipo === 'milestone' ? `◆ ${v.titolo}` : v.titolo}</span>
    </button>
  )
}

/** Giorno e Settimana: colonne per giorno, righe per ora, voci alla loro altezza */
function Griglia({ giorni, voci, onApri, onCrea, onGiorno }: {
  giorni: string[]; voci: VoceCal[]; onApri: (v: VoceCal) => void; onCrea: (g: string, ora: string) => void; onGiorno: (g: string) => void
}) {
  const scorri = useRef<HTMLDivElement>(null)
  const oggi = oggiRoma()
  const ore = Array.from({ length: ORE.a - ORE.da }, (_, i) => ORE.da + i)
  useEffect(() => { if (scorri.current) scorri.current.scrollTop = (9 - ORE.da) * PX_ORA - 8 }, [giorni.join()])
  const [adesso, setAdesso] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setAdesso(Date.now()), 60_000); return () => clearInterval(t) }, [])
  const minAdesso = (() => { const { ora: o } = giornoEOraRoma(adesso); const [h, m] = o.split(':').map(Number); return (h - ORE.da) * 60 + m })()
  const colonne = `3.25rem repeat(${giorni.length}, minmax(0, 1fr))`

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-surface">
      {/* intestazione e voci di tutto il giorno */}
      <div className="grid border-b border-border" style={{ gridTemplateColumns: colonne }}>
        <div />
        {giorni.map(g => {
          const dow = (new Date(`${g}T12:00:00Z`).getUTCDay() + 6) % 7
          const festa = nomeFestivo(g)
          return (
            <button key={g} type="button" onClick={() => onGiorno(g)} className="px-1 py-1.5 text-center border-l border-border hover:bg-surface-hover">
              <span className="block text-2xs uppercase text-text-tertiary">{GG[dow]}</span>
              <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-sm font-semibold tabular ${g === oggi ? 'bg-gold text-on-gold' : dow > 4 ? 'text-text-tertiary' : 'text-text-primary'}`}>{numero(g)}</span>
              {festa && <span className="block text-2xs text-text-tertiary truncate">{festa}</span>}
            </button>
          )
        })}
      </div>
      <div className="grid border-b border-border" style={{ gridTemplateColumns: colonne }}>
        <div className="text-2xs text-text-tertiary px-1 py-1 text-right">tutto il giorno</div>
        {giorni.map(g => (
          <div key={g} className="border-l border-border p-0.5 space-y-0.5 min-h-[1.75rem]">
            {delGiorno(voci, g).filter(v => v.tuttoIlGiorno).map(v => <Chip key={v.id} v={v} onApri={onApri} compatto />)}
          </div>
        ))}
      </div>
      <div ref={scorri} className="max-h-[36rem] overflow-y-auto">
        <div className="grid relative" style={{ gridTemplateColumns: colonne, height: ore.length * PX_ORA }}>
          <div className="relative">
            {ore.map(h => <span key={h} className="absolute right-1 text-2xs text-text-tertiary tabular -translate-y-1/2" style={{ top: (h - ORE.da) * PX_ORA }}>{h > ORE.da ? `${h}:00` : ''}</span>)}
          </div>
          {giorni.map(g => {
            const disposte = disponi(delGiorno(voci, g), g, ORE)
            return (
              <div key={g} className="relative border-l border-border">
                {ore.map(h => (
                  <button key={h} type="button" aria-label={`Nuovo evento ${etichettaGiorno(g)} alle ${h}:00`}
                    onClick={() => onCrea(g, `${String(h).padStart(2, '0')}:00`)}
                    className={`absolute inset-x-0 border-t border-border hover:bg-gold/5 ${h < 9 || h >= 18 ? 'bg-surface-hover/60' : ''}`}
                    style={{ top: (h - ORE.da) * PX_ORA, height: PX_ORA }} />
                ))}
                {g === oggi && minAdesso > 0 && minAdesso < (ORE.a - ORE.da) * 60 && (
                  <div aria-hidden className="absolute inset-x-0 h-0.5 bg-error z-10 pointer-events-none" style={{ top: (minAdesso / 60) * PX_ORA }} />
                )}
                {disposte.map(d => {
                  const s = stile(d.voce)
                  const w = 100 / d.corsie
                  return (
                    <button key={d.voce.id} type="button" onClick={() => onApri(d.voce)} title={`${ora(d.voce.inizio)}–${ora(d.voce.fine)} ${d.voce.titolo}`}
                      className="absolute rounded-md border-l-[3px] px-1.5 py-0.5 text-left overflow-hidden text-2xs leading-tight hover:brightness-95 z-[5]"
                      style={{ ...s, top: (d.daMin / 60) * PX_ORA + 1, height: Math.max(18, (d.perMin / 60) * PX_ORA - 2), left: `calc(${w * d.corsia}% + 2px)`, width: `calc(${w}% - 4px)` }}>
                      <span className={`block truncate ${d.voce.mascherato ? 'italic' : 'font-semibold'}`}>
                        {d.voce.privato && <Lock className="inline w-2.5 h-2.5 mr-0.5" aria-label="privato" />}{d.voce.titolo}
                      </span>
                      {d.perMin >= 40 && <span className="block tabular opacity-80">{ora(d.voce.inizio)}–{ora(d.voce.fine)}</span>}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Mese({ giorno, voci, onApri, onGiorno }: { giorno: string; voci: VoceCal[]; onApri: (v: VoceCal) => void; onGiorno: (g: string) => void }) {
  const oggi = oggiRoma()
  const mese = giorno.slice(0, 7)
  return (
    <div className="border border-border rounded-xl overflow-hidden bg-surface">
      <div className="grid grid-cols-7 border-b border-border">
        {GG.map(g => <span key={g} className="text-2xs uppercase text-text-tertiary text-center py-1.5">{g}</span>)}
      </div>
      <div className="grid grid-cols-7">
        {grigliaMese(giorno).map(g => {
          const del = delGiorno(voci, g).sort((a, b) => Number(b.tuttoIlGiorno) - Number(a.tuttoIlGiorno) || a.inizio.localeCompare(b.inizio))
          const fuori = g.slice(0, 7) !== mese
          return (
            <div key={g} className={`min-h-[6.5rem] border-b border-l border-border p-1 space-y-0.5 ${fuori ? 'bg-surface-hover/50' : ''}`}>
              <button type="button" onClick={() => onGiorno(g)} className={`text-2xs font-semibold tabular w-6 h-6 rounded-full ${g === oggi ? 'bg-gold text-on-gold' : fuori ? 'text-text-tertiary' : 'text-text-primary hover:bg-surface-hover'}`}>
                {numero(g)}
              </button>
              {del.slice(0, 3).map(v => <Chip key={v.id} v={v} onApri={onApri} compatto />)}
              {del.length > 3 && <button type="button" onClick={() => onGiorno(g)} className="text-2xs text-text-tertiary hover:text-text-primary px-1">+{del.length - 3} altri</button>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Anno({ anno, voci, onGiorno }: { anno: string; voci: VoceCal[]; onGiorno: (g: string) => void }) {
  const oggi = oggiRoma()
  const pieni = new Set(voci.flatMap(v => delGiorno([v], v.inizio.slice(0, 10)).length ? [giornoEOraRoma(Date.parse(v.inizio)).giorno] : []))
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {MESI.map((m, i) => {
        const primo = `${anno}-${String(i + 1).padStart(2, '0')}-01`
        return (
          <div key={m} className="border border-border rounded-xl p-3 bg-surface">
            <p className="text-xs font-semibold text-text-primary capitalize mb-1">{m}</p>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {grigliaMese(primo).map(g => (
                <button key={g} type="button" onClick={() => onGiorno(g)}
                  className={`relative h-6 text-2xs tabular rounded ${g.slice(0, 7) !== primo.slice(0, 7) ? 'text-text-tertiary opacity-40' : g === oggi ? 'bg-gold text-on-gold font-bold' : 'text-text-secondary hover:bg-surface-hover'}`}>
                  {numero(g)}
                  {pieni.has(g) && g !== oggi && <span aria-hidden className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold-text" />}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Elenco({ dal, al, voci, onApri }: { dal: string; al: string; voci: VoceCal[]; onApri: (v: VoceCal) => void }) {
  const giorni: string[] = []
  for (let g = dal; g <= al && giorni.length < 400; g = giornoDopo(g)) giorni.push(g)
  const pieni = giorni.map(g => ({ g, voci: delGiorno(voci, g).sort((a, b) => a.inizio.localeCompare(b.inizio)) })).filter(x => x.voci.length)
  if (!pieni.length) return <p className="text-sm text-text-tertiary py-8 text-center">Niente in questo periodo con i filtri scelti.</p>
  return (
    <div className="space-y-3">
      {pieni.map(({ g, voci: vv }) => (
        <section key={g} className="border border-border rounded-xl bg-surface">
          <h3 className="px-3 py-2 text-xs font-semibold text-text-primary border-b border-border first-letter:uppercase">{etichettaGiorno(g)}</h3>
          <div className="p-2 space-y-1">{vv.map(v => <Chip key={v.id} v={v} onApri={onApri} />)}</div>
        </section>
      ))}
    </div>
  )
}

/** una voce che non si modifica da qui: cosa, quando, di chi, e dove porta */
function Dettaglio({ voce, persona, onChiudi }: { voce: VoceCal; persona: Persona | null; onChiudi: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onChiudi])
  const quando = voce.tuttoIlGiorno
    ? etichettaGiorno(giornoEOraRoma(Date.parse(voce.inizio)).giorno)
    : `${etichettaGiorno(giornoEOraRoma(Date.parse(voce.inizio)).giorno)} · ${ora(voce.inizio)}–${ora(voce.fine)}`
  const tipo = { evento: 'Evento', riunione: 'Riunione', task: 'Task', ferie: 'Assenza', permesso: 'Permesso', milestone: 'Milestone' }[voce.tipo]
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-scrim p-4" onClick={onChiudi}>
      <div role="dialog" aria-label={voce.titolo} onClick={e => e.stopPropagation()} className="w-full max-w-sm bg-surface border border-border rounded-2xl shadow-pop p-4 space-y-2">
        <div className="flex items-start gap-2">
          <span className="mt-1 w-3 h-3 rounded-sm shrink-0" style={{ background: stile(voce).borderColor as string }} aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-2xs uppercase tracking-wide text-text-tertiary">{tipo}{voce.privato ? ' · privato' : ''}</p>
            <h3 className={`text-base font-bold text-text-primary ${voce.mascherato ? 'italic' : ''}`}>{voce.titolo}</h3>
          </div>
          <button type="button" onClick={onChiudi} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-text-secondary first-letter:uppercase">{quando}</p>
        {voce.dettaglio && <p className="text-xs text-text-secondary">{voce.dettaglio}</p>}
        {persona && <p className="flex items-center gap-1.5 text-xs text-text-secondary"><Avatar name={persona.full_name} url={persona.avatar_url} size={18} />{persona.full_name}</p>}
        {voce.mascherato && <p className="text-2xs text-text-tertiary">{voce.privato ? 'Evento privato: il titolo lo vede solo chi l’ha creato.' : 'I dettagli degli eventi dei colleghi restano loro.'}</p>}
        {voce.link && (
          <Link href={voce.link} className="inline-flex items-center gap-1 text-xs font-semibold text-gold-text hover:underline"><ExternalLink className="w-3.5 h-3.5" />Apri</Link>
        )}
      </div>
    </div>
  )
}

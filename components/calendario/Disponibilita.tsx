'use client'

/**
 * §447 — mentre si fissa un evento: chi è libero, chi no, e quando lo sono
 * tutti.
 *
 * Una riga per persona (io e gli invitati), la giornata di lavoro come una
 * barra, i suoi impegni disegnati sopra e l'orario scelto in oro. Sotto, i
 * conflitti in parole («Toto: Call Rossi 10–11») e il primo momento in cui sono
 * liberi tutti, a un clic. Le regole sono quelle del follow-up
 * (`lib/sales-agenda.ts`: 9–18, festivi, ferie; avvisano e non bloccano), gli
 * impegni quelli del calendario: Google di ognuno — dei colleghi basta l'orario,
 * il titolo lo vede chi lo può vedere — e ferie e permessi dal tool.
 */

import { useEffect, useMemo, useState } from 'react'
import { Sparkles, TriangleAlert } from 'lucide-react'
import { leggiCalendario } from '@/app/actions/calendario'
import { conflitti, primoLibero, spiegaConflitto, ORARIO, type Impegno } from '@/lib/sales-agenda'
import { giornoEOraRoma, istanteRoma, quandoContatto } from '@/lib/sales-timeline'
import { giornoDopo } from '@/lib/calendario'
import { colorFor } from '@/lib/calendar-colors'

type Persona = { id: string; full_name: string }
type GoogleEvent = { id: string; profileId: string; summary: string; start: string; end: string; allDay: boolean; masked: boolean }

const MIN = 60_000

export function Disponibilita({ giorno, inizio, fine, persone, profili, ioId, eventoId, onScegli }: {
  giorno: string
  /** HH:MM */
  inizio: string
  fine: string
  /** io e gli invitati */
  persone: string[]
  profili: Persona[]
  ioId: string
  /** l'evento che si sta modificando: non è un conflitto con sé stesso */
  eventoId: string | null
  onScegli: (giorno: string, inizio: string, fine: string) => void
}) {
  const [impegni, setImpegni] = useState<Map<string, Impegno[]> | null>(null)
  const chiave = `${giorno}|${persone.join(',')}`

  /* due settimane dal giorno scelto: il primo buco comune può essere più avanti */
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno) || !persone.length) return
    let vivo = true
    const al = giornoDopo(giorno, 14)
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({
        timeMin: istanteRoma(giorno, '00:00') ?? `${giorno}T00:00:00Z`,
        timeMax: istanteRoma(giornoDopo(al), '00:00') ?? `${al}T23:59:59Z`,
        profileIds: persone.join(','),
      })
      const [g, altre] = await Promise.all([
        fetch(`/api/google/events?${qs}`).then(r => r.ok ? r.json() : { events: [] }).catch(() => ({ events: [] })),
        leggiCalendario(giorno, al, persone, '').catch(() => []),
      ])
      if (!vivo) return
      const m = new Map<string, Impegno[]>(persone.map(p => [p, []]))
      for (const e of (g.events ?? []) as GoogleEvent[]) {
        if (e.allDay || e.id === eventoId) continue
        m.get(e.profileId)?.push({ id: e.id, tipo: 'google', titolo: e.masked ? 'Occupato' : e.summary, inizio: e.start, fine: e.end, tuttoIlGiorno: false, occupa: true })
      }
      for (const v of altre) {
        if ((v.tipo !== 'ferie' && v.tipo !== 'permesso') || !v.profileId) continue
        m.get(v.profileId)?.push({ id: v.id, tipo: 'ferie', titolo: v.titolo, inizio: v.inizio, fine: v.fine, tuttoIlGiorno: false, occupa: true })
      }
      setImpegni(m)
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [chiave, eventoId])

  const da = istanteRoma(giorno, inizio), a = istanteRoma(giorno, fine)
  const durata = da && a ? Math.max(15, Math.round((Date.parse(a) - Date.parse(da)) / MIN)) : 30
  const nome = (id: string) => id === ioId ? 'Tu' : profili.find(p => p.id === id)?.full_name.split(' ')[0] ?? 'Collega'

  const esito = useMemo(() => {
    if (!impegni || !da) return null
    const ms = Date.parse(da)
    const generali = conflitti(ms, durata, [], Date.now()).map(spiegaConflitto)
    const perPersona = persone.flatMap(p => conflitti(ms, durata, impegni.get(p) ?? [], Date.now())
      .filter(c => c.tipo === 'sovrapposizione' || c.tipo === 'ferie')
      .map(c => `${nome(p)}: ${spiegaConflitto(c).replace(/^Si sovrappone a /, '').replace(/^Quel giorno sei in ferie/, 'in ferie')}`))
    const tutti = persone.flatMap(p => impegni.get(p) ?? [])
    const libero = primoLibero(Math.max(Date.now(), ms - 0), durata, tutti)
    return { avvisi: [...generali, ...perPersona], libero: libero && libero !== ms ? libero : null }
  }, [impegni, da, durata, persone])

  const giornata = { da: Date.parse(istanteRoma(giorno, ORARIO.da) ?? ''), a: Date.parse(istanteRoma(giorno, ORARIO.a) ?? '') }
  const pos = (ms: number) => Math.min(100, Math.max(0, ((ms - giornata.da) / (giornata.a - giornata.da)) * 100))

  return (
    <div className="rounded-xl border border-border p-3 space-y-2">
      <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide">Disponibilità · {ORARIO.da}–{ORARIO.a}</p>
      {!impegni && <p className="text-2xs text-text-tertiary">Leggo le agende…</p>}
      {impegni && persone.map(p => {
        const suoi = (impegni.get(p) ?? []).filter(i => Date.parse(i.fine) > giornata.da && Date.parse(i.inizio) < giornata.a)
        return (
          <div key={p} className="flex items-center gap-2">
            <span className="w-16 shrink-0 truncate text-2xs text-text-secondary" title={profili.find(x => x.id === p)?.full_name}>{nome(p)}</span>
            <div className="relative flex-1 h-4 rounded bg-surface-active overflow-hidden" aria-label={`Agenda di ${nome(p)}`}>
              {suoi.map(i => (
                <span key={i.id} title={`${giornoEOraRoma(Date.parse(i.inizio)).ora}–${giornoEOraRoma(Date.parse(i.fine)).ora} ${i.titolo}`}
                  className="absolute inset-y-0" style={{ left: `${pos(Date.parse(i.inizio))}%`, width: `${Math.max(1.5, pos(Date.parse(i.fine)) - pos(Date.parse(i.inizio)))}%`, background: colorFor(p).dot, opacity: i.tipo === 'ferie' ? 0.45 : 0.8 }} />
              ))}
              {da && a && (
                <span aria-hidden className="absolute inset-y-0 border-2 border-gold rounded-sm" style={{ left: `${pos(Date.parse(da))}%`, width: `${Math.max(2, pos(Date.parse(a)) - pos(Date.parse(da)))}%` }} />
              )}
            </div>
          </div>
        )
      })}
      {esito && esito.avvisi.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-dim px-2.5 py-1.5">
          <TriangleAlert className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
          <div className="text-2xs text-warning space-y-0.5">{esito.avvisi.map((x, i) => <p key={i}>{x}</p>)}<p className="text-text-secondary">Puoi crearlo lo stesso.</p></div>
        </div>
      )}
      {esito?.libero && (
        <button type="button" onClick={() => {
          const s = giornoEOraRoma(esito.libero!), f = giornoEOraRoma(esito.libero! + durata * MIN)
          onScegli(s.giorno, s.ora, f.ora)
        }} className="inline-flex items-center gap-1.5 text-2xs font-semibold text-gold-text border border-gold/40 px-2 py-1 rounded-lg hover:bg-gold/10">
          <Sparkles className="w-3 h-3" />Primo orario libero per {persone.length > 1 ? 'tutti' : 'te'}: {quandoContatto(new Date(esito.libero).toISOString(), true, Date.now())}
        </button>
      )}
      {esito && !esito.avvisi.length && <p className="text-2xs text-success">Liberi tutti a quest’ora.</p>}
    </div>
  )
}

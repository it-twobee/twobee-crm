'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, ChevronDown, ChevronRight, Search, MousePointerClick, PenLine } from 'lucide-react'
import {
  durataTesto, assenzaTesto, ONLINE_MS, SESSIONI_MOSTRATE, GAP_SESSIONE_MIN,
  type PersonaUtilizzo,
} from '@/lib/presenza'
import { ROLE_LABELS } from '@/lib/permissions'
import type { AppRole } from '@/lib/types/database'

export type RigaUtilizzo = PersonaUtilizzo & {
  nome: string
  email: string
  ruolo: AppRole
  avatar: string | null
  attivo: boolean
  creato: string
}

interface Props {
  righe: RigaUtilizzo[]
  giorni: number
  opzioniGiorni: number[]
}

const FMT_GIORNO = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', timeZone: 'Europe/Rome' })
const FMT_ORA = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
const num = (n: number) => n.toLocaleString('it-IT')

const PORTALE_LABEL: Record<string, string> = {
  admin: 'Tool admin', workspace: 'Workspace', portale: 'Portale cliente',
  risorsa: 'Risorsa esterna', altro: 'Altro',
}

type Filtro = 'tutti' | 'online' | 'assenti' | 'mai'

export function UtilizzoClient({ righe, giorni, opzioniGiorni }: Props) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('tutti')
  const [aperta, setAperta] = useState<string | null>(null)

  const stats = useMemo(() => ({
    online: righe.filter(r => r.stato === 'online').length,
    attivi: righe.filter(r => r.attivoFinestraMs > 0).length,
    mai: righe.filter(r => r.stato === 'mai').length,
    /* Chi è entrato e non ha toccato una riga: non è un allarme di per sé —
       consultare è lavoro — ma è la domanda che porta qui più spesso. */
    soloLettura: righe.filter(r => r.attivoFinestraMs > 0 && r.azioni === 0).length,
  }), [righe])

  const visibili = useMemo(() => {
    const testo = q.trim().toLowerCase()
    return righe.filter(r => {
      if (testo && !`${r.nome} ${r.email} ${r.ruolo}`.toLowerCase().includes(testo)) return false
      if (filtro === 'online') return r.stato === 'online'
      if (filtro === 'mai') return r.stato === 'mai'
      if (filtro === 'assenti') return r.assenteMs !== null && r.assenteMs > 7 * 86_400_000
      return true
    })
  }, [righe, q, filtro])

  /* La barra è proporzionale alla sessione più lunga **di tutta la pagina**:
     normalizzarla per persona farebbe sembrare uguali dieci minuti e tre ore. */
  const massimo = useMemo(
    () => Math.max(1, ...righe.flatMap(r => r.sessioni.map(s => s.attivoMs))),
    [righe],
  )

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-gold-text" />
          <div>
            <h1 className="text-xl font-black text-text-primary font-heading">Utilizzo del tool</h1>
            <p className="text-xs text-text-secondary max-w-2xl">
              Il tempo è contato sui <strong className="text-text-primary">minuti con almeno un&apos;interazione</strong> —
              click, tasti, rotella, cambi di pagina — non su quanto la scheda è rimasta aperta.
              Dopo {GAP_SESSIONE_MIN} minuti di silenzio la sessione si chiude; «online» vuol dire
              che ha toccato qualcosa negli ultimi {Math.round(ONLINE_MS / 60_000)} minuti.
            </p>
          </div>
        </div>
        <div className="flex border border-border rounded-xl overflow-hidden">
          {opzioniGiorni.map(g => (
            <Link key={g} href={`/impostazioni/utilizzo?giorni=${g}`} scroll={false}
              className={`px-3 py-2 text-xs font-semibold transition-colors ${
                g === giorni ? 'bg-gold-dim text-gold-text' : 'text-text-secondary hover:text-text-primary'}`}>
              {g} giorni
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Tile label="Online adesso" value={stats.online} hint={`negli ultimi ${Math.round(ONLINE_MS / 60_000)} min`}
          active={filtro === 'online'} onClick={() => setFiltro(filtro === 'online' ? 'tutti' : 'online')} />
        <Tile label="Attivi" value={stats.attivi} hint={`su ${righe.length}, in ${giorni} giorni`} />
        <Tile label="Solo lettura" value={stats.soloLettura} hint="dentro, nessuna modifica" />
        <Tile label="Mai entrati" value={stats.mai} hint="da quando si misura"
          active={filtro === 'mai'} onClick={() => setFiltro(filtro === 'mai' ? 'tutti' : 'mai')} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca una persona…"
            aria-label="Cerca una persona"
            className="w-full bg-surface border border-border-interactive rounded-lg pl-8 pr-3 py-2 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold/40" />
        </div>
        {([['tutti', 'Tutti'], ['online', 'Online'], ['assenti', 'Assenti da 7+ giorni'], ['mai', 'Mai entrati']] as [Filtro, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setFiltro(k)}
            className={`text-2xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
              filtro === k ? 'bg-gold-dim border-gold/40 text-gold-text' : 'bg-surface border-border text-text-secondary hover:text-text-primary'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {visibili.length === 0 && (
          <p className="text-xs text-text-tertiary text-center py-8">Nessuna persona con questi filtri.</p>
        )}
        {visibili.map(r => {
          const espansa = aperta === r.profileId
          return (
            <div key={r.profileId}
              className={`bg-surface border rounded-xl overflow-hidden transition-colors ${espansa ? 'border-gold/30' : 'border-border'}`}>
              <button onClick={() => setAperta(espansa ? null : r.profileId)}
                aria-expanded={espansa}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors">
                {espansa
                  ? <ChevronDown className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-text-tertiary shrink-0" />}

                <Stato stato={r.stato} />

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-text-primary truncate">
                    {r.nome}
                    {!r.attivo && <span className="ml-2 text-2xs font-medium text-text-tertiary">disattivato</span>}
                  </p>
                  <p className="text-2xs text-text-tertiary truncate">
                    {ROLE_LABELS[r.ruolo] ?? r.ruolo} · {r.stato === 'online' ? 'online adesso' : assenzaTesto(r.assenteMs)}
                  </p>
                </div>

                {/* Le ultime sessioni, la più recente a destra: si legge come una
                    riga del tempo, non come una classifica. */}
                <div className="hidden sm:flex items-end gap-1 h-8 w-28 shrink-0" aria-hidden>
                  {[...r.sessioni].reverse().map(s => (
                    <span key={s.id} title={`${durataTesto(s.attivoMs)} attivi`}
                      className="flex-1 bg-gold rounded-sm min-h-[3px]"
                      style={{ height: `${Math.max(8, (s.attivoMs / massimo) * 100)}%` }} />
                  ))}
                  {r.sessioni.length === 0 && <span className="flex-1 border-b border-dashed border-border-strong" />}
                </div>

                <Numero label={`ultime ${SESSIONI_MOSTRATE}`} valore={durataTesto(r.attivoUltimeMs)} />
                <Numero label={`${giorni} giorni`} valore={durataTesto(r.attivoFinestraMs)} />
                <Numero label="interazioni" valore={num(r.interazioniFinestra)} icona={<MousePointerClick className="w-3 h-3" />} />
                <Numero label="modifiche" valore={num(r.azioni)} icona={<PenLine className="w-3 h-3" />} />
              </button>

              {espansa && (
                <div className="border-t border-border px-3 py-3 space-y-3">
                  {r.sessioni.length === 0 ? (
                    <p className="text-2xs text-text-tertiary">
                      Nessuna sessione registrata. La misura parte da quando la funzione è stata attivata:
                      prima di allora non c&apos;è un silenzio, c&apos;è un&apos;assenza di dati.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-2xs">
                        <thead>
                          <tr className="text-text-tertiary text-left">
                            <th className="font-semibold pb-1.5 pr-3">Quando</th>
                            <th className="font-semibold pb-1.5 pr-3">Finestra</th>
                            <th className="font-semibold pb-1.5 pr-3 text-right">Attivo</th>
                            <th className="font-semibold pb-1.5 pr-3 text-right">Durata</th>
                            <th className="font-semibold pb-1.5 pr-3 text-right">Interazioni</th>
                            <th className="font-semibold pb-1.5 pr-3">Dove</th>
                          </tr>
                        </thead>
                        <tbody className="text-text-secondary">
                          {r.sessioni.map(s => (
                            <tr key={s.id} className="border-t border-border">
                              <td className="py-1.5 pr-3 text-text-primary whitespace-nowrap">{FMT_GIORNO.format(new Date(s.inizio))}</td>
                              <td className="py-1.5 pr-3 whitespace-nowrap">{FMT_ORA.format(new Date(s.inizio))}–{FMT_ORA.format(new Date(s.fine))}</td>
                              <td className="py-1.5 pr-3 text-right text-text-primary font-semibold tabular-nums">{durataTesto(s.attivoMs)}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{durataTesto(s.durataMs)}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{num(s.interazioni)}</td>
                              <td className="py-1.5 pr-3 truncate max-w-[220px]">
                                {PORTALE_LABEL[s.portale] ?? s.portale}{s.sezione ? ` · ${s.sezione}` : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-text-tertiary">
                    {r.sezioniTop.length > 0 && (
                      <span>
                        Dove passa il tempo:{' '}
                        {r.sezioniTop.map(s => `${s.sezione} (${durataTesto(s.battiti * 60_000)})`).join(' · ')}
                      </span>
                    )}
                    <span>
                      Ultima modifica ai dati:{' '}
                      {r.ultimaAzione
                        ? `${FMT_GIORNO.format(new Date(r.ultimaAzione))} ${FMT_ORA.format(new Date(r.ultimaAzione))}`
                        : `nessuna negli ultimi ${giorni} giorni`}
                    </span>
                    <span>{r.sessioniFinestra} sessioni in {giorni} giorni</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-2xs text-text-tertiary">
        Le persone del portale cliente non compaiono: il battito non è montato là, e una riga
        «mai entrato» su qualcuno che non stiamo misurando sarebbe uno zero che sembra un dato.
      </p>
    </div>
  )
}

function Stato({ stato }: { stato: PersonaUtilizzo['stato'] }) {
  const colore = stato === 'online' ? 'bg-success' : stato === 'offline' ? 'bg-border-strong' : 'bg-warning'
  const titolo = stato === 'online' ? 'Online adesso' : stato === 'offline' ? 'Non collegato' : 'Mai entrato'
  return <span role="img" aria-label={titolo} title={titolo} className={`w-2 h-2 rounded-full shrink-0 ${colore}`} />
}

function Numero({ label, valore, icona }: { label: string; valore: string; icona?: React.ReactNode }) {
  return (
    <div className="hidden md:block w-24 shrink-0 text-right">
      <p className="text-xs font-semibold text-text-primary tabular-nums">{valore}</p>
      <p className="flex items-center justify-end gap-1 text-2xs text-text-tertiary">{icona}{label}</p>
    </div>
  )
}

function Tile({ label, value, hint, active, onClick }: {
  label: string; value: number; hint?: string; active?: boolean; onClick?: () => void
}) {
  const classi = `bg-surface border rounded-xl px-3 py-2.5 text-left transition-colors ${
    active ? 'border-gold/40 bg-gold-dim' : 'border-border'} ${onClick ? 'hover:border-border-strong' : ''}`
  const dentro = (
    <>
      <p className={`text-lg font-black tabular-nums ${active ? 'text-gold-text' : 'text-text-primary'}`}>{num(value)}</p>
      <p className="text-2xs font-semibold text-text-secondary uppercase tracking-wider">{label}</p>
      {hint && <p className="text-2xs text-text-tertiary">{hint}</p>}
    </>
  )
  return onClick
    ? <button onClick={onClick} className={classi}>{dentro}</button>
    : <div className={classi}>{dentro}</div>
}

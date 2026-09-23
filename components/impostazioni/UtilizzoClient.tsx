'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, ChevronDown, ChevronRight, Search, ArrowUpDown, AlertTriangle } from 'lucide-react'
import {
  durataTesto, etichettaStato, ONLINE_MS, GAP_SESSIONE_MIN, SESSIONI_MOSTRATE,
  type PersonaUtilizzo,
} from '@/lib/presenza'
import { ROLE_LABELS } from '@/lib/permissions'
import { Avatar } from '@/components/shared/formkit'
import { EmptyState } from '@/components/shared/EmptyState'
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
  /** Quando è cominciata la misura: `null` se non c'è ancora nessuna sessione. */
  misuraDa: string | null
  /** Quanti giorni conserva la cronologia. 0 = non cancella mai. */
  retentionGiorni: number
  /** La finestra scelta scavalca un periodo in cui la cronologia non vedeva tutto. */
  modificheParziali: boolean
}

const FMT_GIORNO = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Rome' })
const FMT_DATA = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' })
const FMT_ORA = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
const num = (n: number) => n.toLocaleString('it-IT')
const MINUTI_ONLINE = Math.round(ONLINE_MS / 60_000)

const PORTALE_LABEL: Record<string, string> = {
  admin: 'Portale Admin', workspace: 'Workspace', portale: 'Portale cliente',
  risorsa: 'Risorsa esterna', altro: 'Altrove',
}

type Filtro = 'tutti' | 'online' | 'assenti' | 'mai'
type Campo = 'presenza' | 'nome' | 'tempo' | 'interazioni' | 'modifiche'

const FILTRI: [Filtro, string][] = [
  ['tutti', 'Tutti'], ['online', 'Online'], ['assenti', 'Assenti da 7+ giorni'], ['mai', 'Senza sessioni'],
]

const PESO_STATO = { online: 0, offline: 1, mai: 2 } as const

/* Ogni colonna ordina nel verso in cui la si guarda: i nomi dalla A, i numeri
   dal più grande, la presenza da chi c'è. Un default alfabetico su una colonna
   di minuti è un click sprecato ogni volta. */
const ORDINAMENTI: Record<Campo, { cmp: (a: RigaUtilizzo, b: RigaUtilizzo) => number; discendente: boolean }> = {
  presenza: {
    discendente: false,
    cmp: (a, b) => PESO_STATO[a.stato] - PESO_STATO[b.stato]
      || (a.assenteMs ?? Number.MAX_SAFE_INTEGER) - (b.assenteMs ?? Number.MAX_SAFE_INTEGER),
  },
  nome: { discendente: false, cmp: (a, b) => a.nome.localeCompare(b.nome, 'it') },
  tempo: { discendente: true, cmp: (a, b) => a.attivoFinestraMs - b.attivoFinestraMs },
  interazioni: { discendente: true, cmp: (a, b) => a.interazioniFinestra - b.interazioniFinestra },
  modifiche: { discendente: true, cmp: (a, b) => a.azioni - b.azioni },
}

export function UtilizzoClient({ righe, giorni, opzioniGiorni, misuraDa, retentionGiorni, modificheParziali }: Props) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('tutti')
  const [aperta, setAperta] = useState<string | null>(null)
  const [campo, setCampo] = useState<Campo>('presenza')
  const [discendente, setDiscendente] = useState(false)

  const stats = useMemo(() => ({
    online: righe.filter(r => r.stato === 'online').length,
    attivi: righe.filter(r => r.attivoFinestraMs > 0).length,
    tempo: righe.reduce((n, r) => n + r.attivoFinestraMs, 0),
    mai: righe.filter(r => r.stato === 'mai').length,
  }), [righe])

  const maiNessuno = stats.mai === righe.length && righe.length > 0

  const visibili = useMemo(() => {
    const testo = q.trim().toLowerCase()
    const { cmp } = ORDINAMENTI[campo]
    return righe
      .filter(r => {
        if (testo && !`${r.nome} ${r.email} ${ROLE_LABELS[r.ruolo] ?? ''}`.toLowerCase().includes(testo)) return false
        if (filtro === 'online') return r.stato === 'online'
        if (filtro === 'mai') return r.stato === 'mai'
        if (filtro === 'assenti') return r.assenteMs !== null && r.assenteMs > 7 * 86_400_000
        return true
      })
      .sort((a, b) => (discendente ? -cmp(a, b) : cmp(a, b)) || a.nome.localeCompare(b.nome, 'it'))
  }, [righe, q, filtro, campo, discendente])

  /* Le barre sono proporzionali al massimo di tutta la pagina: normalizzarle per
     riga farebbe sembrare uguali dieci minuti e tre ore. */
  const maxSessione = useMemo(
    () => Math.max(1, ...righe.flatMap(r => r.sessioni.map(s => s.attivoMs))), [righe])
  const maxTempo = useMemo(
    () => Math.max(1, ...righe.map(r => r.attivoFinestraMs)), [righe])

  const ordina = (c: Campo) => {
    if (c === campo) { setDiscendente(v => !v); return }
    setCampo(c)
    setDiscendente(ORDINAMENTI[c].discendente)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-gold-dim flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-gold-text" />
          </span>
          <div>
            <h1 className="text-xl font-black text-text-primary font-heading">Utilizzo del tool</h1>
            <p className="text-xs text-text-secondary">
              Chi è dentro adesso, da quanto manca chi non c&apos;è, e quanto ha lavorato davvero.
            </p>
          </div>
        </div>
        <nav aria-label="Periodo" className="flex border border-border rounded-xl overflow-hidden shrink-0">
          {opzioniGiorni.map(g => (
            <Link key={g} href={`/impostazioni/utilizzo?giorni=${g}`} scroll={false}
              aria-current={g === giorni ? 'page' : undefined}
              className={`px-3 py-2 text-xs font-semibold transition-colors ${
                g === giorni ? 'bg-gold-dim text-gold-text' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}>
              {g} giorni
            </Link>
          ))}
        </nav>
      </header>

      {/* La provenienza sta in alto e non in una nota a piè di pagina: sono due
          fonti con due orizzonti diversi, e una colonna a zero si legge in un
          modo o nell'altro a seconda di quale dei due si sta guardando. */}
      <p className="text-2xs text-text-tertiary">
        Il tempo si misura {misuraDa ? <>dal <strong className="text-text-secondary font-semibold">{FMT_DATA.format(new Date(misuraDa))}</strong></> : <strong className="text-text-secondary font-semibold">da adesso</strong>}.
        {' '}Le modifiche arrivano dalla cronologia, che conserva {retentionGiorni > 0 ? `${retentionGiorni} giorni` : 'tutto'}.
      </p>

      {modificheParziali && (
        <p className="flex items-start gap-2 text-2xs text-warning bg-warning-dim border border-warning/30 rounded-xl px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            In questa finestra le <strong className="font-semibold">modifiche sono incomplete</strong>: fino al 23 settembre 2026
            le task, i progetti e le tappe non arrivavano in cronologia — i trigger erano andati persi
            nella ricostruzione del dominio progetti. Dove il conteggio non ha sotto una fonte,
            la colonna dice <strong className="font-semibold">n/d</strong> invece di zero.
          </span>
        </p>
      )}

      {/* La spiegazione sta chiusa: serve una volta, e lasciarla aperta in cima
          ruba lo spazio ai numeri che si viene a leggere tutti i giorni. */}
      <details className="group bg-surface border border-border rounded-xl">
        <summary className="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-text-secondary cursor-pointer select-none hover:text-text-primary">
          <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
          Come si conta il tempo
        </summary>
        <ul className="px-3 pb-3 pt-0.5 space-y-1.5 text-xs text-text-secondary list-disc list-inside marker:text-text-tertiary">
          <li>Un minuto conta solo se c&apos;è stata un&apos;<strong className="text-text-primary font-semibold">interazione</strong>: click, tasto, rotella, cambio di pagina — e a scheda in primo piano. Una scheda aperta e ferma non fa tempo.</li>
          <li>Dopo {GAP_SESSIONE_MIN} minuti senza interazioni la sessione si chiude; la successiva riparte da capo.</li>
          <li><strong className="text-text-primary font-semibold">Online</strong> vuol dire che ha toccato qualcosa negli ultimi {MINUTI_ONLINE} minuti.</li>
          <li><strong className="text-text-primary font-semibold">Modifiche</strong> sono le righe cambiate nei dati. Tempo e modifiche rispondono a due domande diverse: si può consultare per un&apos;ora senza toccare niente.</li>
          <li>Le <strong className="text-text-primary font-semibold">modifiche</strong> vengono dalla cronologia, che si conserva a finestra: oltre quella non c&apos;è «zero modifiche», non c&apos;è niente — e la colonna lo scrive.</li>
          <li>Gli accessi al portale cliente non sono misurati.</li>
        </ul>
      </details>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Tile label="Online adesso" valore={num(stats.online)} nota={`ultimi ${MINUTI_ONLINE} minuti`}
          attivo={filtro === 'online'} onClick={() => setFiltro(filtro === 'online' ? 'tutti' : 'online')} />
        <Tile label="Attivi nel periodo" valore={`${stats.attivi}/${righe.length}`} nota={`in ${giorni} giorni`} />
        <Tile label="Tempo attivo" valore={durataTesto(stats.tempo)} nota="somma di tutti" />
        <Tile label="Senza sessioni" valore={num(stats.mai)} nota="da quando si misura"
          attivo={filtro === 'mai'} onClick={() => setFiltro(filtro === 'mai' ? 'tutti' : 'mai')} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca una persona…" aria-label="Cerca una persona"
            className="w-full bg-surface border border-border-interactive rounded-lg pl-8 pr-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/40" />
        </div>
        <div className="flex border border-border rounded-lg overflow-hidden">
          {FILTRI.map(([k, label]) => (
            <button key={k} onClick={() => setFiltro(k)} aria-pressed={filtro === k}
              className={`px-2.5 py-2 text-2xs font-semibold transition-colors ${
                filtro === k ? 'bg-gold-dim text-gold-text' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {maiNessuno ? (
        <div className="bg-surface border border-border rounded-2xl">
          <EmptyState
            icon={<Activity className="w-5 h-5" />}
            title="Nessuna sessione registrata"
            description="La misura parte da quando il tool ha iniziato a contare le interazioni: prima di quel momento non c'è un silenzio, non ci sono dati. Le righe si riempiono man mano che le persone lavorano."
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-xs border-collapse">
              <thead>
                <tr className="bg-surface-hover">
                  <Th campo="nome" attuale={campo} discendente={discendente} onSort={ordina}>Persona</Th>
                  <Th campo="presenza" attuale={campo} discendente={discendente} onSort={ordina}>Stato</Th>
                  <th scope="col" className="px-3 py-2.5 text-left text-2xs font-bold text-text-tertiary uppercase tracking-wider whitespace-nowrap">
                    Ultime {SESSIONI_MOSTRATE} sessioni
                  </th>
                  <Th campo="tempo" attuale={campo} discendente={discendente} onSort={ordina} destra>Tempo attivo</Th>
                  <Th campo="interazioni" attuale={campo} discendente={discendente} onSort={ordina} destra>Interazioni</Th>
                  <Th campo="modifiche" attuale={campo} discendente={discendente} onSort={ordina} destra>Modifiche</Th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {visibili.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-xs text-text-tertiary">
                    Nessuna persona con questi filtri.
                  </td></tr>
                )}
                {visibili.map(r => {
                  const espansa = aperta === r.profileId
                  const stato = etichettaStato(r.stato, r.assenteMs, misuraDa !== null)
                  const soloLettura = r.attivoFinestraMs > 0 && r.azioni === 0 && !modificheParziali
                  return [
                    <tr key={r.profileId}
                      onClick={() => setAperta(espansa ? null : r.profileId)}
                      className={`border-t border-border cursor-pointer transition-colors ${espansa ? 'bg-surface-hover' : 'hover:bg-surface-hover'}`}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={r.nome} url={r.avatar} size={30} />
                          <div className="min-w-0">
                            <p className="font-semibold text-text-primary truncate flex items-center gap-1.5">
                              {r.nome}
                              {!r.attivo && <Badge tono="spento">disattivato</Badge>}
                            </p>
                            <p className="text-2xs text-text-tertiary truncate">{ROLE_LABELS[r.ruolo] ?? r.ruolo}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <Punto stato={r.stato} />
                          <span className={
                            stato.tono === 'online' ? 'font-semibold text-success'
                              : stato.tono === 'senza' ? 'text-text-tertiary' : 'text-text-secondary'}>
                            {stato.testo}
                          </span>
                        </span>
                      </td>

                      <td className="px-3 py-2.5">
                        <Barre sessioni={r.sessioni} massimo={maxSessione} />
                      </td>

                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span className="font-semibold text-text-primary tabular-nums">{durataTesto(r.attivoFinestraMs)}</span>
                        <span className="block mt-1 h-1 rounded-full bg-surface-active overflow-hidden" aria-hidden>
                          <span className="block h-full bg-gold rounded-full"
                            style={{ width: `${Math.round((r.attivoFinestraMs / maxTempo) * 100)}%` }} />
                        </span>
                      </td>

                      <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary whitespace-nowrap">
                        {r.interazioniFinestra > 0 ? num(r.interazioniFinestra) : <span className="text-text-tertiary">—</span>}
                      </td>

                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {r.azioni > 0
                          ? <span className="tabular-nums text-text-secondary">
                              {num(r.azioni)}{modificheParziali && <span className="text-warning" title="conteggio parziale: vedi l'avviso in cima">*</span>}
                            </span>
                          : modificheParziali
                            ? <span className="text-text-tertiary" title="In questa finestra la cronologia non registrava task, progetti e tappe: questo numero non esiste, non è zero.">n/d</span>
                            : soloLettura
                              ? <Badge tono="neutro">solo lettura</Badge>
                              : <span className="text-text-tertiary">—</span>}
                      </td>

                      <td className="px-3 py-2.5 text-text-tertiary">
                        {espansa ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </td>
                    </tr>,

                    espansa ? (
                      <tr key={`${r.profileId}-dettaglio`} className="border-t border-border bg-background">
                        <td colSpan={7} className="px-3 py-3">
                          <Dettaglio riga={r} giorni={giorni} massimo={maxSessione} />
                        </td>
                      </tr>
                    ) : null,
                  ]
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── */

function Dettaglio({ riga, giorni, massimo }: { riga: RigaUtilizzo; giorni: number; massimo: number }) {
  if (riga.sessioni.length === 0) {
    return <p className="text-2xs text-text-tertiary py-2">Nessuna sessione registrata per questa persona.</p>
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {riga.sessioni.map(s => (
          <li key={s.id} className="flex items-center gap-3 flex-wrap text-2xs">
            <span className="w-28 shrink-0 text-text-primary font-semibold">{FMT_GIORNO.format(new Date(s.inizio))}</span>
            <span className="w-24 shrink-0 text-text-secondary tabular-nums">
              {FMT_ORA.format(new Date(s.inizio))}–{FMT_ORA.format(new Date(s.fine))}
            </span>
            <span className="w-24 shrink-0 h-1.5 rounded-full bg-surface-active overflow-hidden" aria-hidden>
              <span className="block h-full bg-gold rounded-full" style={{ width: `${Math.max(4, (s.attivoMs / massimo) * 100)}%` }} />
            </span>
            <span className="w-32 shrink-0 text-text-primary">
              <strong className="font-semibold">{durataTesto(s.attivoMs)}</strong>
              <span className="text-text-tertiary"> su {durataTesto(s.durataMs)}</span>
            </span>
            <span className="w-28 shrink-0 text-text-secondary tabular-nums">{num(s.interazioni)} interazioni</span>
            <span className="text-text-tertiary truncate">
              {PORTALE_LABEL[s.portale] ?? s.portale}{s.sezione ? ` · ${s.sezione}` : ''}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t border-border text-2xs text-text-tertiary">
        {riga.sezioniTop.length > 0 && (
          <span className="flex items-center gap-1.5">
            Dove passa il tempo:
            {riga.sezioniTop.map(s => (
              <span key={s.sezione} className="px-1.5 py-0.5 rounded bg-surface-hover text-text-secondary">
                {s.sezione} {durataTesto(s.battiti * 60_000)}
              </span>
            ))}
          </span>
        )}
        <span>{riga.sessioniFinestra} sessioni in {giorni} giorni</span>
        <span>
          Ultima modifica:{' '}
          {riga.ultimaAzione
            ? `${FMT_GIORNO.format(new Date(riga.ultimaAzione))}, ${FMT_ORA.format(new Date(riga.ultimaAzione))}`
            : 'nessuna nel periodo'}
        </span>
      </div>
    </div>
  )
}

function Barre({ sessioni, massimo }: { sessioni: RigaUtilizzo['sessioni']; massimo: number }) {
  if (sessioni.length === 0) {
    return <span className="block w-24 border-b border-dashed border-border-strong" aria-label="nessuna sessione" />
  }
  return (
    /* La più recente a destra: si legge come una riga del tempo, non come una
       classifica. Il titolo serve al mouse, il riassunto accanto a chi non ce
       l'ha — su una barra alta otto pixel il numero non si legge comunque. */
    <span className="flex items-center gap-2">
      <span className="flex items-end gap-1 h-7 w-24 shrink-0">
        {[...sessioni].reverse().map(s => (
          <span key={s.id} title={`${durataTesto(s.attivoMs)} attivi`}
            className="flex-1 bg-gold/70 rounded-sm min-h-[4px]"
            style={{ height: `${Math.max(10, (s.attivoMs / massimo) * 100)}%` }} />
        ))}
      </span>
      <span className="text-2xs text-text-tertiary whitespace-nowrap">
        {durataTesto(sessioni.reduce((n, s) => n + s.attivoMs, 0))}
      </span>
    </span>
  )
}

function Th({
  children, campo, attuale, discendente, onSort, destra,
}: {
  children: React.ReactNode; campo: Campo; attuale: Campo
  discendente: boolean; onSort: (c: Campo) => void; destra?: boolean
}) {
  const attivo = campo === attuale
  return (
    <th scope="col" aria-sort={attivo ? (discendente ? 'descending' : 'ascending') : 'none'}
      className="px-3 py-2.5 text-2xs font-bold uppercase tracking-wider whitespace-nowrap">
      <button onClick={() => onSort(campo)}
        className={`flex items-center gap-1 ${destra ? 'ml-auto' : ''} ${attivo ? 'text-gold-text' : 'text-text-tertiary hover:text-text-secondary'} transition-colors`}>
        {children}
        <ArrowUpDown className={`w-3 h-3 ${attivo ? 'opacity-100' : 'opacity-40'}`} />
      </button>
    </th>
  )
}

function Punto({ stato }: { stato: PersonaUtilizzo['stato'] }) {
  /* Chi non ha sessioni non è un allarme — è un cerchio vuoto: non sappiamo,
     non «va male». Il giallo qui accusava qualcuno di non aver lavorato in un
     periodo in cui nessuno lo stava guardando. */
  const tono = stato === 'online' ? 'bg-success ring-2 ring-success/25'
    : stato === 'offline' ? 'bg-border-strong' : 'border border-border-strong'
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tono}`} aria-hidden />
}

function Badge({ children, tono }: { children: React.ReactNode; tono: 'neutro' | 'spento' }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-2xs font-semibold whitespace-nowrap ${
      tono === 'neutro' ? 'bg-surface-active text-text-secondary' : 'bg-surface-hover text-text-tertiary'}`}>
      {children}
    </span>
  )
}

function Tile({ label, valore, nota, attivo, onClick }: {
  label: string; valore: string; nota?: string; attivo?: boolean; onClick?: () => void
}) {
  const classi = `block w-full text-left bg-surface border rounded-xl px-3 py-3 transition-colors ${
    attivo ? 'border-gold/40 bg-gold-dim' : 'border-border'} ${onClick ? 'hover:border-border-strong' : ''}`
  const dentro = (
    <>
      <p className="text-2xs font-bold text-text-tertiary uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-black tabular-nums mt-0.5 ${attivo ? 'text-gold-text' : 'text-text-primary'}`}>{valore}</p>
      {nota && <p className="text-2xs text-text-tertiary">{nota}</p>}
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={attivo} className={classi}>{dentro}</button>
    : <div className={classi}>{dentro}</div>
}

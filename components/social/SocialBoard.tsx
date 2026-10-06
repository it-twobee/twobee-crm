'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, List, Loader2, Plus } from 'lucide-react'
import {
  CANALI, FORMATI, STATI, CANALI_ELENCO, STATI_ELENCO, dataBreve, dirittiSocial, etichettaMese, intervalloGriglia,
  inRitardo, isCanale, isFormato, isStato, meseDi, meseDopo, raggruppaPerGiorno, riepilogo, soloMieiDiPartenza,
  suggerisciMilestone, ordinaContenuti,
} from '@/lib/social'
import { nomeFestivo, isWeekend } from '@/lib/calendario-lavorativo'
import { ricorrenzaMarketing } from '@/lib/date-marketing'
import { MS_STATUS_LABEL, progettoBreve, type MilestoneStatus } from '@/lib/task-board'
import type { SocialBoardData, SocialContentRow } from '@/lib/social-types'
import { SocialContentDrawer, type DrawerState } from './SocialContentDrawer'

export type SocialViewer = { id: string; governa: boolean; lettore: boolean }

const SETTIMANA = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

/* §467 — La panoramica social: i progetti, il calendario del mese e l'elenco
   del PED. La stessa per il portale admin, il workspace e la scheda cliente:
   cambia solo chi la monta e da dove arrivano i dati. */
export function SocialBoard({ data, me, fixedClientId = null, onMese, onChanged, loading = false }: {
  data: SocialBoardData
  me: SocialViewer
  /** Nella scheda cliente: un'azienda sola, senza filtro cliente. */
  fixedClientId?: string | null
  onMese: (mese: string) => void
  onChanged: () => void
  loading?: boolean
}) {
  const [vista, setVista] = useState<'mese' | 'elenco'>('mese')
  const [cliente, setCliente] = useState(fixedClientId ?? '')
  const [canale, setCanale] = useState('')
  const [stato, setStato] = useState('')
  const [soloMiei, setSoloMiei] = useState(() => !fixedClientId && soloMieiDiPartenza(data.mieiIds.length))
  const [drawer, setDrawer] = useState<DrawerState | null>(null)

  const miei = useMemo(() => new Set(data.mieiIds), [data.mieiIds])
  const scoperti = useMemo(() => new Set(data.scopertiIds), [data.scopertiIds])
  const clienti = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of data.projects) m.set(p.client_id, p.client_name ?? 'Cliente')
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'it'))
  }, [data.projects])

  const progetti = data.projects.filter(p =>
    (!cliente || p.client_id === cliente) && (!soloMiei || miei.has(p.id)))
  const visibili = new Set(progetti.map(p => p.id))
  const contenuti = ordinaContenuti(data.contents.filter(c =>
    visibili.has(c.project_id)
    && (!canale || c.channels.includes(canale))
    && (!stato || c.status === stato)))
  const delMese = contenuti.filter(c => meseDi(c.planned_date) === data.mese)
  const progettoDi = new Map(data.projects.map(p => [p.id, p]))
  const persona = new Map(data.staff.map(s => [s.id, s.full_name]))
  const puoCreare = dirittiSocial({ governa: me.governa && !me.lettore, userId: me.id }).crea && progetti.length > 0

  const apri = (c: SocialContentRow) => setDrawer({ id: c.id })
  const nuovo = (giorno?: string) => setDrawer({
    nuovo: true, giorno: giorno ?? (meseDi(data.oggi) === data.mese ? data.oggi : `${data.mese}-01`),
    projectId: progetti.length === 1 ? progetti[0].id : null,
  })

  return (
    <div className="space-y-4">
      {/* Testata: mese, vista, filtri */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => onMese(meseDopo(data.mese, -1))} aria-label="Mese precedente"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover"><ChevronLeft className="h-4 w-4" /></button>
          <h2 className="min-w-[10rem] text-center font-heading text-lg font-semibold capitalize text-text-primary" aria-live="polite">
            {etichettaMese(data.mese)}
          </h2>
          <button onClick={() => onMese(meseDopo(data.mese))} aria-label="Mese successivo"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover"><ChevronRight className="h-4 w-4" /></button>
          {meseDi(data.oggi) !== data.mese && (
            <button onClick={() => onMese(meseDi(data.oggi))} className="ml-1 rounded-lg border border-border-interactive px-3 py-1.5 text-2xs font-semibold text-text-secondary hover:bg-surface-hover">Oggi</button>
          )}
          {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin text-text-tertiary" aria-label="Caricamento" />}
        </div>

        <div role="radiogroup" aria-label="Vista" className="flex rounded-xl bg-surface-active p-0.5">
          {([['mese', 'Mese', CalendarDays], ['elenco', 'Elenco PED', List]] as const).map(([v, label, Icon]) => (
            <button key={v} role="radio" aria-checked={vista === v} onClick={() => setVista(v)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-2xs font-semibold ${vista === v ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary hover:text-text-primary'}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {!fixedClientId && (
            <select aria-label="Cliente" value={cliente} onChange={e => setCliente(e.target.value)}
              className="min-h-10 rounded-lg border border-border-interactive bg-surface px-3 text-2xs text-text-primary">
              <option value="">Tutti i clienti</option>
              {clienti.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          )}
          <select aria-label="Canale" value={canale} onChange={e => setCanale(e.target.value)}
            className="min-h-10 rounded-lg border border-border-interactive bg-surface px-3 text-2xs text-text-primary">
            <option value="">Tutti i canali</option>
            {CANALI_ELENCO.map(c => <option key={c} value={c}>{CANALI[c].label}</option>)}
          </select>
          <select aria-label="Stato" value={stato} onChange={e => setStato(e.target.value)}
            className="min-h-10 rounded-lg border border-border-interactive bg-surface px-3 text-2xs text-text-primary">
            <option value="">Tutti gli stati</option>
            {STATI_ELENCO.map(s => <option key={s} value={s}>{STATI[s].label}</option>)}
          </select>
          {!fixedClientId && data.mieiIds.length > 0 && (
            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border-interactive px-3 text-2xs font-semibold text-text-secondary">
              <input type="checkbox" checked={soloMiei} onChange={e => setSoloMiei(e.target.checked)} className="accent-gold" />
              Solo i miei
            </label>
          )}
          {puoCreare && (
            <button onClick={() => nuovo()} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-gold px-4 text-sm font-semibold text-on-gold press btn-gold">
              <Plus className="h-4 w-4" aria-hidden="true" />Nuovo contenuto
            </button>
          )}
        </div>
      </div>

      {data.errore && <p role="alert" className="rounded-lg bg-error-dim px-4 py-3 text-sm text-error">{data.errore}</p>}
      {data.parziale && <p className="rounded-lg bg-warning-dim px-4 py-3 text-sm text-warning">Il mese ha più contenuti di quelli caricati: l’elenco è parziale.</p>}

      {data.projects.length === 0 && !data.errore ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">
            {fixedClientId ? 'Questo cliente non ha progetti social.' : 'Nessun progetto social attivo.'}
          </p>
          <p className="mt-1 text-2xs text-text-tertiary">Un progetto è social quando il suo servizio è «Social Media Management».</p>
        </div>
      ) : (
        <>
          <ProgettiStrip progetti={progetti} data={data} scoperti={scoperti} fixed={!!fixedClientId}
            persona={persona} onFiltra={id => !fixedClientId && setCliente(id)} />

          {vista === 'mese'
            ? <Griglia data={data} contenuti={contenuti} progettoDi={progettoDi} fixed={!!fixedClientId}
                onApri={apri} onNuovo={puoCreare ? nuovo : undefined} />
            : <Elenco contenuti={delMese} progettoDi={progettoDi} persona={persona} oggi={data.oggi}
                fixed={!!fixedClientId} onApri={apri} />}
        </>
      )}

      {drawer && (
        <SocialContentDrawer state={drawer} data={data} me={me} progetti={progetti.length ? progetti : data.projects}
          onClose={() => setDrawer(null)}
          onSaved={(id, giorno) => {
            if (giorno && meseDi(giorno) !== data.mese) onMese(meseDi(giorno))
            else onChanged()
            setDrawer({ id, creato: true })
          }}
          onDeleted={() => { setDrawer(null); onChanged() }}
          onChanged={onChanged} />
      )}
    </div>
  )
}

function Chip({ c, cliente, onClick }: { c: SocialContentRow; cliente?: string | null; onClick: () => void }) {
  const s = isStato(c.status) ? STATI[c.status] : STATI.bozza
  const sigle = c.channels.filter(isCanale).map(ch => CANALI[ch].sigla).join(' · ')
  const formato = isFormato(c.format) ? FORMATI[c.format] : c.format
  return (
    <button onClick={onClick} title={`${c.title} — ${s.label}`}
      aria-label={`${c.planned_time ?? ''} ${cliente ?? ''} ${formato} ${c.title}, ${s.label}`.trim()}
      className={`block w-full rounded-md px-1.5 py-1 text-left text-2xs leading-tight ${s.bg} hover:ring-1 hover:ring-border-strong ${c.status === 'annullato' ? 'line-through opacity-70' : ''}`}>
      <span className={`block truncate font-semibold ${s.text}`}>
        {c.planned_time && <span className="mr-1 tabular-nums">{c.planned_time}</span>}{cliente ?? c.title}
      </span>
      <span className="block truncate text-text-secondary">{cliente ? `${formato} · ${c.title}` : formato} <span className="text-text-tertiary">{sigle}</span></span>
    </button>
  )
}

const MAX_CHIP = 3

function Griglia({ data, contenuti, progettoDi, fixed, onApri, onNuovo }: {
  data: SocialBoardData
  contenuti: SocialContentRow[]
  progettoDi: Map<string, SocialBoardData['projects'][number]>
  fixed: boolean
  onApri: (c: SocialContentRow) => void
  onNuovo?: (giorno: string) => void
}) {
  const { giorni } = intervalloGriglia(data.mese)
  const perGiorno = raggruppaPerGiorno(contenuti)
  const [aperto, setAperto] = useState<string | null>(null)
  const nomeCliente = (c: SocialContentRow) => fixed ? null : progettoDi.get(c.project_id)?.client_name ?? null
  const delMese = giorni.filter(g => meseDi(g) === data.mese)

  return (
    <>
      {/* Schermi larghi: la griglia del mese */}
      <div className="hidden overflow-x-auto sm:block">
        <div className="grid min-w-[52rem] grid-cols-7 overflow-hidden rounded-xl border border-border">
          {SETTIMANA.map(g => <div key={g} className="border-b border-border bg-surface px-2 py-1.5 text-2xs font-semibold text-text-tertiary">{g}</div>)}
          {giorni.map((g, i) => {
            const fuori = meseDi(g) !== data.mese
            const festa = nomeFestivo(g)
            const mkt = ricorrenzaMarketing(g)
            const voci = perGiorno.get(g) ?? []
            const tutte = aperto === g
            const fondo = festa ? 'bg-cal-festivo' : isWeekend(g) ? 'bg-cal-fermo' : mkt ? 'bg-cal-marketing' : 'bg-background'
            return (
              <div key={g} className={`group min-h-[7.5rem] border-border p-1.5 ${i % 7 ? 'border-l' : ''} ${i >= 7 ? 'border-t' : ''} ${fondo} ${fuori ? 'opacity-50' : ''}`}>
                <div className="mb-1 flex items-center gap-1">
                  <span className={`text-2xs tabular-nums ${g === data.oggi ? 'rounded-full bg-gold px-1.5 font-bold text-on-gold' : 'font-semibold text-text-secondary'}`}>
                    {Number(g.slice(8))}
                  </span>
                  {(festa || mkt) && <span className="truncate text-2xs text-text-tertiary" title={mkt ? `${mkt.nome} — ${mkt.nota}` : festa ?? ''}>{festa ?? mkt?.nome}</span>}
                  {onNuovo && !fuori && (
                    <button onClick={() => onNuovo(g)} aria-label={`Nuovo contenuto il ${dataBreve(g)}`}
                      className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary opacity-0 hover:bg-surface-hover hover:text-text-primary focus:opacity-100 group-hover:opacity-100">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {(tutte ? voci : voci.slice(0, MAX_CHIP)).map(c => <Chip key={c.id} c={c} cliente={nomeCliente(c)} onClick={() => onApri(c)} />)}
                  {voci.length > MAX_CHIP && (
                    <button onClick={() => setAperto(tutte ? null : g)} className="w-full rounded-md px-1.5 text-left text-2xs font-semibold text-text-secondary hover:bg-surface-hover">
                      {tutte ? 'Mostra meno' : `+${voci.length - MAX_CHIP} altri`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Telefono: l'agenda dei giorni che hanno qualcosa */}
      <div className="space-y-3 sm:hidden">
        {delMese.filter(g => perGiorno.has(g)).length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-2xs text-text-tertiary">Niente in calendario questo mese.</p>
        )}
        {delMese.filter(g => perGiorno.has(g)).map(g => (
          <section key={g} aria-label={dataBreve(g)}>
            <h3 className={`mb-1.5 text-2xs font-semibold capitalize ${g === data.oggi ? 'text-gold-text' : 'text-text-secondary'}`}>
              {dataBreve(g)}{nomeFestivo(g) ? ` · ${nomeFestivo(g)}` : ''}{ricorrenzaMarketing(g) ? ` · ${ricorrenzaMarketing(g)!.nome}` : ''}
            </h3>
            <div className="space-y-1.5">{perGiorno.get(g)!.map(c => <Chip key={c.id} c={c} cliente={nomeCliente(c)} onClick={() => onApri(c)} />)}</div>
          </section>
        ))}
        {onNuovo && (
          <button onClick={() => onNuovo(meseDi(data.oggi) === data.mese ? data.oggi : `${data.mese}-01`)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong py-3 text-sm font-semibold text-text-secondary">
            <Plus className="h-4 w-4" aria-hidden="true" />Nuovo contenuto
          </button>
        )}
      </div>
    </>
  )
}

function Elenco({ contenuti, progettoDi, persona, oggi, fixed, onApri }: {
  contenuti: SocialContentRow[]
  progettoDi: Map<string, SocialBoardData['projects'][number]>
  persona: Map<string, string>
  oggi: string
  fixed: boolean
  onApri: (c: SocialContentRow) => void
}) {
  if (!contenuti.length) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-2xs text-text-tertiary">Nessun contenuto in questo mese, con questi filtri.</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[48rem] text-left text-sm">
        <thead className="bg-surface text-2xs text-text-tertiary">
          <tr>
            <th className="px-3 py-2 font-semibold">Data</th>
            {!fixed && <th className="px-3 py-2 font-semibold">Cliente</th>}
            <th className="px-3 py-2 font-semibold">Canali</th>
            <th className="px-3 py-2 font-semibold">Formato</th>
            <th className="px-3 py-2 font-semibold">Tema</th>
            <th className="px-3 py-2 font-semibold">Creatività</th>
            <th className="px-3 py-2 font-semibold">Responsabile</th>
            <th className="px-3 py-2 font-semibold">Stato</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {contenuti.map(c => {
            const s = isStato(c.status) ? STATI[c.status] : STATI.bozza
            const p = progettoDi.get(c.project_id)
            return (
              <tr key={c.id} onClick={() => onApri(c)} className="cursor-pointer hover:bg-surface-hover">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  <button onClick={e => { e.stopPropagation(); onApri(c) }} className="text-left font-semibold capitalize text-text-primary hover:text-gold-text">
                    {dataBreve(c.planned_date)}{c.planned_time ? ` · ${c.planned_time}` : ''}
                  </button>
                  {inRitardo(c, oggi) && <span className="ml-2 text-2xs font-semibold text-error">in ritardo</span>}
                </td>
                {!fixed && <td className="max-w-[12rem] truncate px-3 py-2 text-text-secondary">{p?.client_name ?? '—'}</td>}
                <td className="whitespace-nowrap px-3 py-2 text-2xs text-text-secondary">{c.channels.filter(isCanale).map(ch => CANALI[ch].sigla).join(' · ')}</td>
                <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{isFormato(c.format) ? FORMATI[c.format] : c.format}</td>
                <td className="max-w-[18rem] px-3 py-2">
                  <span className="block truncate text-text-primary">{c.title}</span>
                  {c.caption && <span className="block truncate text-2xs text-text-tertiary">{c.caption}</span>}
                </td>
                <td className="px-3 py-2 text-2xs text-text-secondary">{c.media.length || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-2xs text-text-secondary">{(c.owner_id && persona.get(c.owner_id)) || '—'}</td>
                <td className="px-3 py-2"><span className={`rounded-md px-2 py-0.5 text-2xs font-semibold ${s.bg} ${s.text}`}>{s.label}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ProgettiStrip({ progetti, data, scoperti, fixed, persona, onFiltra }: {
  progetti: SocialBoardData['projects']
  data: SocialBoardData
  scoperti: Set<string>
  fixed: boolean
  persona: Map<string, string>
  onFiltra: (clientId: string) => void
}) {
  if (!progetti.length) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-2xs text-text-tertiary">Nessun progetto con questi filtri.</p>
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {progetti.map(p => {
        const delMese = data.contents.filter(c => c.project_id === p.id && meseDi(c.planned_date) === data.mese)
        const r = riepilogo(delMese, data.oggi)
        const ms = data.milestones.filter(m => m.project_id === p.id)
        const ped = ms.find(m => m.id === suggerisciMilestone(ms, data.mese))
        const nome = progettoBreve(p.name, p.client_name)
        return (
          <section key={p.id} aria-label={`${p.client_name ?? ''} ${nome}`} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {!fixed && (
                  <button onClick={() => onFiltra(p.client_id)} className="block max-w-full truncate text-left text-sm font-semibold text-text-primary hover:text-gold-text"
                    title="Mostra solo questo cliente">{p.client_name ?? 'Cliente'}</button>
                )}
                <p className={`truncate ${fixed ? 'text-sm font-semibold text-text-primary' : 'text-2xs text-text-tertiary'}`}>{nome}</p>
              </div>
              {p.manager_id && <span className="shrink-0 text-2xs text-text-tertiary">{persona.get(p.manager_id) ?? ''}</span>}
            </div>
            <p className="mt-2 text-2xs text-text-secondary">
              <span className="font-semibold text-text-primary">{r.totale}</span> nel mese
              {r.perStato.pronto + r.perStato.programmato > 0 && <> · {r.perStato.pronto + r.perStato.programmato} pronti</>}
              {r.perStato.pubblicato > 0 && <> · {r.perStato.pubblicato} pubblicati</>}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {r.inRitardo > 0 && <span className="rounded-md bg-error-dim px-2 py-0.5 text-2xs font-semibold text-error">{r.inRitardo} in ritardo</span>}
              {scoperti.has(p.id) && (
                <span className="flex items-center gap-1 rounded-md bg-warning-dim px-2 py-0.5 text-2xs font-semibold text-warning">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />Niente in uscita nei prossimi 7 giorni
                </span>
              )}
              {ped && (
                <span className="truncate rounded-md bg-surface-active px-2 py-0.5 text-2xs text-text-secondary" title={ped.title}>
                  {ped.title.replace(/^M\d+\s*·\s*/, '')} · {MS_STATUS_LABEL[ped.status as MilestoneStatus] ?? ped.status}
                </span>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

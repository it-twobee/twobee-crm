'use client'

/**
 * §346 — la fascia delle tappe, sopra l'elenco delle task.
 *
 * Una tappa non è una task e non si mescola alle task (il perché sta in
 * `lib/task-board.ts`), ma **è lavoro in scadenza di qualcuno** e finora non
 * compariva in nessuna lista: né nella sezione Task, né in «Le mie attività».
 * Qui sta in cima, contata e richiudibile, e ogni riga porta dove la tappa si
 * modifica davvero — la pagina della workstream.
 *
 * La riga **è** il link (§345): il bersaglio è tutta la riga con uno strato
 * invisibile, non il solo titolo, perché su un titolo corto sono quaranta pixel
 * su duecentosessanta e la risposta è «non è cliccabile». Lo strato, a
 * differenza di un `onClick`, lascia funzionare tasto centrale e «apri in una
 * nuova scheda».
 */

import { useState } from 'react'
import Link from 'next/link'
import { Flag, ChevronDown, Repeat, ShieldCheck } from 'lucide-react'
import { Avatar } from '@/components/shared/formkit'
import { MS_STATUS_LABEL, tappeCounts, type TappaRow } from '@/lib/task-board'

type Person = { id: string; full_name: string; avatar_url?: string | null }

const STATUS_TONE: Record<string, string> = {
  da_fare: 'text-text-tertiary', in_corso: 'text-info',
  in_approvazione: 'text-warning', completata: 'text-success',
}

const oggi = () => new Date().toISOString().slice(0, 10)
const quando = (iso: string) => {
  const d = Math.round((Date.parse(`${iso}T00:00:00`) - Date.parse(`${oggi()}T00:00:00`)) / 86400000)
  if (d < 0) return { text: `${-d}g fa`, tone: 'text-error' }
  if (d === 0) return { text: 'oggi', tone: 'text-warning' }
  if (d === 1) return { text: 'domani', tone: 'text-warning' }
  if (d <= 7) return { text: `tra ${d}g`, tone: 'text-warning' }
  return { text: iso.slice(5), tone: 'text-text-tertiary' }
}

export function MilestoneBand({
  rows, people = [], hrefOf, title = 'Tappe', hint, showOwner = true, showClient = true,
}: {
  rows: TappaRow[]
  people?: Person[]
  /** dove porta la riga: la workstream, che è dove la tappa si modifica */
  hrefOf: (r: TappaRow) => string
  title?: string
  hint?: string
  showOwner?: boolean
  showClient?: boolean
}) {
  const [chiusa, setChiusa] = useState(false)
  /* niente fascia vuota: un riquadro che dice «nessuna tappa» occupa lo spazio
     delle cose da fare per annunciare che non c'è niente da fare (§223) */
  if (!rows.length) return null

  const n = tappeCounts(rows)
  const chi = (id: string | null) => (id ? people.find(p => p.id === id) ?? null : null)

  return (
    <section>
      <button onClick={() => setChiusa(c => !c)} aria-expanded={!chiusa}
        className="w-full flex items-center gap-2 px-1 pb-2 text-left">
        <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${chiusa ? '-rotate-90' : ''}`} />
        <Flag className="w-3.5 h-3.5 text-gold-text shrink-0" />
        <span className="text-2xs font-bold uppercase tracking-wide text-text-secondary truncate">{title}</span>
        <span className="text-2xs text-text-tertiary tabular">{n.aperte}</span>
        {n.ritardo > 0 && (
          <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-error-dim text-error tabular">
            {n.ritardo} in ritardo
          </span>
        )}
        {/* §346 — una tappa senza responsabile non arriva a nessuno, esattamente
            come una regola ricorrente senza responsabile: si dichiara, non si
            lascia dedurre da un avatar mancante in fondo alla riga */}
        {showOwner && n.senzaResponsabile > 0 && (
          <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-warning-dim text-warning tabular">
            {n.senzaResponsabile} senza responsabile
          </span>
        )}
        {n.chiuse > 0 && <span className="text-2xs text-text-tertiary ml-auto shrink-0">{n.chiuse} consegnate</span>}
      </button>

      {!chiusa && (
        <div className="rounded-2xl border border-border shadow-soft overflow-hidden divide-y divide-border">
          {hint && (
            <p className="px-3 sm:px-4 py-2 text-2xs text-text-tertiary bg-surface-active/40">{hint}</p>
          )}
          {rows.map(r => {
            const p = chi(r.ownerId)
            const rel = r.dueDate && r.aperta ? quando(r.dueDate) : null
            return (
              <div key={r.id}
                className="relative flex items-center gap-2.5 px-3 sm:px-4 py-2.5 bg-surface hover:bg-surface-hover transition-colors">
                <Flag className={`w-3.5 h-3.5 shrink-0 ${r.ritardo ? 'text-error' : r.aperta ? 'text-info' : 'text-success'}`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Link href={hrefOf(r)} title="Apri la workstream"
                      className={`truncate text-sm after:absolute after:inset-0 hover:text-gold-text transition-colors ${
                        r.aperta ? 'text-text-primary' : 'text-text-tertiary'
                      }`}>{r.title}</Link>
                    {r.ricorrente && (
                      <Repeat className="w-3 h-3 text-success shrink-0 z-10" aria-label="Tappa ricorrente" />
                    )}
                    {r.approvazione && (
                      <ShieldCheck className="w-3 h-3 text-warning shrink-0 z-10" aria-label="Richiede approvazione" />
                    )}
                  </div>
                  <p className="text-2xs text-text-tertiary truncate">
                    {r.projectName}
                    {r.taskTotali > 0 && ` · ${r.taskAperte} task ${r.taskAperte === 1 ? 'aperta' : 'aperte'} su ${r.taskTotali}`}
                    {r.taskTotali === 0 && ' · nessuna task sotto'}
                  </p>
                </div>

                {showClient && r.clientName && (
                  <span className="hidden sm:block text-2xs text-text-tertiary shrink-0 truncate max-w-[140px]">{r.clientName}</span>
                )}

                {rel
                  ? <span className={`text-2xs tabular shrink-0 w-16 text-right ${rel.tone}`}>{rel.text}</span>
                  : <span className="text-2xs text-text-tertiary shrink-0 w-16 text-right">{r.aperta ? 'da datare' : ''}</span>}

                {showOwner && (p
                  ? <span title={p.full_name} className="shrink-0"><Avatar name={p.full_name} url={p.avatar_url} size={22} /></span>
                  : r.aperta && <span className="text-2xs text-warning shrink-0">non assegnata</span>)}

                <span className={`text-2xs font-semibold shrink-0 w-24 text-right ${STATUS_TONE[r.status] ?? 'text-text-tertiary'}`}>
                  {MS_STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

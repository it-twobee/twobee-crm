'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { KeyRound, Check, X, Clock, UserCheck } from 'lucide-react'
import { decideReportAccess } from '@/app/actions/report-access'
import { scopeLabel } from '@/lib/report-access'

export type AccessReq = {
  id: string
  name: string
  /** L'account del tool, se chi ha chiesto ne aveva uno: è la sola prova che c'è. */
  email: string | null
  scope: string
  status: 'pending' | 'approved' | 'denied'
  createdAt: string
  expiresAt: string | null
  openedN: number
}

const giorno = (iso: string) => new Date(iso).toLocaleDateString('it-IT',
  { day: 'numeric', month: 'long' })
const oraGiorno = (iso: string) => new Date(iso).toLocaleString('it-IT',
  { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/**
 * §344 — Le richieste di vedere il foglio dell'erogazione.
 *
 * Sta **qui**, accanto a «Erogato soci», perché è qui che il foglio si genera e
 * si manda: chi lo ha mandato è chi sa se quel nome è la persona giusta. In una
 * pagina di impostazioni la richiesta sarebbe arrivata a chi non può
 * riconoscerla.
 *
 * Il riquadro compare solo quando c'è qualcosa da decidere o un permesso
 * aperto: una sezione vuota fissa in cima al pannello insegna a saltarla.
 */
export function AccessRequests({ rows }: { rows: AccessReq[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (rows.length === 0) return null

  const daDecidere = rows.filter(r => r.status === 'pending')
  const aperti = rows.filter(r => r.status === 'approved')

  const decidi = (r: AccessReq, ok: boolean) => start(async () => {
    try {
      await decideReportAccess(r.id, ok)
      toast.success(ok
        ? `${r.name} può vedere i compensi di ${scopeLabel(r.scope)}`
        : `Richiesta di ${r.name} rifiutata`)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Non riuscito')
    }
  })

  return (
    <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <KeyRound className="w-4 h-4 text-gold-text" aria-hidden="true" />
        <h2 className="text-sm font-bold text-text-primary">Richieste di accesso al foglio</h2>
        {daDecidere.length > 0 && (
          <span className="text-2xs font-bold px-2 py-0.5 rounded-lg bg-warning-dim text-warning">
            {daDecidere.length} da decidere
          </span>
        )}
      </div>

      <ul className="divide-y divide-border/60">
        {[...daDecidere, ...aperti].map(r => (
          <li key={r.id} className="flex items-start gap-3 px-5 py-3.5 flex-wrap">
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-sm font-semibold text-text-primary truncate">{r.name}</p>
              <p className="text-2xs text-text-tertiary mt-0.5">
                Compensi di <strong className="text-text-secondary">{scopeLabel(r.scope)}</strong>
                {' · '}chiesto il {oraGiorno(r.createdAt)}
              </p>
              {/* Un nome scritto a mano e un account del tool non sono la stessa
                  prova: chi decide deve vedere quale delle due ha davanti. */}
              <p className="text-2xs text-text-tertiary mt-0.5 truncate">
                {r.email
                  ? <>Account del tool: <span className="text-text-secondary">{r.email}</span></>
                  : 'Senza account: il nome è quello che ha scritto chi ha chiesto'}
              </p>
            </div>

            {r.status === 'pending' ? (
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                <button onClick={() => decidi(r, false)} disabled={pending}
                  className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-error hover:bg-surface-hover press disabled:opacity-40">
                  <X className="w-3.5 h-3.5" aria-hidden="true" />Rifiuta
                </button>
                <button onClick={() => decidi(r, true)} disabled={pending}
                  title={`Apre solo i compensi di ${scopeLabel(r.scope)}, per quindici giorni`}
                  className="flex items-center gap-1.5 text-2xs font-bold bg-gold text-on-gold rounded-xl px-3 py-2 press disabled:opacity-40">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />Approva
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 shrink-0 ml-auto">
                <span className="text-2xs text-text-tertiary text-right">
                  <span className="flex items-center gap-1.5 text-success font-semibold">
                    {r.openedN > 0
                      ? <><UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        Aperto {r.openedN} {r.openedN === 1 ? 'volta' : 'volte'}</>
                      : <><Clock className="w-3.5 h-3.5" aria-hidden="true" />Approvato, non ancora aperto</>}
                  </span>
                  {r.expiresAt && <span className="block mt-0.5">scade il {giorno(r.expiresAt)}</span>}
                </span>
                <button onClick={() => decidi(r, false)} disabled={pending}
                  className="text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-error hover:bg-surface-hover press disabled:opacity-40">
                  Revoca
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="px-5 py-3 text-2xs text-text-tertiary border-t border-border">
        Chi riceve il link senza poter entrare nel tool chiede l'accesso da lì, con nome e
        cognome. Il sì vale <strong className="text-text-secondary">solo per il mese chiesto</strong>{' '}
        e scade dopo quindici giorni: per un altro mese serve un'altra richiesta.
      </p>
    </section>
  )
}

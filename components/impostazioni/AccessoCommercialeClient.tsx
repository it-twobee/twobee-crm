'use client'

/**
 * §429 — chi lavora i lead: la concessione `can_view_deals`, che aveva perso la sua
 * schermata con il modulo vecchio. Senza, l'area la vedevano solo gli admin.
 *
 * Il manager abilitato vede tutte le trattative, gli altri ruoli solo quelle
 * assegnate a loro (`salesAccess`): la colonna lo dice, perché «abilitato»
 * senza dire *a cosa* fa credere a un junior di vedere la pipeline intera.
 */

import { useState, useTransition } from 'react'
import { Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { setSalesPermission } from '@/app/actions/sales'
import { ROLE_LABELS } from '@/lib/permissions'
import type { AppRole } from '@/lib/types/database'

export type PersonaAccesso = { id: string; nome: string; ruolo: AppRole; abilitato: boolean }

export function AccessoCommercialeClient({ persone }: { persone: PersonaAccesso[] }) {
  const [stato, setStato] = useState(() => Object.fromEntries(persone.map(p => [p.id, p.abilitato])))
  const [inCorso, setInCorso] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function cambia(p: PersonaAccesso) {
    const nuovo = !stato[p.id]
    setInCorso(p.id)
    startTransition(async () => {
      try {
        await setSalesPermission(p.id, nuovo)
        setStato(s => ({ ...s, [p.id]: nuovo }))
        toast.success(nuovo ? `${p.nome} lavora i lead` : `${p.nome} non vede più l'area commerciale`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Operazione non riuscita')
      } finally {
        setInCorso(null)
      }
    })
  }

  const abilitati = persone.filter(p => stato[p.id]).length

  return (
    <section className="max-w-4xl mx-auto space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-gold-dim flex items-center justify-center shrink-0">
          <Users className="w-4 h-4 text-gold-text" />
        </span>
        <div>
          <h2 className="text-lg font-black text-text-primary font-heading">Chi lavora i lead</h2>
          <p className="text-xs text-text-secondary max-w-xl">
            Gli admin vedono sempre l&apos;area. Qui si abilita il resto del team: un manager vede tutte
            le trattative, gli altri solo quelle assegnate a loro. {abilitati} su {persone.length} abilitati.
          </p>
        </div>
      </div>

      {persone.length === 0 ? (
        <p className="text-xs text-text-tertiary bg-surface border border-border rounded-2xl px-4 py-3">
          Nessuna persona attiva nel workspace.
        </p>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="bg-surface-hover text-2xs font-bold text-text-tertiary uppercase tracking-wider">
                  <th scope="col" className="px-3 py-2.5 text-left">Persona</th>
                  <th scope="col" className="px-3 py-2.5 text-left w-32">Ruolo</th>
                  <th scope="col" className="px-3 py-2.5 text-left w-48">Vede</th>
                  <th scope="col" className="px-3 py-2.5 text-center w-28">Abilitato</th>
                </tr>
              </thead>
              <tbody>
                {persone.map(p => {
                  const on = stato[p.id]
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2 text-text-primary font-medium">{p.nome}</td>
                      <td className="px-3 py-2 text-text-secondary">{ROLE_LABELS[p.ruolo] ?? p.ruolo}</td>
                      <td className="px-3 py-2 text-text-secondary">
                        {!on ? '—' : p.ruolo === 'manager' ? 'Tutte le trattative' : 'Solo le sue'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button role="switch" aria-checked={on} aria-label={`Area commerciale per ${p.nome}`}
                          onClick={() => cambia(p)} disabled={inCorso !== null}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-gold' : 'bg-surface-active border border-border-interactive'}`}>
                          {inCorso === p.id
                            ? <Loader2 className="w-3 h-3 mx-auto animate-spin text-text-secondary" />
                            : <span className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${on ? 'translate-x-[18px] bg-on-gold' : 'translate-x-[3px] bg-text-tertiary'}`} />}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

import { Plane, PartyPopper, Sun } from 'lucide-react'
import { countdown, normalize, type RawRequest } from '@/lib/leave-calendar'

/**
 * §223 — Quanto manca alle ferie, per chi guarda.
 *
 * È l'unico riquadro del workspace che non serve a lavorare, e va bene così: sta
 * lì per il motivo per cui esiste un calendario delle ferie in un gestionale —
 * perché le ferie sono la cosa che la gente conta.
 *
 * Tre regole che lo rendono onesto:
 *
 *  · **Solo le approvate.** Un countdown su una richiesta che può essere
 *    rifiutata è il modo più veloce di far arrabbiare qualcuno.
 *  · **Sparisce quando non serve**: chi non ha ferie approvate non vede un
 *    riquadro vuoto che dice «nessuna ferie», che sarebbe una presa in giro.
 *  · **La data la decide il server.** Il conteggio si fa a monte e arriva già
 *    fatto: calcolarlo nel browser darebbe numeri diversi a seconda del fuso, e
 *    un giorno di differenza su questo lo si nota.
 */
export function VacationCountdown({ requests, profileId, today }: {
  requests: RawRequest[]; profileId: string; today: string
}) {
  const { spans } = normalize(requests, [])
  const c = countdown(spans, profileId, today)
  if (!c) return null

  const going = c.state === 'in corso'
  const from = new Date(c.span.from).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  const to = new Date(c.span.to).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })

  return (
    <section className={`rounded-2xl border p-4 shadow-soft ${
      going ? 'border-success/40 bg-success-dim' : 'border-gold/30 bg-gold-dim'}`}>
      <div className="flex items-center gap-3">
        <span className={going ? 'text-success' : 'text-gold-text'}>
          {going ? <Sun className="w-5 h-5" /> : c.state === 'domani' ? <PartyPopper className="w-5 h-5" /> : <Plane className="w-5 h-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-text-primary">
            {going ? 'Ferie in corso' : c.inDays === 1 ? 'Ferie domani' : `Ferie fra ${c.inDays} giorni`}
          </p>
          <p className="text-2xs text-text-secondary mt-0.5">{c.message}</p>
        </div>
        {!going && (
          <span className="text-3xl font-black tabular text-gold-text shrink-0 font-heading leading-none">
            {c.inDays}
          </span>
        )}
      </div>

      {/* La barra non misura un progresso di lavoro: misura l'attesa. */}
      <div className="h-1.5 bg-surface-active rounded-full overflow-hidden mt-3">
        <div className={`h-full rounded-full transition-all ${going ? 'bg-success' : 'bg-gold'}`}
          style={{ width: `${Math.round(c.progress * 100)}%` }} />
      </div>
      <p className="text-2xs text-text-tertiary mt-1.5 tabular">
        {from} → {to} · {c.span.days} giorni
      </p>
    </section>
  )
}

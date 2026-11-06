import { redirect } from 'next/navigation'
import { Sticker } from 'lucide-react'
import { getSessionProfile } from '@/lib/auth'
import { canSeeLavagna, canWriteLavagna } from '@/lib/lavagna'
import { leggiStato, requireLavagna } from '@/lib/lavagna-server'
import { Lavagna } from './Lavagna'

/* La stessa pagina per i due portali: cambia solo dove rimanda chi non entra. */
export async function PaginaLavagna({ fuori }: { fuori: string }) {
  const profilo = await getSessionProfile()
  if (!profilo) redirect('/login')
  if (!canSeeLavagna(profilo)) redirect(fuori)
  const porta = await requireLavagna(false)
  const letto = porta.ok ? await leggiStato(porta.db, porta.firma) : null
  const errore = !porta.ok ? porta.error : letto && !letto.ok ? letto.error : null
  return (
    <div className="flex h-full min-h-[36rem] flex-col p-3 sm:p-5">
      <header className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-dim">
          <Sticker className="h-5 w-5 text-gold-text" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold text-text-primary">Lavagna</h1>
          <p className="text-2xs text-text-tertiary">Post-it, sticker, foto e link. Tutto anonimo: solo tu sai cosa è tuo, e solo tu lo stacchi.</p>
        </div>
      </header>
      <Lavagna iniziale={letto?.ok ? letto.stato : null} errore={errore} puoScrivere={canWriteLavagna(profilo)} />
    </div>
  )
}

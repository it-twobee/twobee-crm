import { redirect } from 'next/navigation'
import { getSalesAccess } from '@/lib/sales-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { COLONNE } from '@/lib/sales-table'
import { CrmTable, type RigaCrm } from './CrmTable'

/**
 * §371 — il CRM commerciale, nei due portali.
 *
 * Le righe si leggono col **service role** e non con la sessione, e non è una
 * scorciatoia: il permesso l'ha già dato `getSalesAccess`, che guarda il ruolo
 * e la concessione `can_view_deals`. La RLS su `deals` è scritta per i ruoli,
 * non per il permesso puntuale, quindi un senior abilitato al commerciale
 * passerebbe il controllo e poi non vedrebbe niente — un permesso che non
 * apre niente è peggio di un permesso negato, perché non si capisce.
 *
 * Si chiedono solo le colonne che la tabella mostra: `select('*')` porterebbe
 * anche la delivery e la provenienza Meta, che qui non si leggono.
 */
export async function SalesPage({ base }: { base: string }) {
  const contesto = await getSalesAccess()
  if (!contesto) redirect(base ? '/workspace' : '/dashboard')

  const campi = Array.from(new Set(['id', 'client_id', ...COLONNE.map(c => c.campo)]))
    .filter(c => c !== 'owners')
    .join(',')

  const { data, error } = await createAdminClient()
    .from('deals').select(campi).order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-2xl font-semibold text-text-primary">Commerciale</h1>
        <p role="alert" className="text-warning">
          {['42703', '42P01'].includes(error.code ?? '')
            ? 'Area commerciale da aggiornare: mancano le migration 235 e 236 sul database.'
            : 'Area commerciale non disponibile in questo momento.'}
        </p>
      </div>
    )
  }

  /* §378 — chi può eliminare è la stessa coppia che può importare un CSV
     (§377): admin e manager. Chi vede solo i propri lead non vede le caselle,
     e la porta vera resta dentro `eliminaLead` — nascondere una casella non
     è una barriera (§329). */
  return (
    <CrmTable
      righe={(data ?? []) as unknown as RigaCrm[]}
      puoiEliminare={contesto.access === 'admin' || contesto.access === 'manager'}
    />
  )
}

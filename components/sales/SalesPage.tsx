import { redirect } from 'next/navigation'
import { getSalesAccess, leadDi, vedeTutto } from '@/lib/sales-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { CAMPI_RIGA } from '@/lib/sales-table'
import { CrmTable, type RigaCrm, type PersonaCrm } from './CrmTable'
import { ADMIN_ROLES } from '@/lib/permissions'
import { FasiProvider } from './FasiContext'
import { leggiCampi, leggiFasi, leggiMotiviPerso, leggiScelte } from '@/lib/sales-fasi'

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
 * Si chiedono solo le colonne che servono e non `select('*')`: la delivery è
 * roba della scheda progetto. L'elenco è `CAMPI_RIGA` e sta in
 * `lib/sales-table.ts`, accanto alle colonne — costruirlo qui da `COLONNE`
 * aveva lasciato fuori `lead_origine`, che non è una cella ma la pagina la
 * legge in quattro punti, e tutti e quattro mostravano il vuoto in silenzio
 * (§378).
 */
export async function SalesPage({ base }: { base: string }) {
  const contesto = await getSalesAccess()
  if (!contesto) redirect(base ? '/workspace' : '/dashboard')

  const { data, error } = await createAdminClient()
    .from('deals').select(CAMPI_RIGA.join(',')).order('created_at', { ascending: false })

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
  /* §424 — le fasi scendono dal server una volta e stanno a disposizione di
     tutta la sezione: sono una tabella che un amministratore cambia mentre il
     tool gira, non più una costante importata da otto componenti. */
  const [fasi, motivi, scelte, campi] = await Promise.all([leggiFasi(), leggiMotiviPerso(), leggiScelte(), leggiCampi()])

  /* §430 — il service role legge tutto, quindi il perimetro di chi vede solo i
     suoi lead si taglia **qui**, sul server: le righe degli altri non arrivano
     nemmeno al browser. Nascondere una riga nell'elenco non è una barriera. */
  let righe = (data ?? []) as unknown as RigaCrm[]
  if (!vedeTutto(contesto.access)) {
    const suoi = await leadDi(contesto.actor)
    righe = righe.filter(r => suoi.has(r.id))
  }

  /* §430 — chi segue ogni lead. `owners` non è una colonna di `deals` (236) e
     la pagina non lo chiedeva: la cella esisteva e restava sempre vuota, e un
     senior abilitato si trovava un elenco vuoto senza che nessuno potesse
     dargli un lead. Si assegna fra chi l'area la vede davvero — gli admin e chi
     ha `can_view_deals` — perché dare un lead a chi non può aprirlo è
     perderlo. */
  const admin = createAdminClient()
  const [{ data: legami }, { data: concessi }] = await Promise.all([
    admin.from('deal_owners').select('deal_id, profile_id').in('deal_id', righe.map(r => r.id)),
    admin.from('profile_permissions').select('profile_id').eq('permission', 'can_view_deals').eq('granted', true),
  ])
  const perRiga = new Map<string, string[]>()
  for (const l of (legami ?? []) as { deal_id: string; profile_id: string }[]) {
    perRiga.set(l.deal_id, [...(perRiga.get(l.deal_id) ?? []), l.profile_id])
  }
  /* §437 — i campi personalizzati in una query a parte, e se fallisce si va
     avanti senza: prima della migration la colonna non c'è, e chiederla nella
     select principale farebbe cadere la pagina intera per un riquadro. */
  const { data: extra } = await admin.from('deals').select('id, campi_extra').in('id', righe.map(r => r.id))
  const extraDi = new Map(((extra ?? []) as { id: string; campi_extra: Record<string, unknown> | null }[])
    .map(e => [e.id, e.campi_extra ?? {}]))
  righe = righe.map(r => ({ ...r, owners: perRiga.get(r.id) ?? [], campi_extra: extraDi.get(r.id) ?? {} }))

  const idConcessi = (concessi ?? []).map(c => c.profile_id as string)
  const idOwner = Array.from(new Set((legami ?? []).map(l => l.profile_id as string)))
  const { data: profili } = await admin.from('profiles')
    .select('id, full_name, app_role, is_active')
    .or(`app_role.in.(${ADMIN_ROLES.join(',')}),id.in.(${[...idConcessi, ...idOwner].join(',') || '00000000-0000-0000-0000-000000000000'})`)
    .order('full_name')
  const persone: PersonaCrm[] = ((profili ?? []) as { id: string; full_name: string | null; app_role: string | null; is_active: boolean | null }[])
    .map(p => ({
      id: p.id,
      nome: p.full_name || 'Senza nome',
      assegnabile: p.is_active !== false
        && (ADMIN_ROLES.includes(p.app_role as never) || idConcessi.includes(p.id)),
    }))

  return (
    <FasiProvider fasi={fasi} motivi={motivi} scelte={scelte} campi={campi}>
      <CrmTable
        righe={righe}
        persone={persone}
        puoiAssegnare={vedeTutto(contesto.access)}
        puoiEliminare={contesto.access === 'admin' || contesto.access === 'manager'}
      />
    </FasiProvider>
  )
}

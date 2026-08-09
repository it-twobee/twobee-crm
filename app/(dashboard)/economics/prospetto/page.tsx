import { createClient } from '@/lib/supabase/server'
import { ProspettoClient } from '@/components/pl/ProspettoClient'
import { monthKey } from '@/lib/pl'
import { loadProspetto } from '@/lib/prospetto-load'

/**
 * §239/§262 — Il prospetto: un mese alla volta, e il piano di cassa che ne esce.
 *
 * La pagina risponde a due domande sullo **stesso** mese: dove vanno i soldi
 * (macro categorie, competenza contro cassa) e cosa deve ancora succedere
 * perché il mese chiuda (§262). I numeri li compone `lib/prospetto-load.ts`,
 * che è lo stesso caricamento del **report per il board** (§268): due
 * assemblaggi diversi degli stessi dati sono il modo in cui una riunione si
 * apre con due fogli che non tornano.
 */
/* Come il conto economico: la pagina si rilegge a ogni caricamento. Con
   `staleTimes` acceso una spunta messa un minuto fa non si vedrebbe, e in una
   sezione che serve a decidere un pagamento è il difetto peggiore. */
export const revalidate = 0

export default async function ProspettoPage({ searchParams }: {
  searchParams: Promise<{ m?: string; n?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const month = sp.m ? monthKey(new Date(sp.m)) : monthKey(new Date())
  /* §240 — il singolo mese è la vista di base: lì la domanda non è come cambia
     una proporzione, è «cosa ha prodotto questo mese, cosa si è mosso, e cosa
     deve ancora succedere». Il confronto su più mesi resta, dietro il selettore. */
  const span = Math.min(24, Math.max(1, Number(sp.n) || 1))

  const d = await loadProspetto(supabase, month, today)
  if (d.setupNeeded) {
    return <ProspettoClient month={month} span={span} setupNeeded months={[]}
      revenue={[]} costs={[]} txs={[]} payouts={[]} opening={0} today={today} bankReady={false} />
  }

  return (
    <ProspettoClient
      payouts={d.payouts}
      month={month} span={span} setupNeeded={false}
      months={d.months}
      revenue={d.revenue} costs={d.costs}
      txs={d.txs}
      opening={d.opening} today={today} bankReady={d.bankReady}
      collection={d.collection}
      first={d.first}
      plan={d.plan}
      vatHeld={d.vatHeld}
      vatLabel={d.vatLabel}
      vatDeadline={d.vatDeadline}
      bank={d.bank}
      horizon={d.horizon}
    />
  )
}

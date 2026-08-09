import { redirect } from 'next/navigation'
import { hasEconomicsAccess } from '@/lib/economics-guard'

/**
 * §234 — il terzo strato, e serve perché i primi due rispondono a domande più
 * larghe.
 *
 * Il middleware instrada per portale e tiene il ruolo in memoria per mezzo
 * minuto; il layout della dashboard rimanda al workspace chi è workspace. Ma
 * «non è workspace» non vuol dire «può vedere i numeri»: un `viewer`, un
 * legacy con `role='admin'` e `app_role` di reparto, un account creato a mano
 * passano i primi due e arrivavano dentro il conto economico.
 *
 * Qui la domanda è quella giusta e si rilegge dal database a ogni caricamento:
 * `canSeeEconomics(app_role)`. Chi non passa torna alla dashboard — non a una
 * pagina d'errore, che confermerebbe l'esistenza della sezione.
 */
export default async function EconomicsLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasEconomicsAccess())) redirect('/dashboard')
  return <>{children}</>
}

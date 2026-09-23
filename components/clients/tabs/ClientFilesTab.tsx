'use client'

import { ClientFileArea } from '@/components/shared/file-area/ClientFileArea'
import { MATERIAL_MAX_BYTES, humanBytes } from '@/lib/portal/materials'

/* §403 — Lo spazio c'è per ogni cliente, dal primo giorno e senza chiedere
   niente a nessuno: quello del team non dipende dal portale. Quello del cliente
   si accende con l'invito, e finché non succede la pagina lo dice.
   §416 — l'area carica da sé i suoi dati, e la cartella aperta sta nell'indirizzo. */
export function ClientFilesTab({ clientId, portalTabHref }: { clientId: string; portalTabHref?: string }) {
  return <div className="max-w-6xl space-y-4 p-4 sm:p-6">
    <div>
      <h2 className="font-heading text-xl font-semibold">File</h2>
      <p className="mt-1 text-sm text-text-secondary">
        L’area di questo cliente. Quello che carichiamo noi resta nostro; quello che carica lui
        arriva dal suo portale. Fino a {humanBytes(MATERIAL_MAX_BYTES)} a file, anche cartelle intere.
      </p>
    </div>
    <ClientFileArea clientId={clientId} portalTabHref={portalTabHref} syncUrl />
  </div>
}

'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getClientFiles } from '@/app/actions/client-files'
import type { ClientFilesData } from '@/app/actions/client-files'
import { ClientFileArea } from '@/components/shared/ClientFileArea'
import { MATERIAL_MAX_BYTES, humanBytes } from '@/lib/portal/materials'

/* §403 — Lo spazio c'è per ogni cliente, dal primo giorno e senza chiedere
   niente a nessuno: quello del team non dipende dal portale. Quello del cliente
   si accende con l'invito, e finché non succede la pagina lo dice. */
export function ClientFilesTab({ clientId, portalTabHref }: { clientId: string; portalTabHref?: string }) {
  const [data, setData] = useState<ClientFilesData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let disposed = false
    setLoading(true)
    getClientFiles(clientId).then(result => {
      if (disposed) return
      if (result.error) setError(result.error)
      else { setData(result.data ?? null); setError('') }
    }).catch(() => { if (!disposed) setError('Non è stato possibile caricare i file.') })
      .finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true }
  }, [clientId])

  if (loading) return <p className="flex items-center gap-2 p-6 text-sm text-text-secondary">
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Carico i file…
  </p>
  if (error) return <p role="alert" className="p-6 text-sm text-error">{error}</p>
  if (!data) return null
  if (data.schemaMissing) return <p className="p-6 text-sm text-text-secondary">
    L’area file non è ancora attiva: richiede le migration 250 e 251 del portale.
  </p>

  return <div className="max-w-5xl space-y-4 p-4 sm:p-6">
    <div>
      <h2 className="font-heading text-xl font-semibold">File</h2>
      <p className="mt-1 text-sm text-text-secondary">
        L’area di questo cliente. Quello che carichiamo noi resta nostro; quello che carica lui
        arriva dal suo portale. Fino a {humanBytes(MATERIAL_MAX_BYTES)} a file, anche cartelle intere.
      </p>
    </div>
    <ClientFileArea
      clientId={clientId}
      materials={data.materials}
      canWrite={data.canWrite}
      canDeleteClientFiles={data.canDeleteClientFiles}
      viewerId={data.viewerId}
      portalActive={data.portalActive}
      portalTabHref={portalTabHref}
    />
  </div>
}

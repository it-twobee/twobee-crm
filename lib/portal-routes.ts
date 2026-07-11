'use client'

import { usePathname } from 'next/navigation'

/**
 * Domini perimetrali paralleli: Admin (`/clienti`, `/progetti`…) e Workspace
 * (`/workspace/**`). I componenti condivisi (MieAttivitaClient, WorkloadClient…)
 * vengono renderizzati in entrambi: i link a un progetto devono restare DENTRO
 * il dominio corrente, non saltare all'Admin. Questo hook risolve gli href in
 * base al perimetro dedotto dal pathname.
 */
export function usePortalRoutes() {
  const pathname = usePathname()
  const inWorkspace = pathname?.startsWith('/workspace') ?? false

  return {
    inWorkspace,
    projectHref: (clientId: string, projectId: string) =>
      inWorkspace ? `/workspace/progetti/${projectId}` : `/clienti/${clientId}/progetto/${projectId}`,
    clientHref: (clientId: string) =>
      inWorkspace ? `/workspace/clienti/${clientId}` : `/clienti/${clientId}`,
  }
}

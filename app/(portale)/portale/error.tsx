'use client'

import { ErroreCaricamento } from '@/components/shared/ErroreCaricamento'

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErroreCaricamento error={error} reset={reset} title="Non riusciamo a caricare il tuo spazio."
    message="Non è stato possibile verificare gli accessi o leggere i contenuti. Riprova: un problema di caricamento non significa che non ci siano attività." />
}

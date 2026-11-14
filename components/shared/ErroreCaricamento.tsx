'use client'

import { useChunkRecovery } from '@/components/shared/RecuperoChunk'

export function ErroreCaricamento({ error, reset, title = 'Errore nel caricamento', message }: {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  message?: string
}) {
  const chunk = useChunkRecovery(error)
  return <section role="alert" className="mx-auto max-w-2xl px-5 py-12 text-center">
    <h1 className="text-lg font-semibold text-text-primary">{chunk ? 'Aggiorna la pagina' : title}</h1>
    <p className="mt-3 text-sm text-text-secondary">{chunk
      ? 'Non è stato possibile caricare una parte della pagina. Ricarica per riprovare con i file aggiornati.'
      : message ?? error.message}</p>
    <button onClick={chunk ? () => window.location.reload() : reset}
      className="mt-6 min-h-11 rounded-lg bg-gold px-5 text-sm font-semibold text-on-gold">
      {chunk ? 'Ricarica pagina' : 'Riprova'}
    </button>
  </section>
}

'use client'

import { useChunkRecovery } from '@/components/shared/RecuperoChunk'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const chunk = useChunkRecovery(error)
  return (
    <html>
      <body style={{ background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#ffffff', fontSize: '20px', marginBottom: '8px' }}>{chunk ? 'Aggiorna la pagina' : 'Errore critico'}</h2>
          <button
            onClick={chunk ? () => window.location.reload() : reset}
            style={{ padding: '8px 16px', background: '#F5C800', color: '#000', fontWeight: 'bold', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
          >
            {chunk ? 'Ricarica pagina' : 'Riprova'}
          </button>
        </div>
      </body>
    </html>
  )
}

'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body style={{ background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#ffffff', fontSize: '20px', marginBottom: '8px' }}>Errore critico</h2>
          <button
            onClick={reset}
            style={{ padding: '8px 16px', background: '#F5C800', color: '#000', fontWeight: 'bold', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
          >
            Riprova
          </button>
        </div>
      </body>
    </html>
  )
}

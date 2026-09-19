'use client'

export default function PortalError({ reset }: { reset: () => void }) {
  return <section role="alert" className="mx-auto max-w-2xl px-5 py-12"><h1 className="font-heading text-2xl font-semibold">Non riusciamo a caricare il tuo spazio.</h1><p className="mt-3 text-sm text-text-secondary">Non è stato possibile verificare gli accessi o leggere i contenuti. Riprova: un problema di caricamento non significa che non ci siano attività.</p><button onClick={reset} className="mt-6 min-h-11 rounded-lg bg-gold px-5 text-sm font-semibold text-on-gold">Riprova</button></section>
}

import Link from 'next/link'

export default function PortalNotFound() {
  return <section className="py-8"><h1 className="font-heading text-2xl font-semibold">Contenuto non disponibile.</h1><p className="mt-3 text-sm text-text-secondary">Il collegamento potrebbe essere cambiato oppure il contenuto non è condiviso con il tuo account.</p><Link href="/portale" className="mt-6 inline-flex min-h-11 items-center text-sm text-gold-text">Torna al tuo spazio →</Link></section>
}

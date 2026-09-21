import Link from 'next/link'
import { Logo } from '@/components/shared/Logo'

export default function LegacyTicketPortalPage() {
  return <main className="flex min-h-screen items-center justify-center bg-background p-6">
    <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-surface p-6">
      <Logo className="h-10" />
      <h1 className="text-xl font-bold text-text-primary">Il portale cliente ha un nuovo accesso</h1>
      <p className="text-sm text-text-secondary">Questo vecchio link ai ticket non è più utilizzabile. Chiedi al tuo referente TwoBee un invito personale per impostare la password.</p>
      <Link href="/portale" className="inline-flex rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-on-gold">Ho già un account: accedi</Link>
    </div>
  </main>
}

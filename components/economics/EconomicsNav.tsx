import Link from 'next/link'
import { BookOpen, Wallet, Landmark } from 'lucide-react'

/**
 * Le tre viste dell'economics: il consuntivo del mese, il piano dei costi e
 * quello che di quel margine non è tuo. Stessa materia da tre lati — quanto è
 * uscito, quanto poteva uscire, quanto ne resta allo Stato — quindi si passa
 * dall'una all'altra restando sullo stesso periodo.
 */
export function EconomicsNav({ active, month }: { active: 'conto' | 'costi' | 'fiscale'; month: string }) {
  const tabs = [
    { key: 'conto' as const, label: 'Conto economico', href: `/economics?m=${month}`, icon: BookOpen },
    { key: 'costi' as const, label: 'Costi e budget', href: `/economics/costi?m=${month}`, icon: Wallet },
    { key: 'fiscale' as const, label: 'Fiscale & tasse', href: `/economics/fiscale?m=${month}`, icon: Landmark },
  ]
  return (
    <nav className="flex gap-1 bg-surface border border-border rounded-xl p-1 w-fit" aria-label="Sezioni economics">
      {tabs.map(t => (
        <Link key={t.key} href={t.href} aria-current={active === t.key ? 'page' : undefined}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs font-semibold whitespace-nowrap ${
            active === t.key ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}>
          <t.icon className="w-3.5 h-3.5" />{t.label}
        </Link>
      ))}
    </nav>
  )
}

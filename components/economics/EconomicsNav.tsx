import Link from 'next/link'
import { BookOpen, Wallet, Landmark, Users, Banknote, FileText, Table2 } from 'lucide-react'

/**
 * Le sette viste dell'economics: il consuntivo del mese, il **prospetto** che lo
 * legge per macro categorie su più mesi, i documenti che lo provano, il piano
 * dei costi, il costo delle persone, quello che di quel margine non è tuo, e il
 * conto corrente — che è l'unico posto dove i numeri sono già accaduti. Stessa
 * materia da sette lati, quindi si passa dall'una all'altra restando sullo
 * stesso periodo.
 *
 * §239 — il prospetto sta subito dopo il conto economico perché è la stessa
 * materia con la lente allargata: il conto risponde a «com'è andato questo
 * mese», il prospetto a «dove vanno i soldi».
 */
export function EconomicsNav({ active, month }: {
  active: 'conto' | 'prospetto' | 'fatture' | 'banca' | 'costi' | 'personale' | 'fiscale'
  month: string
}) {
  const tabs = [
    { key: 'conto' as const, label: 'Conto economico', href: `/economics?m=${month}`, icon: BookOpen },
    { key: 'prospetto' as const, label: 'Prospetto', href: `/economics/prospetto?m=${month}`, icon: Table2 },
    { key: 'fatture' as const, label: 'Fatturazione', href: `/economics/fatturazione?m=${month}`, icon: FileText },
    { key: 'banca' as const, label: 'Banca', href: `/economics/banca?m=${month}`, icon: Banknote },
    { key: 'costi' as const, label: 'Costi e budget', href: `/economics/costi?m=${month}`, icon: Wallet },
    { key: 'personale' as const, label: 'Personale', href: `/economics/personale?m=${month}`, icon: Users },
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

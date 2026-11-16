import Link from '@/components/lab/LabLink'
import { LAB_MODULES, type LabModuleKey } from '@/lib/lab-experience'

export default function LabSectionGuide({ section }: { section: LabModuleKey }) {
  const module = LAB_MODULES.find(m => m.key === section)!
  return <section aria-label={module.question} className="rounded-2xl border border-border bg-surface p-3">
    <nav aria-label="Vai al contenuto" className="flex flex-wrap items-center gap-2"><Link href="#dati-prove" className="inline-flex min-h-11 items-center rounded-xl bg-gold px-3 text-sm font-medium text-on-gold">{module.action}</Link><Link href="#sintesi" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-gold-text underline">Sintesi</Link><Link href="#analisi" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-gold-text underline">Grafici</Link></nav>
    <details className="mt-1"><summary className="cursor-pointer py-1 text-2xs text-gold-text">Fonti e criteri di verifica</summary><p className="mt-2 text-2xs text-text-secondary">Fonte: {module.source}. Apri il dettaglio della voce e confronta il documento o movimento collegato. «n/d» indica una fonte da completare; una quota nota non certifica il totale. Le modifiche si fanno nella gestione collegata.</p></details>
  </section>
}

import Link from '@/components/lab/LabLink'
import LabBankPreview from '@/components/lab/LabBankPreview'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabBank } from '@/lib/lab-bank-load'
import { romeToday } from '@/lib/lab-bank'
export const dynamic = 'force-dynamic'
export default async function LabSourcesPage() {
  await requireLabAdmin()
  const data = await loadLabBank(romeToday())
  return <div className="mx-auto max-w-5xl min-w-0 space-y-5 px-4 py-5 sm:p-6"><header className="space-y-2"><h1 className="text-xl font-semibold text-text-primary">Fonti e acquisizione</h1><p className="text-sm text-text-secondary">Verifica l’estratto e raggiungi i percorsi di acquisizione già operativi. Un file letto non conferma un pagamento o la completezza del periodo.</p></header>
    {!data.ok && <p role="alert" className="rounded-xl bg-warning-dim p-3 text-sm text-warning">{data.message}</p>}
    <LabBankPreview accounts={data.ok ? data.accounts.filter(a => a.is_active && a.currency === 'EUR' && !a.owner_partner_id).map(a => ({ id: a.id, label: a.label })) : []} />
    <section className="rounded-2xl border border-border bg-surface p-4 space-y-3"><h2 className="text-base font-semibold text-text-primary">Fatture, cedolini e F24</h2><p className="text-sm text-text-secondary">L’acquisizione dei documenti usa i percorsi esistenti, con i propri controlli e permessi. Le nuove viste leggono gli stessi registri dopo il caricamento.</p><div className="flex flex-wrap gap-3"><Link href="/economics/carica" className="inline-flex min-h-11 items-center text-sm text-gold-text underline">Carica documenti</Link><Link href="/lab/verifiche" className="inline-flex min-h-11 items-center text-sm text-gold-text underline">Controlla i raccordi dopo l’acquisizione</Link></div></section>
  </div>
}

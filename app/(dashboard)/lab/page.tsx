import LabSourceActions from '@/components/lab/LabSourceActions'
import Link from 'next/link'
import { FlaskConical, ChevronRight } from 'lucide-react'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabConnections } from '@/lib/lab-connections-load'
import { connectionOverview } from '@/lib/lab-connections'
import { labMonth, romeToday } from '@/lib/lab-bank'
import { shiftMonth } from '@/lib/pl'
import LabMonthPicker from '@/components/lab/LabMonthPicker'

export const revalidate = 0

const SEZIONI: { nome: string; nota: string; href?: string }[] = [
  { nome: 'Accordi', nota: 'Cliente, progetto, patto, rate e subappalto. Prima lettura in verifica.', href: '/lab/accordi' },
  { nome: 'Banca', nota: 'Movimenti, saldi e fonti di Banco BPM e Vivid. Prima lettura in verifica.', href: '/lab/banca' },
  { nome: 'Fatturazione', nota: 'Emesse e ricevute: registro, rettifiche e riscontri bancari distinti. In verifica.', href: '/lab/fatturazione' },
  { nome: 'Risorse & tasse', nota: 'Dipendenti e freelance, documenti, F24 e IVA. In verifica.', href: '/lab/risorse' },
  { nome: 'Conto economico', nota: 'Effettivo e Maturato, compensi soci e PDF dalla stessa fotografia. In verifica.', href: '/lab/conto-economico' },
  { nome: 'Previsionale', nota: 'Accordi attuali, scenari growth/digital e criticità con ipotesi esplicite. In verifica.', href: '/lab/previsionale' },
]

export default async function LabPage({ searchParams }: { searchParams: { m?: string } }) {
  await requireLabAdmin()
  const today = romeToday()
  const month = labMonth(searchParams.m, shiftMonth(`${today.slice(0, 7)}-01`, -1))
  const connections = await loadLabConnections(today)
  const overview = connections ? connectionOverview(connections, month) : null
  const missing = (side: string) => `/lab/conto-economico?m=${month}&vista=maturato&documenti=mancanti&tipoRiga=${side}#righe-economiche`
  const destination = (href: string) => `${href}?m=${month}`
  return (
    <div className="min-h-full px-4 py-5 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="w-5 h-5 text-gold-text" aria-hidden />
        <h1 className="text-xl font-semibold text-text-primary">Economics · Laboratorio</h1>
      </div>
      <p className="text-sm text-text-secondary mb-5 leading-snug">
        Un percorso unico: cliente → progetto → accordo → fattura → banca.
        Qui verifichiamo un modulo alla volta sui dati veri, in sola lettura e solo per il super admin.
        Le sezioni in uso restano operative fino alla promozione verificata.
      </p>
      <LabMonthPicker month={month} action="/lab" label="Mese da verificare" />
      <section className="my-5 space-y-3">
        <h2 className="text-base font-semibold text-text-primary">Da verificare nei collegamenti</h2>
        <p className="text-sm text-text-secondary">Apri le registrazioni che non hanno ancora un documento collegato. Sono riferimenti da controllare, non importi da incassare o pagare.</p>
        {!overview ? <p role="alert" className="rounded-xl bg-warning-dim p-4 text-sm text-warning">Fonti dei collegamenti non disponibili. I moduli restano consultabili; nessun conteggio viene sostituito con zero.</p>
          : <><div className="grid gap-3 sm:grid-cols-3">{[
            { label: 'Ricavi senza fattura', count: overview.registered ? overview.revenueWithoutInvoice : null, total: overview.revenue, href: missing('ricavo') },
            { label: 'Costi senza fattura', count: overview.registered ? overview.costsWithoutInvoice : null, total: overview.costs, href: missing('costo') },
            { label: 'Fatture risorse da collegare', count: overview.hrInvoicesWithoutDocument, total: overview.hrInvoices, href: `/lab/risorse?m=${month}&tipo=professionisti` },
          ].map(item => <Link key={item.label} href={item.href} className="rounded-2xl border border-border bg-surface p-4 hover:bg-surface-hover"><p className="text-sm text-text-secondary">{item.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">{item.count ?? 'n/d'}</p><p className="mt-2 text-2xs text-text-secondary">{item.total} registrazioni nel mese · apri per verificare</p></Link>)}</div>
          <p className="text-2xs text-text-tertiary">Controllo delle sole registrazioni presenti: non rileva documenti mai acquisiti né certifica pagamenti. {!overview.registered && 'Il mese economico non è presente: conteggi ricavi/costi n/d.'}</p></>}
      </section>
      <section className="space-y-3"><h2 className="text-base font-semibold text-text-primary">Scegli cosa consultare</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SEZIONI.map(s => {
          const body = (
            <>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-text-primary">{s.nome}</span>
                <span className="block text-2xs text-text-tertiary leading-snug">{s.nota}</span>
              </span>
              {s.href
                ? <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden />
                : <span className="text-2xs text-text-tertiary border border-border rounded-full px-2 py-0.5 shrink-0">da costruire</span>}
            </>
          )
          const cls = 'flex items-center gap-3 px-4 min-h-[64px] py-3 bg-surface border border-border rounded-2xl'
          return (
            <li key={s.nome}>
              {s.href
                ? <Link href={destination(s.href)} className={`${cls} hover:bg-surface-hover press`}>{body}</Link>
                : <div className={cls}>{body}</div>}
            </li>
          )
        })}
      </ul><p className="text-2xs text-text-tertiary">Fonti lette separatamente al {today}; non è uno snapshot transazionale.</p></section>
      <LabSourceActions actions={[{ label: 'Carica documenti bancari, fatture e paghe', href: '/economics/carica' }]} />
      <section className="mt-6 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-text-primary">Esperimenti precedenti</h2>
        <p className="text-2xs text-text-secondary mt-1 mb-3">Consultabili per il confronto. Non sono i nuovi moduli promossi.</p>
        <ul className="flex flex-wrap gap-3 text-sm text-gold-text">
          <li><Link className="underline" href="/lab/novembre">Mese dalla banca</Link></li>
          <li><Link className="underline" href="/lab/progetti">Progetti</Link></li>
          <li><Link className="underline" href="/lab/fatturazione/precedente">Fatture aperte</Link></li>
        </ul>
      </section>
    </div>
  )
}

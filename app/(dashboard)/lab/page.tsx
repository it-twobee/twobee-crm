import Link from 'next/link'
import { FlaskConical, ChevronRight } from 'lucide-react'

export const revalidate = 0

const SEZIONI: { nome: string; nota: string; href?: string }[] = [
  { nome: 'Accordi', nota: 'Cliente, progetto, patto, rate e subappalto. Prima lettura in verifica.', href: '/lab/accordi' },
  { nome: 'Banca', nota: 'Movimenti, saldi e fonti di Banco BPM e Vivid. Prima lettura in verifica.', href: '/lab/banca' },
  { nome: 'Fatturazione', nota: 'Emesse e ricevute: registro, rettifiche e riscontri bancari distinti. In verifica.', href: '/lab/fatturazione' },
  { nome: 'Risorse & tasse', nota: 'Dipendenti e freelance, documenti mensili, versamenti e area IVA.' },
  { nome: 'Conto economico', nota: 'Effettivo e Maturato, compensi soci e PDF dalla stessa fonte.' },
  { nome: 'Previsionale', nota: 'Trend, criticità e scenari growth/digital con ipotesi esplicite.' },
]

export default function LabPage() {
  return (
    <div className="min-h-full px-4 py-5 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="w-5 h-5 text-gold-text" aria-hidden />
        <h1 className="text-lg font-semibold text-text-primary">Laboratorio</h1>
      </div>
      <p className="text-sm text-text-secondary mb-5 leading-snug">
        Un percorso unico: cliente → progetto → accordo → fattura → banca.
        Qui verifichiamo un modulo alla volta sui dati veri, in sola lettura e solo per il super admin.
        Le sezioni in uso restano operative fino alla promozione verificata.
      </p>
      <ul className="space-y-3">
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
                ? <Link href={s.href} className={`${cls} hover:bg-surface-hover press`}>{body}</Link>
                : <div className={cls}>{body}</div>}
            </li>
          )
        })}
      </ul>
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

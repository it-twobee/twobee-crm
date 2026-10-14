import Link from 'next/link'
import { FlaskConical, ChevronRight } from 'lucide-react'

export const revalidate = 0

const SEZIONI: { nome: string; nota: string; href?: string }[] = [
  { nome: 'Mese', nota: 'Conto economico e prospetto in una pagina, con il piano costi dentro.', href: '/lab/novembre' },
  { nome: 'Progetti', nota: 'Una riga per progetto: venduto, rate, affidato fuori, margine.' },
  { nome: 'Fatturazione', nota: 'Una sola azione per riga: emessa, incassata.' },
  { nome: 'Banca', nota: 'Da riconciliare per mese, con «crea la voce» accanto alla riga.' },
]

export default function LabPage() {
  return (
    <div className="min-h-full px-4 py-5 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="w-5 h-5 text-gold-text" aria-hidden />
        <h1 className="text-lg font-semibold text-text-primary">Laboratorio</h1>
      </div>
      <p className="text-sm text-text-secondary mb-5 leading-snug">
        Ambiente di prova solo per il super admin. Le nuove versioni delle sezioni economiche
        nascono qui e leggono i dati veri; finché non vengono promosse, quelle in uso non cambiano.
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
                : <span className="text-2xs text-text-tertiary border border-border rounded-full px-2 py-0.5 shrink-0">in arrivo</span>}
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
    </div>
  )
}

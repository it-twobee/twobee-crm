import { FlaskConical } from 'lucide-react'

export const revalidate = 0

const SEZIONI = [
  { nome: 'Mese', nota: 'Conto economico e prospetto in una pagina, con il piano costi dentro.' },
  { nome: 'Fatturazione', nota: 'Una sola azione per riga: emessa, incassata.' },
  { nome: 'Banca', nota: 'Da riconciliare per mese, con «crea la voce» accanto alla riga.' },
]

export default function LabPage() {
  return (
    <div className="min-h-full p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="w-5 h-5 text-gold-text" />
        <h1 className="text-lg font-semibold text-text-primary">Laboratorio</h1>
      </div>
      <p className="text-sm text-text-secondary mb-6">
        Ambiente di prova solo per il super admin. Le nuove versioni delle sezioni economiche
        nascono qui e leggono i dati veri; finché non vengono promosse, quelle in uso non cambiano.
      </p>
      <ul className="divide-y divide-border border border-border rounded-xl bg-surface">
        {SEZIONI.map(s => (
          <li key={s.nome} className="px-4 py-3">
            <p className="text-sm font-semibold text-text-primary">{s.nome}</p>
            <p className="text-2xs text-text-tertiary">{s.nota}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

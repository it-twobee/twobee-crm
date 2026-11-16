import Link from '@/components/lab/LabLink'
import type { LabConnections } from '@/lib/lab-connections'

export default function LabConnectionList({ connections }: { connections: LabConnections | null }) {
  if (connections == null) return <p className="text-2xs text-warning">Collegamenti non disponibili in questa lettura. Non significa che siano assenti.</p>
  return <div className="space-y-2">
    <ul className="space-y-2">{connections.links.map(link => <li key={link.href} className="text-2xs"><Link href={link.href} className="inline-block min-h-9 py-2 text-gold-text underline">{link.label}</Link><p className="text-text-tertiary">{link.origins.join(' · ')}</p></li>)}</ul>
    {connections.issues.map(issue => <p key={issue} className="text-2xs text-warning">{issue}.</p>)}
    {!connections.links.length && !connections.issues.length && <p className="text-2xs text-text-secondary">Nessun riferimento nei registri letti. Non dimostra l’assenza di un pagamento o di un documento.</p>}
  </div>
}

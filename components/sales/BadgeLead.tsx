import { tipiAds, fatturatoDichiarato, type TipoAds } from '@/lib/sales-ads'

const CLASSE: Record<TipoAds, string> = {
  IA: 'bg-info-dim text-info',
  'E-commerce': 'bg-orange-dim text-orange',
}

/** etichette ads + fatturato dichiarato: si leggono in riga, senza aprire la scheda */
export default function BadgeLead({ origine, className = '' }: { origine: Record<string, unknown> | null | undefined; className?: string }) {
  const tipi = tipiAds(origine)
  const fat = fatturatoDichiarato(origine)
  if (!tipi.length && !fat) return null
  return (
    <span className={`flex items-center gap-1 shrink-0 ${className}`}>
      {fat && (
        <span title={`Fatturato dichiarato nel modulo: ${String(origine?.fatturato_dichiarato)}`}
          className={`text-2xs font-semibold tabular px-1.5 py-px rounded-full whitespace-nowrap ${
            fat.rango >= 3 ? 'bg-success-dim text-success' : fat.rango === 2 ? 'bg-surface-active text-text-primary' : 'bg-surface-active text-text-tertiary'}`}>
          {fat.corta}
        </span>
      )}
      {tipi.map(t => (
        <span key={t} title={`Ads ${t}, da campagna / adset / annuncio`}
          className={`text-2xs font-semibold px-1.5 py-px rounded-full whitespace-nowrap ${CLASSE[t]}`}>
          {t}
        </span>
      ))}
    </span>
  )
}

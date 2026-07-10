import { Database, AlertTriangle } from 'lucide-react'

/**
 * Mostrato quando una tabella non esiste ancora (PGRST205). Le migration di
 * questo progetto si applicano a mano dal Dashboard Supabase: senza questo
 * avviso la pagina esploderebbe con un errore illeggibile.
 */
export function SetupNotice({ table, migration, bucket }: {
  table: string
  migration: string
  bucket?: string
}) {
  return (
    <div className="p-6">
      <div className="max-w-lg mx-auto mt-16 rounded-2xl border border-warning/30 bg-warning-dim p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0" aria-hidden="true" />
          <h1 className="text-base font-bold text-text-primary">Configurazione incompleta</h1>
        </div>

        <p className="text-sm text-text-secondary mb-4">
          La tabella <code className="text-xs bg-surface px-1.5 py-0.5 rounded border border-border">{table}</code> non
          esiste ancora nel database. Esegui la migration dal Dashboard Supabase → SQL Editor:
        </p>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 mb-4">
          <Database className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />
          <code className="text-xs text-text-primary">supabase/migrations/{migration}</code>
        </div>

        {bucket && (
          <p className="text-sm text-text-secondary">
            Crea inoltre il bucket <strong className="text-text-primary">privato</strong>{' '}
            <code className="text-xs bg-surface px-1.5 py-0.5 rounded border border-border">{bucket}</code>{' '}
            da Storage: i bucket non si creano da migration.
          </p>
        )}
      </div>
    </div>
  )
}

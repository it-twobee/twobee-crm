import 'server-only'

/* §413 — Le operazioni che mettono in ordine l'area file (spostare, rinominare,
   archiviare una cartella) sono funzioni del database, perché riscrivono molte
   righe e devono farlo tutte o nessuna. Qui si traduce il loro errore in una
   frase: un codice SQL non dice niente a chi ha trascinato un file. */
export type Failure = { status: number; error: string }

export function organizeFailure(error: { code?: string; message?: string } | null): Failure {
  const code = error?.code ?? ''
  // La funzione non c'è: la 254 non è applicata. Non è un guasto di chi chiede.
  if (code === 'PGRST202' || code === '42883' || code === 'PGRST205' || code === '42P01') {
    return { status: 503, error: 'Mettere in ordine le cartelle richiede la migration 254.' }
  }
  if (code === '42501') return { status: 403, error: 'Non puoi organizzare i file di questa azienda.' }
  if (code === '23505') return { status: 409, error: 'Esiste già una cartella con questo nome.' }
  if (code === '23514') return { status: 400, error: 'Troppi livelli di cartelle (al massimo 10), o un percorso troppo lungo.' }
  // Le nostre eccezioni di validazione hanno già una frase scritta per chi legge.
  if (code === '22023' && error?.message) return { status: 400, error: error.message }
  return { status: 500, error: 'Operazione non riuscita. Riprova.' }
}

export const SPACES = ['team', 'cliente'] as const
export type SpaceParam = (typeof SPACES)[number]
export const isSpace = (value: unknown): value is SpaceParam => SPACES.includes(value as SpaceParam)

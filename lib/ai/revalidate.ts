import { revalidatePath } from 'next/cache'

/**
 * I percorsi da rinfrescare quando l'assistente ha scritto qualcosa.
 *
 * Le action di scrittura delle task — `updateTask`, `updateTaskStatus`,
 * `setTaskAssignees`, `deleteTask` — non revalidano **nessun** percorso. Nella UI
 * non serviva, perché chi le chiama ricarica da sé; passando dall'assistente non
 * c'era nessuno a farlo, e il `router.refresh()` del pannello avrebbe potuto
 * rileggere la stessa risposta dal Data Cache. Sintomo osservato in produzione:
 * «task completata» — vero, l'audit lo conferma — davanti a un elenco identico.
 *
 * L'elenco è fisso e corto di proposito: un percorso che arrivasse dal client
 * sarebbe una cache da invalidare a piacere di chiunque.
 */
const TOUCHED_BY_WRITES = [
  '/workspace', '/workspace/attivita', '/workspace/ad-hoc', '/workspace/progetti', '/workspace/clienti',
  '/dashboard', '/le-mie-attivita', '/ad-hoc', '/progetti', '/clienti',
]

export function revalidateAfterAssistantWrite() {
  for (const p of TOUCHED_BY_WRITES) {
    // Un percorso che non esiste più non deve poter rompere la risposta.
    try { revalidatePath(p) } catch { /* ignorato di proposito */ }
  }
}

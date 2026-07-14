import { toast } from 'sonner'
import { restoreTask } from '@/app/actions/tasks-trash'

// "Annulla" per l'eliminazione di task: toast con azione + Ctrl+Z.
// L'ultima eliminazione è tenuta in un singleton di modulo (vive finché la SPA è
// caricata). L'undo ripristina dal cestino e ricarica per rimostrare la task.

let lastUndo: (() => void) | null = null

/** Esegue l'ultimo "annulla" disponibile (usato da Ctrl+Z). True se c'era qualcosa. */
export function runLastUndo(): boolean {
  const f = lastUndo
  if (!f) return false
  lastUndo = null
  f()
  return true
}

export function hasUndo(): boolean {
  return !!lastUndo
}

/** Mostra il toast "spostata nel cestino" con Annulla e registra l'undo per Ctrl+Z. */
export function notifyTasksDeleted(ids: string | string[]) {
  const arr = (Array.isArray(ids) ? ids : [ids]).filter(Boolean)
  if (!arr.length) return

  const undo = () => {
    if (lastUndo === undo) lastUndo = null
    Promise.all(arr.map(id => restoreTask(id)))
      .then(() => {
        toast.success(arr.length > 1 ? 'Task ripristinate' : 'Task ripristinata')
        // ricarica: la vista corrente aveva rimosso la task in ottimistico
        setTimeout(() => window.location.reload(), 250)
      })
      .catch(() => toast.error('Ripristino non riuscito'))
  }

  lastUndo = undo
  toast.success(arr.length > 1 ? `${arr.length} task nel cestino` : 'Spostata nel cestino', {
    description: 'Annulla · oppure Ctrl+Z',
    action: { label: 'Annulla', onClick: undo },
    duration: 6000,
    onDismiss: () => { if (lastUndo === undo) lastUndo = null },
    onAutoClose: () => { if (lastUndo === undo) lastUndo = null },
  })
}

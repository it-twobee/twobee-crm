'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Loader2, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import { respondToTaskRequest } from '@/app/actions/task-requests'

// Inbox delle richieste in arrivo (status 'richiesta_supporto' assegnate all'utente):
// Accetta → diventa 'da_fare'; Rifiuta → rimossa. Riusabile in Le mie attività e dashboard.
export interface RequestItem {
  id: string
  title: string
  description?: string | null
  due_date?: string | null
  project?: { name: string } | null
}

export function RequestInbox({ requests, onResolved }: {
  requests: RequestItem[]
  onResolved?: (taskId: string, accepted: boolean) => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [note, setNote] = useState('')

  if (requests.length === 0) return null

  const respond = (id: string, accept: boolean, n?: string) => start(async () => {
    const res = await respondToTaskRequest(id, accept, n)
    if ('error' in res) { toast.error(res.error); return }
    toast.success(accept ? 'Richiesta accettata' : 'Richiesta rifiutata')
    if (onResolved) onResolved(id, accept)
    else router.refresh()
    setRejecting(null); setNote('')
  })

  return (
    <div className="mb-4 rounded-xl border border-warning/30 bg-warning-dim overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-warning/20">
        <Inbox className="w-4 h-4 text-warning" aria-hidden="true" />
        <span className="text-sm font-bold text-text-primary">Richieste in arrivo</span>
        <span className="text-2xs text-text-secondary bg-surface px-1.5 py-0.5 rounded">{requests.length}</span>
      </div>
      <ul className="divide-y divide-warning/15">
        {requests.map(r => (
          <li key={r.id} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">{r.title}</p>
                <div className="flex items-center gap-2 text-2xs text-text-secondary mt-0.5">
                  {r.project?.name && <span className="truncate">{r.project.name}</span>}
                  {r.due_date && <span>· scad. {new Date(r.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>}
                </div>
                {r.description && <p className="text-2xs text-text-secondary mt-1 line-clamp-2">{r.description}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => respond(r.id, true)} disabled={pending} aria-label="Accetta richiesta"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gold text-on-gold text-2xs font-bold rounded-lg hover:bg-gold/90 disabled:opacity-50">
                  {pending ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Check className="w-3 h-3" aria-hidden="true" />} Accetta
                </button>
                <button onClick={() => setRejecting(rejecting === r.id ? null : r.id)} disabled={pending} aria-label="Rifiuta richiesta"
                  className="p-1.5 text-text-tertiary hover:text-error hover:bg-error-dim rounded-lg transition-colors">
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
            {rejecting === r.id && (
              <div className="flex items-center gap-2 mt-2">
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Motivo (opzionale)"
                  className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-2xs text-text-primary focus:outline-none" />
                <button onClick={() => respond(r.id, false, note)} disabled={pending}
                  className="px-2.5 py-1.5 text-2xs font-bold text-error border border-error/30 rounded-lg hover:bg-error-dim shrink-0">Conferma rifiuto</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

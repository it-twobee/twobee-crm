'use client'

import { useState, useTransition } from 'react'
import { HeartHandshake, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile } from '@/lib/types/database'
import { createTaskRequest } from '@/app/actions/task-requests'

// CTA "Richiedi supporto" (§6.3): apre un form (collega, titolo, nota, scadenza,
// priorità) e crea una richiesta collegata alla task/progetto d'origine.
export function SupportRequestButton({ originTaskId, projectId, defaultTitle, profiles }: {
  originTaskId?: string | null
  projectId?: string | null
  defaultTitle?: string
  profiles: Pick<Profile, 'id' | 'full_name'>[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [target, setTarget] = useState('')
  const [title, setTitle] = useState(defaultTitle ? `Supporto: ${defaultTitle}` : '')
  const [note, setNote] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState('media')

  const inp = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-gold/40'

  const submit = () => {
    if (!target || !title.trim()) { toast.error('Collega e titolo obbligatori'); return }
    start(async () => {
      const res = await createTaskRequest({
        targetProfileId: target, title, note: note || null,
        projectId: projectId ?? null, originTaskId: originTaskId ?? null,
        dueDate: due || null, priority,
      })
      if ('error' in res) { toast.error(res.error); return }
      toast.success('Richiesta di supporto inviata')
      setOpen(false); setTarget(''); setNote(''); setDue('')
    })
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-border rounded-lg text-2xs font-semibold text-text-secondary hover:text-text-primary hover:border-gold/30 transition-colors">
      <HeartHandshake className="w-3.5 h-3.5" aria-hidden="true" /> Richiedi supporto a un collega
    </button>
  )

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-hover p-3">
      <p className="text-2xs text-text-tertiary uppercase tracking-wider">Richiedi supporto</p>
      <select value={target} onChange={e => setTarget(e.target.value)} aria-label="Collega" className={inp}>
        <option value="">— Scegli un collega —</option>
        {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo" aria-label="Titolo" className={inp} />
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Su cosa serve supporto?" aria-label="Nota" className={inp + ' resize-none'} />
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="Scadenza proposta" className={inp} />
        <select value={priority} onChange={e => setPriority(e.target.value)} aria-label="Priorità" className={inp}>
          <option value="alta">Alta</option><option value="media">Media</option><option value="bassa">Bassa</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="flex-1 py-1.5 text-2xs border border-border rounded-lg text-text-secondary hover:text-text-primary">Annulla</button>
        <button onClick={submit} disabled={pending}
          className="flex-1 py-1.5 text-2xs font-bold bg-gold text-on-gold rounded-lg hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-1">
          {pending ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Send className="w-3 h-3" aria-hidden="true" />} Invia
        </button>
      </div>
    </div>
  )
}

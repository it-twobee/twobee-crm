'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Sparkles, Plus, Loader2, X } from 'lucide-react'

interface TaskMin { id: string; status: string; priority: string; due_date: string | null }
interface ProjectMin { id: string; name: string; status: string; sprint_current: number; client_id: string; tasks: TaskMin[] }
interface ClientMin {
  id: string; company_name: string; status: string; payment_status: string
  client_label: string
  projects: ProjectMin[]
}

interface Suggestion {
  id: string
  name: string
  /** Perché te lo sto proponendo: sempre visibile, mai un numero senza spiegazione. */
  reason: string
  color: string
  projectIds: string[]
}

const COLORS = [
  'var(--color-gold-text)', 'var(--color-error)', 'var(--color-info)',
  'var(--color-success)', 'var(--color-accent)', 'var(--color-orange)',
]

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

/**
 * Pattern deterministici: contano e soglia, niente AI. Devono essere istantanei
 * e ripetibili — un suggerimento che cambia a ogni render non è utilizzabile.
 * Ogni raccolta esiste solo se ha almeno 2 progetti: sotto, non è una raccolta.
 */
function computeSuggestions(clients: ClientMin[], existingNames: Set<string>): Suggestion[] {
  const allProjects = clients.flatMap(c => c.projects.map(p => ({ ...p, client: c })))
  if (allProjects.length === 0) return []
  const now = today()
  const out: Suggestion[] = []

  const push = (s: Omit<Suggestion, 'color'>) => {
    if (s.projectIds.length < 2) return
    if (existingNames.has(s.name.toLowerCase())) return
    out.push({ ...s, color: COLORS[out.length % COLORS.length] })
  }

  // 1. Progetti in ritardo: hanno task scadute e non completate.
  const late = allProjects.filter(p =>
    p.tasks.some(t => t.due_date && t.status !== 'completato' && new Date(t.due_date) < now))
  push({
    id: 'in_ritardo',
    name: 'Progetti in ritardo',
    reason: `${late.length} progetti hanno task scadute e non completate`,
    projectIds: late.map(p => p.id),
  })

  // 2. Clienti a rischio: stato rosso o pagamenti in ritardo.
  const atRisk = allProjects.filter(p =>
    p.client.status === 'rosso' || p.client.payment_status === 'in_ritardo')
  push({
    id: 'clienti_rischio',
    name: 'Clienti a rischio',
    reason: `${atRisk.length} progetti su clienti con salute rossa o pagamenti in ritardo`,
    projectIds: atRisk.map(p => p.id),
  })

  // 3. Quasi conclusi: ≥80% task fatte ma progetto ancora aperto.
  const nearlyDone = allProjects.filter(p => {
    if (p.status === 'completato' || p.tasks.length === 0) return false
    const done = p.tasks.filter(t => t.status === 'completato').length
    return done / p.tasks.length >= 0.8
  })
  push({
    id: 'quasi_conclusi',
    name: 'Quasi conclusi',
    reason: `${nearlyDone.length} progetti oltre l’80% ma ancora aperti`,
    projectIds: nearlyDone.map(p => p.id),
  })

  // 4. Non avviati: attivi, con task, nessuna completata.
  const stalled = allProjects.filter(p =>
    p.status === 'attivo' && p.tasks.length > 0 && !p.tasks.some(t => t.status === 'completato'))
  push({
    id: 'non_avviati',
    name: 'Non avviati',
    reason: `${stalled.length} progetti attivi senza nemmeno una task completata`,
    projectIds: stalled.map(p => p.id),
  })

  // 5. Senza scadenze: nessuna task ha una data. Difficile da governare.
  const noDates = allProjects.filter(p =>
    p.status === 'attivo' && p.tasks.length > 0 && !p.tasks.some(t => t.due_date))
  push({
    id: 'senza_scadenze',
    name: 'Senza scadenze',
    reason: `${noDates.length} progetti attivi in cui nessuna task ha una data`,
    projectIds: noDates.map(p => p.id),
  })

  // 6. Il cliente con più progetti aperti merita una raccolta dedicata.
  const byClient = new Map<string, ProjectMin[]>()
  for (const p of allProjects) {
    if (p.status !== 'attivo') continue
    const arr = byClient.get(p.client.company_name) ?? []
    arr.push(p)
    byClient.set(p.client.company_name, arr)
  }
  const top = Array.from(byClient.entries()).sort((a, b) => b[1].length - a[1].length)[0]
  if (top && top[1].length >= 3) {
    push({
      id: `cliente_${top[0]}`,
      name: top[0],
      reason: `${top[1].length} progetti attivi per questo cliente`,
      projectIds: top[1].map(p => p.id),
    })
  }

  return out
}

export function PortfolioSuggestions({ clients, existingNames, onCreated }: {
  clients: ClientMin[]
  existingNames: string[]
  onCreated: () => void
}) {
  const [creating, setCreating] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set<string>())

  const taken = useMemo(() => new Set(existingNames.map(n => n.toLowerCase())), [existingNames])
  const suggestions = useMemo(
    () => computeSuggestions(clients, taken).filter(s => !dismissed.has(s.id)),
    [clients, taken, dismissed],
  )

  if (suggestions.length === 0) return null

  const create = async (s: Suggestion) => {
    setCreating(s.id)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()

    const { data: portfolio, error } = await sb.from('portfolios').insert({
      name: s.name,
      description: s.reason,
      color: s.color,
      created_by: user?.id,
    } as never).select().single()

    if (error || !portfolio) {
      setCreating(null)
      toast.error(`Errore: ${error?.message ?? 'creazione fallita'}`)
      return
    }

    const { error: projErr } = await sb.from('portfolio_projects').insert(
      s.projectIds.map(project_id => ({ portfolio_id: portfolio.id, project_id, priority: 'media' })) as never,
    )
    if (projErr) {
      // La raccolta esiste ma è vuota: meglio rimuoverla che lasciarla monca.
      await sb.from('portfolios').delete().eq('id', portfolio.id)
      setCreating(null)
      toast.error(`Errore: ${projErr.message}`)
      return
    }

    const clientIds = Array.from(new Set(
      clients.filter(c => c.projects.some(p => s.projectIds.includes(p.id))).map(c => c.id),
    ))
    if (clientIds.length > 0) {
      await sb.from('portfolio_clients').insert(
        clientIds.map(client_id => ({ portfolio_id: portfolio.id, client_id, priority: 'media' })) as never,
      )
    }

    setCreating(null)
    toast.success(`Raccolta “${s.name}” creata con ${s.projectIds.length} progetti`)
    onCreated()
  }

  return (
    <section aria-label="Raccolte suggerite" className="mb-5">
      <p className="text-2xs uppercase tracking-wider text-text-tertiary font-bold mb-2 flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
        Raccolte suggerite
      </p>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {suggestions.map(s => (
          <li key={s.id}
            className="group relative flex items-start gap-3 rounded-xl border border-border bg-surface p-3 hover:border-border-strong transition-colors">
            <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} aria-hidden="true" />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{s.name}</p>
              <p className="text-2xs text-text-tertiary leading-snug">{s.reason}</p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => create(s)}
                disabled={creating === s.id}
                aria-label={`Crea la raccolta ${s.name}`}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gold-dim text-gold-text text-2xs font-semibold hover:bg-gold/20 transition-colors disabled:opacity-50"
              >
                {creating === s.id
                  ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                  : <Plus className="w-3 h-3" aria-hidden="true" />}
                {s.projectIds.length}
              </button>
              <button
                onClick={() => setDismissed(prev => new Set(prev).add(s.id))}
                aria-label={`Ignora il suggerimento ${s.name}`}
                className="p-1 rounded text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

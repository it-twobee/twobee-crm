/**
 * Pattern suggeriti per raccogliere i progetti.
 *
 * Deterministici, non generati da AI: devono essere istantanei e spiegabili.
 * Ogni pattern espone il conteggio che lo giustifica, così l'utente vede
 * *perché* gli è stato proposto.
 */

export type GroupBy = 'cliente' | 'tipo' | 'stato' | 'nessuno'

export interface PatternInput {
  id: string
  name: string
  status: string
  project_kind: string | null
  project_type: string | null
  client_id: string
  client_name: string
  taskTotal: number
  taskDone: number
}

export interface Pattern {
  id: string
  label: string
  reason: string
  count: number
  /** Filtro applicato al click. Un progetto passa se tutte le voci combaciano. */
  match: (p: PatternInput) => boolean
}

export function suggestPatterns(projects: PatternInput[]): Pattern[] {
  if (projects.length === 0) return []
  const out: Pattern[] = []

  const growth = projects.filter(p => p.project_kind === 'growth')
  if (growth.length >= 2) {
    out.push({
      id: 'growth',
      label: 'Progetti Growth',
      reason: `${growth.length} progetti di tipo growth`,
      count: growth.length,
      match: p => p.project_kind === 'growth',
    })
  }

  const digital = projects.filter(p => p.project_kind === 'digital')
  if (digital.length >= 2) {
    out.push({
      id: 'digital',
      label: 'Progetti Digital',
      reason: `${digital.length} progetti di tipo digital`,
      count: digital.length,
      match: p => p.project_kind === 'digital',
    })
  }

  const active = projects.filter(p => p.status === 'attivo')
  if (active.length >= 2 && active.length < projects.length) {
    out.push({
      id: 'attivi',
      label: 'Solo attivi',
      reason: `${active.length} su ${projects.length} sono attivi`,
      count: active.length,
      match: p => p.status === 'attivo',
    })
  }

  // Quasi finiti: ≥80% di task completate ma non ancora chiusi.
  const nearlyDone = projects.filter(p =>
    p.status !== 'completato' && p.taskTotal > 0 && p.taskDone / p.taskTotal >= 0.8)
  if (nearlyDone.length > 0) {
    out.push({
      id: 'quasi_finiti',
      label: 'Quasi conclusi',
      reason: `${nearlyDone.length} oltre l’80% ma ancora aperti`,
      count: nearlyDone.length,
      match: p => p.status !== 'completato' && p.taskTotal > 0 && p.taskDone / p.taskTotal >= 0.8,
    })
  }

  // Fermi: nessuna task completata ma il progetto è attivo.
  const stalled = projects.filter(p => p.status === 'attivo' && p.taskTotal > 0 && p.taskDone === 0)
  if (stalled.length > 0) {
    out.push({
      id: 'fermi',
      label: 'Non avviati',
      reason: `${stalled.length} attivi senza task completate`,
      count: stalled.length,
      match: p => p.status === 'attivo' && p.taskTotal > 0 && p.taskDone === 0,
    })
  }

  // Un cliente con molti progetti merita una raccolta dedicata.
  const byClient = new Map<string, number>()
  for (const p of projects) byClient.set(p.client_name, (byClient.get(p.client_name) ?? 0) + 1)
  const [topClient, topCount] = Array.from(byClient.entries()).sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  if (topCount >= 3) {
    out.push({
      id: `cliente_${topClient}`,
      label: topClient,
      reason: `${topCount} progetti per questo cliente`,
      count: topCount,
      match: p => p.client_name === topClient,
    })
  }

  return out.sort((a, b) => b.count - a.count).slice(0, 5)
}

export function groupProjects(projects: PatternInput[], by: GroupBy): { key: string; items: PatternInput[] }[] {
  if (by === 'nessuno') return [{ key: '', items: projects }]

  const keyOf = (p: PatternInput) =>
    by === 'cliente' ? p.client_name
    : by === 'tipo'   ? (p.project_kind ?? 'Non classificato')
    : p.status

  const map = new Map<string, PatternInput[]>()
  for (const p of projects) {
    const k = keyOf(p)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(p)
  }
  return Array.from(map.entries())
    .map(([key, items]) => ({ key, items }))
    .sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key))
}

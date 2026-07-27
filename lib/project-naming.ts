/**
 * Naming convention unica di progetto (scelta 2026-07-27).
 *
 *   Progetto    ACME · Growth · Lead Generation
 *   Workstream  ACME · Lead Generation — Setup
 *   Milestone   M1 · Kickoff e brief
 *   Task        M1 · Brief creativo
 *
 * Il contesto si ripete su progetto e workstream perché quei nomi compaiono
 * isolati (calendario globale, ricerca, notifiche); milestone e task vivono
 * dentro la gerarchia e portano solo l'indice della milestone.
 *
 * Ogni `xxxName()` ha il suo `bareXxx()` inverso: applicare la convention a un
 * nome già conforme è idempotente, e rinominare il cliente non impila prefissi.
 */

export const INTERNAL_CLIENT_LABEL = 'TWO BEE'

const AREA_LABEL: Record<string, string> = {
  marketing: 'Marketing', growth: 'Growth', digital: 'Digital',
}

export type NamingCtx = {
  /** null = progetto interno */
  client: string | null
  area: string
  service: string
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
export const clientLabel = (client: string | null) => clean(client || INTERNAL_CLIENT_LABEL)
export const areaLabel = (area: string) => AREA_LABEL[area] ?? clean(area)

export function projectName(ctx: NamingCtx): string {
  return [clientLabel(ctx.client), areaLabel(ctx.area), clean(ctx.service)].filter(Boolean).join(' · ')
}

export function workstreamName(ctx: NamingCtx, title: string): string {
  const prefix = `${clientLabel(ctx.client)} · ${clean(ctx.service)}`
  const bare = bareWorkstream(title, ctx)
  // il workstream che dà il nome al progetto non ripete se stesso
  if (!bare || bare.toLowerCase() === clean(ctx.service).toLowerCase()) return prefix
  return `${prefix} — ${bare}`
}

export function milestoneName(index: number, title: string): string {
  const bare = bareMilestone(title)
  return bare ? `M${index + 1} · ${bare}` : `M${index + 1}`
}

export function taskName(milestoneIndex: number, title: string): string {
  const bare = bareTask(title)
  return bare ? `M${milestoneIndex + 1} · ${bare}` : bare
}

// ── inversi: tolgono il prefisso se già presente ────────────────────────────
const MS_PREFIX = /^M\d+\s*·\s*/

export function bareMilestone(title: string): string {
  return clean(title.replace(MS_PREFIX, ''))
}
export function bareTask(title: string): string {
  return clean(title.replace(MS_PREFIX, ''))
}
export function bareWorkstream(title: string, ctx: NamingCtx): string {
  const prefix = `${clientLabel(ctx.client)} · ${clean(ctx.service)}`
  const t = clean(title)
  if (t === prefix) return ''
  return t.startsWith(`${prefix} — `) ? clean(t.slice(prefix.length + 3)) : t
}

/** true se il nome è già quello che la convention produrrebbe */
export const isConform = (actual: string, expected: string) => clean(actual) === clean(expected)

/**
 * Fuori dal wizard non conosciamo cliente e servizio: li rileggiamo dal nome del
 * progetto, che la convention scrive come `Cliente · Area · Servizio`.
 * Torna null se il nome non è conforme (progetti vecchi o rinominati a mano).
 */
export function workstreamPrefixFromProjectName(name: string): string | null {
  const parts = clean(name).split('·').map(s => s.trim()).filter(Boolean)
  if (parts.length < 3) return null
  return `${parts[0]} · ${parts.slice(2).join(' · ')}`
}

/** applica (una sola volta) il prefisso di workstream a un titolo */
export function applyWorkstreamPrefix(prefix: string, title: string): string {
  const t = clean(title)
  if (t === prefix) return prefix
  const bare = t.startsWith(`${prefix} — `) ? clean(t.slice(prefix.length + 3)) : t
  return bare ? `${prefix} — ${bare}` : prefix
}

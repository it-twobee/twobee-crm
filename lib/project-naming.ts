/**
 * Naming convention unica di progetto (scelta 2026-07-27).
 *
 *   Progetto    ACME · Growth · Lead Generation
 *   Workstream  ACME · Lead Generation — Setup
 *   Milestone   Kickoff e brief
 *   Task        Brief creativo
 *
 * Il contesto si ripete su progetto e workstream perché quei nomi compaiono
 * isolati (calendario globale, ricerca, notifiche); milestone e task vivono
 * dentro la gerarchia e hanno il titolo libero.
 *
 * §485 — milestone e task portavano l'indice della milestone, «M1 · …». Tolto
 * il 21 ottobre 2026 su richiesta di chi le usa: il numero confondeva più di
 * quanto ordinasse — cambiava se si aggiungeva una consegna in mezzo, e una
 * task «M2 · …» dentro la milestone 3 diceva una cosa falsa. L'ordine lo dà la
 * data, e il numero accanto al titolo nel riquadro lo calcola la pagina. I
 * `bareXxx()` restano: tolgono il prefisso a un nome vecchio.
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

export function milestoneName(title: string): string {
  return bareMilestone(title)
}

export function taskName(title: string): string {
  return bareTask(title)
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

/** toglie il prefisso, se c'è: quello che resta è il nome del workstream */
export function stripWorkstreamPrefix(prefix: string, title: string): string {
  const t = clean(title)
  if (t === prefix) return ''
  return t.startsWith(`${prefix} — `) ? clean(t.slice(prefix.length + 3)) : t
}

/** applica (una sola volta) il prefisso di workstream a un titolo */
export function applyWorkstreamPrefix(prefix: string, title: string): string {
  const bare = stripWorkstreamPrefix(prefix, title)
  if (!bare) return prefix
  /* §394 — stessa regola di `workstreamName`: il workstream che dà il nome al
     progetto non ripete se stesso. Scegliendo a catalogo la voce che il
     progetto porta nel nome, senza questa riga usciva «ACME · Lead Generation
     — Lead Generation». */
  const servizio = prefix.split('·').slice(1).join('·').trim()
  if (servizio && bare.toLowerCase() === servizio.toLowerCase()) return prefix
  return `${prefix} — ${bare}`
}

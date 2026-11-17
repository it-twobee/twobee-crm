import { matchingPlan, type MatchMovement, type MatchDocument } from '@/lib/lab-matching'
export type MatchSuggestion = { id: string; movements: string[]; invoices: string[]; score: number; level: 'alta' | 'media' | 'bassa'; reasons: string[]; warnings: string[]; total: number; currency: string; exact: boolean }
export type SuggestionHistory = { status: string; verified_at: string | null; items: { tx_id: string; invoice_id: string }[] }
type Signal = { movement: MatchMovement; invoice: MatchDocument; name: number; reference: boolean; score: number; reasons: string[]; warnings: string[]; datePoints: number }
const cents = (n: number) => Math.round(n * 100)
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const ignored = new Set(['srl', 'srls', 'spa', 'sas', 'snc', 'ltd', 'limited', 'inc', 'llc', 'societa', 'company', 'the', 'studio', 'group', 'gruppo', 'services', 'servizi', 'italia', 'italy', 'ireland', 'emessa', 'ricevuta', 'fpr'])
const words = (s: string) => Array.from(new Set(normalize(s).split(/\s+/).filter(w => w.length >= 3 && /[a-z]/.test(w) && !ignored.has(w))))
function closeWord(a: string, b: string) {
  if (a === b) return 1
  if (a.length >= 5 && b.length >= 5 && Math.min(a.length, b.length) / Math.max(a.length, b.length) >= .7 && (a.startsWith(b) || b.startsWith(a))) return .82
  if (a.length < 5 || b.length < 5 || a.length > 48 || b.length > 48 || Math.abs(a.length - b.length) > 2) return 0
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) { const current = [i]; for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1])); previous = current }
  return previous[b.length] <= (Math.min(a.length, b.length) >= 9 ? 2 : 1) ? .78 : 0
}
const brands = [['meta', 'facebook', 'facebk'], ['google'], ['microsoft'], ['amazon']]
function nameSignal(name: string, text: string, cache: Map<string, string[]>) {
  const tokens = (s: string) => { const found = cache.get(s); if (found) return found; const value = words(s); cache.set(s, value); return value }
  const a = tokens(name), b = tokens(text)
  if (!a.length || !b.length) return { value: 0, approximate: false, brand: false, compact: false }
  const hits = a.map(w => Math.max(0, ...b.map(x => closeWord(w, x))))
  const brand = brands.some(names => a.some(w => names.includes(w)) && b.some(w => names.includes(w)))
  const coverage = hits.reduce((s, n) => s + n, 0) / a.length
  const joined = a.join(''), hay = normalize(text).replaceAll(' ', '')
  const compact = coverage < .95 && joined.length >= 7 && (hay.includes(joined) || a.length === 2 && hay.includes([...a].reverse().join('')))
  const value = Math.max(coverage, brand ? .9 : 0, compact ? 1 : 0)
  return { value, approximate: !brand && !compact && hits.some(n => n > 0 && n < 1), brand, compact }
}
function documentReference(number: string, text: string) {
  const raw = number.trim(), hay = normalize(text)
  if (!raw || !/\d/.test(raw)) return false
  const code = raw.match(/\d+\s*[\/-]\s*\d{2,4}/)?.[0]
  if (code && !/\d+\s*[\/-]\s*\d+\s*[\/-]\s*\d+/.test(raw)) {
    const [first, last] = code.split(/[\/-]/).map(s => s.trim().replace(/^0+(?=\d)/, ''))
    return new RegExp(`(?:^|[^a-z0-9/\\-]|\\bfpr\\s*)0*${first}\\s*[/\\-]\\s*0*${last}(?:$|[^a-z0-9/\\-])`, 'i').test(text)
  }
  const normalized = normalize(raw)
  if (/^\d+$/.test(normalized)) return new RegExp(`(?:^| )(?:fattura|fatt|invoice|inv|ft) +(?:(?:n|nr|numero) +)?0*${normalized.replace(/^0+(?=\d)/, '')}(?: |$)`).test(hay)
  if (normalized.length < 4) return false
  const escaped = normalized.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(' +')
  return new RegExp(`(?:^| )${escaped}(?: |$)`).test(hay)
}
const entityName = (d: MatchDocument) => (d.counterpartyName ?? d.label.split('·').slice(1).join('·')) || d.label
const historyKey = (m: MatchMovement, d: MatchDocument) => `${normalize(m.label)}|${words(entityName(d)).join(' ')}`
function verifiedAliases(movements: MatchMovement[], invoices: MatchDocument[], history: SuggestionHistory[]) {
  const byMovement = new Map(movements.map(m => [m.id, m])), byInvoice = new Map(invoices.map(d => [d.id, d]))
  const subjects = new Map<string, Set<string>>(), samples = new Map<string, { movements: Set<string>; invoices: Set<string>; bank: string }>()
  const generic = new Set(['bonifico', 'pagamento', 'transfer', 'card', 'carta', 'accredito', 'addebito', 'saldo', 'rimborso', 'payment', 'pay'])
  for (const h of history.filter(h => h.status === 'active' && h.verified_at)) for (const item of h.items) {
    const m = byMovement.get(item.tx_id), d = byInvoice.get(item.invoice_id)
    if (!m || !d || !words(m.label).some(w => !generic.has(w)) || /\b(paypal|stripe|sumup|satispay)\b/.test(normalize(m.label))) continue
    const bank = normalize(m.label), subject = words(entityName(d)).join(' ')
    if (!subject) continue
    if (!subjects.has(bank)) subjects.set(bank, new Set())
    subjects.get(bank)!.add(subject)
    const key = historyKey(m, d), sample = samples.get(key) ?? { movements: new Set<string>(), invoices: new Set<string>(), bank }
    sample.movements.add(m.id); sample.invoices.add(d.id); samples.set(key, sample)
  }
  return new Map(Array.from(samples).filter(([, s]) => s.movements.size >= 2 && s.invoices.size >= 2 && subjects.get(s.bank)?.size === 1).map(([key, s]) => [key, s.invoices.size]))
}
function signal(m: MatchMovement, d: MatchDocument, cache: Map<string, string[]>, aliases: Map<string, number>): Signal {
  const name = nameSignal(entityName(d), `${m.label} ${m.description ?? ''}`, cache)
  const precedents = aliases.get(historyKey(m, d)) ?? 0
  const identity = Math.max(name.value, precedents ? .9 : 0)
  const reference = documentReference(d.number ?? '', m.description ?? '')
  const exact = cents(m.available!) === cents(d.remaining!), delta = Math.abs(cents(m.available!) - cents(d.remaining!))
  const reasons: string[] = [], warnings: string[] = []
  let amountPoints = 0
  if (exact) { amountPoints = 45; reasons.push('Importo disponibile uguale al residuo fattura') }
  else if (delta <= Math.min(500, Math.max(100, cents(d.remaining!) * .01))) { amountPoints = 12; reasons.push('Importi vicini'); warnings.push('Gli importi differiscono: verifica eventuali residui, senza dedurre commissioni.') }
  if (!exact && amountPoints === 0 && (identity >= .8 || reference) && Math.min(m.available!, d.remaining!) / Math.max(m.available!, d.remaining!) >= .1) { amountPoints = 8; reasons.push('Possibile pagamento parziale o cumulativo') }
  if (name.compact) reasons.push('Nome riconosciuto anche senza spazi o con punteggiatura diversa')
  else if (name.value >= .95) reasons.push('Nome riconosciuto nella controparte o nella causale')
  else if (name.brand) reasons.push('Marchio riconosciuto nella controparte e nella fattura')
  else if (name.value >= .45) reasons.push(name.approximate ? 'Nome simile, con abbreviazioni o differenze di scrittura' : 'Parte del nome coincide')
  if (name.approximate) warnings.push('Il nome è simile, non identico: controlla il soggetto.')
  else if (name.value > 0 && name.value < .7) warnings.push('Il nome coincide solo in parte.')
  if (precedents) reasons.push(`Corrispondenza già usata in ${precedents} fatture verificate e movimenti distinti`)
  if (reference) reasons.push('Numero fattura riconosciuto nella causale')
  if (identity < .45 && !reference) warnings.push('Controparte non riconosciuta: l’importo da solo non identifica la fattura.')
  const gap = Math.round((Date.parse(`${m.date}T00:00:00Z`) - Date.parse(`${d.date}T00:00:00Z`)) / 86400000)
  const datePoints = gap >= 0 && gap <= 45 ? 10 : gap > 45 && gap <= 120 ? 5 : gap < -45 ? -35 : gap < 0 ? -15 : 0
  if (gap >= 0 && gap <= 120) reasons.push(`Pagamento ${gap} giorni dopo l’emissione`)
  if (gap < 0) warnings.push(`Movimento ${-gap} giorni prima dell’emissione: verifica l’anticipo.`)
  let score = Math.min(identity < .45 && !reference ? 50 : gap < -45 ? 40 : 99, Math.round(amountPoints + identity * 35 + (reference ? 25 : 0) + datePoints))
  if (name.approximate && !reference) score = Math.min(score, 79)
  return { movement: m, invoice: d, name: identity, reference, score, reasons, warnings, datePoints }
}
/** Ranking hints, not calibrated probabilities. Every proposal must still pass the canonical share planner. */
export function suggestReconciliations(movements: MatchMovement[], invoices: MatchDocument[], anchorMovements: string[] = [], anchorInvoices: string[] = [], history: SuggestionHistory[] = []) {
  const eligibleM = movements.filter(m => !m.why && m.available != null && Number.isFinite(m.available) && m.available > 0)
  const eligibleD = invoices.filter(d => !d.why && d.remaining != null && Number.isFinite(d.remaining) && d.remaining > 0)
  const selectedM = new Set(anchorMovements), selectedD = new Set(anchorInvoices)
  if (selectedM.size > 1 && selectedD.size > 1 || anchorMovements.some(id => !eligibleM.some(m => m.id === id)) || anchorInvoices.some(id => !eligibleD.some(d => d.id === id))) return { suggestions: [] as MatchSuggestion[], limited: false }
  const recent = <T extends { id: string; date: string }>(rows: T[], ids: Set<string>) => [...rows].sort((a, b) => Number(ids.has(b.id)) - Number(ids.has(a.id)) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).slice(0, 400)
  const ms = recent(eligibleM, selectedM), ds = recent(eligibleD, selectedD)
  let limited = eligibleM.length > ms.length || eligibleD.length > ds.length
  const aliases = verifiedAliases(movements, invoices, history)
  const signals: Signal[] = [], results = new Map<string, MatchSuggestion>()
  const cache = new Map<string, string[]>(), seen = new Set<string>()
  const scan = (left: MatchMovement[], right: MatchDocument[]) => {
    for (const m of left) for (const d of right) {
      const key = `${m.id}|${d.id}`
      if (seen.has(key) || !m.currency || m.currency !== d.currency || Math.sign(m.signedAmount) !== d.direction) continue
      if (signals.length >= 25000) { limited = true; return }
      seen.add(key); signals.push(signal(m, d, cache, aliases))
    }
  }
  if (selectedM.size) scan(ms.filter(m => selectedM.has(m.id)), ds)
  if (selectedD.size) scan(ms, ds.filter(d => selectedD.has(d.id)))
  scan(ms, ds)
  let singles = 0, groups = 0
  const add = (items: Signal[], group: boolean) => {
    const mids = Array.from(new Set(items.map(s => s.movement.id))).sort(), dids = Array.from(new Set(items.map(s => s.invoice.id))).sort()
    if (anchorMovements.some(id => !mids.includes(id)) || anchorInvoices.some(id => !dids.includes(id))) return
    if (group ? groups >= 800 : singles >= 800) { limited = true; return }
    const plan = matchingPlan(ms, ds, mids, dids)
    if (plan.issues.length) return
    const exact = plan.movementRemainders.every(r => r.amount === 0) && plan.documentRemainders.every(r => r.amount === 0)
    const name = items.reduce((n, s) => n + s.name, 0) / items.length
    let score = group ? Math.round(45 + 35 * name + items.reduce((n, s) => n + s.datePoints, 0) / items.length + (items.every(s => s.reference) ? 20 : 0)) : items[0].score
    const warnings = Array.from(new Set(items.flatMap(s => s.warnings)))
    if (items.some(s => s.datePoints === -35)) score = Math.min(score, 40)
    if (name < .45 && !items.every(s => s.reference)) score = Math.min(score, 50)
    if (items.some(s => s.warnings.some(w => w.startsWith('Il nome è simile'))) && !items.every(s => s.reference)) score = Math.min(score, 79)
    if (score < 38) return
    const reasons = group ? [mids.length === 1 ? 'La somma dei residui fattura coincide con il movimento' : 'La somma dei movimenti coincide con il residuo fattura', ...Array.from(new Set(items.flatMap(s => s.reasons).filter(r => !r.startsWith('Importo') && !r.startsWith('Pagamento'))))] : [...items[0].reasons]
    if (!exact) warnings.push('La proposta lascia un residuo sul movimento o sulla fattura.')
    if (items.some(s => s.name < .7 && !s.reference)) warnings.push('Controlla ogni controparte del gruppo.')
    const id = `${mids.join(',')}|${dids.join(',')}`
    score = Math.max(0, Math.min(99, score))
    if (!results.has(id)) { if (group) groups++; else singles++ }
    results.set(id, { id, movements: mids, invoices: dids, score, level: score >= 80 && exact ? 'alta' : score >= 60 ? 'media' : 'bassa', reasons, warnings, total: plan.total, currency: items[0].movement.currency, exact })
  }
  for (const s of [...signals].sort((a, b) => b.score - a.score || a.movement.id.localeCompare(b.movement.id) || a.invoice.id.localeCompare(b.invoice.id))) add([s], false)
  const combinations = (pool: Signal[], amount: (s: Signal) => number, target: number) => {
    const sorted = [...pool].filter(s => s.name >= .55 || s.reference).sort((a, b) => b.score - a.score || a.movement.id.localeCompare(b.movement.id) || a.invoice.id.localeCompare(b.invoice.id))
    if (sorted.length > 12) limited = true
    const top = sorted.slice(0, 12)
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const sum = amount(top[i]) + amount(top[j])
      if (sum === target) add([top[i], top[j]], true)
      if (sum < target) for (let k = j + 1; k < top.length; k++) if (sum + amount(top[k]) === target) add([top[i], top[j], top[k]], true)
    }
  }
  if (selectedM.size <= 1) for (const m of ms.filter(m => !selectedM.size || selectedM.has(m.id))) combinations(signals.filter(s => s.movement.id === m.id), s => cents(s.invoice.remaining!), cents(m.available!))
  if (selectedD.size <= 1) for (const d of ds.filter(d => !selectedD.size || selectedD.has(d.id))) combinations(signals.filter(s => s.invoice.id === d.id), s => cents(s.movement.available!), cents(d.remaining!))
  const proposals = Array.from(results.values())
  const original = new Map(proposals.map(p => [p.id, p.score]))
  const rawCompeting = new Map<string, Signal[]>()
  for (const s of signals) for (const key of [`m:${s.movement.id}`, `d:${s.invoice.id}`]) { const list = rawCompeting.get(key); if (list) list.push(s); else rawCompeting.set(key, [s]) }
  const competing = new Map<string, MatchSuggestion[]>()
  for (const p of proposals) for (const key of [...p.movements.map(id => `m:${id}`), ...p.invoices.map(id => `d:${id}`)]) { const list = competing.get(key); if (list) list.push(p); else competing.set(key, [p]) }
  for (const p of proposals) {
    const rival = [...p.movements.map(id => `m:${id}`), ...p.invoices.map(id => `d:${id}`)].some(key => competing.get(key)?.some(other => other.id !== p.id && original.get(other.id)! >= original.get(p.id)! - 8))
    const rawRival = [...p.movements.map(id => `m:${id}`), ...p.invoices.map(id => `d:${id}`)].some(key => rawCompeting.get(key)?.some(s => s.score >= original.get(p.id)! - 8 && (!p.movements.includes(s.movement.id) || !p.invoices.includes(s.invoice.id))))
    if (rival || rawRival) { p.warnings.push('Esistono altri abbinamenti plausibili, anche fuori dalla selezione corrente.'); p.score = Math.min(p.score, 69); p.level = p.score >= 60 ? 'media' : 'bassa' }
  }
  return { suggestions: proposals.sort((a, b) => b.score - a.score || Number(b.exact) - Number(a.exact) || a.id.localeCompare(b.id)).slice(0, 40), limited: limited || proposals.length > 40 }
}

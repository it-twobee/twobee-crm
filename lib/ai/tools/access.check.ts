/**
 * Gate della matrice dei ruoli dell'assistente.
 *
 *   npx tsx lib/ai/tools/access.check.ts
 *
 * Verifica chi vede quale strumento. È l'unico modo di provare le righe che
 * riguardano `freelance` e `partner`: sul database quei due ruoli non hanno un
 * account, quindi a schermo non si possono nemmeno riprodurre.
 */
import type { AppRole, PermissionSection, PermissionAction } from '@/lib/types/database'
import { ADMIN_ROLES, EXTERNAL_ROLES } from '@/lib/permissions'
import { TOOL_ACCESS, TOOL_LABELS, accessFor, clientsTableFor, type AccessCtx } from './access'

let passed = 0
const failures: string[] = []

function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++
  else failures.push(`${label}\n     atteso:  ${JSON.stringify(expected)}\n     ottenuto: ${JSON.stringify(actual)}`)
}

/** Permessi di comodo: `deny` elenca le sezioni negate a quel ruolo. */
function ctx(appRole: AppRole, opts: { surface?: 'dashboard' | 'workspace'; deny?: PermissionSection[] } = {}): AccessCtx {
  const deny = new Set(opts.deny ?? [])
  const isAdmin = ADMIN_ROLES.includes(appRole)
  return {
    appRole,
    isSuper: appRole === 'super_admin',
    isAdmin,
    isManager: isAdmin || appRole === 'manager',
    isExternal: EXTERNAL_ROLES.includes(appRole),
    surface: opts.surface ?? (isAdmin ? 'dashboard' : 'workspace'),
    can: (section: PermissionSection, _action: PermissionAction) => !deny.has(section),
  }
}

const allow = (c: AccessCtx) => Object.keys(TOOL_ACCESS).filter((n) => TOOL_ACCESS[n](c)).sort()
const sees = (c: AccessCtx, name: string) => accessFor(name)(c)

const WRITE = ['assign_task', 'complete_task', 'create_milestone', 'create_task', 'delete_task', 'update_task']
const PROJECT_WRITE = ['create_project', 'create_workstream']

// ─── super admin: tutto ──────────────────────────────────────────────────────
const su = ctx('super_admin')
check('super_admin vede tutti gli strumenti', allow(su).length, Object.keys(TOOL_ACCESS).length)
check('super_admin vede get_financials', sees(su, 'get_financials'), true)
check('super_admin vede create_project', sees(su, 'create_project'), true)

// ─── admin senza permesso mrr: il doppio gate deve reggere ───────────────────
const adminNoMrr = ctx('admin', { deny: ['mrr'] })
check('admin senza permesso mrr NON vede get_financials', sees(adminNoMrr, 'get_financials'), false)
check('admin senza permesso mrr vede comunque list_clients', sees(adminNoMrr, 'list_clients'), true)
check('admin vede create_project', sees(ctx('admin'), 'create_project'), true)

// ─── manager: crea progetti, non vede i numeri ───────────────────────────────
const manager = ctx('manager')
check('manager vede create_project', sees(manager, 'create_project'), true)
check('manager vede create_workstream', sees(manager, 'create_workstream'), true)
check('manager NON vede get_financials', sees(manager, 'get_financials'), false)
check('manager vede tutta la scrittura su task', WRITE.every((n) => sees(manager, n)), true)

// ─── senior: scrive task, NON crea progetti (lo rifiuta il server) ───────────
const senior = ctx('senior')
check('senior NON vede create_project', sees(senior, 'create_project'), false)
check('senior NON vede create_workstream', sees(senior, 'create_workstream'), false)
check('senior vede update_task', sees(senior, 'update_task'), true)
check('senior NON vede get_financials', sees(senior, 'get_financials'), false)

// ─── junior: la riga della matrice nel brief ─────────────────────────────────
const junior = ctx('junior')
check('junior NON vede get_financials', sees(junior, 'get_financials'), false)
check('junior NON vede create_project', sees(junior, 'create_project'), false)
check('junior vede complete_task', sees(junior, 'complete_task'), true)
check('junior vede delete_task (la conferma la chiede la UI)', sees(junior, 'delete_task'), true)
check('junior vede list_clients dal workspace', sees(junior, 'list_clients'), true)

// ─── stage: come junior ──────────────────────────────────────────────────────
const stage = ctx('stage')
check('stage NON vede get_financials', sees(stage, 'get_financials'), false)
check('stage NON vede create_project', sees(stage, 'create_project'), false)
check('stage vede create_task', sees(stage, 'create_task'), true)

// ─── freelance e partner: SOLA LETTURA, nessuna scrittura ────────────────────
for (const role of ['freelance', 'partner'] as AppRole[]) {
  const c = ctx(role)
  check(`${role} è esterno`, c.isExternal, true)
  check(`${role} NON vede nessuno strumento di scrittura`,
    [...WRITE, ...PROJECT_WRITE].filter((n) => sees(c, n)), [])
  check(`${role} vede le letture di base`,
    ['list_my_tasks', 'get_task', 'list_projects', 'search'].every((n) => sees(c, n)), true)
  check(`${role} NON vede get_financials`, sees(c, 'get_financials'), false)
}

// ─── il catalogo non cambia forma per la surface, tranne i clienti ───────────
check('un manager in dashboard vede gli stessi strumenti che nel workspace',
  allow(ctx('manager', { surface: 'dashboard' })).length, allow(ctx('manager', { surface: 'workspace' })).length)
check('senza permesso clienti e fuori dal workspace, list_clients non c è',
  sees(ctx('junior', { surface: 'dashboard', deny: ['clienti'] }), 'list_clients'), false)
check('nel workspace list_clients c è anche senza permesso (la VIEW azzera i numeri)',
  sees(ctx('junior', { surface: 'workspace', deny: ['clienti'] }), 'list_clients'), true)

// ─── etichette: nessuna mancante, nessuna orfana ─────────────────────────────
// Sono ciò che l'utente legge nella riga di attività. Una mancante mostra il
// nome tecnico dello strumento, una orfana è un tool che non esiste più.
check('ogni strumento ha un\'etichetta',
  Object.keys(TOOL_ACCESS).filter((n) => !TOOL_LABELS[n]), [])
check('nessuna etichetta senza strumento',
  Object.keys(TOOL_LABELS).filter((n) => !TOOL_ACCESS[n]), [])

// ─── sorgente dei clienti: §211/§213 ────────────────────────────────────────
// La tabella vera è leggibile da tutto lo staff (092), quindi la VIEW non è una
// comodità: è l'unica cosa che azzera l'MRR e nasconde i clienti riservati.
check('manager nel workspace legge la VIEW', clientsTableFor(ctx('manager', { surface: 'workspace' })), 'clients_workspace')
check('junior nel workspace legge la VIEW', clientsTableFor(ctx('junior', { surface: 'workspace' })), 'clients_workspace')
check('freelance legge la VIEW', clientsTableFor(ctx('freelance')), 'clients_workspace')
check('admin in dashboard legge la tabella', clientsTableFor(ctx('admin', { surface: 'dashboard' })), 'clients')
check('super_admin in dashboard legge la tabella', clientsTableFor(ctx('super_admin', { surface: 'dashboard' })), 'clients')
check('un admin che apre il workspace resta sulla tabella',
  clientsTableFor(ctx('admin', { surface: 'workspace' })), 'clients')
check('nessun ruolo non-admin arriva mai alla tabella vera',
  (['manager', 'senior', 'junior', 'stage', 'freelance', 'partner'] as AppRole[])
    .filter((r) => clientsTableFor(ctx(r, { surface: 'workspace' })) === 'clients'), [])

// ─── uno strumento non dichiarato non entra nel catalogo ─────────────────────
let threw = false
try { accessFor('drop_database') } catch { threw = true }
check('accessFor lancia su uno strumento non dichiarato', threw, true)

// ─── nessuno strumento di scrittura è visibile a un esterno, per costruzione ──
check('nessuna regola di scrittura ammette un esterno',
  [...WRITE, ...PROJECT_WRITE].filter((n) => TOOL_ACCESS[n](ctx('freelance'))), [])

if (failures.length) {
  console.error(`\n✗ ${failures.length} controlli falliti su ${passed + failures.length}\n`)
  failures.forEach((f) => console.error(`  - ${f}`))
  process.exit(1)
}
console.log(`Tutti i controlli passano (${passed}).`)

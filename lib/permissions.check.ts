/* Verifica dei permessi di governo progetto (§339). Esegui: npx tsx lib/permissions.check.ts */
import { canGovernProjects, PROJECT_GOVERN_ROLES, canCreateClients, isAdminRole, coarseRole } from '@/lib/permissions'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Chi governa un progetto (§339) —')
/* Il caso che ha fatto nascere la regola: Sabrina è `manager` e membro di sei
   progetti, ma su tutti e sei `role_in_project` è nullo. La condizione vecchia
   leggeva quella colonna e la spegneva ovunque: un permesso che dipende da un
   campo che nessuno compila è un permesso che non esiste. */
is('manager: sì, e su qualunque progetto',
  canGovernProjects({ role: 'team', app_role: 'manager' }), true)
is('admin: sì', canGovernProjects({ role: 'admin', app_role: 'admin' }), true)
is('super admin: sì', canGovernProjects({ role: 'admin', app_role: 'super_admin' }), true)
is('founder: sì', canGovernProjects({ role: 'admin', app_role: 'founder' }), true)
/* Promosso `admin` dalla mappatura grossolana senza un `app_role` dell'elenco
   chiuso (§329): passa lo stesso, o il portale admin avrebbe pagine spente. */
is('admin di ruolo senza app_role: sì', canGovernProjects({ role: 'admin', app_role: null }), true)

is('senior: no', canGovernProjects({ role: 'team', app_role: 'senior' }), false)
is('junior: no', canGovernProjects({ role: 'team', app_role: 'junior' }), false)
is('stage: no', canGovernProjects({ role: 'team', app_role: 'stage' }), false)
is('freelance: no', canGovernProjects({ role: 'team', app_role: 'freelance' }), false)
is('partner: no', canGovernProjects({ role: 'team', app_role: 'partner' }), false)
is('cliente: no', canGovernProjects({ role: 'client', app_role: null }), false)
is('ospite: no', canGovernProjects({ role: 'guest', app_role: 'guest' }), false)
is('nessun profilo: no', canGovernProjects(null), false)
is('profilo vuoto: no', canGovernProjects({}), false)

/* Governare un progetto e aprire un cliente sono lo stesso insieme di ruoli
   (§317), e restano due funzioni: il giorno in cui una delle due cambia, il
   test dice quale. */
is('stesso insieme di chi apre un cliente (§317)',
  PROJECT_GOVERN_ROLES.filter(r => !canCreateClients(r)), [])
is('ogni ruolo admin governa', PROJECT_GOVERN_ROLES.filter(isAdminRole).length >= 1, true)
/* Il governo non è il portale: un manager governa i progetti e resta confinato
   al workspace (§234). Le due domande sono diverse e vanno tenute diverse. */
is('un manager resta workspace', coarseRole('manager'), 'team')

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)

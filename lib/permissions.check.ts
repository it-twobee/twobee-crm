/* Verifica dei permessi di governo progetto (§339). Esegui: npx tsx lib/permissions.check.ts */
import { readFileSync } from 'node:fs'
import { canGovernProjects, PROJECT_GOVERN_ROLES, canCreateClients, isAdminRole, coarseRole, canPreviewClientPortal, isPortalAccount, INTERNAL_COARSE_ROLES, vedeTitoliColleghi } from '@/lib/permissions'

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

console.log('\n— Anteprima cliente: manager e amministrativi —')
for (const app_role of ['super_admin', 'founder', 'admin', 'manager']) {
  is(`${app_role}: anteprima consentita`, canPreviewClientPortal({ app_role }), true)
  is(`${app_role} disattivo: anteprima negata`, canPreviewClientPortal({ app_role, is_active: false }), false)
}
for (const app_role of ['senior', 'junior', 'stage', 'freelance', 'partner', 'viewer', 'client', 'guest', null]) {
  is(`${app_role}: niente anteprima interna`, canPreviewClientPortal({ app_role }), false)
}
is('manager autorizzato dal ruolo, non dall’indirizzo', canPreviewClientPortal({ email: 'm.cristallo@twobee.it', app_role: 'manager' }), true)
is('indirizzo da solo non eleva il ruolo', canPreviewClientPortal({ email: 'm.cristallo@twobee.it', app_role: 'junior' }), false)
is('super admin storico riconosciuto', canPreviewClientPortal({ email: 'm.lucci@twobee.it' }), true)
is('account sviluppo senza promozione implicita', canPreviewClientPortal({ email: 'marco.d.lucci@gmail.com' }), false)
is('nessuna sessione: niente anteprima', canPreviewClientPortal(null), false)

console.log('\n— Chi non è un assegnatario del nostro lavoro (§409) —')
/* Il caso che ha fatto nascere la regola: un manager si è creato un accesso al
   portale di un cliente col proprio nome, e «Michele Cristallo guest» è
   comparso fra le persone a cui assegnare una milestone — su qualunque
   progetto, anche di aziende diverse. Il filtro che esisteva guardava
   `CLIENT_ROLES`, cioè solo `client`: ma un invito al portale crea un
   **guest**, e passava. */
is('guest del portale: non assegnabile', isPortalAccount({ role: 'guest', app_role: 'guest' }), true)
is('client del portale: non assegnabile', isPortalAccount({ role: 'client', app_role: 'client' }), true)
is('guest riconosciuto anche dal solo app_role', isPortalAccount({ app_role: 'guest' }), true)
is('client riconosciuto anche dal solo role', isPortalAccount({ role: 'client' }), true)
for (const app_role of ['super_admin', 'founder', 'admin', 'manager', 'senior', 'junior', 'stage', 'viewer']) {
  is(`${app_role}: uno di noi`, isPortalAccount({ role: 'team', app_role }), false)
}
/* I collaboratori esterni lavorano: restano assegnabili. Il portale `/risorsa`
   descritto nel manuale non esiste nel codice, quindi oggi nessun `guest`
   lavora per noi. */
is('freelance: assegnabile', isPortalAccount({ role: 'team', app_role: 'freelance' }), false)
is('partner: assegnabile', isPortalAccount({ role: 'team', app_role: 'partner' }), false)
is('nessun profilo: non si finge di saperlo', isPortalAccount(null), false)
is('la definizione di «uno di noi» è quella della RLS', [...INTERNAL_COARSE_ROLES], ['admin', 'team'])

/* Inventario: le pagine che costruiscono gli elenchi di assegnazione filtrano
   nella query, non nella pagina. Non previene una **settima** pagina che se ne
   dimentichi — quello non si vede a macchina — ma se qualcuno toglie il filtro
   da una di queste sei, qui si accorge. */
const SORGENTI_ASSEGNATARI = [
  'app/(dashboard)/progetti/page.tsx',
  'app/(dashboard)/progetti/[projectId]/page.tsx',
  'app/(dashboard)/progetti/[projectId]/workstream/[wsId]/page.tsx',
  'app/(workspace)/workspace/progetti/page.tsx',
  'app/(workspace)/workspace/progetti/[projectId]/page.tsx',
  'app/(workspace)/workspace/progetti/[projectId]/workstream/[wsId]/page.tsx',
]
const senzaFiltro = SORGENTI_ASSEGNATARI.filter(file => {
  const src = readFileSync(file, 'utf8')
  const query = /from\('profiles'\)[^\n]*/.exec(src)?.[0] ?? ''
  return !query.includes("in('role', INTERNAL_COARSE_ROLES)")
})
is('i profili del portale non arrivano agli elenchi di assegnazione', senzaFiltro, [])

console.log('\n— §446 · i titoli dei colleghi nel calendario —')
is('admin, manager, senior, junior, stage li leggono',
  ['admin', 'founder', 'manager', 'senior', 'junior', 'stage'].every(r => vedeTitoliColleghi(r)), true)
is('freelance, partner, viewer, cliente no',
  ['freelance', 'partner', 'viewer', 'client', null].some(r => vedeTitoliColleghi(r)), false)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)

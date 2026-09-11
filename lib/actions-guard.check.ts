/* §329 — ogni server action è una porta: chiede chi sei, o sta nell'elenco di
   quelle che non devono. Esegui: npx tsx lib/actions-guard.check.ts

   Non è un test di unità: è un inventario. Un file `'use server'` **esporta
   endpoint** — lo dice il manuale da §234 — e l'unico controllo che regge sta
   dentro l'azione. Il guaio è che una porta senza serratura non si vede
   leggendo il file giusto: si vede solo elencandoli tutti. È così che sono
   uscite `inviteChannelGuest`, che spediva inviti col ruolo scelto da chi
   chiama, e `getOrCreatePortal`, che dava il token del portale ticket di un
   cliente qualsiasi a chiunque avesse una sessione.

   L'elenco delle eccezioni è **chiuso e motivato**: quando ne serve una nuova,
   questo è il posto in cui qualcuno deve scrivere perché. */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

/**
 * Chi risponde alla domanda «chi sei, **e puoi**».
 *
 * Le due metà contano, e la prima da sola è quella che ha fatto il danno:
 * `inviteChannelGuest` la sessione la leggeva — chiedeva «chi sei» e si
 * accontentava della risposta. Autenticato non vuol dire autorizzato, e un
 * controllo che si ferma lì lascia entrare il portale cliente nelle azioni
 * dello staff. Quindi una guard, per contare, deve **leggere la sessione e
 * guardare un ruolo**.
 *
 * I nomi non si elencano a mano: ogni file chiama la sua come vuole
 * (`assertAdmin`, `requireProjectCreator`, `requireContactManager`,
 * `currentActor`), e un elenco fisso le scambierebbe per porte aperte — un
 * test che grida al lupo ventitré volte viene spento. Si riconoscono da cosa
 * fanno. Le guard condivise stanno qui sotto perché il loro corpo è altrove.
 */
const GUARD_CONDIVISE = [
  'requireEconomicsAdmin', 'requireInternalStaff', 'requireAgencyKeyManager',
  'requireStaff', 'requireAdmin',
]
const LEGGE_SESSIONE = /auth\.getUser\(|getSessionProfile\(|getSessionUser\(|getViewer\(/
/**
 * Il ruolo, comunque lo si chieda — ma **confrontato**, non nominato.
 *
 * `\brole\b` non basta: la versione vulnerabile di `inviteChannelGuest` aveva un
 * parametro che si chiamava `role` e lo passava ai metadati, quindi un test che
 * cerca la parola l'avrebbe promossa. Quello che si cerca è un confronto con un
 * ruolo, o una funzione che lo faccia.
 */
const GUARDA_UN_RUOLO = /app_role|isAdminRole|isSuperAdmin|isAdminOrAbove|ADMIN_ROLES|canSee\w+|canManage\w+|canCreate\w+|hasPermission|coarseRole|is_staff|role\s*[!=]==?\s*['\"]|select\([^)]*\brole\b/


/**
 * Le azioni che **non devono** chiedere una sessione, e perché.
 *
 * Sono tutte del portale ticket, che è un magic link: l'ospite non ha un
 * account: ha il token, e l'autorizzazione la fanno le funzioni SQL
 * SECURITY DEFINER che quel token verificano. Chiedere qui una sessione
 * chiuderebbe il portale a chi è fatto per usarlo. `getOrCreatePortal` **non**
 * è in questo elenco: distribuire il token è un gesto dello staff.
 */
const SENZA_SESSIONE: Record<string, string> = {
  'ticket-portal.ts::getPortalInfo': 'portale ospite: autorizza il token, non la sessione',
  'ticket-portal.ts::getPortalTickets': 'portale ospite: autorizza il token, non la sessione',
  'ticket-portal.ts::createPortalTicket': 'portale ospite: autorizza il token, non la sessione',
  'ticket-portal.ts::getPortalTicketMessages': 'portale ospite: autorizza il token, non la sessione',
  'ticket-portal.ts::addPortalTicketMessage': 'portale ospite: autorizza il token, non la sessione',
}

const DIR = join(process.cwd(), 'app', 'actions')

type Action = { file: string; name: string; guarded: boolean; serviceRole: boolean }

/** Le funzioni **locali** al file che leggono la sessione e guardano un ruolo. */
function guardLocali(src: string): string[] {
  const out: string[] = []
  const hits = Array.from(src.matchAll(/(?:async function|const) (\w+)\s*(?:=\s*async)?\s*\(/g))
  hits.forEach((m, i) => {
    const start = m.index!
    const end = i + 1 < hits.length ? hits[i + 1].index! : src.length
    const body = src.slice(start, end)
    if (LEGGE_SESSIONE.test(body) && GUARDA_UN_RUOLO.test(body)) out.push(m[1])
  })
  return out
}

function scan(): Action[] {
  const out: Action[] = []
  for (const file of readdirSync(DIR).filter(f => f.endsWith('.ts')).sort()) {
    const src = readFileSync(join(DIR, file), 'utf8')
    if (!src.slice(0, 200).includes("'use server'")) continue
    const vocab = [...GUARD_CONDIVISE, ...guardLocali(src)]
    const hits = Array.from(src.matchAll(/export async function (\w+)/g))
    const corpi = new Map<string, string>()
    hits.forEach((m, i) => {
      const start = m.index!
      const end = i + 1 < hits.length ? hits[i + 1].index! : src.length
      corpi.set(m[1], src.slice(start, end))
    })
    /* Un'azione può delegare a un'altra dello stesso file — `createClientQuick`
       passa da `createClientRecord`, che ha il guard (§321: «non è una seconda
       porta d'ingresso»). Si risale la catena, non si guarda solo il corpo. */
    /* `body` comincia con `export async function <nome>(`: senza togliere il
       proprio nome, un'azione che legge la sessione si darebbe il permesso da
       sola — ed è precisamente il caso che si sta cercando. */
    const diretto = (self: string, body: string) =>
      vocab.some(g => g !== self && body.includes(`${g}(`))
    const guardato = (name: string, visti = new Set<string>()): boolean => {
      if (visti.has(name)) return false
      visti.add(name)
      const body = corpi.get(name)
      if (!body) return false
      /* Il controllo può essere **dentro** l'azione, senza passare da una
         funzione a parte: `createProjectFromWizard` legge la sessione e
         confronta il ruolo in sei righe. Vale come guard. */
      if (LEGGE_SESSIONE.test(body) && GUARDA_UN_RUOLO.test(body)) return true
      if (diretto(name, body)) return true
      return Array.from(corpi.keys()).some(altro => altro !== name && body.includes(`${altro}(`) && guardato(altro, visti))
    }
    const SERVICE = /createAdminClient\(|createActorClient\(|serviceClient\(|SUPABASE_SERVICE_ROLE_KEY/
    for (const [name, body] of Array.from(corpi.entries()))
      out.push({ file, name, guarded: guardato(name), serviceRole: SERVICE.test(body) })
  }
  return out
}

const actions = scan()

console.log('\n— L\'inventario esiste —')
/* Se questo numero crolla, non è che le azioni sono sparite: è che il file si
   è spostato e il controllo sta guardando una cartella vuota, cioè passa
   sempre. Un test che non trova niente da testare è un test rotto. */
is('almeno 40 server action trovate', actions.length >= 40, true)
is('almeno 20 file scanditi', new Set(actions.map(a => a.file)).size >= 20, true)

console.log('\n— Chi salta il ruolo non salta anche la RLS —')
/* Un'azione può non guardare il ruolo: sono tante quelle che lavorano sulla
   roba di chi chiama (le proprie task, i propri ticket, la propria dashboard),
   e lì la domanda giusta la fa la RLS, riga per riga, meglio di qualunque `if`.
   Ma allora deve **passare dalla RLS**: la regola è che si può saltare il
   controllo di ruolo, o il client di servizio, non tutti e due. Le due falle di
   §329 stavano esattamente in quell'incrocio — sessione letta, ruolo no,
   service role sì. */
const scoperte = actions.filter(a => !a.guarded && a.serviceRole).map(a => `${a.file}::${a.name}`)
const inattese = scoperte.filter(k => !(k in SENZA_SESSIONE))
is('nessuna azione col service role senza ruolo', inattese, [])
const soloRls = actions.filter(a => !a.guarded && !a.serviceRole).length
is('le azioni che si affidano alla RLS sono dichiarate', soloRls > 0, true)
console.log(`    ${soloRls} azioni senza controllo di ruolo passano solo dalla RLS: è la loro difesa.`)

console.log('\n— L\'elenco delle eccezioni è aggiornato —')
/* Un'eccezione che non serve più è peggio di una mancante: resta scritta come
   se qualcuno l'avesse decisa oggi. */
const obsolete = Object.keys(SENZA_SESSIONE).filter(k => !scoperte.includes(k))
is('nessuna eccezione obsoleta', obsolete, [])
Object.entries(SENZA_SESSIONE).forEach(([k, perche]) =>
  console.log(`    ${k.padEnd(52)} ${perche}`))

console.log('\n— Le due porte di §329 sono chiuse —')
const byKey = new Map(actions.map(a => [`${a.file}::${a.name}`, a]))
is('inviteChannelGuest ha un guard', byKey.get('invite-guest.ts::inviteChannelGuest')?.guarded, true)
is('revokeChannelGuest ha un guard', byKey.get('invite-guest.ts::revokeChannelGuest')?.guarded, true)
is('getOrCreatePortal ha un guard', byKey.get('ticket-portal.ts::getOrCreatePortal')?.guarded, true)

console.log('\n— Il ruolo non viaggia nei metadati —')
/* `handle_new_user` copia `raw_user_meta_data->>'role'` in `profiles.role`: chi
   scrive quei metadati sceglie un ruolo di autorizzazione. La 221 toglie la
   lettura lato database; qui si tiene fuori il lato applicazione, che è quello
   che qualcuno riscriverà senza sapere. */
const conRuolo: string[] = []
for (const file of readdirSync(DIR).filter(f => f.endsWith('.ts'))) {
  const src = readFileSync(join(DIR, file), 'utf8')
  for (const m of Array.from(src.matchAll(/inviteUserByEmail\([\s\S]{0,400}?\n\s*\}\)/g))) {
    if (/\n\s*role[,:]/.test(m[0])) conRuolo.push(file)
  }
}
is('nessun invito passa `role` nei metadati', conRuolo, [])

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)

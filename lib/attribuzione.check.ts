/* §444 — chi scrive su una tabella con la cronologia ci mette il nome.
   Esegui: npx tsx lib/attribuzione.check.ts

   `log_activity()` (253) prende l'autore dall'header `x-actor-id`, che solo
   `createActorClient(uid)` manda: una scrittura con `createAdminClient()` su una
   tabella loggata arriva in cronologia come «Sistema», e la domanda «chi ha
   segnato pagata questa fattura?» non ha più risposta. Il manuale lo dice dal
   §179 — e al 25 settembre 2026 fatture, milestone e workstream scrivevano
   ancora così. Come `actions-guard`, non è un test di unità: è un inventario,
   perché una scrittura anonima non si vede leggendo il file giusto, si vede
   solo elencandoli tutti.

   L'elenco delle eccezioni è chiuso e motivato: una nuova ha bisogno di un
   perché scritto qui. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

/** le tabelle che `log_activity()` racconta: 253, più il diario dei lead (263) */
export const LOGGATE = [
  'clients', 'projects', 'project_workstreams', 'milestones', 'tasks',
  'deals', 'invoices', 'tickets', 'objectives', 'key_results', 'decisions', 'deal_activities',
]

/**
 * Le scritture anonime che devono restarlo, con il perché. `file::funzione`.
 * Una funzione senza una persona dietro — un giro notturno, un motore che genera
 * occorrenze — scrive «Sistema» perché è il sistema: dargli un nome sarebbe
 * mentire in cronologia.
 */
const ECCEZIONI: Record<string, string> = {}

const WRITE = new RegExp(`\\.from\\(\\s*'(${LOGGATE.join('|')})'\\s*\\)\\s*\\.(insert|update|delete|upsert)\\(`, 'g')

/** i file `'use server'` e le route: sono le porte da cui entra una persona */
function porte(dir: string): string[] {
  const out: string[] = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...porte(p))
    else if (/\.(ts|tsx)$/.test(n) && !n.includes('.check.')) out.push(p)
  }
  return out
}

/** una funzione esportata per pezzo: il client si decide dentro la funzione */
function funzioni(src: string): { nome: string; corpo: string }[] {
  const parti = src.split(/\n(?=export (?:async )?function )/)
  return parti.slice(1).map(p => ({ nome: /export (?:async )?function (\w+)/.exec(p)?.[1] ?? '?', corpo: p }))
}

/**
 * Le scritture anonime di un corpo: `createAdminClient().from('x').update(`
 * scritto di fila, o una variabile che vale `createAdminClient()` e poi scrive.
 * Il client dell'attore (`createActorClient`) e quello della sessione
 * (`createClient`, dove `auth.uid()` dà il nome da sé) vanno bene.
 */
export function anonime(corpo: string): string[] {
  const out: string[] = []
  const pulito = corpo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  /* ogni assegnazione di un client, con la sua posizione: la variabile vale
     l'**ultima** prima della scrittura — due funzioni dello stesso file usano
     spesso lo stesso nome per client diversi */
  const assegna = Array.from(pulito.matchAll(/(?:const|let) (\w+) = (createAdminClient\(\)|createActorClient\(|(?:await )?createClient\()/g))
    .map(m => ({ nome: m[1], anonimo: m[2].startsWith('createAdminClient'), dove: m.index! }))
  for (const m of Array.from(pulito.matchAll(WRITE))) {
    const prima = pulito.slice(Math.max(0, m.index! - 80), m.index!)
    const diretta = /createAdminClient\(\)\s*$/.test(prima)
    const v = /(\w+)\s*$/.exec(prima)?.[1]
    const ultima = assegna.filter(x => x.nome === v && x.dove < m.index!).at(-1)
    if (diretta || ultima?.anonimo) out.push(`${m[1]}.${m[2]}`)
  }
  return out
}

console.log('\n— Il riconoscitore —')
is('diretta', anonime(`const { error } = await createAdminClient().from('invoices')\n  .update({ paid_on: x })`), ['invoices.update'])
is('tramite una variabile', anonime(`const admin = createAdminClient()\nawait admin.from('milestones').delete().eq('id', id)`), ['milestones.delete'])
is('il client dell\'attore va bene', anonime(`const admin = createActorClient(uid)\nawait admin.from('tasks').update({})`), [])
is('una tabella senza cronologia va bene', anonime(`await createAdminClient().from('client_contacts').update({})`), [])
is('leggere va bene', anonime(`await createAdminClient().from('clients').select('id')`), [])
is('vale l\'ultima assegnazione, non una qualunque', anonime(`const admin = createActorClient(uid)\nawait admin.from('clients').update({})\nfunction x() { const admin = createAdminClient() }`), [])
is('nei commenti non conta', anonime(`/* createAdminClient().from('tasks').update( */`), [])

console.log('\n— L\'inventario —')
const trovate: string[] = []
for (const f of [...porte('app/actions'), ...porte('app/api')]) {
  const src = readFileSync(f, 'utf8')
  if (!src.includes('createAdminClient')) continue
  for (const fn of funzioni(src)) {
    const chiave = `${f.replace(/^app\//, '')}::${fn.nome}`
    if (ECCEZIONI[chiave]) continue
    for (const w of anonime(fn.corpo)) trovate.push(`${chiave} → ${w}`)
  }
}
is('nessuna scrittura anonima su una tabella con cronologia', trovate, [])
is('le eccezioni hanno un perché', Object.values(ECCEZIONI).every(v => v.trim().length > 20), true)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)

/**
 * Gate di `lib/asana.ts`. Ogni controllo nasce da un nome vero letto dal
 * workspace `twobee.it` il 2026-08-07, refusi compresi.
 *
 *   npx tsx lib/asana.check.ts
 */
import {
  classify, clientOf, boardView, mapTasks, summarize, toCsv, norm, resourceViews,
  groupByClient, triageProgress, matchClient, type AsanaTask,
} from './asana'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}

// ── classify ────────────────────────────────────────────────────────────────
eq('checklist di servizio', classify('Fatima Leo - WEB SITE'), 'servizio')
eq('servizio senza spazio dopo il trattino', classify('Elettra -GOOGLE ADS'), 'servizio')
eq('servizio con spazio prima', classify('Josè Restaurant  - REPORTING'), 'servizio')
// Il trattino fa parte del nome: la coda non è un servizio del vocabolario.
eq('master con trattino nel nome', classify('Josè Restaurant - Tenuta Villa Guerra'), 'master')
eq('master nudo', classify('Fatima Leo'), 'master')
eq('ad hoc', classify('Ad Hoc - Fatima Leo'), 'adhoc')
eq('ad hoc senza trattino', classify('Ad Hoc TwoBee Interno 🐝🐝'), 'adhoc')
eq('prospect', classify('Prospect - Sea Power'), 'prospect')
eq('prospect col refuso', classify('Propsect - Land srl'), 'prospect')
eq('sezione orfana = interna', classify('META ADS'), 'interna')
eq('duplicato = interna', classify('Duplicate of WEB SITE'), 'interna')
eq('board TwoBee = interna', classify('Two Bee🐝 - Sito Web'), 'interna')
eq('onboarding = interna', classify('Onboarding Cliente'), 'interna')

/* Il caso che rende necessario l'ordine dei controlli: «Sea Power» è cliente
   vero E ha una board Prospect. Se `prospect` non venisse riconosciuto per
   primo, il suo lavoro commerciale finirebbe fra le consegne. */
eq('prospect vince su master', classify('Prospect - Sea Power'), 'prospect')
eq('e il cliente vero resta servizio', classify('Sea Power - WEB SITE'), 'servizio')

// ── clientOf ────────────────────────────────────────────────────────────────
eq('cliente da checklist', clientOf('Fatima Leo - WEB SITE'), 'fatima leo')
eq('cliente da ad hoc', clientOf('Ad Hoc - Industrial Service'), 'industrial service')
eq('ad hoc con spazio in coda', clientOf('Ad Hoc - Icura '), 'icura impresa')
eq('refuso corretto', clientOf('Sartoria Cpndotti - META ADS'), 'sartoria condotti')
eq('refuso senza spazio', clientOf('Plusvending - GOOGLE ADS'), 'plus vending')
eq('master col trattino nel nome', clientOf('Josè Restaurant - Tenuta Villa Guerra'), 'jose restaurant tenuta villa guerra')
eq('board interna non ha cliente', clientOf('META ADS'), null)
eq('ad hoc interna non ha cliente', clientOf('Ad Hoc TwoBee Interno 🐝🐝'), null)
eq('prospect porta comunque il nome', clientOf('Propsect - Land srl'), 'land srl')

// ── norm ────────────────────────────────────────────────────────────────────
eq('accenti via', norm('Josè Restaurant'), 'jose restaurant')
eq('doppi spazi collassati', norm('Josè Restaurant  - REPORTING'), 'jose restaurant reporting')

// ── boardView ───────────────────────────────────────────────────────────────
eq('servizio estratto', boardView({ gid: '1', name: 'Icura - MARKETING AUTOMATION' }).service, 'MARKETING AUTOMATION')
eq('nessun servizio su master', boardView({ gid: '1', name: 'Fatima Leo' }).service, null)

// ── mapTasks ────────────────────────────────────────────────────────────────
const boards = [
  { gid: 'b1', name: 'Fatima Leo - WEB SITE' },
  { gid: 'b2', name: 'Prospect - Sea Power' },
  { gid: 'b3', name: 'Sartoria Cpndotti - META ADS' },
  { gid: 'b4', name: 'META ADS' },
]
const clients = [
  { id: 'c-fatima', name: 'Fatima Leo' },
  { id: 'c-sartoria', name: 'Sartoria Condotti' },
]
const profiles = [{ id: 'p-mc', email: 'M.Cristallo@twobee.it' }]

const t = (gid: string, boardGid: string, assigneeEmail: string | null, completed = false): AsanaTask => ({
  gid, name: `task ${gid}`, boardGid, section: null, assigneeEmail,
  dueOn: null, notes: null, isMilestone: false, completed,
})

const rows = mapTasks(
  [t('t1', 'b1', 'm.cristallo@twobee.it'), t('t2', 'b2', 'm.cristallo@twobee.it'),
   t('t3', 'b3', null), t('t4', 'b4', 'ignoto@altro.it')],
  boards, clients, profiles,
)

eq('task pronta: cliente e profilo trovati', rows[0].blockers, [])
eq('cliente agganciato', rows[0].clientId, 'c-fatima')
eq('email confrontata senza maiuscole', rows[0].profileId, 'p-mc')
eq('prospect è un blocco', rows[1].blockers.includes('board commerciale, non lavoro da consegnare'), true)
eq('refuso risolto anche in mappatura', rows[2].clientId, 'c-sartoria')
eq('senza assegnatario è un blocco', rows[2].blockers, ['nessun assegnatario'])
eq('board interna è un blocco', rows[3].blockers.includes('board interna, nessun cliente'), true)
eq('email sconosciuta è un blocco', rows[3].blockers.some(b => b.includes('ignoto@altro.it')), true)

/* Un blocco che non si può calcolare non deve diventare silenzio: la task su
   una board il cui cliente non è in anagrafica lo dice col nome. */
const orfana = mapTasks([t('t5', 'b1', 'm.cristallo@twobee.it')], boards, [], profiles)
eq('cliente mancante nominato', orfana[0].blockers, ['cliente «fatima leo» non in anagrafica'])

// ── summarize ───────────────────────────────────────────────────────────────
const s = summarize(rows)
eq('totale', s.total, 4)
eq('pronte', s.ready, 1)
eq('bloccate', s.blocked, 3)
eq('conteggio per tipo', s.byKind, [
  { kind: 'servizio', count: 2 }, { kind: 'prospect', count: 1 }, { kind: 'interna', count: 1 },
])

// ── resourceViews ───────────────────────────────────────────────────────────
const users = [
  { gid: 'u1', name: 'Marco Cristallo', email: 'M.Cristallo@twobee.it' },
  { gid: 'u2', name: 'Chi non lavora qui', email: 'ignoto@altro.it' },
  { gid: 'u3', name: 'Senza email', email: null },
]
const res = resourceViews(users, rows, profiles)
// a parità di carico l'ordine è alfabetico, così la lista non balla fra due letture
eq('ordinate per carico', res.map(r => r.name), [
  'Marco Cristallo', 'Chi non lavora qui', 'Nessun assegnatario', 'Senza email',
])
eq('profilo agganciato per email, maiuscole a parte', res[0].profileId, 'p-mc')
eq('carico contato', { tasks: res[0].tasks, ready: res[0].ready }, { tasks: 2, ready: 1 })
/* Chi non ha un profilo resta in elenco: sparire sarebbe il modo di non
   accorgersi che a qualcuno mancano venti task. */
eq('senza profilo resta, con le sue task', { p: res[1].profileId, t: res[1].tasks }, { p: null, t: 1 })
eq('le orfane hanno una riga loro', { n: res[2].name, t: res[2].tasks }, { n: 'Nessun assegnatario', t: 1 })
/* Una risorsa Asana senza email non eredita le task senza assegnatario: sono
   due vuoti diversi, e confonderli le contava due volte. */
eq('risorsa senza email non assorbe le orfane', res[3].tasks, 0)
// la somma delle risorse deve fare il totale, o qualcosa è sparito per strada
eq('somma = totale', res.reduce((n, r) => n + r.tasks, 0), rows.length)

// ── matchClient ─────────────────────────────────────────────────────────────
const cmap = new Map([
  ['industrial service', 'c-is'],
  ['fatima leo', 'c-fl'],
  ['fatima leo academy', 'c-fla'],
  ['seven', 'c-sv'],
])
eq('nome esatto', matchClient('seven', cmap), { id: 'c-sv', how: 'esatto' })
/* La board «Industrial Service and Facility» è il cliente «Industrial Service»
   scritto per esteso: senza il prefisso finiva orfana, e l'unica alternativa
   era creare un secondo cliente uguale. */
eq('prefisso: la board dice di più', matchClient('industrial service and facility', cmap),
   { id: 'c-is', how: 'prefisso' })
/* Ambiguo = nessuno. Indovinare male attacca il lavoro al cliente sbagliato,
   che è peggio di lasciarlo orfano. */
eq('due candidati non si scelgono da soli', matchClient('fatima leo academy corsi', cmap),
   { id: null, how: null })
eq('nessun cliente', matchClient('ceramiche martinelli', cmap), { id: null, how: null })
eq('board senza nome cliente', matchClient(null, cmap), { id: null, how: null })
// il prefisso richiede il confine di parola: «sevenup» non è «seven»
eq('non è un contains', matchClient('sevenup', cmap), { id: null, how: null })

// ── groupByClient / triageProgress ──────────────────────────────────────────
const gRows = mapTasks(
  [t('g1', 'b1', 'm.cristallo@twobee.it'), t('g2', 'b1', null, true),
   t('g3', 'b3', null), t('g4', 'b4', null), t('g5', 'b2', null)],
  boards, clients, profiles,
)
const decided = new Set(['g1'])
const groups = groupByClient(gRows, decided)

/* Il gruppo senza cliente va in fondo, ma **c'è**: sono le board interne e
   commerciali, cioè quelle che di solito si buttano. Nasconderle farebbe
   chiudere Asana con dentro roba mai guardata. */
eq('ultimo gruppo = senza cliente', groups[groups.length - 1].clientName, null)
eq('gruppi per cliente', groups.filter(g => g.clientName).map(g => g.clientName),
   ['fatima leo', 'sartoria condotti', 'sea power'])

const fatima = groups.find(g => g.clientName === 'fatima leo')!
eq('totale del cliente', fatima.total, 2)
// una delle due è completata: «aperte» non è «tutte»
eq('aperte del cliente', fatima.open, 1)
eq('decise del cliente', fatima.decided, 1)
eq('board dentro il gruppo', fatima.boards.length, 1)
eq('id cliente propagato al gruppo', fatima.clientId, 'c-fatima')

const p = triageProgress(gRows, decided)
eq('avanzamento', { total: p.total, done: p.done, left: p.left, pct: p.pct },
   { total: 5, done: 1, left: 4, pct: 20 })
eq('niente da decidere = finito', triageProgress([], new Set()).pct, 100)

// ── CSV ─────────────────────────────────────────────────────────────────────
const csv = toCsv([{ ...rows[0], name: 'Copy, "completo"\nsito', notes: 'a\nb' }])
eq('intestazione', csv.split('\n')[0].startsWith('﻿board,tipo,cliente'), true)
eq('la decisione presa finisce nel file',
   toCsv([rows[0]], new Map([[rows[0].gid, 'elimina' as const]])).includes(',elimina,'), true)
eq('virgolette raddoppiate', csv.includes('"Copy, ""completo""'), true)
eq('a capo nelle note collassati', csv.includes(',a b,'), true)
eq('BOM presente', csv.charCodeAt(0), 0xfeff)

// ────────────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`\n${fails.length} controlli falliti su ${ok + fails.length}:\n`)
  fails.forEach(f => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log(`${ok} controlli. Tutti i controlli passano.`)

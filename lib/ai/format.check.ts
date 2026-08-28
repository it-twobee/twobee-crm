/**
 * Gate del formattatore delle risposte.
 *
 *   npx tsx lib/ai/format.check.ts
 *
 * Il caso di riferimento è la risposta vera che ha reso illeggibile il pannello
 * su un telefono: tabella a cinque colonne, grassetti e un riepilogo in fondo.
 */
import { parseAnswer, parseInline, type Block } from './format'

let passed = 0
const failures: string[] = []

function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++
  else failures.push(`${label}\n     atteso:  ${JSON.stringify(expected)}\n     ottenuto: ${JSON.stringify(actual)}`)
}

const text = (spans: { text: string }[]) => spans.map((s) => s.text).join('')

// ─── inline ──────────────────────────────────────────────────────────────────
check('grassetto riconosciuto', parseInline('ecco **7 task** aperte'),
  [{ text: 'ecco ' }, { text: '7 task', bold: true }, { text: ' aperte' }])
check('backtick tolti', text(parseInline('usa `list_my_tasks` ora')), 'usa list_my_tasks ora')
check('asterisco scoperto non resta a schermo', text(parseInline('*Riepilogo: 7 task')), 'Riepilogo: 7 task')
check('niente span vuoti', parseInline('**solo grassetto**'), [{ text: 'solo grassetto', bold: true }])
check('testo vuoto non produce span', parseInline(''), [])

// ─── il caso vero dello screenshot ───────────────────────────────────────────
const REALE = `**Le tue task (ordine di scadenza)**

| Titolo | Stato | Priorità | Scadenza | Cliente |
|--------|-------|----------|----------|---------|
| Dare accesso al team per testare CRM | da_fare | media | 31-07-2026 | – |
| Sito Web – Parte 1 – Academy | da_fare | media | 28-08-2026 | Fatima Leo |

**Riepilogo**: 7 task aperte, tutte "da_fare" con priorità media.`

const blocks = parseAnswer(REALE)
check('tre blocchi: titolo, righe, riepilogo', blocks.map((b) => b.kind), ['p', 'rows', 'p'])

const rows = blocks[1] as Extract<Block, { kind: 'rows' }>
check('la riga di separazione non diventa contenuto', rows.rows.length, 2)
check('nessun pipe sopravvive nel titolo', text(rows.rows[0].title), 'Dare accesso al team per testare CRM')
check('la cella vuota «–» non diventa una voce', rows.rows[0].meta, ['da_fare', 'media', '31-07-2026'])
check('il cliente c è dove esiste', rows.rows[1].meta, ['da_fare', 'media', '28-08-2026', 'Fatima Leo'])
check('l intestazione della tabella non è una riga', rows.rows.every((r) => text(r.title) !== 'Titolo'), true)
check('il grassetto del titolo resta', (blocks[0] as Extract<Block, { kind: 'p' }>).spans[0].bold, true)

// ─── elenchi ─────────────────────────────────────────────────────────────────
const ul = parseAnswer('Ecco:\n- prima cosa\n- seconda cosa\n\nfine')
check('elenco separato dal paragrafo', ul.map((b) => b.kind), ['p', 'ul', 'p'])
check('due voci', (ul[1] as Extract<Block, { kind: 'ul' }>).items.length, 2)
check('il segno di elenco non resta nel testo',
  text((ul[1] as Extract<Block, { kind: 'ul' }>).items[0]), 'prima cosa')
check('elenco numerato riconosciuto',
  (parseAnswer('1. prima\n2. seconda')[0] as Extract<Block, { kind: 'ul' }>).items.length, 2)
check('il bullet col punto elenco unicode',
  (parseAnswer('• una voce')[0] as Block).kind, 'ul')

// ─── titoli markdown ─────────────────────────────────────────────────────────
check('i cancelletti non arrivano a schermo',
  text((parseAnswer('## Le tue task')[0] as Extract<Block, { kind: 'p' }>).spans), 'Le tue task')

// ─── righe consecutive = un paragrafo, non tre ───────────────────────────────
const wrapped = parseAnswer('una frase\nspezzata su tre\nrighe')
check('le righe adiacenti si uniscono', wrapped.length, 1)
check('unite con uno spazio',
  text((wrapped[0] as Extract<Block, { kind: 'p' }>).spans), 'una frase spezzata su tre righe')

// ─── casi degeneri: non deve mai lanciare ────────────────────────────────────
check('stringa vuota', parseAnswer(''), [])
check('solo righe vuote', parseAnswer('\n\n\n'), [])
check('tabella senza separazione', (parseAnswer('| a | b |\n| c | d |')[0] as Block).kind, 'rows')
check('tabella con una riga sola resta visibile',
  (parseAnswer('| solo questa | x |')[0] as Extract<Block, { kind: 'rows' }>).rows.length, 1)
check('separazione con i due punti riconosciuta',
  (parseAnswer('| a | b |\n|:---|---:|\n| c | d |')[0] as Extract<Block, { kind: 'rows' }>).rows.length, 1)
check('tabella di sole celle vuote non produce righe fantasma',
  parseAnswer('| Titolo | Stato |\n|---|---|\n| – | – |').length, 0)
check('pipe senza chiusura non rompe',
  text((parseAnswer('| a | b')[0] as Extract<Block, { kind: 'rows' }>).rows[0].title), 'a')

if (failures.length) {
  console.error(`\n✗ ${failures.length} controlli falliti su ${passed + failures.length}\n`)
  failures.forEach((f) => console.error(`  - ${f}`))
  process.exit(1)
}
console.log(`Tutti i controlli passano (${passed}).`)

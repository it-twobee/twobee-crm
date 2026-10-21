/* §483 — Il colore della persona. Esegui: npx tsx lib/calendar-colors.check.ts */
import { readFileSync, readdirSync } from 'fs'
import { COLORI_PERSONA, NOME_COLORE, colorePersona, colorFor, isColorePersona } from '@/lib/calendar-colors'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(64)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— La scelta vince —')
is('scelto: quello', colorePersona('u1', 'viola'), 'viola')
is('scelto il giallo, chiunque sia', colorePersona('u2', 'giallo'), 'giallo')
is('senza scelta: stabile sull\'id', colorePersona('u1', null), colorePersona('u1'))
is('senza scelta: una delle otto', COLORI_PERSONA.includes(colorePersona('abc')), true)
is('un valore che non è nell\'elenco non passa', colorePersona('u1', 'fucsia'), colorePersona('u1'))
is('un valore vuoto non passa', colorePersona('u1', ''), colorePersona('u1'))

console.log('\n— Le tinte —')
is('il pallino passa dal token', colorFor('u1', 'blu').dot, 'var(--color-persona-blu)')
is('il testo non indossa la tinta', colorFor('u1', 'giallo').text, 'var(--color-text-primary)')
is('ogni tinta ha il suo nome', COLORI_PERSONA.every(c => NOME_COLORE[c]?.length > 0), true)
is('isColorePersona riconosce le otto', COLORI_PERSONA.every(isColorePersona), true)

console.log('\n— I token ci sono, in tutti e due i temi —')
const css = readFileSync('app/globals.css', 'utf8')
const conta = (c: string) => (css.match(new RegExp(`--color-persona-${c}:`, 'g')) ?? []).length
is('ogni tinta è definita due volte (scuro e chiaro)', COLORI_PERSONA.filter(c => conta(c) !== 2), [])

console.log('\n— La migration e il codice dicono lo stesso elenco —')
const file = readdirSync('supabase/migrations').find(f => /_avatar_color\.sql$/.test(f))
const sql = file ? readFileSync(`supabase/migrations/${file}`, 'utf8') : ''
const nelVincolo = (sql.match(/avatar_color IN \(([^)]+)\)/)?.[1] ?? '').match(/'([a-z]+)'/g)?.map(s => s.slice(1, -1)) ?? []
is('il vincolo del database ammette le stesse otto', nelVincolo, [...COLORI_PERSONA])

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)

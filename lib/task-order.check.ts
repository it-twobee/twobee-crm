/* §486 — L'ordine delle task dentro una milestone. Esegui: npx tsx lib/task-order.check.ts */
import { ordinaTask, sposta, nuovePosizioni, PASSO, type Ordinabile } from '@/lib/task-order'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(64)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const t = (id: string, position: number | null, created_at = `2026-10-0${id.charCodeAt(0) % 9 + 1}`): Ordinabile =>
  ({ id, position, created_at })
const ids = (l: Ordinabile[]) => l.map(x => x.id)
/** applica le posizioni scritte e riordina: è quello che vede la pagina dopo il salvataggio */
const dopo = (l: Ordinabile[], scritte: { id: string; position: number }[]) =>
  ids(ordinaTask(l.map(x => ({ ...x, position: scritte.find(s => s.id === x.id)?.position ?? x.position }))))

console.log('\n— L\'ordine —')
is('senza posizioni: ordine di creazione', ids(ordinaTask([t('b', null, '2026-10-02'), t('a', null, '2026-10-01')])), ['a', 'b'])
is('la posizione vince sulla creazione', ids(ordinaTask([t('a', 2048, '2026-10-01'), t('b', 1024, '2026-10-02')])), ['b', 'a'])
is('una task nuova (senza posizione) va in fondo', ids(ordinaTask([t('n', null, '2026-09-01'), t('a', 1024, '2026-10-01')])), ['a', 'n'])
is('sposta: la terza in cima', sposta(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b'])

console.log('\n— La prima volta si numera tutto —')
const nuda = [t('a', null, '2026-10-01'), t('b', null, '2026-10-02'), t('c', null, '2026-10-03')]
const prima = nuovePosizioni(nuda, 2, 0)
is('tre righe scritte', prima.length, 3)
is('e l\'ordine è quello voluto', dopo(nuda, prima), ['c', 'a', 'b'])

console.log('\n— Poi si scrive una riga sola —')
const numerata = [t('a', 1024), t('b', 2048), t('c', 3072), t('d', 4096)]
const giu = nuovePosizioni(numerata, 0, 2)
is('una riga sola: quella spostata', giu.map(x => x.id), ['a'])
is('a fra c e d', dopo(numerata, giu), ['b', 'c', 'a', 'd'])
const inCima = nuovePosizioni(numerata, 3, 0)
is('in cima: prima della prima', dopo(numerata, inCima), ['d', 'a', 'b', 'c'])
is('  e la posizione scende sotto la prima', inCima[0].position < 1024, true)
const inFondo = nuovePosizioni(numerata, 0, 3)
is('in fondo: dopo l\'ultima', dopo(numerata, inFondo), ['b', 'c', 'd', 'a'])
is('  e la posizione supera l\'ultima', inFondo[0].position > 4096, true)

console.log('\n— Casi che non scrivono niente —')
is('stessa posizione', nuovePosizioni(numerata, 1, 1), [])
is('indice fuori dalla lista', nuovePosizioni(numerata, 0, 9), [])

console.log('\n— Quando il buco finisce si rinumera —')
let lista = [t('a', 1024), t('b', 2048), t('c', 3072)]
let scritte = 0
for (let i = 0; i < 80; i++) {
  const ordinata = ordinaTask(lista)
  const p = nuovePosizioni(ordinata, 2, 1)
  scritte += p.length
  lista = lista.map(x => ({ ...x, position: p.find(s => s.id === x.id)?.position ?? x.position }))
}
const fine = ordinaTask(lista)
is('dopo 80 spostamenti nello stesso buco l\'ordine regge', new Set(fine.map(x => x.position)).size, 3)
is('  e quasi sempre si è scritta una riga sola', scritte < 80 + 3 * 3, true)
is('il passo è largo', PASSO >= 1024, true)

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)

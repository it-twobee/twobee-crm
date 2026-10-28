/* §494 — il foglio dei lead con più schede. Esegui: npx tsx lib/sales-schede.check.ts */
import { schedeDa, schedeDaHtml, schedeNonLette, foglioDaUrl } from '@/lib/sales-schede'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const U = 'https://docs.google.com/spreadsheets/d/ABC_123/export?format=csv&gid='

console.log('\n— La configurazione —')
is('la voce di prima, senza etichetta, vale ancora',
  schedeDa(`${U}0`).map(s => [s.etichetta, s.url]), [['Scheda 0', `${U}0`]])
is('etichetta e indirizzo separati dal |',
  schedeDa(`Modulo 1 - Lancio|${U}0`).map(s => s.etichetta), ['Modulo 1 - Lancio'])
is('più voci con ; e con a capo',
  schedeDa(`Uno|${U}0; Due|${U}186\nTre|${U}568`).map(s => [s.etichetta, s.foglio?.gid]),
  [['Uno', 0], ['Due', 186], ['Tre', 568]])
is('l\'= dell\'indirizzo non spezza niente', schedeDa(`A|${U}7`)[0].url, `${U}7`)
is('lo stesso indirizzo due volte è una scheda', schedeDa(`A|${U}0;B|${U}0`).length, 1)
is('vuota → nessuna scheda', schedeDa('').length + schedeDa(undefined).length + schedeDa(' ; ').length, 0)
is('un indirizzo non Google si legge, ma senza foglio per il ritorno',
  schedeDa('https://example.test/f.csv').map(s => [s.etichetta, s.foglio]), [['Foglio', null]])
is('id e gid dall\'indirizzo', foglioDaUrl(`${U}1863808156`), { id: 'ABC_123', gid: 1863808156 })
is('senza gid è la prima scheda', foglioDaUrl('https://docs.google.com/spreadsheets/d/X/export?format=csv'), { id: 'X', gid: 0 })

console.log('\n— Le schede del documento (pagina htmlview) —')
/* la forma vera, accorciata: è quella che Google scrive nella pagina */
const html = 'var items = [];items.push({name: "Modulo 1 - Lancio", pageUrl: "https:\\/\\/x\\/htmlview\\/sheet?headers\\x3dtrue&gid=0", gid: "0",initialSheet: ("0" == gid)});'
  + 'items.push({name: "Modulo 2 - IA", pageUrl: "https:\\/\\/x&gid=1863808156", gid: "1863808156",initialSheet: ("1863808156" == gid)});'
  + 'items.push({name: "Modulo IA (v2) \\"nuovo\\"", pageUrl: "https:\\/\\/x&gid=568598458", gid: "568598458",initialSheet: false});'
const tutte = schedeDaHtml(html)
is('tre schede, con nome e gid', tutte.map(t => [t.nome, t.gid]),
  [['Modulo 1 - Lancio', 0], ['Modulo 2 - IA', 1863808156], ['Modulo IA (v2) "nuovo"', 568598458]])
is('una pagina di forma diversa → elenco vuoto, non inventato', schedeDaHtml('<html>login</html>'), [])

const lette = schedeDa(`Uno|${U}0; Due|${U}1863808156`)
is('la scheda che il giro non legge si vede',
  schedeNonLette(lette, new Map([['ABC_123', tutte]])).map(t => t.gid), [568598458])
is('quando le legge tutte, tace',
  schedeNonLette(schedeDa(`A|${U}0;B|${U}1863808156;C|${U}568598458`), new Map([['ABC_123', tutte]])).length, 0)

console.log(fail ? `\n${fail} controlli falliti` : '\nTutti i controlli passano')
process.exit(fail ? 1 : 0)

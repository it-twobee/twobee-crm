/* §477 — La sfida LinkedIn: le regole pure. Esegui: npx tsx lib/linkedin.check.ts */
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { msDaUrn, meseRoma, meseCorrente, parseCsv, leggiCsvSfida, classifica, ordinaPost, COLONNE, type PostSfida } from '@/lib/linkedin'
import { crc32, zipStore } from '@/lib/zip-store'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(64)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

/** Un URN con l'ora che si vuole: i 41 bit alti sono i millisecondi. */
const urnAlle = (iso: string, coda = 123456) => `urn:li:activity:${(BigInt(Date.parse(iso)) << BigInt(22)) + BigInt(coda)}`
const req = createRequire(join(process.cwd(), 'package.json'))
const est = req(join(process.cwd(), 'public', 'estensione-linkedin', 'raccolta.js'))

console.log('\n— La data del post viene dall\'ID —')
{
  const u = urnAlle('2026-10-14T09:30:00Z')
  is('i millisecondi tornano', msDaUrn(u), Date.parse('2026-10-14T09:30:00Z'))
  is('ugcPost vale uguale', msDaUrn(u.replace('activity', 'ugcPost')), Date.parse('2026-10-14T09:30:00Z'))
  is('un testo non è un post', msDaUrn('urn:li:activity:abc'), null)
  is('un ID troppo corto non è un post', msDaUrn('urn:li:activity:12345'), null)
  is('la profilo-URN non è un post', msDaUrn('urn:li:person:7123456789012345678'), null)
}

console.log('\n— Il mese è quello di Roma —')
{
  is('00:30 del 1° ottobre a Roma è ottobre', meseRoma(Date.parse('2026-09-30T22:30:00Z')), '2026-10')
  is('23:30 del 31 ottobre a Roma è ottobre (ora solare)', meseRoma(Date.parse('2026-10-31T22:30:00Z')), '2026-10')
  is('00:30 del 1° novembre a Roma è novembre', meseRoma(Date.parse('2026-10-31T23:30:00Z')), '2026-11')
  is('il mese corrente', meseCorrente(new Date('2026-10-16T10:00:00Z')), '2026-10')
}

console.log('\n— L\'estensione e l\'OS dicono lo stesso mese —')
{
  const casi = ['2026-09-30T22:30:00Z', '2026-10-31T23:30:00Z', '2026-03-29T00:59:00Z', '2027-01-01T00:00:00Z']
  is('stesso URN, stesso mese', casi.map(c => est.meseRoma(est.msDaUrn(urnAlle(c)))), casi.map(c => meseRoma(msDaUrn(urnAlle(c))!)))
  is('stesse colonne del CSV', est.COLONNE_CSV, COLONNE)
}

console.log('\n— L\'estensione legge i numeri —')
{
  is('«1.234 impressioni»', est.contaDa(['1.234 impressioni'], est.PAROLE_SFIDA.impression), 1234)
  is('«1,234 impressions»', est.contaDa(['1,234 impressions'], est.PAROLE_SFIDA.impression), 1234)
  is('«12.345.678 impressioni»', est.contaDa(['12.345.678 impressioni'], est.PAROLE_SFIDA.impression), 12345678)
  is('«1,2K impressions»', est.contaDa(['1,2K impressions'], est.PAROLE_SFIDA.impression), 1200)
  is('«3 mila impressioni»', est.contaDa(['3 mila impressioni'], est.PAROLE_SFIDA.impression), 3000)
  is('spazio insecabile', est.contaDa(['1 234 impressioni'], est.PAROLE_SFIDA.impression), 1234)
  is('«45 reazioni»', est.contaDa(['Consiglia', '45 reazioni'], est.PAROLE_SFIDA.reazioni), 45)
  is('«1 reazione»', est.contaDa(['1 reazione'], est.PAROLE_SFIDA.reazioni), 1)
  is('«12 commenti sul post di …»', est.contaDa(['12 commenti sul post di Mario Rossi'], est.PAROLE_SFIDA.commenti), 12)
  is('«Commenta» senza numero non è un conteggio', est.contaDa(['Commenta', 'Diffondi'], est.PAROLE_SFIDA.commenti), null)
  is('i commenti non si prendono dalle reazioni', est.contaDa(['45 reazioni', '3 commenti'], est.PAROLE_SFIDA.commenti), 3)
  is('«3 diffusioni»', est.contaDa(['12 commenti • 3 diffusioni'], est.PAROLE_SFIDA.diffusioni), 3)
  is('«Mario Rossi e altri 44» = 45', est.reazioniDa('Mario Rossi e altri 44'), 45)
  is('«Anna and 9 others» = 10', est.reazioniDa('Anna and 9 others'), 10)
  is('«45» = 45', est.reazioniDa('45'), 45)
  is('niente numero → null', est.numeroDa('Consiglia'), null)
}

console.log('\n— Il CSV dell\'estensione lo legge l\'OS —')
const ORA = new Date('2026-10-16T10:00:00Z')
{
  const ott = urnAlle('2026-10-03T08:00:00Z')
  const set = urnAlle('2026-09-28T08:00:00Z')
  const csv = est.csvDi([
    { post_urn: ott, url: `https://www.linkedin.com/feed/update/${ott}/`, reazioni: 45, commenti: 12, diffusioni: 3, impression: 1234, testo: 'Ciao, "mondo"\nseconda riga' },
    { post_urn: set, url: '', reazioni: 1, commenti: 0, diffusioni: 0, impression: null, testo: '=SOMMA(A1)' },
  ])
  is('il BOM c\'è (Excel legge gli accenti)', csv.charCodeAt(0), 0xfeff)
  const letto = leggiCsvSfida(csv, ORA)
  is('legge il file', letto.ok, true)
  if (letto.ok) {
    is('entra solo il post di ottobre', letto.righe.map(r => r.post_urn), [ott])
    is('settembre è un mese chiuso', letto.fuoriMese, 1)
    is('virgolette e a capo nel testo', letto.righe[0].testo, 'Ciao, "mondo" seconda riga')
    is('i numeri', [letto.righe[0].reazioni, letto.righe[0].commenti, letto.righe[0].diffusioni, letto.righe[0].impression], [45, 12, 3, 1234])
    is('la data viene dall\'ID, non dal file', letto.righe[0].published_at, '2026-10-03T08:00:00.000Z')
    is('il mese', letto.righe[0].mese, '2026-10')
  }
  const formula = leggiCsvSfida(est.csvDi([{ post_urn: ott, url: '', reazioni: 0, commenti: 0, diffusioni: 0, impression: 5, testo: '=SOMMA(A1)' }]), ORA)
  is('l\'apostrofo anti-formula si toglie', formula.ok && formula.righe[0].testo, '=SOMMA(A1)')
  is('un url vuoto si ricostruisce', formula.ok && formula.righe[0].url, `https://www.linkedin.com/feed/update/${ott}/`)
}

console.log('\n— Un numero che manca non diventa zero —')
{
  const u = urnAlle('2026-10-05T08:00:00Z')
  const csv = `post_urn,url,reazioni,commenti,diffusioni,impression,testo\n${u},,7,2,,,ciao\n`
  const l = leggiCsvSfida(csv, ORA)
  is('impression vuota → null', l.ok && l.righe[0].impression, null)
  is('diffusioni vuote → null', l.ok && l.righe[0].diffusioni, null)
  const senza = leggiCsvSfida(`post_urn,reazioni,commenti,impression\n${u},,2,10\n`, ORA)
  is('senza reazioni la riga si scarta', senza.ok && [senza.righe.length, senza.scartate.length], [0, 1])
  const neg = leggiCsvSfida(`post_urn,reazioni,commenti,impression\n${u},-3,2,10\n`, ORA)
  is('un negativo non è un conteggio', neg.ok && [neg.righe.length, neg.scartate.length], [0, 1])
  const dec = leggiCsvSfida(`post_urn,reazioni,commenti,impression\n${u},1.5,2,10\n`, ORA)
  is('un decimale non è un conteggio', dec.ok && dec.righe.length, 0)
}

console.log('\n— File che non sono il CSV —')
{
  is('vuoto', leggiCsvSfida('', ORA).ok, false)
  is('colonne sbagliate', leggiCsvSfida('nome,cognome\nMario,Rossi\n', ORA).ok, false)
  const u = urnAlle('2026-10-05T08:00:00Z')
  const doppio = leggiCsvSfida(`post_urn,reazioni,commenti,impression\n${u},1,1,10\n${u},2,1,20\n`, ORA)
  is('lo stesso post due volte: vale l\'ultima riga', doppio.ok && doppio.righe.map(r => r.reazioni), [2])
  is('punto e virgola: colonne mancanti', leggiCsvSfida(`post_urn;reazioni;commenti;impression\n${u};1;1;10\n`, ORA).ok, false)
  is('CRLF', parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']])
}

console.log('\n— La classifica —')
{
  const p = (profile_id: string, autore: string, reazioni: number, commenti: number, impression: number | null, updated_at = '2026-10-10T10:00:00Z'): PostSfida =>
    ({ post_urn: `${profile_id}${reazioni}${impression}`, url: '', published_at: '2026-10-05T10:00:00Z', testo: '', reazioni, commenti, diffusioni: 0, impression, updated_at, profile_id, autore })
  const posts = [p('a', 'Anna', 10, 1, 1000), p('a', 'Anna', 5, 0, 500, '2026-10-12T10:00:00Z'), p('b', 'Bruno', 40, 3, 900), p('c', 'Carla', 2, 0, null)]
  const imp = classifica(posts, 'impression')
  is('per impression', imp.map(r => r.autore), ['Anna', 'Bruno', 'Carla'])
  is('i totali di Anna', [imp[0].post, imp[0].reazioni, imp[0].commenti, imp[0].impression], [2, 15, 1, 1500])
  is('l\'ultimo caricamento è il più recente', imp[0].ultimoCaricamento, '2026-10-12T10:00:00Z')
  is('impression mancanti: parziali, non zero', [imp[2].impressionParziali, imp[2].impression], [true, 0])
  is('per reazioni', classifica(posts, 'reazioni').map(r => r.autore), ['Bruno', 'Anna', 'Carla'])
  is('i post senza impression vanno in fondo', ordinaPost(posts, 'impression').map(x => x.impression), [1000, 900, 500, null])
}

console.log('\n— La migration e il codice parlano delle stesse colonne —')
{
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const file = readdirSync(dir).find(f => /^(\d+|XXX)_sfida_linkedin\.sql$/.test(f))
  is('la migration esiste', !!file, true)
  const sql = file ? readFileSync(join(dir, file), 'utf8') : ''
  is('ogni colonna del CSV è una colonna della tabella', COLONNE.filter(c => !new RegExp(`^\\s+${c} `, 'm').test(sql)), [])
  is('nessuna policy di scrittura dal browser', /FOR (INSERT|UPDATE|DELETE|ALL)/.test(sql), false)
}

console.log('\n— Lo zip dell\'estensione —')
{
  is('crc32 di «123456789»', crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926')
  const z = zipStore([{ name: 'a/x.txt', data: new TextEncoder().encode('ciao') }, { name: 'a/y.txt', data: new Uint8Array(0) }])
  const v = new DataView(z.buffer)
  is('comincia con un file locale', v.getUint32(0, true).toString(16), '4034b50')
  const fine = z.length - 22
  is('finisce con la directory centrale', v.getUint32(fine, true).toString(16), '6054b50')
  is('due voci', v.getUint16(fine + 10, true), 2)
  is('la directory centrale è dove dice', v.getUint32(z.length - 22 + 16, true) + v.getUint32(fine + 12, true), fine)
  const files = readdirSync(join(process.cwd(), 'public', 'estensione-linkedin')).sort()
  is('l\'estensione ha i suoi tre file', files, ['background.js', 'manifest.json', 'raccolta.js'])
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public', 'estensione-linkedin', 'manifest.json'), 'utf8'))
  is('manifest V3, solo linkedin.com', [manifest.manifest_version, manifest.host_permissions], [3, ['https://www.linkedin.com/*']])
}

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)

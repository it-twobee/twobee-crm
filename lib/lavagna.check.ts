/* La lavagna del team. Esegui: npx tsx lib/lavagna.check.ts
   Il controllo che conta di più è il primo blocco: la firma di chi ha attaccato
   una cosa non arriva al browser, in nessun campo. Gli altri tengono allineati
   codice e migration, e chiudono le porte (ruoli, link, righe altrui). */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  canSeeLavagna, canWriteLavagna, COLORI_NOTA, corpoNota, costruisciStato, EMOJI, ingombro, LAVAGNA, LIMITI,
  normalizzaUrl, posizioneValida, pulisciTesto, quando, rotazioneCasuale,
  type RigaElemento, type RigaMedia, type RigaReazione,
} from '@/lib/lavagna'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(62)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const IO = 'a'.repeat(64)
const LEI = 'b'.repeat(64)
const ora = new Date('2026-11-06T10:00:00Z')

console.log('— La firma non esce —')
const media: RigaMedia[] = [
  { id: 'm1', tipo: 'sticker', nome: 'capo', larghezza: 512, altezza: 256, autore: LEI, created_at: '2026-11-06T08:00:00Z' },
  { id: 'm2', tipo: 'foto', nome: '', larghezza: 1600, altezza: 1200, autore: IO, created_at: '2026-11-05T08:00:00Z' },
]
const riga = (id: string, autore: string, extra: Partial<RigaElemento>): RigaElemento => ({
  id, tipo: 'nota', media_id: null, testo: 'ciao', url: null, colore: 'rosa', x: 100, y: 100, rotazione: 2, scala: 1, z: 1,
  autore, created_at: '2026-11-06T09:00:00Z', ...extra,
})
const elementi: RigaElemento[] = [
  riga('e1', LEI, { z: 3 }),
  riga('e2', IO, { tipo: 'sticker', media_id: 'm1', testo: '', z: 1 }),
  riga('e3', LEI, { tipo: 'foto', media_id: 'sparito', testo: '', z: 2 }),
  riga('e4', IO, { tipo: 'link', url: 'https://twobee.it/', z: 2.5 }),
]
const reazioni: RigaReazione[] = [
  { elemento_id: 'e1', emoji: '😂', autore: IO },
  { elemento_id: 'e1', emoji: '😂', autore: LEI },
  { elemento_id: 'e1', emoji: '🔥', autore: LEI },
  { elemento_id: 'e1', emoji: '🍕', autore: LEI },
]
const stato = costruisciStato({ elementi, media, reazioni, usi: new Map([['m1', 4]]) }, IO, ora)
const json = JSON.stringify(stato)
is('nessuna firma nel risultato (la mia)', json.includes(IO), false)
is('nessuna firma nel risultato (la sua)', json.includes(LEI), false)
is('nessun campo «autore»', /autore/.test(json), false)
is('nessuna ora esatta', /T\d\d:\d\d/.test(json), false)
is('«mio» solo sulle mie cose', stato.elementi.map(e => [e.id, e.mio]), [['e2', true], ['e4', true], ['e1', false]])
is('un media sparito porta via il suo posto', stato.elementi.some(e => e.id === 'e3'), false)
is('ordinati per z', stato.elementi.map(e => e.z), [1, 2.5, 3])
is('reazioni contate, emoji estranee scartate', stato.elementi.find(e => e.id === 'e1')?.reazioni, { '😂': 2, '🔥': 1 })
is('«mie» sono solo le mie', stato.elementi.find(e => e.id === 'e1')?.mie, ['😂'])
is('galleria sticker con gli usi', stato.sticker.map(m => [m.id, m.usi, m.mio]), [['m1', 4, false]])
is('galleria foto: la mia è segnata', stato.foto.map(m => [m.id, m.mio]), [['m2', true]])
is('il link resta solo sui link', stato.elementi.filter(e => e.url).map(e => e.id), ['e4'])
is('un colore sconosciuto torna giallo', costruisciStato({ elementi: [riga('x', IO, { colore: 'fucsia' })], media: [], reazioni: [], usi: new Map() }, IO, ora).elementi[0].colore, 'giallo')

console.log('\n— Chi entra, chi scrive —')
const p = (role: string, app_role: string, is_active = true) => ({ role, app_role, is_active })
is('super admin entra e scrive', [canSeeLavagna(p('admin', 'super_admin')), canWriteLavagna(p('admin', 'super_admin'))], [true, true])
is('junior entra e scrive', [canSeeLavagna(p('team', 'junior')), canWriteLavagna(p('team', 'junior'))], [true, true])
is('freelance entra', canSeeLavagna(p('team', 'freelance')), true)
is('viewer guarda e non scrive', [canSeeLavagna(p('team', 'viewer')), canWriteLavagna(p('team', 'viewer'))], [true, false])
is('cliente del portale: fuori', canSeeLavagna(p('client', 'client')), false)
is('ospite del portale: fuori', canSeeLavagna(p('guest', 'guest')), false)
is('account disattivato: fuori', canSeeLavagna(p('team', 'junior', false)), false)
is('role admin con app_role da team: fuori', canSeeLavagna(p('admin', 'junior')), false)
is('nessun profilo: fuori', canSeeLavagna(null), false)

console.log('\n— I link —')
is('senza schema diventa https', normalizzaUrl('twobee.it'), 'https://twobee.it/')
is('youtube passa', normalizzaUrl(' https://youtu.be/dQw4w9WgXcQ '), 'https://youtu.be/dQw4w9WgXcQ')
is('javascript: no', normalizzaUrl('javascript:alert(1)'), null)
is('data: no', normalizzaUrl('data:text/html,<b>x</b>'), null)
is('ftp no', normalizzaUrl('ftp://twobee.it/x'), null)
is('credenziali dentro no', normalizzaUrl('https://io:segreto@twobee.it'), null)
is('una parola non è un link', normalizzaUrl('ciao'), null)
is('troppo lungo no', normalizzaUrl(`https://twobee.it/${'x'.repeat(LIMITI.url)}`), null)

console.log('\n— Testo e posizione —')
is('spazi ai bordi via, tre a capo diventano due', pulisciTesto('  a\n\n\n\nb  ', 280), 'a\n\nb')
is('il taglio non spezza un\'emoji', pulisciTesto('😂😂😂', 2), '😂😂')
is('non stringa → vuoto', pulisciTesto(42, 10), '')
is('fuori dalla lavagna → sul bordo', posizioneValida({ x: -50, y: 99999, rotazione: 400, scala: 9 }), { x: 0, y: LAVAGNA.altezza, rotazione: LIMITI.rotazione, scala: LIMITI.scalaMax })
is('numeri non validi → quelli di prima', posizioneValida({ x: 'a', y: NaN }, { x: 10, y: 20, rotazione: 3, scala: 1.5 }), { x: 10, y: 20, rotazione: 3, scala: 1.5 })
is('rotazione casuale fra -6 e 6', [rotazioneCasuale(() => 0), rotazioneCasuale(() => 0.999999)], [-6, 6])
is('il post-it scrive più piccolo se c\'è più da dire', corpoNota('ciao') > corpoNota('x'.repeat(250)), true)
is('ingombro di uno sticker largo', ingombro({ tipo: 'sticker', testo: '', media: { larghezza: 512, altezza: 256 } }), { w: 200, h: 100 })
is('ingombro di una foto con didascalia', ingombro({ tipo: 'foto', testo: 'x', media: { larghezza: 1600, altezza: 1200 } }), { w: 274, h: 256 })

console.log('\n— Il giorno, mai l\'ora (ora di Roma) —')
is('stamattina → oggi', quando('2026-11-06T07:00:00Z', ora), 'oggi')
is('00:30 di Roma è già oggi', quando('2026-11-05T23:30:00Z', ora), 'oggi')
is('22:30 di Roma di ieri → ieri', quando('2026-11-05T21:30:00Z', ora), 'ieri')
is('più indietro → la data', quando('2026-11-01T10:00:00Z', ora), '1 nov')
is('l\'anno scorso porta l\'anno', quando('2025-11-01T10:00:00Z', ora), '1 nov 2025')

console.log('\n— Codice e migration dicono le stesse cose —')
const dir = join(process.cwd(), 'supabase', 'migrations')
const file = readdirSync(dir).find(f => /^(\d{3}|XXX)_lavagna\.sql$/.test(f))
is('la migration della lavagna c\'è', !!file, true)
const sql = (file ? readFileSync(join(dir, file), 'utf8') : '').replace(/--[^\n]*/g, '')
const lista = (xs: readonly string[]) => xs.map(x => `'${x}'`).join(', ')
is('colori dei post-it', sql.includes(`colore IN (${lista(COLORI_NOTA)})`), true)
is('emoji delle reazioni', sql.includes(`emoji IN (${lista(EMOJI)})`), true)
is('larghezza della lavagna', sql.includes(`x BETWEEN 0 AND ${LAVAGNA.larghezza}`), true)
is('altezza della lavagna', sql.includes(`y BETWEEN 0 AND ${LAVAGNA.altezza}`), true)
is('rotazione', sql.includes(`rotazione BETWEEN -${LIMITI.rotazione} AND ${LIMITI.rotazione}`), true)
is('scala', sql.includes(`scala BETWEEN ${LIMITI.scalaMin} AND ${LIMITI.scalaMax}`), true)
is('testo', sql.includes(`char_length(testo) <= ${LIMITI.testo}`), true)
is('nome del media', sql.includes(`char_length(nome) <= ${LIMITI.nomeMedia}`), true)
is('url', sql.includes(`char_length(url) <= ${LIMITI.url}`), true)
is('nessuna policy: le tabelle sono deny-all', /CREATE POLICY/i.test(sql), false)
is('nessun trigger di cronologia', /log_activity|CREATE TRIGGER/i.test(sql), false)
is('nessuna chiave verso profiles', /REFERENCES public\.profiles/i.test(sql), false)

console.log('\n— Le righe degli altri non si toccano —')
const azioni = readFileSync(join(process.cwd(), 'app', 'actions', 'lavagna.ts'), 'utf8')
const scritture = Array.from(azioni.matchAll(/\.from\('lavagna_\w+'\)\s*\.(update|delete)\([^\n]*/g)).map(m => m[0])
is('le azioni modificano e cancellano qualcosa', scritture.length >= 4, true)
is('ogni update/delete filtra per autore', scritture.filter(s => !s.includes(".eq('autore'")), [])
const tuttiLavagna = [
  'app/actions/lavagna.ts', 'lib/lavagna-server.ts', 'app/api/lavagna/media/route.ts', 'app/api/lavagna/media/[id]/route.ts',
].map(f => readFileSync(join(process.cwd(), f), 'utf8')).join('\n')
is('niente client con attore (l\'intestazione porterebbe l\'id)', /createActorClient\(/.test(tuttiLavagna), false)
const valori = Array.from(tuttiLavagna.matchAll(/autore:\s*([\w.]+)/g)).map(m => m[1]).filter(v => v !== 'string')
is('l\'autore si scrive sempre con la firma', valori.length >= 3 && valori.every(v => /firma$/.test(v)), true)

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)

/* §482 — La foto profilo. Esegui: npx tsx lib/avatar.check.ts */
import { ritaglioQuadrato, percorsoAvatar, percorsoDaLink } from '@/lib/avatar'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(60)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Il ritaglio —')
is('quadrata: resta intera', ritaglioQuadrato(800, 800), { sx: 0, sy: 0, lato: 800 })
is('orizzontale: perde i lati in parti uguali', ritaglioQuadrato(1200, 800), { sx: 200, sy: 0, lato: 800 })
is('verticale: perde più sotto che sopra', ritaglioQuadrato(900, 1200), { sx: 0, sy: 100, lato: 900 })
is('dispari: niente mezzi pixel', ritaglioQuadrato(801, 800), { sx: 0, sy: 0, lato: 800 })

console.log('\n— Il percorso —')
is('la cartella è il profilo', percorsoAvatar('u1', 1700000000000, 'webp'), 'u1/1700000000000.webp')
const link = 'https://abc.supabase.co/storage/v1/object/public/avatars/u1/1700000000000.webp'
is('dal link torna il percorso', percorsoDaLink(link), 'u1/1700000000000.webp')
is('la query non entra nel percorso', percorsoDaLink(`${link}?t=1`), 'u1/1700000000000.webp')
is('un link di un altro bucket non è nostro', percorsoDaLink('https://abc.supabase.co/storage/v1/object/public/chat-attachments/x.png'), null)
is('un link esterno non è nostro', percorsoDaLink('https://lh3.googleusercontent.com/a/xyz'), null)
is('senza foto, niente da togliere', percorsoDaLink(null), null)

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)

/* Gli algoritmi dell'editor degli sticker. Esegui: npx tsx lib/lavagna-sticker.check.ts */
import {
  bacchetta, pennello, riquadroAlpha, mascheraDaCategoria, unisciMaschere,
  contorno, latoAdattato, puntiStella, sogliaColore, SOGGETTO_MEDIAPIPE,
} from './lavagna-sticker'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(62)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

/** Un'immagine w×h dipinta da `colore(x, y)` → [r, g, b, a]. */
function immagine(w: number, h: number, colore: (x: number, y: number) => [number, number, number, number]) {
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set(colore(x, y), (y * w + x) * 4)
  return rgba
}
const piena = (n: number) => new Uint8Array(n).fill(255)
const zeri = (m: Uint8Array) => m.reduce((n, v) => n + (v === 0 ? 1 : 0), 0)

console.log('\n— La bacchetta si ferma dove cambia il colore —')
{
  const rgba = immagine(10, 10, x => (x < 5 ? [255, 255, 255, 255] : [0, 0, 0, 255]))
  const m = piena(100)
  is('toglie la metà bianca', bacchetta(rgba, 10, 10, 1, 1, 10, m), 50)
  is('la metà nera resta', m[5 * 10 + 7], 255)
  is('il punto toccato è tolto', m[1 * 10 + 1], 0)
  is('una seconda volta non toglie niente di nuovo', bacchetta(rgba, 10, 10, 1, 1, 10, m), 0)
  is('fuori dall\'immagine: niente', bacchetta(rgba, 10, 10, -1, 3, 50, piena(100)), 0)
  is('fuori dall\'immagine (oltre il bordo): niente', bacchetta(rgba, 10, 10, 10, 3, 50, piena(100)), 0)
}

console.log('\n— La tolleranza decide quanto simile è simile —')
{
  const rgba = immagine(10, 10, x => (x < 5 ? [250, 250, 250, 255] : [200, 200, 200, 255]))
  const stretta = piena(100)
  is('tolleranza 5: solo il quasi bianco', bacchetta(rgba, 10, 10, 0, 0, 5, stretta), 50)
  const larga = piena(100)
  is('tolleranza 30: anche il grigio', bacchetta(rgba, 10, 10, 0, 0, 30, larga), 100)
  is('soglia 0 → 0', sogliaColore(0), 0)
  is('soglia oltre 100 = soglia 100', sogliaColore(250), sogliaColore(100))
}

console.log('\n— Il trasparente si attraversa, il colore diverso no —')
{
  // due campi bianchi separati da una colonna trasparente: lo sfondo è uno
  const rgba = immagine(9, 3, x => (x === 4 ? [0, 0, 0, 0] : [255, 255, 255, 255]))
  const m = piena(27)
  bacchetta(rgba, 9, 3, 0, 0, 5, m)
  is('il campo di destra è tolto anche lui', m[1 * 9 + 8], 0)
  // separati da una colonna nera: il campo di destra resta
  const rgba2 = immagine(9, 3, x => (x === 4 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
  const m2 = piena(27)
  bacchetta(rgba2, 9, 3, 0, 0, 5, m2)
  is('oltre la colonna nera resta', m2[1 * 9 + 8], 255)
  is('la colonna nera resta', m2[1 * 9 + 4], 255)
  // una colonna già tolta con la gomma si attraversa come il trasparente
  const m3 = piena(27)
  for (let y = 0; y < 3; y++) m3[y * 9 + 4] = 0
  bacchetta(rgba2, 9, 3, 0, 0, 5, m3)
  is('oltre la colonna già cancellata si prosegue', m3[1 * 9 + 8], 0)
}

console.log('\n— Il pennello —')
{
  const m = piena(400)
  pennello(m, 20, 20, 2, 10, 17, 10, 2, 0)
  is('il centro del tratto è cancellato', m[10 * 20 + 10], 0)
  is('l\'inizio del tratto è cancellato', m[10 * 20 + 2], 0)
  is('la fine del tratto è cancellata', m[10 * 20 + 16], 0)
  is('tre righe sotto il tratto resta', m[13 * 20 + 10], 255)
  is('l\'angolo resta', m[0], 255)
  const senzaBuchi = Array.from({ length: 15 }, (_, i) => m[10 * 20 + 2 + i]).every(v => v === 0)
  is('lungo il tratto nessun buco', senzaBuchi, true)
  pennello(m, 20, 20, 2, 10, 17, 10, 2, 255)
  is('ripristina rimette tutto', zeri(m), 0)
  pennello(m, 20, 20, -5, -5, -3, -3, 1, 0)
  is('fuori dal foglio non scrive niente', zeri(m), 0)
}

console.log('\n— Il riquadro del visibile —')
{
  is('tutto trasparente → null', riquadroAlpha(new Uint8ClampedArray(5 * 5 * 4), 5, 5), null)
  const uno = immagine(8, 8, (x, y) => (x === 3 && y === 4 ? [1, 2, 3, 255] : [0, 0, 0, 0]))
  is('un pixel solo', riquadroAlpha(uno, 8, 8), { x: 3, y: 4, w: 1, h: 1 })
  const due = immagine(8, 8, (x, y) => ((x === 1 && y === 6) || (x === 6 && y === 2) ? [0, 0, 0, 200] : [0, 0, 0, 0]))
  is('due pixel agli angoli opposti', riquadroAlpha(due, 8, 8), { x: 1, y: 2, w: 6, h: 5 })
  const deboli = immagine(4, 4, () => [0, 0, 0, 5])
  is('alpha sotto la soglia non conta', riquadroAlpha(deboli, 4, 4), null)
}

console.log('\n— La maschera di MediaPipe —')
{
  is('il soggetto di magic_touch vale 0', SOGGETTO_MEDIAPIPE, 0)
  is('0 = tenuto, 255 = tolto', Array.from(mascheraDaCategoria(new Uint8Array([0, 255, 0, 255]), 2, 2, 2, 2)), [255, 0, 255, 0])
  const grande = mascheraDaCategoria(new Uint8Array([0, 255, 255, 0]), 2, 2, 4, 4)
  is('ricampionata 2×2 → 4×4', Array.from(grande), [255, 255, 0, 0, 255, 255, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255])
  const base = new Uint8Array([255, 0, 0, 0])
  unisciMaschere(base, new Uint8Array([0, 0, 255, 0]))
  is('aggiungi: unione, non sostituzione', Array.from(base), [255, 0, 255, 0])
}

console.log('\n— Il bordo fustellato —')
{
  const w = 21, h = 21
  const punto = immagine(w, h, (x, y) => (x === 10 && y === 10 ? [255, 0, 0, 255] : [0, 0, 0, 0]))
  const a = contorno(punto, w, h, 5)
  is('il centro è pieno', a[10 * w + 10], 255)
  is('a distanza 3: pieno, niente anello col buco', a[10 * w + 13], 255)
  is('a distanza 5: mezzo (bordo sfumato)', a[10 * w + 15], 128)
  is('a distanza 8: vuoto', a[10 * w + 18], 0)
  is('in diagonale a 4,2: pieno', a[13 * w + 13], 255)
  is('in diagonale a 5,7: vuoto', a[14 * w + 14], 0)
  is('niente da contornare → tutto zero', contorno(new Uint8ClampedArray(w * h * 4), w, h, 5).every(v => v === 0), true)
  const zero = contorno(punto, w, h, 0)
  is('raggio 0: la sagoma e basta', [zero[10 * w + 10], zero[10 * w + 11]], [255, 0])
  const bordo = immagine(10, 10, (x, y) => (x === 0 && y === 0 ? [0, 0, 0, 255] : [0, 0, 0, 0]))
  const b = contorno(bordo, 10, 10, 3)
  is('una sagoma sul bordo non esce dal foglio', [b[0], b[2], b[9]], [255, 255, 0])
}

console.log('\n— Misure e forme —')
{
  is('1024×512 a 512', latoAdattato(1024, 512, 512), { w: 512, h: 256 })
  is('300×200 non si ingrandisce', latoAdattato(300, 200, 512), { w: 300, h: 200 })
  is('verticale', latoAdattato(600, 1200, 512), { w: 256, h: 512 })
  const stella = puntiStella(50, 50, 40, 20, 5)
  is('la stella ha dieci vertici', stella.length, 10)
  is('la prima punta è in alto', stella[0].map(Math.round), [50, 10])
  is('il secondo vertice è interno', Math.round(Math.hypot(stella[1][0] - 50, stella[1][1] - 50)), 20)
}

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)

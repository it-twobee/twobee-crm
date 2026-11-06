/* Gli algoritmi dell'editor degli sticker, senza DOM: lavorano sugli array di
   `getImageData` (RGBA, quattro byte a pixel) e su una maschera a un byte per
   pixel, 255 = resta, 0 = tolto. Così si provano in `lavagna-sticker.check.ts`
   senza un browser. */

/**
 * Nella category mask dell'`InteractiveSegmenter` (magic_touch) il soggetto
 * toccato vale **0** e il resto 255 — il contrario di quello che ci si aspetta.
 * Provato in Chromium headless con @mediapipe/tasks-vision 0.10.35: un cerchio
 * di raggio 50 toccato al centro dà 7.879 pixel a 0 (π·50² ≈ 7.854), e toccando
 * lo sfondo il cerchio passa a 255.
 */
export const SOGGETTO_MEDIAPIPE = 0

const DIST_MAX = Math.sqrt(3 * 255 * 255)

/** Tolleranza 0–100 → distanza RGB massima dal colore del punto toccato. */
export function sogliaColore(tolleranza: number): number {
  const t = Math.min(100, Math.max(0, tolleranza))
  return (t / 100) * DIST_MAX
}

/**
 * La bacchetta: toglie dalla maschera la regione connessa (4 vicini) del
 * colore toccato. I pixel già invisibili — trasparenti nella sorgente o già
 * tolti — si attraversano: uno sfondo tagliato in due da una passata di gomma
 * resta uno sfondo solo. Restituisce quanti pixel ha tolto.
 */
export function bacchetta(
  rgba: Uint8ClampedArray, w: number, h: number,
  x: number, y: number, tolleranza: number, maschera: Uint8Array,
): number {
  const sx = Math.floor(x), sy = Math.floor(y)
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return 0
  const seme = (sy * w + sx) * 4
  const r0 = rgba[seme], g0 = rgba[seme + 1], b0 = rgba[seme + 2]
  const soglia = sogliaColore(tolleranza)
  const soglia2 = soglia * soglia
  const visto = new Uint8Array(w * h)
  const pila = new Int32Array(w * h)
  let cima = 0
  let tolti = 0
  const entra = (i: number) => {
    const p = i * 4
    if (rgba[p + 3] < 8 || maschera[i] === 0) return true
    const dr = rgba[p] - r0, dg = rgba[p + 1] - g0, db = rgba[p + 2] - b0
    return dr * dr + dg * dg + db * db <= soglia2
  }
  const partenza = sy * w + sx
  visto[partenza] = 1
  pila[cima++] = partenza
  while (cima > 0) {
    const i = pila[--cima]
    if (!entra(i)) continue
    if (maschera[i] !== 0) { maschera[i] = 0; tolti++ }
    const px = i % w
    if (px > 0 && !visto[i - 1]) { visto[i - 1] = 1; pila[cima++] = i - 1 }
    if (px < w - 1 && !visto[i + 1]) { visto[i + 1] = 1; pila[cima++] = i + 1 }
    if (i >= w && !visto[i - w]) { visto[i - w] = 1; pila[cima++] = i - w }
    if (i < w * (h - 1) && !visto[i + w]) { visto[i + w] = 1; pila[cima++] = i + w }
  }
  return tolti
}

function cerchio(maschera: Uint8Array, w: number, h: number, cx: number, cy: number, raggio: number, valore: number) {
  const r2 = raggio * raggio
  const x0 = Math.max(0, Math.floor(cx - raggio)), x1 = Math.min(w - 1, Math.ceil(cx + raggio))
  const y0 = Math.max(0, Math.floor(cy - raggio)), y1 = Math.min(h - 1, Math.ceil(cy + raggio))
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      if (dx * dx + dy * dy <= r2) maschera[y * w + x] = valore
    }
  }
}

/** Una passata di pennello sulla maschera: cerchi lungo il segmento, fitti abbastanza da non lasciare buchi. */
export function pennello(
  maschera: Uint8Array, w: number, h: number,
  x0: number, y0: number, x1: number, y1: number, raggio: number, valore: number,
): void {
  const r = Math.max(0.5, raggio)
  const lungo = Math.hypot(x1 - x0, y1 - y0)
  const passi = Math.max(1, Math.ceil(lungo / Math.max(0.5, r / 2)))
  for (let k = 0; k <= passi; k++) {
    const t = k / passi
    cerchio(maschera, w, h, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, valore)
  }
}

export type Riquadro = { x: number; y: number; w: number; h: number }

/** Il rettangolo che contiene tutti i pixel visibili (alpha ≥ soglia), o null se non se ne vede nessuno. */
export function riquadroAlpha(rgba: Uint8ClampedArray, w: number, h: number, soglia = 8): Riquadro | null {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    const riga = y * w
    for (let x = 0; x < w; x++) {
      if (rgba[(riga + x) * 4 + 3] >= soglia) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * La category mask di MediaPipe diventa una maschera dell'editor (255 sul
 * soggetto). Se arriva a un'altra risoluzione si ricampiona al pixel più vicino.
 */
export function mascheraDaCategoria(
  cat: Uint8Array | Uint8ClampedArray, cw: number, ch: number, w: number, h: number,
  soggetto: number = SOGGETTO_MEDIAPIPE,
): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const cy = Math.min(ch - 1, Math.floor((y * ch) / h))
    for (let x = 0; x < w; x++) {
      const cx = Math.min(cw - 1, Math.floor((x * cw) / w))
      out[y * w + x] = cat[cy * cw + cx] === soggetto ? 255 : 0
    }
  }
  return out
}

/** «Aggiungi»: quello che era già tenuto resta tenuto. Modifica `base`. */
export function unisciMaschere(base: Uint8Array, nuova: Uint8Array): void {
  const n = Math.min(base.length, nuova.length)
  for (let i = 0; i < n; i++) if (nuova[i] > base[i]) base[i] = nuova[i]
}

const INF = 1e20

/* Trasformata della distanza esatta di Felzenszwalb–Huttenlocher, in una
   dimensione: `f` sono i costi (0 dentro, INF fuori), `d` le distanze al quadrato. */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

/**
 * Il bordo «fustellato»: l'alpha della sagoma allargata di `raggio` pixel,
 * con il bordo sfumato di mezzo pixel. Distanza euclidea esatta, non copie
 * spostate dell'immagine: con le copie un puntino piccolo dava un anello con
 * il buco in mezzo. Si calcola solo nel riquadro della sagoma più il raggio.
 */
export function contorno(rgba: Uint8ClampedArray, w: number, h: number, raggio: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h)
  const box = riquadroAlpha(rgba, w, h, 128)
  if (!box || raggio <= 0) {
    if (box) for (let i = 0; i < w * h; i++) out[i] = rgba[i * 4 + 3] >= 128 ? 255 : 0
    return out
  }
  const m = Math.ceil(raggio) + 1
  const x0 = Math.max(0, box.x - m), y0 = Math.max(0, box.y - m)
  const x1 = Math.min(w - 1, box.x + box.w - 1 + m), y1 = Math.min(h - 1, box.y + box.h - 1 + m)
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1
  const griglia = new Float64Array(bw * bh)
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      griglia[y * bw + x] = rgba[((y + y0) * w + (x + x0)) * 4 + 3] >= 128 ? 0 : INF
    }
  }
  const lato = Math.max(bw, bh)
  const f = new Float64Array(lato), d = new Float64Array(lato)
  const v = new Int32Array(lato), z = new Float64Array(lato + 1)
  for (let x = 0; x < bw; x++) {
    for (let y = 0; y < bh; y++) f[y] = griglia[y * bw + x]
    edt1d(f, bh, d, v, z)
    for (let y = 0; y < bh; y++) griglia[y * bw + x] = d[y]
  }
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) f[x] = griglia[y * bw + x]
    edt1d(f, bw, d, v, z)
    for (let x = 0; x < bw; x++) griglia[y * bw + x] = d[x]
  }
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const a = raggio + 0.5 - Math.sqrt(griglia[y * bw + x])
      out[(y + y0) * w + (x + x0)] = a >= 1 ? 255 : a <= 0 ? 0 : Math.round(a * 255)
    }
  }
  return out
}

/** Il lato lungo portato a `max`, senza ingrandire. */
export function latoAdattato(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** I vertici di una stella, alternando raggio esterno e interno, con la prima punta in alto. */
export function puntiStella(cx: number, cy: number, esterno: number, interno: number, punte = 5): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < punte * 2; i++) {
    const r = i % 2 === 0 ? esterno : interno
    const a = -Math.PI / 2 + (i * Math.PI) / punte
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return out
}

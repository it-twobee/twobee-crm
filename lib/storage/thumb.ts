import 'server-only'

/* §401 / §415 — Le miniature: una volta sola, accanto all'originale su MinIO.
   Erano scritte dentro la rotta dei materiali; §467 le usa anche il social, e
   una regola scritta due volte non è una regola.

   `sharp` è un di più: se il binario non c'è — succede, è un modulo nativo e in
   produzione si gira su musl — `makeThumbnail` lancia e la rotta risponde 404:
   resta l'icona. Una miniatura assente non è un guasto. */
export const THUMB_EDGE = 320
/** Oltre questa soglia l'originale non si carica in memoria per farne un francobollo. */
export const THUMB_SOURCE_MAX_BYTES = 40 * 1024 * 1024

export async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (value) chunks.push(value)
    if (done) break
  }
  return Buffer.concat(chunks)
}

export function thumbHeaders(length: number) {
  return new Headers({
    'Content-Type': 'image/webp',
    'Content-Length': String(length),
    // Cinque minuti: abbastanza per scorrere un elenco senza rigenerare niente,
    // abbastanza poco perché una revoca dell'accesso si senta subito. `private`
    // tiene la copia nel browser di chi guarda, fuori da ogni cache condivisa.
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
}

/** Il francobollo webp di un'immagine, o della prima pagina di un PDF. Lancia se non si può. */
export async function makeThumbnail(source: Buffer, pdf: boolean): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const input = pdf ? await firstPage(source) : source
  return sharp(input, { failOn: 'none' })
    // `rotate()` senza argomenti applica l'orientamento EXIF: senza, le foto
    // scattate col telefono arrivano coricate.
    .rotate()
    .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer()
}

/** La prima pagina di un PDF, come PNG largo quanto la miniatura. */
async function firstPage(pdf: Buffer): Promise<Buffer> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(pdf) })
  try {
    const shot = await parser.getScreenshot({ partial: [1], desiredWidth: THUMB_EDGE, imageDataUrl: false, imageBuffer: true })
    const page = shot.pages[0]
    if (!page?.data?.length) throw new Error('pagina vuota')
    return Buffer.from(page.data)
  } finally {
    await parser.destroy()
  }
}

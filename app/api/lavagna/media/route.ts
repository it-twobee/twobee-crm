import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import sharp, { type Metadata } from 'sharp'
import { deleteObject, isStorageConfigured, putObject } from '@/lib/storage/s3'
import { erroreLavagna, recenti, requireLavagna, TETTO_RECENTI } from '@/lib/lavagna-server'
import { isTipoMedia, LIMITI, mediaDaRiga, pulisciTesto, type RigaMedia } from '@/lib/lavagna'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FORMATI = new Set(['jpeg', 'png', 'webp', 'gif'])

/* POST /api/lavagna/media — uno sticker o una foto per la galleria comune.
   Il file non si salva com'è arrivato: si ricodifica in WebP, e sharp non
   copia i metadati. È l'anonimato anche qui — l'EXIF di una foto dice con che
   telefono e dove è stata scattata. Le GIF animate restano animate. */
export async function POST(req: Request) {
  const porta = await requireLavagna(true)
  if (!porta.ok) return NextResponse.json({ error: porta.error }, { status: porta.status })
  if (!isStorageConfigured()) return NextResponse.json({ error: 'Storage non configurato' }, { status: 503 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 }) }
  const file = form.get('file')
  const tipo = form.get('tipo')
  if (!(file instanceof Blob) || !isTipoMedia(tipo)) return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  const massimo = tipo === 'sticker' ? LIMITI.byteSticker : LIMITI.byteFoto
  if (file.size === 0) return NextResponse.json({ error: 'Il file è vuoto' }, { status: 400 })
  if (file.size > massimo) return NextResponse.json({ error: `Troppo pesante: massimo ${Math.round(massimo / 1024 / 1024)} MB` }, { status: 413 })
  if (await recenti(porta.db, 'lavagna_media', porta.firma) >= TETTO_RECENTI.media) {
    return NextResponse.json({ error: 'Calma! Hai caricato parecchio in poco tempo: riprova fra qualche minuto' }, { status: 429 })
  }

  const sorgente = Buffer.from(await file.arrayBuffer())
  let meta: Metadata
  try { meta = await sharp(sorgente, { animated: true, limitInputPixels: 60_000_000 }).metadata() } catch {
    return NextResponse.json({ error: 'Non riesco a leggere questa immagine' }, { status: 415 })
  }
  if (!meta.format || !FORMATI.has(meta.format)) {
    return NextResponse.json({ error: 'Formato non supportato: JPG, PNG, WebP o GIF' }, { status: 415 })
  }
  const animata = tipo === 'foto' && (meta.pages ?? 1) > 1

  const codifica = async (lato: number) => {
    const base = sharp(sorgente, { animated: animata, limitInputPixels: 60_000_000 })
    // l'orientamento EXIF si applica ai pixel prima di perderlo
    const dritta = animata ? base : base.rotate()
    const { data, info } = await dritta
      .resize({ width: lato, height: lato, fit: 'inside', withoutEnlargement: true })
      .webp(tipo === 'sticker' ? { quality: 90, alphaQuality: 100 } : { quality: animata ? 70 : 82 })
      .toBuffer({ resolveWithObject: true })
    return { data, larghezza: info.width, altezza: info.pageHeight ?? info.height }
  }

  let grande: Awaited<ReturnType<typeof codifica>>
  let mini: Awaited<ReturnType<typeof codifica>> | null = null
  try {
    grande = await codifica(tipo === 'sticker' ? LIMITI.latoSticker : LIMITI.latoFoto)
    if (tipo === 'foto') mini = await codifica(LIMITI.latoMini)
  } catch {
    return NextResponse.json({ error: 'Non riesco a elaborare questa immagine' }, { status: 415 })
  }

  const id = randomUUID()
  const chiave = `lavagna/${id}.webp`
  const chiaveMini = mini ? `lavagna/${id}-mini.webp` : null
  try {
    await putObject(chiave, grande.data, 'image/webp')
    if (mini && chiaveMini) await putObject(chiaveMini, mini.data, 'image/webp')
  } catch {
    await Promise.all([chiave, chiaveMini].filter((k): k is string => !!k).map(k => deleteObject(k).catch(() => undefined)))
    return NextResponse.json({ error: 'Storage non disponibile, riprova' }, { status: 502 })
  }

  const { data, error } = await porta.db.from('lavagna_media').insert({
    id,
    tipo,
    nome: pulisciTesto(form.get('nome'), LIMITI.nomeMedia).replace(/\n/g, ' '),
    chiave_oggetto: chiave,
    chiave_mini: chiaveMini,
    larghezza: grande.larghezza,
    altezza: grande.altezza,
    byte: grande.data.length,
    autore: porta.firma,
  }).select('id, tipo, nome, larghezza, altezza, autore, created_at').single()
  if (error || !data) {
    await Promise.all([chiave, chiaveMini].filter((k): k is string => !!k).map(k => deleteObject(k).catch(() => undefined)))
    return NextResponse.json({ error: erroreLavagna(error) }, { status: 500 })
  }
  revalidatePath('/lavagna')
  revalidatePath('/workspace/lavagna')
  return NextResponse.json({ media: mediaDaRiga(data as RigaMedia, porta.firma, 0, new Date()) })
}

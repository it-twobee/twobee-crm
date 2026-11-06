import type { MediaLavagna, TipoMedia } from '@/lib/lavagna'

export type EsitoCarica = { ok: true; media: MediaLavagna } | { ok: false; error: string }

/**
 * Manda un'immagine alla galleria comune. Il server la ricodifica (via i dati
 * EXIF: modello del telefono e posizione direbbero chi l'ha scattata) e
 * risponde con la riga già pronta per la galleria.
 */
export async function caricaMediaLavagna(file: Blob, tipo: TipoMedia, nome: string): Promise<EsitoCarica> {
  const form = new FormData()
  form.set('file', file, tipo === 'sticker' ? 'sticker.png' : 'foto')
  form.set('tipo', tipo)
  form.set('nome', nome)
  try {
    const res = await fetch('/api/lavagna/media', { method: 'POST', body: form })
    const body = await res.json().catch(() => null) as { media?: MediaLavagna; error?: string } | null
    if (!res.ok || !body?.media) return { ok: false, error: body?.error ?? `Caricamento non riuscito (${res.status})` }
    return { ok: true, media: body.media }
  } catch {
    return { ok: false, error: 'Rete assente: il file non è partito' }
  }
}

/* §482 — La foto profilo. Esegui il gate: npx tsx lib/avatar.check.ts

   La colonna `profiles.avatar_url` c'era da sempre e tutta l'app la mostrava,
   ma nessuno poteva riempirla: in «Il mio profilo» c'era un cerchio con
   l'iniziale. La foto si ritaglia e si rimpicciolisce nel browser — 256 px
   pesano poche decine di KB, una foto del telefono qualche MB, e la stessa
   immagine compare in ogni riga di ogni elenco. */

export const AVATAR_BUCKET = 'avatars'
export const AVATAR_LATO = 256
/** Il file scelto, prima del ritaglio: oltre, il browser lo decodifica a fatica. */
export const AVATAR_MAX_ORIGINALE = 15 * 1024 * 1024

/**
 * Il quadrato da tenere. Una foto orizzontale perde i lati in parti uguali;
 * una verticale perde più sotto che sopra, perché in un ritratto la faccia sta
 * nel terzo alto e un ritaglio centrato taglia la fronte.
 */
export function ritaglioQuadrato(w: number, h: number): { sx: number; sy: number; lato: number } {
  const lato = Math.min(w, h)
  return { sx: Math.floor((w - lato) / 2), sy: Math.floor((h - lato) / 3), lato }
}

/**
 * Il percorso nel bucket. La cartella è l'id del profilo, ed è lì che guarda la
 * RLS; il nome cambia a ogni caricamento, così il link nuovo non viene servito
 * dalla cache del vecchio.
 */
export function percorsoAvatar(profileId: string, ts: number, ext: 'webp' | 'jpg'): string {
  return `${profileId}/${ts}.${ext}`
}

/** Dal link pubblico al percorso nel bucket, per togliere la foto sostituita. `null` se il link non è nostro. */
export function percorsoDaLink(url: string | null | undefined): string | null {
  const m = url?.match(new RegExp(`/storage/v1/object/public/${AVATAR_BUCKET}/([^?#]+)`))
  return m ? decodeURIComponent(m[1]) : null
}

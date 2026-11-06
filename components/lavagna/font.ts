import { Anton, Caveat } from 'next/font/google'

/* I due caratteri della lavagna: la mano per i post-it, il titolo da meme per
   le scritte degli sticker. Caricati qui e non nel layout: li paga solo chi
   apre la lavagna. */
export const manoScritta = Caveat({ subsets: ['latin'], weight: ['500', '700'], display: 'swap' })
export const meme = Anton({ subsets: ['latin'], weight: '400', display: 'swap' })

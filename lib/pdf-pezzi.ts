/**
 * §450 — le parole di una pagina PDF con la loro posizione, dall'alto.
 *
 * pdf.js dà la linea di base con l'origine in basso a sinistra; i lettori di
 * `lib/pdf-paghe.ts` ragionano dall'alto («il valore è sotto l'etichetta»),
 * quindi la y si ribalta sull'altezza della pagina. Nessuna dipendenza: la
 * pagina arriva già aperta, dal browser o da uno script.
 */
import type { Pezzo } from './pdf-paghe'

type Pagina = {
  getViewport(o: { scale: number }): { height: number }
  getTextContent(): Promise<{ items: unknown[] }>
}

export async function pezziDaPagina(p: Pagina): Promise<Pezzo[]> {
  const h = p.getViewport({ scale: 1 }).height
  const { items } = await p.getTextContent()
  const out: Pezzo[] = []
  for (const it of items as { str?: string; transform?: number[]; width?: number }[]) {
    const s = (it.str ?? '').trim()
    if (!s || !it.transform) continue
    out.push({ x: it.transform[4], y: h - it.transform[5], w: it.width ?? 0, s })
  }
  return out
}

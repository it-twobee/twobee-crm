'use client'

import { percorsoPrimoFoglio, righeFoglio, stringheCondivise } from '@/lib/sales-xlsx'

/* §433 — lo zip si apre nel browser con zip.js, come nell'area file (§421), e
   il file non va da nessuna parte: al server arrivano solo i lead già letti,
   dalla stessa porta del CSV. Il tetto sul decompresso c'è perché uno zip di
   pochi kilobyte può diventare gigabyte di XML: una lista di lead vera sta
   sotto il megabyte, trenta sono un margine largo. */
const TETTO = 30 * 1024 * 1024

const NON_SI_LEGGE = 'Questo file Excel non si apre: salvalo di nuovo come .xlsx, o esportalo in CSV.'

export async function leggiExcel(file: File): Promise<string[][]> {
  const zip = await import('@zip.js/zip.js')
  zip.configure({ useWebWorkers: false, useCompressionStream: true })
  let voci: Awaited<ReturnType<InstanceType<typeof zip.ZipReader>['getEntries']>>
  try {
    voci = await new zip.ZipReader(new zip.BlobReader(file)).getEntries()
  } catch { throw new Error(NON_SI_LEGGE) }
  if (voci.some(v => v.encrypted)) throw new Error('Il file è protetto da password: toglila in Excel e riprova.')

  const leggi = async (nome: string): Promise<string | null> => {
    const v = voci.find(x => x.filename === nome)
    if (!v || v.directory || !v.getData) return null
    if (v.uncompressedSize > TETTO) throw new Error('Il foglio è troppo grande.')
    return v.getData(new zip.TextWriter())
  }

  const percorso = percorsoPrimoFoglio(await leggi('xl/workbook.xml'), await leggi('xl/_rels/workbook.xml.rels'))
  const foglio = await leggi(percorso)
  if (!foglio) throw new Error(NON_SI_LEGGE)
  return righeFoglio(foglio, stringheCondivise((await leggi('xl/sharedStrings.xml')) ?? ''))
}

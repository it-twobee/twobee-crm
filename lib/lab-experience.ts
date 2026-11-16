import { labContextMonth } from '@/lib/lab-context'
import { shiftMonth } from '@/lib/pl'

export const LAB_MODULES = [
  { key: 'banca', title: 'Banca', question: 'Quali movimenti reali costituiscono l’effettivo?', action: 'Verifica entrate e uscite', source: 'Solo movimenti di origine banca, con fatture e altre prove', next: 'fatturazione' },
  { key: 'fatturazione', title: 'Fatture', question: 'Quali quote bancarie spiegano emesse e ricevute?', action: 'Verifica documenti e quote', source: 'Fatture e quote di movimenti bancari reali; registro separato', next: 'accordi' },
  { key: 'accordi', title: 'Accordi', question: 'Quale patto spiega il documento e la competenza?', action: 'Verifica patti e rate', source: 'Patti, rate e righe registrate; non sono fatti bancari', next: 'conto-economico' },
  { key: 'risorse', title: 'Risorse & tasse', question: 'Quali costi e versamenti hanno una prova?', action: 'Verifica persone e modelli', source: 'Registri HR, originali, F24 e quote bancarie', next: 'iva' },
  { key: 'iva', title: 'IVA', question: 'Quale importo è dovuto e quale risulta versato?', action: 'Verifica liquidazione e prove', source: 'Liquidazioni, modelli e componenti IVA', next: 'conto-economico' },
  { key: 'conto-economico', title: 'Conto economico', question: 'Che cosa determina il risultato e le quote?', action: 'Verifica righe e compensi', source: 'Competenza, incassi verificati e piano canonico', next: 'previsionale' },
  { key: 'previsionale', title: 'Previsionale', question: 'Cosa cambia con una scelta diversa?', action: 'Leggi il confronto', source: 'Accordi attuali e ipotesi esplicite dello scenario', next: 'accordi' },
  { key: 'progetti', title: 'Progetti', question: 'Quali patti ed esterni spiegano il margine?', action: 'Verifica il progetto', source: 'Patti e subappalti del progetto', next: 'accordi' },
] as const
export type LabModuleKey = typeof LAB_MODULES[number]['key']
export const labModule = (pathname: string) => LAB_MODULES.find(m => pathname === `/lab/${m.key}`)
export const labPageTitle = (pathname: string) => labModule(pathname)?.title ?? (pathname === '/lab/verifiche' ? 'Verifiche e fonti da completare' : pathname === '/lab/fonti' ? 'Fonti e acquisizione' : 'Riepilogo del mese')

export function journeyMonth(pathname: string, value: string | null, today: string) {
  return labContextMonth(value) ?? (pathname === '/lab/banca' ? `${today.slice(0, 7)}-01` : shiftMonth(`${today.slice(0, 7)}-01`, -1))
}
/** A return address is a bounded local Lab URL; nested returns never accumulate. */
export function labOrigin(value: string | null | undefined): string | null {
  if (!value || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return null
  try {
    const u = new URL(value, 'https://lab.invalid')
    if (u.origin !== 'https://lab.invalid' || !(u.pathname === '/lab' || u.pathname.startsWith('/lab/')) || /%5c|%2f/i.test(u.pathname)) return null
    u.searchParams.delete('from')
    u.searchParams.delete('origine')
    return `${u.pathname}${u.search}${u.hash}`
  } catch { return null }
}
export function journeyHref(href: string, source: string, origin: string | null, month: string, anchor?: string, root?: string | null) {
  if (!href.startsWith('/') || href.startsWith('//') || /[\\\x00-\x20]/.test(href)) return href
  const target = new URL(href, 'https://lab.invalid'), current = new URL(source, 'https://lab.invalid')
  const inLab = target.pathname === '/lab' || target.pathname.startsWith('/lab/')
  const management = ['/economics', '/clienti', '/progetti'].some(path => target.pathname === path || target.pathname.startsWith(`${path}/`))
  if (!inLab && !management) return href
  if (inLab && !target.searchParams.has('m')) target.searchParams.set('m', month)
  current.searchParams.delete('from')
  current.searchParams.delete('origine')
  if (!current.searchParams.has('m')) current.searchParams.set('m', month)
  if (anchor) current.hash = anchor
  const here = labOrigin(`${current.pathname}${current.search}${current.hash}`)
  const focused = ['documento', 'riga', 'persona', 'accordo', 'movimento', 'f24', 'liquidazione', 'emissione', 'giorno'].some(k => target.searchParams.has(k) && target.searchParams.get(k) !== current.searchParams.get(k))
  const back = target.pathname !== current.pathname || focused ? here : labOrigin(origin)
  const entry = labOrigin(root) ?? labOrigin(origin) ?? here
  if (back && target.pathname !== '/lab' && !target.searchParams.has('from')) target.searchParams.set('from', back)
  if (entry && target.pathname !== '/lab' && !target.searchParams.has('origine')) target.searchParams.set('origine', entry)

  return `${target.pathname}${target.search}${target.hash}`
}

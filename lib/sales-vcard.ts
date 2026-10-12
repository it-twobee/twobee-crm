export type DatiContatto = {
  azienda?: unknown
  persona?: unknown
  telefono?: unknown
  email?: unknown
  sito?: unknown
  indirizzo?: unknown
}

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\;').replace(/,/g, '\\,')

/** null se non c'è nulla da salvare in rubrica: un QR di una scheda vuota direbbe che c'è un contatto */
export function vcardDi(d: DatiContatto): string | null {
  const azienda = t(d.azienda), persona = t(d.persona), tel = t(d.telefono)
  const email = t(d.email), sito = t(d.sito), ind = t(d.indirizzo)
  if (!tel && !email) return null
  const nome = persona || azienda
  if (!nome) return null
  const parti = persona.split(/\s+/)
  const cognome = parti.length > 1 ? parti[parti.length - 1] : ''
  const dato = parti.length > 1 ? parti.slice(0, -1).join(' ') : persona
  const righe = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(cognome)};${esc(dato)};;;`, `FN:${esc(nome)}`]
  if (azienda) righe.push(`ORG:${esc(azienda)}`)
  if (tel) righe.push(`TEL;TYPE=WORK,VOICE:${tel.replace(/[^\d+]/g, '')}`)
  if (email) righe.push(`EMAIL;TYPE=WORK:${email}`)
  if (sito) righe.push(`URL:${sito}`)
  if (ind) righe.push(`ADR;TYPE=WORK:;;${esc(ind)};;;;`)
  righe.push('END:VCARD')
  return righe.join('\r\n')
}

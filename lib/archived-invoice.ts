export const archiveUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type ArchiveInvoiceDraft = {
  number: string; supplier: string; vatId: string; date: string; due: string
  currency: string; net: string; vat: string; total: string; reference: string; kind: 'TD01' | 'TD04' | 'TD05'
}
export const emptyArchiveInvoice: ArchiveInvoiceDraft = {
  number: '', supplier: '', vatId: '', date: '', due: '', currency: '', net: '', vat: '', total: '', reference: '', kind: 'TD01',
}

const months: Record<string, string> = {
  gennaio: '01', febbraio: '02', marzo: '03', aprile: '04', maggio: '05', giugno: '06',
  luglio: '07', agosto: '08', settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
}
const monthNumber = (word: string) => months[word.toLowerCase()] ?? Object.entries(months).find(([name]) => name.startsWith(word.toLowerCase()))?.[1]
function localDate(text: string) {
  const numeric = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (numeric) return `${numeric[3]}-${numeric[2]}-${numeric[1]}`
  const it = text.match(/^(\d{1,2}) ([a-z]+) (\d{4})/i)
  const en = text.match(/^([a-z]+) (\d{1,2}), (\d{4})/i)
  const month = it ? monthNumber(it[2]) : en ? monthNumber(en[1]) : undefined
  return month ? `${it?.[3] ?? en?.[3]}-${month}-${(it?.[1] ?? en?.[2] ?? '').padStart(2, '0')}` : ''
}

const euroAmount = /(?:\d[\d.]*,\d{2}|\d[\d,]*\.\d{2})/
function decimal(value?: string) {
  if (!value) return ''
  return value.lastIndexOf(',') > value.lastIndexOf('.') ? value.replaceAll('.', '').replace(',', '.') : value.replaceAll(',', '')
}

/** Suggerimenti da controllare sul PDF. Un campo assente rimane vuoto. */
export function suggestArchivedInvoice(raw: string) {
  const text = raw.replace(/\s+/g, ' ').trim()
  const value = (pattern: RegExp) => text.match(pattern)?.[1] ?? ''
  const draft = { ...emptyArchiveInvoice }
  if (/Meta Platforms Ireland Limited/i.test(text)) {
    if (/Operazione non riuscita|Pagamento non riuscito/i.test(text)) return { draft, blocked: 'Il PDF riporta un tentativo di pagamento non riuscito.' }
    const total = decimal(value(new RegExp(`Pagamento effettuato\\s+(${euroAmount.source})\\s*€`, 'i')))
    Object.assign(draft, {
      supplier: 'Meta Platforms Ireland Limited', vatId: value(/VAT Reg\. No\.\s*(IE[A-Z0-9]+)/i),
      number: value(/Num\. fattura\s+(FBADS-[\d-]+)/i), date: localDate(value(/Data pagamento\/fattura\s+(\d{1,2} [a-z]+ \d{4})/i)),
      currency: total ? 'EUR' : '', total,
      reference: value(/Numero di riferimento:\s*([A-Z0-9]+)/i),
    })
    if (total && /articolo 196|Article 196/i.test(text)) {
      draft.net = total
      draft.vat = '0'
    }
  } else if (/Canva Pty Ltd/i.test(text)) {
    const totals = text.match(new RegExp(`\\bTotal\\s+(${euroAmount.source})\\s+(${euroAmount.source})\\s+EUR\\s+(${euroAmount.source})`, 'i'))
    Object.assign(draft, {
      supplier: 'Canva Pty Ltd', vatId: value(/SaaS:\s*(EU\d+)/i),
      number: value(/Invoice\s*#:\s*([\d-]+)/i), date: localDate(value(/Invoice date:\s*([a-z]+ \d{1,2}, \d{4})/i)),
      currency: totals ? 'EUR' : '', net: decimal(totals?.[1]), vat: decimal(totals?.[2]), total: decimal(totals?.[3]),
    })
    draft.reference = draft.number.replace(/-1$/, '')
  } else if (/Regus Business Centres Italia/i.test(text)) {
    const total = decimal(value(new RegExp(`Totale \\(IVA incl\\.\\)\\s*€\\s*(${euroAmount.source})`, 'i')))
    const net = decimal(value(new RegExp(`Totale \\(IVA escl\\.\\)\\s*€\\s*(${euroAmount.source})`, 'i')))
    Object.assign(draft, {
      supplier: 'Regus Business Centres Italia Srl', vatId: value(/Gruppo IVA\s*:\s*(IT\d{11})\b/i),
      number: value(/(8493-\d{2}-\d+INV)/i), date: localDate(value(/Data fattura:\s*(\d{1,2} [a-z]+ \d{4})/i)),
      due: localDate(value(/Data di scadenza:\s*(\d{1,2} [a-z]+ \d{4})/i)),
      currency: total ? 'EUR' : '', total, net, vat: total && net ? (Number(total) - Number(net)).toFixed(2) : '',
    })
  }
  return { draft, blocked: null }
}

export function parseArchiveInvoice(input: ArchiveInvoiceDraft) {
  const date = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text)
    && Number.isFinite(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text
  const amount = (text: string) => {
    if (!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(text.trim())) throw Error('Indica imponibile, IVA e totale, anche quando l’IVA è zero.')
    return Number(text.replace(',', '.'))
  }
  const number = input.number.trim(), supplier = input.supplier.trim(), vatId = input.vatId.replace(/\s+/g, '').toUpperCase()
  const currency = input.currency.trim().toUpperCase(), reference = input.reference.trim()
  if (!number || number.length > 120 || !supplier || supplier.length > 250 || !/^[A-Z0-9]{5,30}$/.test(vatId)) throw Error('Controlla numero, fornitore e identificativo fiscale.')
  if (!date(input.date) || input.due && !date(input.due) || !/^[A-Z]{3}$/.test(currency)) throw Error('Controlla date e valuta del documento.')
  if (!['TD01', 'TD04', 'TD05'].includes(input.kind) || reference.length > 120 || /[\r\n]/.test(reference)) throw Error('Controlla tipo e riferimento del documento.')
  const net = amount(input.net), vat = amount(input.vat), total = amount(input.total)
  if (Math.abs(Math.round((net + vat - total) * 100)) > 1) throw Error('Imponibile e IVA devono quadrare con il totale del documento.')
  return { number, supplier, vatId, currency, reference, net, vat, total, date: input.date, due: input.due || null, kind: input.kind }
}

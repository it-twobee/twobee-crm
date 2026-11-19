export const archiveUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type ArchiveInvoiceDraft = {
  number: string; supplier: string; vatId: string; date: string; due: string
  currency: string; net: string; vat: string; total: string; reference: string; kind: 'TD01' | 'TD04' | 'TD05' | 'RICEVUTA_OCCASIONALE'
  taxCode?: string; withholding?: string; stamp?: string; payable?: string
}
export const emptyArchiveInvoice: ArchiveInvoiceDraft = {
  number: '', supplier: '', vatId: '', date: '', due: '', currency: '', net: '', vat: '', total: '', reference: '', kind: 'TD01',
  taxCode: '', withholding: '', stamp: '', payable: '',
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
  } else if (/Anthropic,? PBC/i.test(text)) {
    const euroAfter = (label: string) => decimal(value(new RegExp(`\\b${label}\\s*€\\s*(${euroAmount.source})`, 'i')))
    const total = euroAfter('Total')
    const net = euroAfter('Total excluding tax') || euroAfter('Subtotal')
    const tax = decimal(value(new RegExp(`VAT - .*?€\\s*(${euroAmount.source})\\s+Total\\s*€`, 'i')))
    const date = (label: string) => localDate(value(new RegExp(`${label}\\s*:?[ ]*([a-z]+ \\d{1,2}, \\d{4})`, 'i')))
    Object.assign(draft, {
      supplier: 'Anthropic, PBC',
      vatId: value(/VAT Registration EU VAT\s*[:\x00]\s*(IE[A-Z0-9]+)/i),
      number: (text.match(/Invoice number\s*:?\s*([A-Z0-9]+)\s*[-\x00]\s*(\d+)\b/i)?.slice(1).join('-') ?? ''),
      date: date('Date of issue') || date('Date paid'),
      due: date('Date due'), currency: total ? 'EUR' : '', total, net,
      vat: tax || (total && net && Number(total) === Number(net) ? '0' : ''),
      reference: text.match(/Receipt number\s*:?\s*(\d{4})\s*[-\x00]\s*(\d{4})\s*[-\x00]\s*(\d{4})\b/i)?.slice(1).join('-') ?? '',
    })
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
  if (/prestazion[ei]\s+(?:di\s+lavoro\s+)?occasional[ei]|lavoro autonomo occasionale/i.test(text)) draft.kind = 'RICEVUTA_OCCASIONALE'
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
  if (!number || number.length > 120 || !supplier || supplier.length > 250) throw Error('Controlla numero e fornitore.')
  if (vatId && !/^[A-Z0-9]{5,30}$/.test(vatId)) throw Error('Controlla l’identificativo fiscale del fornitore.')
  if (!date(input.date) || input.due && !date(input.due) || !/^[A-Z]{3}$/.test(currency)) throw Error('Controlla date e valuta del documento.')
  if (!['TD01', 'TD04', 'TD05', 'RICEVUTA_OCCASIONALE'].includes(input.kind) || reference.length > 120 || /[\r\n]/.test(reference)) throw Error('Controlla tipo e riferimento del documento.')
  const taxCode = (input.taxCode ?? '').replace(/\s+/g, '').toUpperCase()
  if (taxCode && !/^[A-Z0-9]{11,16}$/.test(taxCode)) throw Error('Controlla il codice fiscale del prestatore.')
  const occasional = input.kind === 'RICEVUTA_OCCASIONALE'
  if (occasional && !taxCode) throw Error('La ricevuta occasionale richiede il codice fiscale del prestatore.')
  if (occasional && [input.withholding, input.stamp, input.payable].some(v => v == null || v.trim() === '')) throw Error('Verifica ritenuta, bollo incluso nel totale e netto da pagare sul documento, anche se zero.')
  const net = amount(input.net), vat = amount(input.vat), total = amount(input.total)
  const withholding = input.withholding?.trim() ? amount(input.withholding) : 0
  const stamp = input.stamp?.trim() ? amount(input.stamp) : 0
  if (occasional && vat !== 0) throw Error('La ricevuta occasionale con IVA richiede una verifica del tipo di documento.')
  if (Math.abs(Math.round((net + vat + stamp - total) * 100)) > 1) throw Error('Compenso/imponibile, IVA e bollo addebitato devono quadrare con il totale lordo.')
  if (withholding > total) throw Error('La ritenuta non può superare il totale lordo.')
  const payable = input.payable?.trim() ? amount(input.payable) : Math.round((total - withholding) * 100) / 100
  if (Math.abs(Math.round((total - withholding - payable) * 100)) > 1) throw Error('Totale lordo meno ritenuta deve coincidere con il netto da pagare.')
  return { number, supplier, vatId, taxCode, currency, reference, net, vat, total, withholding, stamp, payable, date: input.date, due: input.due || null, kind: input.kind }
}

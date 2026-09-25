/**
 * §441 — i lead fuori dal tool: in Excel, in CSV, in PDF.
 *
 * Qui c'è la forma, pura: quali colonne, come si scrive ogni valore, il CSV e
 * l'XML dei fogli. Il file lo impacchetta la route (`/api/sales/export`), che è
 * anche la porta: esportano **solo super admin, founder e admin**, perché un file con
 * tutti i recapiti esce dal tool e non si richiama più.
 *
 * Ogni valore si scrive **come lo legge una persona**, non come sta nel
 * database: «Call fissata» e non `call_fissata`, il nome dell'Account Owner e
 * non il suo id, «24/09/2026 14:32» e non un ISO in UTC. Un export che chiede
 * di rileggere il tool per capirsi non è un export.
 */

import { COLONNE, ETICHETTA_QUALIFICA } from './sales-table'
import { etichettaFase, type Fase } from './sales-stages'
import { etichettaScelta, type Scelte } from './sales-scelte'
import type { Campo } from './sales-campi'
import { giornoOraRoma, titoloVoce, type Direzione, type StatoVoce, type TipoVoce } from './sales-timeline'

export const TIPI_EXPORT = ['lead', 'contatti'] as const
export type TipoExport = typeof TIPI_EXPORT[number]
export const FORMATI = ['xlsx', 'csv', 'pdf'] as const
export type Formato = typeof FORMATI[number]
export const MAX_RIGHE = 5000

export type Tabella = { intestazioni: string[]; righe: string[][] }

export type Contesto = {
  fasi: Fase[]
  scelte: Scelte
  motivi: Map<string, string>
  persone: Map<string, string>
  campi: Campo[]
}

export type VoceExport = {
  deal_id: string
  type: TipoVoce
  outcome: string | null
  direction: Direzione | null
  stato: StatoVoce
  occurred_at: string
  has_time: boolean
  content: string | null
  autore: string | null
}

type Deal = Record<string, unknown> & { id: string; owners?: string[] }

const ORIGINE: [string, string][] = [
  ['piattaforma', 'Piattaforma'], ['campagna', 'Campagna'], ['adset', 'Adset'], ['annuncio', 'Annuncio'],
  ['form', 'Modulo'], ['tipologia', 'Tipo di attività'], ['fatturato_dichiarato', 'Fatturato dichiarato'],
  ['tempistica', 'Quando vuole partire'],
]

const testo = (v: unknown) => v === null || v === undefined ? '' : String(v)
const euro = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

/** un valore di una colonna della scheda, in parole */
export function valoreCella(campo: string, v: unknown, d: Deal, ctx: Contesto): string {
  const c = COLONNE.find(x => x.campo === campo)
  if (!c) return testo(v)
  if (campo === 'owners') return (d.owners ?? []).map(id => ctx.persone.get(id) ?? 'Ex collega').join(', ')
  if (v === null || v === undefined || v === '') return ''
  if (c.tipo === 'fase') return etichettaFase(ctx.fasi, String(v))
  if (campo === 'qualifica') return ETICHETTA_QUALIFICA[String(v)] ?? String(v)
  if (c.tipo === 'motivo') return ctx.motivi.get(String(v)) ?? String(v)
  if (campo === 'priority' || campo === 'membership') return etichettaScelta(ctx.scelte, campo, String(v))
  if (campo === 'last_interaction_at') return giornoOraRoma(String(v), d.last_interaction_has_time !== false)
  if (campo === 'created_at') return giornoOraRoma(String(v))
  if (c.tipo === 'data') return giornoOraRoma(`${String(v).slice(0, 10)}T12:00:00Z`, false)
  if (c.tipo === 'si_no') return v ? 'Sì' : 'No'
  if (c.tipo === 'numero') { const n = Number(v); return Number.isFinite(n) ? (c.euro ? euro(n) : String(n)) : '' }
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

/**
 * Il lead completo: tutte le colonne della scheda, poi quello che il diario
 * calcola, i campi personalizzati, la provenienza Meta. Le interazioni
 * stanno in un foglio a parte (o, nel CSV, in una colonna riassunta).
 */
export function tabellaLead(deals: Deal[], ctx: Contesto, voci?: Map<string, VoceExport[]>): Tabella {
  const campi = ctx.campi.filter(c => deals.some(d => {
    const x = (d.campi_extra as Record<string, unknown> | null)?.[c.chiave]
    return x !== undefined && x !== null && x !== ''
  }) || c.attivo)
  const origine = ORIGINE.filter(([k]) => deals.some(d => (d.lead_origine as Record<string, unknown> | null)?.[k]))
  const intestazioni = [
    ...COLONNE.map(c => c.etichetta),
    'Prossimo follow-up',
    ...campi.map(c => c.etichetta),
    ...origine.map(([, e]) => e),
    ...(voci ? ['Interazioni'] : []),
  ]
  const righe = deals.map(d => {
    const extra = (d.campi_extra ?? {}) as Record<string, unknown>
    const org = (d.lead_origine ?? {}) as Record<string, unknown>
    return [
      ...COLONNE.map(c => valoreCella(c.campo, d[c.campo], d, ctx)),
      d.next_followup_at ? giornoOraRoma(String(d.next_followup_at)) : '',
      ...campi.map(c => {
        const x = extra[c.chiave]
        if (x === undefined || x === null || x === '') return ''
        if (c.tipo === 'si_no') return x ? 'Sì' : 'No'
        if (c.tipo === 'data') return giornoOraRoma(`${String(x).slice(0, 10)}T12:00:00Z`, false)
        return String(x)
      }),
      ...origine.map(([k]) => testo(org[k])),
      ...(voci ? [(voci.get(d.id) ?? []).map(v => rigaVoce(v)).join('\n')] : []),
    ]
  })
  return { intestazioni, righe }
}

/** una voce del diario in una riga: «24/09/2026 14:32 · Chiamata · Risposto — ci risentiamo lunedì» */
export function rigaVoce(v: VoceExport): string {
  const quando = giornoOraRoma(v.occurred_at, v.has_time)
  const nota = v.content ? ` — ${v.content.replace(/\s+/g, ' ').trim()}` : ''
  return `${quando} · ${titoloVoce(v)}${nota}`
}

export function tabellaInterazioni(deals: Deal[], voci: Map<string, VoceExport[]>): Tabella {
  const intestazioni = ['Azienda', 'Quando', 'Cosa', 'Nota', 'Chi', 'Stato']
  const righe: string[][] = []
  for (const d of deals) {
    for (const v of voci.get(d.id) ?? []) {
      righe.push([
        testo(d.company_name),
        giornoOraRoma(v.occurred_at, v.has_time),
        titoloVoce(v),
        v.content ?? '',
        v.type === 'contatto' ? 'Prima della timeline' : v.autore ?? '',
        v.stato === 'fatta' ? 'Fatta' : v.stato === 'in_programma' ? 'In programma' : 'Annullata',
      ])
    }
  }
  return { intestazioni, righe }
}

/** la rubrica: chi chiamare, e a che punto è */
export function tabellaContatti(deals: Deal[], ctx: Contesto): Tabella {
  return {
    intestazioni: ['Nome', 'Azienda', 'Email', 'Telefono', 'Account Owner', 'Fase'],
    righe: deals.map(d => [
      testo(d.contact_name), testo(d.company_name), testo(d.contact_email), testo(d.contact_phone),
      valoreCella('owners', null, d, ctx), valoreCella('stage', d.stage, d, ctx),
    ]),
  }
}

/**
 * Nel CSV una cella che comincia con `=`, `+`, `-` o `@` Excel la esegue come
 * formula: un nome azienda scritto «=HYPERLINK(…)» in un modulo Meta
 * diventerebbe un link cliccabile nel file di chi lo apre. Un apostrofo davanti
 * la fa restare testo. Un telefono («+39 333…», «-») non è una formula, e
 * l'apostrofo davanti a tutti i numeri italiani sarebbe il difetto opposto.
 * Nell'xlsx non serve: le celle sono testo in linea, Excel non le calcola.
 */
export const disinnesca = (s: string) => /^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().\/-]*$/.test(s) ? `'${s}` : s

/** CSV all'italiana: punto e virgola, a capo CRLF, BOM perché Excel legga le accentate */
export function csv(t: Tabella): string {
  const cella = (s: string) => {
    const x = disinnesca(s)
    return /[;"\r\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x
  }
  return '﻿' + [t.intestazioni, ...t.righe].map(r => r.map(cella).join(';')).join('\r\n') + '\r\n'
}

const xml = (s: string) => s
  // i caratteri di controllo non stanno in un XML: un file che Excel rifiuta di aprire è peggio di un carattere perso
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const colonna = (n: number) => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }

/** un foglio in SpreadsheetML: testo in linea, intestazione in grassetto e bloccata, larghezze dal contenuto */
export function foglioXml(t: Tabella): string {
  const tutte = [t.intestazioni, ...t.righe]
  const larghezze = t.intestazioni.map((_, i) =>
    Math.min(60, Math.max(8, ...tutte.map(r => Math.max(...(r[i] ?? '').split('\n').map(l => l.length))) ) + 2))
  const righe = tutte.map((r, y) =>
    `<row r="${y + 1}">${r.map((v, x) => `<c r="${colonna(x)}${y + 1}" t="inlineStr"${y === 0 ? ' s="1"' : v.includes('\n') ? ' s="2"' : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')}</row>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${larghezze.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${righe}</sheetData>` +
    (t.righe.length ? `<autoFilter ref="A1:${colonna(t.intestazioni.length - 1)}${t.righe.length + 1}"/>` : '') +
    `</worksheet>`
}

/** i file di un .xlsx, da impacchettare in uno zip */
export function fileXlsx(fogli: { nome: string; tabella: Tabella }[]): Record<string, string> {
  const nome = (s: string) => xml(s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
  const out: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${fogli.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${fogli.map((f, i) => `<sheet name="${nome(f.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${fogli.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${fogli.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  }
  fogli.forEach((f, i) => { out[`xl/worksheets/sheet${i + 1}.xml`] = foglioXml(f.tabella) })
  return out
}

/** `lead-twobee-2026-09-25.xlsx`: il giorno di Roma, non quello di Greenwich */
export function nomeFile(tipo: TipoExport, formato: Formato, adessoMs: number): string {
  const g = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(adessoMs))
  return `${tipo}-twobee-${g}.${formato}`
}

export const TIPO_MIME: Record<Formato, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
}

/** chi esporta: gli amministrativi (super admin, founder, admin), per ruolo o per l'elenco dei super admin */
export const puoEsportare = (appRole: string | null | undefined, email: string | null | undefined, superAdmin: readonly string[]) =>
  appRole === 'super_admin' || appRole === 'founder' || appRole === 'admin' || (!!email && superAdmin.includes(email))

/** la richiesta dal browser: tipo, formato, id (in ordine), e la frase dei filtri per il PDF */
export function validaRichiesta(raw: unknown): { ok: true; tipo: TipoExport; formato: Formato; ids: string[]; filtri: string } | { ok: false; motivo: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, motivo: 'Richiesta non valida' }
  const v = raw as Record<string, unknown>
  if (!TIPI_EXPORT.includes(v.tipo as TipoExport)) return { ok: false, motivo: 'Tipo di export non valido' }
  if (!FORMATI.includes(v.formato as Formato)) return { ok: false, motivo: 'Formato non valido' }
  if (!Array.isArray(v.ids) || !v.ids.length) return { ok: false, motivo: 'Nessun lead da esportare' }
  if (v.ids.length > MAX_RIGHE) return { ok: false, motivo: `Al massimo ${MAX_RIGHE} lead per volta` }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!v.ids.every(x => typeof x === 'string' && uuid.test(x))) return { ok: false, motivo: 'Lead non valido' }
  const filtri = typeof v.filtri === 'string' ? v.filtri.replace(/\s+/g, ' ').trim().slice(0, 500) : ''
  return { ok: true, tipo: v.tipo as TipoExport, formato: v.formato as Formato, ids: Array.from(new Set(v.ids as string[])), filtri }
}

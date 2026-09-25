import 'server-only'
import yazl from 'yazl'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fileXlsx, type Tabella } from './sales-export'

/**
 * §441 — i due formati che hanno bisogno di un impacchettatore: l'xlsx è uno
 * zip di XML (lo stesso che si legge per l'import, `lib/sales-xlsx.ts`), il PDF
 * una tabella orizzontale. Il contenuto viene tutto da `lib/sales-export.ts`.
 */

export async function xlsx(fogli: { nome: string; tabella: Tabella }[]): Promise<Buffer> {
  const zip = new yazl.ZipFile()
  for (const [percorso, contenuto] of Object.entries(fileXlsx(fogli))) zip.addBuffer(Buffer.from(contenuto, 'utf8'), percorso)
  zip.end()
  const pezzi: Buffer[] = []
  for await (const p of zip.outputStream as AsyncIterable<Buffer>) pezzi.push(p)
  return Buffer.concat(pezzi)
}

/**
 * I font standard del PDF parlano WinAnsi: le accentate ci sono, gli emoji e
 * pochi simboli no. Meglio un carattere sostituito che una cella di geroglifici.
 */
const pulito = (s: string) => s
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
  .replace(/[^\u0009\u000A\u0020-\u007E\u00A0-\u00FF\u20AC\u00B7]/g, '')

/* in millimetri, su 273 utili: l'azienda si legge su una riga, le date e i
   telefoni non vanno a capo a metà, e la nota prende il resto senza mangiarselo */
const LARGHEZZA: Record<string, number> = {
  Company: 36, Azienda: 36, Status: 22, Fase: 22, 'Contact Person': 26, Nome: 30, Phone: 26, Telefono: 28,
  Email: 38, 'Account Owner': 24, 'Last Contact': 24, Tentativi: 14, 'Prossimo follow-up': 24, Quando: 25, Nota: 90,
}

export function pdf(opts: {
  titolo: string
  sottotitolo: string
  tabelle: { titolo?: string; tabella: Tabella; colonne?: number[] }[]
}): Buffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
  doc.text(pulito(opts.titolo), 12, 14)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90)
  doc.text(doc.splitTextToSize(pulito(opts.sottotitolo), 270), 12, 20)
  doc.setTextColor(0)
  let y = 28
  for (const t of opts.tabelle) {
    const cols = t.colonne ?? t.tabella.intestazioni.map((_, i) => i)
    if (t.titolo) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
      doc.text(pulito(t.titolo), 12, y); y += 3
    }
    const larghezze = Object.fromEntries(cols
      .map((i, n) => [n, LARGHEZZA[t.tabella.intestazioni[i]]] as const)
      .filter(([, w]) => w).map(([n, w]) => [n, { cellWidth: w }]))
    autoTable(doc, {
      startY: y,
      columnStyles: larghezze,
      head: [cols.map(i => pulito(t.tabella.intestazioni[i]))],
      body: t.tabella.righe.map(r => cols.map(i => pulito(r[i] ?? ''))),
      styles: { fontSize: 7.5, cellPadding: 1.4, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [245, 200, 0], textColor: [0, 0, 0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 247, 247] },
      margin: { left: 12, right: 12 },
      didDrawPage: d => {
        doc.setFontSize(7); doc.setTextColor(120)
        doc.text(`Pagina ${d.pageNumber}`, 285, 204, { align: 'right' })
        doc.setTextColor(0)
      },
    })
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10
  }
  return Buffer.from(doc.output('arraybuffer'))
}

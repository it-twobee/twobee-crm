import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { economicMoney, type EconomicsReport } from '@/lib/lab-economics-report'

const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[–—→−]/g, '-').replace(/…/g, '...')
  .replace(/[^\u0009\u000A\u0020-\u007E\u00A0-\u00FF\u20AC\u00B7]/g, '')

export function economicsPdf(report: EconomicsReport): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let pageLabel = 'Compensi soci - TwoBee'
  const title = (label: string, sub: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(clean(label), 14, 17)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
    doc.text(doc.splitTextToSize(clean(sub), 180), 14, 25)
  }
  const table = (head: string[], body: string[][], startY = 45) => autoTable(doc, {
    head: [head.map(clean)], body: body.map(r => r.map(clean)), startY, theme: 'plain',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
    headStyles: { fontStyle: 'bold' }, margin: { left: 14, right: 14, top: 18, bottom: 18 },
    columnStyles: head.length === 3 ? { 0: { cellWidth: 120 }, 1: { cellWidth: 40 }, 2: { cellWidth: 22 } } : {},
    rowPageBreak: 'avoid',
    didDrawPage: data => {
      if (data.pageNumber > 1) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(clean(pageLabel), 14, 11) }
    },
  })
  title('Compensi soci - TwoBee', `${report.status} | Competenza ${report.month.slice(0, 7)} | ${report.version}\nOsservazione ${report.observedAt}\nErogazione prevista ${report.window.date}; riscontri fino al ${report.window.observedCutoff}`)
  table(['Persona', 'Maturato', 'Erogabile', 'Regolato', 'Da versare'], report.people.map(p => [p.name, economicMoney(p.matured), economicMoney(p.eligible), economicMoney(p.settled), economicMoney(p.remaining)]), 52)
  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  table(['Limiti e fonti'], report.limits.map(s => [s]), y)
  for (const person of report.people) {
    pageLabel = person.name
    doc.addPage()
    title(person.name, `Competenza ${report.month.slice(0, 7)} | Maturato ${economicMoney(person.matured)} | Erogabile ${economicMoney(person.eligible)}\nRegolato ${economicMoney(person.settled)} | Da versare ${economicMoney(person.remaining)}\nLe due liste sono letture distinte: non sommare maturato ed erogabile.`)
    const rows = (label: string, details: typeof person.rows) => {
      const headerY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
      let start = label === 'Maturato' ? 49 : (headerY ?? 49) + 9
      if (start > 245) { doc.addPage(); start = 22 }
      table([label, 'Base / esterni', 'Quota'], details.length ? details.map(r => [
        `${r.client}\n${r.label}\n${r.month.slice(0, 7)} | ${r.kind} | ${r.reason}\nProgetto: ${r.project}\n${r.source}`,
        `${economicMoney(r.base)}\nEsterni ${economicMoney(r.external)}\n${Math.round(r.pct * 10000) / 100}%`, economicMoney(r.amount),
      ]) : [['Nessuna voce determinata. Leggere importo e limiti del riepilogo.', '', '']], start)
    }
    rows('Maturato', person.rows); rows('Erogabile nella finestra', person.eligibleRows)
  }
  doc.addPage()
  pageLabel = 'Raccordo della finestra'
  title('Raccordo della finestra', `Da ${report.window.since ?? 'consolidato / base da verificare'} a ${report.window.date}\nCompetenze dal ${report.window.from ?? 'consolidato non impostato'}; osservato fino al ${report.window.observedCutoff}.\nUna collocazione temporale non certifica una precedente erogazione.`)
  table(['Competenza / riga', 'Esito / prova'], report.exclusions.map(e => [`${e.month.slice(0, 7)} | ${e.label}\n${e.id}`, `${e.note}\nCopertura: ${e.paidOn ?? 'n/d'}`]), 48)
  if (report.otherSales.length) {
    pageLabel = 'Commerciali non soci'
    doc.addPage(); title('Commerciali non soci', 'Importi distinti dalle tre persone del riepilogo. Nessuna nuova conferma di pagamento.')
    table(['Persona', 'Erogabile da motore'], report.otherSales.map(p => [p.name, economicMoney(p.eligible)]))
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page); doc.setFontSize(9); doc.text(`Bozza da completare | ${page}/${doc.getNumberOfPages()}`, 14, 289)
  }
  return Buffer.from(doc.output('arraybuffer'))
}

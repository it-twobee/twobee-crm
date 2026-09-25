/**
 * §450 — i PDF del consulente del lavoro: cedolino e F24.
 *
 * Il consulente lavora con Ranocchi (elaborati Gialeda): il cedolino è un
 * modulo con le etichette stampate e i valori scritti sotto, ciascuno nella
 * colonna della sua etichetta; l'F24 è il modello ministeriale, con euro e
 * centesimi in caselle separate. Il testo da solo non basta — «1.385,94»
 * compare due volte nella stessa riga, come reddito e come imponibile — quindi
 * si legge **per posizione**: le parole arrivano con le coordinate (`Pezzo`,
 * da pdf.js), e ogni valore si cerca sotto la sua etichetta.
 *
 * Un cedolino si salva da solo solo se **quadra al centesimo** (competenze −
 * contributi − IRPEF − addizionali − trattenute + arrotondamento = netto) e le
 * voci sommano al totale: un lettore che sbaglia colonna produce numeri
 * plausibili, e la quadratura è il controllo che lo scopre. Se non quadra, il
 * cedolino resta da confermare con il perché.
 *
 * Puro: le coordinate arrivano dal browser, qui non si apre nessun file.
 */

export type Pezzo = { x: number; y: number; w: number; s: string }

const r2 = (n: number) => Math.round(n * 100) / 100
/** «1.840,72» → 1840.72; «-2,32» → -2.32 */
export function numero(s: string): number | null {
  const t = s.trim().replace(/\s/g, '')
  if (!/^-?\d{1,3}(\.\d{3})*,\d{2,5}$|^-?\d+,\d{2,5}$/.test(t)) return null
  return Number(t.replace(/\./g, '').replace(',', '.'))
}
const destra = (p: Pezzo) => p.x + p.w

// ── il cedolino ─────────────────────────────────────────────────────────────

/** le colonne del modulo Ranocchi, dove cominciano le etichette */
const COLONNE = [23.8, 81.6, 140.1, 197.6, 256.1, 317.9, 378.7, 445]
const colonnaDi = (x: number) => COLONNE.findIndex((c, i) => x >= c - 3 && x < (COLONNE[i + 1] ?? 999) - 3)

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

export type CampiCedolino = {
  base_pay: number; holidays_taken: number; leave_paid: number; public_holidays: number
  thirteenth: number; fourteenth: number; overtime: number; bonus: number; allowances: number
  reimbursements: number; travel: number; total_earnings: number
  contributory_base: number; taxable_base: number
  employee_contrib: number; irpef: number; surcharges: number; other_deductions: number
  rounding: number; net_paid: number; tfr_accrued: number
}

export type CedolinoLetto = {
  mese: string
  nome: string
  codiceFiscale: string | null
  voci: { codice: string; descrizione: string; competenza: number; trattenuta: number }[]
  campi: CampiCedolino
  /** la quadratura: quanto manca al netto, al centesimo */
  differenza: number
  quadra: boolean
  avvisi: string[]
}

/** la voce del cedolino nel campo del motore, dalla descrizione */
function campoVoce(d: string): keyof CampiCedolino {
  const t = d.toUpperCase()
  if (/QUATTORDICES/.test(t)) return 'fourteenth'
  if (/TREDICES/.test(t)) return 'thirteenth'
  if (/FESTIVIT/.test(t)) return 'public_holidays'
  if (/FERIE/.test(t)) return 'holidays_taken'
  if (/PERMESS|\bROL\b/.test(t)) return 'leave_paid'
  if (/STRAORD/.test(t)) return 'overtime'
  if (/TRASFERT/.test(t)) return 'travel'
  if (/RIMBORS/.test(t)) return 'reimbursements'
  if (/PREMIO|BONUS|UNA TANTUM/.test(t)) return 'bonus'
  if (/RETRIBUZIONE|ORDINARI|STIPENDIO|PAGA BASE/.test(t)) return 'base_pay'
  return 'allowances'
}

export function eRanocchi(p: Pezzo[]) { return p.some(x => /Ranocchi/i.test(x.s)) }

export function leggiCedolino(p: Pezzo[]): { ok: true; cedolino: CedolinoLetto } | { ok: false; motivo: string } {
  if (!eRanocchi(p)) return { ok: false, motivo: 'Non è un cedolino Ranocchi: per ora si legge solo questo tracciato' }

  /* un'etichetta: la sequenza di parole sulla stessa riga, a partire da una colonna */
  const piatto = (t: string) => t.replace(/[\s.]+/g, '').toUpperCase()
  const etichetta = (parole: string[], dopoY = 0) => {
    const cerca = piatto(parole.join(''))
    for (const a of p.filter(x => piatto(x.s) === piatto(parole[0]) && x.y > dopoY).sort((a, b) => a.y - b.y)) {
      const riga = p.filter(x => Math.abs(x.y - a.y) < 1.5 && x.x >= a.x - 0.5).sort((q, r) => q.x - r.x)
      if (piatto(riga.map(x => x.s).join('')).startsWith(cerca)) return a
    }
    return null
  }
  /* il valore sotto l'etichetta, nella sua colonna, il più vicino */
  const sotto = (parole: string[], finoA = 18, dopoY = 0): number | null => {
    const e = etichetta(parole, dopoY)
    if (!e) return null
    const c = colonnaDi(e.x)
    if (c < 0) return null
    const candidati = p.filter(x => x.y > e.y + 0.5 && x.y <= e.y + finoA && numero(x.s) !== null
      && destra(x) > COLONNE[c] && destra(x) <= (COLONNE[c + 1] ?? 999) + 2)
      .sort((a, b) => a.y - b.y)
    return candidati.length ? numero(candidati[0].s) : 0
  }

  const avvisi: string[] = []
  // il mese: sotto «MESE», in lettere, con l'anno accanto
  const mEt = p.find(x => x.s === 'MESE' && x.y < 80)
  const mNome = mEt ? p.find(x => x.y > mEt.y && x.y < mEt.y + 25 && MESI.includes(x.s.toLowerCase())) : null
  const anno = mNome ? p.find(x => Math.abs(x.y - mNome.y) < 1.5 && /^20\d{2}$/.test(x.s)) : null
  if (!mNome || !anno) return { ok: false, motivo: 'Non trovo il mese del cedolino' }
  const mese = `${anno.s}-${String(MESI.indexOf(mNome.s.toLowerCase()) + 1).padStart(2, '0')}-01`

  const nomeP = p.find(x => /^\d+\s+[A-ZÀ-Ü'][A-ZÀ-Ü' ]+$/.test(x.s) && x.y < 140 && x.x > 300)
  const nome = nomeP ? nomeP.s.replace(/^\d+\s+/, '').trim() : ''
  const cf = p.find(x => /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(x.s))?.s ?? null
  if (!nome) avvisi.push('Nome del dipendente non trovato')

  // le voci: codice e descrizione a sinistra, competenza e trattenuta nelle loro colonne
  const comp = p.find(x => x.s === 'COMPETENZA'), tratt = p.find(x => x.s === 'TRATTENUTA')
  if (!comp || !tratt) return { ok: false, motivo: 'Non trovo la tabella delle voci' }
  const voci: CedolinoLetto['voci'] = []
  for (const v of p.filter(x => x.y > comp.y + 3 && x.y < comp.y + 200 && x.x < 60 && /^\d{1,4}\s+\S/.test(x.s))) {
    const m = /^(\d{1,4})\s+(.+)$/.exec(v.s)!
    const stessa = p.filter(x => Math.abs(x.y - v.y) < 1.5 && numero(x.s) !== null)
    const inCol = (e: Pezzo, fine: number) => stessa.find(x => destra(x) > e.x - 2 && destra(x) <= fine)
    const c = inCol(comp, tratt.x + 2), t = inCol(tratt, tratt.x + tratt.w + 18)
    if (!c && !t) continue
    voci.push({ codice: m[1], descrizione: m[2].trim(), competenza: c ? numero(c.s)! : 0, trattenuta: t ? numero(t.s)! : 0 })
  }
  // il totale delle competenze: nella colonna competenza, sotto l'ultima voce
  const ultima = Math.max(comp.y, ...p.filter(x => voci.some(v => x.s.startsWith(`${v.codice} `))).map(x => x.y))
  const totP = p.filter(x => x.y > ultima + 3 && x.y < ultima + 220 && numero(x.s) !== null && Math.abs(destra(x) - (comp.x + comp.w + 4)) < 8)
    .sort((a, b) => a.y - b.y)[0]
  const totale = totP ? numero(totP.s)! : r2(voci.reduce((s, v) => s + v.competenza, 0))
  const sommaVoci = r2(voci.reduce((s, v) => s + v.competenza, 0))
  if (Math.abs(sommaVoci - totale) > 0.01) avvisi.push(`Le voci sommano ${sommaVoci.toFixed(2)} e il totale dice ${totale.toFixed(2)}`)

  const enteY = etichetta(['ENTE', '-', 'VOCE'])?.y ?? 0
  const imponibileInps = sotto(['IMPONIBILE'], 30, enteY - 1) ?? 0
  const contributi = sotto(['TOTALE', 'CONTRIBUTI'], 45) ?? 0
  const imponibileIrpef = sotto(['IMPONIBILE', 'IRPEF']) ?? 0
  const irpefMese = sotto(['TOTALE', 'IRPEF', 'MESE']) ?? 0
  const irpefCong = sotto(['TOTALE', 'IRPEF', 'CONGUAGLIO']) ?? 0
  const addizionali = sotto(['TOT.', 'ADDIZIONALI']) ?? 0
  const trattVoci = sotto(['TRATTENUTE', 'DA', 'VOCI']) ?? 0
  const arrPrec = sotto(['ARROTOND.', 'PREC.']) ?? 0
  const altre = sotto(['ALTRE', 'TRATTENUTE']) ?? 0
  const arrAtt = sotto(['ARROTOND.', 'ATT.']) ?? 0
  const netto = sotto(['NETTO'])
  const tfrMese = sotto(['TFR', 'MESE']) ?? 0
  if (netto === null) return { ok: false, motivo: 'Non trovo il netto' }

  const irpef = r2(irpefMese + irpefCong)
  const altreDavvero = r2(trattVoci + altre - arrPrec)
  const atteso = r2(totale - contributi - irpef - addizionali - trattVoci - altre + arrAtt)
  const differenza = r2(netto - atteso)

  const campi: CampiCedolino = {
    base_pay: 0, holidays_taken: 0, leave_paid: 0, public_holidays: 0, thirteenth: 0, fourteenth: 0,
    overtime: 0, bonus: 0, allowances: 0, reimbursements: 0, travel: 0,
    total_earnings: totale, contributory_base: imponibileInps, taxable_base: imponibileIrpef,
    employee_contrib: contributi, irpef, surcharges: addizionali, other_deductions: altreDavvero,
    rounding: r2(arrAtt - arrPrec), net_paid: netto, tfr_accrued: tfrMese,
  }
  for (const v of voci) campi[campoVoce(v.descrizione)] = r2(campi[campoVoce(v.descrizione)] + v.competenza)

  const quadra = Math.abs(differenza) < 0.005 && Math.abs(sommaVoci - totale) < 0.005 && !!nome
  if (Math.abs(differenza) >= 0.005) avvisi.push(`Il netto non quadra di ${differenza.toFixed(2)} €`)
  return { ok: true, cedolino: { mese, nome, codiceFiscale: cf, voci, campi, differenza, quadra, avvisi } }
}

// ── l'F24 ───────────────────────────────────────────────────────────────────

export type RigaF24 = {
  sezione: 'erario' | 'inps' | 'regioni' | 'locali' | 'inail' | 'altri'
  codice: string
  /** il periodo di riferimento come lo scrive il modello: «0008 2026», «082026» */
  riferimento: string
  debito: number
  credito: number
}

export type F24Letto = {
  /** il mese di competenza (dal riferimento delle righe), primo del mese */
  competenza: string | null
  scadenza: string | null
  righe: RigaF24[]
  saldoFinale: number
  erarioDebito: number
  crediti: number
  inps: number
  inail: number
  altro: number
  quadra: boolean
  avvisi: string[]
}

/** «170 15» → 170.15; «199 73-» → -199.73 */
function importoF24(s: string): number | null {
  const m = /^(\d{1,3}(?:[ .]?\d{3})*)\s+(\d{2})(-?)$/.exec(s.trim())
  if (!m) return null
  const v = Number(`${m[1].replace(/[ .]/g, '')}.${m[2]}`)
  return m[3] ? -v : v
}

const SEZIONI: RigaF24['sezione'][] = ['erario', 'inps', 'regioni', 'locali', 'inail', 'altri']

export function leggiF24(p: Pezzo[]): { ok: true; f24: F24Letto } | { ok: false; motivo: string } {
  if (!p.some(x => /MOD\.\s*F24/i.test(x.s) || x.s === 'F24')) return { ok: false, motivo: 'Non è un modello F24' }
  const totali = p.filter(x => x.s === 'TOTALE').map(x => x.y).sort((a, b) => a - b)
  if (totali.length < 2) return { ok: false, motivo: 'Non trovo le sezioni del modello' }
  // le colonne degli importi nel modello ministeriale: debito, credito, poi il saldo
  const DEB = [325, 405], CRE = [405, 500]

  const righe: RigaF24[] = []
  const avvisi: string[] = []
  const perRiga = new Map<number, Pezzo[]>()
  for (const x of p) {
    const k = Array.from(perRiga.keys()).find(y => Math.abs(y - x.y) < 1.5) ?? x.y
    perRiga.set(k, [...(perRiga.get(k) ?? []), x])
  }
  for (const [y, pz] of Array.from(perRiga.entries()).sort((a, b) => a[0] - b[0])) {
    if (totali.some(t => Math.abs(t - y) < 3)) continue          // la riga dei totali di sezione
    const deb = pz.find(x => x.x >= DEB[0] && x.x < DEB[1] && importoF24(x.s) !== null)
    const cre = pz.find(x => x.x >= CRE[0] && x.x < CRE[1] && importoF24(x.s) !== null)
    if (!deb && !cre) continue
    const sinistra = pz.filter(x => x.x < 325).sort((a, b) => a.x - b.x).map(x => x.s).join(' ').trim()
    if (!sinistra) continue
    const sez = SEZIONI[Math.min(SEZIONI.length - 1, totali.filter(t => t < y).length)]
    // a sinistra del codice c'è la scritta della sezione («IMPOSTE DIRETTE – IVA»)
    const parti = sinistra.split(/\s+/)
    const k = Math.max(0, parti.findIndex(t => /^\d{4}$/.test(t)))
    righe.push({ sezione: sez, codice: parti[k], riferimento: parti.slice(k + 1).join(' '),
      debito: deb ? importoF24(deb.s)! : 0, credito: cre ? Math.abs(importoF24(cre.s)!) : 0 })
  }
  if (!righe.length) return { ok: false, motivo: 'Nessuna riga di tributo trovata' }

  const finale = p.find(x => x.s === 'SALDO FINALE')
  const saldoP = finale ? p.filter(x => x.y > finale.y && x.y < finale.y + 20 && x.x > 500 && importoF24(x.s) !== null)[0] : null
  const saldoFinale = saldoP ? importoF24(saldoP.s)! : r2(righe.reduce((s, r) => s + r.debito - r.credito, 0))

  const scad = p.map(x => /Scadenza versamento:\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(x.s)).find(Boolean)
  const scadenza = scad ? `${scad[3]}-${scad[2]}-${scad[1]}` : null

  /* il mese di competenza dalle righe: «0008 2026» (erario: rateazione/mese e
     anno) o «082026» (INPS: mese e anno) */
  let competenza: string | null = null
  for (const r of righe) {
    const a = /^00(\d{2})\s+(\d{4})$/.exec(r.riferimento) ?? /(?:^|\s)(\d{2})(\d{4})$/.exec(r.riferimento)
    if (a && Number(a[1]) >= 1 && Number(a[1]) <= 12) { competenza = `${a[2]}-${a[1]}-01`; break }
  }
  if (!competenza) avvisi.push('Mese di riferimento non trovato')

  const somma = (f: (r: RigaF24) => number) => r2(righe.reduce((s, r) => s + f(r), 0))
  const erarioDebito = somma(r => r.sezione === 'erario' ? r.debito : 0)
  const crediti = somma(r => r.credito)
  const inps = somma(r => r.sezione === 'inps' ? r.debito - r.credito : 0)
  const inail = somma(r => r.sezione === 'inail' ? r.debito - r.credito : 0)
  const altro = somma(r => ['regioni', 'locali', 'altri'].includes(r.sezione) ? r.debito - r.credito : 0)
  const calcolato = somma(r => r.debito - r.credito)
  const quadra = Math.abs(calcolato - saldoFinale) < 0.005
  if (!quadra) avvisi.push(`Le righe fanno ${calcolato.toFixed(2)} e il saldo finale dice ${saldoFinale.toFixed(2)}`)
  return { ok: true, f24: { competenza, scadenza, righe, saldoFinale, erarioDebito, crediti, inps, inail, altro, quadra, avvisi } }
}

/** «CRISTALLO MICHELE» e «Michele Cristallo» sono la stessa persona */
export function stessaPersona(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[\s']+/).filter(Boolean).sort().join(' ')
  return !!a && !!b && n(a) === n(b)
}

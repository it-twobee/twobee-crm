/**
 * §448 — il personale su un periodo: quanto costa ognuno mese per mese, quanto
 * ha maturato di tredicesima, quattordicesima e TFR, e quando quei soldi escono.
 *
 * La pagina Personale ragionava su un mese alla volta. Qui il periodo si sceglie
 * e le celle dicono da dove vengono: **dal cedolino** dove c'è — è il costo
 * vero, e a dicembre e a giugno porta dentro tredicesima e quattordicesima
 * pagate — **dalla stima da contratto** dove no, con i ratei spalmati. Una
 * cella stimata che sembra vera è il numero plausibile e sbagliato che nessuno
 * va a controllare, quindi la fonte è sempre scritta.
 *
 * Puro: le righe arrivano già mappate (`lib/payroll-map.ts`), i conti sono
 * quelli di `lib/payroll.ts` (`personCost`, `payslipViews`, `accruals`).
 */

import {
  accruals, contractSpec, inForce, payslipViews, personCost,
  type Payslip, type PayrollParams, type TfrLedger,
} from './payroll'
import type { PersonRow } from './payroll-map'

const r2 = (n: number) => Math.round(n * 100) / 100
const piu = (n: number) => (n > 0 ? n : 0)

export type FonteCella = 'cedolino' | 'stima' | 'fuori'

export type Cella = {
  mese: string
  fonte: FonteCella
  /** costo aziendale del mese */
  totale: number
  /** retribuzione lorda (competenze, arrotondamento compreso) */
  lordo: number
  /** contributi azienda, INAIL e altri oneri */
  oneri: number
  /** TFR maturato nel mese */
  tfr: number
  /** buoni pasto e benefit */
  altro: number
  /** gli oneri sono stimati anche se il cedolino c'è (il consulente non li ha mandati) */
  oneriStimati: boolean
}

const vuota = (mese: string): Cella => ({ mese, fonte: 'fuori', totale: 0, lordo: 0, oneri: 0, tfr: 0, altro: 0, oneriStimati: false })

/** il costo di una persona in un mese: il cedolino se c'è, la stima se è in forza, niente se non c'era */
export function cellaCosto(p: PersonRow, cedolino: Payslip | null, prm: PayrollParams, mese: string): Cella {
  if (cedolino) {
    const v = payslipViews(cedolino, p.kind, prm)
    const lordo = r2(cedolino.totalEarnings + cedolino.rounding)
    return {
      mese, fonte: 'cedolino', totale: v.economic, lordo,
      oneri: r2(v.economic - lordo - cedolino.tfrAccrued), tfr: cedolino.tfrAccrued, altro: 0,
      oneriStimati: v.estimated,
    }
  }
  if (!inForce({ hiredOn: p.hiredOn, endsOn: p.endsOn }, mese)) return vuota(mese)
  const c = personCost(p, prm)
  // `monthly` è il totale diviso i mesi di presenza: la stessa quota vale per ogni voce
  const q = c.total > 0 ? c.monthly / c.total : 0
  return {
    mese, fonte: 'stima', totale: c.monthly,
    lordo: r2(c.gross * q), oneri: r2((c.inpsEmployer + c.inail + c.fixedTermExtra) * q),
    tfr: r2(c.tfr * q), altro: r2((c.mealVouchers + c.benefits) * q), oneriStimati: true,
  }
}

export type Matrice = {
  mesi: string[]
  righe: { persona: PersonRow; celle: Cella[]; totale: number; daCedolino: number }[]
  totaliMese: number[]
  totale: number
  /** quante celle vengono da un cedolino e quante sono stimate: si dice in testa */
  vere: number
  stimate: number
}

/** mesi × persone. Chi non è mai in forza nel periodo resta fuori: una riga di zeri non dice niente */
export function matrice(
  persone: PersonRow[],
  cedolini: Payslip[],
  parametri: (anno: number) => PayrollParams,
  mesi: string[],
): Matrice {
  const perChiave = new Map(cedolini.map(s => [`${s.personId}|${s.month.slice(0, 10)}`, s]))
  const righe = persone.map(p => {
    const celle = mesi.map(m => cellaCosto(p, perChiave.get(`${p.id}|${m}`) ?? null, parametri(Number(m.slice(0, 4))), m))
    return {
      persona: p, celle,
      totale: r2(celle.reduce((s, c) => s + c.totale, 0)),
      daCedolino: celle.filter(c => c.fonte === 'cedolino').length,
    }
  }).filter(r => r.celle.some(c => c.fonte !== 'fuori'))
  const totaliMese = mesi.map((_, i) => r2(righe.reduce((s, r) => s + r.celle[i].totale, 0)))
  const tutte = righe.flatMap(r => r.celle)
  return {
    mesi, righe, totaliMese, totale: r2(totaliMese.reduce((a, b) => a + b, 0)),
    vere: tutte.filter(c => c.fonte === 'cedolino').length,
    stimate: tutte.filter(c => c.fonte === 'stima').length,
  }
}

// ── i maturati ──────────────────────────────────────────────────────────────

const meseDopo = (m: string, n: number) => {
  const [a, mm] = m.split('-').map(Number)
  const d = new Date(Date.UTC(a, mm - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}
const mesiFra = (da: string, a: string) => { const out: string[] = []; for (let m = da; m <= a; m = meseDopo(m, 1)) out.push(m); return out }

export type Maturato = {
  /** maturato nel periodo di maturazione fino al mese guardato */
  maturato: number
  /** già pagato con i cedolini dello stesso periodo */
  pagato: number
  /** quello che resta da pagare */
  residuo: number
  /** il mese in cui esce, lordo più gli oneri azienda */
  esce: string | null
  esceCassa: number
}

export type Maturati = {
  tredicesima: Maturato
  quattordicesima: Maturato | null
  tfr: {
    /** fondo in azienda: maturato e non liquidato né versato */
    inAzienda: number
    /** versato a un fondo pensione (movimenti «fondo») */
    alFondo: number
    liquidato: number
    /** se il rapporto finisce, il mese in cui il TFR in azienda esce */
    esce: string | null
    /** quota che va al fondo ogni mese, se la persona ne ha uno */
    fondoMensile: number
  }
}

/**
 * Quanto ha maturato una persona fino al mese `mese` compreso.
 *
 * La tredicesima matura da gennaio (o dall'assunzione) ed esce a dicembre; la
 * quattordicesima da luglio a giugno ed esce a giugno. Il rateo è quello del
 * contratto — una mensilità divisa in dodici — contato sui mesi in forza; il
 * pagato è quello dei cedolini dello stesso periodo. Il TFR viene dal registro
 * (`tfrLedger`): in azienda, al fondo, liquidato.
 */
export function maturatiAl(p: PersonRow, cedolini: Payslip[], prm: PayrollParams, mese: string, tfr: TfrLedger | null): Maturati {
  const spec = contractSpec(p.kind)
  const mensilita = Math.max(1, p.months)
  const rateo = spec.tfr ? r2((piu(p.gross) * Math.max(0, p.fte) / mensilita) / 12) : 0
  const acc = accruals(p, prm)
  const carico = acc.thirteenth > 0 ? acc.decemberCash / acc.thirteenth : 1
  const inForza = (m: string) => inForce({ hiredOn: p.hiredOn, endsOn: p.endsOn }, m)
  const suoi = cedolini.filter(s => s.personId === p.id)

  const conto = (da: string, esce: string, campo: 'thirteenth' | 'fourteenth'): Maturato => {
    const mesi = mesiFra(da, mese).filter(inForza)
    const maturato = r2(rateo * mesi.length)
    const pagato = r2(suoi.filter(s => s.month.slice(0, 10) >= da && s.month.slice(0, 10) <= mese).reduce((t, s) => t + s[campo], 0))
    // sotto l'euro è l'arrotondamento dei ratei, non un debito
    const soglia = (n: number) => (n < 1 ? 0 : n)
    const residuo = soglia(r2(piu(maturato - pagato)))
    /* quello che resta esce nel mese di pagamento — o prima, con la
       liquidazione, se il rapporto finisce prima: chi lascia a novembre prende
       la tredicesima pro quota a novembre, non a dicembre */
    const quando = fine && fine < esce ? fine : esce
    const aFine = r2(rateo * mesiFra(da, quando).filter(inForza).length)
    const resta = soglia(r2(piu(aFine - pagato)))
    return { maturato, pagato, residuo, esce: resta > 0 ? quando : null, esceCassa: r2(resta * carico) }
  }

  const fine = p.endsOn ? `${p.endsOn.slice(0, 7)}-01` : null
  const anno = mese.slice(0, 4)
  const tredicesima = conto(`${anno}-01-01`, `${anno}-12-01`, 'thirteenth')
  const luglio = Number(mese.slice(5, 7)) >= 7 ? `${anno}-07-01` : `${Number(anno) - 1}-07-01`
  const giugno = `${Number(luglio.slice(0, 4)) + 1}-06-01`
  const quattordicesima = mensilita >= 14 && spec.tfr ? conto(luglio, giugno, 'fourteenth') : null

  return {
    tredicesima, quattordicesima,
    tfr: {
      inAzienda: tfr?.inCompany ?? 0,
      alFondo: tfr?.toFund ?? 0,
      liquidato: tfr?.liquidated ?? 0,
      esce: fine && fine >= mese && (tfr?.inCompany ?? 0) > 0 ? fine : null,
      fondoMensile: r2(acc.tfrMonth * Math.min(1, piu(p.pensionFundPct ?? 0))),
    },
  }
}

export type Uscita = { mese: string; chi: string; cosa: 'tredicesima' | 'quattordicesima' | 'tfr' | 'fondo'; importo: number }

/** le uscite che i maturati portano nei prossimi `n` mesi, in ordine */
export function calendarioUscite(righe: { persona: PersonRow; maturati: Maturati }[], dal: string, n = 12): Uscita[] {
  const al = meseDopo(dal, n - 1)
  const out: Uscita[] = []
  for (const { persona: p, maturati: m } of righe) {
    if (m.tredicesima.esce && m.tredicesima.esce >= dal && m.tredicesima.esce <= al) out.push({ mese: m.tredicesima.esce, chi: p.name, cosa: 'tredicesima', importo: m.tredicesima.esceCassa })
    if (m.quattordicesima?.esce && m.quattordicesima.esce >= dal && m.quattordicesima.esce <= al) out.push({ mese: m.quattordicesima.esce, chi: p.name, cosa: 'quattordicesima', importo: m.quattordicesima.esceCassa })
    if (m.tfr.esce && m.tfr.esce <= al) out.push({ mese: m.tfr.esce, chi: p.name, cosa: 'tfr', importo: m.tfr.inAzienda })
    if (m.tfr.fondoMensile > 0) for (const mm of mesiFra(dal, al)) {
      if (inForce({ hiredOn: p.hiredOn, endsOn: p.endsOn }, mm)) out.push({ mese: mm, chi: p.name, cosa: 'fondo', importo: m.tfr.fondoMensile })
    }
  }
  return out.filter(u => u.importo > 0).sort((a, b) => a.mese.localeCompare(b.mese) || a.chi.localeCompare(b.chi))
}

export { mesiFra, meseDopo }

/**
 * §448 — quanto va nell'F24 del personale di ogni mese, dai cedolini: le
 * trattenute (contributi del lavoratore, IRPEF, addizionali) e gli oneri
 * azienda (contributi e INAIL, stimati dove il consulente non li ha mandati —
 * la stessa regola di `payslipViews`). È la stima dello scadenzario quando
 * l'F24 non è ancora registrato.
 */
export function perF24(cedolini: Payslip[], tipoDi: (personId: string) => PersonRow['kind'] | null, prm: (anno: number) => PayrollParams) {
  const out = new Map<string, { trattenute: number; oneri: number; n: number }>()
  for (const s of cedolini) {
    const k = tipoDi(s.personId)
    if (!k) continue
    const v = payslipViews(s, k, prm(Number(s.month.slice(0, 4))))
    const m = s.month.slice(0, 10)
    const cur = out.get(m) ?? { trattenute: 0, oneri: 0, n: 0 }
    cur.trattenute = r2(cur.trattenute + s.employeeContrib + s.irpef + s.surcharges)
    cur.oneri = r2(cur.oneri + (v.economic - s.totalEarnings - s.rounding - s.tfrAccrued))
    cur.n++
    out.set(m, cur)
  }
  return out
}

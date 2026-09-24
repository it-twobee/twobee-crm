/**
 * §377 — riconoscere le colonne di un CSV che non abbiamo scritto noi.
 *
 * Un file esterno arriva con le intestazioni di chi l'ha fatto: `Azienda`,
 * `Company`, `Ragione sociale`, `Cliente`. Chiedere a chi importa di mappare
 * sette colonne a mano è un modulo in mezzo a un'operazione che dovrebbe
 * durare dieci secondi — e chi lo compila di fretta sbaglia proprio il campo
 * che conta.
 *
 * Quindi si riconoscono da sole, e **si dichiara cosa è stato riconosciuto**:
 * l'anteprima mostra quale colonna è finita dove, così un errore si vede
 * prima di importare e non dopo. Se il nome azienda non si trova, non si
 * indovina la prima colonna: si dice che manca.
 */

export type CampoLead = 'companyName' | 'contactName' | 'contactEmail' | 'contactPhone' | 'notes' | 'source'

/**
 * Le intestazioni che sappiamo leggere, in italiano e in inglese.
 *
 * L'ordine conta: la prima che combacia vince, quindi le più specifiche
 * stanno prima — «nome referente» prima di «nome», o un file con tutte e due
 * le colonne metterebbe il referente nel nome azienda.
 */
const ALIAS: Record<CampoLead, string[]> = {
  companyName: ['ragione sociale', 'nome azienda', 'azienda', 'company name', 'company', 'cliente', 'business'],
  contactName: ['nome referente', 'referente', 'contatto', 'contact person', 'contact name', 'full name', 'nome e cognome', 'nome'],
  contactEmail: ['email referente', 'work email', 'e-mail', 'email', 'mail', 'posta elettronica'],
  contactPhone: ['telefono referente', 'cellulare', 'telefono', 'phone number', 'phone', 'tel', 'mobile'],
  notes: ['note', 'notes', 'commento', 'osservazioni'],
  source: ['fonte', 'source', 'lead source', 'provenienza', 'canale'],
}

/** minuscolo, senza punteggiatura e accenti: `E-Mail` e `email` sono la stessa colonna */
const pulisci = (h: string) =>
  h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export type Mappa = Partial<Record<CampoLead, string>>

export function riconosci(intestazioni: string[]): Mappa {
  const puliti = intestazioni.map(h => ({ originale: h, chiave: pulisci(h) }))
  const mappa: Mappa = {}
  const usate = new Set<string>()

  /* **Due passate, e l'ordine fra loro conta più dell'ordine degli alias.**
     Prima tutte le corrispondenze esatte, poi le parziali. Con una passata
     sola `contactName` cercava «referente» dentro «Email referente» e se la
     prendeva prima che `contactEmail` la vedesse — il gate l'ha preso al
     primo giro, ed è esattamente il difetto che rovina un import in
     silenzio: il file entra, le righe si creano, e l'email finisce nel nome
     del referente. */
  const cerca = (esatta: boolean) => {
    for (const [campo, alias] of Object.entries(ALIAS) as [CampoLead, string[]][]) {
      if (mappa[campo]) continue
      for (const a of alias) {
        const t = puliti.find(p => !usate.has(p.originale)
          && (esatta ? p.chiave === a : p.chiave.includes(a)))
        if (t) { mappa[campo] = t.originale; usate.add(t.originale); break }
      }
    }
  }
  cerca(true)
  cerca(false)
  return mappa
}

/**
 * §433 — quale riga è l'intestazione.
 *
 * Un file fatto a mano ha spesso un titolo sopra la tabella («Lead fiera
 * settembre», «Quotazioni 2022/23») e magari una riga vuota: prendere la prima
 * riga come intestazione farebbe del titolo il nome di una colonna, e non se ne
 * riconoscerebbe nessuna. Si guarda nelle prime righe quella in cui si
 * riconoscono più campi, con l'azienda che vale più di tutti gli altri insieme
 * — è l'unico obbligatorio. A parità vince la prima. Se non si riconosce niente
 * si prende la prima riga con almeno due celle piene, che è quello che una
 * persona guarderebbe.
 */
export function trovaIntestazione(righe: string[][], guarda = 10): number {
  let migliore = -1
  let punti = 0
  righe.slice(0, guarda).forEach((r, i) => {
    const m = riconosci(r.map(h => h.trim()).filter(Boolean))
    const p = Object.keys(m).length + (m.companyName ? 10 : 0)
    if (p > punti) { punti = p; migliore = i }
  })
  if (migliore >= 0) return migliore
  const piena = righe.slice(0, guarda).findIndex(r => r.filter(v => v.trim()).length >= 2)
  return piena >= 0 ? piena : 0
}

export type LeadDaCsv = {
  companyName: string
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  notes?: string | null
  source?: string | null
}

/** applica la mappa alle righe; salta quelle senza azienda invece di inventarne una */
export function converti(righe: Record<string, string>[], mappa: Mappa): {
  lead: LeadDaCsv[]
  senzaAzienda: number
  /** §433 — per ogni lead, la sua posizione in `righe`: il riepilogo dei
      doppioni deve dire la riga del file, e le righe saltate spostano il conto */
  origine: number[]
} {
  if (!mappa.companyName) return { lead: [], senzaAzienda: righe.length, origine: [] }
  const prendi = (r: Record<string, string>, c: CampoLead) => {
    const col = mappa[c]
    const v = col ? (r[col] ?? '').trim() : ''
    return v && v !== '-' ? v : null
  }
  const lead: LeadDaCsv[] = []
  const origine: number[] = []
  let senzaAzienda = 0
  righe.forEach((r, i) => {
    const azienda = prendi(r, 'companyName')
    if (!azienda) { senzaAzienda++; return }
    origine.push(i)
    lead.push({
      companyName: azienda,
      contactName: prendi(r, 'contactName'),
      contactEmail: prendi(r, 'contactEmail'),
      contactPhone: prendi(r, 'contactPhone'),
      notes: prendi(r, 'notes'),
      source: prendi(r, 'source'),
    })
  })
  return { lead, senzaAzienda, origine }
}

/** cosa mostrare nell'anteprima: quale colonna è finita dove, e cosa è rimasto fuori */
export function spiegaMappa(intestazioni: string[], mappa: Mappa): {
  riconosciute: { campo: CampoLead; colonna: string }[]
  ignorate: string[]
} {
  const usate = new Set(Object.values(mappa))
  return {
    riconosciute: (Object.entries(mappa) as [CampoLead, string][]).map(([campo, colonna]) => ({ campo, colonna })),
    ignorate: intestazioni.filter(h => !usate.has(h)),
  }
}

export const NOME_CAMPO: Record<CampoLead, string> = {
  companyName: 'Azienda',
  contactName: 'Referente',
  contactEmail: 'Email',
  contactPhone: 'Telefono',
  notes: 'Note',
  source: 'Fonte',
}

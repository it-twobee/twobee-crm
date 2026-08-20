/**
 * Cosa fare di un movimento che il mese non spiega. (§303)
 *
 * «Porta le spese del conto nel mese» scriveva righe **senza chiedere niente**,
 * e le doppie di questa estate sono nate tutte così: «Affinity (2 addebiti)
 * 5.100 €» accanto ai due subappalti che quei bonifici pagavano, «Beneficiari
 * Vari Distinta 3.868» accanto alle tre righe del personale che l'organico
 * aveva già scritto. Il conto economico si è ritrovato a contare due volte gli
 * stessi soldi, e per scoprirlo è servito il registro delle allocazioni (§297).
 *
 * La causa non è disattenzione: **una riga nuova era l'unica risposta che quel
 * gesto sapeva dare.** Non aveva un modo di dire «questo movimento paga una
 * riga che c'è già».
 *
 * Qui le risposte sono quattro, e le prime due sono quelle giuste quasi sempre:
 *
 *   · **accorpa** — esiste una riga che questo movimento paga, in tutto o in
 *     parte. Si alloca e non si scrive niente di nuovo.
 *   · **correggi** — la riga esiste ma **dice meno** di quello che è uscito:
 *     «Meta Ads (3 addebiti)» porta 109,12 € e dal conto sono usciti 166,01, che
 *     sono cinque addebiti. Si alza l'importo, non si crea un secondo Meta Ads.
 *   · **aggiungi** — non esiste, e non esisterà: le commissioni, i bolli, una
 *     spesa fuori piano. La riga si crea dal movimento, già compilata.
 *   · **ignora** — non c'è niente da spiegare: un giroconto fra conti propri, o
 *     qualcosa che qualcuno ha già dichiarato irrilevante.
 *
 * **Quando c'è qualcosa da giudicare, non si decide**: `sure` è vero solo se la
 * risposta è unica in tutti e due i sensi — una riga sola possibile per questo
 * movimento, e questo movimento solo per quella riga (§276). Tutto il resto
 * finisce a mano col perché scritto accanto, perché venti conferme separate è il
 * modo in cui non se ne conferma nessuna, ma una conferma in blocco su casi
 * ambigui è il modo in cui si sbaglia venti volte.
 */

const r2 = (n: number) => Math.round(n * 100) / 100
const TOL = 0.01

export type IntakeTx = {
  id: string
  booked_on: string
  amount: number
  description: string
  counterparty: string | null
  kind: string
  /** quanto di questo movimento è già allocato (§297) */
  allocated?: number
  no_match_needed?: boolean
}

export type IntakeLine = {
  id: string
  label: string
  /** il lordo della riga: dal conto passa il totale della fattura */
  gross: number
  /** quanto le è già stato allocato */
  allocated?: number
  /** il nome che si confronta con la controparte: cliente o fornitore */
  who?: string | null
}

export type Intake = {
  tx: IntakeTx
  /** quanto del movimento resta da spiegare */
  free: number
  action: 'accorpa' | 'correggi' | 'aggiungi' | 'ignora'
  /** `accorpa` e `correggi`: la riga e quanto le si dà */
  line?: { id: string; label: string; amount: number; closes: boolean
    /** `correggi`: il lordo a cui la riga va portata perché ci stia */
    newGross?: number }
  /** `aggiungi`: com'è compilata la riga nuova */
  draft?: { label: string; category: string }
  why: string
  /** niente da giudicare: la risposta è unica in tutti e due i sensi */
  sure: boolean
}

/** Le aree che non hanno una riga a piano e non l'avranno mai. */
const SENZA_PIANO: Record<string, string> = {
  commissione: 'Banca',
  imposta: 'Amministrazione',
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ')

/** Le parole che valgono qualcosa per riconoscere una controparte. */
const parole = (s: string) => norm(s).split(/\s+/).filter(w => w.length > 3)

/**
 * La proposta per un movimento.
 *
 * L'ordine dei tentativi è quello che serve, e non è arbitrario: **prima si
 * cerca una riga**, perché crearne una nuova quando ne esiste già una è
 * esattamente l'errore da cui questa funzione nasce.
 */
export function intakeOf(tx: IntakeTx, lines: IntakeLine[]): Intake {
  const free = r2(Math.abs(tx.amount) - (tx.allocated ?? 0))
  const base = { tx, free }

  if (tx.no_match_needed) {
    return { ...base, action: 'ignora', sure: true,
      why: 'Qualcuno ha già detto che non c\'è niente da abbinare.' }
  }
  if (tx.kind === 'giroconto') {
    return { ...base, action: 'ignora', sure: true,
      why: 'Giroconto fra conti propri: i due lati sono un fatto solo (§190).' }
  }
  if (free <= TOL) {
    return { ...base, action: 'ignora', sure: true,
      why: 'Già spiegato per intero dalle sue allocazioni.' }
  }

  /* Le righe che hanno ancora spazio. Una riga coperta non è un candidato: darle
     altro la porterebbe oltre il dovuto, ed è la sola forma in cui il registro
     può mentire al saldo (§297). */
  const aperte = lines
    .map(l => ({ l, resta: r2(l.gross - (l.allocated ?? 0)) }))
    .filter(x => x.resta > TOL)

  const chi = parole(tx.counterparty ?? tx.description)
  const stessoNome = (l: IntakeLine) => {
    const suo = parole(`${l.label} ${l.who ?? ''}`)
    return chi.some(w => suo.includes(w))
  }

  /* **L'importo esatto e un nome che torna**: è la sola combinazione in cui non
     c'è niente da giudicare, e vale solo se la risposta è unica in tutti e due i
     sensi — una riga sola per questo movimento (§276). */
  const esatte = aperte.filter(x => Math.abs(x.resta - free) < TOL)
  const esatteConNome = esatte.filter(x => stessoNome(x.l))
  if (esatteConNome.length === 1) {
    const { l, resta } = esatteConNome[0]
    return {
      ...base, action: 'accorpa', sure: true,
      line: { id: l.id, label: l.label, amount: resta, closes: true },
      why: 'Importo esatto e controparte che torna: la copre per intero.',
    }
  }
  if (esatte.length === 1) {
    const { l, resta } = esatte[0]
    return {
      ...base, action: 'accorpa', sure: false,
      line: { id: l.id, label: l.label, amount: resta, closes: true },
      why: 'Importo esatto, ma il nome non lo conferma: guarda che sia la riga giusta.',
    }
  }
  if (esatte.length > 1) {
    return {
      ...base, action: 'accorpa', sure: false,
      line: { id: esatte[0].l.id, label: esatte[0].l.label, amount: esatte[0].resta, closes: true },
      why: `${esatte.length} righe hanno questo importo: la scelta è tua.`,
    }
  }

  /* Nessun importo esatto: si guarda il nome. È il caso dei ventisei addebiti
     Meta su una riga sola (§254) — il movimento non vale quanto la riga, e non
     deve valere: le dà quello che può. */
  const perNome = aperte.filter(x => stessoNome(x.l))
  if (perNome.length === 1) {
    const { l, resta } = perNome[0]
    const quota = r2(Math.min(resta, free))
    return {
      ...base, action: 'accorpa', sure: false,
      line: { id: l.id, label: l.label, amount: quota, closes: quota >= resta - TOL },
      why: quota >= resta - TOL
        ? 'La controparte torna e questo movimento la chiude.'
        : `La controparte torna: le dà ${quota.toFixed(2)} € dei ${resta.toFixed(2)} che le restano.`,
    }
  }
  if (perNome.length > 1) {
    return {
      ...base, action: 'accorpa', sure: false,
      line: { id: perNome[0].l.id, label: perNome[0].l.label,
        amount: r2(Math.min(perNome[0].resta, free)), closes: false },
      why: `${perNome.length} righe hanno questa controparte: scegli quale.`,
    }
  }

  /* **La riga c'è, ma dice meno di quello che è uscito.** È il caso vero di
     agosto: «Meta Ads (3 addebiti)» porta 109,12 € e dal conto sono usciti
     166,01 — cinque addebiti, non tre. Qui una riga nuova sarebbe la peggiore
     delle risposte: creerebbe un secondo «Meta Ads» accanto al primo, che è
     esattamente la doppia da cui questa funzione nasce. Quello che va corretto è
     **l'importo**, e il conto lo dice la banca (§296). */
  const pieneConNome = lines.filter(l =>
    stessoNome(l) && r2(l.gross - (l.allocated ?? 0)) <= TOL)
  if (pieneConNome.length === 1) {
    const l = pieneConNome[0]
    return {
      ...base, action: 'correggi', sure: false,
      line: { id: l.id, label: l.label, amount: free, closes: true,
        newGross: r2(l.gross + free) },
      why: `La riga c'è e dice ${l.gross.toFixed(2)} €, ma dal conto è uscito anche questo: `
        + `va portata a ${r2(l.gross + free).toFixed(2)}. Una riga nuova la conterebbe due volte.`,
    }
  }

  /* Solo qui si crea una riga, e solo dove sappiamo che a piano non ci sarà mai:
     commissioni, bolli, imposte. Per tutto il resto una riga nuova sarebbe la
     scommessa che ha creato le doppie. */
  const area = SENZA_PIANO[tx.kind]
  if (area) {
    return {
      ...base, action: 'aggiungi', sure: false,
      draft: { label: tx.counterparty ?? tx.description.slice(0, 40), category: area },
      why: `Nessuna riga con questo importo o questa controparte, e «${area}» non sta a piano.`,
    }
  }

  return {
    ...base, action: 'aggiungi', sure: false,
    draft: { label: tx.counterparty ?? tx.description.slice(0, 40), category: 'Spese fuori piano' },
    why: 'Nessuna riga lo spiega. Prima di creare una voce nuova, controlla che non '
      + 'esista già altrove nel mese: una riga in più è un costo contato due volte.',
  }
}

export type IntakeSummary = {
  totale: number
  /** quanti si possono confermare in blocco senza guardare */
  certi: number
  certiTotale: number
  accorpa: number
  correggi: number
  aggiungi: number
  ignora: number
  /** quanto resta da spiegare in tutto */
  scoperto: number
}

export function intake(txs: IntakeTx[], lines: IntakeLine[]): {
  rows: Intake[]
  summary: IntakeSummary
} {
  /* **Le righe si consumano man mano, in tutti e due i sensi.** Due movimenti
     che guardano la stessa fotografia trovano la stessa riga scoperta e la
     coprono entrambi — è successo davvero, il canone di aprile di Fatima si è
     preso 1.830 € da due bonifici diversi (§300). E lo stesso vale per
     l'importo: due addebiti Meta che alzano la stessa riga devono alzarla **due
     volte**, o il secondo la riporta indietro e il primo si perde. Quindi lo
     stato porta il lordo *corrente*, non quello di partenza. */
  const stato = new Map(lines.map(l =>
    [l.id, { gross: l.gross, allocated: r2(l.allocated ?? 0) }]))
  const rows: Intake[] = []

  for (const tx of txs.slice().sort((a, b) => a.booked_on.localeCompare(b.booked_on))) {
    const vive = lines.map(l => {
      const st = stato.get(l.id)
      return st ? { ...l, gross: st.gross, allocated: st.allocated } : l
    })
    const r = intakeOf(tx, vive)
    const cur = r.line ? stato.get(r.line.id) : undefined
    if (r.line && cur) {
      stato.set(r.line.id, {
        gross: r.line.newGross ?? cur.gross,
        allocated: r2(cur.allocated + r.line.amount),
      })
    }
    rows.push(r)
  }

  const certi = rows.filter(r => r.sure && r.action === 'accorpa')
  return {
    rows,
    summary: {
      totale: rows.length,
      certi: certi.length,
      certiTotale: r2(certi.reduce((s, r) => s + (r.line?.amount ?? 0), 0)),
      accorpa: rows.filter(r => r.action === 'accorpa').length,
      correggi: rows.filter(r => r.action === 'correggi').length,
      aggiungi: rows.filter(r => r.action === 'aggiungi').length,
      ignora: rows.filter(r => r.action === 'ignora').length,
      scoperto: r2(rows.filter(r => r.action !== 'ignora').reduce((s, r) => s + r.free, 0)),
    },
  }
}

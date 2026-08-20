/**
 * Quando una riga del conto economico si può togliere — e quando no. (§294)
 *
 * Una riga che non verrà mai pagata va cancellata: un canone di un cliente che
 * se n'è andato, una spesa preventivata e mai fatta, una riga scritta due volte.
 * Lasciarla lì la fa trascinare di mese in mese (§290) e sporca ogni numero che
 * la incontra — margine, tenuta di cassa, scaduto, provvigioni.
 *
 * Ma non tutte si possono togliere, e le tre regole qui sotto nascono ognuna da
 * un danno diverso:
 *
 *   · **Un mese chiuso è una fotografia.** Cancellare dentro un mese chiuso
 *     riscrive numeri già distribuiti: i compensi di quel mese sono stati
 *     calcolati su quel ricavo, e a qualcuno sono già stati bonificati.
 *   · **Una riga pagata è un fatto.** Il denaro si è mosso — c'è un movimento
 *     in banca o una spunta di qualcuno che l'ha visto. Cancellarla lascia in
 *     cassa un'uscita senza niente che la spieghi, ed è esattamente il residuo
 *     che il ponte (§199) esiste per stanare.
 *   · **Una fattura esiste allo SdI.** L'IVA di quel trimestre la contiene e il
 *     modello è stato versato. Togliere la riga apre uno scarto fra archivio
 *     fiscale e conto economico che poi nessuno sa più spiegare. La strada è la
 *     nota di credito, che è un fatto e lascia traccia.
 *
 * Due casi non bloccano ma **vanno detti prima**, o la cancellazione sembra non
 * aver funzionato: la riga marcata «fatturata» senza un documento sotto, e la
 * riga che nasce da una rata di contratto — che alla prossima preparazione del
 * mese torna, perché la rata è ancora nell'accordo.
 *
 * Il motore è puro e lo usano tutti e due i lati: l'azione lo applica perché è
 * l'unica barriera vera, e la pagina lo applica per **dire perché** invece di
 * nascondere un pulsante. Un controllo che sparisce è un mistero; uno spento
 * con la ragione accanto insegna la regola.
 */

export type RemovalLine = {
  side: 'entrata' | 'uscita'
  paid: boolean
  /** quando i soldi si sono mossi, se lo si sa */
  paid_on?: string | null
  /** un documento dell'archivio è agganciato a questa riga */
  invoiced?: boolean
  /** §247 — la spunta «fattura emessa» sulla riga, che non è il documento */
  invoice_sent?: boolean
  /** la riga nasce da una rata del contratto: la rata resta anche senza la riga */
  installment_id?: string | null
}

export type Removal =
  | { can: true; warn?: string }
  | { can: false; why: string; how: string }

const giorno = (iso?: string | null) =>
  iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : null

/**
 * L'ordine dei controlli è una regola, non uno stile: si dice sempre
 * **l'ostacolo più a monte**. A chi ha davanti una riga pagata dentro un mese
 * chiuso non serve sapere della spunta — deve prima riaprire il mese.
 */
export function canRemove(l: RemovalLine, monthOpen: boolean): Removal {
  const verbo = l.side === 'entrata' ? 'incassata' : 'pagata'

  if (!monthOpen) {
    return {
      can: false,
      why: 'Il mese è chiuso',
      how: 'Riaprilo dalla testata. Un mese chiuso è una fotografia: i compensi di '
        + 'quel mese sono già stati calcolati su queste righe.',
    }
  }

  if (l.paid) {
    const quando = giorno(l.paid_on)
    return {
      can: false,
      why: `Risulta ${verbo}${quando ? ` il ${quando}` : ''}`,
      how: `Se il movimento non c'è stato, togli prima la spunta. Cancellarla adesso `
        + `lascerebbe in cassa un fatto senza una riga che lo spieghi.`,
    }
  }

  if (l.invoiced) {
    return {
      can: false,
      why: 'Ha una fattura agganciata',
      how: "La fattura esiste allo SdI e l'IVA del suo trimestre la contiene. "
        + 'Si storna con una nota di credito, che è un fatto e lascia traccia.',
    }
  }

  if (l.invoice_sent) {
    return {
      can: true,
      warn: 'Risulta fatturata ma non ha un documento agganciato. Se la fattura è stata '
        + "emessa davvero, l'IVA di quel trimestre la contiene e va stornata, non cancellata.",
    }
  }

  if (l.installment_id) {
    return {
      can: true,
      warn: 'Nasce da una rata del contratto: la rata resta nell\'accordo e la riga '
        + 'tornerà alla prossima preparazione del mese. Se il lavoro non si fa più, '
        + 'toglila dal contratto.',
    }
  }

  return { can: true }
}

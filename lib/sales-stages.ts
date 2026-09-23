/**
 * §424 — le fasi commerciali sono **dati**, e ogni fase dichiara il suo ruolo.
 *
 * Fino a oggi erano dodici, trascritte lettera per lettera da Notion perché i
 * due elenchi dovevano coincidere (§367). Notion si spegne: la fonte è una
 * sola, il percorso si accorcia a otto stati veri e si governa dalle
 * impostazioni. Questo file non contiene più l'elenco: contiene le **regole**
 * che valgono su qualunque elenco, più il seme da cui è partito il database.
 *
 * ## Il ruolo, che è la ragione per cui tutto questo regge
 *
 * Se le fasi sono dati, il codice non può più nominarle. Oggi `active_client`
 * sta scritto dentro la conversione a cliente, dentro tre controlli di igiene e
 * dentro il tasso di conversione: il giorno in cui qualcuno la rinomina
 * dall'interfaccia, quelle funzioni smettono di trovarla **e non lo dice
 * nessuno** — un `stage === 'active_client'` che non combacia più non è un
 * errore, è un `false`. Quindi ogni fase dichiara cosa è, e il codice chiede il
 * ruolo. Rinominare «Cliente acquisito» in «Chiuso vinto» non rompe niente;
 * cambiargli il ruolo sì, ed è giusto che si veda.
 *
 * ## Le funzioni prendono l'elenco, non lo leggono
 *
 * Nessuna di queste funzioni sa da dove arrivano le fasi: gliele si passa. È
 * l'unico modo perché restino pure — e quindi verificabili da un gate — adesso
 * che l'elenco vero sta su una tabella che cambia mentre il tool gira.
 *
 * Gate: `npx tsx lib/sales-stages.check.ts`.
 */

/** cosa è una fase per il codice. Elenco chiuso: un ruolo nuovo è una riga di
 *  codice che deve sapere cosa farne, non una voce da aggiungere in tabella. */
export const RUOLI = ['nuovo', 'in_corso', 'vinto', 'perso', 'sospeso'] as const
export type Ruolo = (typeof RUOLI)[number]

export const ETICHETTA_RUOLO: Record<Ruolo, string> = {
  nuovo:    'Porta d’ingresso',
  in_corso: 'Trattativa viva',
  vinto:    'Chiusa vinta',
  perso:    'Chiusa persa',
  sospeso:  'Ferma, non persa',
}

/** i sette token di stato: mai un hex, o il tema chiaro diventa illeggibile */
export const TINTE = ['error', 'neutro', 'info', 'orange', 'accent', 'gold', 'success'] as const
export type Tinta = (typeof TINTE)[number]

export type Fase = {
  chiave: string
  etichetta: string
  ruolo: Ruolo
  tinta: Tinta
  ordine: number
  attiva: boolean
  descrizione?: string | null
}

/**
 * Il seme: le otto fasi con cui parte il database (migration 258).
 *
 * Serve a due cose e a nessun'altra: popolare la tabella la prima volta, e fare
 * da rete quando l'elenco vero non si riesce a leggere — una pagina senza fasi
 * mostrerebbe trentasei righe senza stato, che somiglia a un archivio vuoto.
 * **Non è la verità**: la verità è la tabella, e chi legge da qui un elenco che
 * l'amministratore ha cambiato sta guardando il passato.
 */
export const FASI_SEME: Fase[] = [
  { chiave: 'nuovo_lead',         etichetta: 'Nuovo lead',         ruolo: 'nuovo',    tinta: 'info',    ordine: 10, attiva: true },
  { chiave: 'in_contatto',        etichetta: 'In contatto',        ruolo: 'in_corso', tinta: 'orange',  ordine: 20, attiva: true },
  { chiave: 'call_fissata',       etichetta: 'Call fissata',       ruolo: 'in_corso', tinta: 'accent',  ordine: 30, attiva: true },
  { chiave: 'preventivo_inviato', etichetta: 'Preventivo inviato', ruolo: 'in_corso', tinta: 'gold',    ordine: 40, attiva: true },
  { chiave: 'contratto_inviato',  etichetta: 'Contratto inviato',  ruolo: 'in_corso', tinta: 'accent',  ordine: 50, attiva: true },
  { chiave: 'cliente_acquisito',  etichetta: 'Cliente acquisito',  ruolo: 'vinto',    tinta: 'success', ordine: 60, attiva: true },
  { chiave: 'pending',            etichetta: 'Pending',            ruolo: 'sospeso',  tinta: 'neutro',  ordine: 70, attiva: true },
  { chiave: 'perso',              etichetta: 'Perso',              ruolo: 'perso',    tinta: 'error',   ordine: 80, attiva: true },
]

// ── leggere un elenco ───────────────────────────────────────────────────────

export const ordinate = (fasi: Fase[]): Fase[] => [...fasi].sort((a, b) => a.ordine - b.ordine)
export const attive = (fasi: Fase[]): Fase[] => ordinate(fasi).filter(f => f.attiva)

export const faseDi = (fasi: Fase[], chiave: string | null | undefined): Fase | null =>
  chiave ? fasi.find(f => f.chiave === chiave) ?? null : null

/** l'etichetta, o la chiave grezza se è una fase che non conosciamo più */
export const etichettaFase = (fasi: Fase[], chiave: string | null | undefined): string =>
  faseDi(fasi, chiave)?.etichetta ?? (chiave ?? '—')

/** la fase che ha quel ruolo. Per `vinto` e `nuovo` ce n'è una sola: lo
 *  garantisce il database con un indice parziale, non una promessa qui. */
export const faseConRuolo = (fasi: Fase[], ruolo: Ruolo): Fase | null =>
  attive(fasi).find(f => f.ruolo === ruolo) ?? null

export const ruoloDi = (fasi: Fase[], chiave: string | null | undefined): Ruolo | null =>
  faseDi(fasi, chiave)?.ruolo ?? null

/** la trattativa è ancora viva: non è né vinta né persa */
export const eAperta = (fasi: Fase[], chiave: string | null | undefined): boolean => {
  const r = ruoloDi(fasi, chiave)
  return r === 'nuovo' || r === 'in_corso' || r === 'sospeso'
}

export const chiaviAperte = (fasi: Fase[]): string[] =>
  attive(fasi).filter(f => f.ruolo !== 'vinto' && f.ruolo !== 'perso').map(f => f.chiave)

/**
 * Quanto è avanti una trattativa, per decidere quale riga tenere in un
 * accorpamento (§386). **Non è l'indice nell'elenco**: una fase sospesa o persa
 * può stare ovunque nell'ordine di visualizzazione, e usare la posizione
 * direbbe che un perso in cima è più avanti di un preventivo inviato.
 */
export function rangoFase(fasi: Fase[], chiave: string | null | undefined): number {
  const f = faseDi(fasi, chiave)
  if (!f) return 0
  if (f.ruolo === 'vinto') return 1000
  if (f.ruolo === 'perso') return 0
  if (f.ruolo === 'sospeso') return 1
  return 2 + attive(fasi).filter(x => x.ruolo === 'in_corso' || x.ruolo === 'nuovo')
    .findIndex(x => x.chiave === f.chiave)
}

/** la porta d'ingresso: dove entra quello che arriva dal foglio o da un file */
export const chiaveIngresso = (fasi: Fase[]): string =>
  faseConRuolo(fasi, 'nuovo')?.chiave ?? FASI_SEME[0].chiave

// ── i gruppi, che adesso li dice il ruolo ───────────────────────────────────

/**
 * I tre gruppi della bacheca. Prima venivano da Notion («To-do», «In progress»,
 * «Complete») ed erano una colonna da tenere allineata a mano; adesso si
 * deducono dal ruolo, quindi non si possono disallineare.
 *
 * `sospeso` sta con le uscite e non con le lavorazioni: una trattativa ferma
 * non è una cosa su cui si sta lavorando, ed è esattamente la distinzione che
 * serve a chi guarda «quanto ho in pentola».
 */
export const GRUPPI = ['apertura', 'lavorazione', 'uscita'] as const
export type Gruppo = (typeof GRUPPI)[number]

export const ETICHETTA_GRUPPO: Record<Gruppo, string> = {
  apertura:    'Da prendere in mano',
  lavorazione: 'In lavorazione',
  uscita:      'Chiuse e ferme',
}

export const gruppoDi = (f: Fase): Gruppo =>
  f.ruolo === 'nuovo' ? 'apertura' : f.ruolo === 'in_corso' ? 'lavorazione' : 'uscita'

export const fasiDelGruppo = (fasi: Fase[], g: Gruppo): Fase[] =>
  attive(fasi).filter(f => gruppoDi(f) === g)

// ── il chip ─────────────────────────────────────────────────────────────────

export const CLASSI_TINTA: Record<Tinta, string> = {
  error:   'bg-error-dim text-error',
  neutro:  'bg-surface-active text-text-secondary',
  info:    'bg-info-dim text-info',
  orange:  'bg-orange-dim text-orange',
  accent:  'bg-accent-dim text-accent',
  gold:    'bg-gold-dim text-gold-text',
  success: 'bg-success-dim text-success',
}

export const classiFase = (fasi: Fase[], chiave: string | null | undefined): string =>
  CLASSI_TINTA[faseDi(fasi, chiave)?.tinta ?? 'neutro']

// ── gli invarianti, in un posto solo ────────────────────────────────────────

/**
 * Cosa non deve mai succedere a un elenco di fasi.
 *
 * La stessa funzione la usa il gate su un elenco inventato e l'editor prima di
 * salvare quello vero: se le due regole fossero scritte due volte, la seconda
 * volta sarebbero due regole diverse — e quella che conta è sempre l'altra.
 *
 * Restituisce le frasi da mostrare a chi sta configurando, non codici: sono
 * pensate per finire sotto un bottone «Salva» disabilitato.
 */
export function problemiFasi(fasi: Fase[]): string[] {
  const vive = attive(fasi)
  const problemi: string[] = []

  if (vive.length === 0) return ['Serve almeno una fase attiva: senza, le trattative non hanno dove stare.']

  const conta = (r: Ruolo) => vive.filter(f => f.ruolo === r).length
  if (conta('nuovo') !== 1) problemi.push(`Serve una sola porta d’ingresso, ce ne sono ${conta('nuovo')}. È la fase in cui entrano i lead dal foglio e dai file.`)
  if (conta('vinto') !== 1) problemi.push(`Serve una sola fase vinta, ce ne sono ${conta('vinto')}. È quella da cui si converte un lead in cliente.`)
  if (conta('perso') === 0) problemi.push('Serve una fase persa: senza, una trattativa che finisce male non ha dove andare.')

  const chiavi = fasi.map(f => f.chiave)
  const doppie = chiavi.filter((c, i) => chiavi.indexOf(c) !== i)
  if (doppie.length) problemi.push(`Due fasi hanno la stessa chiave: ${Array.from(new Set(doppie)).join(', ')}.`)

  const ordini = vive.map(f => f.ordine)
  if (new Set(ordini).size !== ordini.length) problemi.push('Due fasi attive hanno lo stesso posto nell’ordine.')

  /* Due fasi vicine dello stesso colore rendono il chip inutile: chi guarda la
     bacheca legge il colore prima dell'etichetta, e due colonne accanto uguali
     si scambiano. Lontane va bene — i token sono sette e le fasi possono essere
     di più. */
  for (let i = 1; i < vive.length; i++) {
    if (vive[i].tinta === vive[i - 1].tinta) {
      problemi.push(`«${vive[i - 1].etichetta}» e «${vive[i].etichetta}» sono vicine e hanno lo stesso colore: da distinguere.`)
    }
  }

  for (const f of vive) {
    if (!f.etichetta.trim()) problemi.push(`La fase «${f.chiave}» non ha un nome.`)
  }

  return problemi
}

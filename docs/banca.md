# Banca (§189-190)

## Banca (§189-190, `/economics/banca`)
Il conto corrente e il conto economico sono la stessa cosa vista due volte: uno
dice quando, l'altro dice di chi. La sezione li tiene agganciati.

- **Tre sorgenti per un movimento**: `banca` è la verità (viene dall'estratto
  conto e **non si cancella**: se è sbagliato si corregge la categoria o si
  rifà l'import), `derivato` nasce da una spunta «incassato/pagato» ed è una
  dichiarazione, `manuale` è contante o carta di un socio. Perciò il saldo si
  legge due volte: **reale** (solo `banca`) e **dichiarato** (tutto). La loro
  differenza è quanto il tool crede senza avere una prova.
- **Riconciliare non è automatico** (`matchCandidates`): il punteggio somma
  numero documento, importo lordo esatto, nome cliente e controparte, ma
  l'aggancio lo conferma una persona. Un abbinamento sbagliato dichiara incassata
  una fattura che nessuno ha pagato, ed è un errore che poi nessuno cerca.
- **§276 — una conferma sola invece di venti** (`lib/auto-match.ts`,
  `confirmSureMatches`). La regola resta quella: nessun aggancio automatico. Ma
  fra i movimenti importati ce ne sono in cui **non c'è niente da giudicare** —
  importo lordo esatto al centesimo, nome che torna (o numero del documento
  nell'etichetta) e **una sola riga possibile in entrambi i sensi** — e
  chiederne venti conferme separate è il modo in cui non se ne conferma nessuna.
  Il pannello in Banca li elenca prima, con la ragione riga per riga, e un
  pulsante li conferma in blocco. L'**uno a uno** è la condizione che rende
  sicuro il resto: un movimento che potrebbe essere due righe, o una riga
  contesa da due movimenti, resta a mano e la pagina dice perché. L'azione
  **ricalcola la regola dal database**, non si fida dell'elenco che il browser
  ha visto: chi arriva secondo non deve poter disfare il lavoro del primo.
  Provata contro le decisioni già prese da una persona sui 115 movimenti
  agganciati a mano: **9 riproposti come certi, 9 d'accordo, 0 in disaccordo**,
  3 lasciati a mano perché ambigui. `npx tsx scripts/verify-match.ts` li stampa
  senza scrivere niente.
- **§277 — le virgolette tengono insieme il campo.** `split(sep)` va bene finché
  nessun campo contiene il separatore, e su Vivid non è così: `"ASANA.COM,
  DUBLIN, IE"` è **una** cella con due virgole dentro. Spezzandola, l'importo
  finiva nella colonna della valuta e la riga veniva scartata come «importo
  illeggibile» — sull'estratto conto vero **43 righe su 49**, quasi tutto, e il
  totale letto non lo diceva. Ora `cells` rispetta le virgolette (e il `""`
  interno, che è un apice). Nella stessa riparazione l'esito dell'import si dice
  com'è: **«0 nuovi» non è un errore** ed è la risposta più frequente — si
  riscarica l'estratto ogni settimana e le righe vecchie ci sono già — quindi
  diventa «Nessun movimento nuovo: tutti e 89 erano già in archivio (11 maggio →
  7 agosto)», e le righe scartate hanno un avviso loro **con la ragione**, che
  un contatore accanto al successo non lo guarda nessuno.
- **Import** (`lib/bank-import.ts`): il **dialetto si riconosce
  dall'intestazione** (home banking italiano con la virgola decimale · Vivid col
  punto e la controparte in chiaro), non dal nome del file, e le righe illeggibili
  finiscono in `skipped` con la ragione. `merchant()` riconduce le descrizioni
  delle carte al fornitore vero — ventisei codici `FACEBK *…` sono «Meta Ads» — ed
  è **idempotente**, perché si applica all'import e poi rileggendo dal database.
- **Giroconti fra conti propri**: `pairTransfers` appaia i due lati per importo
  opposto e data vicina. Senza, la liquidità totale sembra scendere e la lista da
  riconciliare chiede due volte lo stesso fatto.
- **Provvista** (`fundingNeed`): il fabbisogno di un conto spese non è una stima,
  è la somma delle voci di piano delle aree che quel conto paga
  (`bank_account_centers`). Se il bonifico ricorrente è più basso, si può dire
  adesso quanti mesi regge invece di scoprirlo da una carta rifiutata.
- **Cosa è passato davvero** (`spendSplit`): le uscite divise fra operativo e
  `CHECK_FAMILIES` (ristoranti, spesa, carburante, elettronica). Non sono spese
  vietate: hanno deducibilità limitata e vanno attaccate a una ragione. Il conto
  dice quanto pesano, non se erano inerenti — e senza la famiglia non si vede,
  perché ogni singola spesa sembra piccola.
- **Spesa aziendale ≠ erogato, e li distingue il conto** (§191): una cena con un
  cliente, la trasferta per andarci, il materiale d'ufficio sono costi della
  **società** — attribuirli a un socio gli abbasserebbe il compenso per un lavoro
  fatto per l'azienda. `pushAccountSpend` li porta nel mese come «Spese fuori
  piano» **senza** `partner_id`, e solo per le famiglie che il piano non prevede:
  ads, software e hosting hanno già la loro riga a piano e si riconciliano, non si
  duplicano. L'erogato è quello che esce dai **sottoconti dei soci**
  (`pushPartnerSpend`): la regola è il conto da cui il denaro esce, non il tipo di
  spesa.
- **Due strade per l'erogato, da decidere ogni mese** (§191): la **spesa dal
  sottoconto** porta a costo quello che si sarebbe speso comunque, ma con la
  deducibilità della sua famiglia (un pranzo vale il 75% e non recupera IVA); la
  **fattura del socio** (`category='Compenso soci'`) è deducibile per intero con
  IVA tutta detraibile, ma sposta l'imposta sulla persona. Il pannello in
  `PlClient` mostra i due numeri e registra la scelta; l'unica cosa che impedisce
  è farlo uscire due volte — `registerPartnerInvoice` non supera il residuo.
- **Il tetto della rappresentanza** (`entertainmentCap` in `lib/tax.ts`): 1,5% dei
  ricavi fino a 10 milioni. È il vincolo che decide il mix: su 150.000 € di
  ricavi sono 2.250 €/anno, quindi 1.500 €/mese di quote soci non possono andare
  in cene. Oltre il tetto la spesa è uscita di cassa e non abbassa l'imponibile.
  `taxInsights` proietta entrambi sui mesi registrati e avvisa al 70%.
- **Le tasche dei soci** (§191): un sottoconto per socio con una quota mensile.
  Quei soldi **sono erogato**, non un costo in più: il socio invece di prenderli
  in denaro li spende in nome della società, che porta la spesa a costo e ne
  recupera l'IVA dove spetta. Da qui due regole che il codice rispetta o il conto
  si sballa — le righe con `partner_id` **restano fuori dal target del 35%**
  (erano già nel 30% di erogato, come i subappalti della §188), e **l'erogato in
  denaro è netto di quanto il socio ha già speso**, altrimenti la società paga
  due volte lo stesso compenso. Speso oltre la quota = anticipo da recuperare,
  non buco. `allowanceView` dà quota, speso e residuo del mese.
- **Deducibilità dichiarata** (`DEDUCTIBILITY` in `lib/bank-import.ts`): pasti al
  75% con IVA indetraibile senza fattura intestata, carburante a uso promiscuo al
  20% con IVA al 40%, alimentari a zero finché nessuno ne scrive la ragione.
  Sono **valori di partenza per famiglia**, correggibili riga per riga: il tool sa
  che tipo di spesa è, non se era inerente — ed è l'inerenza a decidere. La parte
  non deducibile torna nella base IRES (`estimateTaxes`, ultimo parametro):
  senza, la stima promette un'imposta più bassa di quella che arriva.
- **Quanto bonificare** (`suggestFunding`): vince il più alto fra il piano — che
  è ottimista, elenca i canoni e non gli imprevisti — e la media delle uscite dei
  mesi **completi**; da lì si toglie il saldo, perché quello che c'è già non si
  bonifica due volte, e si arrotonda ai 50 €. Il mese in corso non fa media: a
  metà mese dimezzerebbe il fabbisogno proprio quando serve saperlo.
- **Il previsionale non si salva**: `forecast` lo ricalcola dalle scadenze aperte
  ogni volta. Un previsionale scritto in tabella è vecchio il giorno dopo.
- I grafici stanno in `components/charts/Charts.tsx` e valgono per tutto
  l'economics: la parte piena della barra dei ricavi è incassato, quella smorzata
  è credito. Zero è sempre visibile e il numero sta scritto accanto al pixel.



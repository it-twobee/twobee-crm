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
**E l'estratto conto non è sempre un CSV** (§320, `parseCamt`). Vivid esporta
anche in **camt.053**, lo standard ISO 20022 di mezza Europa, e il formato si
riconosce dal contenuto come tutti gli altri (§277) — un camt salvato `.txt` è
sempre un camt. Ma non è un dialetto in più: è **lo stesso conto in un altro
formato**, e da lì il vincolo che governa tutto il parser — **le descrizioni
devono uscire identiche a quelle del CSV**. L'impronta che riconosce un
movimento già in archivio contiene la descrizione (§210, §288): se il camt
scrivesse «Card transaction ASANA.COM, DUBLIN, IE» dove il CSV ha scritto
«ASANA.COM, DUBLIN, IE — ASANA.COM, DUBLIN, IE», riscaricare due mesi già
importati ne reinserirebbe ogni riga. Ricostruita la stessa coppia
`controparte — causale`, su 57 movimenti letti **52 sono stati riconosciuti** e
5 erano nuovi davvero.

Tre cose che il camt dice diversamente, e ognuna è un modo di sbagliare:

- **Il segno non sta nell'importo**: sta in `CdtDbtInd`. Leggerlo male non
  storta una riga, ribalta un estratto conto intero.
- **Il «chi» non è un campo**: è dentro una frase — «Card transaction
  <esercente>» o «Incoming transfer From <nome> <causale> <IBAN> <BIC>». Si
  toglie il prefisso, si tolgono IBAN e BIC dalla coda, si toglie la causale che
  `RmtInf/Ustrd` ha già detto, e quello che resta è il nome.
- **IBAN e BIC si tolgono solo dai bonifici.** «WWWARUBAIT, BIBBIENA, IT» è un
  esercente, e *BIBBIENA* ha esattamente la forma di un BIC: una regola applicata
  ovunque cancellava il nome di un paese toscano e lasciava «WWWARUBAIT,, IT».
  Il BIC si toglie solo dopo che un IBAN è stato tolto.

**§381 — i movimenti che il conto ha e i conti non devono vedere**
(`NASCOSTI` in `lib/bank-import.ts`, colonna `hidden_reason`, migration 240).
Non sono righe illeggibili — quelle vanno in `skipped` con la ragione — e non
sono errori della banca: sono spese che non riguardano la società.

**La §380 le scartava all'import, ed era sbagliato.** Se i soldi dal conto
sono usciti davvero, non scriverli rende il totale letto qui più alto di
quello della banca: sul Vivid erano 104,95 € su 381,43, un quarto del saldo.
La domanda giusta non era «entrano o no» — era **in quale dei due mestieri di
`bank_transactions`** devono comparire. Un movimento dice due cose insieme:
quanti soldi ci sono, e a cosa sono serviti. Una spesa personale finita per
errore sulla carta della società è un fatto di cassa **vero** e un costo che
**non esiste**.

Quindi la riga entra e porta scritto perché non si guarda:

| la contano | la saltano |
|---|---|
| saldo, liquidità, previsione, ponte di cassa | elenco movimenti |
| | famiglie di spesa (`byFamily`, e quindi `spendSplit`) |
| | spinta a costo (`pushAccountSpend`, filtro **nella query**) |
| | riconciliazione (`no_match_needed` d'ufficio) |

`hidden_reason` è **un testo e non un booleano**: «nascosto = true»
sopravvive sei mesi e poi nessuno sa più di cosa si trattava, mentre «Google
Play 20,99 €: addebiti per errore» si legge da solo il giorno che qualcuno
chiede perché il conto economico non torna con l'estratto. In pagina le righe
nascoste si dichiarano sotto i numeri del periodo, con motivo e importo: una
regola che lavora in silenzio è una regola che nessuno si ricorda di avere
finché non gli sballa un conto.

Vale **in tutti e due i sensi**: l'addebito e il suo rimborso sono lo stesso
errore visto due volte, e nascondendo solo l'uscita il giorno del rimborso
comparirebbe un incasso senza causa fra i movimenti da riconciliare.

In `BankClient` la stessa lista si legge due volte e i nomi lo dicono:
`ownTxs` è tutto e ci si calcolano saldo e andamento, `visibili` è quello che
si mostra e si conta.

**§382 — il saldo che dichiara la banca, accanto al nostro** (`declared` in
`parseCamt`, colonne `statement_*` su `bank_accounts`, migration 241).

Il saldo di un conto qui dentro è **ricostruito**: apertura più tutti i
movimenti. È il modo giusto di calcolarlo e ha un punto cieco — non sa dire
se è completo. Se una riga manca, o ne entra una di troppo, il totale resta
plausibile e non c'è un secondo numero con cui confrontarlo. In una mattina
la stessa verifica è stata fatta tre volte a mano, aprendo l'XML.

Il camt.053 quel numero ce l'ha: `CLBD` è la chiusura dichiarata, con la sua
data, e l'intestazione dice a che ora l'estratto è stato generato. Adesso si
salva e la pagina mostra i due vicini. Coincidono: l'archivio è integro.
Divergono: manca o avanza qualcosa, e si vede subito.

Tre cose che questa lettura sbaglia se fatta di fretta:

- **Si prende `CLBD`, non `OPBD`.** L'apertura viene prima nel file, e un
  parser distratto piglia quella: il saldo di tre settimane fa.
- **Il segno sta in `CdtDbtInd`**, come per i movimenti. Un conto in rosso
  dichiarato positivo è uno scarto pari al doppio del saldo.
- **La data è annidata** (`<Dt><Dt>2026-09-21</Dt></Dt>`) e un lettore di tag
  non goloso si ferma alla prima chiusura restituendo mezzo tag.

**Lo dichiara solo il camt.** I CSV — home banking e Vivid — portano le righe
e non i saldi: per quei conti le colonne restano vuote, e vuote devono
sembrare. Zero direbbe che la banca è in disaccordo con noi di tutto il
saldo.

Si scrive **solo se l'estratto è più recente** di quello già registrato:
riscaricare un periodo vecchio è normale — lo si fa per recuperare una riga —
e farebbe tornare indietro il saldo dichiarato a una data passata, cioè un
disaccordo inventato.

**§383 — e c'è un terzo saldo** (`available_balance`, migration 242). Su un
conto ce ne sono tre e fino a ieri ne mostravamo due:

| | da dove viene |
|---|---|
| contabile ricostruito | apertura + movimenti: lo calcoliamo noi |
| contabile dichiarato | `CLBD` del camt: lo scrive la banca (§382) |
| **disponibile** | contabile meno le autorizzazioni: lo mostra l'app |

Il terzo è quello che serve per sapere se una carta passa e quanto
bonificare, ed è l'unico che **nessun file dichiara**: le autorizzazioni
compaiono nell'app appena si paga e nell'estratto un giorno o due dopo. Sul
Vivid il 21 settembre erano 111,08 € su 381,43 contabili — chi guardava il
saldo per sapere se poteva spendere leggeva un numero più alto di un terzo.

**Si scrive a mano, e per questo porta l'ora.** È l'eccezione che conferma
l'invariante: i valori economici non si digitano perché si derivano dai
contratti, ma questo non si deriva da niente che abbiamo — come
`opening_balance`, a mano dal primo giorno. Quello che non si può fare è
lasciarlo senza data: un disponibile senza l'ora di lettura è vecchio dopo
cinque minuti e non lo sa nessuno. L'ora la mette `updateAccount`, **non chi
chiama**, e azzerare il valore azzera anche l'ora.

Le autorizzazioni in sospeso **non si salvano**: sono la differenza fra i
due, e un terzo campo da tenere allineato a mano è un terzo campo che va
fuori sincrono.

**§384 — una distinta paga più cedolini** (`bank_tx_payslips`, migration 243,
`linkPayslipsToTx`). Gli stipendi escono in **una riga sola** — «favore
beneficiari vari distinta», 3.945 € — e dentro ci sono tre persone. Su
`bank_transactions` c'erano `payslip_id` e `hr_invoice_id`: singoli, e
soprattutto **non li scriveva nessuno** — servivano solo a togliere un
movimento dai «da riconciliare», ma niente li popolava. Sette distinte da
giugno a settembre, ventitremila euro, senza una risposta a «di chi sono
questi soldi».

**L'importo sta sul collegamento, non sul cedolino.** I cedolini in archivio
sono PDF con `amount` a zero: nessuno sa quanto è stato pagato a chi. La
cifra si scrive mentre si collega, e la somma deve fare la distinta — se non
torna, o manca una persona o un importo è sbagliato. È la differenza fra un
aggancio che **controlla** e uno che si limita a dichiarare, ed è la ragione
per cui l'azione rifiuta invece di salvare in silenzio. `forza` esiste ed è
esplicito (§377): una distinta può pagare anche chi un cedolino qui non ce
l'ha, e chi ha letto la differenza deve poter procedere — quello che non può
succedere è procedere **senza saperlo**.

Non si scrive su `payslips.amount`: una distinta può pagare un arretrato,
mezzo mese o due mensilità insieme, e quel campo direbbe una cosa per
un'altra. Qui c'è **quanto è uscito dal conto con quel bonifico**, che è
l'unica cosa che il conto sa.

**Un cedolino sta in una distinta sola** (indice unico): pagarlo due volte
raddoppierebbe il costo del personale senza che nessuno lo cerchi. Il
controllo è anche nell'azione, prima del vincolo, per poter dire **chi** è
già pagato invece di un «duplicate key».

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

## Una porta sola: «Carica documenti» (§449, `/economics/carica`)
Ogni documento aveva la sua porta — gli estratti in Banca, gli XML in
Fatturazione — e i firmati `.p7m` e gli zip dello SdI non ne avevano nessuna:
si aprivano a mano e si caricava un XML per volta. Adesso si trascina tutto
insieme:

- **Si riconosce dal contenuto** (`tipoFile` in `lib/carica.ts`): fattura XML,
  firmata, zip, camt.053, CSV, Excel, PDF. Lo zip si apre nel browser e ogni
  file dentro diventa una voce.
- **Le firmate** si aprono con `xmlDaP7m` (`lib/p7m.ts`): la busta CMS si legge
  come struttura ASN.1 e l'OCTET STRING si ricompone anche quando è spezzato in
  pezzi a lunghezza indefinita — cercare «<?xml» nei byte lasciava le
  intestazioni dei pezzi in mezzo alla fattura. La firma non si verifica (lo ha
  fatto l'SdI).
- **Gli estratti Excel** diventano testo per `parseStatement`
  (`righeExcelATesto`): si parte dalla prima riga con un'intestazione di
  estratto (titolo e periodo sopra la tabella si saltano) e le date Excel
  (numeri) tornano giorno/mese/anno.
- **Il conto** si riconosce dall'**IBAN** quando il file lo dice (§450: il camt
  nel blocco `<Acct>`, Vivid anche nel nome del file). I conti Vivid sono
  quattro, e un IBAN che nessun conto conosce non si assegna a occhio: si
  sceglie una volta e il conto se lo ricorda (`bank_accounts.iban`, 266). Il CSV
  di Banco BPM l'IBAN non lo scrive, e lì decide il tracciato: italiano → conto
  principale (Banco BPM; in anagrafica era «Banca Valsabbina», stesso conto).
- **Dopo il caricamento** il tool aggancia da solo i movimenti **certi**
  (`confirmSureMatches`, la regola del bottone di §276) e lascia gli altri a
  Banca e Fatturazione.
- **I PDF del consulente si leggono** (§450, vedi `docs/personale.md`):
  cedolini Ranocchi e F24. Un PDF che non è né l'uno né l'altro va solo in
  archivio.
- **Gli F24 si segnano versati dalla banca** (`pagaF24DaBanca`, a ogni
  caricamento): un'uscita dello stesso importo al centesimo entro cinque giorni
  dalla scadenza, e **una sola** (`movimentoDelModello` in `lib/f24.ts`). Il
  movimento si aggancia al modello (`payment_allocations.f24_id`) e il modello
  passa la data a `hr_f24` e all'IVA (`markPaid`). Due candidati sono un dubbio,
  e resta a Banca.
- **L'archivio** (§450, `economics_documents`, 266): ogni originale va su MinIO
  con l'impronta SHA-256, da `/api/economics/archivio` — una route e non
  un'azione, perché un'azione regge un megabyte. Un file già caricato si
  riconosce **prima** di rifarlo (`documentiNoti`) e si può ricaricare lo stesso.
  Tabella deny-all, chiave scritta dal server. In alto la pagina dice da quando
  non arriva ogni fonte (conti, fatture emesse e ricevute, cedolini, F24): un
  estratto fermo da più di una settimana è in giallo.

**La copia esterna** dell'archivio non è codice: è un job notturno sul VPS
(`rclone sync` del bucket `twobee-crm`, prefisso `economics/`, verso un Hetzner
Storage Box o un bucket Backblaze B2), con le credenziali nella configurazione di
rclone e mai nel repository. Finché non gira, i documenti hanno una copia sola.

Il collegamento automatico (open banking per Intesa e Vivid, API Aruba per le
fatture) è in attesa della scelta del fornitore: il confronto è in una pagina a
parte, con le fonti.

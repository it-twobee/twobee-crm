# Economics — prospetto, allocazioni, F24, piano di cassa

**Il prospetto** (§239, `/economics/prospetto`, `lib/pl-aggregate.ts`). Il conto
economico risponde a «com'è andato **questo** mese», riga per riga, ed è il posto
dove si spunta. Il prospetto risponde all'altra domanda — **dove vanno i soldi**,
in che proporzione, e se sta cambiando — con le righe aggregate in **macro
categorie** e i mesi in colonna. Con quaranta righe di ricavo e novanta di costo
su cinque mesi quella risposta non c'era, e leggerla scorrendo cinque pagine
significa non leggerla.

- **Competenza e cassa sono due griglie, non due colonne accanto.** Lo stipendio
  di luglio sta in luglio sulla prima e in agosto sulla seconda (§224); metterli
  sulla stessa riga vorrebbe dire scegliere quale delle due domande tradire. In
  cassa una riga **non pagata non c'è**: raccontarla come fatto sarebbe peggio di
  non mostrarla.
- **Le macro non sono etichette libere**: `Personale` lo scrive l'organico (§184)
  e `Lavori affidati fuori` è già uscito dal margine del suo progetto (§188) —
  tenerli dentro un'area del piano fa sembrare struttura una cosa venduta al
  cliente. Le partite di giro stanno in riga loro (§188). Il resto tiene il nome
  della sua area, ordinato per peso: quello che costa di più si legge per primo.
- **La quota accanto al totale**: 8.899 € non dicono niente, «il 58% di quello
  che esce» sì. È la ragione per cui si guarda una tabella così.
- **Il prospetto è netto, la banca è lorda**, e l'IVA sta **in riga**: è l'unico
  modo di passare dall'uno all'altra senza barare. Il blocco «e in banca» mette
  sotto entrato/uscito/saldo dei soli movimenti veri (§189) e, mese per mese, la
  **differenza col prospetto**: se non è zero è una spunta senza movimento o un
  movimento senza riga, e il ponte in Banca (§199) dice quale.
- **Quale mese è chiuso si legge nell'intestazione**: una fotografia e un mese in
  corso non si confrontano, e l'ultima colonna è quasi sempre incompleta.

**I compensi stanno fra le uscite, ma non sono costi** (§240). Dal conto escono
come tutto il resto, quindi si vedono lì; ma non sono righe di conto economico —
non si scrivono, si ricalcolano (§227) — e sommarli ai costi darebbe un margine
diverso da quello del conto economico **con lo stesso nome**. Perciò la colonna
ha due totali: `Margine` (entrate − costi, lo stesso numero del conto economico)
e `Resta alla società` (dopo i compensi). In competenza sono due righe, perché si
sa a chi spettano; in **cassa una sola**, perché un bonifico a un socio che è
anche commerciale non dice quale dei due lavori sta pagando (§226). Le quote di
riga si leggono sul totale che esce, compensi compresi: tenerli fuori dal
denominatore farebbe sembrare il personale più pesante di quanto è.

**Un mese solo: le due letture affiancate** (§240). Su più mesi competenza e
cassa sono due griglie e si sceglie col selettore; su **un** mese la domanda
cambia — non è come si muove una proporzione, è «cosa il mese ha prodotto, cosa
si è mosso, e quanto manca fra le due» — e con un selettore quel «quanto manca»
te lo ricordi a mente da una schermata all'altra, che è il modo in cui non lo
guarda nessuno. La sezione si apre da **quello che c'è sul conto**: saldo a
inizio periodo, entrato, uscito, saldo adesso.

**Il compenso diventa una riga che si può spuntare** (§243, `pl_payouts`,
migration 207). I compensi si ricalcolano a ogni lettura (§227) — è la ragione
per cui basta mettere una rata nel mese giusto perché provvigioni ed erogato
tornino da soli — ed è anche la ragione per cui non si potevano **spuntare**:
non c'era niente su cui mettere la spunta, e «quanto è uscito» si poteva solo
dedurre dai bonifici, che non dicono se stanno pagando la quota di socio o la
provvigione (a una persona sola si bonifica una volta, §226).

- **L'importo si copia**, come per le entrate: un mese chiuso resta quello che
  era anche se domani una rata si sposta. Rigenerare aggiorna solo le righe
  **non pagate** — quello che è uscito è un fatto, e non si riscrive perché la
  base di calcolo è cambiata dopo.
- **Matura in un mese ed esce in quello dopo**, come il costo del lavoro (§224):
  le retribuzioni di luglio, l'erogato ai soci e le provvigioni di luglio si
  pagano ad agosto. `due_month` lo scrive la generazione, `paid_on` la spunta —
  e la data la mette il trigger con **oggi**, perché chiederla a mano significa
  averla sbagliata la metà delle volte.
- **La spunta sta sulla riga della persona**, accanto al numero, e da lì il
  prospetto sa in cassa anche **per quale dei due lavori** il compenso è uscito
  — cosa che un bonifico non dice. Senza righe materializzate la cassa torna al
  ripiego di prima: il totale dei movimenti `finanziamento` del mese, in una
  riga sola.

**Due regole imparate al primo uso** (§244):

- **La riga si ritrova per nome, non per chiave.** `mergePeople` fonde socio e
  commerciale in una persona sola e le dà la chiave del socio (`p:<id>`);
  `materializePayouts` scrive la provvigione con quella del commerciale
  (`o:<nome>`). Due spazi di chiavi diversi, e l'effetto era che la spunta
  compariva **solo** su chi è commerciale e basta — Antonio sì, Walter e Marco
  no. Il nome ce l'hanno tutte e due ed è quello che si legge sullo schermo; la
  chiave resta come ripiego.
- **La spunta resta viva a mese chiuso**, ed è l'unico posto in cui succede. Il
  compenso di luglio si eroga ad agosto: se chiudere luglio spegnesse la
  casella, la funzione sarebbe inutilizzabile proprio quando serve. Stessa regola
  degli arretrati (§224) — spuntare registra la data di oggi e non riapre il
  mese, perché il bonifico è un fatto di adesso.

E in testata la sezione dice **a che punto è**: «2 su 3 pagati · restano 3.367 €»,
con «Segna N pagati» accanto. Segnare dieci righe una a una è il motivo per cui
non le segna nessuno.

Gate: `npx tsx lib/pl-aggregate.check.ts` (61 controlli).

**Maturato ed erogabile sono due numeri, e per anni ne era visibile uno**
(§311, `payoutLedger` in `lib/cash-certify.ts`). Il registro dei compensi
riceve gli importi **già passati per la finestra dell'erogazione** (§286) — è
quello che serve a decidere un bonifico — ma il campo si chiamava `due` e il
commento sopra diceva «maturato». Non era un refuso: era l'unica cifra che
uscisse, e la pagina, gli script e la tabella «La posizione di ognuno» la
mostravano sotto la parola «gli spetta». **Ad Antonio Giarletta spettano
1.821 € e il tool ne dichiarava 284.**

- **Il maturato entra a parte** (`matured`), e la stessa linea del consolidato
  vale per tutti e due: quello che è stato pagato prima non torna a essere
  dovuto perché adesso si guarda un altro numero.
- **`open` resta la differenza sull'erogabile** — è quello che si può bonificare
  adesso, ed è la posta che il ponte (§199) usa. `owed` è il credito vero della
  persona. Due domande, due campi: unificarli avrebbe spostato il residuo del
  ponte, che è l'unico motivo per cui il ponte esiste.
- **Assente il maturato, `accrued` vale `due`**: chi non l'ha ancora passato
  funziona come prima, e non c'è un mese in cui i numeri cambiano da soli.

**La prima domanda del prospetto ha tre numeri** (§312, `ContoDelMese` e
`CompensiCumulativi` in `ProspettoClient`). Il prospetto rispondeva a «dove
vanno i soldi, in che proporzione» — utile, ma è la **seconda** domanda: un
margine del 42% su un conto che chiude a seicento euro non dice niente di
azionabile. Sopra tutto sta ora **quanto entra, quanto esce, quanto rimane**,
sulla base del conto.

- **Dentro c'è solo quello che il conto ha visto**, e non perché qualcuno si sia
  ricordato di filtrarlo: la sorgente sono i movimenti `banca`, quindi una riga
  non pagata non c'è per costruzione, e nemmeno una spuntata che l'estratto
  conto non dimostra (§226). Quello che deve ancora succedere è il piano di
  cassa, sotto, dove si può anche spegnere una voce e vedere cosa cambia.
- **L'apertura si ricostruisce dai movimenti precedenti al mese**, non è il
  saldo di oggi: su un mese passato il saldo di oggi non è la sua chiusura, e i
  tre numeri non si sommerebbero fra loro. Sul mese in corso i due coincidono, e
  `verify-prospetto` verifica esattamente quello.
- **In fondo i compensi cumulativi**, soci e commerciali separati perché sono
  due lavori con due formule (§185). Il conto economico dice quanto spetta per
  *un* mese; qui quanto si deve **in tutto**, che è la domanda di chi firma i
  bonifici — e senza, una persona pagata per intero e una che non ha mai visto
  un euro si leggevano uguali.

Le due regole del registro valgono anche qui, e vanno riscritte ogni volta che
si aggiunge una lettura dei compensi: **il consolidato taglia** (§230, e a chi
non ha mai preso un euro non si applica, §228 — per Antonio si conta da sempre,
1.821 € e non 606) e **«mai un bonifico» si guarda su tutti i mesi, non sulla
finestra** (§233): Walter ne ha incassati 4.640 € prima di luglio, e guardando
la sola finestra risultava mai pagato — il suo cumulato ripartiva da sempre,
11.162 € invece di 6.522.

Gate: `npx tsx scripts/verify-prospetto.ts <mese>` fa girare **lo stesso**
`loadProspetto` della pagina e verifica che apertura + entrato − uscito sia il
saldo vero di Banca (agosto 2026: 20.308 + 20.970 − 34.818 = **6.460,10 €**,
✓ combacia), poi stampa i compensi cumulativi persona per persona.

**Il conto economico è dove si registra il mese, non dove si guarda tutto**
(§293). Erano dodici sezioni in fila, e tre rispondevano a domande che si fanno
altrove: **Lavori affidati fuori** (i subappalti hanno una sezione loro), **I
prossimi sei mesi** (il previsionale vive nel prospetto, §262) e **Uscito
davvero dai conti** (il confronto fra spunte e movimenti è il ponte in Banca,
§199). Tolte. Con loro sono spariti dal payload `subItems`, `installmentMonths`
e `bankMonth`, che nessun altro leggeva.

Due cose che **non** se ne sono andate con i pannelli, ed è il punto:

- **I subappalti restano nel motore.** Sono righe di costo con `project_id`: il
  margine digital continua a toglierli dal ricavo del loro progetto (§186, §208)
  e restano elencati in Uscite dentro la loro area. Togliere il pannello non
  toglie la matematica — la quadratura di agosto chiude ancora a 0,00 con
  5.122,22 € di lavorazioni esterne.
- **«Chi non ha mai ricevuto un bonifico» adesso si vede.** `never` e `owed`
  erano calcolati in `CompensiSection` e **buttati via**: la sezione mostrava le
  quote del mese e taceva sul fatto che a una persona non fosse mai uscito un
  euro. Ora la testata dice quanto è maturato e mai erogato su tutti i mesi, e fa
  i nomi. Era l'unica cosa che «Uscito davvero» avrebbe potuto portarsi via, e
  non ce l'aveva nemmeno lui.

**Quattro difetti visti guardando lo schermo** (§307). Nessuno si trovava
leggendo il codice, e uno era un numero sbagliato travestito da errore di stampa.

- **«3.260 €/3.260 €»** sul chip del movimento: due numeri che sembrano uguali
  perché `eur` arrotonda all'euro, mentre la differenza vera era di **11
  centesimi**. E insieme erano più larghi della loro colonna, quindi finivano
  **sopra l'importo** — il primo numero che si guarda. Adesso il chip dice quello
  che **manca**, uno solo, e solo se supera l'euro: sotto, lo dice il colore e il
  resto sta nel titolo.
- **Due segnaposto per la stessa assenza**: la cella del documento scriveva «—» e
  sotto compariva «senza fattura». Se il documento c'è o si può collegare comanda
  la cella, se manca comanda l'avviso. Mai entrambi.
- **7.232 € senza nome nella ripartizione**, dipinti `bg-success` come «Cassa
  TwoBee»: due cose diverse con lo stesso colore, e il solo posto dove quella
  fetta aveva un nome era un tooltip che galleggiava sopra l'elenco. Ora è una
  riga con la sua etichetta — «non ancora destinato» — e un colore suo.
- **Il fornitore non arrivava al motore dell'intake.** La riga dell'acconto Seven
  si chiama «Subappalto — Digitalizzazione — CRM — Acconto» e non contiene
  «Affinity»: il nome non la trovava, e il bonifico da 3.000 € finiva sull'unica
  riga che quella parola conteneva — l'acconto ISF — con la frase «la controparte
  torna e questo movimento la chiude». **Una risposta sicura e sbagliata**, che è
  la sola categoria che nessuno va a controllare. Col fornitore le candidate
  diventano tre e la proposta dice «scegli quale».

**E il dialogo guarda tutti i mesi** (`intakeOverview`): apriva su uno e taceva
sugli altri, quindi il lavoro arretrato di luglio non si vedeva da agosto —
bisognava cambiare mese in cima alla pagina per scoprire se ce n'era. I mesi
chiusi sono in elenco e spenti: non si toccano, ma sapere che contengono qualcosa
è il motivo per cui uno decide di riaprirli.

**Un accordo in bozza non entra mai, e adesso lo dice** (§306,
`lib/stream-validation.ts`). La regola c'era dalla 164 ed è giusta: `bozza` non
fa canone, non genera righe nel mese, non conta nel valore venduto del lavoro
(§186), non apre la durata del rapporto (§179). È quotato, non venduto. Quello
che mancava era **dirlo**: la scheda mostrava l'importo e taceva, e chi lo
guardava aveva ragione a credere che fosse dentro i conti.

E il difetto vero era l'opposto di quello che sembrava. Non mancava il gesto per
validare — `activateStream` esisteva e la select dello stato c'era — **mancava la
regola su quella select**: `updateStream` cambiava lo stato senza guardare
niente. Si poteva riportare in bozza un contratto **con rate già incassate**, e
da lì il canone sparisce dall'economics mentre i soldi restano in cassa senza
niente che li spieghi; o attivare una manutenzione il cui progetto è ancora in
corso, scavalcando il controllo che `activateStream` faceva. **Una regola che
vive in un percorso e non nell'altro non è una regola**: adesso `guardStatus` sta
dentro `updateStream`, dove passano tutti e due.

- **Verso `attivo` si guarda l'importo e il padre**: un accordo da zero euro
  entrerebbe nel mese come una riga che non dice niente, e una manutenzione che
  parte prima fatturerebbe un servizio che nessuno sta erogando (§169). Da
  `sospeso` ad `attivo` è una **ripresa**, non una validazione: la regola vale
  sul passaggio dalla bozza.
- **Verso `bozza` decide quello che l'accordo ha già prodotto**, e l'ordine dei
  rifiuti è l'ostacolo più a monte: una rata **incassata** batte tutto, poi il
  **mese chiuso** — dove i compensi sono già stati calcolati su quel ricavo — e
  infine le rate materializzate, che **non bloccano ma restano lì**: senza
  l'avviso il mese continua a fatturare un contratto che non è più venduto.
- **`sospeso` e `concluso` non si controllano**: chiudono il futuro, non
  riscrivono il passato.

**Il piano del subappalto svincolato c'era: mancava il suo prezzo.**
`splitCostCustom` costruisce da sempre un piano indipendente da quello del
cliente, e «Su misura» è in evidenza nella scheda. Ma una tranche costruita a mano
**non dichiara quale rata finanzia** (§285), quindi il margine digital torna a
toglierla in proporzione all'imponibile del mese invece che dalla riga precisa
(§208). È il ripiego giusto quando il fornitore ha tempi suoi — e va saputo
**prima di scegliere**, non scoperto a valle guardando un margine.

Gate: `npx tsx lib/stream-validation.check.ts` (24 controlli).

**La posizione di ognuno era calcolata e mostrata a nessuno** (§304, `Posizione`
in `CompensiSection`). `payoutLedger` sa da mesi quanto spetta a una persona su
**tutti** i mesi, quanto le è uscito dal conto e quanto resta — e serviva a due
totali in testata: il resto veniva buttato. Per sapere se Marco era in pari
bisognava confrontare tre pannelli, e uno dei tre l'ha portato via §293.

Adesso è una tabella sola, in ordine di scoperto — chi aspetta di più si legge
per primo, che è l'unico ordine con cui si decide un bonifico. Tre colonne e la
differenza: **gli spetta · uscito dal conto · resta**. Sotto ogni nome sta scritto
**da quando si conta per lui** (§228), perché la stessa frase detta a due
situazioni opposte è peggio di nessuna frase: chi è stato pagato riparte dalla
liquidazione, chi non ha mai preso un euro si conta da sempre. E un **anticipo**
non è un errore: è quello che è uscito oltre il maturato, e si riassorbe col mese
dopo (§191).

**L'erogato lo dice il registro, non la categoria del movimento** (§305). Era la
riga che rendeva quella tabella inutilizzabile: `payoutsFromBank` filtrava per
`kind`, e `classify` etichetta `finanziamento` i bonifici ai soci di giugno e
`pagamento` quelli del 13 agosto — perché legge la descrizione, e quelle due
frasi sono scritte diversamente. Risultato: **a Marco 3.412 € usciti e «erogato
0»**, che è la stessa bugia di uno zero su chi non è stato pagato.

Tre difetti in fila, e ognuno nascondeva il successivo:

- **La categoria non è un criterio.** Dove il registro parla, `kind` non conta:
  qualcuno ha già detto che quel movimento paga un compenso, e l'ha detto
  guardandolo.
- **Il registro dice anche *a chi*, e per quanto.** Il bonifico a Toto dice
  «salvatore piacente» e il piano compensi lo chiama «Toto»: il nome non lo
  trovava. Non serve indovinarlo — sta scritto nell'allocazione.
- **Una persona ha più nomi.** «Marco» in `pl_partners` e «Marco Lucci» in
  anagrafica sono la stessa (§244), e `pl_payouts` scrive la quota col primo e la
  provvigione col secondo: confrontare una sola etichetta dava a Marco 442 €
  invece di 3.412. Gli alias stanno in `mergePeople` e sono **separati da
  `names`**, che si cercano nella descrizione di un bonifico: allargare quelli a
  un nome di battesimo solo farebbe corrispondere qualunque bonifico che lo
  contenga.

Sui dati veri: da erogare **3.892 € invece di 10.716**, ed è la verità — 6.824
sono usciti il 13 agosto e il tool non li vedeva.

**E la regola deve vivere in tutti i percorsi che scrivono** (§318-§319). §297
dice che **la spunta «pagato» segue il registro**, e per due volte la regola è
stata scritta in un posto solo:

- **`scripts/allocate-open.ts` scriveva le allocazioni e non allineava `paid`** —
  quello lo faceva solo `app/actions/allocations.ts`. Sul bonifico a Walter del
  27 agosto le due allocazioni c'erano e l'erogato restava zero. Adesso lo
  script chiama la stessa `targetCoverage` dell'azione: una regola sola, non una
  copia che domani diverge.
- **Il prospetto leggeva l'erogato dalla spunta, il conto economico dal
  registro.** Due schermate che dicono «erogato» e due cifre diverse, ed è il
  difetto che §305 esisteva per chiudere — solo che l'aveva chiuso in una
  pagina. `prospetto-load` legge ora le allocazioni, e la data è quella del
  **movimento**: `paid_on` è quando qualcuno ha spuntato, non quando i soldi si
  sono mossi. Dove il registro tace vale la spunta (§226).

**Coperto vuol dire coperto**, ed è il caso da cui si è visto tutto: la
provvigione di Marco Lucci è 442,11 € e i due bonifici che se la dividono ne
portano 441,76 (§297: la stessa provvigione è pagata da due movimenti, uno a
testa). Trentacinque centesimi, quindi la spunta **non** scatta — ed è giusto
così. Ma con la spunta come sola sorgente dell'erogato, quei 441,76 € usciti
davvero si leggevano **zero**: la stessa bugia di uno zero su chi non è stato
pagato. Il registro dice l'importo, non un sì o un no, ed è l'unica forma in cui
un pagamento parziale si può raccontare.

**Un movimento non spiegato ha quattro risposte, non una** (§303,
`lib/month-intake.ts`). «Porta le spese del conto nel mese» scriveva righe
**senza chiedere niente**, e le doppie di questa estate sono nate tutte lì:
«Affinity (2 addebiti) 5.100 €» accanto ai due subappalti che quei bonifici
pagavano, «Beneficiari Vari Distinta» accanto alle tre righe che l'organico
aveva già scritto. Non era disattenzione: **una riga nuova era l'unica risposta
che quel gesto sapeva dare.**

- **accorpa** — la riga esiste e questo movimento la paga, in tutto o in parte.
  È la risposta giusta quasi sempre, ed è quella che mancava.
- **correggi** — la riga esiste ma **dice meno del vero**: «Meta Ads (3
  addebiti)» porta 109,12 € e dal conto sono usciti 166,01, che sono cinque
  addebiti. Qui una riga nuova è la peggiore delle risposte — creerebbe un
  secondo Meta Ads accanto al primo. E **due correzioni sulla stessa riga si
  sommano**: se la seconda ripartisse dall'importo iniziale la riga finirebbe a
  160,61 e i 5,40 della prima si perderebbero.
- **aggiungi** — solo dove a piano non ci sarà mai: commissioni, bolli, imposte.
  Per tutto il resto la proposta scrive che una riga in più è un costo contato
  due volte.
- **ignora** — giroconto, o qualcosa che qualcuno ha già dichiarato irrilevante
  (§298: chi ha deciso resta deciso).

Due regole nell'interfaccia, e sono la stessa cosa da due lati: **i casi senza
dubbio si confermano in blocco** — importo esatto, controparte che torna, una
riga sola possibile — e **gli altri no, ognuno col perché sotto**. Venti conferme
separate è il modo in cui non se ne conferma nessuna; una conferma in blocco su
casi ambigui è il modo in cui si sbaglia venti volte (§276). E le righe **si
consumano durante il giro**, in tutti e due i sensi: senza, due movimenti
trovano la stessa riga scoperta e la coprono entrambi (§300).

Gate: `npx tsx lib/month-intake.check.ts` (43 controlli) ·
`npx tsx scripts/verify-intake.ts <mese>` stampa la proposta senza scrivere —
su agosto: 27 movimenti su 30 già spiegati, 2 da correggere, 1 riga nuova.

**La fattura si collega dalla riga, sempre** (§302, `InvoiceCell` in
`PlClient`). Il documento si poteva agganciare **solo dentro il dialogo del
pagamento**: su una riga già incassata, o su una da collegare prima che i soldi
si muovano, non c'era strada. Ed è la terza gamba del triangolo — la riga dice a
che mese appartiene il lavoro, il movimento quando i soldi si sono mossi, la
fattura è l'unica cosa che vale davanti all'erario.

- **`invoiceOf` porta il documento, non un booleano.** Un booleano si può solo
  accendere in un avviso; il numero della fattura si può mostrare accanto alla
  spunta, che è dove serve. Il booleano di prima si deriva da lì: una fonte sola.
- **I candidati dicono la capienza.** Una fattura da 3.000 € già spesa su due
  righe non può coprirne una terza, e chi ha ancora spazio per il lordo di
  *questa* riga viene prima. Senza quel numero l'abbinamento sbagliato è la cosa
  più facile del mondo — ed è l'errore che poi nessuno cerca.
- **«Già su N righe» non è un allarme**: una fattura che copre due mesi di canone
  è normale (§297), tre volte lo stesso importo no. Il conteggio si mostra e la
  decisione resta di chi guarda.
- L'avviso «senza fattura» di §247 resta, ma solo quando **non c'è nessun
  candidato**: dove il documento c'è e basta collegarlo, il gesto batte
  l'avviso.

**L'F24 è un foglio, e dentro ci sono due mondi** (§301, `lib/f24.ts`,
migration 215). L'IVA di un trimestre e le ritenute dei dipendenti si versano
**con lo stesso modello**, e nel tool vivevano in due tabelle che non si
parlavano: `vat_settlements` (§242) e `hr_f24` (§182). Il documento che le
contiene non esisteva da nessuna parte, e il prezzo si legge in un movimento —
il 20 agosto dal conto sono usciti **10.547,24 €**, cioè 9.669,33 di IVA più
877,91 di ritenute e contributi, al centesimo, e nessuna riga del tool valeva
quella cifra.

- **Il documento è il contenitore, non un dominio nuovo.** Ogni riga dice a quale
  mondo appartiene e quel mondo resta l'autorità del *suo* numero; il modello sa
  una cosa che nessuno dei due sapeva, ed è **quando i soldi sono usciti insieme**.
  Prima la data si scriveva a mano in due tabelle, e le due mani potevano non
  essere d'accordo.
- **Il credito si sottrae**: l'indennità L. 207/2024 esce in busta e rientra qui
  (§235). Contarla come debito la farebbe pagare due volte, e abbatte il **costo
  del lavoro**, non l'IVA — imputarla all'IVA sposterebbe soldi fra due mondi.
- **`split` è la ragione per cui il documento serve**: dei 10.547,24 € solo
  877,91 sono un **costo**. L'IVA è un debito che si estingue e non era nostra
  nemmeno il giorno prima (§225): metterla fra le uscite di competenza farebbe
  costare diecimila euro un mese di stipendi.
- **Il totale è la somma delle righe**, e uno scarto non è un arrotondamento: è
  una riga che nessuno ha trascritto, e senza quella riga si sa *quanto* è uscito
  e non *per cosa*. Il trigger è `deferrable initially deferred`, perché un
  modello nasce vuoto e vietare lo stato intermedio vorrebbe dire non poterlo
  scrivere affatto.
- **La stima resta accanto e la differenza è informazione** (§242): sul 2º
  trimestre il tool diceva 8.399,87 e il modello chiede 9.669,33 — quei 1.269,46
  sono fatturato del trimestre che il conto economico non ha.

Gate: `npx tsx lib/f24.check.ts` (25 controlli, coi due modelli veri) ·
`npx tsx scripts/seed-f24.ts` li trascrive e li aggancia al loro movimento.

**Un movimento paga N righe, una riga è pagata da N movimenti** (§297,
`lib/allocations.ts`, migration 214). Per tutta la vita del tool il legame fra
conto corrente e conto economico è stato **un campo** — `cost_line_id` e il suo
gemello per le entrate. Un movimento, una riga. Regge finché il mondo è fatto
così, e il mondo non è fatto così:

- un bonifico paga **due fatture** dello stesso fornitore («Affinity, 2 addebiti»);
- una distinta paga **tre stipendi** — 4.077 € in una riga sull'estratto conto;
- una fattura si paga **a metà**: Affinity il 23 luglio ha incassato 2.100 su
  2.562, cioè l'imponibile e non l'IVA;
- un compenso è **due cose insieme**: a Marco a luglio sono usciti 3.412 €, che
  sono 3.191,12 di quota socio più 220,88 di provvigione — la sua, divisa a metà
  con Toto. E la stessa provvigione risulta quindi pagata da **due** bonifici,
  uno a testa.

Con un campo solo ognuno di questi casi ha una sola uscita: non agganciare
niente. Ed è quello che è successo — il ponte (§199) non quadra per −6.029 € e
quasi tutto sta in tre bonifici cumulativi che nessuno ha potuto spiegare. Qui
l'unità non è il legame: è **l'euro allocato**.

- **Non si alloca più di quello che il movimento contiene**, e il vincolo sta in
  tre posti: la UI lo mostra *mentre* si sceglie (sapere di aver sforato dopo
  aver premuto è saperlo troppo tardi), l'azione lo applica perché un file
  `'use server'` esporta endpoint, il trigger lo tiene per chi scrive da fuori.
- **L'importo è sempre positivo e sempre lordo**: dal conto passa il totale
  della fattura, la riga è imponibile, e lo scorporo si fa dove serve (§296).
  Il verso lo decide il target, non il segno.
- **La spunta «pagato» segue il registro**, non il contrario: una riga è pagata
  quando le allocazioni la coprono. Prima bastava che qualcuno avesse agganciato
  *qualcosa*, senza guardare quanto — l'acconto Affinity da 2.100 su 2.562
  risultava saldato e i 462 € di IVA ancora dovuti sparivano da ogni previsione.
- **Quello che avanza avanza e si vede.** `propose` riempie ogni riga scelta col
  suo scoperto finché il movimento tiene, dice **quanto manca** a quelle che non
  copre, e se resta denaro non gli inventa una destinazione: far tornare il
  conto nascondendo l'ambiguità è il modo in cui un registro smette di servire.
- **Certificata contro dichiarata resta la distinzione di §226**: `banca` e
  `manuale` sono fatti, `derivato` nasce dalla spunta che dovrebbe confermare.
- **§300 — un fatto spegne la dichiarazione** (`superseded`). È la regola di
  `bank_on_match` (§189) che al registro mancava, e la mancanza si è vista subito
  sui dati veri: la riga «Beneficiari Vari Distinta» aveva 3.868 € dichiarati
  dalla spunta e ha ricevuto 4.077 dal bonifico del 20 agosto — **7.945 su 4.077
  dovuti**, la riga pagata due volte. Si spengono solo le dichiarazioni dello
  stesso target, e solo quando arriva un fatto: una dichiarazione non ne scaccia
  un'altra, o si perde l'unica traccia di un pagamento che nessuno ha dimostrato.
- **Quello che un giro ha già proposto conta come allocato.** Due movimenti che
  guardano la stessa fotografia trovano la stessa riga scoperta e la coprono
  entrambi: il canone di aprile di Fatima si è preso 1.830 € dal bonifico del 13
  maggio **e** altri 1.830 da quello del 9 giugno. Chi propone in blocco tiene il
  conto di sé stesso, o il registro nasce con dentro l'errore che deve trovare.

Gate: `npx tsx lib/allocations.check.ts` (38 controlli, coi quattro casi veri) ·
`npx tsx scripts/verify-allocations.ts` legge il registro dal database e dice
quanto di ogni movimento è spiegato, quali righe sono coperte a metà e cosa non
torna.

**Il subappalto ha l'IVA, e l'effettivo lo dice la banca** (§295-§296,
`lib/bank-actual.ts`). Due regole che si tengono, ed è il motivo per cui vanno
lette insieme.

**L'IVA c'è.** Una lavorazione affidata a un fornitore italiano ha l'IVA, e su
un subappalto è detraibile: `addProjectCost` la accende di default. Ma il piano
del CRM di Seven — sette tranche Affinity S.r.l. per 18.402,64 € — è nato prima
di quel default e le aveva **tutte spente**, mentre lo stesso fornitore
sull'ISF ce l'ha accesa. Due conseguenze che non si vedono guardando il margine:
la cassa sottostimava ogni tranche di ~588 €, perché dal conto esce il lordo, e
il credito IVA non arrivava al trimestre. Corretto con
`scripts/fix-subcontract-vat.ts`: il 3º trimestre passa da **9.250 a 8.109 €**.
Il margine non cambia — l'imponibile è lo stesso.

**L'effettivo lo dice l'estratto conto**, quando c'è: da quando un movimento
`banca` è agganciato, la cifra scritta a mano non è più la stima migliore. Dal
conto passa il **lordo** e la riga è imponibile, quindi si scorpora sempre con
l'aliquota della riga — ed è qui che l'IVA sul subappalto smette di essere un
dettaglio fiscale: senza, lo scorporo non avviene e il costo sale del 22%.
Tre esiti, e la differenza fra gli ultimi due è tutto il punto:

- **combacia** — la banca conferma, non c'è niente da fare.
- **dice un altro numero** — si è pagato più o meno del previsto, e l'effettivo
  si corregge. Il toast lo scrive: scoprirlo fra un mese guardando il margine è
  il modo in cui non lo si scopre.
- **non copre il lordo** — l'acconto Affinity di luglio, 2.100 € versati su una
  fattura da 2.562: hanno pagato l'imponibile e non l'IVA. Qui **non si riscrive
  niente**. Il costo è quello che il fornitore ha fatturato; quello che manca è
  l'IVA, non una parte del lavoro, e mettere 1.721,31 nell'effettivo sarebbe un
  numero plausibile e sbagliato (§272).

Un movimento che paga **più righe** resta fuori: il suo lordo non appartiene a
nessuna delle due da solo, e spartirlo è il lavoro del registro delle
allocazioni. Finché non c'è, la funzione lo dichiara invece di indovinare. E un
mese chiuso non si riscrive perché arriva un estratto conto.

Gate: `npx tsx lib/bank-actual.check.ts` (24 controlli).

**Una riga si toglie, ma non tutte** (§294, `lib/line-removal.ts`). È l'altra
metà di §290: quello che non arriverà mai non deve trascinarsi per sempre, e una
riga scritta due volte o un canone di un cliente andato via vanno cancellati. Ma
`deleteRevenueLine` e `deleteCostLine` **non controllavano niente**: cancellavano
una riga pagata, una fatturata, dentro un mese chiuso, con un clic e senza un
messaggio. Sulle 103 righe del database ne bloccano ora **89**.

Tre blocchi, ognuno da un danno diverso: **il mese chiuso** è una fotografia e i
compensi di quel mese sono già stati bonificati su quelle righe · **una riga
pagata** è un fatto, e toglierla lascia in cassa un'uscita senza niente che la
spieghi — che è il residuo che il ponte (§199) esiste per stanare · **una
fattura esiste allo SdI**, l'IVA del suo trimestre la contiene, e la strada è la
nota di credito. Due avvisi che non bloccano: la riga marcata «fatturata» senza
un documento sotto, e quella che nasce da una rata — che **tornerà** alla
prossima preparazione del mese, perché la rata è ancora nell'accordo.

- **L'ordine dei controlli è una regola**: si dice sempre l'ostacolo più a monte.
  A chi ha davanti una riga pagata dentro un mese chiuso non serve sapere della
  spunta: deve prima riaprire il mese.
- **Il verdetto guarda il mese della riga, non quello aperto.** Una riga
  trascinata da luglio si toglie solo se luglio è aperto.
- **Il pulsante si spegne, non sparisce**: uno che sparisce è un mistero, uno
  spento con la ragione nel `title` insegna la regola una volta. Sparisce solo
  nel mese chiuso, dove ripeterlo su venti righe è rumore. La barriera vera è
  `guardRemoval` dentro l'azione: un file `'use server'` esporta endpoint.

Gate: `npx tsx lib/line-removal.check.ts` (19 controlli).

**Una riga non saldata non si perde alla chiusura** (§290, migration 213). Il
conto economico dice **in che mese il lavoro è stato fatto**, e quella
appartenenza non cambia perché il cliente paga in ritardo: la fattura è stata
emessa in quel mese, l'IVA di quel trimestre la contiene e i compensi sono già
stati calcolati su quel ricavo. Spostare la riga nel mese dopo vuol dire
riscrivere tre cose **già dichiarate fuori dal tool**, e il fatturato di un mese
chiuso cambierebbe ogni volta che qualcuno tarda a pagare.

Quello che serve è un'altra cosa: che nessuno la perda di vista. Finora la riga
scoperta compariva nel mese nuovo perché `openAt` la deduceva dalle date —
funzionava, ma era una deduzione: non si sapeva **quando** era stata trascinata
né **quante volte**, e una riga che gira da tre chiusure si leggeva identica a
una scaduta ieri. Adesso la chiusura lascia il segno (`carried_at`,
`carried_from`, `carry_count`), la riapertura lo cancella — riaprire vuol dire
che quella chiusura non è più successa — e sopra il blocco «Da mesi precedenti»
sta scritto quante si trascinano da più di una chiusura, che è la sola cosa che
distingue un ritardo da un credito che nessuno sta inseguendo. `carryOf` in
`lib/cash-calendar.ts` è l'unico lettore.

**I compensi si leggono nel P&L, al mese in cui escono** (§291,
`lib/pl-aggregate.ts`). Le quote di luglio si erogano ad agosto (§224, come il
costo del lavoro): finché il prospetto le metteva a luglio, la colonna di agosto
mostrava un «resta alla società» che nessun bonifico avrebbe mai confermato — il
mese pagava dodicimila euro che il suo P&L non conteneva. In cassa il problema
non c'era, perché `paidPartners` guarda la spunta e la spunta cade nel mese
dell'erogazione: lo spostamento riguarda la sola **competenza**, ed è proprio
quello che avvicina le due letture invece di separarle.

- **Il prezzo è dichiarato, non nascosto**: la riga porta scritto da quale mese
  arriva la maturazione. Un P&L che sottrae quote di un altro mese senza dirlo è
  il modo più veloce per non fidarsi del totale.
- **Una riga per persona** — Marco, Walter, Toto, e i commerciali separati — in
  ordine di importo. «Compensi 12.325 €» non risponde alla domanda che ci si fa
  guardando il P&L, che è «quanto a Marco». Le persone arrivano dal piano
  compensi (`perPartner`, `salesByOwner`): la UI non ricalcola percentuali.
- **Il totale si fa sulle righe di gruppo, mai su tutte**: sommare anche il
  dettaglio lo conterebbe due volte e darebbe un margine sbagliato con lo stesso
  nome di quello giusto. Per la stessa ragione la tabella «Dove esce» del report
  elenca le destinazioni e non le persone.
- **In cassa la persona porta la spunta**, non il maturato: è l'unico numero che
  un bonifico può confermare (§226).
- Nel conto economico i compensi restano **la leva**: è lì che si spunta
  l'erogazione (§243), e una leva lontana dal suo risultato non la usa nessuno.

**Tutte le uscite che cadono nel mese, anche quelle che nessuno ha portato
dentro** (§308). «Un mese aperto si legge dalle righe, uno mai aperto dal piano»
(§262) proteggeva dal doppio conteggio e **buttava via il resto**: una spesa
ricorrente che nessuno ha portato nel mese non compariva da nessuna parte, e la
cassa del mese risultava più leggera del vero. Su agosto erano **965 €** —
Google Workspace, Slack, OVHcloud, Aruba, il commercialista — con la loro data.

- **Il legame è `cost_item_id`**, che la riga porta da quando nasce dal piano:
  quello che ha già una riga si esclude, il resto entra.
- **Entra in cassa, non in competenza.** Il conto economico è l'autorità su cosa
  il mese ha prodotto (§264), e i totali di competenza del piano devono
  continuare a combaciare con lui **riga per riga** — è l'unica cosa che rende
  quei numeri controllabili. Metterle in competenza faceva dire al piano 29 voci
  contro 16 righe: due numeri con lo stesso nome. La loro presenza in cassa è
  **il segnale** che al mese manca qualcosa, e si porta dentro con «Prepara il
  mese» o dal dialogo dei movimenti (§303).
- **L'area Personale resta fuori** (§184): le sue voci a piano sono un residuo
  del seed, e le righe del costo del lavoro le scrive l'organico **senza**
  `cost_item_id` — quindi il filtro non le riconosce e comparirebbero accanto a
  quelle vere. Su agosto erano 8.640 € contati due volte. E l'esclusione va per
  **id dell'area**, non per nome: `cost_items.category` dice «HR», l'area si
  chiama «Personale», e `isPayrollCenter` guarda il nome — sul campo sbagliato
  non riconosceva niente.
- **Una data già passata è `scaduto`, non `atteso`**: chiamarla attesa insegna a
  non guardare le date.

**Fin dove il saldo è un fatto lo dice l'estratto conto** (§308). L'ancora era
**oggi**, ma il saldo di partenza è quello della banca e la banca contiene solo
ciò che l'estratto conto copre: con l'ultimo scaricato fermo al 20 e oggi il 25,
i cinque giorni in mezzo venivano dati per «già nel saldo» mentre il conto non li
aveva visti — e il mese chiudeva con un numero che nessun estratto conto avrebbe
confermato. Adesso l'ancora è la data dell'ultimo movimento caricato.

**E `verify-plan` costruiva il piano a modo suo** (`open ? [] : …`), quindi non
vedeva niente di tutto questo: un controllo che non passa dal codice che gira in
pagina verifica sé stesso (§287). Ora applica le stesse due regole.

**Il piano di cassa del mese** (§262, `lib/cash-plan.ts`, in cima al prospetto).
La tenuta di cassa (§225) dice **se** un mese regge; questa dice **da cosa
dipende**. Ogni fatto atteso è una riga con la sua data e la sua provenienza —
righe registrate, contratti, piano dei costi, organico, IVA, compensi — e ogni
riga si può **spegnere**. Spegnere non cancella niente: dice «e se questo non
succedesse», e il saldo di fine mese si muove mentre si sceglie, trascinandosi
dietro i mesi dopo. Il mese sta **nel titolo** ed è una tendina, coi mesi mai
aperti compresi: è lì che serve guardare.

- **Un mese aperto si legge dalle righe, uno mai aperto dal contratto e dal
  piano.** Sommarli conterebbe due volte lo stesso canone.
- **§284 — spuntare «pagato» non fa sparire i soldi.** Una riga spuntata che
  nessun movimento `banca` dimostra è un fatto **avvenuto** che il saldo non
  contiene ancora: il bonifico l'ha visto una persona sull'home banking e
  l'estratto conto si scarica la settimana dopo. Prima veniva marcata «già nel
  saldo» e spuntare un incasso da 7.930 € faceva **scendere** di 7.930 il saldo
  di fine mese — l'opposto di quello che era successo. Adesso `declared` la
  somma al saldo, la mette nel **pavimento** (è un incasso avvenuto, non una
  speranza) e resta riconoscibile — «spuntata, non in estratto conto» — finché
  la banca non la conferma (§226). Le righe **dimostrate** restano fuori dal
  totale, o si conterebbero due volte. Su agosto: +4.270 e −11.169 spuntati che
  il conto non ha ancora visto, saldo 34.846 → **contato come 27.947**.
  Il numero vale anche in Banca, dove **si conta dalle righe e non dai
  `derivato`**: quelli restano anche quando il fatto è arrivato ma nessuno l'ha
  riconciliato, e sui dati veri i due modi divergevano di **24.044 €**.
- **Si parte dal saldo vero della banca** (§263): il mese in corso apre con
  **quello che c'è sul conto adesso** — 30.876,09 € al 9 agosto, lo stesso
  numero di `verify-bank.ts` — non con un'apertura ricostruita dalle righe.
  Quel saldo contiene anche i movimenti che nessuna riga giustifica, ed è
  esattamente il motivo per cui è quello giusto. Da lì si somma solo quello che
  deve ancora succedere: le righe già mosse restano in elenco (`inBalance`,
  «già nel saldo», con una spunta e non una casella) ma non muovono il totale,
  o il mese conterebbe due volte incassi che ha già avuto. Un mese passato apre
  col saldo che aveva a inizio mese, perché lì è già successo tutto.
- **Gli arretrati pesano sul primo mese**, non sul loro: una fattura di maggio
  scoperta è una telefonata di adesso.
- **Il costo del lavoro si stima solo se il mese prima non è aperto** (§224:
  esce il 20 del mese dopo). Senza la regola settembre lo contava due volte —
  le righe di agosto in scadenza il 20 **più** la stima.
- **I compensi dei mesi futuri si stimano dal contratto**, con lo stesso
  `computeMonth`: dal primo mese non registrato in poi sparivano, e sono la
  seconda uscita del mese.
- **Una sola voce è spostabile: i compensi** (§237). L'IVA ha una data, i
  fornitori pure, gli stipendi sono un patto — e il modello lo dice invece di
  lasciar credere che tutto sia comprimibile.
- **Il primo consiglio è il verdetto**, coi tre esiti: un saldo positivo non
  dice su cosa poggia. Agosto 2026 chiude a **+306 €** ma solo perché rientrano
  **12.688 €** di crediti scaduti — «regge» e «chiude solo se rientrano gli
  arretrati» sono due situazioni che vogliono due azioni diverse.

- **L'appartenenza è quella del conto economico** (§264): una riga di agosto è
  di agosto, **pagata o no**, e i totali «di competenza» combaciano riga per
  riga con quella pagina — su agosto 2026: 7 righe di entrata per 24.064,50 € e
  21 di uscita per 16.334,13 €, identiche. La cassa è l'altro numero e non ci
  somiglia: comprende gli arretrati di luglio e **non** comprende le
  retribuzioni di agosto, che escono il 20 settembre. Ogni riga dichiara quale
  delle due cose è («di questo mese, esce settembre» · «matura 2026-07, si
  muove adesso»). IVA e compensi non sono righe di conto economico: escono dal
  conto ma restano fuori dal totale che deve combaciare.
- **L'elenco è quello che resta da fare** (§266): di default si vedono solo le
  voci che devono ancora muoversi in questo mese, **ritardi compresi**. Le altre
  — già in banca, o in scadenza il mese prossimo — stanno dietro una riga che
  dice quante sono e perché. I totali non si alleggeriscono mai: quello di
  competenza deve continuare a confermare il conto economico.
- **Il riscontro con la banca sta dentro la sezione** (§265). Erano due blocchi
  a parte — quattro tile e la tabella «E in banca» — che calcolavano il saldo
  sulla sola finestra del prospetto: dicevano «saldo a inizio mese **0 €**» e
  «sul conto adesso **10.568 €**» mentre in banca ce n'erano 30.876. Due numeri
  con lo stesso nome sono peggio di un numero solo, quindi sono stati tolti e il
  loro contenuto utile — entrato/uscito davvero e la differenza con quello che
  le spunte dicono — vive dove c'è il saldo vero, col link al ponte (§199).

- **Quello che si è già mosso ha una data, e quella data è il suo mese** (§267).
  Lo spostamento sul primo mese della catena vale **solo per gli scoperti**:
  applicarlo anche ai fatti chiusi trascinava dentro agosto ogni incasso di
  maggio e giugno — venticinque righe da «già nel saldo» che nessuno doveva più
  guardare. E quello che è già nel saldo **non si mostra**: è un fatto chiuso,
  non si può spegnere, e resta solo nei totali.

**Il report per il consiglio** (§268, `/api/prospetto?m=<mese>`,
`lib/prospetto-report.ts`). Una riunione di soci non si fa scorrendo una pagina
web: si fa su un foglio che si stampa, si allega a un verbale e si rilegge fra
sei mesi. HTML autonomo A4 col pulsante che apre la stampa del browser, come
`kpi-report`: il PDF lo fa il browser, e il documento è identico su ogni
macchina senza portarsi dietro un motore di stampa.

- **Risponde in ordine alle domande che vengono fatte**, non elenca quello che
  il tool sa: il verdetto in una frase · il mese ha prodotto margine
  (competenza) · da dove vengono e dove vanno i soldi · cosa deve ancora
  succedere (cassa) · le leve · come prosegue il conto.
- **Due pagine, e la divisione non è tipografica** (§269). La prima è quella che
  si proietta: sette numeri e tre frasi. La seconda si allega al verbale e si
  rilegge quando qualcuno chiede «e questi 5.772 da dove vengono» — ogni riga di
  entrata e di uscita col suo imponibile, la sua IVA, la sua scadenza e il suo
  stato. Metterle insieme voleva dire perdere la prima; toglierne una, non poter
  rispondere alla domanda che arriva sempre.
- **I compensi hanno una sezione loro, con due colonne che non si sommano**
  (§270): il **maturato** — quello che spetta per il lavoro consegnato — e
  quanto di quel maturato l'**incassato** copre davvero (`computeMonth` sulle
  sole righe spuntate, §232). Un socio che è anche commerciale compare **una
  volta sola** (`mergePeople`, §226): «Walter» in `pl_partners` e «Walter
  Giacobbe» in anagrafica erano due righe con lo stesso destinatario, e chi le
  legge cerca due bonifici che non esistono.
- **§274/§275 — l'erogato si emette sull'incassato, e «incassato» ha una sola
  definizione.** La sezione compensi mostra **solo** quello che si eroga: niente
  colonna del maturato e niente scoperto, che sul foglio di chi deve bonificare
  sono rumore. La base è **quello che si è mosso nel mese prima** — `movedIn`
  (§224), gli incassi *di* luglio di qualunque fattura — non «le righe di luglio
  che risultano pagate»: sono due insiemi diversi e davano 3.595,94 € a socio
  contro i **3.530,94** che la pagina Ripartizione mostra a schermo. Due numeri
  diversi sullo stesso compenso sono il modo più veloce per non fidarsi di
  nessuno dei due. Su luglio: 24.100 € rientrati → erogato 860 + digital
  2.610,94 + 60 da lead generation = 3.530,94 a socio, provvigioni 1.143 e
  589,67, **totale da erogare 12.325,49 €**. Chi non ha visto rientrare le sue
  fatture resta in tabella con scritto perché, invece di sparire.
- **I compensi che escono in un mese sono maturati in quello prima** (§271),
  come il costo del lavoro (§224): il foglio calcolava il maturato di agosto e
  lo intitolava «compensi di agosto», mentre la sezione di cassa contava —
  giustamente — quelli di luglio. **Due numeri con lo stesso nome nello stesso
  documento**, che in riunione diventano una discussione su chi ha ragione. Ora
  la tabella guarda il mese prima e lo dice nel titolo; e siccome le righe
  preparate portano l'importo copiato quando il mese è stato preparato (§243),
  la differenza col ricalcolo è **scritta** invece di far tornare i conti a
  mano: maturato a luglio 18.947,51 €, in uscita ad agosto 14.844,41 €.
- **Dove il mese di competenza non è quello di cassa, il foglio lo scrive**:
  «Persone · maturate a luglio 2026», «Compensi · maturati a luglio 2026», e su
  ogni subappalto «si paga quando incassiamo dal cliente» (§224, `a_incasso`) —
  altrimenti quella scadenza sembra arbitraria e quei totali sembrano contati
  due volte.
- **§273 — la tabella delle Uscite elenca quello che il mese paga.** Le
  retribuzioni di agosto sono competenza di agosto e cassa di settembre:
  elencarle lì, con scadenza 20 settembre, faceva leggere come «uscite di
  agosto» dei soldi che ad agosto non escono. Al loro posto ci sono le buste di
  **luglio** — 6.698 €, in scadenza il 20 — e ogni riga dice di che mese è. Il
  legame col conto economico non si perde, si **scrive**: `13.570,73 − 6.698,00
  + 8.191,51 = 15.064,24`, che è il costo di agosto.
- **§272 — una copia mutilata delle righe dà numeri plausibili e sbagliati.**
  `loadProspetto` restituiva le righe **senza `project_value`**, che è il valore
  venduto del lavoro e decide se il fondo rischio digital è disponibile (§186:
  sopra i 20.000 € ciascun socio scende dal 28% al 25%). Senza, nessuna riga
  risultava eleggibile e il report dava **4.340,78 € a socio invece di
  4.045,94** — un numero credibile, che nessuno avrebbe controllato. Le righe
  escono anche col **commerciale dell'anagrafica** (`client_sales_owner`), o
  `ownerOf` le legge come inbound e divide ogni provvigione fra i soci. Il
  riscontro è `npx tsx scripts/verify-month.ts <mese>`: se il report non dice i
  suoi stessi numeri, è il report a sbagliare.
- **Competenza e cassa stanno scritte**, non sottintese: è il punto in cui ogni
  consiglio si perde, e un numero di cui nessuno sa la provenienza diventa una
  discussione su chi ha ragione. Il primo blocco è imponibile, il terzo è lordo,
  e ognuno lo dichiara.
- **Il caricamento è uno solo** (`lib/prospetto-load.ts`): pagina e report
  leggono gli stessi numeri, o la riunione si apre con due fogli che non tornano.
- `npx tsx scripts/report-prospetto.ts <mese> [file.html]` lo genera su file:
  serve a **guardarlo** senza autenticarsi, perché una colonna che va a capo o
  un numero vuoto si notano sul foglio, non compilando.

Gate: `npx tsx lib/cash-plan.check.ts` (57 controlli) ·
`npx tsx scripts/verify-plan.ts <mese>` stampa il piano dal database e
**confronta le voci del mese col conto economico**, riga per riga.


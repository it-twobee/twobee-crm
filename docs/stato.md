# Dove siamo

## Dove siamo — 2026-09-09

**§326 — la lista clienti chiedeva a GAV Sistemi di quotare un canone.** E a
TwoBee. Sotto `is_internal` stavano due cose che non si somigliano: GAV ha
partita IVA e una fattura emessa da 3.660 € — è un **giro fra società
collegate**, e quel documento sta nel registro IVA come tutti gli altri —
mentre Twobee, Metroquadro, Visionark e Costruisci e arreda non hanno né l'una
né le altre: sono **marchi e lavori nostri**. In una lista sola il danno era
doppio e opposto: al primo si chiedeva «da quotare» e non c'è niente da quotare,
al secondo lo stato dei pagamenti e non c'è nessun pagamento. Adesso sono **tre
aree** — Clienti (11) · Società collegate (1) · Progetti interni TwoBee (4).
La **220 è applicata**: il backfill ha seguito i documenti e ha separato GAV dai
quattro marchi al primo colpo. Il CHECK regge (§313: `internal_kind` inventato →
**23514**, `giro` passa), e nessun cliente vero ha preso un genere.

**E si è visto subito perché serviva un modo di spostarle.** Elettra Group è
stata segnata interna **dopo** il backfill della 220, è rimasta senza
`internal_kind` ed è comparsa fra le società collegate. Il default prudente ha
funzionato — meglio una riga di troppo in vista che una sparita — ma il difetto
era a monte: `is_internal` si poteva scrivere **da solo**, dal form anagrafica e
dalla creazione. Adesso non è più in `EDITABLE`, nella scheda l'area è in sola
lettura, e si sposta da un posto solo: la barra della selezione in lista, anche
su più anagrafiche insieme, o la scelta alla creazione. Le due colonne si
muovono insieme o non si muovono.

**E la lista si legge.** Le sezioni erano un filetto con la scritta in mezzo, che
si legge come una riga vuota — nello screenshot la prima anagrafica sotto
sembrava appartenere alla riga sopra. Adesso sono bande con un bordo colorato, il
conteggio e lo scaduto della sezione. E le righe degli interni non ripetono più
«nessuna scadenza» in due colonne accanto: nella prima resta il vuoto, nella
seconda c'è **perché** è vuoto — «non fattura» — che è l'unica cosa che quelle
righe hanno da dire.

**La colonna Pagamenti era una parola, adesso è un numero.** Leggeva
`clients.payment_status` — scritta dal cron notturno — e sotto lo scoperto **del
solo mese in corso**: un credito di luglio non compariva da nessuna parte.
Adesso è lo **scaduto cumulativo** delle fatture del cliente, dalla stessa porta
di Fatturazione: **13.176,00 €**, gli stessi che dice la sezione Fatture — se
divergessero, una delle due pagine starebbe mentendo e non si saprebbe quale.
Affinity 4.392 (2 fatture) e iCura 8.784 (2).

**E dov'era «Settore» — il ramo merceologico, che non fa decidere niente — c'è
il ciclo dei soldi**, con i tre stati che Fatturazione e Banca già conoscono:
`pagato` · `da emettere fattura` · `non pagato`. Il secondo non è un ritardo del
cliente: è **nostro**, ed è competenza del mese senza un documento sotto — Seven
6.500, Josè 1.200. L'ordine conta: prima il non pagato, che sono soldi già
dovuti; poi il da emettere, che è lavoro nostro.

**Chi non si quota**, e la regola non è «chi conta nelle statistiche»: è **chi
può firmare qualcosa**. Non i giri, non gli interni, non i persi — ma sì i lead,
che è il loro motivo (§321), e sì i fermi, perché il giorno che ripartono serve
un contratto.

**§325 — l'IVA aveva tre letture in tre posti diversi.** La Fiscale la calcolava
solo dalle righe del conto economico, l'archivio delle fatture per conto suo in
un'altra pagina, e il modello F24 arrivava mesi dopo. Adesso stanno nella stessa
riga, e sul **2º trimestre** la misura è netta: il modello ha chiesto
**9.669,33**, i documenti dicevano **9.804,96** e le righe **8.451,96** — i
documenti hanno sbagliato di 135,63, la stima di 1.132,85. **Otto volte meno.**

Sul **3º trimestre** in corso il segno si ribalta (righe 15.476,54, documenti
11.059,67) e non è un errore: sul venduto le righe hanno 2.816 € di imposta in
più perché settembre è competenza e le fatture escono a fine mese; sul comprato i
documenti ne hanno 1.600 in più perché sono arrivate fatture che le uscite non
registrano. Per questo lo scarto adesso si attribuisce **al lato che lo produce**
— una spiegazione sola sbaglierebbe una volta su due.

**Il versamento non cambia**: resta il modello quando c'è, la stima quando non
c'è (§242). I documenti stanno accanto come controllo, perché spostare la
liquidazione su una terza fonte muoverebbe la cassa senza che nessuno l'abbia
deciso.

**Il 2º trimestre è versato per intero.** 9.669,33 di IVA dentro l'F24 da
10.547,24 del 20 agosto (cod. 6032) — il resto sono ritenute 239,48, INPS 856,00
e crediti 217,57, che stanno in `hr_f24`. **Riporto al 3º trimestre: zero.**

**E la somma era scritta tre volte.** Da righe a IVA del mese: la Fiscale
applicava la detraibilità parziale (§191), il prospetto e il piano di cassa no.
Coincidevano *per caso* — nessuna riga ha una percentuale sotto il 100% — e alla
prima che arriva avrebbero detto tre liquidazioni diverse. Adesso è `monthsVat`,
una sola. Il piano di cassa resta con un limite dichiarato: le righe di
`lib/pl-rows.ts` non portano `vat_deductible_pct`, quindi lì il credito si legge
pieno, e c'è scritto dove guardare quando smetterà di essere lo stesso numero.

**Settembre è aperto**, e si vede: il 3º trimestre passa da 12.429,17 a
15.476,54 di saldo IVA sulle righe, perché la competenza del mese è entrata.

**Archivio a 86 documenti** (47 emesse, 39 ricevute): 5 fatture nuove — FPR
57/26 Fatima, FPR 59/26 iCura, la nota di **debito** FPR 58/26 ad Affinity, la
nota di **credito** FPR 56/26 a Petito, e in entrata la FPR 14/26 di Affinity da
12.200 €, che è la più grossa mai ricevuta.

**§323 — la nota di credito diceva già quale fattura stornava, e per otto mesi
nessuno l'ha letta.** `DatiFattureCollegate` è nel tracciato FatturaPA ed è
compilato su **tutte** le TD04 dell'archivio: la FPR 56/26 dichiara di annullare
la FPR 41/26 del 3 luglio, con numero e data. Finché quel campo restava nell'XML
e non in una colonna, il legame lo ricostruiva una persona scrivendo a mano una
ragione di esclusione (§281) su **una** delle due righe della coppia — e ha
sbagliato riga due volte su quattro.

**Due numeri diversi per la stessa parola, nella stessa schermata** (§238 di
nuovo). La scorecard «Fatturato emesso» sommava ogni documento col suo segno e
diceva **123.075 €**; il grafico sotto toglieva le note di credito **e** le
esclusioni a mano e diceva **112.375 €**. La differenza — **10.700 €** — sono
quattro fatture sottratte **due volte**: una come «fuori dai conti» e una come
storno della loro nota di credito, perché `credited` non escludeva le note già
escluse. Il netto giusto è 123.075: ogni documento conta una volta, col suo
segno. Non c'era modo di accorgersene guardando un totale: entrambi erano
plausibili.

**E lo storno stava nel mese sbagliato.** Adesso pesa nel mese della **fattura
annullata**, non in quello della nota. Maggio 26.800 · giugno 17.300 · luglio
30.725 · agosto 39.725 · settembre 8.525. Prima i 3.300 delle note del 3 agosto
cadevano su agosto mentre annullavano due fatture di **giugno**, e il 1.500 di
Petito cadeva su settembre mentre annullava **luglio**: due mesi sbagliati per
un documento solo. La dichiarazione resta un'altra domanda e la risponde
`vatByQuarter`, che tiene ogni documento nel suo trimestre.

**La coda del «da incassare» chiedeva di telefonare per soldi già stornati.**
Erano 17 documenti per 69.479 €, e dentro c'erano la FPR 31/26 di Affinity
(2.196) e la FPR 41/26 di Petito (1.830) — entrambe annullate da una nota che
era in archivio — più due note di credito contate come crediti **negativi**, che
nascondevano altri 4.270 €. Adesso sono **13 fatture vere per 69.723 €**, di cui
**47.122,50 scaduti**. Il totale si somiglia; la lista è un'altra.

**Gli stati sono uno solo, in `invoiceStatus()`**, e coprono tutto l'archivio
senza sovrapporsi: 22 pagate · 8 scadute · 5 nei termini · 6 stornate · 6 note
di credito · 0 non gestite. Le esclusioni a mano rimaste sono **zero**: le otto
che c'erano le spiegava già una nota di credito. Il campo resta, ed è giusto che
resti — serve per quello che nessun documento spiega — ma non è più il posto
dove si tiene a mano una cosa che il file dice da sé.

**Emessa non è inviata** (§323): `from_sdi` è **generata** da `raw_xml IS NOT
NULL`, perché un file tornato dallo SdI è la prova del transito e uno stato che
si può digitare è uno stato di cui fidarsi a metà. La data dell'invio nell'XML
non c'è e non si inventa: `sent_on` esiste per le fatture scritte a mano (§247).

**Banca riallineata al 9 settembre.** BPM: 116 righe nell'estratto, **5 nuove**
(iCura 24.400 in entrata, Affinity 12.200 e 3.260 in uscita, due commissioni).
Vivid: il camt di 57 movimenti era **già tutto in archivio**, e il saldo di
chiusura che il file dichiara — 428,15 — è al centesimo quello del tool. BPM
quadra allo stesso modo: le 116 righe del CSV più i tre movimenti del 28 aprile
che quel CSV non copre fanno **24.295,92**, cioè il saldo dell'archivio.
**Liquidità reale 24.724,07 €.**

**Otto abbinamenti fattura↔movimento scritti**, tutti col criterio di §276 —
importo lordo identico, controparte che torna, e su sei di essi **il numero
della fattura scritto dalla banca nella causale**: FPR 43, 44, 48, 49, 53, 55 in
entrata, e le due Affinity in uscita (FPR 12/26 e 14/26). Nessuno era ambiguo;
gli undici che lo sono restano a mano, e la ragione è scritta accanto a ciascuno.

**Il ponte (§199) non quadra, e si sa di quanto**: residuo −24.109,08 €. Non è
un movimento senza nome: **settembre ha 14 movimenti in banca per +20.408,97 € e
non ha un mese di conto economico**. La cassa cumulata del piano si ferma ad
agosto, il saldo vero no, e la differenza è quasi tutta lì. Si chiude preparando
settembre, che è un'altra operazione — crea righe di ricavo e di costo — e non
si fa di straforo insieme a un import.

**§324 — il lato «da pagare», che aveva la forma sbagliata.** I debiti verso i
fornitori si leggevano come i crediti verso i clienti: una lista piatta ordinata
per ritardo. Ma un credito si insegue una fattura alla volta e un debito si paga
**un fornitore alla volta**. Adesso «Chi dobbiamo pagare» raggruppa, e sopra c'è
quando esce: **6.031,73 € verso 4 fornitori**, di cui **3.034,13 già scaduti** e
**2.997,60 senza una data**. Nei prossimi 30 giorni non scade nient'altro — tutto
il debito aperto è già oltre il termine o non ne ha uno.

**Quattro debiti, e ognuno per una ragione diversa.** Affinity **FPR 13/26**
(2.989) è il «Saldo sviluppo modulo gestione trasferte I.S.F.»: la catena è
acconto 30% + secondo 35% + **saldo 35% al completamento**, e quel saldo è dovuto
quando il lavoro chiude, non adesso. OVH **IT3087078** (45,13) è settembre, e la
carta addebita circa un mese dopo — luglio il 4 agosto, agosto il 3 settembre —
quindi arriva a inizio ottobre: non è un arretrato. Saraiello **6/2026** (1.500)
è settembre e basta. Spaduzzi **3PR** (1.497,60) non ha scadenza e non ha
storico: l'unica delle quattro che vada davvero decisa a mano.

**Un buco da 462 € che vale la pena guardare.** La FPR 9/26 di Affinity (acconto
30% ISF) è di 2.562 € e il bonifico del 23 luglio è di **2.100**, cioè il solo
imponibile: manca l'IVA. È saldata — lo dice chi ha in mano il rapporto — ma il
conto corrente ne dimostra 2.100, e la differenza non è un arrotondamento.

**La catena Saraiello, rimessa in ordine dal fornitore stesso.** Sei fatture e
quattro pagamenti sparsi, con la 5/2026 che risultava pagata 19 giorni prima di
essere emessa. Il pattern vero, una volta saputo che la distinta del 20 agosto da
2.854 € è **1.300 a Saraiello + 1.554 a Smiraglia** (l'unica scomposizione
esatta): paga **circa due settimane dopo l'emissione, sempre prima della
scadenza** — 3/2026 il 1º luglio, 4/2026 il 17, 5/2026 il 20 agosto. Resta aperta
**solo la 6/2026 di settembre**, 1.500 €. La distinta non si aggancia a nessuna
delle due: paga due fatture e la colonna ne regge una (§189), quindi entrambe
restano «dichiarate» e lo scadenzario delle spunte lo dice.

Nel riquadro «Oltre la scadenza» c'era lo stesso numero già scritto nel riquadro
accanto: due volte la stessa cifra sulla stessa riga fa contare a mano invece di
leggere (§238). Al suo posto la domanda che mancava — **quanto serve avere sul
conto entro il mese**, scaduto compreso. Non «la prossima uscita»: con tutto il
debito già oltre il termine, quel riquadro avrebbe mostrato una data passata
sotto la parola «prossima».

**La scadenza che manca la dice il fornitore.** Metà delle ricevute non porta
`DataScadenzaPagamento`, e senza quella un debito non è né scaduto né atteso:
sparisce dalla cassa. Non si inventano trenta giorni — si legge il termine che
quel fornitore scrive **sulle sue altre fatture**, col campione accanto.
Saraiello: 31 giorni su 5 documenti, quindi la 6/2026 del 2 settembre scade il
**3 ottobre**. Spaduzzi ha una fattura sola e nessuno storico: lì la pagina dice
che non lo sa.

**Tre agganci impossibili, e la soglia che li lasciava passare.** Il bonifico
Tailors del 17 giugno era attaccato a una fattura del 4 agosto — 48 giorni prima
che esistesse — e iCura uguale a 14 giorni. `txCandidates` li proponeva:
importo esatto più controparte fanno 75, la penalità era 20, restava esattamente
la soglia di 55. Ora la penalità oltre il termine della differita è 40, e la
riconciliazione ha un controllo suo. **Due riparati** con
`scripts/fix-invoice-links.ts` — la fattura giusta portava già la data giusta,
quindi non si è mosso un euro — e **uno lasciato aperto**: la 5/2026 di Saraiello
è pagata 19 giorni prima di essere emessa, ma quale delle due più vecchie sia la
vera destinataria non lo dice nessun documento.

**Un falso positivo che valeva per tutte le parcelle.** La 3PR di Spaduzzi —
una delle due senza data — era segnata come incoerente: righe 1.440, imponibile
1.497,60. Torna: in mezzo ci sono 57,60 di cassa previdenziale, che è
**imponibile** e va sommata. Il controllo la sottraeva. Una sola nell'archivio,
ma ogni parcella con la cassa avrebbe preso lo stesso avviso, ed è il difetto
già visto sul bollo (§211). Riscritti i tre avvisi che cambiavano, rileggendo
l'XML conservato.

**Un bug di fuso trovato scrivendo il test.** La scadenza dedotta cadeva il 2
ottobre invece del 3: `new Date('...T00:00:00')` è mezzanotte locale e
`toISOString()` la riporta a Greenwich, che da Napoli in ora legale è il giorno
prima. Adesso la somma è in UTC, e il gate passa anche a UTC+14 e UTC−11.

**219 applicata, e il riallineamento è passato.** 6 storni collegati leggendo
`DatiFattureCollegate` dagli XML già in archivio, 9 esclusioni a mano rimosse —
una in più delle otto previste, perché nel frattempo qualcuno aveva escluso anche
la FPR 41/26, che adesso la nota di credito spiega da sé. **Esclusioni a mano
rimaste: zero.**

I numeri, sul database vero: **netto 123.075,00 €**, e la scorecard e il grafico
adesso dicono **la stessa cifra** — prima erano 123.075 contro 112.375. Mese per
mese: maggio 26.800 · giugno 17.300 · luglio 30.725 · agosto 39.725 · settembre
8.525. Gli stati coprono tutte e 47 le emesse senza sovrapporsi: 28 pagate · 5
stornate · 6 note di credito · 4 scadute · 4 nei termini. E **47 su 47 sono
passate dallo SdI**, quindi nessuna è «da inviare»: quello stato esiste per le
fatture scritte a mano (§247), e per ora non ce ne sono.

## Dove siamo — 2026-09-07

**Allineato ai documenti veri al 7 settembre**: estratto conto BPM al 7/9 (7
movimenti nuovi su 114 letti), 7 fatture nuove (3 emesse, 4 ricevute). Archivio
a 81 documenti, 151 movimenti. **Saldo reale 15.787,07 €** (BPM 15.358,92 + Vivid 428,15) — e il gate del
prospetto lo conferma: 4.315 + 12.204 − 732 = 15.787, ✓ combacia.

**Il fatto nuovo grosso: iCura AI Digital Trainer.** La FPR 55/26 del 31 agosto
fattura **20.000 €** di «acconto contrattuale per kick-off», e nel tool quel
progetto non esisteva — iCura aveva tre lavori e un canone da 3.600. Registrato
come vuole §194: progetto, contratto digital, rata di agosto, e la riga che
nasce **da lì** e non a mano. **Fondo rischio acceso** (§186: il valore venduto
tocca la soglia dei 20.000, e la scelta è dell'admin riga per riga) → 9% al
fondo e ciascun socio al 25%. Agosto passa da 19.725 a **39.725 €** di
imponibile e la quadratura chiude ancora a **0,00**.

Il corrispettivo **totale** del progetto non è nel tool: la fattura dice
«imputato al corrispettivo complessivo», e finché non si sa, `amount` resta
20.000 — cioè la soglia toccata appena. Quando si alza, il fondo rischio resta
disponibile e si aggiungono le rate.

**Tre bonifici che le fatture rendono non ambigui** (§302 prima di §297: il
documento dice chi e quanto, ed è l'unica cosa che distingue due righe dello
stesso importo). Seven 7.930 € del 7/9 è la FPR 53/26 · Fatima 3.812,50 € del
7/9 è la FPR 48/26, che copre **due** righe di agosto (1.982,50 + 1.830, al
centesimo) · Marietta 1.464 € del 25/8 certifica una spunta che era solo
dichiarata. E sette righe di agosto hanno finalmente il documento sotto, le due
lavorazioni esterne comprese — Affinity le ha fatturate il 1º settembre.

**Due volte la stessa lezione, trovata in fila** (§318-§319). «Una regola
scritta due volte non è una regola», e qui la regola era §297 — *la spunta
«pagato» segue il registro*:

- **`allocate-open` scriveva le allocazioni e non allineava `paid`.** Lo faceva
  solo l'azione. Sul bonifico a Walter del 27 agosto le due allocazioni c'erano
  e il tool continuava a dire «erogato 0»: la regola viveva in un percorso e non
  nell'altro. Adesso lo script chiama la stessa `targetCoverage` dell'azione.
- **Il prospetto leggeva l'erogato dalla spunta, il conto economico dal
  registro.** Due schermate che dicono «erogato» e due cifre diverse. Si è visto
  su un difetto di 35 centesimi: la provvigione di Marco Lucci è 442,11 € e i
  due bonifici che se la dividono ne portano 441,76, quindi la spunta non
  scatta — e con la spunta come sola sorgente l'erogato di una persona pagata si
  leggeva **zero**, che è la stessa bugia di uno zero su chi non è stato pagato
  (§305). Ora `prospetto-load` legge le allocazioni, con la data del
  **movimento** invece di `paid_on`, e la spunta resta il ripiego dove il
  registro tace (§226). Effetto immediato: **Walter Giacobbe da 0 a 417 €**
  erogati, che erano usciti dal conto il 27 agosto e non li vedeva nessuno.

**Compensi di agosto ricalcolati** sulla finestra del 20 settembre (§286): base
10.825 € su 4 righe incassate, **1.856,78 € a socio**, provvigioni 322,50 e
229,67 → **6.122,51 € da erogare**. Fuori restano 35.800 € maturati e non
ancora incassati, iCura da 20.000 compresa: si erogano nell'erogazione in cui
rientrano.

**Tenuta di cassa: STRETTO.** Il mese chiude solo se rientrano gli arretrati —
43.676 € già scaduti, il più vecchio da 54 giorni; senza quelli si resta sotto
di 19.238 €. Piano di cassa e conto economico combaciano riga per riga su
agosto: 48.464,50 € di entrate su 8 righe, 15.658,59 € di uscite su 24.

**Settembre non è stato aperto**, ed è una scelta: un mese mai aperto si legge
dal contratto e dal piano (§262), che il 7 è la lettura giusta — le fatture del
mese si emettono a fine mese, e aprirlo adesso significa fotografare un mese
vuoto.

**Quello che resta, in ordine:**

1. ~~Manca l'estratto conto Vivid.~~ **Arrivato**, in camt.053 (§320): 57
   movimenti letti, 52 già riconosciuti, **5 nuovi** — cashback 11,73, Google
   Workspace 177,88, Slack 57,75, OVHcloud 45,13, e il **lato mancante del
   giroconto del 2 settembre**, che adesso è appaiato: i giroconti sono 8 su 8,
   nessuno spaiato. Vivid passa da 247,18 a **428,15 €** e il saldo totale a
   **15.787,07 €**. Fra il 15 e il 31 agosto su quel conto non è successo
   niente, quindi agosto non cambia.
2. **L'incasso ISF da 2.196 € del 6 agosto** non è stato toccato: quell'importo
   torna su quattro righe di due clienti diversi — Affinity ha lo stesso canone
   — e attaccarlo alla sbagliata dichiara incassata una fattura che nessuno ha
   pagato (§189). La scelta è di una persona.
3. **Tre uscite di agosto da sistemare col dialogo dei movimenti** (§303), 148,91 €
   in tutto: due Meta Ads da accorpare (la riga dice 109,12 e dal conto sono
   usciti 166,01) e un carburante da 92,02 da aggiungere. Con l'estratto Vivid è
   arrivato anche un **Google Workspace da 177,88 €** del 2 settembre che
   `merchant()` non riconduce a niente e finisce in «Altro»: a piano la voce
   esiste e dice 170.
4. **Antonio Giarletta non ha ancora ricevuto un bonifico**: 1.821 € maturati,
   contati da sempre perché a chi non ha mai preso un euro la linea del
   consolidato non si applica (§228).

Lo script dell'allineamento è `scripts/align-2026-09.ts` (anteprima senza
`--apply`), fratello di quello di agosto.

## Dove siamo — 2026-08-20 (sera)

**Il registro delle allocazioni è in produzione** (`2d45e53`). Il legame fra
conto corrente e conto economico non è più un campo: è l'euro allocato. Da lì
sono cadute sette cose in fila — l'F24 come documento, il dialogo che propone
«accorpa» invece di creare una riga, la posizione di ognuno, l'accordo validato.

Il ponte (§199) è passato da **−6.029 a −4.772 €**, e il numero è peggiorato due
volte **correggendo errori**: la spesa al supermercato da 3.751 € (era 37,51) e
le quattro righe che portavano il lordo dove il motore aspetta l'imponibile
stavano *coprendo per caso* uscite vere che nessuna riga spiega. Un residuo che
si allarga quando si corregge un dato era un residuo che mentiva.

Quello che resta da guardare, in ordine:

1. **6 spunte dichiarate** che nessun movimento conferma: è quasi tutto il
   residuo del ponte.
2. **Due bonifici Affinity di luglio**, 5.100 €: il motore dell'intake li propone
   e dice «scegli quale» — tre righe dello stesso fornitore, e la scelta è di una
   persona.
3. **Tre movimenti di agosto** per 148,91 €: due Meta da correggere (la riga dice
   109,12 e dal conto sono usciti 166,01) e un carburante da aggiungere.

Fuori dal tool per scelta: la **provvigione divisa** fra Marco e Toto è un accordo
fra loro (§286) e si registra a mano; il bonifico a Walter del 7 agosto è la
**riconciliazione con GAV Sistemi**, marcata «niente da abbinare» col perché
scritto.

## Dove siamo — 2026-08-20 (mattina)

**Allineato ai documenti veri** (`scripts/align-2026-08.ts`): estratto conto BPM
al 20 agosto (14 movimenti), Vivid al 14 (1), 7 fatture nuove. Il saldo reale è
**6.460,10 €** — non 34.845,84 — e la tenuta di cassa passa da «REGGE +5.531» a
**«STRETTO −25.749»**, che è la verità: IVA 9.669,33, compensi 9.824 e
retribuzioni 6.931 sono usciti fra il 7 e il 20 agosto. Le 74 fatture XML
coincidono al centesimo con l'archivio: **zero scostamenti** su importi,
imponibili e scadenze.

**Tre difetti trovati facendolo, tutti «una regola scritta due volte»**:

- **§288** — `scripts/import-bank-csv.ts` costruiva l'impronta con la *posizione
  nel file*: il bug §210 corretto nell'azione e mai nello script. Su un estratto
  conto sovrapposto avrebbe reinserito quasi tutti i 93 movimenti già in
  archivio. La regola ora è `buildImportRows` in `lib/bank-import.ts` e ci
  passano tutte e due le porte; `transferPairs` ha avuto lo stesso trattamento.
- **§289** — `verify-cash` leggeva la **stima** IVA mentre la pagina legge il
  modello F24 (§242): verificava sé stesso, non il codice che gira. E una
  liquidazione **già versata** continuava a essere sottratta dal saldo, quindi
  il conto perdeva 9.669 € due volte proprio il giorno in cui il verdetto serve.
  `vatPending` la esclude, `nextDue` è l'unico posto che risponde a «qual è la
  prossima scadenza da versare».
- Le **spunte gemelle**: la rata ISF «35% alla consegna» e il suo subappalto
  risultavano incassata e pagata l'11 agosto, ma quel giorno c'è un bonifico
  solo per parte, e appartiene alle rate di **luglio**. Della terza tranche non
  esiste fattura, né emessa né ricevuta. Tolte le spunte, non le righe.

**Il registro delle allocazioni ha chiuso quattro quinti del ponte** (§297, la
214 è applicata): residuo da **−6.029,01 a −1.083,25 €**. Il backfill ha scritto
142 allocazioni dai legami diretti, `scripts/allocate-open.ts` altre 5 per
11.956 €, e le due correzioni all'IVA dei subappalti (§295) hanno fatto il resto.

Tre cose che il registro ha trovato appena accesa la luce, e che nessuno vedeva:

- **Sette bonifici pagavano due mesi di canone.** La fattura di Fatima del 5
  maggio è 3.000 netti — due canoni da 1.500 — e il bonifico del 13 maggio ne
  pagava due. Con un campo solo il tool ne agganciava uno e l'altro mese restava
  scoperto per sempre. Cinque si sono chiusi da soli con due regole che non sono
  scelte: **un bonifico non paga una fattura non ancora emessa** e **un compenso
  si paga nel mese in cui è atteso**. Senza la prima, il canone di maggio aveva
  tre candidate e due erano nel futuro.
- **`pl_cost_lines` «Supermercato» dice 3.751 € e il movimento è 37,51.** Un
  fattore cento, invisibile finché nessuno confrontava la riga col bonifico.
- **Sei righe hanno `vat_applied` su un importo che è già lordo** — Asana,
  Talenti, Gialeda, Roberto Annunziata: il tool ci aggiunge il 22% e si aspetta
  un'uscita che non arriverà.

**§298 — le tre correzioni che il registro ha reso possibili**, e ognuna era
invisibile finché riga e movimento non stavano affiancati:

- **La riga di luglio del personale portava la busta di giugno**: 3.868 €, che è
  esattamente quello che era uscito il 17 luglio, mentre la distinta del 20
  agosto è di **4.077**. Il mese è stato preparato copiando quello prima.
- **La spesa al supermercato diceva 3.751 € e il movimento è 37,51.** Correggerla
  ha **peggiorato** il ponte, da −1.083 a −4.587,74: quei 3.713 € fasulli stavano
  coprendo per caso un'uscita vera che nessuna riga spiega. È il ponte che fa il
  suo lavoro — un residuo che si allarga quando si corregge un errore era un
  residuo che mentiva.
- **Cinque righe portano il lordo dove il motore aspetta l'imponibile**
  (`scripts/fix-gross-as-net.ts`), e le fatture dimostrano che **lo scorporo
  cieco al 22% sbaglierebbe**: Talenti è 300 + 66, e lo scorporo la
  indovinerebbe; Gialeda è 134 + **7,04**, cioè il 5,25%, perché una pratica
  CCIAA ha dentro diritti esenti. Vale §182 — il documento batte la stima — e
  dove il documento non c'è (Asana, fornitore irlandese) l'IVA **si spegne**:
  scorporare inventerebbe un credito che nessuno ha pagato. Quattro stanno in
  mesi chiusi e il tool non le tocca: cambiare l'imponibile di una fotografia ne
  muove le quote già distribuite.

**Due regole imparate allocando** (`scripts/allocate-open.ts`), e nessuna delle
due è un'euristica: **un bonifico non paga una fattura non ancora emessa** — senza
il vincolo il canone di maggio di Fatima aveva tre candidate e due erano nel
futuro — e **un compenso si paga nel mese in cui è atteso**, o il bonifico del 1º
giugno si prende le quote di agosto. Più due difetti di chi propone: `classify`
etichetta `finanziamento` i bonifici ai soci di giugno e `pagamento` quelli del
13 agosto, quindi **filtrare per categoria perde metà dei casi** — il segnale è
il nome più il mese; e il nome sull'estratto conto non è quello del piano
compensi, quindi passa da `PERSON_ALIASES` (§226) o il gemello di Toto non si
trova mai.

**Quello che resta a una persona.** Il bonifico a Walter del 7 agosto è la
riconciliazione con **GAV Sistemi** — giro fra società collegate, fuori dalle
statistiche — e non una quota: è marcato «niente da abbinare» col perché scritto,
e da allora `allocate-open` rispetta quella decisione invece di riproporla. La
seconda distinta del 20 agosto (2.854 €) resta aperta perché **1.300 + 1.530 fa
2.830, non 2.854**: le due fatture di Annalisa sono 1.530 e 1.554, e quale delle
due paga quella distinta il tool non lo può decidere. **La provvigione divisa fra
Marco e Toto** si registra a mano e lo dichiara: il tool la attribuisce intera al
commerciale del cliente (§286), e l'accordo fra loro vive fuori.

## Dove siamo — 2026-08-13

**Fatto il 2026-08-13**: la **212** è applicata e la riparazione di luglio è
passata (`npx tsx scripts/fix-july-2026.ts --apply`). Al mese mancavano
**5.209,33 €** di lavorazioni affidate fuori che il piano di progetto aveva già
— Seven acconto 2.459,33 e ISF 30% 2.100 mai portati nel mese, Fatima/Gianni
650 datato agosto contro una rata di luglio — e le sei tranche Seven stavano
**un mese avanti** rispetto alle rate che finanziano, fino a gennaio 2027.
Luglio è stato riaperto, corretto e richiuso: la quadratura chiude ancora a
**0,00**.

L'erogazione del **13 agosto** su luglio: base 25.325 € (8 righe su 12),
margine digital 10.293,45, **2.661,12 a socio** di quota digital, 470 di erogato
growth, 60 di provvigione divisa → **3.191,12 a testa**; provvigioni Walter
417,00 · Marco 442,11 · Antonio Giarletta 283,50 → **10.715,97 € da erogare**,
scritti in `pl_payouts` (`scripts/prepare-payouts.ts`, stesso motore del
pulsante). Restano fuori 6.900 € di righe di luglio non incassate: il loro
compenso si eroga nell'erogazione in cui rientrano. La finestra di agosto
riparte dal 13 e vale **945 €**; la tenuta di cassa dice lo stesso numero
(10.716 + 945 = 11.661 €).

**Due cose lasciate aperte da lì**: i due subappalti portati nel mese sono
entrati **non pagati** — nessun movimento dimostra che siano usciti (§226) — e
il fondo rischio di Seven è acceso sulle rate di luglio e **spento** su quella
di agosto: stesso progetto da 45.000 €, quota che salta dal 25% al 28% fra un
mese e l'altro senza che niente lo dica.

**Da eseguire subito, e non è una migration**: `supabase/RESTORE_HR_PEOPLE.sql`.
Il 9 agosto quattro persone su cinque sono state eliminate da `hr_people` per
togliere il loro costo dal solo mese di maggio; il CASCADE si è portato via
anche i tre cedolini di giugno. Lo script rimette persone (stessi id), cedolini,
la fattura di Annalisa e le date di assunzione — Gabriele da aprile, Annalisa da
giugno — e da lì in poi `inForce` (§233) fa il lavoro che si voleva: la persona
resta in organico e pesa solo dai mesi in cui era in forza.

**Da eseguire: la `210_invoice_unmanaged.sql`** (§281) — la colonna
`invoices.excluded_reason`: nove documenti su trentanove non sono né incassati
né da incassare, e finché non c'è quella colonna restano fra i crediti da
inseguire. Subito dopo, `supabase/FIX_INVOICES_STATE.sql` scrive lo stato vero.

**Verificato sul database il 2026-08-09, colonna per colonna**: 203, 204, 205,
206, 207, 208, 209 e 197 sono **applicate** — il registro le dava ancora per
mancanti. `pl_config.settled_from` c'è (quindi 204+205 sono passate),
`vat_settlements`, `pl_payouts`, `invoices.pdf_path`, `bank_tx_lines` ci sono, e
`clients.risk_score` è stata droppata come voleva la 197. L'unica che manca è la
**210**.

**Da eseguire**: `supabase/FIX_PAYSLIPS_FROM_LUL.sql` (§235) — i tre cedolini di
giugno trascritti dal LUL voce per voce (il seed della 182 aveva i totali giusti
e le scomposizioni no: l'imponibile previdenziale conteneva trasferte e indennità
esenti), l'F24 di luglio in scadenza il 20 agosto, e le RAL allineate ai
documenti. Senza, la pagina calcola i contributi su una base più alta del vero e
i tre dipendenti costano 6.573 €/mese invece di 5.360.

**Da eseguire, quando si vuole**: `supabase/FIX_ADS_FROM_BANK.sql` — la
pubblicità allineata al conto Vivid (Meta comincia il 25 luglio: 211,64 a
luglio, 109,12 ad agosto, zero prima). Senza, maggio porta 900 € di uscita
scoperta per una campagna mai partita e la tenuta di cassa la conta.

Ultimo commit: **`2d45e53`** (il registro delle allocazioni, §290→§307),
pushato su `origin/main` il 2026-08-20 — 78 file, +9.849/−1.226. **`main` è
allineato**, quindi su os.twobee.it c'è tutto quello che c'è qui.
Gate del repo: `npx tsc --noEmit` (ESLint non è configurato) più i
**quarantacinque** `lib/**/*.check.ts` (gli ultimi sono `allocations.check.ts` §297,
`f24.check.ts` §301, `month-intake.check.ts` §303, `stream-validation.check.ts`
§306, `ai/tools/access.check.ts`, `ai/format.check.ts` §314 e
`ai/tools/result.check.ts` §315), che si lanciano con
`npx tsx lib/<percorso>.check.ts` e devono dire «Tutti i controlli passano».
**Non lanciare `npm run build` mentre `npm run dev` gira**: condividono `.next`,
il dev server resta a servire chunk CSS sostituiti e la pagina si apre senza
stili. Se succede: ferma il dev, `rm -rf .next`, riavvia.

**Luglio 2026 è chiuso** (2026-08-09). La quadratura chiude a zero — 31.725 € di
imponibile, quote + costi + subappalti = 31.725, differenza 0,00 — e ogni riga
dice quello che dice il suo contratto. Quello che è stato **congelato con dentro**,
e che va guardato prima di fidarsi dei numeri di cassa di luglio:

- **19 spunte «dichiarate» per 31.622 €** che nessun movimento di banca dimostra
  (§226). Non sono soldi mancanti — a luglio dal conto sono entrati 28.859 € —
  sono spunte non agganciate al loro movimento.
- **2 righe sospette**: due canoni agganciati a bonifici *precedenti* al loro
  mese (uno di agosto attaccato al 17 luglio, uno di luglio al 15 maggio).
  Datarli dalla banca sposterebbe il mese di cassa: si segnalano, non si toccano.
- **Il ponte non quadra: −18.930 €** (§199). L'identità è esatta, quindi non è
  un arrotondamento: è un movimento in banca che nessuna riga giustifica, o una
  spunta su qualcosa che dal conto non è uscito. Da guardare con
  `npx tsx scripts/verify-bank.ts`.
- **L'IVA del 2º trimestre**: il tool stima 8.400 €, il modello F24 del 20/08 ne
  chiede **9.669,33**. Lo scarto (1.269 €) sta tutto sul debito: il 22% dei
  ricavi registrati fa 9.108 €, e il modello parte da più in alto. C'è
  fatturato del trimestre che il conto economico non ha.
- **2 giroconti spaiati** del 4 agosto (±550 €) e **un possibile doppione**:
  1.300 € a Gabriele Saraiello il 15 maggio, due volte.

**La `203_cash_calendar.sql` è applicata** (2026-08-08): le righe del conto
economico hanno la **data del movimento**, e da lì lo stipendio di luglio pesa
sulla cassa di agosto.

**La `204_payout_from.sql` è applicata** (2026-08-08).

Tutto il resto è già applicato. Verificato sul database il 2026-08-05,
colonna per colonna: 183→196 sono tutte applicate (`hr_people.birth_date` e
`hired_on`, `hr_incentives`, `pl_revenue_lines.risk_fund` e `pass_through`,
`revenue_stream_projects`, le tre tabelle di banca, `pl_cost_lines.partner_id`,
`clients.package` droppata). `pl_config` legge la 196: `digital_partner_pct`
**0,28** e `digital_cost_target_pct` **0**.

**Fatto finora**: il dominio economico completo (migration 168→178) — contratti
per progetto, piano dei costi con budget per area, subappalti con margine di
progetto, previsionale a sei mesi, IVA trimestrale e sezione Fiscale, stato
cliente `pending`, e la disciplina trasversale per cui **ogni valore economico è
derivato e dichiara la sua provenienza** (vedi le sezioni Economics, Tipo
cliente, Stato pagamenti).

**Committato in locale, mai arrivato in produzione** (i 52 commit di cui sopra):
- **Eliminazione clienti** singola e multipla (`deleteClients` /
  `previewClientDeletion`, caselle di selezione in `ClientiList`, conferma che
  dichiara cosa cade in cascata).
- **Cronologia rifatta** (§179): filtri sul database, statistiche esatte,
  attribuzione via `createActorClient`, ripristino che riporta indietro davvero,
  e il registro delle versioni con ciclo di 15 giorni. Migration già applicata.
- **Conservazione della cronologia** (§180): 20 giorni per riga, configurabile.
- **Budget dei costi derivato**: il tetto di un'area è la somma delle sue voci
  (non più `monthly_budget`), e il tetto del mese è il 35% del fatturato.
- **Sezione Personale** (§181): costo per risorsa, contratti italiani, TFR,
  13ª/14ª, ottimizzazioni fiscali, e la voce «Persone» del conto economico.
- **«Prepara il mese»**: una sola azione che compone contratti, piano dei costi,
  subappalti e organico, con anteprima di cosa entra prima di scrivere.
- **Agevolazioni** (§184, `lib/incentives.ts` + `lib/incentives.check.ts`):
  esoneri contributivi per persona con tetti e scadenze, rientro dei cervelli sul
  netto, maxi-deduzione e iper-ammortamento dentro la stima IRES, aliquote 2026
  aggiornate (IRPEF 33%, buono pasto 10 €, premi all'1%), tab «Agevolazioni» nel
  Personale e pannello «Agevolazioni e regimi» in Fiscale.
- **Area «Personale» in sola lettura** nel piano dei costi, con il doppio
  conteggio del costo del lavoro rimosso da «Porta nel mese» e dall'anteprima.
- **Subappalti e costi esterni** raccolti per subappaltatore (`bySupplier`),
  sezione richiudibile, fornitori aggiungibili e rinominabili in blocco.
- **Spartizione digital** (§186): sul margine dopo i subappalti, 28% a ciascun
  socio, 6% commerciale, 10% cassa, fondo rischio opzionale sopra 20.000 €, col
  commerciale letto dall'anagrafica del cliente.
- **Via i pacchetti** (187) e **un accordo, N progetti** (188): contratti
  multi-progetto con quota, e le partite di giro fuori dalle quote.
- **Banca** (189-191): due conti, import per dialetto, giroconti appaiati,
  provvista, `spendSplit`, sottoconti dei soci e le due strade per l'erogato.
- **Ponte conto economico → saldo** (§199, `lib/cash-bridge.ts`): l'identità è
  esatta, quindi un residuo diverso da zero è un movimento senza una riga che lo
  giustifichi, non un arrotondamento.
- **Un fatto, una riga** (193) e **un movimento a mano paga** (195).
- **Ripartizione maturato / incassato** (§204): stesso `computeMonth` sulle sole
  righe spuntate, così «Cassa TwoBee» si muove quando spunti «pagato».
- **Quota digital tornata al 28%** (196), che annulla la 194.
- **Rischio cliente riscritto** (§197, `lib/risk.ts` + `risk.check.ts`): motore
  puro sulle sorgenti vive, «n/d» invece di uno zero inventato, trend da due
  letture della stessa realtà, e le cinque colonne morte droppate.

**Com'è messo il database** (letto il 2026-08-05): **11 clienti** con P.IVA,
sede, SDI e commerciale · **21 progetti** dai template · **15 contratti** con 16
rate, di cui 3 multi-progetto · **5 mesi** aperti con **41 righe di ricavo** e
**89 di costo** · **47 voci** di piano · **173 movimenti** di banca · **5
persone** in organico. Nessun cliente ha più `package`.

Commerciali: Walter Giacobbe (ISF, iCura, Sartoria Condotti, Petito) · Marco
Lucci (Affinity, Seven) · Antonio Giarletta (Fatima Leo, Plus Vending) · Josè
Restaurant senza commerciale, quindi la provvigione si divide fra i soci. Walter
e Antonio **non hanno un account nel tool**: esistono solo come nome in
anagrafica, ed è il caso che §185 legge senza perdere la provvigione.

Fuori dai conti per scelta: 4 fatture ISF duplicate (14.400), GAV Sistemi (giro
di fatture, cliente interno), Gli Artigiani (stornato con nota di credito).

`npx tsx scripts/certify-cash.ts` confronta ogni spunta con l'estratto conto e
dice cosa non torna; con `--apply` scrive **solo** le date dei movimenti già
agganciati e le spunte che la banca dimostra — non toglie mai una spunta.

`npx tsx scripts/verify-invoices.ts` incrocia le tre fonti: archivio fatture
(emesse e ricevute per mese), conti BPM e Vivid (in e out per mese), e chi è
agganciato a chi. Cerca anche i **pagamenti cumulativi** — un bonifico che copre
due fatture aperte — e gli **anticipi di tasca propria**, che se non sono
registrati come movimento `manuale` per il tool non esistono (§195).

`npx tsx scripts/verify-bank.ts [mese]` passa i movimenti ai motori veri: saldo
per conto, **il ponte** (§199), certificazione delle spunte, giroconti spaiati,
movimenti senza una riga dietro, duplicati e categorie mancanti. Sola lettura.

`npx tsx scripts/verify-cash.ts <mese>` fa lo stesso con la tenuta di cassa:
gradini, esiti e registro dei compensi persona per persona.

`npx tsx scripts/verify-month.ts 2026-07-01` legge un mese dal database e lo
passa a `computeMonth`: è il controllo della catena intera col codice che gira in
pagina. Su luglio la quadratura chiude a zero — 32.225 € di imponibile, 500 € di
partite di giro, quote + costi + subappalti = 31.725 €, differenza 0,00.

**Aperto, in ordine di importanza:**

1. **Fatturazione al calendario della cassa** (§224): è l'ultima sezione che non
   legge `dueOf` — previsionale, Banca, Personale e conto economico ci passano già.
   È una lettura, non una scrittura. Nella stessa riga: il **previsionale del
   costo del lavoro** è una stima (§225, uguale a questo mese) perché il piano dei
   costi non contiene l'area Personale; farlo derivare dall'organico come fa
   `pushPayrollToMonth` toglierebbe l'unica assunzione rimasta nella tenuta di cassa.
2. **Chiudere il travaso Asana** (§215-221): il codice c'è tutto, restano da passare
   in rassegna le 146 board — e poi si toglie la sezione, che è dichiarata temporanea.
3. **Quotare i progetti che mancano**: 15 contratti su 21 progetti. Chi non ne ha
   legge «da quotare», non genera righe nel mese e non entra nella stima fiscale.
   È lavoro di inserimento, non di codice: si fa dalla scheda Economics.
4. **`promoteLineToPlan`** esiste in `app/actions/costs.ts` ma non ha un pulsante
   nell'economics del progetto: una spesa registrata a mano non si può ancora
   promuovere a ricorrente da lì.
5. **Attribuzione parziale**: `createActorClient` è adottato in `clients.ts`,
   `projects.ts`, `tasks.ts`, `ad-hoc-tasks.ts`, `create-project.ts` e
   `delete-client.ts`. Gli altri percorsi che scrivono su tabelle loggate (deals,
   tickets, objectives) continuano a registrare «Sistema» finché non passano
   anche loro.



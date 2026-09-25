# Area commerciale

## Le fasi sono dati, e ognuna dichiara il suo ruolo — §424, §425

Notion si spegne. Cade la regola che teneva dodici fasi trascritte lettera per
lettera (§367): il percorso si accorcia a **otto stati** e l'elenco vive in
`sales_stages` (migration 258), non più in `lib/sales-stages.ts`.

Il **ruolo** — `nuovo`, `in_corso`, `vinto`, `perso`, `sospeso` — è la parte che
rende possibile tutto il resto. Con le fasi configurabili il codice non può più
nominarle: `active_client` stava dentro la conversione a cliente, tre controlli
di igiene e il tasso di conversione, e il giorno in cui qualcuno la rinomina
quei confronti smettono di combaciare **senza dare errore** — un `false` non è
un'eccezione. Adesso si chiede «la fase che vince». Rinominarla non rompe
niente; cambiarle ruolo sì, ed è giusto che si veda.

**Due cose sono uscite dalla pipeline e sono diventate campi della riga.** La
**qualifica** (in target / non in target / da valutare) è un giudizio su chi è
il lead, non un punto del percorso: un lead in target può stare ovunque. I
**tentativi** sono un contatore — «chiamata senza risposta» come fase fa
rimbalzare avanti e indietro una riga e fa perdere dov'era davvero. Che fossero
la cosa giusta si vede sui dati: due dei sette STATUS del foglio
(«Qualificato», «Non in target») non erano fasi, e finora venivano schiacciati
dentro la colonna delle fasi.

`lib/sales-stages.ts` non contiene più l'elenco: contiene le **regole** che
valgono su qualunque elenco, più il seme da cui parte il database. Le funzioni
prendono le fasi come parametro — è l'unico modo perché restino pure adesso che
l'elenco vero cambia mentre il tool gira. Il gate verifica gli invarianti, non i
nomi: una sola porta d'ingresso, una sola vinta, almeno una persa, due fasi
vicine mai dello stesso colore. **È la stessa funzione** (`problemiFasi`) che
l'editor chiama prima di salvare e che il server rifà per conto suo.

L'elenco scende dal server una volta per richiesta (`lib/sales-fasi.ts`) e sta
in un contesto React (`FasiContext`): passarlo di proprietà in proprietà per sei
livelli avrebbe messo la stessa cosa in trenta firme, dove prima o poi una si
dimentica. Se la lettura fallisce si torna al seme — una pagina senza fasi
mostra righe senza stato, che somiglia a un archivio vuoto.

**L'editor** sta in `/impostazioni/commerciale`, admin e super admin
(`requireSalesConfig`). Mostra quante trattative stanno su ogni fase, perché
spostare qualcosa senza sapere quanto pesa è il modo di scoprirlo dopo. Una fase
con delle righe **non si elimina**: si ritira — resta leggibile sulle righe
vecchie e sparisce dalle scelte. Rinominare la chiave è permesso perché la
chiave esterna è `ON UPDATE CASCADE` e le righe seguono.

Quello che resta da fare dell'area commerciale è nel piano in nove fasi: elenco,
scheda, filtri, numeri, import da file, foglio bidirezionale, configurazione
estesa, campi personalizzati.

## L'elenco si legge — §426

Quattro cose, e tutte e quattro nascono dalla stessa osservazione: **nell'elenco
si cerca chi chiamare adesso**, e il resto è rumore che si scorre.

**I persi stanno in fondo, in un blocco chiuso.** Sono un terzo dell'archivio —
dodici righe su trentasei — e stavano in mezzo a quelli vivi: chi scorre li
legge, capisce che non servono, e ricomincia. Non si nascondono però, perché una
riga che sparisce fa credere di averla persa e riprendere in mano un perso è un
lavoro vero. La regola guarda il **ruolo** e non la chiave (`lib/sales-elenco.ts`),
così vale anche per la seconda fase persa che qualcuno creerà domani. Il vinto
resta in elenco: è un risultato, e vederlo fa piacere.

**La nota si legge senza aprire niente.** È il campo che qualcuno ha scritto a
mano — «Call venerdì 7 agosto alle ore 15.00» — e tenerlo dietro un clic voleva
dire aprire trenta schede per ritrovare l'unica che diceva qualcosa. Una riga
sola, appiattita e tagliata **su una parola**: le note del foglio hanno gli a
capo dentro la cella e messe com'è spaccherebbero la riga in cinque.

**Il chip della fase è un bottone, ovunque sia** — elenco, cella larga, scheda.
Prima si poteva cambiare fase in due posti e altrove il chip era un'etichetta
morta: il gesto è così ovvio che la gente lo fa comunque, e non succede niente
per tre volte prima di smettere di provarci. Nell'elenco il chip sta **fuori**
dal bottone della riga — un `<button>` dentro un `<button>` non è valido, e
cliccarlo aprirebbe la scheda invece di cambiare fase.

**Il menu non è un `select` nativo** (`MenuFase`), per tre ragioni: nel menu di
sistema il colore non si vede, e il colore è metà dell'informazione di una fase;
il ruolo non si vede, e «vinta», «persa» e «sospesa» in un elenco piatto
sembrano tre voci uguali; su iOS diventa una ruota a tutto schermo. Sta in un
**portale**, e non è un vezzo: il contenitore dell'elenco ha `overflow-hidden`
per arrotondare gli angoli, e un menu assoluto lì dentro verrebbe tagliato sulle
ultime righe. Si chiude anche allo scroll, perché un menu ancorato a un
rettangolo calcolato una volta resterebbe fermo mentre la riga scivola via.

Dall'elenco la fase si salva **senza conferma**, al contrario del trascinamento
in bacheca (§379): la conferma lì serve perché un trascinamento mancato sposta
una scheda senza che chi l'ha fatto se ne accorga, mentre un clic sul menu è un
gesto dichiarato.

Il pannello **Controllo** resta in sola lettura, ed è una scelta vecchia che
regge (§385): lì i rilievi portano alle righe e la decisione si prende sulla
riga, non dentro l'elenco dei problemi.

## La scheda risponde prima di mostrare i campi — §428

La scheda mostrava ventitré campi tutti uguali in cinque riquadri, ordinati per
argomento. Ordinare per argomento è giusto per **cercare** un dato ed è inutile
per **lavorare**: chi apre una scheda non sta cercando un campo, sta decidendo
cosa fare adesso. E cosa serve adesso dipende da dove sta la trattativa — a un
lead appena arrivato si chiede un recapito, a uno perso si chiede perché.

In cima adesso ci sono tre cose, tutte da funzioni pure in `lib/sales-scheda.ts`
con il loro gate:

- **Prossima azione**, una sola. Un elenco di sei cose da fare è un elenco che
  non si fa. L'ordine è quello del danno, non quello della schermata: senza
  recapito il lead non si lavora affatto, e dirgli «qualificalo» prima sarebbe
  un consiglio che non si può seguire.
- **Cosa manca adesso**: i campi vuoti che contano *in questa fase*, già
  compilabili. Non tutti i vuoti — quasi ogni riga ne ha dieci, e dieci cose
  mancanti sono un elenco che si ignora. Su una chiusa si chiede solo il motivo:
  riempire un perso di campi obbligatori è il modo di far smettere di segnarli.
- **Lo sappiamo già**: quello che sta nella provenienza Meta e nessuno ha
  ricopiato. Si **propone**, non si scrive — quei dati li ha dichiarati chi ha
  compilato il modulo e non sono verificati, e un campo che si riempie da solo
  non lo ricontrolla nessuno.

Tutto ragiona sul **ruolo** della fase, mai sulla chiave: le fasi si rinominano
dalle impostazioni (§424).

**La scheda segue lo scorrimento** (`sticky`, non `fixed`): si apriva una riga
in cima e per rivedere la scheda bisognava risalire. Resta dentro la sua
colonna, quindi non copre l'elenco, e lo scorrimento interno è suo — è
l'eccezione dichiarata a §195, perché un pannello laterale non è il corpo della
pagina.

**Chiuso un buco della Fase 1**: `qualifica`, `tentativi` e `motivo_perso`
esistevano nel database dalla 258 e non erano visibili da nessuna parte. Adesso
sono colonne vere. Il motivo è un menu che legge `sales_motivi_perso`: un campo
libero lì diventa quaranta grafie di «prezzo» e rende inservibile il grafico dei
persi prima ancora di disegnarlo.

## Com'era prima: il CRM di Notion, qui dentro

## Foglio attivo e follow-up nel calendario — 21 settembre 2026

Branch di sviluppo: `feat/commerciale-calendar`, partito da `main` **eaeb732**.
Integrato in `main` il 21 settembre, sulla base aggiornata **7d3093a**, per
la distribuzione tramite Coolify. Il portale cliente resta sul proprio branch.

### Foglio Google: attivo in produzione

Su Coolify, applicazione `twobee-crm` / `os.twobee.it`, sono configurate in
runtime `SALES_SHEET_CSV_URL` e `SALES_SYNC_SECRET`. Il foglio usa la scheda
`gid=0` del documento `1JO5tPW_47VtyNsrDdbD7xy9V22T3dNa5UlqPVBhM8dM`.
Task **`sales-sheet-daily`**, `0 3 * * *` nel fuso dello scheduler Coolify,
timeout 150 secondi:

```sh
sh -c 'wget -qO- -T 120 --header="Authorization: Bearer $SALES_SYNC_SECRET" --post-data= http://127.0.0.1:3000/api/sales/sync'
```

Riavvio con ricostruzione completato sullo stesso commit **eaeb732**, senza
integrare branch di sviluppo. Verifica reale dell'endpoint:

- primo giro: **31 letti, 3 nuovi, 28 già presenti, 3 prove scartate**;
- secondo giro: **31 letti, 0 nuovi, 31 già presenti, 3 prove scartate**.

La pianificazione è stata riletta e risulta abilitata; la prima esecuzione
notturna non è ancora avvenuta. La prova preventiva è ripetibile senza
database e senza mostrare recapiti:

```sh
npx tsx scripts/check-sales-sheet.ts 'https://docs.google.com/spreadsheets/d/1JO5tPW_47VtyNsrDdbD7xy9V22T3dNa5UlqPVBhM8dM/export?format=csv&gid=0'
```

Nel nuovo codice la sincronizzazione verifica le intestazioni prima di
accedere al database e conta record CSV, non gli a capo contenuti nelle note.
Il download ha un timeout di 30 secondi. La colonna `Follow up` continua a
essere testo nelle note: non genera appuntamenti e non sovrascrive lead già
importati.

### Follow-up: dalla scheda del lead al proprio Google Calendar

`SalesFollowUps`, dentro `CrmScheda`, permette di pianificare, rivedere,
modificare e annullare i propri appuntamenti. Data e ora nel fuso del browser,
durata iniziale 30 minuti, titolo precompilato. **Invita il contatto** è
disattivato inizialmente: attivandolo l'indirizzo viene riletto dal lead sul
server. Le note interne non vengono copiate in Google né nell'invito.

Il calendario è **`primary` dell'utente autenticato**, mai scelto da un ID
ricevuto dal browser. La route `/api/sales/follow-up` verifica grant commerciale,
profilo attivo tramite il guard esistente, RLS del lead e account TwoBee.
Solo dopo apre le credenziali Google del chiamante. Le scritture accettano
JSON; la lettura del calendario riguarda solo i follow-up del lead richiesto.

Il collegamento vive nelle **proprietà private dell'evento Google**
(`twobeeDeal`, `twobeeActor`), non nella descrizione visibile agli invitati.
Nessuna nuova migration. Il mirror `calendar_events` esistente viene aggiornato
dopo la scrittura Google; un errore del mirror è dichiarato senza far ripetere
la creazione già riuscita. L'elenco legge Google e riflette le modifiche e le
cancellazioni esterne quando lo si aggiorna. Il calendario generale vede gli
stessi eventi attraverso l'integrazione esistente.

- ID evento deterministico per utente/lead/invio: retry e doppio clic non
  creano altri appuntamenti e non reinviano l'invito.
- Un invio riutilizzato con dati diversi è respinto; il modulo resta compilato
  in caso di errore. Dopo una risposta incerta, si può aggiornare l'elenco.
- Modifiche e annullamenti confrontano l'ETag Google, anche nella richiesta
  HTTP: una versione vecchia non sovrascrive l'appuntamento aggiornato altrove.
- Gli altri partecipanti aggiunti su Google sono preservati. Rimuovere il
  contatto invitato invia l'annullamento; gli aggiornamenti notificano gli
  eventuali invitati. Un contatto rimosso su Google non resta indicato come invitato.
- Eventi trasformati su Google in ricorrenze o giornate intere si gestiscono
  da Google; nessuna cancellazione involontaria dell'intera serie dal lead.
- Ogni commerciale vede qui i **propri** follow-up. Eliminare il lead non
  cancella implicitamente appuntamenti o inviti Google già inviati.

OAuth ora usa `state` casuale in cookie HttpOnly/SameSite, vincolato alla
sessione che ha iniziato il collegamento, e ritorni nell'elenco chiuso delle
pagine autorizzate. Dal Commerciale si torna al Commerciale. Errori di consenso
e scambio codice sono gestiti con un redirect, senza esporre messaggi del provider.

### Blocco di attivazione e verifiche

**Il nuovo codice è integrato in main per la distribuzione.** Su Coolify mancano
`GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Esiste un account con refresh token
nel database, ma questo non sostituisce le credenziali dell'applicazione OAuth:
occorre recuperare il client Google usato, oppure creare un client web e
ricollegare gli account. Abilitare Google Calendar API e registrare i redirect:

- `https://os.twobee.it/api/google/callback`
- `http://localhost:3000/api/google/callback` per lo sviluppo locale.

Le due variabili sono documentate in `.env.local.example`. Dopo configurazione
e deploy di main va eseguito il consenso del titolare e un collaudo
reale di creazione, modifica, invito e annullamento. Nessun appuntamento reale
o invito è stato creato durante questo intervento.

Verificati: TypeScript; **76 check di dominio** (il check preesistente
`calendario-lavorativo` assume `TZ=Europe/Rome` e fallisce su UTC: rieseguito con
quel fuso, passa); route con sessione/RLS/Google simulati; OAuth con state
alterato, sessione diversa e callback valido; retry dopo timeout Google,
isolamento lead/utente, inviti e revisioni. Browser sul componente reale con API
simulate: creazione, conservazione modulo dopo errore, stesso ID al retry,
modifica/invito, annullamento, account scollegato, conversione Europe/Rome→UTC,
390/1440 px nei due temi, contrasto AA misurato sul DOM, focus tastiera.

```sh
npx tsx scripts/check-sales-follow-up-routes.ts
npx tsx scripts/check-google-oauth.ts
PLAYWRIGHT_BROWSERS_PATH=/tmp/opencode/browsers NODE_PATH=/tmp/opencode/node_modules node scripts/check-sales-follow-up-browser.mjs
```

Il test browser richiede Playwright ed esbuild installati in `/tmp/opencode`,
con Chromium; non cambia le dipendenze del prodotto e non usa credenziali reali.

Stato al 21 settembre 2026: **riscritta da zero (§367–§371)**. Migration 235,
236 e 239 applicate. Tre viste: elenco, bacheca (§379), numeri. Il modulo precedente (§223–§225) è stato sostituito: descriveva
pipeline, esiti e handoff, ma erano quattrocentosessanta righe di codice con
due componenti da sedici, e una riga sola nel database.

## Perché è fatta così

Il commerciale usa un CRM su Notion da prima che questo tool esistesse:
cinquantacinque aziende, ventiquattro colonne, dodici fasi. Finché i due
elenchi non coincidono, il tool non sostituisce Notion — **lo affianca**, e
affiancare vuol dire che nessuno dei due è vero. Quindi la struttura è
replicata lettera per lettera, comprese le stranezze.

## Le dodici fasi — `lib/sales-stages.ts`

Etichette **trascritte, non tradotte**: «Strategia + Preventivo» non diventa
«Strategia e Preventivo», «Evento OSM» resta «Evento OSM». Sono i nomi che il
commerciale legge da mesi, e normalizzarli «per chiarezza» significa due
elenchi da tenere allineati a mano.

I tre gruppi sono quelli di Notion **anche dove sorprendono**: `Lost` e
`Inactive Client` stanno in «To-do» e non in «Complete». Per una pipeline è
strano — sono uscite, non cose da fare — ma è così che il gruppo ragiona: un
perso è una riga da riprendere in mano. Restano comunque fuori da
`FASI_APERTE`, o il conteggio delle trattative vive conterebbe i persi.

**Sui colori c'è un limite dichiarato**: Notion ne usa dodici distinti, il
design system ne ha sette per gli stati, e inventare degli hex romperebbe il
tema chiaro. Quattro coppie condividono la tinta, scelte fra fasi lontane nel
percorso; il gate verifica che due fasi **adiacenti** non abbiano mai lo stesso
colore.

## Le tre viste, e perché la bacheca è arrivata dopo — §379

`CrmTable` tiene lo stato, `CrmBacheca` disegna le colonne. Tutte e tre le
viste leggono lo **stesso** `viste` — già cercato, filtrato e ordinato —
perché due viste che mostrano insiemi diversi sotto gli stessi filtri sono
due viste di cui una mente.

L'elenco resta quella di casa: risponde a «chi chiamo adesso», che è la
domanda per cui si apre la pagina. La bacheca risponde a un'altra — «com'è
messa la pipeline, dove si è accumulato» — e per quella dodici colonne
valgono più di ventinove righe. Per questo si **aggiunge** e non sostituisce:
§371 diceva «una tabella e non una bacheca» e aveva ragione sulla domanda di
allora, non su tutte.

**Dodici colonne scorrono, non si comprimono**, come le colonne della
tabella di prima. Chi vuole restringere usa il filtro dei gruppi, che sulla
bacheca **nasconde** le colonne invece di svuotarle: una colonna vuota che
non può riempirsi è rumore. Lo scroll verticale resta della pagina — una
colonna con lo scroll suo dentro la pagina che scorre è lo scroll dentro lo
scroll.

**Il trascinamento è quello nativo**, quattro eventi e nessuna libreria. Il
prezzo è dichiarato: col dito non funziona, perché il trascinamento HTML5
sul touch non esiste. Per questo la fase resta modificabile dalla scheda, che
è la strada di chi lavora dal telefono.

**Ogni spostamento chiede conferma**, e qui il prodotto fa il contrario di
quello che fa altrove. Una modifica non distruttiva di solito si salva e
basta; il trascinamento però è l'unico gesto che cambia un dato **passando
sopra a qualcosa**. Un clic mancato non fa niente, un trascinamento mancato
sposta una trattativa — e chi lo ha fatto spesso non se ne accorge, perché la
scheda è sparita da dove la stava guardando. La conferma dice da dove a dove,
che è l'unica cosa che rende l'errore evidente prima invece che dopo. Se il
salvataggio fallisce la conferma **resta aperta**: chiuderla lascerebbe la
scheda tornata al suo posto senza spiegazione.

`Active Client` ha una riga in più: spostarci una scheda **non crea il
cliente** in anagrafica — per quello c'è «Lead convertito» (§368) — e senza
dirlo si otterrebbe una pipeline che dichiara clienti che in anagrafica non
esistono.

## La query è un elenco, e sta accanto alle colonne — §378

`CAMPI_RIGA` in `lib/sales-table.ts`: chiavi, colonne mostrate, colonne
lette. `SalesPage` lo usa e basta.

Prima la `select` si costruiva da `COLONNE`, e ci stava un buco grosso:
`lead_origine` non è una colonna — è il `jsonb` con campagna, adset,
annuncio, piattaforma e le risposte del modulo, di sola lettura — quindi non
era in `COLONNE` e **non veniva chiesta**. La pagina però la legge in quattro
punti: la riga di contorno nell'elenco, il riquadro «Da dove arriva», i
quattro filtri di provenienza e il raggruppamento per campagna nei numeri.
Tutti e quattro mostravano il vuoto, e nessuno dei quattro si lamentava:
leggere un campo che non si è chiesto restituisce `undefined`, non un errore.
Un riquadro che non compare si scambia per «questo lead non ha provenienza»,
e dei filtri con zero opzioni per «non ci sono dati».

Il gate sta in `lib/sales-table.check.ts` e controlla la regola, non il caso:
ogni colonna mostrata, ogni filtro e ogni ordinamento devono leggere da un
campo che sta in `CAMPI_RIGA` — e `owners` non ci sta, perché è la tabella
`deal_owners` (236) e chiederla farebbe fallire la query intera.

## Le colonne — `lib/sales-table.ts`

Ventuno di Notion più due nostre (`Status dal foglio`, `Added`). Tre colonne di
Notion **non arrivano** e si dichiara quali: `Contacted button` è un pulsante,
`Interactions` un rollup calcolato, `Deals` una relazione interna. Non sono
dati: sono modi in cui Notion mostra altri dati.

`Owner` e `Account Owner` restano **due colonne diverse** o si confondono per
sempre: il primo è il titolare dell'azienda cliente (ventinove nomi di gente
senza account qui) e resta testo; il secondo siete voi, è multi-persona e vive
in `deal_owners` — schiacciarlo su `assigned_to` avrebbe buttato via il secondo
nome senza dirlo.

`Tags` e `Services` sono `text[]`, non testo con le virgole: «Beauty,
Marketing» come stringa non si filtra e non si conta.

**`CAMPI_SCRIVIBILI` è la barriera, non la grafica** (§329). Un file
`'use server'` esporta un endpoint e chi ha il codice davanti conosce i nomi
delle colonne di `deals`: senza quell'elenco si potrebbe scrivere su
`client_id`, `revision` o `sheet_row_id` mandando il campo giusto nel corpo
della richiesta. `sheet_status` si legge e basta — è l'unico riferimento a cosa
c'era scritto sul foglio.

`validaCella` **respinge invece di azzerare**: «tremila» in un campo numerico
diventerebbe `null` in silenzio, e un campo che si svuota da solo non lo
ricontrolla nessuno.

## I lead dal foglio — `lib/sales-import.ts`, `lib/sales-sync.ts`

Il foglio non è un foglio: è l'export di **Meta Lead Ads**. Sopra, due colonne
scritte a mano — `STATUS` e `Note` — che valgono più di tutte le altre messe
insieme, perché sono le uniche che qualcuno ha guardato.

**Il foglio crea, il tool governa.** Il giro orario inserisce e basta: nessun
UPDATE, nessun DELETE, e una riga già vista non si tocca più. È l'unico modo
perché l'editing in cella non sia una promessa che il giro dopo rompe — e vale
anche quando il foglio ha ragione: se qualcuno corregge un telefono là, va
corretto anche qui, a mano.

Tre cose che solo i dati veri hanno insegnato, e il motivo per cui il gate gira
sul foglio scaricato (`lib/fixtures/lead-foglio.csv`) invece che su un CSV
inventato:

- tre righe su trentuno sono **prove di Meta**, riconosciute da `lead_status`
  *e* dal contenuto, perché capita che lo stato sia corretto a mano e il resto no;
- i telefoni arrivano con `p:` davanti e gli id con `l:`;
- gli indirizzi hanno virgole dentro le celle e i follow-up hanno a capo:
  uno `split(',')` avrebbe messo il telefono al posto della mail senza che si veda.

Lo `STATUS` del foglio ha sette valori suoi e si traduce **solo all'ingresso**.
Senza, ventotto lead entrerebbero tutti come «New Lead» e il lavoro già fatto
sarebbe buttato: la distribuzione vera è su sette fasi. **«Chiuso» vuol dire
perso**, e l'ha deciso chi il foglio lo compila.

Configurazione: `SALES_SHEET_CSV_URL` (l'indirizzo **CSV** del foglio
condiviso in lettura: `.../d/<ID>/export?format=csv&gid=<GID>`, non il link
che si copia dalla barra), `SALES_SYNC_SECRET`, e un task pianificato
`0 3 * * *` su `POST /api/sales/sync`. Entrambe sono in
`.env.local.example`. Seconda porta per gli admin, come le ricorrenze: chi
aggiunge una riga al foglio deve poterla vedere adesso invece di scoprire
all'ora dopo che la colonna si chiamava in un altro modo.

## Eliminare un lead — §378

`eliminaLead` in `app/actions/sales.ts`, dalla scheda (uno) o dalla barra
della selezione (fino a duecento). Admin e manager, la stessa coppia
dell'import CSV: chi può riempire l'elenco può ripulirlo, e chi vede solo i
propri lead no — è l'unica operazione qui dentro che nessun'altra rimette a
posto.

**Prima la lapide, poi la cancellazione**, e l'ordine è tutto il punto.
`sheet_row_id` è la chiave con cui il giro decide se inserire (§370):
cancellata la riga quella chiave non esiste più in `deals`, quindi la notte
dopo il lead **rientra come nuovo**. La tabella `sales_sheet_ignored`
(migration 239) tiene l'id del foglio, il nome, chi ha eliminato e quando —
è l'unica cosa che distingue «non l'abbiamo mai vista» da «l'abbiamo tolta
apposta». Il nome si conserva perché `1036…` non risponde a «perché quel
lead non entra».

Se la cancellazione fallisce dopo la lapide resta una lapide su una riga
viva, che non fa danno: il giro la trova comunque in `deals`. L'ordine
opposto riporta indietro quello che qualcuno ha tolto, ed è il motivo per cui
non si scrive così.

**Il foglio non si tocca**: la riga là resta, viene solo segnata qui. E
**il cliente non si tocca**: eliminare un lead già convertito toglie la riga
di CRM, non l'anagrafica — `client_id` è un riferimento, non un possesso.
Sparisce invece la storia della trattativa, per cascata: `deal_owners`,
`deal_activities`, `sales_handoffs`.

Il riepilogo della sincronizzazione ha un quarto numero, `ignorati`, e
compare solo quando è diverso da zero: uno «0 eliminati» fisso in coda
insegna a non leggere la riga.

## Il controllo — §385, `lib/sales-igiene.ts`

Quarta vista accanto a elenco, bacheca e numeri. `somiglianze` (§377) guarda
**un lead alla volta, quando entra**: è la barriera giusta e non vede niente
di quello che è già dentro. I doppioni entrano lo stesso da tre porte —
l'import CSV, il «aggiungi comunque» premuto per fretta, e il giro dal
foglio, che riconosce una riga dal suo `sheet_row_id` e non dal telefono: la
stessa azienda che ricompila il modulo fa due righe, legittime per il foglio
e una sola per chi chiama. Qui si guarda la tabella intera.

**I doppioni si trovano a gruppi, non a coppie.** Tre righe della stessa
azienda fanno tre coppie, e mostrarle come tre problemi porta a risolverne
una e credere di aver finito. Si uniscono per contagio con una union-find: se
A ha il telefono di B e B la mail di C, sono la stessa storia anche se A e C
non hanno niente in comune. Il gruppo dice **su cosa** si somigliano, e
distingue le chiavi che identificano una persona (telefono, email, riga del
foglio) da quella che identifica un nome — «Rossi» e «Rossi» possono essere
due fratelli in due capannoni.

Gli altri controlli: aperti **senza recapito** (né telefono né mail: non è un
lead, è un nome), `Active Client` **senza anagrafica** (la pipeline
dichiarerebbe clienti che non esistono, §379), collegati a un cliente ma
**ancora in lavorazione** (uno dei due mente e il conto degli aperti ci
crede), **fase sconosciuta** (la riga non si filtra e non si conta, ma è in
tabella) e **fermi** da più di 45 giorni.

**Niente si corregge da qui**, e non è pigrizia: unire due lead non si disfa,
e solo chi guarda sa se sono la stessa azienda. I rilievi portano alle righe
— si aprono con un clic — e la decisione resta lì.

Due cose che tengono il pannello utile invece che rumoroso, e che il gate
prova al contrario:

- **Tace quando non c'è niente.** Un pannello che mostra sempre qualcosa
  smette di essere letto dopo due giorni.
- **I recapiti vuoti non sono una chiave.** Senza questo, tutte le righe
  senza telefono diventerebbero un unico doppione gigante — il modo più
  veloce di rendere inutile il controllo. Stessa cosa per un telefono di tre
  cifre, una mail malformata o un nome di due lettere.

Il numero sul bottone si conta su **tutte** le righe, non su quelle filtrate:
un controllo che sparisce quando cerchi altro fa credere di averlo risolto.
E conta le **righe** toccate, non i rilievi — una riga che sbaglia tre cose è
un problema, e dire «tre» farebbe sembrare l'archivio peggio di com'è.

Alla prima passata sui dati veri: 34 righe, **3 doppioni certi**
(Pubbliservice, Scuppoz Liquori, Gruppo Bonifacio — tutti con telefono,
email e nome coincidenti) e 11 trattative ferme.

### §386 — affiancate, e con la riga da tenere già indicata

Trovare il doppione era metà del lavoro. L'altra metà è la domanda che si fa
subito dopo, con le due righe davanti: **quale sovrascrive quale**. A occhio
si sceglie quella in cima, e si scopre dopo che sull'altra c'erano le note
della telefonata.

Le righe si mostrano in parallelo, **solo sui campi in cui dicono cose
diverse** — affiancarne ventitré uguali nasconde le tre che contano — e la
colonna consigliata è marcata. L'ordine delle regole è quello del danno:

1. **Chi è collegato a un cliente vince sempre.** Eliminare quella riga
   romperebbe il collegamento con l'anagrafica, che è l'unica cosa qui
   dentro che non si ricostruisce guardando i campi.
2. **Poi chi è più avanti nel percorso**: una proposta inviata porta un
   lavoro che una riga appena arrivata non ha. Il rango non è l'indice in
   `FASI` — quell'ordine è la colonna di Notion, dove `lost` sta in cima
   (§367), e ordinare per indice direbbe che un lead nuovo è più indietro di
   un perso.
3. **Poi chi ha più campi pieni**, che è la domanda alla lettera.
4. A parità, **la più vecchia**: la storia più lunga.

**Sotto il suggerimento c'è l'elenco di cosa ricopiare prima di eliminare**,
cioè i campi che l'altra ha e la scelta no. È la parte che rende sicuro
l'accorpamento: senza, «tieni questa» è un consiglio che fa perdere dei dati
e se ne accorge qualcuno fra un mese. Ed è il motivo per cui la regola 1 non
basta da sola — una riga collegata al cliente può essere anche la più
spoglia.

Sul caso vero: i tre doppioni del 21 settembre venivano tutti dall'**import
CSV delle 07:41**, sopra righe arrivate da Meta Ads il giorno prima. Il
confronto tiene la riga del foglio — ha l'ultimo contatto e la provenienza —
e la copia da CSV non aveva niente in più da salvare.

### §387 — e unirle, dallo stesso pannello

`unisciLead(tieniId, eliminaIds)`. La riga scelta sopravvive, le altre
spariscono, e in mezzo succedono quattro cose:

- **I campi vuoti si riempiono** da quelli che le altre hanno pieni. Niente
  di già scritto viene sovrascritto, mai: è la regola che rende l'unione
  incapace di far perdere quello che si è deciso di tenere. Chi vuole il
  valore dell'altra su un campo pieno lo cambia a mano, guardandolo.
- **L'elenco dei campi lo ricalcola il server.** Il pannello mostra la stessa
  cosa, ma un file `'use server'` esporta un endpoint (§329): accettare una
  mappa da chi chiama vorrebbe dire lasciar scrivere su `client_id` o
  `revision` passando dal nome giusto. Si riparte dalle righe e si filtra su
  `CAMPI_SCRIVIBILI` — `Added` e «Status dal foglio» restano quelli della
  riga che sopravvive, perché sono la sua storia e non un dato da fondere.
- **La storia si sposta**: owner, attività, comandi, preventivi e scheda di
  passaggio alla delivery passano alla riga tenuta. Senza, unire sarebbe un
  modo elegante di cancellare il lavoro di qualcuno. `deal_owners` ha la
  coppia come chiave, quindi gli owner in comune si tolgono prima o lo
  spostamento fallisce; `sales_handoffs` ha una scheda per trattativa,
  quindi si sposta solo se la tenuta non ce l'ha.
- **La riga del foglio si eredita quando si può** (§378). Se la tenuta non ne
  ha una, la prende: il giro notturno continua a riconoscerla come già
  importata. Se ce l'ha già, gli id delle altre si **murano** — o alle tre
  del mattino il doppione appena unito tornerebbe dentro, che è il modo più
  sicuro di far smettere di usare la funzione.

**Il suggerimento resta un suggerimento**: dalla testata si sceglie l'altra
colonna, e l'elenco di quello che passa si ricalcola. La conferma dice tutto
quello che succede, **compreso quello che non si vede** — la storia che si
sposta e la riga del foglio — perché unire non si disfa.

## «Lead convertito» — §368

La CTA **non crea il cliente**: apre `NewClientModal`, quello vero,
precompilato con azienda, referente, telefono e mail. Duplicarne qui una
versione ridotta avrebbe prodotto due modi di creare un cliente, cioè il modo
di ottenerne due con lo stesso nome scritto in due modi (§326). Sono valori
iniziali e non un blocco: chi converte li corregge, ed è spesso il momento in
cui si scopre che la ragione sociale vera è un'altra. La sezione «Referenti» si
apre da sola quando arriva compilata — un dato precompilato dentro un pannello
chiuso è un dato che nessuno rilegge.

`collegaLeadACliente` chiude il cerchio dopo che il cliente esiste: lega la
riga, la porta in `Active Client`, e **non tocca i numeri**. Una conversione non
crea contratti, rate, MRR o fatture: quelli nascono in Economics dal primo
contratto venduto.

## Chi lavora i lead — §429

La concessione `can_view_deals` aveva perso la sua schermata con il modulo
vecchio: `setSalesPermission` esisteva, protetta, ma nessuno la chiamava, e
l'area la vedevano solo gli admin. Adesso sta in `/impostazioni/commerciale`,
sotto le fasi: stessa pagina, stesso pubblico. Elenca le persone attive del
workspace — le stesse che l'azione accetta — con un interruttore ciascuna, e
dice **cosa vede** chi è abilitato: un manager tutte le trattative, gli altri
solo le proprie (`salesAccess`). «Abilitato» senza dire a cosa fa credere a un
junior di avere davanti la pipeline intera.

L'azione adesso chiede `requireSalesConfig()`, non più `access === 'admin'`:
aprire l'area a qualcuno è configurarla, e la pagina che la chiama è già
chiusa da quel gate. Due porte diverse sulla stessa schermata vorrebbero dire
che un founder vede un bottone che il server gli rifiuta, o il contrario.

## Chi vede solo i suoi lead li vede davvero solo lui — §430

Con §429 il permesso si poteva dare anche a un senior o a un junior, e il
perimetro «solo i propri» (`salesAccess` → `owner`) non era scritto da nessuna
parte fuori dalla RLS. La pagina legge col service role, quindi un senior
abilitato avrebbe visto l'intera pipeline, e `salvaCellaDeal`,
`collegaLeadACliente` e `impostaOwnerDeal` accettavano qualunque id. In
produzione non è successo: le quattro concessioni erano tutte a manager.

- **`requireDealAccess(dealId)`** (`lib/sales-guard.ts`) è la porta di ogni
  azione su una trattativa: `requireSalesAccess` più «questa riga è tua».
  «Tua» vuol dire Account Owner (`deal_owners`) **o** `assigned_to`, quello
  che legge la RLS — `leadDi()` le guarda tutte e due.
- **`SalesPage` taglia sul server**: le righe degli altri non arrivano al
  browser.
- **Gli owner li assegnano admin e manager**, e solo a chi l'area la vede
  (admin o `can_view_deals`, riletto nell'azione): un lead dato a chi non può
  aprirlo è un lead perso.
- **Chi crea un lead vedendo solo i suoi ne diventa owner**, o non lo
  ritroverebbe.

**Gli owner si vedono e si scelgono.** `owners` non è una colonna di `deals`
e la pagina non lo chiedeva: la cella nella scheda esisteva e restava vuota
sempre. Ora `SalesPage` lo legge da `deal_owners`, e nella scheda è un
selettore di persone. Chi non è più assegnabile resta scritto finché qualcuno
non lo toglie.

**Due filtri in più**: Account Owner — con la voce **«Nessuno»**, in fondo,
per trovare i lead che non segue nessuno — e Qualifica, che dalla 258 era un
campo senza filtro. `Filtrabile.vuoto` è il modo generale di dare un bottone
alle righe senza dato; il gate di `sales-table` dichiara `owners` come
l'unica eccezione a «ogni filtro legge da una colonna chiesta», con il posto
da cui arriva.

## I numeri leggono quello che legge l'elenco — §431

«Numeri» contava **tutte** le righe mentre l'elenco e la bacheca mostravano
quelle cercate e filtrate: la regola di §379, due viste con insiemi diversi
sotto gli stessi filtri, valeva per due viste su tre. Adesso la ricerca e i
filtri si applicano anche ai numeri, e una riga in testa dice su quanti lead si
sta contando. Il **gruppo di fasi** resta fuori, e con lui l'ordinamento: un
tasso sui soli «aperti» è zero per costruzione.

**Il periodo si conta dall'arrivo** (`nelPeriodo`, `PERIODI`): 30 giorni, 3
mesi, un anno, da sempre. Non dalla chiusura, che terrebbe solo chi ha già
finito e farebbe sembrare il tasso migliore di com'è. Una riga senza data
d'arrivo sta fuori da ogni periodo e dentro «da sempre».

**Due tabelle in più**: per Account Owner — un lead seguito in due conta per
tutti e due, e la tabella lo dice — e per qualifica. `perDimensione` accetta
ora una chiave con più valori.

**Il valore della pipeline non c'è, ed è voluto.** Sarebbe un numero
economico scritto a mano su un lead, prima di qualunque contratto: è
l'invariante «nessun valore economico si digita». Il valore arriva quando
arriva il contratto, in Economics.

## Import da file: Excel, il titolo sopra, la mappa si corregge — §433

L'import di §377 leggeva solo CSV, e chi passa una lista di lead la passa in
Excel: «salva come CSV» è il passaggio in cui Excel su Mac rovina gli accenti e
toglie gli zeri davanti ai telefoni. Adesso si carica il `.xlsx` com'è.

- **Il file si apre nel browser** con zip.js, che c'era già per l'area file
  (§421). `lib/sales-xlsx.ts` fa il resto senza rete — da due testi XML a
  `string[][]`, lo stesso che esce da `leggiCsv` — e da lì il percorso è uno:
  riconoscimento, anteprima, doppioni. Le celle vuote Excel non le scrive, quindi
  il posto si legge dal riferimento (`C12`): altrimenti il telefono finirebbe
  al posto della mail. Si legge il **primo foglio** nell'ordine del file.
  Tetto di 30 MB sul decompresso, contro gli zip che esplodono.
- **Il titolo sopra la tabella si salta** (`trovaIntestazione`): si guarda
  nelle prime dieci righe quella in cui si riconoscono più campi, con l'azienda
  che pesa più di tutti. Vale anche per i CSV. Provato su un Excel vero con il
  titolo in A1.
- **La mappa si corregge nell'anteprima**, un menu per campo. Prima l'errore si
  vedeva e l'unica via era rinominare la colonna nel file e ricaricarlo.
- **Il riepilogo dei doppioni dice la riga del file**, contando titolo e righe
  saltate (`converti` restituisce `origine`).
- **Il tetto sta sul server**: duemila righe per file e campi accorciati, perché
  al server arriva un elenco che chiunque può scrivere a mano.

Il vecchio `.xls` (Excel 97) non si legge: è un formato binario diverso, e oggi
Excel salva in `.xlsx` da vent'anni.

## Il ritorno sul foglio — §434

Il foglio resta l'ingresso («il foglio crea, il tool governa», §370), ma chi lo
apre vedeva lo stato del lead di quando era entrato, e poi più niente. Adesso il
giro — il cron delle 03:00 e il bottone «Aggiorna dal foglio», che chiamano la
stessa `giroFoglio` — prima fa entrare i lead nuovi e poi scrive sul foglio a
che punto è ognuno.

- **Solo colonne sue**, in fondo: `Fase OS`, `Qualifica OS`, `Owner OS`,
  `Ultimo contatto OS`, `Motivo perso OS`. `STATUS` e `Note` restano di chi le
  scrive a mano e non si toccano mai. Le colonne si trovano **per nome**, quindi
  si possono spostare; se mancano si aggiungono dopo l'ultima, e la griglia si
  allarga (un foglio nasce con 26 colonne, quello dei lead ne usa già 24).
- **Solo quello che è cambiato**, per non riempire la cronologia del foglio di
  trecento modifiche uguali ogni notte. Una riga che nel tool non c'è più
  (eliminata, §378) resta com'è.
- **Valori in parole e RAW**: l'etichetta della fase letta dal database col
  service role (di notte non c'è sessione, e `leggiFasi` tornerebbe al seme),
  le date come testo `2026-09-22` a Roma.
- **Account di servizio**, non il Google di una persona: chiave in
  `GOOGLE_SHEETS_SA_JSON`, foglio condiviso come Editor col suo `client_email`.
  Il foglio si trova dallo stesso `SALES_SHEET_CSV_URL` dell'ingresso, così le
  due direzioni non possono puntare a due fogli diversi. **Senza chiave il
  ritorno non parte e lo dice** nel riepilogo; l'ingresso continua uguale. Un
  ritorno fallito non fa fallire l'ingresso.

Prova a secco: `npx tsx scripts/check-sales-ritorno.ts` calcola le celle senza
scriverne nessuna. Il 24 settembre: 38 lead abbinati su 38, cinque colonne da
aggiungere (Y–AC), 121 celle.

## I motivi del perso si governano — §435

Dalla 258 sono una tabella (`sales_motivi_perso`) e il menu della scheda li
legge da lì, ma cambiarli voleva dire aprire il SQL Editor. Adesso stanno in
`/impostazioni/commerciale`, sotto le fasi, con lo stesso gesto: si salva tutto
insieme, i problemi si vedono mentre si scrive (`problemiMotivi`, la stessa
funzione dell'azione e del gate), si sposta con due bottoni. Accanto a ogni
motivo, quanti persi lo usano.

**Un motivo usato non si elimina, si ritira** — e qui non è una cortesia come
per le fasi. La chiave esterna è `ON DELETE SET NULL`: il database non
fermerebbe niente, svuoterebbe il motivo su ogni perso che lo aveva, e «perché
perdiamo» cambierebbe senza che nessuno l'abbia toccato. Il conteggio in
`salvaMotivi` è l'unica barriera, e il bottone per eliminare compare solo
sui motivi a zero.

La chiave di un motivo nuovo nasce dal nome (`chiaveDa`); quella di uno che
esiste già non cambia, perché i persi la puntano.

## Priorità e membership si governano — §436

Dalla 236 erano scritte due volte — una costante e un `CHECK` — e per aggiungere
una voce servivano una migration e un rilascio. La **261** le porta in due
tabelle (`sales_priorita`, `sales_membership`), e scendono dal server come le
fasi: `leggiScelte`, il contesto (`SCELTE`, `etichettaScelta`, `vociPer`,
`ORDINI`), la cella, i filtri, l'ordinamento, «Nuovo lead» e `validaCella`
leggono da lì.

- **La chiave è il valore salvato sul lead e non cambia** (`High`, `Not
  Member`): nessuna riga di `deals` si tocca. Si rinomina l'etichetta.
- **Chiave esterna `ON DELETE RESTRICT`**, non `SET NULL` come per i motivi:
  una voce usata non si cancella nemmeno se l'azione se ne dimenticasse.
- **L'ordine dell'elenco è l'ordine dell'ordinamento**: «High prima di Low»
  non è più una mappa scritta in `sales-filtri`, ma la posizione nell'editor.
- **Prima della migration il tool si comporta come prima**: senza tabelle si
  torna al seme, che è l'elenco di sempre (lo verifica il gate).

L'editor dei motivi (§435) è diventato `ElencoVociClient` e serve tutti e tre
gli elenchi; le regole sono `problemiDi(tipo, voci)`, la stessa funzione in
schermata, azione e gate.

**La fonte non è diventata un elenco, ed è voluto.** È un campo libero che
riempiono anche il giro dal foglio («Meta Ads») e l'import («CSV»): chiuderla
vorrebbe dire decidere cosa fare dei valori che arrivano da fuori. La costante
`SALES_SOURCES` in `lib/sales.ts` non la usa più nessuno.

## I campi personalizzati della scheda — §437

Un campo che serve a un modo di lavorare («Dipendenti», «Gestionale usato»,
«Ha già un sito?») non chiede più una migration: si aggiunge da
`/impostazioni/commerciale` e compare **solo nella scheda del lead**, nel
riquadro scelto — non in elenco, non nei filtri, non nei numeri, perché un
campo nato per un modo di lavorare non deve cambiare la pagina di tutti.

- **Nove tipi**: testo breve, testo lungo, numero, data, sì/no, scelta, link,
  telefono, email. Telefono ed email si aprono con un tocco. **Nessun
  importo**: un valore economico scritto a mano su un lead è quello che
  l'invariante vieta.
- **Stessa cella di sempre** (`comeColonna` → `CrmCella`): due modi di
  modificare nella stessa scheda sono uno di troppo. Il campo sta in fondo al
  riquadro che ha scelto, non in un «Altro» che nessuno apre.
- **Dati**: definizioni in `sales_campi`, valori in `deals.campi_extra`
  (`jsonb`), scritti **una chiave alla volta** da `sales_imposta_campo` — due
  persone che compilano due campi della stessa scheda non si cancellano. Il
  valore passa da `validaExtra` col tipo **riletto dal database**; il vuoto
  toglie la chiave.
- **Un campo con dei valori non cambia tipo e non si elimina**: si ritira, e
  resta leggibile (barrato) sulle schede che lo hanno compilato. Lo conta
  `salvaCampi`; nell'editor i bottoni non ci sono.
- **Le chiavi** nascono dal nome e non possono essere quelle delle colonne vere
  (`RISERVATE`); il nome non può essere quello di un campo già nella scheda.
- **Prima della migration** la pagina regge: `campi_extra` si legge in una
  query a parte e tollerante, e senza tabella non ci sono campi. La **262** è
  applicata dal 2026-09-24.

Due ritocchi a `CrmCella` che valgono per tutti: un numero si mostra come
numero e come euro solo se la colonna lo dichiara (`euro: true`, solo
Fatturato) — «Tentativi» si leggeva «3 €»; e telefono ed email sono link.

## La timeline del lead — §438

«Last Contact» era una data scritta a mano, senza ora, e «Tentativi» un numero
scritto a mano: due campi che potevano dire cose diverse, e nessuno dei due
raccontava cosa fosse successo. In più il sync dal foglio scriveva come ultimo
contatto la **data di arrivo** — 19 lead su 42 risultavano sentiti senza che
nessuno li avesse chiamati.

Adesso si registra **cosa è successo**, in `deal_activities` (223, mai usata
prima), e il resto discende:

- **Tipi ed esiti chiusi**: chiamata (risposto · non risposto · da richiamare ·
  segreteria), email e messaggio (inviato da noi · ricevuto da lui), meeting
  (fatto · non si è presentato), nota. Il vincolo `deal_activities_forma` li
  tiene insieme nel database — con `COALESCE`, perché un CHECK che vale NULL
  passa, e una chiamata senza esito entrava.
- **Ultimo contatto, tentativi, prossimo follow-up non si scrivono**: li
  ricalcola `sales_ricalcola_contatto` a ogni voce (trigger). I tentativi sono
  quelli **senza risposta dopo l'ultima risposta**; una nota non conta. In
  `COLONNE` le due colonne sono `derivato`, quindi fuori da `CAMPI_SCRIVIBILI`.
- **«Oggi»** accanto a Last Contact: un clic registra una chiamata risposta
  adesso, e per dieci secondi resta una barra per dire che era un'altra cosa —
  si ferma se ci passi sopra. «Scegli» apre il modulo: Adesso, Ieri, un
  mini-calendario (`MiniCalendario`, riusato dal follow-up), l'ora, «non
  ricordo l'ora». Un contatto fatto non può stare nel futuro: per quello c'è il
  follow-up.
- **L'ora è di Roma** (`istanteRoma`, `quandoContatto`), non del browser.
  Senza ora registrata si scrive il giorno, mai mezzanotte.
- **Follow-up**: pianificato entra come «in programma» (la route lo scrive nel
  diario con l'id dell'evento Google). Passata l'ora la scheda chiede «Com'è
  andato?», e solo lì diventa un contatto. Spostarlo non tocca una voce che ha
  già un esito; annullarlo la segna annullata.
- **Correzioni**: chi l'ha scritta o un admin. La cronologia ha la voce col suo
  nome (`log_activity` ha l'etichetta `deal_activities`), e chi non vede il
  lead non vede nemmeno quella (`sales_history_scope`).
- **In elenco**: «Sentito ieri 09:10 · 2 a vuoto · richiamo domani 09:30», in
  arancione oltre i 14 giorni. **Sul foglio** «Ultimo contatto OS» porta data e
  ora.
- **Backfill** (263): i 23 contatti segnati a mano sono voci «contatto» senza
  ora; i 19 con la data d'arrivo tornano «mai sentiti». Il sync non scrive più
  `last_interaction_at`.

## Il follow-up si fissa guardando la propria giornata — §439

Prima c'era un `datetime-local` e un numero di minuti: l'ora si sceglieva al
buio, e il conflitto si scopriva su Google. Adesso «Pianifica follow-up» nel
riquadro Contatti apre `PianificaFollowup`:

- **Si apre sul primo buco libero**, e le scorciatoie mettono giorno e ora
  insieme: tra un'ora, oggi 15:00, domani mattina/pomeriggio (di venerdì
  diventa «Lunedì»), tra tre giorni lavorativi, lunedì prossimo, tra due
  settimane. Durata a chip: 15, 30, 45, 60.
- **Accanto al mese c'è la giornata**, a fasce di mezz'ora dalle 7 alle 20,
  con i propri impegni disegnati sopra: Google (se collegato), eventi del tool,
  gli altri follow-up, ferie e permessi, le task in scadenza (tratteggiate:
  ricordano, non occupano). Un clic sulla fascia fissa l'ora. Legge **solo
  l'agenda di chi pianifica** (`leggiAgenda`, un mese alla volta).
- **I conflitti avvisano, non bloccano**: sovrapposizione, fuori dall'orario
  **8–18 lun–ven** (uguale per tutti), festivi, ferie; ferie da approvare
  avvisano senza escludere lo slot. Accanto all'avviso, il primo libero dopo
  quello scelto. Tutto in `lib/sales-agenda.ts`, a Roma, con il suo gate.
- **Senza Google si pianifica lo stesso**: il follow-up vive nel diario e la
  campanella lo ricorda un quarto d'ora prima (264, pg_cron ogni cinque
  minuti), con il link `?lead=` che apre la scheda nel portale giusto. Con
  Google resta la strada di sempre (route `/api/sales/follow-up`), che scrive
  anche il diario; Google lo ricorda da sé, quindi la campanella non ripete.
- **Si sposta e si annulla dal diario**: «Sposta» riapre lo stesso selettore,
  «Annulla» chiede conferma (su Google avvisa gli invitati, e spostando
  l'invito resta). Un follow-up passato ha anche «Rimanda…». Spostarne uno già
  ricordato cancella il promemoria mandato, così suona di nuovo.
- Il vecchio riquadro «I tuoi follow-up» (`SalesFollowUps`) non c'è più, e con
  lui la prova browser che lo guidava: i follow-up comparivano due volte.

## Filtri, ordine e viste che si ritrovano — §440

I filtri erano un pannello di chip sotto la barra, l'ordinamento un `select`
con una freccia a parte, e al ricarico sparivano tutti e due. Adesso:

- **Uno stato solo** (`StatoElenco` in `lib/sales-vista.ts`): ricerca, gruppo,
  vista rapida, filtri a scelta, filtri per data, due criteri d'ordine. Sta
  **nell'indirizzo** (`?f.stage=…&d.contatto=piu_vecchio:14&ordine=…`, scritto
  con `replaceState`, così cambiare un filtro non rilegge la pagina), si
  **ricorda** in questo browser (`twobee-crm-elenco`), e si **salva con un
  nome**. `leggi` accetta solo quello che conosce: un parametro inventato non
  diventa un filtro che esclude tutto.
- **Ogni filtro è una frase** («Fase: Nuovo lead, In contatto ×»): si cambia
  cliccandola, si toglie con la ×. «+ Filtro» elenca le date e le variabili
  che hanno valori; con più di otto valori c'è la ricerca.
- **Le date** (ultimo contatto, arrivo, prossimo follow-up) hanno gli
  intervalli pronti — oggi, ultimi 7/30, più di 7/14/30 giorni fa, mai sentito,
  scaduto, prossimi 7, nessuno in programma — e l'**intervallo dal calendario**
  (primo clic l'inizio, secondo la fine; «solo quel giorno», «da lì in poi»).
  Tutto sui giorni di Roma.
- **Viste rapide**: Miei (fra gli Account Owner), Da richiamare (follow-up
  scaduto o di oggi, o fermo da 7 giorni senza niente in programma), Fermi da
  più di 7 giorni (aperti, contati dall'arrivo se nessuno li ha mai sentiti).
- **Ordina**: un bottone che dice l'ordine («Ultimo contatto ↓, poi fase ↑»);
  i cinque campi più usati in cima, gli altri sotto «Altri campi», e un secondo
  criterio. Si ordina anche sul prossimo follow-up.
- **Viste salvate** (265): le proprie e quelle che il team ha condiviso. Una
  vista è la query dell'indirizzo; la cambia o la elimina chi l'ha fatta, o un
  admin. «Miei» in una vista condivisa resta di chi guarda.
- Il conteggio «N di M lead» sta nella barra; i numeri leggono gli stessi
  filtri meno il gruppo (§431).

## L'export dei lead e dei contatti — §441

«Esporta» (in testata e nella barra della selezione) scarica i lead in
**Excel, CSV o PDF**, e c'è solo per **super admin, founder e admin**: un file
con tutti i recapiti esce dal tool e non si richiama più. La porta vera è la
route `/api/sales/export`, che rilegge `app_role` (non `role`) dal database
(`puoEsportare`): manager e senior abilitati al commerciale lavorano i lead, ma
non li portano fuori.

- **Due export**: il **lead completo** (tutte le colonne della scheda, ultimo
  contatto, tentativi, prossimo follow-up, campi personalizzati, provenienza
  Meta, note **e le singole interazioni**) e i **contatti** (nome, azienda,
  email, telefono, owner, fase).
- **Quali righe**: le selezionate se ci sono, altrimenti quelle che i filtri
  mostrano, o tutte. Il browser manda gli id **nell'ordine in cui li vede**, la
  route li rilegge dal database: il file dice quello che c'è.
- **Excel**: due fogli (Lead, Interazioni), intestazione bloccata e filtro
  automatico, scritto a mano come zip di XML (`fileXlsx` + `yazl`), celle di
  testo. **CSV**: punto e virgola, BOM, CRLF — Excel italiano lo apre in
  colonne con le accentate giuste; le interazioni stanno in una colonna, una
  per riga. **PDF** (`jspdf` + `jspdf-autotable`, le sole dipendenze nuove):
  A4 orizzontale, le colonne che si leggono e sotto il diario; in testa quanti
  sono, i filtri in una frase (`descrivi`) e chi l'ha esportato quando.
- **Ogni valore come lo legge una persona**: «Call fissata», il nome
  dell'owner, «24/09/2026 14:32» a Roma, gli euro nel fatturato.
- **Nel CSV una formula non parte**: una cella che comincia con `=`, `+`, `-`,
  `@` prende un apostrofo davanti — tranne i telefoni, che formule non sono.
- **Nome file** `lead-twobee-AAAA-MM-GG.ext`, `contatti-twobee-…`, col giorno
  di Roma. Al massimo 5000 righe per volta.

## Aperto

- **La RLS non conosceva `deal_owners`**: `sales_can_read` (223) guardava solo
  `assigned_to`, vuoto su tutti i lead, e il follow-up nel calendario — che
  legge con la sessione — diceva «Lead non accessibile» a un senior owner. La
  **260** lo sistema con `sales_can_read_deal(id, assigned_to)`, stessa regola
  di `leadDi()`. **Applicata** il 2026-09-24.
- **Il ritorno sul foglio aspetta la chiave** (§434): account di servizio da
  creare, foglio da condividere, `GOOGLE_SHEETS_SA_JSON` in Coolify.
- `sales_handoffs` resta in piedi e non la scrive più nessuna UI:
  `SalesHandoff` la legge ancora nella scheda progetto. `deal_activities` è
  tornata viva con la timeline (§438).

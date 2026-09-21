# Area commerciale — il CRM di Notion, qui dentro

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

## Aperto

- **La UI per concedere `can_view_deals` non c'è più.** Stava in
  `SalesWorkspace`, rimosso con il resto del modulo vecchio. Oggi l'area la
  vedono gli admin (`salesAccess` li ammette sempre); per abilitare un manager
  o un senior serve `setSalesPermission`, che esiste ed è protetta, ma non ha
  una schermata che la chiami. Va rimessa in Impostazioni → utenti, dove
  stanno gli altri permessi.
- `deal_activities` e `sales_handoffs` restano in piedi e non sono più scritte
  da nessuna UI: `SalesHandoff` legge ancora la seconda nella scheda progetto.

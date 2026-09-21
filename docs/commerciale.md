# Area commerciale — il CRM di Notion, qui dentro

Stato al 21 settembre 2026: **riscritta da zero (§367–§371)**. Migration 235,
236 e 239 applicate. Il modulo precedente (§223–§225) è stato sostituito: descriveva
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

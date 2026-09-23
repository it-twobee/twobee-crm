# Accesso ai file

21 settembre 2026 · migration 246 **applicata in produzione**
(`20260921150329`); codice nel rilascio su main per Coolify.
22 settembre 2026 · migration **249 applicata in produzione**
(`20260922084609`): cartella `deliverables` e download autenticato delle consegne.
22 settembre 2026 · migration **251 applicata in produzione**
(`20260922113154`): il verso nostro dell'area cliente (`source`, cartelle dal
percorso, archiviazione).
22 settembre 2026 · migration **250 applicata in produzione**
(`20260922093617`): cartella `materiali`, lo spazio file del cliente, e il Range
su tutte e due le porte del portale.

## Il confine

`/api/files/**` gestisce **allegati interni**. Serve un account staff attivo,
con `role` e `app_role` coerenti negli elenchi di `lib/permissions.ts`.
Clienti e ospiti non passano neppure se hanno una membership portale attiva o
risultano proprietari di un vecchio file. Le letture del file e delle cartelle
usano il client di sessione e la RLS; il client privilegiato viene creato solo
dopo il controllo d'identità/ruolo e le scritture dichiarano `x-actor-id`.

La visibilità sul portale richiede un'altra domanda: **questa versione è
pubblicata per il mio progetto e la mia membership è ancora valida?** Il
download autenticato delle versioni pubblicate ha una porta sua, più sotto;
l'upload dei **materiali del cliente** resta allo step successivo. Non usare il
download generico o un link anonimo per collegarli in fretta: aggirerebbe
pubblicazione, scope progetto e revoca.

## Regole condivise

- `lib/storage/access.ts`: matrice ruoli, proprietà, cartelle sensibili,
  condivisione, contesto, prefisso/bucket e header di risposta.
- `lib/storage/guard.ts`: sessione verificata, profilo attivo, client RLS,
  client con attore e interrogazione del contesto/parent.
- `storage_context_access` (246) è `SECURITY INVOKER`: verifica l'esistenza
  e la leggibilità della sorgente tramite la sua RLS. I client nascosti al
  workspace restano esclusi per il team, anche se il file era suo.
- Contesti ammessi: `client`, `project`, `profile`, `feedback`, `channel`,
  oppure nessun contesto dove la categoria lo permette. Tipo e ID viaggiano
  insieme. `clients` richiede `client`; `feedback` richiede `feedback`;
  `deliverables` richiede `project` (249); `materiali` richiede `client` (250).
- Scrivere sul feedback richiede autore o admin; leggerne gli allegati resta
  consentito allo staff. Un `viewer` legge ma non crea, elimina o condivide.
- Cartelle sensibili (`payslips`, `personal`, `best_ideas`): proprietario o
  admin, anche per **i nomi delle cartelle**, non soltanto per i binari.
- Per aggiungere file/sottocartelle a un parent occorrono proprietà o ruolo
  admin, medesima categoria e medesimo contesto. Anche il database impedisce
  parent incompatibili, cicli e cambio contesto di una cartella non vuota.

## Database — migration 246

Le vecchie policy owner/team di 108/109 vengono mantenute ma limitate da policy
**restrittive**: staff attivo + contesto leggibile. Revocati tutti i grant ad
anon e quelli di scrittura ad authenticated; restano SELECT con RLS e accesso
backend. Il browser non può così inventare `object_key`, attribuzione, contesti
o token di condivisione. Le API e la migration vanno rilasciate insieme.

La cancellazione ricorsiva verifica l'intero sottoalbero e tutti i proprietari
prima di toccare MinIO. Le letture sono paginate, perché il limite PostgREST
non deve far saltare un figlio che il CASCADE eliminerebbe comunque. Oltre
10.000 righe la verifica si ferma senza scrivere. Un trigger controlla anche
i figli aggiunti fra il preflight applicativo e il DELETE: la proprietà del
padre non autorizza a eliminare figli altrui. Nessun errore storage viene
scambiato per eliminazione riuscita; file binario e database restano risorse
separate, quindi un'interruzione può richiedere il retry dell'operazione.

## Condivisioni pubbliche

Link anonimi ammessi soltanto per `misc`, `knowledge` e `feedback`, senza
associazione azienda/progetto/persona/canale. I documenti cliente, progetto e
le cartelle sensibili richiedono accessi personali. La regola vale anche per
vecchi token: conoscere un link non riapre l'accesso al file privato.

Ogni download pubblico verifica token, revoca, scadenza, categoria, sorgente
feedback quando presente, autore della condivisione ancora attivo e ancora
autorizzato a gestire quel file. `storage_replace_share` è service-only,
ricontrolla l'attore e serializza rinnovo/revoca sul file: un rinnovo fallito
non lascia una revoca parziale né due nuovi token attivi. Il proprietario o
l'admin possono revocare anche un vecchio link a un file ora privato.

Tutti i download generici controllano che bucket e prefisso dell'oggetto
corrispondano ai metadati. Risposte `private, no-store`, `nosniff`, sandbox e
nessun referrer. HTML/SVG/script vengono scaricati come allegato; non possono
eseguire contenuti attivi nell'origine autenticata del gestionale. Immagini
raster, PDF, audio, video e testo semplice mantengono l'anteprima inline.

## Le consegne al cliente — cartella `deliverables` (249)

Una consegna pubblicata è un file interno come gli altri, ma con due regole in
più: vive **solo dentro un progetto** (`entity_type='project'`, come `clients`
esige `client`) e **non produce link anonimi** — `canShareFile` ammette
condivisioni pubbliche solo per `misc`, `knowledge` e `feedback`, quindi la
cartella ne resta fuori senza eccezioni da scrivere.

L'upload riusa `POST /api/files/upload` con `folder=deliverables`: stesse guard,
stesso limite di 50 MB, stesso rollback dell'oggetto se il metadato non si
salva. Il passo successivo è una riga `portal_deliverable_versions` con
`file_id`, `storage_key` e l'autore: il database verifica che il file sia di
quel progetto e che la chiave coincida con `files.object_key`.

Il download del cliente passa da **`GET /api/portale/consegne/:versionId`**, mai
da `/api/files/:id/download`. La sequenza è: lettura della versione con la
**sessione e la RLS** — se la riga non torna, per chi chiede non esiste — poi il
service role per leggere `storage_key`, che al browser non è concesso, e infine
lo stream con gli stessi header degli allegati interni (`private, no-store`,
`nosniff`, sandbox, HTML/SVG come allegato). Un errore di lettura risponde 503,
non 404: un guasto non è un «non esiste». Prove in
`scripts/check-portal-download-route.ts`.

## Lo spazio file del cliente — cartella `materiali` (250)

È l'unica cartella in cui scrive **il cliente**, e per questo non passa da
`/api/files/**`: quelle API vogliono uno staff attivo, e la 246 le chiude ai
clienti apposta. La porta è `POST /api/portale/materiali`, con la membership al
posto del ruolo staff e `portal_assert_actor` nel database, che esclude il
lettore. La cartella sta sempre sotto un'azienda (`entity_type='client'`) e resta
fuori dai link anonimi, come tutte quelle legate a un cliente.

Un file può arrivare a **1 GB**: non passa da `formData()`, che lo terrebbe in
memoria. `putObjectStream` apre un multipart a pezzi da 8 MiB mentre i byte
arrivano, conta mentre scrive e **annulla** l'upload appena supera il limite —
un multipart lasciato aperto occuperebbe spazio senza comparire in elenco, quindi
l'abort è nel `finally`. Tipi ammessi da elenco chiuso; HTML, SVG, script ed
eseguibili restano fuori, guardando tipo dichiarato ed estensione insieme.

`serveStoredFile` serve i byte a tutte e due le porte del portale — consegne e
materiali — con il **Range**: 206 e `Content-Range` per un intervallo, 416 per
uno fuori dal file, `Accept-Ranges` sempre. Senza, un video si scarica tutto e
non si può far scorrere.

## Il verso nostro dell'area cliente (251)

Nella stessa cartella `materiali` scrive anche il team, con
`portal_materials.source = 'team'`: stesso spazio, stessa quota, stesso limite,
e una riga nella policy di lettura del cliente che gli passa solo `'cliente'`.
La porta è `POST /api/area-cliente/file` — `getCaller` per lo staff attivo,
`canAccessStorageContext` per il contesto azienda, che tiene fuori le aziende
nascoste al workspace — e nel database `portal_assert_staff_actor` rifà il
controllo sull'attore, perché l'header non è un permesso.

Il percorso della cartella viaggia col file (`path`), normalizzato in TypeScript
e ricontrollato da un CHECK: niente `..`, niente barre appese, al massimo dieci
livelli. `PATCH /api/area-cliente/file/:id` archivia, rimette in vista ed
elimina: archiviare vale solo per i nostri elenchi, eliminare un file del
cliente è riservato agli amministratori.

## Anteprima dei file (§399)

Immagini, video e audio si guardano senza scaricarli: l'anteprima punta alla
**stessa porta autenticata** del download, che li serve `inline` e risponde al
Range — quindi un video si fa scorrere e non c'è nessun indirizzo pubblico da
inventare. Si chiude la scheda e il file resta dov'era.

L'elenco di ciò che si anteprima è **chiuso e corto** (`renderableKind`): png,
jpeg, gif, webp, avif; mp4, webm, ogg, quicktime; i formati audio comuni. Fuori
da lì il bottone non compare. Il motivo non è prudenza generica: un `.psd` si
presenta come `image/vnd.adobe.photoshop`, e fidandosi del tipo dichiarato
l'anteprima avrebbe disegnato un rettangolo rotto. **Una miniatura promessa e
non mostrata è peggio di nessuna miniatura.**

Il **PDF non si apre in un iframe**, e non è una dimenticanza: la risposta
porta `Content-Security-Policy: sandbox`, e un PDF in un iframe sandboxato il
browser non lo apre. Togliere quell'header per far vedere un'anteprima sarebbe
scambiare una comodità con la ragione per cui i file sono privati. Dal §415 il PDF
si vede lo stesso, in un altro modo: qui sotto.

### Miniature (§401)

Le immagini si vedono **nell'elenco**, al posto dell'icona: cercare fra venti
foto aprendole una per una non è cercare. Non è il file rimpicciolito dal CSS —
quello sarebbe un download intero per riga, e con venti foto da 8 MB sarebbero
160 MB per scorrere una cartella.

`GET /api/portale/materiali/:id/miniatura` genera una webp da 320 px con
`sharp` e la **lascia accanto all'originale** su MinIO
(`materiali/miniature/<id>.webp`): la seconda visita la trova già fatta, e il
ritiro del file se la porta via. L'autorizzazione è la stessa del download, la
RLS: una miniatura è il file.

Scelte dichiarate:

- `Cache-Control: private, max-age=300`. Cinque minuti bastano a scorrere un
  elenco senza rigenerare niente e sono pochi perché **una revoca si senta
  subito**; `private` tiene la copia nel browser di chi guarda e fuori da ogni
  cache condivisa.
- `rotate()` senza argomenti applica l'orientamento EXIF: senza, le foto
  scattate col telefono arrivano coricate.
- Oltre 40 MB l'originale non si apre in memoria per farne un francobollo:
  resta l'icona.
- **`sharp` è un di più.** È un modulo nativo e in produzione si gira su musl:
  se il binario non carica, la rotta risponde 404 e l'elenco torna alle icone.
  Una miniatura assente non è un guasto, e non deve diventarlo.
- I video non hanno ancora un fotogramma di copertina: servirebbe `ffmpeg`, che
  sulla macchina non c'è. Restano icona più anteprima a richiesta.

**File di progetto** (`.afdesign`, `.afphoto`, `.afpub`, `.psd`, `.ai`, `.eps`,
`.indd`, `.sketch`, `.xd`, `.fig`): si riconoscono dall'**estensione**, perché il
tipo dichiarato o manca o mente, e contano come documenti — si scaricano, non si
aprono nel browser. L'elenco dei bloccati (HTML, SVG, script, eseguibili)
continua a battere questo.

## Lo spazio c'è prima del portale (§403)

L'area file di un cliente è **una sola** e sta in due posti: la scheda del
cliente, scheda **File**, e la sezione Documenti. È lo stesso componente
(`components/shared/ClientFileArea.tsx`), perché la stessa domanda non può avere
due risposte a seconda della pagina da cui ci si arriva.

La scheda File **c'è per ogni cliente, dal primo giorno**: il nostro mezzo
spazio non dipende dal portale, e la guard di scrittura
(`POST /api/area-cliente/file`) non ha mai chiesto una membership. Quello del
cliente si accende quando gli si manda un invito, e finché non succede il gruppo
«Caricati dal cliente» lo dice a parole, con il link alla scheda Portale cliente,
invece di restare un riquadro vuoto senza motivo.

La lettura per la scheda passa da `getClientFiles` (`app/actions/client-files.ts`):
staff attivo, azienda visibile in `clients_workspace` per chi non è admin (§213),
e nient'altro — le scritture restano nelle rotte.

## Una porta sola, e che chiude davvero (§414)

Prima di costruire l'esploratore sopra l'area file si è guardato il terreno, e
c'erano quattro buchi. Stavano tutti nei posti da cui passa ogni scrittura.

- **Le API generiche arrivavano ai materiali.** `/api/files/**` accettava
  `folder='materiali'`. Una DELETE da lì toglieva i byte da MinIO, poi il trigger
  della 251 rifiutava il metadato, e restava un materiale vivo senza file. Il
  download li serviva a freelance, partner e viewer, che la RLS dei materiali
  esclude. Adesso `materiali` è una cartella **con una porta sua**
  (`OWN_DOOR_FOLDERS` in `lib/storage/access.ts`):
  - `parseStorageContext` non la accetta;
  - `canReadFile` e `canDeleteFile` la rifiutano.
- **La PATCH del team aveva mezza porta**: guardava il ruolo e non l'azienda.
  Un file di un'azienda nascosta al workspace restava archiviabile da chi ne
  conosceva l'id. `requireMaterialAccess` e `requireMaterialRow`
  (`lib/storage/guard.ts`) sono l'unica porta delle rotte `/api/area-cliente/**`.
  Controllano ruolo, poi riga letta con la RLS, poi contesto azienda, e nessuna
  arriva a MinIO prima di tutti e tre.
- **Chi vede l'area** è la lista di `portal_is_staff()` (244), che è chi decide
  davvero. `PORTAL_STAFF_ROLES` in `lib/permissions.ts` è la sua copia in
  TypeScript, e `canReadMaterials`/`canWriteMaterials` la usano. Prima la pagina
  lasciava entrare viewer, freelance e partner e la RLS gli passava zero righe:
  un'area vuota che diceva «nessuno ancora», cioè un vuoto plausibile e sbagliato.
  Adesso ricevono una frase.
- **Staccare il file vuole un autore.** Il DELETE del portale cancellava la riga
  `files` col service role nudo. Il `SET NULL` su `portal_materials.file_id` è un
  UPDATE, e `portal_log_event` lo rifiuta senza `x-actor-id`. La rotta non
  guardava l'errore: i byte sparivano e il metadato restava. Adesso passa da
  `writer.db`; la prova sta in `251_area_cliente.check.sql`, e il mock delle
  rotte rifiuta allo stesso modo.

Due letture erano troncate da PostgREST a mille righe:
- l'elenco della scheda (`getClientFiles`): adesso legge a pagine fino a
  20.000 righe, e oltre lo dichiara (`truncated`);
- la somma della quota (`usedMaterialBytes`): diceva «c'è spazio» a
  un'azienda che l'aveva finito.

La scheda File, inoltre, non si aggiornava: i dati stanno nello stato del
componente, e `router.refresh()` rilegge solo i componenti server.

## L'esploratore (§416)

L'area file di un cliente è un esploratore, non più un elenco in due gruppi. È
il primo pezzo per togliere di mezzo il Google Drive interno. Il componente è
`components/shared/file-area/ClientFileArea.tsx`, lo stesso nella scheda
cliente e in Documenti. La logica pura — cosa c'è in una cartella, in che
ordine, cosa trova una ricerca — sta in `lib/portal/explorer.ts`, con il suo
check.

- **Due spazi, una navigazione.** In alto si sceglie fra «Nostri · N» e «Dal
  cliente · N»; sotto c'è la cartella corrente con il breadcrumb. Nella scheda
  cliente cartella e spazio stanno nell'indirizzo (`?spazio=&cartella=`), con
  `replaceState`. Cambiare cartella non rilegge la pagina dal server e non
  lascia una voce di cronologia per ogni cartella aperta. Un ricarico, o il
  ritorno da un'altra pagina via `NavMemory`, riapre la stessa cartella. In
  Documenti le aree sono tante, una per azienda, e l'indirizzo resta fermo.
- **Si carica solo in «Nostri».** La rotta scrive sempre `source='team'`, e
  mettere un file nello spazio del cliente vorrebbe dire farglielo vedere: è
  una pubblicazione, non un caricamento. Nello spazio del cliente i bottoni
  non ci sono e un file trascinato viene rifiutato a parole.
- **Si carica nella cartella che si guarda.**
  - I file trascinati nell'area vanno nella cartella corrente; quelli
    trascinati su una cartella vanno dentro di lei.
  - Le cartelle trascinate dal computer si leggono con `webkitGetAsEntry`, e
    `readEntries` va chiamato finché torna vuoto: Chrome restituisce cento voci
    alla volta.
  - Le voci si prendono dentro l'evento: dopo, il browser svuota il
    `DataTransfer`.
  - `.DS_Store`, `Thumbs.db`, `__MACOSX/` e simili si saltano (`isJunkFile`).
- **I caricamenti** partono tre alla volta, hanno un avanzamento totale e il
  bottone Annulla, e gli errori si raccolgono in un riepilogo. Prima il primo
  errore fermava tutto, e ne restava scritto solo uno.
- **Ordine**: data (default, i più recenti prima), nome (i numeri contano come
  numeri, «9» prima di «10»), dimensione. Le cartelle stanno sempre sopra: per
  data le ordina il loro ultimo caricamento, e una cartella vuota va in fondo.
  L'ordine è una preferenza di chi guarda (`localStorage`).
- **«Recenti»**: tutti i file dello spazio, da ogni cartella, dall'ultimo
  arrivato, con scritto dove stanno.
- **La ricerca** guarda i nomi di file e cartelle in **tutti e due** gli spazi.
  Tutte le parole devono comparire, in qualunque ordine, senza accenti e senza
  maiuscole. Una cartella si trova dal suo nome, non dal percorso: cercare
  «brand» non restituisce ogni file che sta sotto Brand.
- **Gli archiviati** sono nascosti, come in Documenti, e si vedono a richiesta.
- **Elimina** chiede conferma nella pagina (`ConfirmDialog`): il `confirm()`
  nativo non segue il tema.
- **La griglia** mostra miniature grandi e, per i file che non ne hanno, il
  tipo scritto (PSD, PDF, ZIP).

Il portale del cliente non cambia layout: condivide con noi solo anteprima,
miniatura e regole dei percorsi.

## Organizzare: cartelle vuote, spostare, rinominare (§413, migration 254)

Il percorso resta la verità del file (§398), e il portale del cliente non
cambia modello. La 254 aggiunge solo quello che mancava.

- **Cartelle che esistono anche vuote**: `portal_material_folders` (azienda,
  spazio, percorso), unica per azienda e spazio, con lo stesso CHECK sul
  percorso dei file. L'albero è l'unione di queste cartelle e dei percorsi dei
  file. Il cliente non ha una policy sulla tabella: una cartella vuota creata
  da noi non gli dice niente, e quelle del suo spazio le vede quando dentro c'è
  un file, come prima.
- **`name` e `path` di un file vivo si possono cambiare.** Tutto il resto resta
  immutabile, `source` compreso: spostare un file dal nostro spazio al suo è
  una pubblicazione, non un trascinamento. Il nome cambia, l'estensione no —
  lo dice la finestra, lo controlla la rotta (`renameFile`) e lo ricontrolla il
  trigger — così `logo.png` non diventa `logo.html`.
- **Le operazioni sono funzioni del database**, service-only, con l'attore
  ricontrollato da `portal_material_actor`: stessa lista di `portal_is_staff`,
  e un'azienda nascosta la tocca solo un admin anche se la rotta l'ha già
  controllato, perché l'header non è un permesso.
  - `portal_material_move` sposta N file in un colpo, dentro lo stesso spazio
    della stessa azienda.
  - `portal_material_folder_move` rinomina o sposta una cartella riscrivendo il
    prefisso di file e cartelle in una transazione sola. Rifiuta una cartella
    dentro sé stessa, e oltre dieci livelli rifiuta tutto, non metà. Se la
    destinazione esiste i contenuti si uniscono. Il vincolo di unicità è
    differibile: salire di un livello scambia i percorsi fra righe della stessa
    operazione.
  - `portal_material_folder_archive` archivia (e rimette in vista) quello che
    c'è dentro una cartella.
  - `portal_material_folder_delete` elimina solo una cartella vuota. Dentro non
    devono esserci file, nemmeno archiviati: un archiviato è ancora lì.
  - `portal_material_rename` rinomina il materiale e il metadato dello storage
    insieme.
  - `portal_material_usage` somma la quota. Senza la 254, `usedMaterialBytes`
    somma a pagine.
- **Il prefisso si confronta con `left()`, mai con LIKE**: in un nome di
  cartella `%` e `_` sono caratteri come gli altri, e LIKE avrebbe spostato
  anche «50xysconto» insieme a «50%_sconto».
- **Una cartella da cui si toglie l'ultimo file non sparisce**: resta, vuota,
  come in qualunque file system (`portal_material_keep_folder`).

Nell'esploratore:
- file e cartelle si trascinano su una cartella, o su una tappa del breadcrumb
  per farli salire. I tipi del trascinamento sono propri
  (`application/x-twobee-*`): un trascinamento dal computer carica, uno interno
  sposta, un link trascinato da un'altra pagina non fa niente;
- per chi usa la tastiera c'è «Sposta in…», con la cartella di partenza esclusa;
- la selezione multipla sposta, archivia ed elimina più file insieme;
- in una cartella si crea una «Nuova cartella»;
- nello spazio del cliente non si carica, ma si mette in ordine.

Senza la 254 l'area si apre lo stesso: `canOrganize` è falso, e le voci per
organizzare non compaiono. Una rotta chiamata lo stesso risponde 503 e dice che
serve la migration.

## Anteprime migliori (§415)

- **Il PDF nella pagina.** `components/shared/PdfViewer.tsx` scarica i byte con
  `fetch` dalla stessa porta autenticata e li disegna con pdf.js su canvas. La
  risposta resta in `sandbox`: il file non diventa mai un documento della nostra
  origine, quindi niente di quello che contiene gira con la sessione di chi
  guarda.
  - `isEvalSupported: false`: pdf.js non compila niente dal file.
  - Le pagine si disegnano fino a 60, con zoom da 50% a 300%.
  - Oltre 100 MB un PDF si scarica (`PDF_PREVIEW_MAX_BYTES`): aprirlo vorrebbe
    dire tenerlo tutto in memoria nella scheda.
  - `pdfjs-dist` è una dipendenza diretta alla stessa versione (5.4.296) che
    `pdf-parse` porta già dentro, quindi non si duplica.
  - Si importa la build **minificata** (`pdfjs-dist/build/pdf.min.mjs`, tipi in
    `types/pdfjs-min.d.ts`): con quella normale il webpack di Next 14 si ferma
    su «Object.defineProperty called on non-object».
- **La miniatura di un PDF** è la prima pagina, disegnata sul server da
  `pdf-parse` e salvata accanto all'originale come le altre. Vale la regola di
  `sharp`: se il modulo nativo del canvas non carica, la rotta risponde 404 e
  resta l'icona. Un PDF illeggibile non promette niente.
- **Testo e CSV**: il primo mega, chiesto col Range. Il testo va in un `<pre>`,
  il CSV in una tabella (prime 200 righe). Il separatore si indovina dalla prima
  riga, perché in Italia è spesso `;`, e le virgolette di un CSV vero si
  rispettano (`lib/portal/csv.ts`). Niente viene interpretato come HTML.
- **Si scorre fra i file** della cartella con le frecce, o con i bottoni. Il
  focus resta dentro la finestra. Un'immagine si guarda adattata o a grandezza
  reale.
- **Fuori, e lo si dichiara**:
  - Office (docx, xlsx, pptx): si scarica;
  - il fotogramma dei video: sulla macchina manca `ffmpeg`;
  - HEIC: il `sharp` precompilato non lo decodifica.

L'anteprima è la stessa per il portale del cliente, che vede i PDF come noi.

## Zip: si scarica una cartella, e uno zip caricato si apre (§421)

**Scaricare.** `GET /api/area-cliente/zip?client=&spazio=&percorso=` scarica
una cartella, o tutto lo spazio. `POST` con i campi `client` e `id` ripetuti
scarica una selezione.
- Lo zip esce **mentre si scrive** (`yazl`, `addReadStreamLazy`): ogni oggetto
  MinIO si apre solo quando tocca a lui, niente resta in memoria, e oltre i 4 GB
  il formato passa a zip64 da solo.
- I file non si ricomprimono, perché quasi tutti lo sono già. Così la dimensione
  totale si sa prima di cominciare, va in `Content-Length`, e il browser mostra
  quanto manca.
- La cartella scaricata è la radice dello zip, e ci sono anche le sue cartelle
  vuote.
- I nomi dentro lo zip si creano su ogni sistema (`safeSegment`): niente
  `:*?"<>|`, niente punti in fondo, niente `CON`. Due file che per Windows hanno
  lo stesso nome diventano `logo.png` e `Logo (2).png` invece di sovrascriversi.
- Il file si chiama «Azienda – Cartella.zip», con `filename*` per gli accenti.
- Gli archiviati restano fuori, come dagli elenchi. Il limite è 5.000 file per
  zip; la selezione si legge a blocchi di 200 id.
- Chi chiude la pagina chiude anche lo zip (`request.signal`).
- Nella pagina lo zip passa da un iframe nascosto. Uno scarico riuscito lascia
  l'iframe su `about:blank`; se la rotta risponde con un errore, l'iframe carica
  quella risposta e la pagina la dice a parole, invece di portare chi guarda su
  un JSON.

**Caricare: uno zip si apre, sempre.** Lo apre il browser
(`components/shared/file-area/zips.ts`, con `@zip.js/zip.js` caricato solo
quando serve). Ogni file che ne esce passa dalla **stessa rotta** di
caricamento, con le stesse guard, la stessa quota e lo stesso elenco dei tipi.
Aprirlo sul server avrebbe voluto dire una seconda porta con regole sue: i
controlli su zip bomb e percorsi scritti due volte.
- Lo zip si legge ad accesso casuale sul `File`: l'indice sta in fondo, e da lì
  si arriva a ogni file senza tenere in memoria il resto. Ogni file si estrae
  quando tocca a lui.
- Il contenuto va in `<cartella corrente>/<nome dello zip>/…`, con i percorsi
  interni.
- `__MACOSX/`, `.DS_Store` e `._*` si saltano. Un tipo non ammesso (un `.exe`)
  si salta, e finisce nel riepilogo con lo zip da cui arriva.
- Prima di cominciare la somma delle dimensioni si confronta con lo spazio che
  resta: se non basta, lo si dice subito e non si carica niente. Scoprirlo a
  metà vorrebbe dire mezza cartella caricata.
- Uno zip protetto da password, rovinato o in un formato che non leggiamo
  (deflate64) non si apre: lo si dice, e si chiede di estrarlo sul computer.
- Uno zip dentro uno zip resta un file: aprirli tutti vorrebbe dire non sapere
  più dove si finisce.
- Vale anche per il portale: uno zip del cliente arriva già aperto.

Il server riconosce `.zip`, `.rar` e `.7z` dall'**estensione**
(`ARCHIVE_EXTENSIONS`), come i file di progetto: il browser li dichiara come
capita, e un `.rar` del cliente veniva rifiutato. Rar e 7z restano file, perché
nel browser non si aprono. Il tipo di un file che esce da uno zip si deduce dal
nome (`mimeFromName`).

## Verifiche

```bash
npx tsx lib/storage/access.check.ts
npx tsx scripts/check-storage-routes.ts
npx tsx scripts/check-portal-download-route.ts
npx tsx scripts/check-portal-materials-routes.ts
npx tsx scripts/check-area-cliente-routes.ts   # rotte del team + scheda File
npx tsx lib/portal/explorer.check.ts           # cartelle, ordine, ricerca, nomi e spostamenti
node scripts/check-portal-sql.mjs               # 244→251, poi 254 sopra le prove della 251
npx tsx lib/portal/zip.check.ts               # nomi dentro lo zip e dello zip
NODE_PATH=<playwright> node scripts/check-area-file-browser.mjs   # l'esploratore in un browser vero
node scripts/check-storage-sql.mjs
```

Prove API sui 10 handler interni e sul download pubblico, usando le guard vere
e confini Supabase/MinIO simulati: anonimo, due ruoli cliente/ospite,
disattivazione, errori profilo, letture RLS, contesti e parent alterati, viewer,
rollback upload, figli/file altrui anche oltre la prima pagina, revoca,
scadenza, vecchi link privati, alias verso oggetti sensibili e errori senza
dettagli interni. Nessun accesso MinIO prima dei controlli.

La suite SQL usa PostgreSQL 16 effimero senza rete, struttura minima dichiarata
e le migration reali 108/109/246. Verifica anche grant diretti, owner legacy
cliente, policy del contesto, trigger, CASCADE e atomicità del rinnovo. La 246
è eseguita due volte. Non vengono creati account o file di prova in produzione.

Ricognizione produzione eseguita **in sola lettura** prima dell'applicazione:
RLS 108/109 presente; 4 file (2 `clients/client`, 2 `feedback/feedback`),
1 cartella `clients/client`, 0 link pubblici, nessun parent di contesto diverso.
La 246 è stata poi applicata su incarico del committente, versione
`20260921150329`. Riletti grant, 6 policy restrittive e 3 trigger. Le letture
staff e lo scope feedback passano anche sul database reale; un'identità senza
profilo non vede file, cartelle o token. Nessun file, cartella o condivisione
creato/eliminato dai controlli; conteggi invariati. TypeScript, 80 check di
dominio, suite API e SQL superati prima del push.

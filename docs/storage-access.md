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

Il **PDF non ha anteprima**, e non è una dimenticanza: la risposta porta
`Content-Security-Policy: sandbox`, e un PDF in un iframe sandboxato il browser
non lo apre. Togliere quell'header per far vedere un'anteprima sarebbe scambiare
una comodità con la ragione per cui i file sono privati.

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

## Verifiche

```bash
npx tsx lib/storage/access.check.ts
npx tsx scripts/check-storage-routes.ts
npx tsx scripts/check-portal-download-route.ts
npx tsx scripts/check-portal-materials-routes.ts
npx tsx scripts/check-area-cliente-routes.ts   # rotte del team + scheda File
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

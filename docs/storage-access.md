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

## Verifiche

```bash
npx tsx lib/storage/access.check.ts
npx tsx scripts/check-storage-routes.ts
npx tsx scripts/check-portal-download-route.ts
npx tsx scripts/check-portal-materials-routes.ts
npx tsx scripts/check-area-cliente-routes.ts
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

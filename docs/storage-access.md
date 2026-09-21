# Accesso ai file — step 1 portale cliente

21 settembre 2026 · migration 246 **applicata in produzione**
(`20260921150329`); codice nel rilascio su main per Coolify.

## Il confine

`/api/files/**` gestisce **allegati interni**. Serve un account staff attivo,
con `role` e `app_role` coerenti negli elenchi di `lib/permissions.ts`.
Clienti e ospiti non passano neppure se hanno una membership portale attiva o
risultano proprietari di un vecchio file. Le letture del file e delle cartelle
usano il client di sessione e la RLS; il client privilegiato viene creato solo
dopo il controllo d'identità/ruolo e le scritture dichiarano `x-actor-id`.

La visibilità sul portale richiede un'altra domanda: **questa versione è
pubblicata per il mio progetto e la mia membership è ancora valida?** Il
download autenticato delle versioni pubblicate e l'upload dei materiali cliente
sono nello step successivo. Non usare il download generico o un link anonimo
per collegarli in fretta: aggirerebbe pubblicazione, scope progetto e revoca.

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
  insieme. `clients` richiede `client`; `feedback` richiede `feedback`.
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

## Verifiche

```bash
npx tsx lib/storage/access.check.ts
npx tsx scripts/check-storage-routes.ts
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

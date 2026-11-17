# Controllo totale banca e raccordi — 17 novembre 2026

## Mandato e perimetro

L’utente ha richiesto il controllo dal primo all’ultimo movimento, il raccordo dei riscontri certi e una sezione manuale semplice per gli altri casi. È autorizzata l’applicazione dei raccordi univoci; non serve richiedere di nuovo il permesso generale. Il mandato supera la precedente sola preparazione per questa capacità nel Lab, senza autorizzare accoppiamenti ambigui, riclassificazioni arbitrarie, cancellazioni dei fatti bancari o sostituzione Economics.

Il salvataggio reale resta tecnicamente bloccato: nella produzione letta mancano le tabelle del registro (migration 281); non risultano connessione SQL, password DB o Management API token nella configurazione locale, né tool SQL collegati. Richiesta la posizione della connessione già configurata o il collegamento Supabase, senza chiedere password in chat. Nessuna scrittura viene dichiarata avvenuta. Non aggirare il registro con PATCH privilegiati ai vecchi campi: perderebbe quote, cronologia e controlli di concorrenza.

## Nuovo audit reale

Riletti 349 record bancari complessivi: 318 di origine banca, dal 28 aprile al 17 novembre 2026, e 31 manuali/derivati separati. Confronto con la lettura precedente: 11 nuovi movimenti, nessuna variazione a importi/date/descrizioni dei record già esistenti. BPM e Vivid hanno entrambi ultimo movimento al 17 novembre. Saldi ricostruiti: BPM 11.807,72 €, Vivid 383,38 €. Il saldo dichiarato Vivid disponibile nel registro resta al 21 settembre: l’aggiornamento dei movimenti non è una nuova certificazione di chiusura.

Fornitori: 87 corrispondenze esatte candidate (4 Asana, 4 Slack, 4 Canva, 5 OpenAI, 4 Anthropic, 60 Meta, 6 Google). Per Meta coincidono anche i riferimenti FACEBK; restano esclusi 9 tentativi falliti e 1 duplicato Slack. Fatture Google ora 9, di cui 2 a zero: sei corrispondenze esatte; la GCITD0007205722 da 148,23 € ha un possibile riscontro parziale da 37,05 €, con 111,18 € da spiegare. Un addebito Google precedente da 111,18 € non viene sommato arbitrariamente: precede l’emissione e può riguardare altro periodo. Nessuna assenza di riscontro viene chiamata mancato pagamento.

L’F24 di 872,67 € è già registrato e raccordato al movimento BPM del 17 novembre dal flusso di caricamento dell’utente; nessuna nuova quota duplicata. Il documento F24 di luglio da 941,42 € ha un addebito coincidente ma manca ancora il raccordo formale nel registro F24. Il controllo IVA del terzo trimestre non trova modello/attribuzione del versamento: non confondere il nuovo F24 personale con IVA trimestrale.

Quattro proposte soddisfano le nuove regole automatiche sui documenti già registrati e liberi:

| Movimento | Documento | Importo |
|---|---|---:|
| Leo Fatima · 16 novembre | FPR 68/26 | 2.562,00 € |
| Google · 24 ottobre | GCITD0007942602 | 5,00 € |
| Google Workspace · 1 novembre | GCITD0008034463 | 177,88 € |
| Google Workspace · 2 ottobre | GCITD0007844319 | 177,88 € |

Queste quattro sono **pronte al controllo di salvataggio**, non applicate in produzione. Le 87 proposte più ampie includono documenti PDF ancora solo archiviati, quote occupate e rettifiche: non sono tutte automaticamente salvabili.

## Gabriele: informazione dell’utente e discrepanze

L’utente dichiara passaggio da 1.300 a 1.500 €/mese da settembre. L’anagrafica conserva `gross_year=15600` (equivalente 1.300 mensili); le righe di settembre, ottobre e novembre sono ancora a 1.300 e senza fattura collegata. Le fatture 6/2026, 7/2026 e 8/2026, emesse da settembre, sono da 1.500. La 6/2026 è collegata alla riga economica di agosto già da 1.500: richiesta precisazione sulla decorrenza per competenza oppure per emissione, prima di modificare lo storico. Non aggiornare soltanto l’annuo corrente facendo retroagire l’aumento su tutti i mesi.

Anomalia prioritaria: la fattura 7/2026 di Gabriele è riferita al movimento del 19 ottobre intestato ad Annalisa Smiraglia. Esiste quel giorno un bonifico distinto a Gabriele, già allocato per 1.500 alla sua riga di settembre da 1.300. Correzione da preparare come riallineamento documentale e della riga pertinente, preservando il bonifico e la riga di Annalisa; non basta accoppiare i due importi uguali. Nessuna correzione finanziaria effettuata da questo audit.

Restano inoltre 43 righe con riferimenti storici da raccordare nell’audit economico; il numero non indica 43 mancati pagamenti. Tre ricavi ricorrenti e un elemento di piano risultano senza occorrenza nei mesi esaminati; due divergenze commerciali sono globali e non vanno moltiplicate per ogni mese del rapporto.

## Sezione operativa

`/lab/raccordi` apre «Controlla e raccorda», con intero storico e viste Da lavorare, Proposte univoche, Con fattura, Altre causali e Tutti. Ricerca, conto, causale, date, righe compatte e dettagli progressivi; scorrimento unico e caricamento progressivo senza perdere l’archivio completo. «Registro e storico» mantiene modifica, revoca e verifica dei collegamenti salvati.

Le causali distinguono incassi/pagamenti, risorse/beneficiari, F24, giroconti/finanziamenti, rimborsi/cashback/accrediti ed esclusi operativi. La classificazione è una guida in lettura, non una scrittura contabile. Un accredito Vivid senza descrizione specifica rimane da classificare, non viene dichiarato cashback certo. Nascosti e giroconti rimangono fatti di cassa. I riferimenti a più destinatari indicano una distinta da verificare, senza sommare due volte il totale. Una controparte non riconosciuta rispetto alla fattura apre un controllo, non cancella il rapporto preesistente.

Dal movimento si apre il popup esistente per un movimento→N fatture o N movimenti→una fattura. Gruppi insufficienti non vengono distribuiti automaticamente; è possibile scegliere e confermare una fattura alla volta, lasciando il residuo disponibile. I suggerimenti cercano ora anche gruppi di 4–12 candidati, con soggetto forte e date entro 14 giorni; ricerca limitata a 4096 nodi per gruppo, alternative e limiti dichiarati. Restano proposte manuali.

## Raccordo automatico

`certainReconciliationPairs` usa l’intero archivio ricevuto, senza il taglio a 400 delle sole raccomandazioni. Accetta soltanto 1:1, importo intero esatto senza quote già usate, residuo confrontabile intero, EUR, verso coerente anche per note di credito, data fra emissione e +14 giorni, identità forte senza refusi, originale XML/P7M/PDF associato, nessuna rettifica/avvertenza bloccante o riferimento bancario preesistente al documento. Deve essere l’unica combinazione ammissibile in entrambi i sensi. Il valore nullo del pagato resta nullo: è l’assenza di quote registrate, con residuo intero confrontabile, a consentire la proposta; non viene certificata l’assenza di altri pagamenti fuori archivio.

L’endpoint POST `/api/lab/reconciliations/automatic` richiede i gate Economics e Lab, prende l’attore dalla sessione e usa `createActorClient`. Il browser invia soltanto nonce e fotografia; destinatari e quote vengono ricalcolati lato server. Prima di ciascun salvataggio si rileggono le fonti e si verifica che la stessa coppia sia ancora univoca; la RPC esistente controlla e salva la singola quota atomicamente con cronologia e limiti di capienza. Nessuna verifica umana simulata.

Massimo 20 per richiesta. Il gruppo completo non è una singola transazione: risultati salvati, saltati o interrotti sono espliciti. Identità dei comandi deterministica per coppia/nonce e ripresa da eventi del tentativo precedente, per evitare duplicazioni dopo un errore di rete. L’interfaccia conserva anche la fotografia del tentativo durante un retry. Senza schema non parte alcun comando e l’API risponde 503/no-store.

## Verifiche e limiti

Nuovo gate `lib/lab-bank-review.check.ts`: tutti i fatti bancari una sola volta, esclusione dei manuali/futuri, risorse, F24, cashback, giroconti, distinte e beneficiari discordanti. Gate suggerimenti esteso a originali mancanti, omonimie/importi identici, beneficiari diversi, parziali, anticipi, provider e cumulativi oltre tre fatture. TypeScript e suite completa di 148 gate passati; nuove regole anche in altri fusi.

Verifica visiva autenticata e applicazione automatica reale ancora aperte: browser disponibili nella sessione = nessuno e registro SQL non attivo. Nessun successo di scrittura viene inferito dai soli test o dalla presenza del pulsante. Build finale passata. Ventuno ingressi anonimi conservano i parametri nel redirect al login; 29 chunk Lab e 2 chunk del popup rispondono 200/JavaScript. GET/POST raccordi e POST automatici anonimi rispondono 403/no-store. Anche API automatica verificata senza scritture finanziarie. Non è stata eseguita una conferma automatica reale con database attivo.

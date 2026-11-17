# Raccordi in popup e registro modificabile — 17 novembre 2026

## Mandato corrente

L’utente richiede esplicitamente ricerca e filtri dei due archivi in popup, conferma/salvataggio e area raccordi modificabile, verificabile e cancellabile. Questo supera il precedente limite di sola anteprima per i **raccordi**, senza autorizzare la sostituzione di Economics, la digitazione di importi economici o rettifiche automatiche dello storico. Le altre sezioni Lab mantengono i rispettivi perimetri.

## Percorso

In Banca «Collega fatture» apre il popup sul movimento; in Fatture «Collega movimenti» apre sul documento. «Raccordi banca e fatture» nella navigazione comune apre `/lab/raccordi`, con «Nuovo raccordo». Il vecchio `/lab/abbina` conserva gli ingressi e indirizza al popup, senza mantenere due interfacce.

Dialogo nativo con focus modale, Escape e conferma di scarto, due elenchi ricercabili separatamente per nome/causale/numero/importi, conto, date, verso e tipo di documento. Su telefono i due elenchi hanno tab nella stessa finestra. Le selezioni restano visibili durante i filtri; ricaricare le fonti conserva le scelte ancora disponibili. Fonti apribili in un’altra scheda. Riepilogo delle quote e residui, nota facoltativa e «Salva e conferma». Durante il salvataggio i controlli sono bloccati.

Si opera un movimento→più fatture oppure una fattura→più movimenti. L’insieme dei raccordi è molti-a-molti, anche con più gruppi sullo stesso movimento o documento. Un cumulativo insufficiente per tutti i residui o movimenti eccedenti il residuo documentale richiedono componenti documentali: nessuna ripartizione arbitraria e nessun importo libero digitato.

Registro con filtri di stato/date/tipo/ricerca, quote e fonti, modifica/ottimizzazione delle selezioni, verifica manuale con autore/data, rimozione con conferma e storico. Una modifica annulla la verifica precedente. Cancellare un raccordo disattiva i collegamenti e libera le quote; non elimina movimenti, fatture o cronologia. La verifica manuale non certifica la completezza degli estratti.

Per i nuovi raccordi il popup propone anche [suggerimenti motivati](suggerimenti-raccordi-2026-11-17.md), applicabili alla selezione prima della verifica manuale.

## Spazio di lavoro aggiornato

Il popup usa quasi tutta la finestra (altezza 96dvh, larghezza 98vw fino a 1600px). Un solo scorrimento nel corpo comprende avviso, strumenti, filtri, elenchi e riepilogo: nessuna lista o pannello quote ha più un proprio scorrimento annidato. Restano fissi soltanto titolo/chiusura e azioni finali. Su desktop gli archivi sono affiancati; su telefono restano le tab.

Righe compatte con nome, data, conto e disponibile/residuo; causale, totale e prova sono espandibili. Quote, residui e nota sono nel riepilogo espandibile. «Controlla» nella barra finale apre il riepilogo e lo porta in vista, mostrando sempre conteggi e totale valido. Il comando di ricarica è negli strumenti scorrevoli. Nessuna modifica a quote, suggerimenti o condizioni di salvataggio. TypeScript, 147 gate e build passati dopo il riassetto; verificati redirect anonimi, API protette e chunk dinamico del popup. Prova visiva autenticata ancora aperta: browser disponibili nella sessione = nessuno.

## Persistenza e controlli

Tre tabelle deny-all: `bank_invoice_reconciliations`, `bank_invoice_reconciliation_items`, `bank_invoice_reconciliation_events`. RPC `save_bank_invoice_reconciliation` invoker, eseguibile solo dal service role, con attore dalla sessione verificata e controllo super admin attivo anche nel database. La route richiede sia il gate Economics sia il gate Lab; usa `createActorClient`. Nessuna identità accettata dal corpo del browser.

Salvataggio atomico, quote ricalcolate nel database, limiti globali per movimento e fattura, direzione/valuta/origine bancaria, versione attesa e comando idempotente. Il server confronta la fotografia vista nel popup; un cambiamento richiede nuova lettura e conferma. Il comando ripetuto non duplica il raccordo; il suo identificativo determina anche il nuovo gruppo, per gestire invii simultanei della stessa richiesta.

Lock transazionale comune prima degli statement e dei lock sulle righe. I percorsi precedenti non possono sovrascrivere quote attive; funzioni e trigger già esistenti non vengono riscritti. Il registro ha uno storico proprio immutabile con attore, richiesta e fotografie prima/dopo. Le letture separate verificano che testate, quote e eventi appartengano alla stessa versione; una lettura mista fallisce esplicitamente.

Le nuove quote alimentano la lettura comune Banca/Fatture e i grafici per data bancaria. Non creano una seconda entrata/uscita e non riscrivono spunte, competenze, `paid_on` o percentuali dei soci. La cassa continua a provenire soltanto dai movimenti reali.

## Storico precedente

Il registro mostra anche i riferimenti diretti `bank_transactions.invoice_id`. Un collegamento semplice si può acquisire o rimuovere con storico: la RPC verifica il riferimento atteso e conserva quello precedente prima di liberare il vecchio campo. Se intervengono quote economiche, F24 o risorse, il sistema richiede prima la verifica delle prove e non cancella automaticamente quelle attribuzioni. Questi casi complessi non sono dichiarati automaticamente convertiti o modificabili.

## Attivazione

Migration additiva `281_bank_invoice_reconciliations.sql`, numerata con il comando del repository. Schema API di produzione letto il 17 novembre: le tre nuove tabelle e una capacità SQL non sono presenti nell’API collegata. Sono disponibili URL e service key per REST, non una connessione SQL. È stata richiesta all’utente la posizione della connessione già configurata, senza chiedere password in chat. Individuata anche l’integrazione Supabase disponibile: al controllo risulta non installata; proposta all’utente per abilitare l’accesso SQL. Nessuna connessione è dichiarata attiva senza conferma.

La migration **non è applicata in produzione** al checkpoint corrente. Senza schema, popup e registro mostrano un avviso e impediscono il salvataggio; non mostrano un successo fittizio e le vecchie letture restano disponibili. Prima dell’applicazione serve accesso SQL per controllare il catalogo effettivo e verificare trigger/permessi dopo l’attivazione. Nessun raccordo reale è stato modificato automaticamente.

## Verifiche riproducibili

`lib/lab-reconciliations.check.ts`: quote persistenti, pagamenti frazionati, duplicazioni legacy, versioni miste, filtri e date Rome. Suite completa `lib/**/*.check.ts` e TypeScript.

SQL su PostgreSQL embedded PGlite 0.3.14, installato fuori dal repo, senza rete o credenziali del prodotto durante le prove:

```sh
TWOBEE_PGLITE_MODULE=/tmp/twobee-reconciliation-sql/node_modules/@electric-sql/pglite/dist/index.js node scripts/check-reconciliations-sql.mjs
```

Il runner applica due volte la migration su fixture sintetiche, prova atomici/multi-pagamento/capienze globali, versioni, verifica, revoca, adozione e rimozione dello storico, attribuzione, idempotenza, accesso negato ad anon/authenticated e protezione dalle scritture concorrenti legacy tramite lock. Tutte le operazioni di prova vengono annullate. La prova di carico con connessioni PostgreSQL concorrenti indipendenti e la prova visiva autenticata del popup restano aperte; nessun browser è collegato alla sessione.

## Esiti del checkpoint

TypeScript, 146 gate e build passati. Nuovi modelli anche UTC e America/Los_Angeles. Runner SQL passato con migration applicata due volte, invocazione effettiva come `service_role`, rimborsi controllati e importi non finiti rifiutati; transazioni di prova annullate. Ventuno ingressi anonimi 307 con parametri conservati, ventisette chunk Lab e il chunk dinamico del popup HTTP 200/MIME JavaScript. GET/POST raccordi anonimi 403/no-store. Nessuna verifica visiva autenticata, prova di concorrenza su connessioni PostgreSQL indipendenti o advisor Supabase dichiarati eseguiti; richiedono le connessioni ancora mancanti.

# Completamento Laboratorio prima della sostituzione

## Abbinamento guidato — 16 novembre 2026

Due percorsi semplici per cumulativi e pagamenti frazionati, selezione ricercabile e riepilogo quote/residui. [Esperienza e limite operativo dell’anteprima](abbinamento-banca-fatture-2026-11-16.md). Nessuna conferma persistente o sostituzione Economics.

Mandato: completare le capacità mancanti mantenendo Economics operativo. La sostituzione richiede un nuovo via libera esplicito dell’utente; push su main non significa promozione. Il perimetro attuale mantiene Lab e DB in sola lettura.

## Capacità aggiunte

- `/lab/verifiche`: coda filtrabile per mese, area, priorità e ricerca; link alla prova e ritorno alla voce. Banca: quadrature e ancore documentali, giroconti incoerenti, riferimenti contraddittori, movimenti senza fonte. Fatture: quote mancanti, parziali, eccedenti o in conflitto. Competenze: riferimenti documentali, occorrenze previste non registrate e problemi del motore canonico. Risorse: costo/documento incompleto o stimato; F24 senza quadratura o copertura; anomalie di registrazione dei compensi soci. Nessuna nuova formula economica. Cause sovrapposte non sommate come problemi indipendenti.
- Ogni fonte indisponibile rende la lista esplicitamente parziale. Nessuna voce con i filtri attivi non equivale a mese certificato. Banca e competenze riguardano il mese; fatture/F24 includono lo storico fino al taglio del mese. Le prove economiche e le finestre compensi mantengono l’osservazione corrente del proprio motore.
- CSV delle verifiche filtrate con motivo, prossima azione, fonte, data, valuta e significato dell’importo. Importo di un movimento e residuo fattura non si sommano né ricevono la stessa etichetta.
- `/lab/fonti`: anteprima CSV/camt con parser e impronte canonici. POST autenticata, sola lettura, no-store, corpo limitato prima del parsing, limite righe; nessun file o movimento salvato. Storico senza impronte esplicito. Conto e valuta originali restano da verificare; saldo dichiarato del file non è quadratura certificata. Importazione effettiva raggiungibile nel percorso esistente.
- Grafici: salvataggio/ripristino JSON delle impostazioni, senza righe o importi; validazione di versione, grafico, serie, gruppi e date. Ricerca potenzialmente personale dichiarata; nessun salvataggio automatico nel browser.

## Matrice prima della sostituzione

| Capacità | Disponibile | Da completare/verificare |
|---|---|---|
| Banca e documenti | Lettura comune, quote, filtri, prove e coda. | Copertura degli estratti e decisione sui registri conflittuali; import e conferma/revoca autonomi del nuovo percorso. |
| Accordi e competenze | Calendari, righe, piano e scostamenti canonici. | Raccordi mancanti e copertura completa dei comandi di gestione, senza duplicare motori. |
| Risorse e soci | Parti note, documenti, finestre e prove bancarie. | Documenti mancanti, identità/registrazioni/regolamenti non ricostruibili; verifica debito cumulativo. |
| Fiscale | IVA, modelli e prove F24. | Riporti, compensazioni e detraibilità documentati; parità con tutte le capacità fiscali attuali. |
| Risultati e scenari | Competenza/cassa separate, scenari e grafici. | Base di cassa verificata, obblighi e residui completi; confronto numerico sullo stesso snapshot. |
| Acquisizione | Anteprima banca e accesso al caricamento attuale. | Acquisizione/decisioni del nuovo percorso con cronologia, atomicità, idempotenza e test di concorrenza. |
| Esperienza | Percorsi, dettagli, filtri, esportazioni e viste riutilizzabili. | Prova autenticata desktop/mobile, tastiera, contrasto e flussi reali. |
| Sostituzione | Economics attuale mantenuto. | Matrice ruoli autenticati, prestazioni misurate, parità funzionale, redirect/ripristino e via libera utente. |

Questa matrice è un inventario di consegna, non una certificazione automatica di prontezza. Le modifiche alla produzione finanziaria, le migration e l’attivazione di comandi persistenti nel Lab non sono state eseguite. Nessun valore è inventato per chiudere le mancanze.

## Prova d’uso da eseguire con sessione autenticata

| Percorso | Risultato da verificare |
|---|---|
| Verifiche → movimento → fattura → ritorno | Stessa voce della coda, filtri e mese conservati; importo del movimento distinto dalla quota. |
| Verifiche parziali/fonte indisponibile | Avviso esplicito; nessuna attestazione di mese completo da un elenco vuoto. |
| Fattura parziale/cumulativo/rimborso | Nessuna duplicazione del movimento; verso e residuo corrispondenti alle prove. |
| Risorsa/F24/socio → prova → ritorno | Persona, competenza e documento corretti, senza sommare costo, netto e pagamento. |
| Anteprima dello stesso estratto due volte | Stesso esito sulle stesse impronte; nessuna modifica dei record o upload nello storage. |
| Anteprima: cambio conto/file durante richiesta | Esito vecchio non presentato come risultato del nuovo file; scarti e limiti visibili. |
| Vista grafico JSON valida/non compatibile | Filtri e serie ripristinati soltanto sul grafico corretto; nessun cambiamento in caso di errore. |
| CSV con importi negativi e testo formula | Importi restano numeri, testo non eseguito come formula; fonte e filtri presenti. |
| Telefono, desktop, temi, tastiera | Controlli raggiungibili, tabelle nel contenitore, contrasto misurato nel DOM. |
| Ruoli e API | Super admin attivo ammesso; anonimo, portale e ruoli non ammessi respinti prima di leggere i dati. |

Questi casi sono una checklist da eseguire, non esiti dichiarati. La sessione browser disponibile alla CLI restituisce nessun browser collegato.

## Verifiche eseguite

TypeScript senza errori e build di produzione finale passata. 144/144 gate Europe/Rome passati; nuovi controlli della coda e delle viste anche UTC e America/Los_Angeles. Diciotto ingressi anonimi HTTP 307 verso login con parametri conservati; venticinque chunk Lab HTTP 200/MIME JavaScript. POST anteprima senza sessione HTTP 403 e no-store. Prova autorizzata del file, matrice ruoli autenticati, rendering e interazioni nel browser non dichiarati eseguiti. Nessuna scrittura finanziaria o promozione.

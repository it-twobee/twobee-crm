# Banca e fatture — consolidato di cassa

Il consolidato di cassa del nuovo Laboratorio comprende soltanto movimenti di origine banca già osservati. Registrazioni manuali, derivati, spunte e date di pagamento del registro non generano fatti bancari. Maturato, fatturato e previsto restano misure distinte. Nessuna sezione Economics in uso viene sostituita: la promozione richiede il via libera esplicito dell’utente.

## Raccordo comune

Banca e Fatture usano `lib/lab-invoice-bank.ts`: emesse↔entrate, ricevute↔uscite; note di credito e rimborsi invertono il verso. Collegamenti soltanto tramite identificativi espliciti, mai nome o importo simile. Quote cumulative contate una volta; quote correnti e storiche equivalenti non si duplicano. Divergenze, sovra-allocazioni, valute incompatibili, riferimenti contraddittori e quote senza evidenza restano da verificare. Giroconti e cedolini non diventano pagamenti fattura.

La presenza di una fattura non è necessaria perché il movimento rimanga nella cassa. I nascosti restano fatti bancari. La parte non spiegata da fatture non è capienza disponibile: può essere già attribuita a persone, F24 o altri destinatari. Ritenute e rettifiche conservano i passaggi bancari ma sospendono il residuo documentale non confrontabile.

In Banca: filtri per emesse, ricevute o assenza di riferimenti fattura; quote e accesso al documento per movimento. In Fatture: quote attribuite, residuo del raccordo, collegamenti ai movimenti e anomalie. Grafico principale per data bancaria delle quote; registro per emissione separato. I totali del conto non vengono trasformati nei totali della selezione documentale. Un residuo calcolabile non certifica la completezza degli estratti.

## Riscontro in lettura

Audit del 16 novembre 2026, osservazione 18:46:26 UTC, GET separate non transazionali: 307 movimenti bancari reali; 86 con riferimenti fattura; 49 con quote attribuibili; 50 fatture con quote bancarie note. Su 120 documenti: 47 coperti, 26 senza riscontro, 45 da verificare, uno parziale, uno eccedente. Questi stati descrivono il raccordo letto, non certificano tutto l’archivio. Nessun collegamento finanziario è stato scritto o corretto in produzione.

## Ordine del completamento

1. Banca e fatture: lettura comune, quote e anomalie verificabili.
2. Copertura estratti e fonti mancanti; coda unica delle anomalie con prossima azione.
3. Risorse, soci e fiscale: obblighi, competenze e pagamenti senza duplicazioni.
4. Risultati e previsione: perimetri espliciti e base di cassa verificata.
5. Operazioni complete: acquisizione, conferma/revoca tracciata, concorrenza e idempotenza. Il Lab attuale rimane in sola lettura.
6. Confronto vecchio/nuovo, prova autenticata desktop/mobile e temi, permessi, prestazioni e piano di ripristino.
7. Sostituzione modulo per modulo solo su indicazione dell’utente.

Le prove automatiche non sostituiscono la verifica visiva autenticata, ancora aperta perché nessun browser autenticato è collegato alla sessione CLI. Nessuna migration o promozione introdotta.

## Verifiche del blocco

TypeScript senza errori, 142/142 gate Europe/Rome e build di produzione passati. Nuovo raccordo verificato anche UTC e America/Los_Angeles. Sedici ingressi anonimi HTTP 307 verso login con parametri conservati; venti chunk Lab HTTP 200 con MIME JavaScript. La prova autenticata resta distinta e aperta.

# Grafici Economics nel Laboratorio

Le nuove viste restano nel Lab e usano i dati già letti dalle sezioni. Il componente client non legge il database e non modifica registri. Non sono state aggiunte dipendenze o route pubbliche.

| Sezione | Grafico e fonte |
|---|---|
| Banca | Movimenti EUR di origine banca nel mese e conto selezionati, da `bankReadout`; stessi filtri dell’elenco. Entrate e uscite distinte, giroconti/nascosti mantenuti. Nessun consolidato fra conti principali e sottoconti. |
| Fatturazione | Importi lordi con segno da `signedTotal`, per documento visibile nei filtri della pagina; solo EUR. Il documento rettificato resta un documento: non si presenta la somma come residuo o fatturato netto delle rettifiche. |
| Accordi | Canoni mensili e totali a corpo in serie distinte. Un accordo condiviso compare una volta; nessuna quota inventata sui progetti. |
| Risorse | Costo da `resourceCost`, netto da registro e quote note da `salaryEvidence`, per persona e competenza. Onere stimato distinto dal documento; professionisti senza netto personale o pagato dedotto. |
| F24 | Totale del modello e quote da `resourceF24`. La scadenza del modello filtra per data, senza riscrivere la competenza. |
| IVA | Dovuto modello/stima da `vatPeriods`, versato e residuo da `vatPayment`. Compensazioni e mancanze mantengono n/d. |
| Conto economico | Effettivo dai medesimi flussi canonici verso terzi; Maturato dalla parte nota del registro. Grafico separato per maturato/erogabile dei soci, senza trasformarli in somme da bonificare. |
| Previsionale | Linee mensili di ricavi e costi noti dalla base canonica; grafico distinto per i delta dello scenario. Nessun saldo futuro o profitto dedotto dalla distanza fra le linee. |
| Progetti | Venduto/esterni/margine a corpo separati dai valori mensili, da `projectDeal`. Progetti con accordi condivisi senza attribuzione rimangono n/d. |

## Uso

Il grafico parte dalla selezione della pagina. Al suo interno si possono cercare voci, scegliere un gruppo, filtrare le date quando presenti e attivare/disattivare le serie. Questi ulteriori filtri non modificano i totali della pagina. «Personalizza» cambia titolo, barre/linee e ordinamento per nome o valore assoluto. Le impostazioni valgono per l’apertura corrente, senza salvare dati personali nel browser.

Ogni vista mostra al massimo dodici voci; i pulsanti Precedenti/Successive rendono consultabile tutta la selezione. Un punto/barra apre il dettaglio e, quando disponibile, il collegamento alla fonte. Su mobile la vista compatta presenta importi completi e barre sul valore assoluto, con segno esplicito. La tabella accessibile contiene tutte le voci filtrate e i relativi link.

Gli importi si modificano dai registri di origine già collegati alle sezioni. La personalizzazione del grafico cambia la rappresentazione, non riscrive fatture, compensi o movimenti.

## Esportazione

- CSV: tutte le voci filtrate e le sole serie attive, con titolo, note e contesto dei filtri. Separatore punto e virgola, decimali italiani, UTF-8 con BOM. Testi che potrebbero essere interpretati come formule sono neutralizzati; gli importi negativi restano numeri.
- SVG: la vista corrente, con titolo, filtri, legenda e note complete. I colori del tema vengono risolti prima del download, per conservare la leggibilità fuori dall’app.
- PNG: la stessa vista a risoluzione doppia. Il CSV mantiene comunque i valori esatti, anche quando l’asse mostra importi compatti.

Valori mancanti, non finiti o non numerici rimangono n/d; uno zero noto resta zero. Le linee non uniscono punti attraverso valori mancanti. Una vista interamente n/d non mostra un asse con importi inventati. Il CSV resta disponibile anche in quel caso; le immagini richiedono almeno un valore noto nella vista.

## Verifiche e limiti

Il gate `lib/lab-chart.check.ts` verifica date inclusive, ricerca, gruppi, ordinamento senza mutare le fonti, zeri/null e protezione del CSV. Rendering statico su dati sintetici per barre/linee e temi chiaro/scuro; non costituisce prova delle pagine autenticate o dei download nel browser. La sessione CLI non rileva browser collegati: verifica autenticata, contrasto del DOM e download reali restano da eseguire con una sessione supportata.

Verifiche del checkpoint: TypeScript senza errori; 138/138 gate Europe/Rome; build isolata passata; dieci ingressi anonimi 307 verso login con parametri conservati e 18 chunk Lab HTTP 200 con MIME JavaScript. Server locale di prova fermato. Nessuna verifica autenticata dichiarata.

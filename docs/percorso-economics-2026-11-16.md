# Percorso Economics — semplificazione del 16 novembre 2026

Il flusso principale è riconoscibile dal riepilogo e da ogni modulo: patto → documento → movimento → risultato. Persone, F24 e IVA alimentano la verifica; il Previsionale rimane una lettura distinta delle scelte future. Tutto resta nel Laboratorio, super admin e sola lettura. Le sezioni di gestione sono raggiunte per modificare la fonte; nessun nuovo comando monetario, schema o promozione è introdotto.

## Struttura comune

- Riepilogo del mese con un punto di partenza, quattro passi e controlli dei riferimenti delle registrazioni presenti. Le viste precedenti restano in un dettaglio secondario.
- Sei ingressi principali; IVA raggiungibile in Risorse & tasse e dai suoi riscontri, senza diventare un obbligo della singola risorsa. Progetti resta consultabile separatamente.
- Barra compatta di sezione: azione primaria per leggere dati/prove, accesso a Sintesi e Grafici, fonti e criteri apribili. Le guide non offrono collegamenti al contenuto quando la fonte del modulo è indisponibile.
- Selettore mese in una sola riga; filtri di pagina e campi di ritorno mantenuti anche nei form GET. Il mese di lavoro è indicato come contesto: non filtra implicitamente lo storico documentale o l’orizzonte futuro.
- Dettagli, personalizzazione e formati di esportazione dei grafici apribili a richiesta. L’analisi mensile dei canoni dei progetti è secondaria rispetto ai valori a corpo.
- Stato di caricamento esplicito durante l’apertura delle sezioni, senza importi fittizi o zeri provvisori.

## Ritorno e tracciabilità

`LabJourneyProvider` condivide soltanto il contesto di navigazione, non copia dati economici e non salva dati nel browser. `LabLink` mantiene il mese della destinazione quando esplicito; aggiunge il mese di contesto solo dove manca. `from` indica la sorgente immediata, `origine` conserva il punto di ingresso del controllo. I campi di ritorno non vengono annidati ricorsivamente.

Il ritorno riprende filtri di pagina, identificativi selezionati e ancoraggio della voce per movimenti, documenti, accordi, risorse, F24, righe economiche, schede soci e progetti. Se l’ancora è dentro un dettaglio chiuso, il percorso lo riapre. Anche le schede di gestione riconoscono i nomi delle destinazioni Lab nel BackLink esistente. Il riepilogo del mese resta sempre raggiungibile; non si dipende dalla cronologia del browser per ritrovare il controllo.

Gli indirizzi di ritorno ammessi sono URL locali del Lab, con lunghezza limitata. Protocol-relative, URL esterni, caratteri di controllo, backslash, percorsi fuori Lab e slash/backslash codificati nel percorso vengono rifiutati. Questo contesto non concede permessi: ogni destinazione conserva il proprio gate server-side.

I filtri interni dei grafici restano locali all’apertura del grafico; non vengono presentati come filtri dei totali della pagina. Il ritorno garantisce il contesto URL della pagina, non una certificazione dei dati o il salvataggio di una vista personalizzata.

## Grafico adatto alla domanda

| Sezione | Vista principale | Apertura della fonte |
|---|---|---|
| Accordi | Barre sugli importi pattuiti, con selezione esclusiva fra canoni mensili e totali a corpo. Frequenza sconosciuta non trattata come totale a corpo. | Accordo selezionato, calendario e righe. |
| Banca | Linee dei flussi giornalieri EUR, un conto alla volta, identificato per ID anche con nomi uguali; `balance` sui movimenti di `bankReadout`, inclusi nascosti e giroconti come nel registro. Giorni senza registrazioni non inventati. | Giorno e conto, con filtro esplicito dell’elenco. Totali del mese invariati. |
| Fatture | Serie mensile degli imponibili con segno dal canonico `byMonth`, sulle sole fatture della selezione ed EUR. Non è incasso né credito residuo. | Mese di emissione esplicito, cumulabile con trimestre e stato; il documento selezionato per ID conserva la precedenza. |
| Risorse / F24 | Barre per persona con costo/netto/quote note distinti; modelli e riscontri separati nella vista F24. | Persona o modello con documenti e movimenti. |
| IVA | Barre per trimestre su dovuto modello/stima, versato provato e residuo, senza sommare componenti come nuove uscite. | Liquidazione, fatture, competenze e modello. |
| Conto economico | Confronto delle misure note del mese, Effettivo e Maturato distinti; quote soci in un grafico proprio. | Movimenti o righe del registro e dettaglio dei compensi. |
| Previsionale | Linee mensili della parte nota; delta dello scenario separati. I vuoti restano vuoti, non vengono interpolati come importi. | Registro per mesi già presenti; accordi per mesi proiettati; ipotesi del form per il delta. |
| Progetti | Barre per venduto, esterni e margine del patto; valori a corpo separati dai canoni mensili. | Progetto di origine, senza quote inventate per accordi condivisi. |

Le linee mantengono ordine e distanza delle date; i confronti per voce usano barre. I grafici temporali ospitano fino a 36 punti per vista e diradano le etichette, senza eliminare dati dalla tabella o dal CSV. Le viste per categorie mantengono dodici voci e schede compatte su mobile. I grafici temporali sono scorribili nel proprio contenitore su schermi stretti; tabella con importi esatti sempre disponibile. CSV esporta l’intera selezione filtrata con ID e collegamento alla fonte, SVG/PNG la vista corrente, con note e legenda.

## Verifica

Gate nuovi `lab-experience.check.ts` e `lab-chart-data.check.ts`: catena banca→fattura→accordo, origine stabile e ritorni non ricorsivi, ID/filtri/ancore e competenza esplicita, indirizzi non ammessi; flussi giornalieri senza consolidare sottoconti e principali, selezioni per giorno, documenti con segno, mesi intermedi e valute escluse. TypeScript e 141 gate Europe/Rome passati; i due gate anche UTC e America/Los_Angeles. Rendering statico dei grafici su dati sintetici chiaro/scuro, distinto dal DOM autenticato. Build isolata passata; tredici ingressi anonimi HTTP 307 verso login con parametri preservati (inclusi giorno, emissione e ritorni), 20 chunk Lab HTTP 200/MIME JavaScript. Server locale di prova fermato.

Verifica visiva autenticata, contrasto del DOM e prove d’uso touch reali restano aperti: nessun browser collegato nella sessione CLI. Non sono stati letti cookie o simulate sessioni per superare questo limite. Nessuna dichiarazione di promozione o completamento dei raccordi economici pendenti.

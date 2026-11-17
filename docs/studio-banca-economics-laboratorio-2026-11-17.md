# Banca: confronto Economics / Laboratorio

17 novembre 2026. Studio funzionale e di usabilità richiesto dall’utente. Confronto diretto dei componenti e dei percorsi nel repository; immagini del popup fornite dall’utente. Nessun browser autenticato collegato: questa non è una prova visiva dal vivo delle due pagine. Nessuna funzione elencata come proposta è dichiarata implementata da questo studio. Economics rimane operativo e la sua sostituzione richiede l’istruzione esplicita dell’utente.

## Prima integrazione realizzata

Su mandato successivo «ok procedi»: schede conto con saldo ricostruito/data e sottoconti riconoscibili, navigazione Movimenti/Analisi/Controlli, accessi diretti al popup e alle fonti, filtri avanzati espandibili, filtri rapidi entrate/uscite e categoria, filtri attivi rimovibili. Ricerca con invio esplicito anche per importo italiano o decimale, con segno facoltativo (senza segno cerca entrambi i versi). Lista aperta, gruppi giornalieri e righe compatte; prove e documenti nel dettaglio espandibile, aperto sul movimento richiesto. Totale netto dei risultati separato dal saldo e dai flussi dell’intero mese. Il grafico esistente rimane espandibile e conserva l’accesso tramite frammento; clic sul giorno mantiene anche verso e categoria.

Questo intervento non comprende ancora ricerca istantanea, nuovi grafici saldo/controparti, intervalli personalizzati, nuovi stati del registro, CSV della lista o nuove scritture. La matrice seguente resta la roadmap completa. Prova visiva autenticata da completare; nessun browser collegato.

Verifiche del primo intervento: TypeScript, 147/147 gate Europe/Rome e build passati. Gate Banca anche UTC e America/Los_Angeles. Ventuno ingressi più le tre viste con nuovi filtri verificati per redirect e parametri; 27 chunk Lab e chunk popup 200/JavaScript, API raccordi anonime 403/no-store. Prova visuale autenticata non eseguita.

## Decisione di progetto

Banca deve rispondere prima a tre domande: quanto risulta sul conto, cosa è entrato/uscito, cosa devo controllare. Il movimento bancario è il fatto; fatture, righe economiche, cedolini e F24 ne spiegano la destinazione. Un riferimento non è una quota provata; una quota fattura non è automaticamente capienza libera per altri usi.

Recuperare da Economics la leggibilità da home banking e gli strumenti operativi; mantenere nel Lab provenienza esplicita, quote molti-a-molti e navigazione alle prove. Evitare di riportare tutti i pannelli della pagina Economics nella stessa pagina Lab.

## Confronto e integrazioni

| Area | Economics oggi | Lab oggi | Scelta proposta | Priorità |
|---|---|---|---|---|
| Selezione conto | Pulsanti con importo; conti principali distinti dalle tasche | Pulsanti con nome, poi sezioni ripetute per conto | Schede conto con saldo ricostruito, data e stato della verifica; sottoconti in gruppo distinto | P1 |
| Saldo | Importo principale evidente, confronto con dichiarato e disponibile con data | Tre indicatori per conto, fonti espandibili e scarto alla stessa data | Un saldo protagonista sul conto scelto; confronto dichiarato subito sotto; disponibile separato e datato, se presente | P1 |
| Liquidità totale | Totale e giroconti in transito | Somma volutamente n/d con perimetro non verificato | Nessun totale nuovo finché perimetro, valute, sottoconti e duplicazioni non sono verificati | Vincolo |
| Movimenti | Raggruppati per giorno, netto giornaliero, righe compatte apribili | Elenco per conto chiuso di default senza filtri; blocchi documentali estesi per movimento | Elenco aperto come contenuto principale, gruppi giornalieri, dettaglio progressivo | P1 |
| Ricerca | Immediata sul client, tipo e importo | Form GET con query, giorno e riferimenti; ricerca testuale senza importi | Ricerca immediata su controparte/causale/numero e importo; URL condivisibile e cancellazione filtri | P1 |
| Periodo | Giorno, settimana, mese, trimestre, anno nelle analisi | Un mese e facoltativamente un giorno | Intervallo esplicito e aggregazione separata; ultimi 30/90 giorni, mese, trimestre, personalizzato | P2 |
| Raccordi fatture | Percorso storico prevalentemente verso righe economiche, distinte e azioni dedicate | Popup con ricerca nei due archivi, quote, suggerimenti, registro | Mantenere il popup nuovo e il registro come percorso unico; pulsante diretto su ogni riga | P1 |
| Coda di lavoro | Da riconciliare, proposte, raggruppamenti | Filtri senza/con riferimenti e senza fatture | Viste rapide «Da controllare», «Parziali», «Verificati», «Tutti», con criteri espliciti e conteggi | P1 |
| Anomalie | Pannello «Cosa guardare» | Scarti locali e collegamenti al Centro verifiche | Tre criticità prioritarie con azione diretta, resto nel Centro verifiche | P1 |
| Importazione | File, incolla, parser, esito e azioni | Anteprima CSV/camt in Fonti; importazione tramite percorso esistente | «Importa estratto» visibile in Banca; prima riuso dell’anteprima e accesso al flusso esistente, poi unico percorso anteprima→conferma→esito | P1/P3 |
| Spese senza fattura | Commissioni raggruppabili, creazione costo dal movimento, classificazione senza aggancio | Riferimenti consultabili; gestione esterna | Percorsi specifici per commissioni, imposte, giroconti e personale; nessuna fattura richiesta indiscriminatamente | P2/P3 |
| Controparti | «Da chi entrano / A chi escono» | Grafico giornaliero, nessuna vista dedicata controparti in Banca | Barre orizzontali e tabella filtrabili; clic sul soggetto apre i movimenti esatti | P2 |
| Grafici | Saldo, cassa per periodo e previsione | Flussi giornalieri interattivi con esportazione | Saldo a linea, entrate/uscite a barre, categorie/controparti a barre; dettaglio sulla stessa selezione | P2 |
| Proiezione | Prossimi 90 giorni, minimo previsto e scadenze | Previsionale separato con limiti sulle fonti | Piccolo riepilogo delle attese con link al Previsionale; niente saldo futuro assoluto senza base verificata | P2 |
| Ponte economico | Conto economico per periodo e ponte al saldo nella stessa pagina | Collegamenti verso Conto economico e fonti | Vista di approfondimento, non pannello obbligatorio prima dei movimenti | P2 |
| Sottoconti/fabbisogno | Tasche soci e alimentazione conto da piano | Conti consultabili, nessun percorso operativo equivalente in Banca | Dettaglio separato nel conto, distinguendo trasferimento interno, spesa effettiva e compenso | P3 |
| Esportazioni | Nessun comando di export nella lista movimenti del componente esaminato | CSV/SVG/PNG del grafico; CSV anteprima estratto | CSV dei movimenti filtrati con ID, conto, valuta, fonte e stato; report raccordi separato; mantenere export grafici | P2 |

P1 = primo intervento di usabilità e accessi ai percorsi esistenti. P2 = analisi e filtri con regole condivise. P3 = operazioni persistenti con controlli, cronologia e verifica completa dei percorsi concorrenti.

## Struttura della pagina proposta

1. **Conto e periodo.** Nome conto, data di osservazione, selettore conto e intervallo; azioni «Importa estratto» e «Collega banca e fatture».
2. **Sintesi compatta.** Saldo ricostruito, entrate, uscite, variazione. Il confronto con l’estratto riporta la propria data; non assume che quella data coincida con la fine dell’intervallo.
3. **Cosa richiede attenzione.** Solo criticità azionabili: scarto saldo, fonti indisponibili, quote incompatibili. Collegamenti alle righe e alle prove.
4. **Movimenti / Analisi / Controlli.** Movimenti come vista iniziale. Le altre due mostrano grafici e verifiche senza allungare il percorso quotidiano.
5. **Movimenti compatti.** Desktop: data, controparte/causale breve, categoria, entrata/uscita, stato, azione. Mobile: nome, importo con segno, data, stato; dettaglio e azioni espandibili. Il colore non è l’unico indicatore del verso.
6. **Dettaglio movimento.** Originale, fonte, data contabile/valuta, importo, quote fattura, riferimenti economici e storico. «Collega» apre il popup con il movimento già selezionato; chiudere mantiene conto, periodo, filtri e posizione.

Un solo scorrimento principale; evitare barre fisse multiple, filtri sempre aperti, modali dentro modali e ripetizione di tutte le prove in ogni riga. Filtri avanzati espandibili, filtri attivi leggibili e rimovibili singolarmente. La tastiera e il focus devono consentire di aprire, selezionare, chiudere e riprendere dal movimento precedente.

## Stati comprensibili senza conclusioni false

La copertura documentale e la verifica umana sono due dimensioni diverse:

| Informazione | Significato |
|---|---|
| Fatture: nessuna / parziale / coperta / da verificare | Deriva dalle quote e dai controlli del motore documentale |
| Verifica: non verificato / verificato / modificato dopo verifica | Deriva dal registro e dalle sue versioni |
| Altra destinazione | Riferimento a cedolino, F24, riga economica o giroconto da ispezionare; non equiparato automaticamente a prova completa |
| Fonte non disponibile | Stato sconosciuto; non mostrato come assenza di collegamenti |

La vista «Da controllare» include problemi espliciti, residui documentali quando il raccordo è applicabile e decisioni umane pendenti. Non coincide con «senza fattura». I giroconti non diventano costi; i rimborsi possono invertire il verso; i nascosti restano nella cassa con motivo consultabile. Non ricavare uno stato verde dalla sola esistenza di un ID.

## Grafici utili e azioni

- **Saldo ricostruito:** linea giornaliera, apertura e movimenti bancari precedenti inclusi nel calcolo. Il grafico del saldo non si ricalcola da una ricerca testuale dei movimenti: altrimenti il saldo diventa un altro numero. Eventuali dati assenti restano dichiarati, senza continuità certificata.
- **Flussi:** barre entrate/uscite per giorno/settimana/mese, clic per aprire le transazioni. Dichiarare se la serie segue il conto/intervallo oppure il sottoinsieme filtrato.
- **Controparti:** barre orizzontali separate entrate/uscite, top N e «Altri», elenco completo disponibile. Identità normalizzate visibili e reversibili nel dettaglio, senza fusioni arbitrarie per assonanza.
- **Categorie:** barre confrontabili con importi e conteggi; un’eventuale ciambella solo con poche categorie, mai come unico strumento di confronto.
- **Raccordi:** copertura documentale in importo e numero, con denominatore esplicito. Non chiamarla percentuale di completezza della banca.

Ogni grafico mantiene fonti, valuta, periodo, filtri, tabella alternativa ed esportazioni esistenti. Non mescolare saldo, flussi e previsione sulla stessa scala.

## Riutilizzo tecnico, senza due motori

- Saldo e periodo: `lib/lab-bank.ts` e helper `lib/bank.ts`; `balance`, `buckets`, `runningBalance`, `byCounterparty`, `byKind` vanno usati con account, valuta, data iniziale e fonte coerenti. Passare l’intero storico necessario al saldo, non soltanto i risultati filtrati.
- Quote/stati fattura: `lib/lab-invoice-bank.ts`; nessuna nuova formula di disponibilità nella UI.
- Azioni e suggerimenti: provider/popup esistenti e `lib/lab-match-suggestions.ts`. Un indice elevato non equivale a verifica; mantenere conferma esplicita. L’eventuale conferma multipla richiede rivalidazione atomica e concorrenza, non una sequenza di chiamate dal browser.
- Grafici: estendere `LabChart` e i dati comuni anziché introdurre un’altra libreria.
- Import: parser esistente e `LabBankPreview`; dichiarare anteprima e importazione come operazioni differenti fino a un vero percorso integrato.
- Anomalie: riusare le regole di dominio pertinenti, verificandone il perimetro. Non copiare tutte le conclusioni di `bankInsights` senza gli stessi input.
- Tempi di incasso: `daysToCash` oggi misura dalla fine del mese di competenza, non dalla data di emissione della fattura. Non rinominarlo DSO o tempo fattura→pagamento; per tale metrica serve una definizione specifica anche per acconti, quote parziali e note di credito.

## Sequenza di integrazione

**Prima consegna — banca quotidiana.** Elenco aperto e compatto, gruppi per giorno, ricerca comprensiva dell’importo, entrate/uscite e tipo, filtri attivi rimovibili, conto con data/saldo, accessi diretti a popup e anteprima estratto. Conservazione del contesto. Nessuna nuova scrittura economica necessaria.

**Seconda consegna — capire e controllare.** Viste rapide fondate sui due assi di stato, criticità con azione, grafici saldo/flussi/controparti, intervallo e aggregazione, CSV movimenti. Salvaguardare separazione fra saldo del conto e totale del filtro.

**Terza consegna — operazioni complete.** Registro raccordi attivo, import confermabile nello stesso percorso, commissioni, giroconti, F24/personale e sottoconti con cronologia e controlli di concorrenza. La migration 281 risulta ancora non applicata al checkpoint precedente: prima di attivarla occorre verificare il catalogo reale tramite una connessione SQL autorizzata. Non considerare il popup salvabile soltanto perché la UI è presente.

## Prove di usabilità e criteri di accettazione

Questi sono obiettivi da verificare, non tempi già misurati su utenti.

| Compito | Criterio verificabile |
|---|---|
| Trovare un bonifico | Ricerca per nome, causale, numero e importo; nessun bisogno di cambiare più pagine |
| Capire un saldo | Fonte, data, confronto con dichiarato e scarto visibili; saldo invariato cambiando ricerca |
| Aprire un raccordo | Dal movimento al popup con una sola azione; fonti selezionate riconoscibili |
| Cumulativo e frazionato | 1→N e N→1, quote e residui leggibili prima della conferma; nessun importo inventato |
| Riprendere il lavoro | Chiusura popup e ritorno dalle fonti conservano filtri, conto, periodo e movimento |
| F24 o giroconto | Fonte dedicata raggiungibile; nessun falso obbligo di collegare una fattura |
| Fonte assente o dati concorrenti | Messaggio preciso; nessuno zero o successo simulato; nuova verifica richiesta |
| Mobile e zoom | 375px e zoom 200%, niente comandi fuori schermo o area lista ridotta a una fessura |
| Tastiera e temi | Focus visibile, etichette, selezioni leggibili in chiaro/scuro, chiusura e ritorno focus |
| Esportazione | Stesso sottoinsieme visualizzato, valuta/data/fonti e conteggi confrontabili |

Prima della sostituzione: verifiche su browser autenticato desktop/mobile, dataset con pagamenti parziali/cumulativi/rimborsi, prove saldi/duplicazioni/valute, permessi e concorrenza, esiti import e rollback documentato. La sostituzione rimane una decisione esplicita dell’utente.

## Riferimenti esaminati

- `components/bank/BankClient.tsx`: sintesi conto, anomalie, import, riconciliazioni, periodi, forecast, controparti, lista movimenti, tasche, finanziamento conto e ponte economico.
- `app/(dashboard)/economics/banca/page.tsx`: composizione delle fonti storiche e previsionali.
- `app/(dashboard)/lab/banca/page.tsx`: conto/mese, filtri GET, lettura dei saldi, dettaglio prove e grafico giornaliero.
- `components/lab/LabInvoiceBankProof.tsx`, `LabBankPreview.tsx`, `LabReconciliationPopup.tsx` e `LabReconciliationProvider.tsx`.
- `lib/bank.ts`, `lib/lab-bank.ts` e documenti di dominio Banca/Laboratorio.

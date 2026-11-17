# Raccordi fornitori — audit 17 novembre 2026

Mandato: assistere il raccordo dei documenti Asana, Slack, Canva, OpenAI, Anthropic e Meta già caricati. Letture REST soltanto GET; nessuna nuova fattura o quota scritta. Fotografia non transazionale, quindi da rileggere prima di una conferma reale.

## Riscontro

Nel registro `invoices` non risultano documenti intestati ai sei fornitori; diversi PDF sono in `economics_documents` come «solo archivio». La lettura di Carica riconosce attualmente XML fatture e PDF paghe/F24: gli altri PDF non diventano automaticamente fatture. Nella configurazione locale manca S3, ma sono state trovate copie locali degli originali caricati e confrontate tramite SHA-256, senza usare il nome del file come prova d’identità.

Analizzati 103 originali pertinenti: 93 documenti unici, 9 operazioni Meta non riuscite senza numero fattura, 1 duplicato Slack dello stesso numero. Esclusi tentativi falliti e duplicato dalle proposte; due sostitutive OpenAI non generano nuovi pagamenti.

| Fornitore | Documenti unici | Corrispondenze candidate |
|---|---:|---:|
| Asana | 4 | 4 |
| Slack | 8 | 4 |
| Canva | 4 | 3 |
| OpenAI | 10 | 4 |
| Anthropic | 7 | 4 |
| Meta | 60 | 59 |

Le 78 proposte hanno importi esatti e movimenti distinti. Per tutte le 59 Meta coincidono anche riferimento del PDF e codice FACEBK dell’addebito. Questa fotografia non richiede somme arbitrarie per spiegare quei 59 movimenti: l’aggregazione visibile è soprattutto sulle righe di costo mensili esistenti. Le quote non vanno duplicate o riallocate in base al nome di una riga.

## Eccezioni e vincoli

- Le ricevute Slack riportano un destinatario/P.IVA diverso da Two Bee: verifica documentale prima della registrazione fiscale, anche se il pagamento bancario coincide.
- OpenAI: due sostitutive dichiarano zero nuovi pagamenti. Due accrediti uguali da 4,15 € sono compatibili con la rettifica IVA ma non distinguibili fra loro nel solo estratto. Serve conservare l’intera catena documentale, evitando un nuovo incasso/costo per la sostitutiva.
- I supplementi locali Meta sono già nel pagamento totale: non aggiungerli ancora e non sommare di nuovo le campagne.
- Tredici documenti non sostitutivi senza candidato non sono dichiarati non pagati: possono mancare estratti o conti/carte pertinenti; alcune fatture sono successive all’ultimo movimento Vivid presente.
- Verifica sui motori `toLabInvoices`, `invoiceBankReconciliation`, `matchingSources`: 38 movimenti disponibili; 38 già interamente attribuiti, 1 con quote/riferimenti da verificare, 1 classificato senza aggancio richiesto. Disponibile non significa fattura già registrata o salvataggio pronto.
- Il catalogo letto non espone ancora le tabelle del registro raccordi (migration 281). Registrazione dei documenti e attivazione del registro sono passaggi distinti dall’analisi. Nessuna applicazione SQL eseguita.

## Consegna e verifica

Prospetto locale filtrabile, rapporto Markdown e JSON di dettaglio in `/tmp/twobee-raccordi-fornitori-2026-11-17/`, accessibili soltanto all’utente locale. Contengono ID originali, numero documento, data/importo, SHA-256 e link ai movimenti autentici. Non sono un import applicato né una fotografia pubblica dell’archivio; non caricati su servizi esterni.

Controllati 78 ID bancari distinti, uguaglianza al centesimo di tutti i candidati, 59 riferimenti Meta esatti, esclusioni e assenza di errori di estrazione sui modelli riconosciuti. Verifica visiva di campioni Meta, Slack e sostitutiva OpenAI sui PDF renderizzati. Nessuna prova visiva autenticata dell’app o salvataggio reale dichiarati.

# Compensi soci — correzione del 16 novembre 2026

La sezione non deve sparire quando una fonte è incompleta. Restano distinte la quota completa del mese, la parte calcolabile dalle righe note, la quota da incassi verificati nella finestra e le prove delle erogazioni. Nessun importo parziale è presentato come debito completo o nuovo bonifico da disporre.

## Problemi corretti

- Il blocco per divergenze e valori numerici del maturato guardava anche mesi precedenti non pertinenti: ora è circoscritto al mese. I controlli sugli arretrati della finestra restano attivi.
- Una mancanza alla fonte oscurava tutte le quote e anche i dettagli già determinabili. Ora una seconda lettura parziale usa lo stesso `computeMonth` e gli stessi mapper canonici, senza percentuali copiate. Il totale completo resta n/d quando necessario.
- La scheda «Toto Piacente» non corrispondeva all’etichetta «Toto» del piano. Il nome completo e quello invertito entrano negli alias espliciti di `personName`; la persona viene ritrovata sul suo ID. Nessuna modifica ai nomi originali sul database.
- Il loader non leggeva `pl_payouts`. Ora carica il registro e verifica le quote con `payout_id`, usando `targetCoverage` e `txCoverage`. Una spunta pagata, una causale simile o un importo uguale non provano un pagamento.

## Cosa entra nella parte calcolabile

Configurazione e diritti devono essere validi. Sono escluse le righe divergenti dal patto o con fonte contrattuale incompleta. Per Digital si conserva il denominatore completo di competenza, anche quando è incassata una sola rata; ambito ignoto, costi esterni mancanti/incompleti o ricavi di progetto mancanti impediscono la quota parziale interessata. Una voce di struttura mancante non cancella invece una quota Growth fissa e indipendente dal costo di struttura. Le esclusioni restano elencate e collegate alla fonte.

La parte da incassi usa soltanto righe con documento e copertura bancaria coerenti, entro il taglio e collocate nella finestra canonica. Nessun anticipo, incasso futuro, spunta o semplice aggancio è trasformato in certezza.

## Registro ed erogazioni

Le schede mostrano il preparato nel registro, le quote bancarie esplicitamente attribuite e, quando determinabile, il residuo delle sole righe preparate. Persona, natura e competenza vengono dai riferimenti del registro; non dalla data del bonifico o dal nome nella causale. Quote dichiarate, movimenti manuali/derivati, altra valuta, giroconti, sottoconti, riferimenti concorrenti, quote duplicate o oltre capienza non entrano nel pagamento verificato.

L’assenza di quote non diventa pagamento zero; una riga pagata nel registro senza prova bancaria mantiene il dubbio. Il residuo del registro non comprende automaticamente altre spettanze, spese personali o fatture del socio: non viene chiamato «da versare» complessivo. Nel DTO PDF v2 i campi `settled` e `remaining` sono le quote bancarie note e il residuo del registro, con questi nomi espliciti nel documento. La fotografia esportata conserva quota parziale, righe e limiti della pagina.

## Riscontro reale in sola lettura

Letture separate del 2026-11-16T16:27:38.585Z, non snapshot transazionale. Ottobre e novembre conservano tre ricavi e un costo attesi mancanti; nessuna occorrenza è stata inventata per sbloccare il totale. Le due divergenze storiche restano da decidere e non bloccano indiscriminatamente gli altri mesi.

| Socio | Ottobre: quota su righe note, parziale | Ottobre: quota da incassi verificati, parziale |
|---|---:|---:|
| Marco Lucci | 3.183,57 € | 367,97 € |
| Walter Giacobbe | 3.223,97 € | 408,25 € |
| Toto Piacente | 2.683,97 € | 367,97 € |

Otto righe ricavo del mese calcolabili, due righe con incasso verificato nella finestra (anche di competenze precedenti). Le cifre sono una lettura del registro incompleto, non il compenso completo né un minimo garantito; possono variare quando si completano le fonti. Per ottobre e novembre non risultano righe preparate in `pl_payouts`, quindi preparato, bonifici attribuiti e residuo del relativo registro restano n/d con motivazione esplicita e collegamento alla gestione.

## Verifica

TypeScript, 139 gate Europe/Rome e build isolata passati. Dieci ingressi anonimi 307 verso login con parametri conservati; 18 chunk Lab HTTP 200/MIME JavaScript. Server locale di prova fermato. Test di regressione su Toto, blocchi storici non pertinenti, quote parziali con fonti mancanti, esterni Digital, capienza globale, beneficiari duplicati, verso/valuta/data/fonte e spunte prive di prova. PDF generato dalla fotografia canonica di ottobre: 14 pagine renderizzate, riepilogo e dettagli ispezionati, testo entro la pagina. Nessun PDF privato è aggiunto al repository. Verifica visiva autenticata della pagina ancora aperta: nessun browser collegato nella sessione CLI. Nessuna scrittura economica, migration o promozione delle sezioni in uso.

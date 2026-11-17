# Suggerimenti di raccordo — 17 novembre 2026

Il popup apre «Suggerimenti» per i nuovi raccordi. Le proposte considerano nomi e loro varianti, causale, numero fattura, importi disponibili/residui, valuta, verso e distanza fra emissione e movimento. «Usa proposta» prepara le selezioni negli elenchi: quote e residui restano verificabili prima di «Salva e conferma». Nessuna conferma automatica.

L’indice su 100 misura compatibilità euristica, non probabilità statistica o consolidamento. L’importo da solo pesa poco; omonimie, alternative plausibili e anticipi abbassano il punteggio. Pagamenti parziali restano parziali. Si cercano anche somme esatte di due o tre fatture per movimento e viceversa, usando sempre `matchingPlan` per le quote. Nessuna commissione o ripartizione viene inventata.

Lo storico aiuta soltanto con almeno due fatture e due movimenti distinti in raccordi attivi verificati. Nomi bancari associati a soggetti diversi e intermediari di pagamento non generano alias appresi. Lo storico non verificato o revocato non rafforza le proposte.

Ricerca assistita limitata a 400 fonti per lato, con le selezionate prioritarie, 25.000 coppie compatibili e gruppi fra i migliori 12 candidati. Massimo 40 proposte mostrate progressivamente; il limite è dichiarato. Gli elenchi manuali mantengono tutto lo storico disponibile e filtri indipendenti. Il motore è locale, deterministico, senza invio dei nomi a servizi AI esterni.

Nessuna migration o variazione ai permessi. L’attivazione del registro in produzione resta necessaria per salvare, come indicato nel popup e nel [dossier del registro](raccordi-popup-2026-11-17.md). Economics resta operativo.

Verifiche: `lib/lab-match-suggestions.check.ts` copre nomi, refusi, nomi compatti, marchi, riferimenti fattura/date, parziali, cumulativi, ambiguità fuori selezione, valute/versi, limiti, ordinamento, immutabilità e storico verificato. Prova visiva autenticata ancora aperta: nessun browser collegato.

Esiti: TypeScript, 147/147 gate Europe/Rome e build passati. Nuovo gate anche UTC e America/Los_Angeles. Ventuno ingressi anonimi reindirizzano al login conservando i parametri; 27 chunk Lab e il chunk dinamico del popup rispondono 200/MIME JavaScript. GET/POST raccordi anonimi rispondono 403/no-store. Nessuna verifica visiva autenticata dichiarata.

# Raccordi Economics — dossier del 15 novembre 2026

Letture GET del 2026-11-15T19:49:49.188Z; non snapshot transazionale. Nessuna scrittura economica applicata. Il piano completo, ancora da approvare, è in [raccordi-economics-proposti-2026-11-15.json](raccordi-economics-proposti-2026-11-15.json).

## Risultati già verificati senza cambiare dati

- Cinque delle sei occorrenze costo segnalate sono voci del seed nell’area Personale. Il percorso canonico già le esclude dal piano perché il costo del lavoro arriva dal registro HR. Corretto il Lab per usare la stessa identità dell’area; i costi HR realmente registrati rimangono nel conto economico.
- Dopo la correzione restano tre ricavi attesi e un costo atteso da verificare, sia a ottobre sia a novembre. Il costo delle risorse non viene assunto zero.
- Il PDF F24 con scadenza 16 settembre coincide per SHA256 con il documento già registrato: non è una nuova importazione. Totale 692,42 €, componente HR agosto.
- Il PDF F24 con scadenza 16 ottobre manca sia come modello sia come impronta nell’archivio. Totale 842,38 €, competenza settembre. Il lettore dell’app e la quadratura al centesimo passano sui byte originali.

## F24 di ottobre pronto per revisione

Fonte: [mail del commercialista con correzione della scadenza](https://mail.google.com/mail/#all/1a11b3e05895e970). La mail corregge il 16 settembre in 16 ottobre; il PDF conferma il 16 ottobre. Non è una quietanza.

| Componente | Debito | Credito | Competenza |
|---|---:|---:|---|
| 1001 | 231,67 € | — | settembre 2026 |
| 1701 | — | 98,63 € | settembre 2026 |
| 1704 | — | 110,66 € | settembre 2026 |
| INPS / DM10, sede 5100 | 820,00 € | — | settembre 2026 |

Saldo del modello: **842,38 €**. Movimento candidato unico `0de73333-dc04-49cd-b30e-2594e7f24316`, conto corrente Two Bee, contabilizzato **19 ottobre 2026**, causale Entratel con data incasso 16 ottobre. Importo −842,38 €. Alla lettura non ha quote correnti/storiche né riferimenti ad altre righe o documenti. Nessun modello HR di settembre presente.

La registrazione proposta conserva il 16 ottobre come scadenza e il 19 ottobre come data bancaria. Non crea un secondo bonifico, un nuovo costo di struttura o un versamento IVA. Prima di applicare vanno riletti modello, impronta e capienza del movimento.

## Undici collegamenti fattura che passano la simulazione canonica

La fattura è già riferita dai movimenti; sulle righe manca il relativo invoice_id. Simulazione con copia locale dei record, senza modifica di importi o quote. Il gruppo delle righe della stessa fattura deve passare interamente i controlli di documento e copertura. Nessuna associazione basata soltanto sul nome o sull’importo.

| Riga | Competenza | Fattura proposta | Registro |
|---|---|---|---|
| Canone growth — lead generation | 2026-06 | FPR 27/26 | ricavi |
| Affinity — Canone growth — lead generation | 2026-05 | FPR 7/26 | ricavi |
| Seven — Test modulo inviti a fatturare — chiuso — Saldo | 2026-05 | FPR 24/26 | ricavi |
| Sito web — una tantum — Saldo | 2026-06 | FPR 32/26 | ricavi |
| Plus Vending — Canone growth — lead generation | 2026-06 | FPR 26/26 | ricavi |
| CRM provvigionale Adamo — ecosistema completo — Rata 4 di 6 | 2026-10 | FPR 65/26 | ricavi |
| Josè Restaurant / Tenuta Villa Guerra — Canone growth — lead generation | 2026-05 | FPR 3/26 | ricavi |
| Subappalto Affinity — test modulo inviti a fatturare | 2026-05 | FPR 3/26 | costi |
| Annalisa Smiraglia — Consulenza marketing e digital | 2026-09 | 7/2026 | costi |
| Gialeda — ente per il tirocinio di Agostino | 2026-05 | 90/2026 | costi |
| Talenti — ente per il tirocinio di Agostino | 2026-06 | 392/SL-2026 | costi |

ID, documenti, movimenti di origine e condizioni di concorrenza sono nel manifest. I controlli passati riguardano i riferimenti e i dati canonici della fattura; non attestano l’accessibilità attuale dei byte di tutti gli originali. Le sei altre proposte restano escluse.

## Casi che richiedono una decisione o la fonte corretta

| Motivo | Righe distinte |
|---|---:|
| Fattura sul movimento assente sulla riga | 29 |
| Fattura della riga diversa da quella del movimento | 4 |
| Quote correnti e storiche divergenti | 14 |
| Quote superiori al movimento | 7 |

Le categorie si sovrappongono: il totale delle righe coinvolte resta **43**, non la somma delle categorie. La precedente dicitura generica non dimostrava che tutti i 43 casi fossero conflitti fra registri. Ora il dettaglio identifica la causa e apre il movimento interessato.

| Riga | Competenza | Documento sulla riga | Documento sul movimento |
|---|---|---|---|
| Canone growth — e-commerce due brand e social | 2026-06 | FPR 51/26 del 2026-08-04 | FPR 29/26 del 2026-06-05 |
| Canone growth — lead generation | 2026-07 | FPR 40/26 del 2026-07-03 | FPR 47/26 del 2026-08-04 |
| iCura Impresa — Canone growth e digital — lead generation, social, sito web | 2026-04 | FPR 50/26 del 2026-08-04 | FPR 4/26 del 2026-05-08 |
| OVHcloud | 2026-08 | IT3048989 del 2026-08-01 | IT3019495 del 2026-07-01 |

Ricavi attesi senza occorrenza: Sartoria Condotti 2.000 € netti; Petito Costruzioni 1.000 € di fee e 500 € di partita di giro. Il patto attivo non basta a inventare una fattura o un incasso. Occorre verificare le competenze contrattuali del periodo.

La sola voce costo attesa residua è Email marketing (Klaviyo): importo in fonte zero, fornitore assente. Non viene eliminata dal piano e non viene certificata come costo effettivo zero. Le due divergenze sales_split delle righe aperte rimangono da decidere; non si rimuove una divisione delle provvigioni per riallineare un report.

## Cassa, IVA e risorse

- Banco BPM: manca un saldo dichiarato e datato nel registro. Vivid: quadratura verificabile solo al 21 settembre, non ai mesi successivi. L’ultimo movimento del 12 novembre non certifica la copertura dell’estratto. I sottoconti dei soci non hanno movimenti di origine banca nella lettura; non si assume quindi regolato zero.
- F24 del 20 agosto: il modello netto è coperto da 10.547,24 € in banca, ma contiene crediti compensati. Non si attribuiscono arbitrariamente i crediti alla componente IVA per dichiarare l’IVA tutta versata in banca. Riserva iniziale e regolamenti soci restano da documentare.
- Tre fatture HR storiche prive di numero e invoice_id non hanno una fonte documentale confermata nella ricerca svolta. I contratti di collaborazione trovati in Drive non sono fatture.
- Due originali di cedolino di ottobre risultano registrati nell’archivio privato (Michele Cristallo e Sabrina Nastro), ma la lettura dei byte dal MinIO interno richiede il browser autenticato o l’accesso infrastrutturale. Nessuna credenziale storage è configurata localmente. I documenti vanno letti prima di completare il registro HR.

## Verifica visiva autenticata

Questa sessione Codex CLI non ha browser collegati. Non sono stati letti cookie, creati account, cambiati ruoli o simulati accessi. Resta necessaria una sessione supportata nell’app desktop oppure una verifica guidata nel Chrome dell’utente. Anche il deploy del precedente commit va confermato: /api/version rispondeva ancora 1fe020d9b3ac al controllo del 15 novembre; non usare quella pagina come prova visiva delle modifiche su main.

Nessuna promozione delle pagine Economics o applicazione del manifest è inclusa nell’audit.

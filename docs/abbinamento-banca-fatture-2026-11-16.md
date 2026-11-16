# Abbinamento guidato movimento–fatture

## Esperienza

`/lab/abbina`, raggiungibile dal movimento in Banca, dalla fattura e dalla navigazione comune. Due modalità: un movimento→più fatture; una fattura→più movimenti. Punto di partenza, selezione e riepilogo in tre passi. Ricerca che conserva i selezionati, fonti compatibili, disponibilità e residui visibili; dettagli e ritorni alle fonti esistenti. CSV della bozza con identificativi della coppia e quota. Non modifica importi economici a tastiera.

Un movimento di 300 può coprire due residui documentali di 100 e 200. Una fattura di 300 può ricevere due movimenti da 100 e 200, oppure rimanere parziale dopo un solo movimento da 100. Quote già attribuite a fatture o ad altri destinatari sono riservate; gli incassi già noti riducono il residuo della fattura. Le fonti non vengono abbinate per somiglianza del nome.

Quando un cumulativo non copre tutti i residui selezionati, non si riempiono le fatture nell’ordine dei clic. Quando più movimenti superano il residuo di una fattura, non si decide arbitrariamente quale sia parziale. Servono componenti documentali per distinguere le quote. Per una coppia singola la quota proposta è il minore fra disponibilità del movimento e residuo documentale; l’eccedenza resta sul movimento oppure sulla fattura. Valute, verso, rimborsi, quote in conflitto, giroconti e destinazioni HR sono controllati.

## Confine operativo

La schermata è un’anteprima interattiva nel Lab in sola lettura: non salva abbinamenti, non modifica `paid_on`, non importa file e non scrive registri. Il pulsante si chiama «Controlla abbinamento», non «Salva». La selezione non certifica il pagamento e i residui non certificano la completezza degli estratti. Dati riletti dai loader con gate super admin.

Per salvare direttamente quote documento↔movimento molti-a-molti manca ancora il percorso persistente comune: `bank_transactions.invoice_id` contiene un solo documento; il registro quote corrente si riferisce a righe economiche/compensi/F24, non direttamente a qualsiasi fattura. La nuova UI non inventa righe economiche e non sovrascrive il riferimento diretto per aggirare il limite. Conferma/revoca atomica, capienza globale e cronologia restano nel progetto di completamento; nessuna migration o promozione in questo intervento.

Modelli: `lib/lab-matching.ts` riusa il raccordo `lib/lab-invoice-bank.ts` per costruire le disponibilità, senza trattare la parte non spiegata da fatture come denaro libero. Selezioni deduplicate, quote in centesimi, nessuna mutazione dei dati sorgenti. Gli abbinamenti esistenti sono visibili dalle fonti e rimangono separati dalla bozza.

## Verifiche

TypeScript e build passati; 145/145 gate Europe/Rome, nuovo modello anche UTC e America/Los_Angeles. Venti ingressi anonimi 307 verso login con parametri conservati, inclusi gli ingressi da movimento e da fattura; ventisei chunk Lab HTTP 200/MIME JavaScript. API anteprima estratti ancora 403/no-store da anonimo. Prova visiva autenticata e salvataggio persistente non dichiarati completati. Nessuna modifica DB.

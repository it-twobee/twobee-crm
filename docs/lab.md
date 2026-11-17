# Laboratorio (`/lab`, §474-§500)

## Studio Banca Economics → Laboratorio — 17 novembre 2026

[Confronto funzionale, proposta di pagina, priorità e criteri di usabilità](studio-banca-economics-laboratorio-2026-11-17.md). Analisi dei componenti, non verifica visiva autenticata; nessuna funzione nuova implementata da questo studio e nessuna sostituzione Economics.

## Popup raccordi: spazio agli elenchi — 17 novembre 2026

Corpo unico scorrevole, finestra ampliata, righe compatte e riepilogo espandibile richiamabile dalla barra finale. [Percorso aggiornato](raccordi-popup-2026-11-17.md#spazio-di-lavoro-aggiornato). Nessuna modifica al calcolo o al salvataggio.

## Suggerimenti intelligenti di raccordo — 17 novembre 2026

Proposte motivate nel popup, indice di compatibilità, cumulativi e parziali, riuso prudente dei raccordi verificati. «Usa proposta» prepara le selezioni; conferma sempre esplicita. [Criteri e limiti](suggerimenti-raccordi-2026-11-17.md). Nessuna scrittura automatica; attivazione del registro ancora necessaria.

## Raccordi in popup e registro — 17 novembre 2026

Nuovo mandato: salvare, modificare, verificare e rimuovere i raccordi con conferma esplicita. [Implementazione, controlli e attivazione database](raccordi-popup-2026-11-17.md). Supera la sola anteprima per questa capacità; Economics non viene sostituito. Schema nuovo ancora da attivare in produzione.

## Abbinamento guidato — 16 novembre 2026

Due percorsi semplici per cumulativi e pagamenti frazionati, selezione ricercabile e riepilogo quote/residui. [Esperienza e limite operativo dell’anteprima](abbinamento-banca-fatture-2026-11-16.md). Nessuna conferma persistente o sostituzione Economics.

## Completamento prima della sostituzione — 16 novembre 2026

Centro verifiche trasversale, anteprima estratti e viste dei grafici salvabili. [Capacità, perimetro e matrice delle mancanze](completamento-laboratorio-2026-11-16.md). Economics resta operativo; nessuna promozione o modifica ai dati finanziari.

## Raccordo banca e fatture — 16 novembre 2026

Consolidato di cassa soltanto dai movimenti bancari reali, quote documentali comuni e navigazione bidirezionale. [Criteri, riscontro e priorità](banca-fatture-consolidato-2026-11-16.md). Nessuna scrittura DB o sostituzione Economics.

## Percorso unico e verificabile — 16 novembre 2026

Riepilogo per compiti e sequenza patto→documento→movimento→risultato; navigazione compatta, sorgente immediata e origine del controllo conservate nei collegamenti e nei form. Accessi comuni a sintesi/grafico/dati, ritorno alla voce con filtri di pagina e riapertura dei dettagli. Banca giornaliera per singolo conto; Fatture mensili con drill-down esplicito; canoni e totali a corpo separati; impostazioni ed esportazioni progressive. Stato di caricamento comune. [Flusso, grafici e limiti della verifica](percorso-economics-2026-11-16.md). Nessuna scrittura economica, nuovo permesso o promozione delle sezioni in uso.


## Compensi soci leggibili anche con fonti incomplete — 16 novembre 2026

Corretti il blocco indiscriminato dai mesi precedenti e l’identità Toto Piacente/Toto. Quote sulle righe note e sugli incassi verificati con dettaglio e qualifica parziale; registro compensi e prove bancarie caricati, senza inferire pagamenti dalle spunte. PDF v2 e grafico allineati. [Criteri, riscontro reale e verifiche](compensi-lab-2026-11-16.md). I totali incompleti e il debito complessivo non sono trasformati in importi da bonificare; nessuna scrittura DB.


## Grafici interattivi — 16 novembre 2026

Grafici nel Lab per Banca, Fatturazione, Accordi, Risorse/F24, IVA, Conto economico/compensi, Previsionale/scenario e Progetti. Filtri, serie, titolo, barre/linee, dettaglio con fonti, vista compatta mobile e CSV/SVG/PNG. Dati dai motori esistenti; nessuna scrittura economica o promozione. [Uso, fonti e limiti di verifica](grafici-economics.md).


## Raccordi documentali — checkpoint 16 novembre 2026

Audit in sola lettura con cutoff 15 novembre: [dossier e fonti](raccordi-economics-2026-11-15.md), [proposte esatte da approvare](raccordi-economics-proposti-2026-11-15.json). Undici collegamenti fattura passano la simulazione canonica; F24 ottobre 842,38 € recuperato e quadrato, con movimento candidato identificato. Nessuna scrittura economica applicata.

Il Lab esclude dal piano cinque voci seed del centro Personale come il percorso canonico, conservando i costi HR registrati: restano tre ricavi e un costo attesi senza occorrenza per ottobre/novembre. Le 43 righe con riferimenti da raccordare comprendono cause sovrapposte, non solo divergenze fra registri; il dettaglio apre il movimento coinvolto. Il dossier aggiorna i conteggi delle sezioni precedenti. Saldi assoluti, copertura IVA e sostenibilità restano non certificati. Verifica visiva autenticata aperta: nessun browser collegato alla sessione CLI.


## Integrazione e usabilità Economics — 15 novembre 2026

Chiusura dei percorsi: IVA→fatture del trimestre/competenze, accordo→riga economica/editor, originale fattura e accessi alle sezioni di gestione esistenti. Storico fatture integrale salvo filtro esplicito; contesto mese conservato. L’utente ha autorizzato commit/push su main a verifiche concluse. Nessuna migration, scrittura DB o promozione; saldi/riserva/regolamenti non documentati restano n/d. Verifiche finali passate: TypeScript, 137/137 gate Europe/Rome e build; Banca/Collegamenti/Fatture anche UTC e America/Los_Angeles; dieci ingressi HTTP anonimi 307 con parametri conservati e 17 chunk 200/MIME JS. Rilascio su main autorizzato; prova autenticata/visuale e promozione restano aperte. Vedere il dossier iniziale nel progetto per perimetro e limiti. Le righe seguenti descrivono i checkpoint locali precedenti.

Secondo intervento locale: percorsi Banca→competenza/risorsa/F24/compensi dai riferimenti reali, selezione diretta risorsa/modello/liquidazione, home con controlli per mese, ricerca movimenti e selettore mese. Nuovo gate `lib/lab-connections.check.ts`; TypeScript, 137/137 controlli e build finale passati. Nove ingressi anonimi 307 con parametri conservati, 17 chunk HTTP 200. Banca/Collegamenti anche UTC e America/Los_Angeles. Prova visuale e autenticata dei nuovi percorsi ancora aperta; due blocchi locali, non pubblicati. Letture produzione solo GET; nessun raccordo monetario scritto o promozione. Il dossier iniziale nel progetto contiene conteggi e limiti aggiornati.

Nuovo mandato: collegare i dati dei moduli e rendere UI/UX responsive e più leggibile. Primo intervento locale: navigazione comune, mese mantenuto fra Banca/Risorse/Conto economico, link all’accordo realmente selezionato, profili di simulazione bloccati con motivazione e confronto mobile a schede. Nessun cambio di formule, scrittura DB o promozione. Raccordi economici e verifica browser restano aperti; dettaglio e perimetro nel [progetto Economics](progetto-moduli-economics.md), sezione iniziale del 15 novembre.


## Previsionale / Simulatore parziale nel Lab — 14 novembre 2026

Nuovo ingresso /lab/previsionale: accordi attuali, scenari growth/digital su profili reali, tre condizioni d'incasso, delta su società/soci e date. Sei mesi dal prossimo mese intero, dodici su scelta. Quantità e assunzioni non scrivono dati. La base resta incompleta: saldo assoluto, riserva e numero di clienti necessario alla sicurezza sono n/d, anche se un delta è positivo. Nessuna promozione.

TypeScript e 136 gate passati; nuovo gate anche UTC e America/Los_Angeles. Build finale e HTTP passati: sei chunk 200, base/scenario anonimi 307 verso login. Prova autenticata ancora aperta. Dossier e fonti nel [progetto Economics](progetto-moduli-economics.md), sezione «Previsionale / Simulatore parziale nel Lab». [Consegne Claude Code](passaggio-economics-claude.md) aggiornate; l'utente continua qui.


## Conto economico nel Laboratorio — 14 novembre 2026

Nuovo ingresso /lab/conto-economico: Effettivo dai movimenti, Maturato dal registro con occorrenze mancanti, area dei tre soci e PDF binario della stessa fotografia. Sola lettura, super admin, nessuna promozione. I compensi completi di ottobre/novembre restano n/d: tre occorrenze ricavo e sei costo da raccordare, registri bancari concorrenti nello storico. Non sono somme pronte da bonificare.

Dossier e riferimenti in [progetto Economics](progetto-moduli-economics.md), sezione «Conto economico nel Laboratorio». [Passaggio a Claude Code](passaggio-economics-claude.md) pronto per un altro terminale. TypeScript, 135 gate e build passati; sei chunk HTTP 200, pagine anonime 307 verso login e PDF anonimo 403/no-store. Prova autenticata ancora aperta.


## IVA nel Laboratorio — 14 novembre 2026

Nuovo ingresso /lab/iva da Risorse & tasse: dovuto, riscontri del versamento, scadenza e giorni, IVA passata dai conti. Sola lettura, super admin; nessuna promozione o scrittura. Modello prima della stima esistente, fatture come confronto. Scaduti mantenuti; paid_on non certifica il versamento. F24 misti con compensazioni non sono ripartiti automaticamente.

Riserva e leva n/d finché base iniziale, detraibilità e consolidato non sono documentati. Controlli: TypeScript e 134 gate; IVA anche UTC e America/Los_Angeles. Build isolata passata; sei chunk HTTP 200 e accesso anonimo 307 verso login. Dossier, dati reali e limiti in [progetto Economics](progetto-moduli-economics.md), sezione «IVA nel Laboratorio». La prova visiva e la matrice dei ruoli autenticati restano aperte.

## Risorse & tasse nel Laboratorio — 14 novembre 2026

Quarta capacità in verifica: /lab/risorse, super admin, sola lettura. Mese iniziale precedente a quello corrente; competenza e data bancaria separate, pagamento risorse atteso entro il 20 del mese successivo. Netto concordato attuale distinto da netto del cedolino, costo e quota bancaria. Un F24 aggregato non certifica gli oneri della singola persona. Professionisti collegati alle fatture ricevute canoniche, senza creare un secondo costo. Documenti privati scaricabili solo dopo il gate Lab, anche sulle API; profili disattivati esclusi.

Fatti verificati con SELECT di produzione il 14 novembre: cinque risorse, sette cedolini HR, nove PDF cedolino, sei collegamenti di distinta, tre fatture HR, tre F24 con undici componenti. Nove registrazioni di documenti personali risultano senza file collegato: la pagina lo dichiara e non offre download inesistenti. Parametri paghe 2026 non confermati: gli oneri che ne dipendono restano stimati. Letture separate, nessuna garanzia di snapshot. Mancanze e legami ambigui producono n/d. Nessuna migration o scrittura sui dati.

Verifica: TypeScript, 133 gate in Europe/Rome, controllo risorse anche UTC e America/Los_Angeles, build di produzione. HTTP anonimo: pagina 307 verso login, download 403 con no-store. Restano aperte prova visiva autenticata, matrice ruoli autenticati, completezza documentale e confronto vecchio/nuovo sullo stesso snapshot. Nessuna promozione delle sezioni Economics. Prossimo modulo: IVA.


Ambiente di prova **solo per il super admin** (`lib/lab-guard.ts`: `hasLabAccess`
nel layout, `requireLabAdmin()` in ogni azione). Le nuove versioni delle sezioni
economiche nascono qui e leggono i dati veri. Dal mandato del 17 novembre i
**raccordi banca–fatture** hanno una persistenza dedicata con conferma esplicita
(vedi dossier in apertura); le altre capacità restano in sola lettura. Finché non
vengono promosse, quelle in uso non cambiano.

- **Mese** (`/lab/novembre`, §500): **solo banca**. Niente maturato, niente
  spunte, niente piano dai contratti: entrato e uscito sono i movimenti del conto
  nel mese, uno per uno, ciascuno con la sua IVA e con ciò che lo spiega
  (fattura, riga di conto economico, personale, o «nessuna»). Sopra: la leva
  dell'IVA e i compensi dall'incassato.
- **Progetti** (`/lab/progetti`): una riga per progetto da `projectDeal`. Un
  accordo che copre più progetti non si attribuisce a nessuno (§188): margine n/d.
- **Accordi** (`/lab/accordi`): lettura di cliente/progetto, patto, calendario,
  righe e riferimenti alle fatture. Conserva i conclusi e le loro rate; una
  bozza resta distinta da un accordo attivo con avvio futuro. Gli accordi
  condivisi compaiono una volta e non ricevono quote inventate per progetto.
  Nessuna scrittura, editor o certificazione dalle spunte delle rate. Subappalti
  anche non attivi, senza dedurne uno stato di vita non presente nella fonte.
- **Fatturazione** (`/lab/fatturazione`): nuova lettura emesse/ricevute in verifica,
  con ricerca e filtri su registro, note e riscontri. Mantiene `isOpen`,
  `invoiceStatus`, `txCandidates` e il mapper `lib/invoices-load.ts` condivisi con
  la pagina in uso. Distingue data di pagamento nel registro e movimenti di
  origine banca; residuo certificato n/d finché quote/ritenute/rettifiche non
  sono provate. Proposte senza scritture, escluse le somme già impegnate e i
  movimenti non idonei; contese dichiarate. L'esperimento precedente è in
  `/lab/fatturazione/precedente`.
- **Banca** (`/lab/banca`): prima lettura del nuovo progetto Economics, **in verifica**.
  Conti principali e sottoconti separati, movimenti lordi per mese, saldo ricostruito
  da `balance` e confronto con il saldo dichiarato alla sua data. Nascosti e
  giroconti restano nella cassa; manuali/derivati esclusi. Riferimenti diretti
  non equivalgono a copertura integrale: residuo riconciliato e consolidato n/d.
  Nessun import, aggancio o modifica. Gate esplicito `requireLabAdmin` anche nel
  loader, paginazione con conteggio esatto, errore distinto da archivio vuoto.

## Avvio del progetto Economics — 14 novembre 2026

Il progetto `docs/progetto-moduli-economics.md` è approvato. La home `/lab`
presenta i sei moduli concordati, con Accordi, Banca, Fatturazione, Risorse & tasse e Conto economico in verifica;
gli esperimenti precedenti restano consultabili a parte. Tutti i sei ingressi
sono ora in verifica: la presenza del link non certifica promozione o fonti complete.

La nuova Banca legge tutti i conti presenti, inclusi i sottoconti dei soci,
senza dedurre il perimetro dai nomi o sommare padre e figli. Il saldo è
**ricostruito dai record**, non certificato come completo: la coincidenza con
un estratto passato non dimostra la copertura dei mesi seguenti. Il loader
`lib/lab-bank-load.ts` è server-only e applica il gate. La lettura paginata
condivisa `lib/lab-read.ts`, usata anche da `lib/lab-invoices-load.ts`, verifica
di nuovo `requireLabAdmin` prima del client di servizio e usa soltanto SELECT.
Le letture paginate non sono una transazione:
il confronto formale e la promozione richiedono ancora la verifica prevista
nel progetto. Nessuna sezione `/economics/*` è stata sostituita.

Gate: `TZ=Europe/Rome npx tsx lib/lab-bank.check.ts` e
`TZ=Europe/Rome npx tsx lib/lab-invoices.check.ts`; casi di data anche con
`TZ=UTC` e `TZ=America/Los_Angeles`. Le verifiche statiche delle dipendenze
non sostituiscono prove runtime di permessi e assenza di scritture.
Accordi: `TZ=Europe/Rome npx tsx lib/lab-deals.check.ts`. Il lettore comune
gestisce anche la chiave composta stream/progetto, senza ordinare una tabella
di relazioni su una colonna `id` inesistente.

Fatturazione e Banca si aprono reciprocamente sul documento/movimento preciso,
con mese e conto del movimento e dettaglio aperto. Il totale dei bonifici
direttamente collegati non viene chiamato quota della fattura: un cumulativo
può avere altre destinazioni. Una nota di debito integra, non storna. Le note
sono risolte sull'archivio intero prima dei filtri di ricerca/stato, mantenendo
anche gli arretrati. Valute diverse restano separate; importi mancanti o errori
di lettura non sono convertiti in zero. Nessuna conferma o import attivato.

## Il mese letto dalla banca (§500, `lib/mese-banca.ts`)
Contano i movimenti `banca`/`manuale`; un `derivato` nasce da una spunta e non
certifica, i nascosti (§381) e i giroconti non sono né incasso né spesa.

**L'IVA di un movimento** (`vatOf`) viene, in ordine, dalla **fattura agganciata**
(IVA scritta sul documento, in proporzione a quanto il movimento ne paga), dalla
**riga di conto economico** (lordo allocato × aliquota; sui costi per la
detraibilità §191), dalla **natura** (uno stipendio o un'imposta non hanno IVA).
Il resto **non è zero, è sconosciuto**: `basis` dice per quanto del movimento si
sa, e la pagina scrive «IVA n/d» e quanto lordo ne è privo.

**La leva dell'IVA** (`vatLever`) = IVA incassata dai clienti − IVA pagata ai
fornitori, dal primo trimestre **dopo l'ultimo versamento registrato** in
`vat_settlements` fino a oggi. È cassa passata dal conto, non il debito fiscale
(quello si calcola sulle fatture, §325). Un trimestre senza riga non è «versato»:
a novembre 2026 il 3º (dovuto il 16 novembre) è ancora dentro. Accanto, il saldo
dei conti senza la leva, e uno scenario al ribasso: se tutta l'uscita non
agganciata avesse IVA al 22%.

**I compensi** usano il motore e la finestra del conto economico (§286), ma con
una sola lettura di «incassata»: la riga è pagata solo se i movimenti la coprono
**per intero** (`lineBank`, `withBankPaid`); una copertura parziale aspetta il
resto. Competenza del mese prima, erogazione del 20; gli arretrati di mesi
precedenti non sono inclusi.

**Voce per voce** (`payoutPeople` + `groupRows` di `lib/payout-report.ts`): i tre
soci — Marco Lucci, Toto Piacente, Walter Giacobbe — sono una persona ciascuno
(socio e commerciale uniti da `mergePeople`, §226), ogni compenso si apre nelle
sue righe con base × percentuale = importo, e il commerciale non socio sta a
parte. `mergeVoci` toglie i doppioni (stessa riga, stesso motivo, stesso mese):
identici → una sola; pezzi diversi dello stesso fatto → sommati.

**Proposte per i movimenti senza fattura né riga** (`matchCandidates`, `lib/bank.ts`):
sotto il movimento compaiono fino a due righe candidate, con punteggio e ragione
(importo lordo, numero documento, cliente) e l'IVA che avrebbe se fosse quella.
Sono **proposte**: non si scrive niente, l'aggancio lo conferma una persona
(§189). Sono candidate solo le righe non già coperte da un movimento vero, e se
una riga è la prima scelta di più movimenti la pagina dice «contesa da N».
Su ottobre 2026: 19 movimenti senza riga, 2 con proposta — gli altri non hanno una
riga di costo a cui agganciarsi, e questo è il dato.

Gate: `npx tsx lib/mese-banca.check.ts`.

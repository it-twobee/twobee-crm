# Passaggio Economics a Claude Code

## Percorso unico e verificabile — 16 novembre 2026

Riepilogo per compiti e sequenza patto→documento→movimento→risultato; navigazione compatta, sorgente immediata e origine del controllo conservate nei collegamenti e nei form. Accessi comuni a sintesi/grafico/dati, ritorno alla voce con filtri di pagina e riapertura dei dettagli. Banca giornaliera per singolo conto; Fatture mensili con drill-down esplicito; canoni e totali a corpo separati; impostazioni ed esportazioni progressive. Stato di caricamento comune. [Flusso, grafici e limiti della verifica](percorso-economics-2026-11-16.md). Nessuna scrittura economica, nuovo permesso o promozione delle sezioni in uso.


## Compensi soci leggibili anche con fonti incomplete — 16 novembre 2026

Corretti il blocco indiscriminato dai mesi precedenti e l’identità Toto Piacente/Toto. Quote sulle righe note e sugli incassi verificati con dettaglio e qualifica parziale; registro compensi e prove bancarie caricati, senza inferire pagamenti dalle spunte. PDF v2 e grafico allineati. [Criteri, riscontro reale e verifiche](compensi-lab-2026-11-16.md). I totali incompleti e il debito complessivo non sono trasformati in importi da bonificare; nessuna scrittura DB.


## Grafici interattivi — 16 novembre 2026

Grafici nel Lab per Banca, Fatturazione, Accordi, Risorse/F24, IVA, Conto economico/compensi, Previsionale/scenario e Progetti. Filtri, serie, titolo, barre/linee, dettaglio con fonti, vista compatta mobile e CSV/SVG/PNG. Dati dai motori esistenti; nessuna scrittura economica o promozione. [Uso, fonti e limiti di verifica](grafici-economics.md).


## Raccordi documentali — checkpoint 16 novembre 2026

Audit in sola lettura con cutoff 15 novembre: [dossier e fonti](raccordi-economics-2026-11-15.md), [proposte esatte da approvare](raccordi-economics-proposti-2026-11-15.json). Undici collegamenti fattura passano la simulazione canonica; F24 ottobre 842,38 € recuperato e quadrato, con movimento candidato identificato. Nessuna scrittura economica applicata.

Il Lab esclude dal piano cinque voci seed del centro Personale come il percorso canonico, conservando i costi HR registrati: restano tre ricavi e un costo attesi senza occorrenza per ottobre/novembre. Le 43 righe con riferimenti da raccordare comprendono cause sovrapposte, non solo divergenze fra registri; il dettaglio apre il movimento coinvolto. Il dossier aggiorna i conteggi delle sezioni precedenti. Saldi assoluti, copertura IVA e sostenibilità restano non certificati. Verifica visiva autenticata aperta: nessun browser collegato alla sessione CLI.


Aggiornato il 15 novembre 2026. L'utente ha scelto di continuare qui con Codex;
questo file mantiene la continuità se occorre passare a un altro terminale.
Non è disponibile una misura dei crediti residui: non dichiararli esauriti.

## Mandato corrente

L’utente ha autorizzato esplicitamente il push su main al termine di tutto il lavoro. Ultimo completamento implementativo: filtro fatture per trimestre esplicito, percorsi IVA→fatture/competenze, accordi→righe/editor, originali fattura e accessi alle sezioni di gestione esistenti. Non rettificare dati storici o rimuovere n/d senza fonti. Verifiche finali passate: TypeScript e build isolato, 137/137 gate Europe/Rome; Banca/Collegamenti/Fatture anche UTC e America/Los_Angeles. HTTP: dieci ingressi 307 con parametri conservati e 17 chunk 200/MIME JS. Chiudere con fetch/divergenza, commit/push senza force e verifica /api/version; deploy distinto dalla promozione e dalla prova autenticata/visuale. Le note successive documentano i checkpoint precedenti dello stesso checkout.

Secondo intervento nello stesso checkout: `lib/lab-connections*`, navigazione da movimenti a righe/risorse/F24/IVA/compensi, focus persona/F24/liquidazione, home con controlli per mese e selettore diretto. Mapper verificato sui riferimenti reali, senza mutazioni. Suite 137/137 passata, TypeScript e build finale passati; Banca/Collegamenti anche UTC e America/Los_Angeles. HTTP: nove ingressi 307 con parametri conservati e 17 chunk 200/MIME JS. Server di prova fermato. TypeScript va eseguito dopo il build: farli in parallelo ha prodotto errori sui tipi generati rimossi durante la rigenerazione, poi risolti dal controllo sequenziale. Conservare anche le modifiche del primo blocco, non pubblicate. Non dichiarare completa la riconciliazione dei dati o la prova visuale.

Il 15 novembre l’utente ha richiesto integrazione effettiva dei dati di tutte le sezioni e forte miglioramento UI/UX responsive. Primo intervento locale, TypeScript/136 gate/build finale/HTTP passati, descritto nella sezione iniziale di docs/progetto-moduli-economics.md: navigazione comune, focus accordo corretto, profili prevalidati dallo stesso motore e confronto mobile. Non dichiarare terminata l’integrazione: fonti/registri/riserva e regolamenti restano da raccordare. Le prove via screenshot non certificano contrasto o mobile; nessun browser disponibile nella sessione CLI.

Progetto approvato, esecuzione graduale nel Lab, commit e push su main dopo i
gate autorizzati. Checkpoint attuale: prima capacità Previsionale / Simulatore.
Leggere CLAUDE.md, docs/lab.md e docs/progetto-moduli-economics.md (piano corrente,
non archivio) prima di intervenire. Lo stato analitico è in docs/stato.md.

Restano DB produzione solo SELECT, nessuna migration, Lab solo super admin
attivo e senza scritture. Nessuna promozione automatica delle pagine Economics.
Fonti mancanti n/d/stimato, mai zero; proposte di aggancio non sono conferme.
Le regole e i gate di CLAUDE.md prevalgono su questa sintesi.

## Base pubblicata

- 813dd42: home Lab, Banca/Fatturazione.
- d759615: recupero chunk, un solo reload per build/scheda.
- 598e60b: Accordi.
- 243c935: Risorse & tasse e documenti privati.
- b1addb9: IVA; riserva e leva restano n/d con fonti incomplete.
- a9d2997: Conto economico Effettivo/Maturato e PDF compensi binario firmato,
  135 gate/build/HTTP passati. Produzione verificata con /api/version:
  a9d2997f4a8b, builtAt 2026-11-14T19:25:26.626Z.

Per il nuovo commit leggere git log -1 -- lib/lab-forecast.ts, verificare
origin/main e /api/version prima di dichiarare il deploy.

## Previsionale implementato, in verifica

File: lib/lab-forecast.ts (motore puro), lib/lab-forecast-load.ts (lettore
protetto), lib/lab-forecast.check.ts, app/(dashboard)/lab/previsionale/page.tsx,
link home Lab. Estensioni additive: projectedMonthRows in lib/pl-rows.ts,
export del validatore isTerms già esistente in lib/cash-calendar.ts.
Non sono cambiate percentuali, formule o regole delle pagine in uso.

Il Simulatore usa contratti reali come profili; quantità, capacità, avvio,
ritardo, esterni completi e rischio sono ipotesi della sola pagina. Non crea
clienti, contratti o assunzioni. Base e scenario coincidono con zero clienti.
Canoni e accordi a corpo mantengono calendario e rate. Commerciale e soci
passano dal motore canonico; costo condiviso, rate incoerenti o profilo
incompleto impediscono delta non dimostrabili. Un mese registrato sostituisce
il piano; incassi già osservati non sono sommati nuovamente.

Orizzonte economico dal prossimo mese intero, sei o dodici mesi. Flussi
incrementali da oggi, con anticipi di costo prima dell'avvio e coda oltre il
termine. Ritardi e compensi seguono i calendari canonici. Lo stress mantiene
i fornitori; il maturato non è annullato perché manca l'incasso ipotetico.
Il delta dei flussi è lordo e non include tutta la fiscalità/capacità aggiuntiva.

Saldo minimo/finale assoluto, residuo societario completo, riserva IVA e numero
di clienti sufficiente alla sicurezza sono sempre n/d in questa prima capacità.
Mancano ancore/copertura, residui riconciliati, oneri/capacità e regolamenti soci.
La ricerca finita esiste e viene provata su casi sintetici, ma non è collegata
al reale: non abilitarla con flag di completezza o valori zero sostitutivi.
Nessun ticket medio, pattern statistico o probabilità inventata. Storico di sei
mesi di calendario completi, novembre parziale escluso; comparabilità non provata.

## Evidenze e verifiche

SELECT separate del 14 novembre, non snapshot transazionale: 18 accordi,
20 rate, 49 voci costo, 338 movimenti, cinque conti/sottoconti. Dieci profili
growth e sette digital elencabili; sei growth e quattro digital tecnicamente
simulabili dopo i controlli, senza certificare prezzi/capacità/comparabilità.
Base nota dicembre 2026: 19.900 EUR di ricavi pattuiti e 12.538,33 di costi piano;
gennaio-maggio 2027: 13.400 EUR ricavi per mese, costi piano variabili. Non sono
saldi reali né costo HR/fiscale completo. Un accordo attivo termina nell'orizzonte.

TypeScript e suite 136/136 passati; nuovo gate anche UTC e America/Los_Angeles.
Build finale passata, con filtro mesi IVA allineato alla vista IVA. HTTP
locale: sei chunk 200, base e scenario anonimi 307 verso login con parametri
preservati. Server locale di prova fermato. Browser
integrato senza sessioni: nessuna prova autenticata/contrasto certificata.
Aggiornare qui gli esiti finali e verificare git status prima di lavorare.

## Come chiudere o riprendere

1. Controllare git status e il commit corrente: gate, build e HTTP sono già
   passati. Ripeterli se cambiano le sorgenti o emergono nuovi problemi.
2. Aggiornare progetto, Lab, stato e questo file; solo file del checkpoint.
3. Fetch, controllo divergenza, commit/push autorizzati, niente force push.
4. Verificare deploy; gli hash chunk locali differiscono da quelli di produzione.
5. Fermarsi al checkpoint: raccomandato audit/riconciliazione e prove di
   promozione, non sostituzione automatica delle pagine in uso.

Comandi: TypeScript senza errori; tutti i lib/**/*.check.ts con TZ=Europe/Rome.
tsx temporaneo: npm exec --yes --package=tsx@4.20.6. Build isolata:
NEXT_BUILD_DIR=.next-build npm run build, senza dev attivo. Non stampare/copiare
credenziali: sono già nell'ambiente locale. Non cambiare manifest o lockfile.

Prima della promozione restano tre occorrenze ricavo e sei costo mancanti nei
mesi ottobre/novembre, 43 righe con registri concorrenti e divergenze dai patti.
Non scegliere un'autorità del registro né correggere dati senza la decisione
umana richiesta. Regolato soci e residui non sono certificati dalle spunte.

## Prompt per l'altro terminale

«Leggi CLAUDE.md e docs/passaggio-economics-claude.md, controlla git status e
riprendi dalle attività aperte. Non rifare il progetto e non modificare dati
in produzione. Completa verifiche, documentazione e pubblicazione autorizzata;
distingui implementazione, deploy e promozione.»

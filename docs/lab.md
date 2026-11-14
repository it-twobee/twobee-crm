# Laboratorio (`/lab`, §474-§500)

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
economiche nascono qui, leggono i dati veri e **non scrivono niente**; finché non
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
gli esperimenti precedenti restano consultabili a parte. Gli altri moduli
sono indicati come da costruire, senza link a schermate incomplete.

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

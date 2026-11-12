# Laboratorio (`/lab`, §474-§500)

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
- **Fatturazione** (`/lab/fatturazione`): fatture emesse aperte con `isOpen` e
  `invoiceStatus`, movimento candidato da `txCandidates`. Il caricamento è
  `lib/invoices-load.ts`, lo stesso della pagina in uso.
- **Banca**: non c'è ancora.

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

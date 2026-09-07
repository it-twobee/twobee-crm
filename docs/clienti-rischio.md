# Rischio cliente (§197)

## Rischio cliente (§197, `lib/risk.ts`)
`compute_client_risk` (migration 014) leggeva fatture, KPI e ticket. La **146**
l'ha droppata nel reset insieme alla tabella `invoices`, e `client_kpis`/`tickets`
sono rimaste vuote: da allora nessuno scriveva più `clients.risk_score`, e tutti
gli undici clienti erano fermi a **0** — compresi i quattro `scaduto`. Il badge
diceva «Basso rischio» a chi non pagava da mesi. **Uno zero che nessuno aggiorna
è peggio di un campo vuoto: il vuoto lo si nota, lo zero lo si crede.**

Il motore nuovo è puro e **non scrive in tabella**: le pagine che mostrano il
rischio caricano già le sue sorgenti, un punteggio in colonna invecchia fra due
ricalcoli, e un ricalcolo notturno riempirebbe `activity_log` (§179) di modifiche
che nessuna persona ha fatto. `risksFor(rows)` è l'unico mappatore dalle righe
del database ai punteggi — lista clienti, scheda e dashboard passano da lì, o
sarebbero tre posti dove dimenticare una colonna.

Cinque segnali, tutti su sorgenti vive: **insoluto** (0–35, pesa *da quanto* il
più vecchio scoperto è lì — e §177 esclude il mese in corso, che vale fino al 15)
· **fatturato** (0–25, tre mesi contro tre) · **copertura contrattuale** (0–20;
un canone a tempo indeterminato è la copertura migliore, non un dato mancante)
· **sospensione** (0–20, §176) · **etichetta** (10 se `in_bilico`). Bande: <35
basso, <60 medio, oltre alto.

Tre regole non negoziabili, ognuna nata da un numero sbagliato visto sul database
vero:

- **Un segnale che non si può calcolare non vale zero.** Finisce in `unknown` con
  scritto perché, e sotto **due** segnali leggibili non esce nessun numero
  (`ready: false`, il badge dice «n/d»). Un punteggio costruito su un indizio ha
  la stessa faccia di uno costruito su cinque.
- **La crescita non compensa un insoluto.** Il bonus del fatturato in crescita
  (−5) vale solo se non c'è nient'altro che non va: su Industrial Service portava
  35 («medio») a 30 («basso») con 3.500 € scoperti e i contratti in scadenza fra
  26 giorni. Quando non si applica, la riga resta e dice «non compensa il resto».
- **Il confronto a tre mesi vuole due mesi pieni su tre.** Con uno solo misura
  l'inizio dello storico, non l'andamento: un cliente registrato da aprile
  leggeva «+461%», e quel bonus abbassava il rischio di chi non paga.
- **Le rate contano quanto le righe** (§177) ma non si sommano alle righe dello
  stesso mese (§193): si guardano le rate scadute dei mesi **mai aperti**, dove
  la riga non esiste. Senza, chi non paga da marzo risulta in regola perché
  marzo non è mai stato preparato.

Il tempo è un parametro, e da lì viene il trend: `withTrend` riesegue lo stesso
calcolo **trenta giorni indietro** sugli stessi dati. «Sta peggiorando?» si
risponde con due letture della stessa realtà, non confrontando oggi con un numero
rimasto in colonna. Banda morta di 5 punti, perché un'icona che oscilla non si
guarda più. Perso, partner e interno non hanno un punteggio: il perso è già
andato, e un badge lì copre i clienti veri.

`npx tsx scripts/verify-risk.ts [data]` legge gli undici clienti dal database e
li passa a `risksFor`: è il controllo della catena col codice che gira in pagina.
Il gate è `lib/risk.check.ts` (72 controlli).



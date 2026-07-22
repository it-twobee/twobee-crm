# 02 — Piano di classificazione

## Premessa: non ci sono progetti da classificare

`projects` in produzione = **0 righe**. Il §15 del brief («elenco progetti,
classificazione attuale, classificazione suggerita, confidenza…») non ha oggetto.

Non serve una UI di backfill assistito. Non serve un processo reversibile di
riclassificazione. Serve invece che **la creazione del primo progetto** chieda
la classificazione — cioè il wizard del §11 diventa il vero punto di controllo.

## Cosa c'è davvero da classificare: 12 clienti

Stato attuale e classificazione **da confermare con te** (colonna "→" = ipotesi,
non applicata):

| Cliente | `client_type` | `package` | `mrr` | `label` | → linea servizio | → modello ricavo | Confidenza |
|---|---|---|---|---|---|---|---|
| iCura Impresa | growth | Partner Quota | 3.600 | partner | Growth | recurring | media |
| Sartoria Condotti | growth | Partner Quota | 2.500 | partner | Growth | recurring | media |
| Affinity - SofiA | growth | Partner Quota | 1.800 | partner | Growth? AI? | recurring | **bassa** |
| Industrial Services & Facility | **digital** | Partner Quota | **1.800** | stabile | Digital | **?** recurring / maintenance / progetto rateizzato | **bassa** |
| Fatima Leo Salon & Academy | growth | Worker Bee Basic | 1.500 | in_bilico | Growth | recurring | alta |
| Petito Costruzioni | growth | Worker Bee Start | 1.500 | stabile | Growth | recurring | alta |
| AV Gioielli | growth | Worker Bee Start | 1.200 | **perso** | Growth | recurring **cessato** | alta |
| Plus Vending | growth | Worker Bee Start | 1.200 | stabile | Growth | recurring | alta |
| Josè Restaurant – Tenuta Villa Guerra | growth | Worker Bee Start | 1.200 | stabile | Growth | recurring | alta |
| Two Bee | growth | Partner Quota | 0 | stabile | interno | non_billable | alta |
| Seven Holding | digital | IT Digital Partner | **0** | stabile | Digital | one_off / milestone_based | media |
| Elettra Group | digital | Partner Quota | **0** | partner | Digital | one_off / milestone_based | media |

Totale `mrr` = **€ 16.300**, di cui **€ 1.800 su un cliente `digital`** e
**€ 1.200 su un cliente `perso`**.

### I 4 casi che richiedono una tua decisione

1. **Industrial Services & Facility** — `digital` con `mrr = 1.800`. È un canone
   di manutenzione ricorrente, o un progetto una tantum spalmato mensilmente per
   comodità di fatturazione? La risposta determina se quei € 1.800 restano nel
   *Total Recurring Revenue* o diventano *Digital contrattualizzato* con un piano
   di pagamento. È l'esempio vivente del problema che il brief vuole risolvere.
2. **Affinity - SofiA** — il nome suggerisce un prodotto AI. Linea `ai` o `growth`?
3. **Seven Holding / Elettra Group** — `digital` con `mrr = 0`. Sono clienti
   dormienti, o hanno lavori a progetto mai censiti in piattaforma? Se hanno
   lavori attivi, quei ricavi oggi sono invisibili ovunque.
4. **AV Gioielli** — `perso` ma con `mrr = 1.200` ancora valorizzato. Va
   azzerato con una data di fine (`end_date`), non cancellato: serve a spiegare
   il churn storico. Oggi inquina 2 dashboard su 3.

### `package` non è una dimensione affidabile

"Partner Quota" copre 5 clienti su 4 `client_type` diversi, incluso l'interno
Two Bee. Non usarlo per derivare la linea di servizio.

## Regola d'oro per il seguito

Nessuna riclassificazione automatica, perché non c'è nulla da riclassificare
automaticamente: sono 12 righe, le confermi tu una per una in una sessione da 10
minuti. Da lì in poi la classificazione è **obbligatoria alla creazione** (wizard
§11) e non è mai derivata dal nome.

## Task delle 7 righe di test

Le 7 `tasks` in produzione sono spazzatura di test ("Test 1", "tewst", "Bello 2",
"Supporto: Supporto: Ads Petito Grafiche"). Proposta: cancellazione, non
migrazione. Da confermare.

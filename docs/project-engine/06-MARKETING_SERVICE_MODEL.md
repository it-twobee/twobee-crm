# 06 — Servizi Marketing

Il §20 del brief dice la cosa più importante di tutto il documento: **la
categoria commerciale non è il motore operativo**. "Sito e-commerce" può stare
nel listino Marketing e girare sul Digital Engine.

Oggi questa confusione è già nel codice: il template `E-commerce` in
`ProgettiClient.tsx` è marcato `kind: 'growth'` con milestone da progetto Digital.

## Mappatura

| Servizio | Linea | Motore | Ricavo |
|---|---|---|---|
| Brand Identity | marketing | structured_one_off | one_off |
| Continuing Designer | marketing | **recurring_service** | recurring |
| Analisi di mercato | marketing | structured_one_off | one_off |
| Creazione evento | marketing | structured_one_off | one_off |
| Marketing Automation | marketing | structured_one_off | one_off |
| Sito web / e-commerce | **digital** | digital_project | one_off / milestone_based |

## Structured One-off

Fasi + milestone + task, senza sprint né Gantt complessa. È il Digital Project
semplificato.

- **Brand Identity**: brief → analisi → direzione creativa → proposte →
  revisioni → brand system → consegna
- **Analisi di mercato**: requisiti → ricerca → competitor → benchmark → analisi
  → output → presentazione. *Può essere anche un blocco della Startup Growth
  (§8.2) — da decidere se duplicare o riusare.*
- **Creazione evento**: concept → budget → fornitori → comunicazione →
  produzione → evento → follow-up. Fornitori e budget sono specifici: serve
  capire se bastano `project_cost_entries` (esiste) o serve altro.

## Recurring Service (§21)

Per il **Continuing Designer**: canone mensile, richieste che arrivano, capacità
finita. Non è un progetto con una fine, ma nemmeno un Growth Program con
routine di controllo.

```
Setup iniziale → Backlog richieste → Ciclo operativo → Consegne → Revisioni → Report
```

Niente sprint, niente milestone rigide, niente Gantt. La UI è orientata a
**richieste, priorità, capacità, consegne, revisioni**.

Le richieste sono task con `work_type='request'` (valore nuovo) e
`scope_type='project'`. Il ciclo è un periodo, come per le routine, ma senza
generazione automatica: le richieste arrivano dal cliente, non da un template.

**Serve `delivery_model = 'recurring_service'`**, che oggi non esiste: c'è
`recurring_operations`, pensato per il Growth. Sono due motori diversi — uno
genera lavoro da template, l'altro lo riceve da fuori.

## Da decidere

- Continuing Designer: a ore, a task, a pacchetto o a canone? Cambia il modo di
  misurare la capacità e di dire "il monte è finito".
- Brand Identity usa la stessa Gantt del Digital, o basta l'elenco fasi?
- Analisi di mercato: servizio a sé o blocco della Startup Growth?

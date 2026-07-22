# 12 — Roadmap di implementazione

## Premessa
Metà del lavoro del brief è già in produzione (doc 02). Questa roadmap copre
solo il delta reale.

| Fase | Contenuto | Migration | Peso |
|---|---|---|---|
| **0** | Split di `ProjectPageClient.tsx` (~3000 righe), nessuna modifica funzionale | — | media |
| **1** | Workstream: rename + estensione, tipi TS, refactor `project-phases.ts` | 138 | media |
| **2** | Milestone V2: tabella, CRUD, UI | 139 | media |
| **3** | Ricorrenze generalizzate + azioni utente (questa/successive/template) | 140 | media |
| **4** | Task V2: `task_type`, checklist, visibility | 141 | piccola |
| **5** | Template di servizio + catalogo esteso | 142 | media |
| **6** | **Wizard a 10 step** e chiusura degli altri 10 punti di creazione | 143 | **grande** |
| **7** | Rimozione Sprint dal codice (12 file con `sprint_id`, 58 con "sprint") | 144 | media |
| **8** | Workload: filtri e timeline a 4 livelli | — | **grande** |
| **9** | Portali: Workspace, Cliente (label), Risorsa | — | media |
| **10** | Pilota end-to-end + verifica RLS con utenti reali | — | media |

## Percorso consigliato
```
0 (split) → 1 (workstream) → 2 (milestone) → 6 (wizard) → 7 (sprint out) → 8 (workload) → 9 (portali) → 10 (pilota)
```
Le fasi 3, 4, 5 possono entrare in parallelo dopo la 2.

**La fase 0 va davvero per prima.** Aggiungere due livelli di gerarchia dentro un
componente da 3000 righe che già gestisce sprint, milestone e task insieme è il
modo più rapido per rendere le fasi 1 e 2 impossibili da rivedere.

## Acceptance criteria (§23) — stato di partenza
Già soddisfatti oggi: #6, #7 (idempotenza garantita dal DB), #8, #10, #15, #16,
#17, #18, #19.
Da costruire: #1–#5, #9, #11–#14, #20–#22.

## Nota su §11 (reset)
Non applicabile: vedi doc 10. Non c'è dataset legacy.

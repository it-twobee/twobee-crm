# 06 — Audit Portale Admin

> Punteggi 1–5 (utilità operativa/strategica, dati reali). Azione: KEEP · OPTIMIZE ·
> MERGE · MOVE · HIDE · DEPRECATE · REBUILD (mai DELETE senza ok).

| Sezione | Cosa abilita | Dati reali | Util. | Azione | Nota |
|---|---|:--:|:--:|---|---|
| Dashboard | "come sta l'azienda oggi" | ⚠️ sparsi | 5 | KEEP | 17 query; alcuni widget vuoti perché DB vuoto |
| Clienti (+dettaglio) | gestione anagrafica/KPI/relazione | ✅ | 5 | KEEP | tab ricche; `is_internal` da popolare |
| Progetto (ProjectPageClient) | esecuzione progetto | ✅ | 5 | OPTIMIZE | **2191 righe**: spezzare in sotto-componenti |
| Progetti / Portfolio | vista d'insieme | 🟢 | 4 | KEEP | pattern suggeriti ok |
| Le mie attività | lavoro personale, 5 viste | ✅ | 4 | KEEP | possibile MERGE con `/task`,`/operativa` |
| Workload | progetti paralleli, effort | 🟢 | 5 | KEEP | dipende da PM+stime (oggi 0) |
| Calendario | agenda + colleghi | 🟢 | 4 | KEEP | richiede env Google sul deploy |
| Chat | comunicazione interna | ✅ (0 msg) | 4 | KEEP | 4 gruppi; DM privati |
| Commerciale | pipeline vendite | ⚠️ 0 deal | 4 | KEEP | attende popolamento |
| Fatturazione | crediti/incassi | ⚠️ 0 | 4 | KEEP | vuota in demo |
| Controllo Gestione | margini/costi | 🔒 | 5 | KEEP | **verificare RLS/guard** |
| Soldi/costi-risorse | costi risorsa | 🔒 | 4 | KEEP | sensibile |
| Customer Care + Ticket | supporto cliente | 🟢 | 4 | KEEP | separato dalla chat ✅ |
| HR (+timesheet) | risorse/ferie/spese | ⚠️ 0 | 4 | KEEP | attende uso |
| Reparti | board per reparto | 🟢 | 3 | OPTIMIZE | sovrapposizione con progetti/attività |
| Strategia (OKR) | obiettivi | 🟢 | 4 | KEEP | 1 objective |
| Roadmap / Decision Center | direzione | 🟢 | 4 | KEEP | nuovi, super_admin |
| TwoBee OS | meta-dev | 🟢 | 3 | KEEP | uso interno dev |
| Feedback | idee team | 🟢 | 3 | KEEP | |
| Impostazioni/Profilo/Cronologia | admin utenti + audit | ✅ | 5 | KEEP | cronologia = activity_log (768) |
| **`/operativa`** | ? | ⚠️ | 2 | **MERGE/HIDE** | probabile doppione di attività |
| **`/task`** | ? | ⚠️ | 2 | **MERGE/HIDE** | doppione le-mie-attivita |
| **`/timeline`** | ? | ⚠️ | 2 | **MERGE** | assorbibile in Workload/attività |

### Problemi principali (Admin)
1. **God-components**: `ProjectPageClient` 2191, `KpiTab` 1806, `SlackChat` 1673,
   `PanoramicaTab` 1516 → manutenibilità e rischio bug. OPTIMIZE (non urgente).
2. **Doppioni di navigazione**: `/task`, `/operativa`, `/timeline` vs
   `/le-mie-attivita`+`/workload`. Decidere e consolidare.
3. **Widget/sezioni vuote in demo** (fatture, deal, HR): non è un bug, ma serve
   un buon *empty state* con CTA ("crea il primo deal") — vedi `10`.

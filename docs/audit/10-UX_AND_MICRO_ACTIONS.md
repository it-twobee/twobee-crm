# 10 — UX & Micro-operazioni

## UX trasversale
### Punti forti (verificati)
- **Design system a token** light/dark, 0 violazioni WCAG AA sulle sezioni
  auditate (dashboard, workload, calendario…). Regole in `CLAUDE.md`.
- Focus visibile globale, `prefers-reduced-motion`, tipografia ≥12px.
- Toast (sonner), conferme sulle azioni distruttive (es. spostamento bacheca,
  eliminazione task).

### Problemi UX
| Tema | Dove | Azione |
|---|---|---|
| **God-components** | ProjectPageClient 2191, KpiTab 1806, SlackChat 1673, PanoramicaTab 1516 | OPTIMIZE: spezzare; densità visiva alta |
| **Empty state deboli** | fatture, deal, HR (0 dati) | aggiungere messaggi + CTA ("crea il primo…") |
| **Tema mancante** | portale Cliente, portale Risorsa | montare `ThemeToggle` |
| **Doppioni di navigazione** | `/task`,`/operativa`,`/timeline` | MERGE/HIDE |
| **Sezioni "database"** | alcune tab cliente sembrano tabelle grezze | dare gerarchia visiva e sintesi in testa |
| **Precompilazione** | form task senza default (stima, scadenza) | precompilare quando possibile |

## Micro-operazioni — stato (a campione, verificato via server actions)
| Operazione | Action/route | Auth | Audit log | Stato |
|---|---|---|---|---|
| Crea/elimina cliente | delete-client | admin | ✅ activity_log | 🟢 |
| Crea progetto | workspace-create.createProjectWs / UI admin | staff | ⚠️ | 🟢 |
| Assegna PM | (via modifica progetto) | admin | ⚠️ | 🔴 **non usato (0 PM)** |
| Crea sprint/milestone | workspace-create.createSprintWs/createMilestoneWs | staff | ⚠️ | 🟢 |
| Crea task | workspace-create.createTaskWs / reparti.createClientTask | staff | parziale | 🟢 |
| Multi-assegna task | task-assignees.setTaskAssignees | staff | ⚠️ | ✅ **nuovo** |
| Cambia stato task | reparti/BachecaView/pmUpdateTask | staff/PM | parziale | 🟢 |
| Stima ore / log ore | (form task) / time logs | staff | — | 🔴 **stime 0** |
| Richiedi eliminazione | task_deletion_requests | staff | ✅ | 🟢 |
| Elimina task (PM) | workload-tasks.pmDeleteTask | PM/admin | revalidate | ✅ |
| Crea lead/deal/preventivo | quote-builder, proposals, lead-notify | admin | ⚠️ | 🟢 (0 dati) |
| Carica busta paga | payslips.uploadPayslip | admin | ⚠️ | ✅ signed URL |
| Richiedi/approva ferie | (HR UI) | staff/admin | ⚠️ | 🟢 (0 dati) |

### Note micro-operazioni
- **Audit log**: `activity_log` ha 768 righe → alcune operazioni loggano. Non tutte
  le server action scrivono audit in modo uniforme → OPTIMIZE (coerenza log).
- **Feedback utente**: buono (toast) ma non universale in tutte le action.
- **Conferme**: presenti sulle distruttive principali; verificare copertura completa.

## Raccomandazioni UX prioritarie
1. `ThemeToggle` nei due portali mancanti (P1).
2. Empty state con CTA sulle sezioni a dato zero (P2).
3. Precompilazione stima/scadenza nel form task (aiuta il Workload) (P1).
4. Consolidare le rotte doppie (P2).
5. Rifattorizzare i god-components in modo incrementale (P2/P3).

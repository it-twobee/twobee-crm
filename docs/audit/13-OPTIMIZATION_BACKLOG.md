# 13 — Optimization Backlog (prioritizzato)

> P0 sicurezza/blocco · P1 alta utilità · P2 ottimizzazione · P3 rifinitura.
> Effort: S (≤mezza giornata) · M (1–2 gg) · L (>2 gg). Nessun `DELETE` senza ok.

## P0 — sicurezza / blocco utilizzo
| ID | Problema | Portale | File/Tabelle | Effort | Acceptance |
|---|---|---|---|---|---|
| INFRA-01 | Env Google mancanti sul deploy | tutti | env deploy, Google Console | S (config) | connessione Google riesce; redirect URI ok |
| INFRA-02 | Verificare bucket privati `payslips`,`personal-documents`,`best-ideas` | workspace | Supabase Storage | S | i 3 bucket esistono e sono privati |
| DATA-01 | Assegnare PM ai 4 progetti (`manager_id`) | admin | projects | S (dato) | 0 progetti attivi senza PM |
| DATA-02 | Popolare/confermare `client_assignments` | cliente | client_assignments | M | almeno 1 cliente entra nel portale |
| SEC-01 | Chiudere RLS `USING(true)` su tabelle sensibili | tutti | 015,032,038,043(,035,029) | M | policy per ownership/ruolo; test cross-tenant fallisce |

## P1 — alta utilità operativa
| ID | Problema | Portale | File | Effort | Acceptance |
|---|---|---|---|---|---|
| DATA-03 | Stima ore + scadenza sulle task attive | tutti | tasks (dato) + form | M | Workload usa dati reali, non default 4h |
| UX-01 | `ThemeToggle` nel portale Cliente | cliente | ClientPortalView | S | toggle presente e funzionante |
| UX-02 | `ThemeToggle` nel portale Risorsa | risorsa | RisorsaNav | S | idem |
| WL-01 | Hint "assegna un PM" nel Workload quando manca | admin/ws | WorkloadClient | S | hint + link a modifica progetto |
| UX-03 | Precompilazione stima/scadenza nel form task | tutti | SprintMilestoneBoardSection, ProjectPageClient | M | default sensati; meno DQ-02/03 |
| CAL-01 | Verifica end-to-end calendario post-env Google | tutti | google/* | S | eventi propri + colleghi ("Occupato") |

## P2 — ottimizzazione
| ID | Problema | Portale | File | Effort | Acceptance |
|---|---|---|---|---|---|
| NAV-01 | Consolidare rotte doppie `/task`,`/operativa`,`/timeline` | admin | relative page | M | una sola vista; redirect dalle altre |
| CONS-01 | Decidere consolidamento Workspace↔Risorsa | risorsa/ws | layout, sidebar | L (decisione+impl) | un modello unico o separazione dichiarata |
| DQ-VIEW | VIEW "salute dati" + widget admin | admin | migration additiva | M | widget mostra i conteggi di `11` |
| DATA-04 | Marcare clienti interni `is_internal` | admin | clients (dato) | S | statistiche non falsate |
| SPRINT-01 | Decidere: promuovere o nascondere Sprint | tutti | UI progetti | M | pratica coerente |
| EMPTY-01 | Empty state + CTA su sezioni a dato zero | tutti | fatture/deal/HR | M | ogni vuoto ha un messaggio utile |
| TIME-01 | Fonte unica time-tracking | tutti | time_entries/task_time_logs/logged_hours | M | una sola tabella canonica |

## P3 — rifinitura
| ID | Problema | File | Effort |
|---|---|---|---|
| REF-01 | Spezzare god-components (ProjectPageClient 2191, KpiTab 1806, SlackChat 1673) | components/* | L (incrementale) |
| LOG-01 | Uniformare audit log nelle server action | app/actions/* | M |
| A11Y-01 | Audit accessibilità sezioni nuove nei 2 temi | workload, buste-paga, doc-personali | S |
| MIG-01 | README schema + risolvere numeri migration duplicati | supabase/migrations | S |
| SUB-01 | Decidere futuro delle subtask (0 usate) | UI task | M |

## Regole di implementazione (dal master prompt)
- Vietato senza ok: DROP/DELETE massivo, rename distruttivo, `USING(true)` nuovi,
  route pubbliche senza auth, URL pubblici per file sensibili, admin sui DM altrui.
- Ogni fase: branch dedicato, migration **additiva**, test per ruolo, build, review
  RLS, rollback plan, changelog.

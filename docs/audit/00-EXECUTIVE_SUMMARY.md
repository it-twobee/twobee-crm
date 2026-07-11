# 00 — Executive Summary (audit TwoBee OS)

> Audit **solo analisi**, verificato su codice + DB reali. **Nessun codice
> modificato.** 14 documenti in `docs/audit/`. Sotto: i TOP 10 e la richiesta di
> approvazione prima di implementare.

## Verdetto in una riga
Piattaforma **matura di struttura** (87 tabelle, 4 portali, RLS, ~90 server action,
16 route AI) ma **acerba di dato e con 5 punti da chiudere prima del go-live**. Il
lavoro che serve non è "costruire di più": è **stabilizzare, popolare, semplificare**.

---

## TOP 10 PROBLEMI (verificati)
1. **0/4 progetti hanno un PM** (`manager_id`) → nessuna accountability, editing Workload bloccato.
2. **`client_assignments` vuota** → nessun cliente reale può entrare nel portale.
3. **Env Google mancanti sul deploy** → calendario mutilo, errore "client_id".
4. **RLS `USING(true)`** su `client_interactions`, `project_appointments`, `project_comments`, `client_kpi_config` → possibile lettura cross-tenant per utenti autenticati.
5. **38/38 task senza stima ore** → Workload approssimato (default 4h).
6. **29/38 task senza scadenza**, **21/38 senza owner** → non pianificabili.
7. **Sprint e Subtask inerti** (37/38 task fuori sprint; 0 subtask) → livelli non usati.
8. **God-components** (ProjectPageClient 2191, KpiTab 1806, SlackChat 1673…) → manutenibilità.
9. **Rotte doppie** (`/task`, `/operativa`, `/timeline`) e **tabelle doppie** (client_assignments/user_client_assignments/client_accounts; time_entries/task_time_logs/logged_hours).
10. **Tema mancante** nei portali Cliente e Risorsa; empty state deboli sulle sezioni a dato zero.

## TOP 10 OPPORTUNITÀ
1. Assegnare PM+owner → sblocca Workload, responsabilità, reporting (ROI massimo, costo≈0).
2. Sbloccare il portale cliente → fidelizzazione e percezione di valore.
3. Popolare stime/scadenze → timeline e calendario diventano decisionali.
4. AI per stima ore e assegnazione suggerita (già 16 route AI in casa).
5. Health score cliente + lead scoring operativi nel flusso.
6. Consolidare Risorsa dentro Workspace → meno codice, coerenza.
7. Widget "salute dati" (VIEW additiva) → data quality visibile e migliorabile.
8. Decision Center + OKR realmente usati → governance tracciata.
9. Ridurre tool esterni (task/chat/doc/cal/HR già coperti) → risparmio.
10. Controllo-gestione + margin AI → margine per progetto visibile.

## TOP 10 RISCHI
1. Andare live coi clienti con le RLS `USING(true)` aperte → leak cross-tenant.
2. Token/segreti: env Google sul deploy (se messi male → OAuth rotto o esposto).
3. Dato ambiguo (assignments/time-tracking doppi) → decisioni su numeri sbagliati.
4. Workload "decorativo" se stime/PM restano vuoti → sfiducia nello strumento.
5. God-components → regressioni difficili da isolare.
6. Bucket non privati (da verificare) → documenti sensibili esposti.
7. Portale cliente vuoto/senza tema → impressione di prodotto incompleto.
8. Sprint/subtask morti → confusione su "come si lavora qui".
9. Audit log non uniforme → tracciabilità parziale delle azioni.
10. Migration duplicate → conflitti futuri se non consolidate.

## TOP 10 INTERVENTI AD ALTO VALORE (dal backlog)
1. `SEC-01` chiudere le RLS `USING(true)` (P0).
2. `INFRA-01` env Google + redirect URI (P0).
3. `INFRA-02` verifica bucket privati (P0).
4. `DATA-01` PM ai progetti (P0).
5. `DATA-02` client_assignments / tabella canonica cliente↔utente (P0).
6. `DATA-03` stime + scadenze sulle task (P1).
7. `UX-01/02` ThemeToggle nei due portali (P1).
8. `WL-01` hint PM nel Workload (P1).
9. `NAV-01` consolidare rotte doppie (P2).
10. `CONS-01` decisione Workspace↔Risorsa (P2).

---

## Stop & approvazione
Come da master prompt (§22), mi fermo qui: **non implemento senza tuo ok.**

Per procedere, indicami una delle due strade:
- **A) Fase 1 completa** (Sicurezza & stabilità): SEC-01 + INFRA + DATA-01/02.
  Le parti codice (SEC-01, hint, temi) le faccio io; env/bucket/PM/assignments sono
  azioni tue sulla piattaforma — ti do la lista esatta.
- **B) Un singolo item** a scelta dal backlog `13`, come slice isolata.

Nota: **INFRA-01/02, DATA-01/02/04 sono azioni di configurazione/dato tue** (deploy,
Supabase Storage, popolamento) — io non posso eseguirle. Le voci **codice**
(SEC-01, UX-01/02, WL-01, UX-03, NAV-01, DQ-VIEW) posso implementarle su tua conferma.

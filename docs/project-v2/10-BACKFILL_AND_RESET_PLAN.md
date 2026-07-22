# 10 — Backfill e reset

## Il §11 del brief è in gran parte inapplicabile

Il brief prevede snapshot, archiviazione legacy, ricreazione controllata,
eliminazione fisica dopo stabilizzazione. Presuppone un dataset storico.
**Non esiste** (vedi doc 01): 3 progetti creati ieri, 0 sprint, 0 commenti,
0 ore, 0 assegnazioni, 27 task auto-generate.

Il reset **è già avvenuto** il 2026-07-19 con la pulizia dei dati di prova.

## Cosa serve davvero

| Azione | Volume |
|---|---|
| Correggere `service_key` di "Continuing Designer" (oggi `analisi_mercato`) | 1 UPDATE |
| Assegnare `service_key` a "Growth Fatima Leo" (oggi NULL) → `growth_lead_gen` | 1 UPDATE |
| Definire l'accordo economico di "Growth Fatima Leo" (`economic_status='da_definire'`) | 1 riga in `revenue_streams` |
| Creare 1 Workstream per i 3 progetti esistenti | 3 INSERT (o via wizard) |
| Collegare le 27 task a un Workstream | 1 UPDATE con WHERE su project_id |
| Migrare le 5 `project_phases` esistenti | **0** — è un rename di tabella |

Nessuna archiviazione. Nessuno stato `legacy_archived`. Nessun periodo di
stabilizzazione. Nessuna cancellazione da approvare.

## Cosa preservare
Le 11 `growth_routines` e i 12 `revenue_streams`: sono l'unico contenuto
configurato a mano. Le migration 140 li toccano solo con RENAME (non distruttivo).

## Backup
Prima della 138: `pg_dump` dello schema public via Supabase Dashboard.
Con questi volumi è una precauzione da 30 secondi, non un progetto.

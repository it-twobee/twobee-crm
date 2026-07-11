# 14 — Implementation Roadmap

> Per slice, mai mega-refactor. Ogni fase: branch dedicato · migration additiva ·
> test per ruolo · build · review RLS · rollback plan · changelog.
> **Non iniziare senza approvazione** (vedi `00-EXECUTIVE_SUMMARY`).

## Fase 1 — Sicurezza & stabilità (P0)  ▸ sblocca il go-live
- INFRA-01 env Google + redirect URI (config deploy, no codice).
- INFRA-02 verifica bucket privati.
- SEC-01 chiudere `USING(true)` su client_interactions/appointments/comments/kpi_config.
- Test per ruolo: `senior`→solo /workspace; `client`→solo /portale; cross-tenant fallisce.
- **Uscita:** nessuna falla RLS nota; Google funziona.

## Fase 2 — Data quality (P0/P1)  ▸ rende i dati veri
- DATA-01 PM ai progetti · DATA-02 client_assignments · DATA-03 stime+scadenze ·
  DATA-04 clienti interni.
- DQ-VIEW widget salute dati (additivo).
- **Uscita:** Workload/timeline/calendario mostrano dati reali; clienti entrano.

## Fase 3 — Gerarchia Cliente/Progetto/Task  ▸ struttura utilizzabile
- SPRINT-01 (promuovere o nascondere) · SUB-01 (subtask) · UX-03 precompilazione.
- Membership progetto esplicita (se serve) — additiva.
- **Uscita:** gerarchia coerente fra schema, UI e pratica.

## Fase 4 — Workload & risorse
- WL-01 hint PM · rifinire vista Risorse/Timeline con dati reali.
- **Uscita:** Workload è decisionale (saturazione, conflitti, ritardi).

## Fase 5 — Workspace Operations
- NAV-01 consolidare doppioni · TIME-01 time-tracking unico · timesheet decisione.
- **Uscita:** un percorso operativo pulito per la risorsa.

## Fase 6 — Portale Cliente
- UX-01 tema · EMPTY-01 empty state · CTA · verifica RLS cliente.
- **Uscita:** l'imprenditore capisce in <30s; portale presentabile.

## Fase 7 — Portale Risorsa
- CONS-01 decisione consolidamento vs separazione · UX-02 tema.
- **Uscita:** un solo modello operativo o Risorsa dichiaratamente minimale.

## Fase 8 — Commerciale
- Popolare pipeline; AI lead scoring (suggerito→confermato).

## Fase 9 — Finanziario
- Verifica RLS costi/fatture; margin analysis; forecast.

## Fase 10 — HR
- Flusso ferie/spese/buste paga end-to-end con dati reali.

## Fase 11 — Strategia & AI
- OKR/Roadmap/Decision Center in uso; AI su stime, health score, report.

## Fase 12 — Integrazioni
- Asana (sync/webhook), Google bidirezionale, notifiche.

## Fase 13 (continua) — Rifinitura
- REF-01 god-components (incrementale) · LOG-01 audit uniforme · A11Y-01 · MIG-01.

---
### Ordine di attacco consigliato (primo sprint)
`INFRA-01 → INFRA-02 → SEC-01 → DATA-01 → DATA-02 → DATA-03` — chiude sicurezza e
rende i dati veri. Solo dopo, funzionalità (UX temi, hint PM, consolidamenti).

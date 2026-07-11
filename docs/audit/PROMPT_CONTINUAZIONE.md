# Prompt di continuazione — Stabilizzazione TwoBee OS

> Incolla questo in una nuova sessione di Claude Code. È autosufficiente: presuppone
> solo il repo `/Users/marcolucci/Claude_TwoBee_HQ_Room`.

---

## Contesto (già fatto, non rifare)
Un audit completo è in `docs/audit/` (`00-EXECUTIVE_SUMMARY.md` è la sintesi con
TOP 10 e backlog; `13-OPTIMIZATION_BACKLOG.md` è la lista prioritizzata; `11` la
data quality con query SQL). Sono già stati implementati:
- **SEC-01** → `supabase/migrations/096_rls_hardening.sql` (chiude le RLS
  `USING(true)`). **Va ancora eseguita** su Supabase → SQL Editor.
- **UX-01/02** → ThemeToggle nei portali Cliente (`ClientPortalView`) e Risorsa
  (`RisorsaNav`).

Leggi **`CLAUDE.md`** (convenzioni, design token, sicurezza) e
`docs/audit/13-OPTIMIZATION_BACKLOG.md` prima di iniziare.

## Regole non negoziabili
- **No colori hardcoded** (token light/dark); tsc pulito e `npm run build` verde
  prima di ogni commit. **Ferma il dev server prima di `npm run build`** (altrimenti
  corrompe `.next` → "Cannot find module"; fix: stop server, `rm -rf .next`, restart).
- Migration **additive**, numerate da **096+** (attenzione: `080/081/092` duplicati).
  Idempotenti (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`).
- Sicurezza: scrittura su `chat_channels`/bridge sensibili via `createAdminClient()`
  con check ruolo nella server action; mai URL pubblici per file sensibili; mai
  admin sui DM altrui; RLS OR-permissive → droppa per nome le policy lasche.
- Non fare `git push` senza che te lo chieda. Commit atomici per item.
- Verifica sul DB reale quando puoi (script node con service role da `.env.local`);
  se la sessione browser è sloggata, appoggiati a tsc + build + query DB.

## Azioni che NON può fare Claude (falle tu sulla piattaforma)
Sono P0 ma di config/dato, non di codice:
1. **INFRA-01** — env Google sul deploy: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `NEXT_PUBLIC_APP_URL` (dominio reale) + redirect URI
   `https://<dominio>/api/google/callback` in Google Console.
2. **INFRA-02** — verifica bucket **privati** in Supabase Storage: `payslips`,
   `personal-documents`, `best-ideas`.
3. **Esegui** `096_rls_hardening.sql` nel SQL Editor.
4. **DATA-01** — assegna un PM (`projects.manager_id`) a ogni progetto attivo.
5. **DATA-02** — popola `client_assignments` (o conferma la tabella canonica
   cliente↔utente; esistono anche `user_client_assignments`, `client_accounts`).
6. **DATA-03/04** — stime/scadenze sulle task; marca i clienti interni `is_internal`.
Le query di rilevamento sono in `docs/audit/11-DATA_QUALITY_ISSUES.md`.

## Lavoro CODE da fare (in ordine), una slice per volta

### 1. WL-01 (P1) — hint "assegna un PM" nel Workload
In `components/workload/WorkloadClient.tsx`, quando un progetto ha
`manager_id === null` e `canEditProject` è false, mostra un hint inline nella riga
progetto ("Nessun responsabile — assegna un PM") con link a
`/clienti/<clientId>/progetto/<id>`. **AC:** l'hint compare solo per progetti senza
PM; nessuna regressione sugli altri.

### 2. NAV-01 (P2) — consolidare rotte doppie
Valuta e consolida `/task`, `/operativa`, `/timeline` (admin) verso
`/le-mie-attivita` + `/workload`. Prima **verifica cosa rende ciascuna** (potrebbero
non essere doppioni). Se lo sono: redirect additivo, nessuna cancellazione di file
senza ok. **AC:** una sola vista canonica; le altre reindirizzano.

### 3. EMPTY-01 (P2) — empty state con CTA
Sulle sezioni a dato zero (fatturazione, commerciale/deal, HR) aggiungi empty state
con messaggio + CTA ("crea il primo deal…"). **AC:** ogni vuoto ha un messaggio utile,
non una tabella vuota.

### 4. DQ-VIEW (P2) — widget "salute dati" per l'admin
Migration additiva: una **VIEW** read-only che aggrega i conteggi di
`11-DATA_QUALITY_ISSUES.md` (progetti senza PM, task senza stima/scadenza/owner,
clienti senza assignment). Un widget nella dashboard admin che la legge. **AC:** il
widget mostra i numeri reali; nessuna scrittura.

### 5. TIME-01 (P2) — fonte unica time-tracking
Decidi la tabella canonica fra `time_entries` / `task_time_logs` / `tasks.logged_hours`
e allinea le letture. Verifica prima quale è realmente usata. **AC:** una sola fonte.

### 6. CONS-01 (P2, decisione prodotto) — Workspace ↔ Risorsa
Proponi (non implementare senza ok) se consolidare il Portale Risorsa dentro il
Workspace con capability ridotte, o mantenerlo minimale. Vedi `09-RESOURCE_PORTAL_AUDIT.md`.

### 7. Rifiniture (P3)
- **REF-01** spezzare god-components incrementalmente (ProjectPageClient 2191,
  KpiTab 1806, SlackChat 1673) — solo se tocchi già quei file.
- **LOG-01** uniformare l'audit log (`activity_log`) nelle server action.
- **A11Y-01** audit contrasto delle sezioni nuove (Workload, buste-paga,
  documenti-personali) nei due temi.

## Come procedere
Parti dall'item **1 (WL-01)**. Dopo ciascuno: tsc + build verdi, commit atomico in
italiano, e fermati per conferma prima del successivo. Se un item si rivela più
grande del previsto, fermati e dillo invece di consegnare metà lavoro.

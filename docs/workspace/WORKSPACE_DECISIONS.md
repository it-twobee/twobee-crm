# WORKSPACE_DECISIONS — risposte alle domande bloccanti

> Log delle decisioni di prodotto/sicurezza per il refactor Workspace. Fonte di verità
> per il piano di implementazione. Ogni voce va rispettata in UI + ServerAction + API + query + RLS.

## Sicurezza / perimetro (rispondono Fase 0)

**D1 — Pipeline commerciale.** Il Workspace **NON** deve vedere `deals`, `deal_activities`,
`proposal_documents`, `quotes`, né alcun dato della parte commerciale.
→ RLS: portare da `is_staff()` a `get_my_role()='admin'` su `deals`/`deal_activities`
(059), `proposal_documents` (065), `quotes` (059/064). `workspaceSearch` già li esclude.

**D2 — Fatture.** Le `invoices` **NON** sono visibili al team, in nessuna forma
(neanche lo stato pagamento).
→ RLS: rimuovere/ristringere `invoices_team_read` (002) ad `admin`. UI: già `invoices=[]`.

**D3 — Anagrafica.** La tab Anagrafica (P.IVA/dati fiscali) è visibile **solo ad admin**
(non ai `senior`).
→ UI: `canSeeAnagrafica` = solo admin/super_admin. Query/RLS: proteggere le colonne
fiscali/`mrr` di `clients` per i ruoli team (VIEW `clients_workspace` o select espliciti).

**D4 — Gate Google.** Solo `@twobee.it` può collegare il Google Calendar standard, con
**verifica server-side**. Freelance/partner con email diversa: **NO** connessione standard
→ hanno un **gate dedicato/separato** (percorso a parte, da definire in dettaglio).
→ `/api/google/auth` + `/callback`: bloccare server-side chi non è `@twobee.it`.

## Modello / prodotto (rispondono Fasi 2–3–5)

**D5 — Capacità risorsa.** Default 40h/settimana **ma NON fisso**: campo capacità
per part-time/freelance che sovrascrive il default. → nuovo campo (es.
`resource_profiles.weekly_capacity_hours` o su `profiles`), default 40, editabile.

**D6 — Modello intensità.** Effort **spalmato sull'intervallo** (start→due), non
puntuale sulla scadenza. → serve `tasks.start_date` (oggi ASSENTE): aggiungere colonna
additiva; l'intensità diventa carico giornaliero sull'intervallo.

**D7 — Assenze.** Solo `team_leaves.status='approvato'`; visibili (mostrate nel Workload).
→ integrare `team_leaves` approvate nel calcolo capacità/intensità.

**D8 — Calendar sync.** **Webhook** (Google push channels), non polling. Eventi
modificati/cancellati su Google si riflettono nel tool. → serve tabella eventi +
`external_event_id/channel_id/sync_status/last_synced` + endpoint webhook + rinnovo channel.

**D9 — Drive.** **Resta embed** (iframe `embeddedfolderview` di link incollati). NIENTE
integrazione Drive API/OAuth scope drive. → §11.1/§23: albero = embed, no tree nativo.

**D10 — Documenti legacy.** I documenti già su storage (bucket pubblico `documents`)
vanno **cancellati** (non migrati, non read-only). → rimuovere upload+URL pubblici e
ripulire i file/righe storage esistenti; restano solo i link Drive.

## Task / flussi (rispondono Fasi 1–4)

**D11 — Drawer.** Il `<TaskDrawer>` unico va usato **anche in "Le mie attività"**.
**NON** esposto ai clienti (portale cliente resta read-only, non riceve il drawer).

**D12 — Richieste Admin→Risorsa e Richiesta supporto.** Via **`tasks` + `notifications`**
esistenti (NO tabella dedicata). La richiesta accettata diventa/attiva una `task`
collegata (`origin_task_id` o equivalente); notifica al destinatario via `notifications`.

**D13 — Appuntamenti.** Finestra **20 giorni**. Matching **OR** (nome cliente O nome
progetto), con normalizzazione.

**D14 — Riunioni→task.** Le task generate dall'AII possono essere **sia interne sia
al cliente** (`is_client_task` selezionabile per item nella preview).

**D16 — Stati task.** L'helper stati terminali va progettato **estendibile** (non
hardcodare i 4 stati: `TERMINAL_TASK_STATUSES`/`ACTIVE_TASK_STATUSES` come set unico,
pronto per `richiesta_supporto` e futuri `annullato/archiviato`).

## Ambiente + gate residuo
- **D15**: l'utente non sa se le migration sono applicate → **verificato via DB service role**
  (vedi WORKSPACE_AUDIT / risposta). La migration di Fase 0 sarà comunque **idempotente**
  (DROP POLICY IF EXISTS + CREATE) → funziona a prescindere dallo stato.
- **D4-bis**: "gate dedicato" freelance/partner = **B1** (non collegano Google, solo calendario
  interno del tool). Il blocco server-side @twobee.it (Fase 0) è già coerente.

## Calendario (Fase 2)
- **Cal-Q1 (infra)**: dominio HTTPS pubblico **già disponibile** → il **webhook (2c)** si può fare in questa fase.
- **Cal-Q2 (conflitti)**: **last-write-timestamp** (vince l'ultima modifica per timestamp).
- **Cal-Q3 (form)**: includere **ricorrenza + promemoria** nel form v1 (persistiti + passthrough Google).
- **Cal-Q4 (calendari)**: solo **`primary`** (niente multi-calendario per ora).

## Cliente/Progetto (Fase 4)
- **F4-Q1 (matching appuntamenti)**: **Opzione A** — normalizzazione automatica dei nomi
  (lowercase, via punteggiatura, spazi normalizzati, token matching su cliente OR progetto).
  NIENTE campo alias da compilare a mano.
- **F4-Q2 (nomi cliente)**: **sdoppiare** i campi. `display_name` = nome visualizzato
  (backfill dall'attuale `company_name`), `legal_name` = ragione sociale (nuovo, opzionale,
  usato su fatture/preventivi/documenti fiscali). Modifica anagrafica solo admin (D3).
- **F4-Q3 (riunioni→task)**: le task suggerite dall'AI possono essere create solo da
  **admin/manager** (e PM del progetto), coerente con le altre scritture di progetto.

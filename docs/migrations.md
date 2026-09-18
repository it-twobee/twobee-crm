# Registro migration

## Stato consolidato al 2026-09-15

**Verificato sul database il 2026-09-15**, una per una: 205, 206, 207, 213, 214,
215, 222, 223 (tappe ricorrenti), 223 (commerciale) e 224 **ci sono tutte**. Sei
di quelle righe qui sotto dicevano ancora «da eseguire» ed erano applicate da
tempo: un registro che elenca lavoro già fatto è il modo più veloce per far
rieseguire una migration a qualcuno, e va riletto contro il database e non
contro la memoria (§222).

La **221** non va rieseguita: gli effetti sono stati verificati via SQL MCP,
non via REST, e la 224 ha poi corretto ulteriormente `handle_new_user`.
Il dettaglio delle policy e delle verifiche è nel paragrafo §329 sotto.

> **Provata sul campo il 2026-09-15**, per sbaglio: rieseguita, la 221 muore con
> `42710 policy "channel_guests_staff" already exists`. È dentro un
> `BEGIN/COMMIT`, quindi **rollback di tutto** — e va bene così, perché la sua
> `CREATE OR REPLACE FUNCTION handle_new_user()` avrebbe riportato indietro la
> 224, che quella lettura dai metadati l'ha tolta del tutto. Ma un errore che
> **sembra** un guasto e invece è una protezione lascia chi lo legge senza sapere
> se il danno è stato fatto o evitato: i `DROP POLICY IF EXISTS` ora coprono
> anche i nomi nuovi, così il secondo giro è innocuo e silenzioso.
>
> La regola che se ne ricava: **una migration che non si può rilanciare è una
> migration che si può solo temere.** Quando due file toccano la stessa funzione
> — qui la 221 e la 224 su `handle_new_user` — l'ordine di esecuzione diventa
> parte del risultato, e l'unico modo di renderlo innocuo è che rilanciare il
> più vecchio non disfi il più nuovo.

> **Due migration numerate 223.** `223_recurring_milestones.sql` (§337, tappe
> ricorrenti) e `223_sales_workspace.sql` (commerciale) sono **entrambe
> applicate**, nate in due sessioni parallele che non si vedevano. Il numero
> doppio non ha rotto niente — Supabase registra la sua versione, non il nome
> del file — ma il registro è una tabella ordinata e due righe con la stessa
> chiave sono una trappola per chi arriva dopo. Dopo la 228, la prossima libera è la **229**.

## 228 — la finestra di generazione la decide la cadenza (§346)

`228_recurrence_window_by_frequency.sql`: **da applicare** (dopo la 227).
Misurato il 18 settembre 2026 con tutte le regole a trenta giorni: un giro
avrebbe creato **236 occorrenze**, ~170 dalle sole sei giornaliere. Con la
finestra per cadenza sono 85, e 33 contando solo le regole che hanno un
responsabile.

- `recurrence_lead_days(frequency)`: giornaliera 7, settimanale e quindicinale
  30, mensile 90, trimestrale 180. **È l'unico posto dove quei numeri esistono.**
- `generation_lead_days` diventa **nullable** e perde il default: NULL = «quella
  della cadenza», la scrive il trigger `trg_recurrence_lead_days`
  (BEFORE INSERT OR UPDATE). Serve perché i due scrittori non possono
  condividere una costante: l'azione passa da PostgREST (che non chiama
  funzioni) e il wizard da `create_project_from_template`.
- La funzione del wizard torna a scrivere la colonna direttamente, con NULL
  quando il payload non porta niente — la 227 ci arrivava con un UPDATE in coda,
  che adesso non serve più.
- Backfill: `SET generation_lead_days = recurrence_lead_days(frequency) WHERE = 30`.
  I trenta della 227 non li ha scelti nessuno, visto che il campo non è esposto
  in nessun form.

Rilanciabile: `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`, e un backfill che
riporta allo stesso valore quello che ci è già. In coda la verifica mostra
finestra minima e massima per cadenza e quante regole restano senza responsabile.

## 227 — le ricorrenti del wizard nascono lavorabili (§346)

`227_recurring_from_wizard.sql`: **da applicare**. Riscrive
`create_project_from_template` (ultima definizione: la 155) cambiando **due
righe sole** del blocco ricorrenti, e fa un backfill.

- `generation_lead_days` **non viene più scritto** se il payload non lo porta:
  vale la colonna (`DEFAULT 30` dalla 223). Prima la funzione passava 3
  esplicito, quindi il default non si applicava mai e una mensile non generava
  niente per settimane. Backfill: `SET generation_lead_days = 30 WHERE = 3`,
  idempotente.
- `owner_id` prende il **pavimento**: riga → responsabile del workstream → PM del
  progetto. Il motore copia `owner_id` in `assignee_id`, quindi una regola senza
  responsabile genera task di nessuno. Serve ai payload che il wizard non
  costruisce — la conversione di un'opportunità vinta (225) crea progetti da
  template senza passare di lì.

**Nessun backfill sui responsabili delle 15 regole esistenti**: chi riceve una
ricorrente è una decisione di qualcuno, e scriverla qui la renderebbe
indistinguibile da una scelta vera. Le dichiara la scheda progetto («mai
generate», «N senza responsabile»), che è il posto dove qualcuno può rimediare.

Rilanciabile: `CREATE OR REPLACE` più un UPDATE idempotente. In coda la verifica
conta finestre a 3, finestre a 30, regole senza responsabile e regole mai
generate.

## 226 — richieste di accesso al foglio dei compensi (§344)

`226_report_access.sql`: **da applicare**. Crea `report_access_requests` — chi ha
chiesto di vedere `/api/compensi`, quale mese, e la decisione dell'admin —
`ENABLE ROW LEVEL SECURITY` senza policy (deny-all come `google_credentials`:
ci passa solo il service role, dietro le guard applicative). Unico su
`(token, resource, scope)` perché ricaricare la pagina non deve moltiplicare le
notifiche a chi decide. Non tocca nessuna tabella esistente e non ha backfill:
finché non è applicata, la porta mostra il modulo e l'invio risponde «non è
stato possibile inviare la richiesta» — nessun 500, e il foglio resta
raggiungibile come prima da chi ha `canSeeEconomics`.

## 225 — acquisizione cliente alla vittoria commerciale

`225_sales_client_conversion.sql`: **applicata il 2026-09-15** via MCP,
versione `20260915142808`. Sposta la
conversione `lead` → `stabile` dalla delivery all'esito Vinta, nella stessa
transazione; riusa la riga cliente e lascia intatte le altre label. Per le
opportunità senza anagrafica supporta un collegamento esplicito o il bundle
canonico, con controllo dei nomi duplicati. Proposta accettata inseribile nello
stesso esito. Nessuna generazione economica, modifica di ruoli o backfill.
Test dedicati: `supabase/tests/225_sales_client_conversion.check.sql`.
Prima del rilascio: suite SQL 223 e 225 passate su PostgreSQL 16 isolato;
225 rieseguita e ritestata. Snapshot di sole strutture, con grant SELECT della
vista workspace ripristinato nel test perché non incluso nello snapshot delle
tabelle. Verifica remota: RPC sempre solo service role, 16 clienti e una
opportunità invariati, zero vittorie pregresse da riallineare.

## Applicate il 2026-09-15: 224 sicurezza e 223 commerciale

Progetto `ujkrrryitfqboskdqhwf`, tramite MCP `apply_migration`, in quest'ordine:

| Versione registrata | File | Esito |
|---|---|---|
| `20260915125653` | `224_profile_authorization.sql` | Applicata e verificata |
| `20260915125709` | `223_sales_workspace.sql` | Applicata e verificata |

`223_sales_workspace.sql`: ripristina `deals`/`deal_activities` se assenti e le amplia; aggiunge comandi
idempotenti, riepiloghi delivery, RLS per owner/responsabili e RPC riservati al
service role. `create_client_bundle` è condivisa con la creazione anagrafica.
Prima dell'applicazione, test SQL 223/224 e riesecuzione delle migration passati
su PostgreSQL 16 isolato, con snapshot della struttura reale (Supabase 17.6),
senza copiare dati di produzione. Fixture annullate con ROLLBACK. La 223
ripristina solo le due tabelle demolite, non le policy aperte o gli altri
domini della vecchia 011; reinstalla anche `trg_log_deals`.

Verifica remota: quattro tabelle commerciali con RLS; nessuna scrittura
diretta per anon/authenticated; RPC privilegiate solo service role; opzioni
admin restituite correttamente. Conteggi invariati prima/dopo: 9 profili,
16 clienti, 30 progetti, 16 contratti, 46 righe ricavo, 88 fatture. Le quattro
tabelle nuove sono vuote. Nessun ruolo o dato aziendale esistente modificato.
Le due colonne della 222 risultano già presenti: non rieseguita.
Il rilascio iniziale è stato successivamente distribuito e confermato
dall'utente; i conteggi sopra descrivono il momento dell'applicazione 223/224.
Vedi `docs/commerciale.md` per gli incrementi successivi.

## 221 (§329): effetti già presenti, verificati il 2026-09-15

`221_role_not_from_metadata.sql` risulta **già presente nello schema reale**
del progetto `ujkrrryitfqboskdqhwf`: corpo di `handle_new_user` corrispondente
al file, RLS attiva e sole policy `channel_guests_staff` / `ticket_portals_staff`
con `USING` e `WITH CHECK is_staff()`. Prima delle nuove applicazioni il registro MCP era vuoto:
non documenta quando sia stata eseguita. Non rieseguita, perché le due
`CREATE POLICY` fallirebbero sui nomi già esistenti. Toglie a
`handle_new_user` la lettura di `role` dai metadati dell'utente — che sono
scritti da chi crea l'invito, quindi erano un modo di scegliersi un ruolo di
autorizzazione — e restringe allo staff le policy di `channel_guests` (021) e
`ticket_portals` (028), che erano `FOR ALL USING (auth.uid() IS NOT NULL)`.

Verifiche sul database, perché il reset del 2026-07-23
ha ricreato tabelle e il registro non dice cosa c'è **adesso** (§222):

```sql
SELECT prosrc LIKE '%raw_user_meta_data->>''role''%' AS legge_role
  FROM pg_proc WHERE proname = 'handle_new_user';
SELECT tablename, policyname, qual FROM pg_policies
 WHERE tablename IN ('channel_guests','ticket_portals');
```

Dopo, il controllo che la migration **non** fa da sola, perché cambiare i
permessi di qualcuno non è una cosa che deve fare uno script:

```sql
SELECT id, email, role, app_role FROM public.profiles
 WHERE role = 'admin' AND app_role IS NULL;
```

Nessuna riga è l'esito atteso. Se ne esce qualcuna, è un profilo nato da metadati
che nessuno ha dichiarato: va guardato a mano.

**Esito 2026-09-15:** zero profili `role = 'admin' AND app_role IS NULL` e zero
profili con `app_role` amministrativo ma `role <> 'admin'`. Nessun ruolo modificato.

**Correzione eseguita con la 224:** il trigger della 221 continuava a copiare
`app_role` dai metadati, anche per i valori amministrativi. L'elenco chiuso non
è un'autorizzazione: `requireEconomicsAdmin` legge proprio `app_role`. Inoltre
`profiles.app_role` è `NOT NULL`: metadato assente o non valido porta il trigger
a inserire NULL e bloccava la creazione del profilo. La 224 assegna inizialmente
`role = 'guest'` e `app_role = 'guest'`, lasciando l'assegnazione dei ruoli al
percorso server autorizzato. Il trigger `guard_profile_self_update` (SECURITY
INVOKER) impedisce anche agli utenti autenticati di riscrivere ruoli, email,
stato attivo e altri campi amministrativi sul proprio profilo. Restano
modificabili nome, avatar, telefono, mansione, competenze e configurazione
dashboard; service role e amministrazione SQL restano autorizzati. Revocati
TRUNCATE/REFERENCES/TRIGGER sui profili per anon/authenticated.

## Registro migration (Supabase Dashboard → SQL Editor)

> **§222 — attenzione al registro.** «Applicata» non vuol dire «c'è ancora».
> Le migration **003** e **113** avevano aggiunto `tasks.asana_gid` e
> `projects.asana_gid`; il reset del 2026-07-23 (**146**) ha ricreato entrambe le
> tabelle e se le è portate via, ma nel registro restano elencate come applicate
> — perché applicate lo erano, prima. La **202** le rimette. Prima di dare per
> esistente una colonna aggiunta prima della 146, **verificala sul database**.
>
> **Niente da eseguire fino alla 220.** Verificato sul database il 2026-08-01: tutte quelle
> elencate qui sotto sono applicate, `175_tax_control.sql` e `179_os_versions.sql`
> comprese. L'attribuzione via `x-actor-id` è stata provata sul database vero:
> con l'header la modifica prende il nome di chi l'ha fatta, senza resta
> «Sistema», e un UPDATE che non cambia niente non scrive più una riga.
>
> **§313 — e il modo di verificarlo in trenta secondi.** Un `ON CONFLICT` su un
> indice che non c'è fallisce con `42P10`, e PostgREST lo risolve **prima** dei
> vincoli di chiave esterna: un upsert con valori inventati risponde `42P10` se
> l'indice manca e `23503` se c'è, senza scrivere niente. Passati così tutti gli
> `onConflict` del codice, ne mancavano due — `payslips` e `item_views` — e la
> 216 li rimette. Vale come metodo, non solo come episodio: ogni upsert è una
> promessa su un indice, e dopo un reset la promessa va riprovata.
>
> **Non eseguire** `086_decisions`, `097_data_quality_view`, `098_time_tracking`:
> riguardano domini demoliti nel reset del 2026-07-23 (decisions, time tracking,
> widget salute dati) e non hanno un solo riferimento nel codice. Restano nel
> repo come storia, non come lavoro arretrato.

La vecchia affermazione su `chat_channels.project_id` non è più valida: nello
snapshot del 2026-09-15 la colonna non c'è. La creazione canali commerciale non
la usa; non è stata ripristinata da questa migration.
Numerazione: attenzione, `080_*`, `081_*`, `092_*` e **`223_*`** compaiono due
volte. Le due 223 sono interventi distinti sviluppati in parallelo:
`223_recurring_milestones.sql` e `223_sales_workspace.sql`. Non rinominare né
rieseguire quella commerciale già registrata come `20260915125709`; verificare
sempre nome completo e schema reale. La 225 è riservata alla conversione
commerciale; il prossimo libero è **226**.

> **`219_invoice_states.sql` — applicata il 2026-09-09** (§323), e lo script di
> riallineamento è passato: **6 storni collegati** leggendo `DatiFattureCollegate`
> dagli XML già in archivio, e **9 esclusioni a mano rimosse**, perché adesso le
> spiega il documento. Le esclusioni a mano rimaste sono **zero**.

La tabella qui sotto è il **changelog**: dice cosa fa ciascuna, non cosa manca.

| # | Cosa fa | Serve anche |
|---|---|---|
| `086_decisions.sql` | ALTER su `decisions` (la 044 l'aveva già creata: NON ricrearla) | — |
| `087_workspace_groups_sections.sql` | `group_key`/`group_order` + sezioni workspace nuove | — |
| `088_payslips.sql` | Buste paga, RLS owner-only | bucket **privato** `payslips` |
| `089_personal_documents.sql` | Documenti personali con scadenze | bucket privato `personal-documents` |
| `090_chat_rework.sql` | canali `team`/`dm`, `chat_dm_participants`, `chat_best_ideas` | bucket `best-ideas` |
| `091_google_credentials.sql` | token Google fuori da `user_metadata` | ricollegare Google una volta |
| `092_workspace_team_read_all.sql` | i ruoli `team` (manager…partner) leggono TUTTI clienti/progetti/task (scrittura task resta scoped) | — |
| `093_feedback.sql` | tabelle `feedback` + `feedback_votes` (RLS staff-read/own-write/admin-manage) + sezione workspace `feedback` | — |
| `115_ai_assistant.sql` | **§314 — applicata il 2026-08-28.** Assistente AI agentico: `ai_conversations`, `ai_assistant_messages`, `ai_tool_calls` (audit di ogni chiamata) e `ai_pending_actions` + `ai_logs.profile_id`. Su `ai_pending_actions` la RLS è attiva **senza nessuna policy**: è voluto — deny-all per anon e authenticated, ci arriva solo il service role, ed è ciò che rende il pulsante «Conferma» una vera autorizzazione. Se lì comparisse una policy, gli argomenti di un'azione in attesa diventerebbero leggibili e riscrivibili dal browser | la **052** (vedi sotto) |
| `052_ai_logs.sql` | **applicata il 2026-08-28, era un buco dello snapshot.** Il file era nel repo da sempre e nel database **non c'era nessuna tabella `ai_*`** — §222 nella forma pura. `lib/ai-logger.ts` fa l'insert in fire-and-forget con `.catch(() => {})`, quindi ogni log AI è stato scartato in silenzio fino a quel giorno: nessun errore, nessuna riga. Applicata insieme alla 115 in un'unica transazione, perché la 115 fa `ALTER TABLE ai_logs` e da sola sarebbe fallita per intero | — |
| `095_workspace_workload_section.sql` | voce sidebar `workload` nel workspace (il layout la inietta comunque come fallback) | — |
| `094_private_personal_tasks.sql` | task senza progetto = personali/private: `tasks_team_read_all` ora richiede `project_id IS NOT NULL` (i colleghi non le vedono) | — |
| `096_rls_hardening.sql` | SEC-01: chiude le RLS `USING(true)` (policy lasche droppate per nome) | — |
| `097_data_quality_view.sql` | VIEW read-only `data_quality_report` (widget "Salute Dati") | — |
| `098_time_tracking_consolidation.sql` | TIME-01: `time_entries` = fonte unica; trigger alimenta `tasks.logged_hours`; deprecata `task_time_logs`. **Supera la 050** (esegui solo la 098) | — |
| `099_activity_log_uniform.sql` | LOG-01: trigger audit esteso a `decisions`; RLS `activity_log` ristretta a `is_staff()` (era aperta a tutti) | — |
| `100_workspace_security_rls.sql` | Fase 0 sicurezza Workspace: economici (deals/quotes/proposals/invoices) solo admin; VIEW `clients_workspace` (mrr/fiscali azzerati); drop `clients_team_all` | — |
| `101_task_requests.sql` | Fase 1d: stato task `richiesta_supporto` (ALTER CHECK) + `origin_task_id`/`requested_by` per richieste dirette e supporto | — |
| `102_calendar_events.sql` | Fase 2b: mirror `calendar_events` (link cliente/progetto, external_event_id, sync_status) + colonne watch channel su `google_credentials` | — |
| `103_workload_portfolio.sql` | Fase 3: `tasks.start_date` + `profiles.weekly_capacity_hours` (default 40) per intensità reale; disattiva voce sidebar `progetti` (→ Workload) | — |
| `104_workload_sidebar_position.sql` | Sidebar: "Workload" tra "Le mie attività" e "Calendario" (riordino sort_order) | — |
| `105_client_names.sql` | Fase 4a: `clients.display_name` (nome visualizzato, backfill da company_name) + `legal_name` (ragione sociale); aggiorna la VIEW `clients_workspace` | — |
| `156_workspace_adhoc_section.sql` | Voce sidebar workspace "Task Ad Hoc" → `/workspace/ad-hoc` (elenco globale delle attività fuori progetto). Nel portale admin la voce è in `nav-config.ts`, non serve SQL | — |
| `155_project_v2_internal_projects.sql` | Wizard: progetti senza cliente. `client_id` nullable su `projects`/`tasks`/`recurring_task_templates` + `create_project_from_template` accetta client NULL e scrive `start_date`/`end_date` del workstream. Le policy del portale cliente restano valide (NULL non matcha mai) | — |
| `109_item_views.sql` | Operatività Fase 1: `item_views(profile_id,item_id,item_type,seen_at)` RLS own-only per il badge "Nuovo" per-utente + aggiunge `sprints.created_at` (backfill da start_date) | — |
| `159_client_people_team_read.sql` | Anagrafica: `client_contacts`/`client_stakeholders` leggibili da tutto il team interno (erano scoped alle `client_assignments`), esterni scoped ai progetti via `get_my_v2_project_ids()`. Serve perché i manager vedano dal workspace i referenti che aggiungono | — |
| `160_clients_workspace_external_scope.sql` | SEC: la VIEW `clients_workspace` è `security_invoker = false` e filtrava solo su `is_staff()`, quindi freelance/partner vedevano **tutti** i clienti. Ora gli esterni vedono solo i clienti dei progetti di cui sono membri (colonne invariate) | — |
| `161_clients_lost_at.sql` | `clients.lost_at`: data della **prima** perdita, non si azzera se il cliente torna attivo. Serve alla notifica una-tantum di cliente perso (`applyLabelChange` in `app/actions/clients.ts`). Senza, il cambio label funziona ma la notifica può ripetersi | — |
| `162_template_library.sql` | Libreria template: 18 nuovi `project_templates` (ogni voce di catalogo ne ha almeno uno, i principali 2-3) con arco di consegna datato via `relative_due_days`, ore stimate e ruoli suggeriti. Idempotente: salta i template già presenti per (servizio, nome) | — |
| `163_profit_loss.sql` | Conto economico mensile (`pl_months`, `pl_revenue_lines`, `pl_cost_lines`, `pl_config`, `pl_partners`): sostituisce il foglio Excel. Righe **copiate** nel mese, non calcolate al volo: un mese chiuso resta quello che era | — |
| `164_revenue_streams.sql` | `revenue_streams` + `revenue_installments`: un cliente ha più contratti, ognuno con la sua vita (continuativo / a termine / rateizzato). `clients.mrr` non bastava | — |
| `165_project_economics.sql` | Correzione della 164: l'economics sta sul **progetto**, non sul cliente (`revenue_streams.project_id`). Il totale cliente è la somma dei suoi progetti | — |
| `166_sales_owner.sql` | `clients.sales_owner_id` / `sales_owner_name`: il commerciale sta in anagrafica e può essere esterno al tool (segnalatori, partner) | — |
| `167_sales_origin.sql` | `sales_origin`: cliente senza commerciale → il 15% growth si divide fra i soci in parti uguali, non resta in cassa | — |
| `168_revenue_lines_origin.sql` | `pl_revenue_lines.project_id/stream_id/installment_id` + `origin (contratto\|anagrafica\|manuale)`: la riga del mese sa da dove viene, si apre il progetto dal conto economico e si distinguono le righe ancora ferme all'MRR d'anagrafica. Importi sempre copiati | — |
| `169_client_contracts.sql` | Economics nel dominio cliente: `revenue_streams.project_id` torna **nullable** (contratto senza progetto = retainer/quota partner; CHECK: almeno cliente o progetto). `clients.mrr`, `contract_start/end` e `payment_status` diventano **derivati** dai contratti (trigger + cron notturno `sync-client-payment-status`); `clients.mrr_source` dice se il numero viene dai contratti o è ancora quello scritto a mano; `contract_end` diventa nullable (canone indeterminato) | — |
| `170_mrr_only_from_sold.sql` | Correzione della 169: l'MRR deriva solo dai contratti **venduti** (`status <> 'bozza'`). Una quotazione in bozza non riscrive più l'anagrafica (azzerava il canone reale al primo `addStream`). Include la riparazione di Affinity - SofiA (1.800, dall'audit) | — |
| `171_cost_plan.sql` | Piano dei costi: `cost_centers` (aree con budget mensile), `cost_items` (spese ricorrenti con frequenza, F/V, fornitore, validità), `cost_budgets` (tetto per area e mese). `pl_cost_lines` guadagna `center_id`/`cost_item_id` + indice unico (mese, voce) per la generazione idempotente. Seed 6 aree + backfill delle uscite esistenti per categoria | — |
| `172_cost_plan_seed.sql` | Seed del piano dal foglio «P&L_Two Bee.xlsx»: 37 voci reali (preventivato 9.750 €/mese) mappate sulle 6 aree + budget di partenza = somma del piano. Correzioni dichiarate: «PC aziendali» diventa una tantum sospesa, l'outsourcing diventa variabile. Idempotente per (area, voce) | — |
| `173_project_costs.sql` | Subappalti: `cost_items.project_id` + `pl_cost_lines.project_id`. Una lavorazione affidata fuori è una voce di piano che sa a quale progetto appartiene → margine reale per progetto (ricavo del mese − costi esterni). Nessun motore nuovo: eredita frequenze, «Porta nel mese» e budget d'area | — |
| `174_vat_and_terms.sql` | `revenue_streams.payment_terms` + `cost_items.payment_terms` (metodo di pagamento: il subappalto ricalca quello col cliente) · `pl_config.vat_regime` + `vat_interest_pct`: liquidazione IVA trimestrale con l'1% sui primi tre trimestri | — |
| `175_tax_control.sql` | Sezione Fiscale: `tax_config` (IRES/IRAP/ripresa IRAP/quota accantonamento — aliquote in configurazione, non nel codice) + `tax_provisions` (quanto è stato davvero messo da parte, per IVA e imposte). RLS admin | — |
| `176_client_pending.sql` | Terzo stato cliente: `pending` = lavorazioni sospese (CHECK esteso su `client_label`) + `clients.paused_at` (data dell'**ultima** sospensione, si azzera alla ripartenza). Fuori da MRR attivo, conto economico, alert e churn; dentro la relazione | — |
| `177_payment_status_rule.sql` | Regola pagamenti: fattura il 1° del mese, valida 15 giorni. `pagato` = tutte le righe del mese incassate · `in_attesa` = **da pagare**, scoperto entro il 15 · `scaduto` = **non pagato**, dal 16 o con un mese passato scoperto. Lo stato lo determinano le checkbox `paid` delle righe di conto economico e delle rate | — |
| `178_client_type_from_projects.sql` | `clients.client_type` derivato dai progetti (trigger su `projects`): solo digital → `digital`, solo growth/marketing → `growth`, misti → `growth_digital`. Contano i progetti non eliminati, in qualunque stato; senza progetti resta il valore scelto alla creazione | — |
| `180_activity_retention.sql` | Conservazione della cronologia: `activity_config.retention_days` (default **20**, 0 = per sempre) + `purge_activity_log()` e cron notturno alle 3:40. Ogni riga muore N giorni dopo **la sua** modifica, non tutte insieme. `activity_retention_status()` dice se pg_cron sta davvero girando: senza, la finestra è solo un'intenzione e la pagina lo scrive | — |
| `181_payroll.sql` | Personale: `hr_payroll_params` (aliquote per anno, con `verified_at` — finché è NULL la sezione dichiara che stima) + `hr_people` (organico, interni ed esterni). RLS admin, ciascuno legge la propria riga. Alimenta la voce «Persone» del conto economico | — |
| `182_payroll_ledger.sql` | Il cedolino batte la stima: `hr_payslips` (competenze/imponibili/trattenute/oneri datore, con `employer_contrib` NULL = da consulente), `hr_invoices` (imponibile, IVA detraibile o no, ritenuta, importo pagato), `hr_f24` (aggregato, `individual_detail`), `hr_tfr_movements`. Estende `hr_people` (stato, CCNL, IBAN, P.IVA, regime, netto concordato) e aggiunge socio/fornitore. Seed: organico reale + cedolini e F24 di giugno 2026 | — |
| `183_hr_personal_data.sql` | `hr_people`: `birth_date` (l'età decide l'eleggibilità all'apprendistato, under 30), `has_children`/`children_count` (alzano la soglia dei fringe benefit esenti), `dependent_spouse`. Si registra la data, non l'età: un'età nel database invecchia male | — |
| `184_hiring_incentives.sql` | **Agevolazioni**: aliquote 2026 (IRPEF 33% sul 2º scaglione, buono pasto 10 €, premi 1% entro 5.000 €), apprendistato per anno e dimensione, `hr_incentives` (catalogo esoneri con tetti e finestre), campi §184 su `hr_people` (assunzione, mai-stabile, esonero, impatriati, categoria protetta), maggiorazioni di deduzione su `tax_config`, e «Persone» → «Personale» in sola lettura dal piano dei costi | — |
| `185_digital_split.sql` | Primo giro sulla spartizione digital (quota ai soci complessiva): **superata dalla 186**, che legge le colonne nuove. Eseguirla non fa danni, `digital_partners_pct` resta inutilizzata | — |
| `186_digital_partner_quota.sql` | **Spartizione digital definitiva**: sul **margine** (ricavo − subappalti), **28% a ciascun socio** · 6% commerciale · 10% casse TwoBee = 100%. Fondo rischio **opzionale** sopra 20.000 € di progetto: 9% del margine, −3 punti a testa (28→25), scelta dell'admin riga per riga (`pl_revenue_lines.risk_fund`). Il digital non alimenta più target costi e fondo rischio ordinario | — |
| `187_drop_client_package.sql` | Via i pacchetti («Hive Basic», «Worker Bee Start», «Partner Quota»): erano nomi di listino invecchiati e `clients.package` era `NOT NULL`, quindi bloccava ogni cliente nuovo. Ricrea `clients_workspace` senza quel campo e droppa la colonna. Cosa compra un cliente lo dicono i progetti e i contratti | — |
| `188_contract_projects.sql` | `revenue_stream_projects`: un contratto può coprire **N progetti** (iCura paga 3.600 e dentro ci sono lead gen, social e sito), con quota per progetto perché il margine di progetto parte dal ricavo di quel progetto · `pass_through` su contratti e righe: le **partite di giro** (budget ads anticipato) entrano in fatturato e IVA e restano fuori dalle quote del piano compensi | — |
| `179_os_versions.sql` | Cronologia: (a) `log_activity()` legge l'attore dall'header `x-actor-id` — col service role `auth.uid()` è NULL e tutto risultava «Sistema» — e non registra gli UPDATE che non cambiano niente; (b) `os_versions` + `os_version_changes`, il changelog di prodotto con un ciclo di 15 giorni dal 2026-08-01 (v1.0.0), bozze visibili ai soli admin; (c) seed della v1.0.0 con 13 voci | — |
| `189_bank.sql` | Conto corrente: `bank_accounts` + `bank_transactions` (sorgente `banca`/`derivato`/`manuale`), trigger `bank_sync_revenue_line`/`bank_sync_cost_line` (spuntare «incassato» crea il movimento dichiarato) e `bank_on_match` (riconciliare un movimento vero spegne il dichiarato e marca la riga pagata). RLS admin | — |
| `190_bank_vivid.sql` | Secondo conto: `transfer_pair_id`/`transfer_account_id` (i due lati di un giroconto sono un fatto solo), `funding_*` (provvista ricorrente) e `bank_account_centers` (quali aree di costo paga un conto → fabbisogno del bonifico). Seed del conto Vivid collegato a Marketing TwoBee e Struttura & Software | — |
| `193_one_fact_one_line.sql` | **Una rata, una riga**: indice unico su `pl_revenue_lines.installment_id` (l'economics del cliente e quella del progetto leggono lo stesso contratto: due generazioni creavano due ricavi) + trigger `pl_cost_one_shot_guard` — una lavorazione «una tantum» atterra in un mese solo, e serve un trigger perché la frequenza sta su `cost_items` e un indice vieterebbe anche i canoni. Ripulisce prima di vincolare | — |
| `194_digital_pays_structure.sql` | **Il digital paga la struttura**: `pl_config.digital_cost_target_pct` (30% del margine nel target costi) e `digital_partner_pct` da 28% a **18%**. Il margine si distribuisce ancora per intero — 6 commerciale · 18×3 soci · 30 struttura · 10 cassa — ma cambia a chi va: prima il digital non pagava un euro di persone e sede | — |
| `195_manual_movements_pay.sql` | `bank_on_match` usciva su tutto ciò che non era `banca`, quindi agganciare un movimento **manuale** (contante, carta di un socio) a una fattura non marcava niente: la riga restava da incassare e il gemello dichiarato raddoppiava l'uscita. La regola è una sola — `derivato` è una dichiarazione, `banca` e `manuale` sono fatti — e un fatto marca la riga pagata e spegne la dichiarazione. Il saldo **reale** continua a contare solo `banca` | — |
| `196_digital_partner_back_to_28.sql` | **Annulla la 194**: la quota digital di ciascun socio torna al **28%** (25% col fondo emergenza) e `digital_cost_target_pct` a **0**. Il 28% è una decisione presa, non la variabile da cui prendere per far contribuire il digital alla struttura: quella la copre il growth, e la cassa negativa in un mese digital è la conseguenza, non un errore | — |
| `197_client_risk_rewrite.sql` | **Il rischio cliente si calcola, non si conserva**: droppa `clients.risk_score`, `prev_risk_score`, `risk_factors`, `risk_trend`, `risk_updated_at` (più `compute_client_risk`, `trigger_update_risk` e i quattro trigger della 014, dove sono sopravvissuti) e ricrea `clients_workspace` senza quelle colonne. Il motore è `lib/risk.ts`, in lettura. Non è un prerequisito: senza, l'app funziona già — le colonne restano lì e nessuno le legge | — |
| `191_bank_partner_pockets.sql` | Sottoconti dei soci: `bank_accounts.parent_id`/`owner_partner_id`/`allowance_amount`, `pl_cost_lines.partner_id` + `deductible_pct`/`vat_deductible_pct`, area «Spese soci», Klaviyo a 0 (piano gratuito). I 500 €/mese a socio **sono erogato**, non un costo in più: escono come spesa della società per recuperarne IVA e deducibilità | — |
| `207_payout_lines.sql` | **§243 — applicata** (verificato sul database il 2026-09-15: `pl_payouts` risponde). `pl_payouts`: i compensi a soci e commerciali come righe spuntabili. Importo copiato dal piano, maturazione nel mese e uscita in quello dopo (`due_month`), `paid_on` scritto dal trigger con la data di oggi. Senza, la sezione Compensi resta in sola lettura come prima | — |
| `206_vat_settlements.sql` | **§242 — applicata** (verificato sul database il 2026-09-15: `vat_settlements` risponde). `vat_settlements`: la liquidazione IVA come la dice il modello F24. Dove c'è, vince sulla stima di `lib/vat.ts`; la differenza resta visibile e dice quanto fatturato manca al conto economico. Seed del 2º trimestre 2026: 9.669,33 contro gli 8.399,87 stimati | — |
| `205_settled_from.sql` | **§230 — applicata** (verificato sul database il 2026-09-15: `pl_config.settled_from` risponde). Rinomina `payout_from` in **`settled_from`**: la linea del consolidato è una sola e vale per tre cose — compensi liquidati, spunte non certificate accettate, organico dei mesi vecchi non rincorso. Una colonna che dice meno del suo contenuto è il modo in cui il prossimo se ne inventa un altro uso | — |
| `204_payout_from.sql` | **§227 — applicata il 2026-08-08.** `pl_config.payout_from` (seed 2026-07-01): da quale mese si contano i compensi maturati verso soci e commerciali. Prima è liquidato. Senza, il registro conta da sempre e mostra a ciascuno un anticipo che non esiste | — |
| `212_payout_window.sql` | **§285/§286 — applicata il 2026-08-13.** `cost_items.installment_id` e `pl_cost_lines.installment_id`: la tranche di subappalto dichiara **quale rata del cliente finanzia**, e il margine digital la toglie da quella riga invece di spalmarla sul progetto. Più `pl_config.payout_day` (default 20) e `pl_months.payout_date`: la data dell'erogazione, che decide quali incassi entrano nella distribuzione. Backfill del legame per coda del nome, dove la corrispondenza è una sola. Senza, l'attribuzione resta proporzionale (§208) e la data cade sul giorno di default | — |
| `216_missing_unique_indexes.sql` | **§313 — applicata il 2026-08-21.** Due indici unici che il registro dava per esistenti e sul database non c'erano: `payslips(profile_id, year, month)` (la 088) e `item_views(profile_id, item_id, item_type)` (la 109). Il reset del 2026-07-23 ha ricreato le tabelle e se li è portati via — §222 nella forma pura. Deduplica **prima** di vincolare: un indice unico su una tabella con duplicati non passa. Senza, caricare una busta paga falliva con `42P10` | — |
| `218_client_lead.sql` | **§321 — applicata il 2026-09-07.** Sesto stato del cliente: `lead` nel CHECK di `client_label`. Non è ancora un cliente — fuori da MRR, conto economico, alert e rischio come la `pending` (§176) — e **non è un perso**, quindi non conta nel churn. Nasce dal composer di una task ad hoc, scrivendo un nome che in anagrafica non c'è. Additiva e idempotente: allarga un CHECK, non tocca una riga. Verificata col metodo di §313: un insert con valori finti risponde `23503` (il CHECK conosce «lead») e `23514` su una label inventata, senza scrivere niente | — |
| `219_invoice_states.sql` | **§323 — applicata il 2026-09-09.** Lo stato di una fattura e la nota che la storna. `invoices.sent_on` (l'invio, dove a saperlo è solo una persona), `invoices.from_sdi` **generata** da `raw_xml IS NOT NULL` (il file è la prova del transito: uno stato che si può digitare è uno stato di cui fidarsi a metà), `invoices.rectifies_id`, la tabella `invoice_related` con `DatiFattureCollegate` come il documento lo dichiara, e `link_invoice_rectifications()` che risolve il legame per numero e controparte — non per importo, perché una nota parziale ha un importo diverso ed è il caso in cui il legame serve di più. Rilanciabile come `link_invoices_to_clients`. Additiva: nessuna riga cambia valore, li cambia lo script | `scripts/fix-invoice-states.ts --scrivi` |
| `223_recurring_milestones.sql` | **§337 — applicata il 2026-09-15** (verificato: la tabella e le tre colonne rispondono, i 185 template task sono passati a 30 giorni di finestra, e `generate_recurring_task_occurrences()` risponde 404 — il motore SQL è ritirato). `recurring_milestone_templates` (la regola che genera le tappe ricorrenti) + `recurring_template_id`/`generated_for_date`/`is_recurring_instance` su `milestones`, con l'indice unico parziale che rende sicuro rigenerare. Alza a **30** la finestra di generazione delle task (era 3: chi riceve una ricorrente non la vedeva finché non era da fare oggi) e **ritira il motore SQL** — `generate_recurring_task_occurrences()` e la sua schedulazione `pg_cron`. Quella funzione non è mai partita: la 152 la schedulava dentro un `EXCEPTION WHEN undefined_function`, pg_cron su questo database non c'è, e il risultato misurato era **185 template attivi, zero occorrenze, `last_generated_at` NULL su tutti**. La regola vive ora in `lib/recurrence.ts`, dove è pura, ha un gate e serve anche alla pagina. Senza questa migration: le tappe ricorrenti non esistono (il pannello resta vuoto e il caricamento le salta senza rompersi), e le task continuano a generarsi a 3 giorni | env Coolify **`RECURRENCE_CRON_SECRET`** + task pianificato su `/api/recurrences/run` |
| `222_sales_split.sql` | **§330 — applicata il 2026-09-14** (verificato: le due colonne rispondono, e la sola riga marcata è l'acconto di kick-off di iCura, 20.000 €). `sales_split` su `pl_revenue_lines` **e** su `revenue_streams`, booleano a `false`. Dice che la provvigione di quella riga si divide fra i soci in parti uguali **anche se un commerciale c'è**: il nome resta scritto — è il riferimento del cliente — e cambia solo la tasca. Prima l'unico modo di ottenere la divisione era marcare la riga `sales_origin = 'inbound'`, cioè **cancellare il commerciale** per far tornare un numero. Sta su due tabelle perché è dell'accordo, non del mese: `contractDrift` (§207) la riporta dall'accordo alle righe dei mesi aperti, e le rate future nascono già con la scelta presa — una scelta da rifare a mano su ogni rata è una scelta che qualcuno dimentica, e il mese in cui la dimentica il numero resta plausibile. Additiva: senza di lei il codice legge `false` ovunque e il piano compensi si comporta come prima, ma **il pulsante «divisa?» e la casella sul contratto danno errore** | — |
| `220_client_segments.sql` | **§326 — applicata il 2026-09-09.** `clients.internal_kind` ('giro' | 'progetto'), che spacca `is_internal` nelle due cose che ci stavano dentro: le società collegate che fatturano davvero (GAV Sistemi, partita IVA e una fattura emessa) e i marchi interni che non fatturano mai (Twobee, Metroquadro, Visionark, Costruisci e arreda). Il backfill segue i **documenti**, non i nomi: chi ha una fattura è un giro — e infatti ha diviso 1 giro (GAV Sistemi) da 4 progetti (Twobee, Metroquadro, Visionark, Costruisci e arreda). Verificata col metodo di §313: un insert con `internal_kind` inventato risponde **23514**, uno con `giro` passa, e nessun cliente vero ha preso un genere. Additiva; senza di lei `segmentOf` mette tutti gli interni fra i giri, che è il default prudente | — |
| `217_tracking.sql` | **§316 — applicata il 2026-09-02** (pooler, script node; verificato: 3 tabelle deny-all senza grant ad anon/authenticated, 7 con policy staff, voce workspace con 6 permessi). Modulo Tracking (port di «arealavoro»): `client_tracking` (satellite 1:1 di clients), `tracking_checklist_state`, `tracking_checks`, `tracking_qa_results`, `tracking_qa_runs`, `tracking_report_runs`, `tracking_report_rows` con RLS `is_staff()`; **`client_platform_keys`, `client_logins`, `agency_platform_keys` con RLS attiva e NESSUNA policy + REVOKE** (deny-all, solo service role, come 091/115 — non aggiungere policy). Più la voce `tracking` in `workspace_sections` (gruppo clienti) e i permessi. Additiva e idempotente | env Coolify **`VAULT_KEY`** e **`TRACKING_CRON_SECRET`** (runtime), task pianificato 07:00 |
| `215_f24_documents.sql` | **§301 — applicata** (verificato sul database il 2026-09-15: `f24_documents` risponde). `f24_documents` + `f24_lines`: il modello F24 come documento, coi suoi tributi. Ogni riga dichiara a quale mondo appartiene (`iva`, `ritenute`, `inps`, `inail`, `credito`, `altro`) e punta al dominio che ne è l'autorità — `vat_settlements` per l'IVA (§242), `hr_f24` per il resto (§182). Il `credito` **si sottrae**: è l'indennità L. 207/2024 che esce in busta e rientra (§235). `payment_allocations.f24_id` come quarto bersaglio, col CHECK rifatto a «uno solo fra quattro». Trigger `f24_lines_balance` **deferred**: il totale versato deve essere la somma dei debiti meno i crediti, ma un modello nasce vuoto e si compila una riga alla volta. Senza, i modelli non hanno un posto e la sezione lo dichiara | — |
| `214_payment_allocations.sql` | **§297 — applicata** (verificato sul database il 2026-09-15: `payment_allocations` risponde). `payment_allocations`: quanto di un movimento paga quale riga. Un movimento ha N allocazioni, una riga ne ha N, e ognuna dice se la certifica la banca o se è solo dichiarata. CHECK a un target solo (ricavo, costo, compenso), indice unico per (movimento, target) e **trigger `alloc_within_tx`** che vieta di allocare più di quello che il movimento contiene. Backfill dai legami diretti esistenti, con l'importo tagliato al minore fra il lordo del movimento e quello della riga. `bank_transactions.revenue_line_id`/`cost_line_id` restano: si droppano quando nessun chiamante li usa. Senza, il legame resta uno a uno e l'azione lo dichiara | — |
| `213_carry_forward.sql` | **§290 — applicata** (verificato sul database il 2026-09-15: `pl_revenue_lines.carried_at` risponde). `carried_at`/`carried_from`/`carry_count` su `pl_revenue_lines` e `pl_cost_lines`: la chiusura del mese marca le righe non saldate invece di lasciarle dedurre da `openAt`. La riga **resta nel suo mese** — fattura, IVA e compensi di quel mese sono già stati dichiarati fuori — e il segno dice da quante chiusure si trascina. Backfill delle scoperte nei mesi già chiusi. Senza, il mese si chiude come prima e il trascinamento resta quello dedotto | — |
| `203_cash_calendar.sql` | **§224 — applicata il 2026-08-08.** `terms`/`due_date`/`paid_on` su `pl_revenue_lines` e `pl_cost_lines` + trigger che scrive la data di oggi quando si spunta «pagato». Backfill delle righe già spuntate **alla loro scadenza**: il costo del lavoro di giugno smette di pesare su giugno e passa a luglio. Senza, l'app funziona identica e la cassa resta quella di prima | — |

**Scorciatoia**: `supabase/APPLY_PENDING.sql` è il concatenato (081, 086–093) in
transazione, da incollare una volta sola nel SQL Editor. Bucket privati da creare
a mano: `payslips`, `personal-documents`, `best-ideas`. Le env Google
(`GOOGLE_CLIENT_ID/SECRET`, `NEXT_PUBLIC_APP_URL`) sono già presenti.

Finché non le esegui l'app **non si rompe**: le pagine mostrano `SetupNotice`
e le funzioni nuove degradano con un messaggio. I bucket vanno creati a mano
(le migration non li creano).

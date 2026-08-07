# TWO BEE Gestionale — Contesto Claude Code

## Stack & architettura
- **Next.js 14** App Router, TypeScript strict, Tailwind CSS
- **Supabase** PostgreSQL + Auth + RLS (`@/lib/supabase/server` server-side, `@/lib/supabase/client` client-side, `@/lib/supabase/admin` service role)
- **UI**: design token light/dark (vedi «Design system» sotto); Radix UI; lucide-react; sonner toast
- **AI**: Groq `llama-3.3-70b-versatile` via fetch — chiave `GROQ_API_KEY` server-side
- **Charts**: Recharts (client), SVG inline (server/report)
- **Dashboard grid**: react-grid-layout/legacy — layout in localStorage (`twobee-dash-layout-v3`)

## Comandi
```bash
npm run dev    # :3000
npm run build
npm run lint
```

## Struttura cartelle
```
app/(dashboard)/
  dashboard/page.tsx              ← 17 query parallele + DashboardGrid
  clienti/[id]/page.tsx           ← tabs: Panoramica|KPI|Fatturazione|Documenti|Anagrafica|Relazione
  clienti/[id]/progetto/[pid]/    ← ProjectPageClient (tab: Progetto|Appuntamenti|Riunioni|KPI|Aggiornamenti|Chat)
  progetti/page.tsx
  chat/page.tsx                   ← SlackChat globale (da mantenere)
app/actions/
  project-channels.ts             ← ensureProjectChannels() — crea canali con service role (bypassa RLS)
  delete-client.ts                ← elimina client + cascade chat/tasks/projects
components/dashboard/             ← tutti i widget (vedi sezione stato)
components/clients/tabs/          ← PanoramicaTab, KpiTab, AnagraficaTab, ProjectStatusTab…
components/projects/ProjectPageClient.tsx  ← 2980 righe, tab Chat con ProjectChatSection
components/chat/SlackChat.tsx     ← componente chat completo (props: channelId, channelType, currentProfile…)
components/progetti/ProgettiClient.tsx     ← CRUD progetti: NewProjectDetailedModal + EditProgettoModal + DeleteConfirmModal
lib/types/database.ts             ← tutti i tipi
app/api/ai/                       ← extract-project, extract-meeting, sprint-plan, kpi-report, project-summary
supabase/migrations/              ← 001–091 (086–091 da eseguire, vedi sotto)
```

## Design system — MAI colori hardcoded
L'app ha tema chiaro e scuro (`[data-theme="light"]` su `<html>`). Ogni colore
passa dai token in `app/globals.css` + `tailwind.config.ts`. Un `#hex`,
un `text-white`, un `bg-red-500` non reagiscono al tema e rompono il contrasto.

**Vietato**: `bg-[#1A1A1A]`, `text-white/40`, `text-red-400`, `text-black`,
`style={{ color: '#F5C800' }}`, `text-[10px]`.

| Serve | Usa |
|---|---|
| sfondo pagina / superficie / hover | `bg-background` `bg-surface` `bg-surface-hover` `bg-surface-active` |
| bordi | `border-border` `border-border-strong` · input/select: `border-border-interactive` |
| testo | `text-text-primary` `text-text-secondary` `text-text-tertiary` |
| **gold come riempimento** (bottone) | `bg-gold` + `text-on-gold` |
| **gold come inchiostro** (testo, icona) | `text-gold-text` |
| stati | `text-success` `text-error` `text-warning` `text-info` `text-accent` `text-orange` (+ `-dim` per i chip) |
| overlay modale | `bg-scrim` |

**I due gold non sono intercambiabili.** `--color-gold` resta vivo in entrambi i
temi perché serve da fondo (nero sopra = 12.4:1). Come testo su bianco farebbe
1.74:1, quindi `--color-gold-text` scurisce in light. Se scrivi `text-gold` il
tema chiaro diventa illeggibile.

- Tipografia: mai sotto `text-2xs` (12px). La scala parte da `text-sm` = 15px.
- Style inline: usa `var(--color-*)`. Per l'alfa niente `${c}18` → `color-mix(in srgb, ${c} 9%, transparent)`.
- Eccezioni legittime: `app/api/**` (HTML standalone senza `:root`), `app/global-error.tsx`
  (fuori dal ThemeProvider), colori brand di terzi (Asana `#F06A35`, Google).
- Ogni interattivo deve avere focus visibile (già globale via `:focus-visible`) e
  `aria-label` se ha solo un'icona.

Verifica: apri la pagina, cambia tema, e controlla il contrasto sul DOM renderizzato
(gli screenshot mentono; le transizioni CSS falsano `getComputedStyle` — disabilitale
con `*{transition:none!important}` prima di misurare).

## Navigazione: «indietro» torna dove eri (§195)
`components/shared/BackLink.tsx`. Un link fisso a `/clienti` è giusto una volta su
due: se arrivi sulla scheda di un cliente **dal conto economico**, perché una rata
è sbagliata, la freccia ti riportava all'elenco clienti e per tornare al mese
dovevi ricominciare. Tre sorgenti in ordine: `?from=` nell'indirizzo (lo scrivono i
link che vogliono un ritorno preciso, e sopravvive a un ricarico) · la pagina
precedente registrata da **`NavMemory`**, montato nel layout della dashboard —
salva `path?query`, quindi torna al **mese giusto** · il `fallback` del chiamante.

Non si usa `router.back()`: dopo un `router.refresh()` o un cambio di tab che ha
scritto nella cronologia, «indietro» torna alla stessa pagina e sembra rotto.
L'etichetta viene da `labelOf()`: dice **dove** si torna, non «Indietro».

**Lo scroll è della pagina.** `main` del layout è già il contenitore scorrevole:
una pagina che aggiunge `h-full` + `flex-1 overflow-y-auto` crea uno scroll dentro
lo scroll, blocca intestazione e avvisi a occupare mezzo schermo e lascia scorrere
una striscia. Usa `min-h-full` e, se serve tenere le tab a portata di mano,
`sticky top-0 z-20`.

## Convenzioni codice
- Nessun commento salvo WHY non ovvi
- Cast join Supabase: `as unknown as Type[]`
- `overflow-x-auto` sui wrapper tabella (mai `overflow-hidden`)
- No `<button>` dentro `<button>` — usare `<div onClick>` per wrapper
- Set spread: `Array.from(new Set([...]))` non `[...new Set(...)]`
- Server Action: `'use server'` + `revalidatePath('/path')`

## DB — tabelle chiave
- `clients`: `company_name, client_type (growth|digital|growth_digital), package, mrr, client_label, risk_score`
- `projects`: `client_id, name, status, project_type, project_kind (growth|digital), sprint_current`
- `client_kpis`: KPI mensili, unique `(client_id, month)`
- `chat_channels`: `type (cliente|interno|task|customer_care|cliente_interno|team|dm), client_id, project_id, team_key`
- `chat_messages`: `channel_id, sender_id, content`
- `tasks`: `project_id, title, status (da_fare|in_corso|completato), is_milestone, due_date, assignee_id (PRIMARIO)`
- `task_assignees`: multi-assegnatario `(task_id, profile_id, is_primary_owner, role)`. **Sorgente canonica** dei 0..N assegnatari; `tasks.assignee_id` resta il primario (= primo della lista) perché molte viste lo leggono. Scrivi SEMPRE via `setTaskAssignees`/`bulkSetTaskAssignees` (service role), che tengono i due in sync.
- `objectives`: OKR aziendali con `progress, status`
- `deals`: pipeline commerciale con `stage`

## Autenticazione e ruoli
- `isSuperAdmin()` → `SUPER_ADMIN_EMAILS = ['m.lucci@twobee.it']` OR `app_role === 'super_admin'`
- `marco.d.lucci@gmail.com` = account sviluppo, NON è super admin
- RLS: `get_my_role()` legge `role` da `profiles` (non `app_role`) — admin, team, client, guest
- **`coarseRole(app_role)` in `lib/permissions.ts` è l'unica fonte per `app_role → role`.** Usala in registrazione (invite/accept), cambio ruolo admin e ovunque serva. Non-admin (manager…partner, viewer) → `role='team'` → il middleware li confina a `/workspace`. Non duplicare la mappa.
- INSERT su `chat_channels` richiede `role = 'admin'` → usare sempre `createAdminClient()` server-side

## Pattern ricorrenti
```ts
// Fetch server-side
const { data } = await createClient().from('table').select('*')

// Admin (bypassa RLS)
import { createAdminClient } from '@/lib/supabase/admin'
const { data } = await createAdminClient().from('table').insert({...})

// Groq AI
const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
  body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 1000,
    messages: [{ role: 'system', content: '...' }, { role: 'user', content: '...' }] }),
})
const parsed = JSON.parse((await res.json()).choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
```

## Registro migration (Supabase Dashboard → SQL Editor)

> **§222 — attenzione al registro.** «Applicata» non vuol dire «c'è ancora».
> Le migration **003** e **113** avevano aggiunto `tasks.asana_gid` e
> `projects.asana_gid`; il reset del 2026-07-23 (**146**) ha ricreato entrambe le
> tabelle e se le è portate via, ma nel registro restano elencate come applicate
> — perché applicate lo erano, prima. La **202** le rimette. Prima di dare per
> esistente una colonna aggiunta prima della 146, **verificala sul database**.
>
> **Niente da eseguire.** Verificato sul database il 2026-08-01: tutte quelle
> elencate qui sotto sono applicate, `175_tax_control.sql` e `179_os_versions.sql`
> comprese. L'attribuzione via `x-actor-id` è stata provata sul database vero:
> con l'header la modifica prende il nome di chi l'ha fatta, senza resta
> «Sistema», e un UPDATE che non cambia niente non scrive più una riga.
>
> **Non eseguire** `086_decisions`, `097_data_quality_view`, `098_time_tracking`:
> riguardano domini demoliti nel reset del 2026-07-23 (decisions, time tracking,
> widget salute dati) e non hanno un solo riferimento nel codice. Restano nel
> repo come storia, non come lavoro arretrato.

`chat_channels.project_id` **esiste** in produzione: il vecchio "BUG NOTO" è risolto.
Numerazione: attenzione, `080_*`, `081_*` e `092_*` compaiono due volte. Il prossimo libero è **184**.

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
| `095_workspace_workload_section.sql` | voce sidebar `workload` nel workspace (il layout la inietta comunque come fallback) | — |

## Workload (`/workload` e `/workspace/workload`)
Vista strategica dei progetti in parallelo: effort (ore stimate, default 4h dove
manca), timeline, carico per risorsa. Stessa `WorkloadClient` per admin e workspace.
`lib/workload.ts` = calcoli puri (l'effort di una task multi-assegnata si **divide**
fra gli assegnatari). Filtri: tipo/cliente/risorsa/periodo. Editing (stato,
riassegnazione, elimina) riservato al **PM** (`projects.manager_id`), al `manager`
di ruolo o all'admin, via `app/actions/workload-tasks.ts` (service role). Nessun
dato economico: è sicuro anche nel workspace.
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

**Scorciatoia**: `supabase/APPLY_PENDING.sql` è il concatenato (081, 086–093) in
transazione, da incollare una volta sola nel SQL Editor. Bucket privati da creare
a mano: `payslips`, `personal-documents`, `best-ideas`. Le env Google
(`GOOGLE_CLIENT_ID/SECRET`, `NEXT_PUBLIC_APP_URL`) sono già presenti.

Finché non le esegui l'app **non si rompe**: le pagine mostrano `SetupNotice`
e le funzioni nuove degradano con un messaggio. I bucket vanno creati a mano
(le migration non li creano).

## Economics — una sola fonte, tre letture
Il contratto (`revenue_streams` + `revenue_installments`) è **l'unico posto dove
si scrive un importo**. Tutto il resto lo legge:

- **Anagrafica cliente**: `mrr`, `contract_start/end`, `payment_status` sono in
  sola lettura e li scrivono i trigger della 169. `mrr_source='anagrafica'` =
  valore storico, nessun contratto ancora. Non riaprire quei campi in edit.
- **Economics del cliente** (§194, `ClientDealsPanel` dentro `ClientEconomicsTab`):
  **l'unico posto dove si quota**, organizzato per **lavoro**. Un riquadro per
  progetto — anche senza contratti, marcato «da quotare» — e dentro ciascuno le
  due metà del patto: `ContractsPanel` (quanto paga il cliente) e
  `ProjectCostsPanel` (quanto si dà via), col margine del lavoro in testata.
  Prima c'erano due posti dove scrivere lo stesso accordo, cliente e progetto, e
  il conto economico lo contava due volte. In fondo gli «Accordi senza progetto»
  (quota partner, retainer) con scritto che **non entrano nel margine di nessun
  lavoro**. Non filtrare i progetti privi di righe: sono esattamente quelli da
  vedere. **Solo super admin e admin**: il gate è `isAdminRole(app_role)`, non
  `role === 'admin'` — quello è la mappatura grossolana per le RLS e ci farebbe
  cadere dentro chiunque sia stato promosso admin di ruolo.
- **Sola lettura a valle**: nel conto economico l'importo di una riga
  `origin='contratto'` non è modificabile e la riga porta due link — il progetto
  e «modifica l'accordo», che apre l'economics del cliente. Lo stesso per i
  costi: preventivato bloccato, lucchetto che linka la fonte. **Quando cade una
  rata, quanto vale e chi la eroga si decide in un posto solo.**
- **Economics del progetto** (`ProjectEconomics`): stesso pannello ristretto a
  un lavoro. Entrambi montano `components/economics/ContractsPanel.tsx` — se
  cambi il comportamento dei contratti, cambia lì e basta.
- **Regola d'ingresso** (§176): l'economics **nasce dal progetto e solo se ha un
  cliente**. Progetti interni o senza cliente non hanno la scheda. Tutti gli
  accordi sono **IVA esclusa**: nessun campo IVA nei contratti né nei
  subappalti, l'IVA vive solo in Fiscale & Tasse (a debito e a credito).
- **Wizard** (`StepEconomics`): quota, modalità, rate e subappalto si decidono
  alla creazione. Passo visibile solo dal portale admin e solo con un cliente;
  `attachWizardEconomics` ricontrolla il ruolo lato server e fallisce da sola
  senza travolgere la creazione del progetto.
- **Previsionale** (`lib/forecast.ts`, in fondo al conto economico): i sei mesi
  che verranno, calcolati da contratti, rate e subappalti. «Apri il mese» crea
  le righe vere (`openMonth`), da lì in poi valgono le spunte fattura/incassato
  /pagato.
- **Preventivato derivato, effettivo scrivibile**: nel conto economico il
  preventivato di una riga nata dal piano, dall'organico o da un movimento è in
  **sola lettura** — riscriverlo creerebbe un secondo numero che dice un'altra
  cosa. Il lucchetto linka la fonte, e `syncBudgetsFromPlan` spinge nel mese le
  correzioni del piano (solo il preventivato: l'effettivo l'ha registrato una
  persona che ha visto la fattura). L'effettivo **nasce uguale al preventivato**:
  uno zero non significa «non speso» ma «nessuno l'ha guardato», e a fine mese si
  legge come un costo che non c'è stato — novemila euro di stipendi sparivano così.
  Le righe rimaste a zero col preventivato pieno sono segnalate in cima con un
  pulsante che le allinea.
- **Costi e budget** (`/economics/costi`): il piano delle uscite — aree con
  budget mensile, spese ricorrenti con la loro frequenza, fissi contro
  variabili. «Porta nel mese» crea le `pl_cost_lines` dal piano (idempotente).
  `lib/costs.ts` = calcoli puri. L'importo di una voce è quanto costa **ogni
  volta che torna**, non la dodicesima parte: un annuale pesa tutto nel mese in
  cui si paga. **Solo costi interni e societari**: le voci con `project_id`
  (subappalti) sono filtrate via, altrimenti il budget di un'area si muoverebbe
  per una lavorazione venduta al cliente.
- **Personale, in sola lettura** (§184): l'area del costo del lavoro si chiama
  `Personale` (`PAYROLL_CENTER` in `lib/costs.ts`) e da `/economics/costi` si
  **legge soltanto** — nessun rinomina, nessuna voce, nessuna modifica: il
  blocco vero è in `app/actions/costs.ts`, non nei pulsanti nascosti. Quelle
  righe le scrive la sezione Personale leggendo cedolini e contratti, e
  `applyPlanToMonth`/`previewPrefill` escludono l'area a monte: prima veniva
  contata due volte, una dal piano e una dall'organico.
**Il subappalto ha una gerarchia, e sta scritta in ogni sezione** (§192,
`lib/subcontracts.ts`). Un lavoro affidato fuori è **un fatto solo visto da quattro
posti**, e finché ognuno se lo raccontava a modo suo i conti non tornavano:

1. **Sorgente — la scheda Economics del progetto.** Importo, fornitore, frequenza,
   finestra: si scrivono lì e solo lì. Ogni voce mostra dov'è arrivata («da
   portare», «nel mese», «pagata», «scostata»), col vocabolario del conto economico.
2. **Atterraggio — il conto economico.** «Porta nel mese» crea l'occorrenza; lì si
   scrive **quanto è uscito davvero** e **se è pagato**, mai il pattuito. La
   sezione «Lavori affidati fuori» mostra ogni riga con fornitore, progetto e
   cliente cliccabili, il margine per progetto (ricavo − esterni) e cosa non
   torna: `subcontractFindings` segnala le **orfane** (riga con progetto e senza
   voce di piano: il margine la paga e la scheda progetto non la vede), gli
   scostamenti, i fornitori senza nome, i margini negativi e i mesi in cui il
   costo cade e la rata no.
3. **Lettura — Costi & budget e la scheda cliente.** Raggruppano e sommano; il
   primo per subappaltatore (lì si rinominano i fornitori, che è un'operazione
   trasversale), il secondo per capire quanto di un cliente esce verso qualcun
   altro. **L'importo non è modificabile in nessuno dei due**: la riga porta il
   link al progetto.

In una riga: **il patto si scrive sul progetto, il fatto nel mese, tutto il resto
legge.**

**Un fatto, una riga** (§193). L'economics del cliente e quella del progetto sono
la stessa tabella vista da due punti: senza un vincolo, generare il mese da tutte
e due creava **due ricavi per la stessa fattura** — sui 10.000 € del CRM di
Industrial Service faceva 6.500 € di fatturato inventato. Ora è il database a
impedirlo: indice unico su `installment_id`, e un trigger per le lavorazioni «una
tantum», che atterrano in un mese solo. `subcontractFindings` segnala anche le
righe rimaste nel **mese sbagliato**: due mesi che pagano lo stesso acconto hanno
entrambi un margine falso.

**La riga copia il contratto, e il contratto può cambiare dopo** (§207,
`contractDrift` in `lib/revenue.ts` + `lib/pl-realign.ts`). Il conto economico non
rilegge l'accordo: se lo copia quando il mese si prepara. Per i **fatti del mese**
è giusto — fatturata, incassata, chi era il commerciale allora — ma il **Tipo** non
è un fatto del mese: è growth o digital, e decide il **15% sull'imponibile** o il
**6% sul margine**. Correggerlo sul contratto lasciava indietro i mesi già
preparati, che continuavano a pagare la percentuale di un altro mestiere: sui
1.625 € di una rata di Fatima Leo, 243,75 invece di 97,50, senza un numero che lo
dicesse. Da qui tre regole:

- **`updateStream` riallinea da sé** i mesi **aperti**. Un mese chiuso è una
  fotografia e non si aggiorna perché la realtà è cambiata dopo.
- **Si riallinea l'accordo, non il mese**: tipo, progetto, IVA e partita di giro.
  Gli importi no — un canone partito a metà mese vale mezzo canone, e quella è
  una decisione presa da una persona guardando quel mese.
- **Il Tipo di una riga da contratto è in sola lettura** nel conto economico, col
  lucchetto che linka l'accordo e la percentuale scritta sotto. Finché era una
  select c'erano due risposte alla stessa domanda e niente diceva quale valeva.

Le righe rimaste indietro le mostra un avviso in cima alle Entrate con «Allinea ai
contratti»; `npx tsx scripts/verify-month.ts <mese>` lo dice dalla riga di comando.
Serve perché **la quadratura chiude a zero anche sui numeri sbagliati**: le quote
tornano lo stesso, solo prese dalla tasca di qualcun altro.

**Un accordo su N progetti, in codice** (§207). La 188 era solo tabella: nessuno
leggeva `revenue_stream_projects`, quindi una riga si prendeva il primo dei tre
progetti. Adesso `coveredProjects` decide — un progetto solo → la riga lo porta;
più d'uno → **non ne porta nessuno** (§188) ma li conosce tutti, e il margine
digital toglie i subappalti di **tutti quelli coperti**: senza, la quota si
prenderebbe su un ricavo di cui una parte è già del fornitore. Dove il ricavo non
è attribuibile il margine di progetto dice **n/d** invece di un negativo, e
`subcontractFindings` non manda a cercare una rata che è al posto suo.

**Spostare la scadenza sposta il mese** (§209, `lib/pl-realign.ts`). Il conto
economico **materializza** rate e lavorazioni: una volta scritte, cambiare il
piano non le muoveva, e sbagliare il mese sbaglia **due** mesi — quello che
perde il fatto continua a contarlo, quello che lo riceve non lo vede. Sul digital
il danno è doppio, perché il margine è ricavo meno subappalti *dello stesso mese*.
Adesso:

- `updateInstallment({ due_month })` sposta la riga di ricavo (creando il mese di
  destinazione se non c'è); `{ amount }` ne aggiorna l'importo.
- `deleteInstallment` e `generateInstallments` **tolgono** le righe delle rate che
  spariscono: `installment_id` è `ON DELETE SET NULL`, quindi restavano a
  fatturare senza più un contratto dietro, invisibili a ogni controllo.
- `updateCostItem`/`updateProjectCost` spostano l'occorrenza di una **una tantum**
  (§193: vive in un mese solo). Le ricorrenti no: hanno un'occorrenza per mese e
  cambiare la finestra non dice quale mese debba emigrare dove.
- Rateizzare una lavorazione già portata nel mese toglieva… niente: restava il
  costo intero **più** le tranche. Ora le occorrenze non pagate spariscono con la
  voce, e se una è **pagata** l'operazione si rifiuta dicendo in quale mese.

**I mesi chiusi non si toccano**, né in uscita né in entrata. E i **compensi non
si riallineano**: non sono scritti da nessuna parte, si ricalcolano a ogni lettura
dalle righe — è il motivo per cui basta mettere la riga nel mese giusto perché
provvigioni, erogato e quote digital tornino da sé.

**Il netto digital si fa mese per mese** (§208). La base delle percentuali è
**la rata di quel mese meno il subappalto che cade in quel mese**, mai il totale
del progetto e mai una quota spalmata: 6.500 in 4 rate con 650 di grafico pagati
ad agosto fanno agosto 1.625 − 650 = 975 (6% = 58,50 · 28% = 273 a socio) e gli
altri tre mesi 1.625 pieni. Vale identico se il subappalto è una tantum o
rateizzato (conta l'occorrenza del mese), se il cliente paga a corpo o a rate, e
se più rate dello stesso progetto cadono insieme (il costo si spartisce fra loro
in proporzione). Finché l'effettivo non è scritto vale il preventivato, altrimenti
si distribuirebbe un margine che il fornitore si porta via il mese dopo.

**Il tetto a zero non è un silenzio**: se il subappalto supera la rata, il margine
si ferma a zero — una quota negativa non si eroga — ma la differenza è uscita di
cassa che **non ha ridotto nessuna quota**. Ogni mese torna lo stesso, e sulla
vita del progetto commerciale e soci hanno preso su una base più alta del margine
vero: per questo `plan.digitalExcess` la conta, la riga scrive «+X oltre la rata»
e la diagnosi la segnala. Il caso gemello — costo in un mese dove quel progetto
non ha rata — lo dice `subcontractFindings` con «nessun ricavo nel mese».

- **Subappalti** (§173): una voce di piano con `project_id` è una lavorazione
  affidata fuori. Si crea dalla scheda Economics del progetto, finisce da sé
  nell'area «Delivery & Fornitori» e dà il **margine del progetto** (ricavo del
  mese − costi esterni). Il tempo del team interno NON va lì: sta nel costo del
  lavoro aziendale, e mescolarli darebbe un margine che nessuno può calcolare.
- **Conto economico** (`/economics`): `generateRevenueFromClients` copia i
  contratti attivi nel mese (`origin='contratto'`); i clienti **senza nemmeno un
  contratto** entrano con l'MRR d'anagrafica (`origin='anagrafica'`, segnalati
  come «senza contratto»). Il ripiego è per cliente, mai globale.

**Piano compensi** (`lib/pl.ts`, §185). Due formule perché sono due lavori
diversi, non per incoerenza:

- **Growth**: 15% commerciale · 30% **erogato** ai soci in parti uguali · 35%
  target costi · 10% fondo rischio · 10% residuo in cassa. Lì il lavoro lo fanno
  i soci, quindi la loro quota è erogato.
- **Digital** (§186): la base è il **margine** — ricavo del mese meno i
  subappalti di quel progetto (`pl_cost_lines.project_id`, allocati pro-quota se
  un progetto ha più righe nel mese). Sul margine: 6% commerciale · **28% a
  ciascun socio** · 10% casse TwoBee = **100%**, distribuito per intero.
  `digital_cost_target_pct` esiste e **vale zero** (§206): far contribuire il
  digital alla struttura è una leva disponibile, ma la quota dei soci non è la
  variabile da cui prendere — la struttura la copre il growth, e la cassa negativa
  in un mese a prevalenza digital è la conseguenza aritmetica, non un errore. Il
  ricavo lordo non è distribuibile perché su un lavoro affidato fuori metà è già
  di qualcun altro; sul growth invece il costo di delivery è il tempo dei soci,
  ed è già la loro quota.
- **Fondo rischio digital: opzionale, e la sceglie l'admin.** Solo sopra
  `digital_risk_threshold` (20.000 € di **valore venduto del progetto**, non
  della rata): il 9% del margine va al fondo e ciascun socio scende dal 28% al
  25%. La scelta sta su `pl_revenue_lines.risk_fund`, riga per riga — due lavori
  da 30.000 nello stesso mese possono meritare risposte diverse.
- **Conseguenza da tenere presente**: il margine digital è distribuito per
  intero, quindi il digital **non alimenta** il 35% di target costi né il fondo
  rischio ordinario del 10%. Struttura e personale li copre il growth, e in un
  mese a prevalenza digital la cassa TwoBee risulta **negativa**: il tool la
  mostra negativa perché è la verità del piano, non un errore di calcolo.
- **L'erogato ha due forme** (§191): quello in denaro e quello già uscito come
  spesa dal sottoconto del socio. `perPartner` dà `total` (quanto gli spetta),
  `spent` (già uscito) e `cash` (da versare) — e `overspent` quando ha speso più
  del dovuto, che è un anticipo sul mese dopo, non un errore.
- Con un numero di soci diverso da tre le quote non fanno 100%: `retained` lo
  dice invece di riscalarle di nascosto (due soci → 28% non assegnato, quattro →
  −28% di sforo).
- **Il commerciale è quello dell'anagrafica del cliente** (`ownerOf` in
  `lib/pl.ts`): la riga del mese vince se ne porta uno — è una fotografia, e un
  mese chiuso non si riscrive perché l'anagrafica è cambiata dopo — altrimenti si
  legge `clients.sales_owner_name`, che spesso è un segnalatore senza account nel
  tool. **Se non c'è da nessuna parte, la provvigione non resta in cassa: si
  divide fra i soci in parti uguali** (5% a testa sul growth, 2% sul digital).
- `rowToPlConfig` è l'unico mapper da `pl_config`: era scritto due volte
  (economics e scheda cliente) e la seconda copia si dimenticava ogni colonna
  nuova.

**Due letture della ripartizione** (§204): la seconda lettura chiama lo stesso
`computeMonth` sulle **sole righe con la spunta** — entrate incassate e costi
pagati — quindi «Cassa TwoBee» si muove quando spunti «pagato», che è la domanda
che quel nome fa venire in mente. Il motore è puro, quindi non c'è una seconda
formula da tenere allineata. I **compensi** restano quelli del maturato: chi ha
lavorato ha lavorato, e un cliente lento non azzera il compenso di chi ha già
consegnato.

**La lettura è della pagina, non di un riquadro** (§210, `BasisSwitch` in
`PlClient`). Il selettore della §204 stava dentro «Ripartizione»: cambiava sette
numeri su quaranta, e i **quattro in cima** — quelli che si guardano per primi —
restavano sul maturato. Due letture della stessa sezione che non concordano sono
peggio di una sola, perché chi legge non sa quale delle due sta guardando. Adesso
i due tasti macro stanno **sopra le scorecard** e `basis` governa ogni totale:
entrate, costi, margine, incidenza e ripartizione. Tre regole:

- **Il selettore dichiara cosa esclude**, prima che uno prema: quante righe sono
  spuntate su quante, e quanti euro restano fuori. Un selettore che non lo dice
  fa credere che il numero più basso sia il numero vero.
- **Zero spuntate non è zero euro**: se nessuno ha ancora messo una spunta,
  l'incassato vale zero e la pagina lo scrive invece di mostrare un mese vuoto.
- **I compensi non seguono la lettura** (§204 resta), ma diventano dinamici lo
  stesso: sotto ogni socio e ogni commerciale compare **quanto ne copre
  l'incassato** di quel mese. La quota non cala perché un cliente è in ritardo;
  quello che cambia è quanta ne è già in cassa.

Le righe di entrata e uscita non si filtrano mai: sono i fatti, e sono anche il
posto dove si spunta. La leva e il risultato devono stare nella stessa schermata.

**Struttura e subappalti non si sommano** (§188): `costs.structural` sono i costi
interni, `costs.external` i subappalti. Il **target del 35% riguarda solo la
struttura** — un subappalto è già stato tolto dal margine del suo progetto, e
contarlo anche nello scostamento lo farebbe pagare due volte alla cassa.
`costs.actual` resta il totale uscito, che è un'altra domanda.

**Partite di giro** (§188): un anticipo che torna al cliente — il budget
pubblicitario che Two Bee spende per lui — si marca `pass_through`. Entra nel
fatturato e nell'IVA (è fatturato) e in nient'altro: provvigione ed erogato su
un anticipo si prenderebbero da una tasca che non esiste.

**Un accordo, N progetti** (§188): `revenue_stream_projects` dice quali progetti
copre un contratto. Con un solo progetto vale `revenue_streams.project_id`, come
prima. Le righe di un contratto multi-progetto **non** portano un progetto: dei
3.600 di iCura non si sa quanto sia lead generation e quanto sito web, e
attribuirlo a uno dei tre falserebbe i margini.

**Piani di pagamento** (`buildSchedule` in `lib/revenue.ts`, UI in
`components/economics/CustomPlan.tsx`): acconto % + N rate, rate uguali, o
tranche a percentuali libere, con cadenza in mesi. Un solo posto che fa i conti,
usato sia sul contratto col cliente sia sul subappalto — l'ultima rata assorbe
sempre l'arrotondamento. I preset sono suggerimenti, non vincoli: dopo la
generazione ogni rata resta spostabile e se ne aggiungono a mano.

**Fiscale** (`/economics/fiscale`, `lib/tax.ts`): scadenzario SRL con anno
solare (liquidazioni IVA, LIPE, acconto IVA 27/12, saldo+1º acconto 30/06, 2º
acconto 30/11, dichiarazioni), stima IRES/IRAP proiettata sui mesi registrati,
accantonamenti effettivi contro quelli necessari, il pannello **Agevolazioni e
regimi** (§184: cosa è in vigore, cosa è scaduto, quanto vale con i numeri che il
tool ha già), e `taxInsights` — regole, non consigli fiscali. **Ogni stima dichiara la sua assunzione**: se i costi
effettivi non sono registrati la previsione è gonfiata e va detto prima del
numero, non in nota.

**IVA** (`lib/vat.ts`): l'IVA incassata non è cassa disponibile. Liquidazione
trimestrale, scadenze ordinarie 16/05 · **20/08** · 16/11 · 16/03 (il quarto con
la dichiarazione annuale), 1% di interessi sui primi tre. Il credito di un
trimestre si riporta sul successivo — per questo il conto economico carica
**tutto l'anno** e non solo il trimestre.

**Durata del rapporto e rinnovo** (§179, `relationship()` in
`lib/client-economics.ts`): dal **primo contratto venduto**, non da
`clients.contract_start`. Il rinnovo è l'ultimo contratto a scadere, e se un
canone è a tempo indeterminato non c'è nessun rinnovo da aspettare. Senza
contratti l'indicatore dice perché, invece di mostrare mesi inventati.

**Provenienza obbligatoria**: ogni punto del tool che mostra un valore
economico passa da `lib/economics-source.ts` (`mrrOrigin`, `CONTRACT_PERIOD_HINT`,
`PAYMENT_STATUS_HINT`, `economicsHref`). Un numero senza «da N contratti» / «da
anagrafica» accanto è un numero di cui nessuno si fida: non aggiungerne.
Nessun campo economico è editabile fuori da Economics — niente inline edit
dell'MRR in intestazione o in lista.

Le server action in `app/actions/revenue.ts` prendono un `RevCtx`
(`{ projectId, clientId }`): serve a revalidare tutte le viste che mostrano lo
stesso contratto. Passalo sempre completo.

## Stati del cliente (`client_label`)
`stabile` · `in_bilico` · **`pending`** · `perso` · `partner`.

`pending` (§176) = lavorazioni sospese temporaneamente. **Non è un perso**: non
fattura — quindi fuori da MRR attivo, generazione del conto economico, alert e
insight — ma il rapporto è vivo e **non conta come churn**. `paused_at` tiene
l'ultima sospensione, così si sa da quanto è fermo: oltre i 60 giorni scatta
l'alert in dashboard, perché un rapporto sospeso che nessuno richiama diventa un
rapporto perso.

`lib/clients.ts` è l'unica fonte: `isLost`, `isPaused`, `countsInStats`
(esclude interni + persi + fermi), `pausedDays`. Non riscrivere il filtro
inline: ogni `client_label !== 'perso'` sparso è un posto che dimenticherà il
prossimo stato.

## Rischio cliente (§197, `lib/risk.ts`)
`compute_client_risk` (migration 014) leggeva fatture, KPI e ticket. La **146**
l'ha droppata nel reset insieme alla tabella `invoices`, e `client_kpis`/`tickets`
sono rimaste vuote: da allora nessuno scriveva più `clients.risk_score`, e tutti
gli undici clienti erano fermi a **0** — compresi i quattro `scaduto`. Il badge
diceva «Basso rischio» a chi non pagava da mesi. **Uno zero che nessuno aggiorna
è peggio di un campo vuoto: il vuoto lo si nota, lo zero lo si crede.**

Il motore nuovo è puro e **non scrive in tabella**: le pagine che mostrano il
rischio caricano già le sue sorgenti, un punteggio in colonna invecchia fra due
ricalcoli, e un ricalcolo notturno riempirebbe `activity_log` (§179) di modifiche
che nessuna persona ha fatto. `risksFor(rows)` è l'unico mappatore dalle righe
del database ai punteggi — lista clienti, scheda e dashboard passano da lì, o
sarebbero tre posti dove dimenticare una colonna.

Cinque segnali, tutti su sorgenti vive: **insoluto** (0–35, pesa *da quanto* il
più vecchio scoperto è lì — e §177 esclude il mese in corso, che vale fino al 15)
· **fatturato** (0–25, tre mesi contro tre) · **copertura contrattuale** (0–20;
un canone a tempo indeterminato è la copertura migliore, non un dato mancante)
· **sospensione** (0–20, §176) · **etichetta** (10 se `in_bilico`). Bande: <35
basso, <60 medio, oltre alto.

Tre regole non negoziabili, ognuna nata da un numero sbagliato visto sul database
vero:

- **Un segnale che non si può calcolare non vale zero.** Finisce in `unknown` con
  scritto perché, e sotto **due** segnali leggibili non esce nessun numero
  (`ready: false`, il badge dice «n/d»). Un punteggio costruito su un indizio ha
  la stessa faccia di uno costruito su cinque.
- **La crescita non compensa un insoluto.** Il bonus del fatturato in crescita
  (−5) vale solo se non c'è nient'altro che non va: su Industrial Service portava
  35 («medio») a 30 («basso») con 3.500 € scoperti e i contratti in scadenza fra
  26 giorni. Quando non si applica, la riga resta e dice «non compensa il resto».
- **Il confronto a tre mesi vuole due mesi pieni su tre.** Con uno solo misura
  l'inizio dello storico, non l'andamento: un cliente registrato da aprile
  leggeva «+461%», e quel bonus abbassava il rischio di chi non paga.
- **Le rate contano quanto le righe** (§177) ma non si sommano alle righe dello
  stesso mese (§193): si guardano le rate scadute dei mesi **mai aperti**, dove
  la riga non esiste. Senza, chi non paga da marzo risulta in regola perché
  marzo non è mai stato preparato.

Il tempo è un parametro, e da lì viene il trend: `withTrend` riesegue lo stesso
calcolo **trenta giorni indietro** sugli stessi dati. «Sta peggiorando?» si
risponde con due letture della stessa realtà, non confrontando oggi con un numero
rimasto in colonna. Banda morta di 5 punti, perché un'icona che oscilla non si
guarda più. Perso, partner e interno non hanno un punteggio: il perso è già
andato, e un badge lì copre i clienti veri.

`npx tsx scripts/verify-risk.ts [data]` legge gli undici clienti dal database e
li passa a `risksFor`: è il controllo della catena col codice che gira in pagina.
Il gate è `lib/risk.check.ts` (72 controlli).

## Tipo cliente (§178)
`client_type` non si sceglie: lo dicono i progetti. Solo digital → `digital`,
solo growth o marketing → `growth`, misti → `growth_digital`. Il trigger su
`projects` lo riallinea a ogni creazione, spostamento o eliminazione; senza
progetti resta quello scelto alla creazione del cliente (unico momento in cui
la scelta a mano ha senso). In UI è un badge in sola lettura, mai una select.

## Stato pagamenti (§177)
La fattura esce il **1° giorno utile del mese** e vale **15 giorni**. Da lì:
`pagato` (tutto incassato) · `in_attesa` = **da pagare** (scoperto entro il 15,
è la normalità, non accende niente) · `scaduto` = **non pagato** (dal 16, o un
mese passato ancora scoperto). Su più progetti vale la riga più indietro; il
dettaglio di *quale* progetto manca si legge nella lista clienti.

Lo scrive `sync_client_payment_status` leggendo le checkbox `paid` delle righe
di conto economico e delle rate. Il passaggio dal 15 al 16 lo fa il cron
notturno: nessuno deve toccare niente perché un credito diventi scaduto.
Etichette da `paymentLabel()` in `lib/clients.ts`, mai inline.

## Cronologia e versioni (§179)
`/impostazioni/cronologia` ha due tab.

**Attività** — `activity_log`, scritta dal trigger `log_activity()` su clients,
projects, tasks, deals, invoices, tickets, objectives, key_results. Filtri
(persona, tipo, azione, periodo, testo) applicati **sul database**, non sulla
pagina caricata: filtrare le ultime 200 righe su settemila è un filtro che
mente. Il ripristino di un `update` riscrive i **valori vecchi presi dal diff**,
non lo snapshot — lo snapshot è lo stato *dopo*, riapplicarlo non fa niente — e
tocca solo i campi di quella modifica, per non annullare il lavoro fatto dopo da
qualcun altro. `previewRestore` mostra prima cosa torna indietro.

**Attribuzione**: il service role non ha `auth.uid()`, quindi ogni scrittura da
server action risultava «Sistema». Le server action che toccano tabelle con
cronologia usano `createActorClient(userId)` (`lib/supabase/admin.ts`), che
manda l'id in `x-actor-id`; il trigger lo legge da `request.headers`. **Se
aggiungi una scrittura su una tabella loggata, usa quello, non
`createAdminClient()`** — altrimenti la modifica non ha un nome sopra.

**Versioni** — `os_versions` + `os_version_changes`, changelog di prodotto
scritto a mano: un changelog generato dai commit racconta i commit, non il
prodotto. Un ciclo ogni **15 giorni** dal 2026-08-01 (v1.0.0): chiudere un ciclo
alza la minore, una modifica sostanziale a metà ciclo alza la patch, la maggiore
la decide una persona. `lib/os-version.ts` = calendario e numeri (puri,
verificati da `os-version.check.ts`). Ogni voce ha tipo, area, impatto e le due
colonne **prima/adesso**: è quello che rende leggibile il confronto con la
versione precedente. Le bozze le vedono solo gli admin; il workspace mostra in
sola lettura l'ultima pubblicata.

## Personale (§181-182, `/economics/personale`)

**La regola che tiene in piedi tutto (§182): tre valori, mai sommati fra loro.**
- **Costo economico** — competenze + oneri datore + TFR maturato. Va nel P&L.
- **Uscita di cassa** — netto + F24 + fatture pagate. Il TFR **non** c'è: matura
  ora, esce alla fine del rapporto, e contarlo due volte è l'errore classico.
- **Netto percepito** — dal cedolino. Per una P.IVA è **null**: Two Bee conosce
  l'importo pagato, non le imposte personali di chi fattura. In UI si dice
  «importo pagato al collaboratore», mai «netto».

`monthLedger` calcola i due piani insieme e la loro differenza è per costruzione
il solo TFR — se fosse altro, qualcosa sarebbe contato due volte.

**Il documento batte la stima.** `payslipViews` legge il cedolino; `employer_contrib`
NULL significa «non ancora avuto dal consulente», e allora si stima **dichiarandolo**
(`estimated`). Zero e NULL sono cose diverse. `ledgerAlerts` controlla quadrature
(netto vs cedolino, IRPEF vs F24), TFR mancante o su chi non lo matura, scostamenti
dal netto concordato, fatture senza documento, IVA indetraibile a costo.

**Si scrive il mese, non la RAL** (§183). Nessuno pensa in retribuzione annua:
si pensa «a Michele do 1.500 al mese». Il campo dell'organico chiede il **netto
mensile** per i dipendenti e il **compenso** per chi fattura;
`grossFromMonthlyNet` risale alla RAL per bisezione — gli scaglioni IRPEF non si
invertono con una formula. Prima il campo chiedeva l'annuo e chi scriveva «1300»
pensando al mese si vedeva 108 €/mese.

**Età e famiglia contano nei conti** (§183): `birth_date` decide se
l'apprendistato è ancora possibile (fino ai 29 compiuti) e l'avviso diventa
urgente quando mancano meno di dodici mesi; `has_children` raddoppia la soglia
dei fringe benefit esenti, e il potenziale welfare somma le soglie vere invece
di moltiplicare per un tetto medio.

**Le agevolazioni si applicano, non si sperano** (§184, `lib/incentives.ts`).
Tre leve che agiscono su tre cose diverse e **non si sommano**:

- **Esoneri contributivi** → abbassano i contributi *datore*, mai l'INAIL.
  Catalogo in `hr_incentives` (percentuale, tetto mensile *e* annuo, durata,
  finestra delle assunzioni, requisiti): under 30 strutturale al 50% entro
  3.000 €/anno per 36 mesi, nuovo esonero 2026 al 100% entro 650 €/mese
  (800 in ZES) per 24 mesi, decreto Coesione a finestra chiusa, donne
  svantaggiate, over 50, decontribuzione Sud. Il catalogo viaggia dentro
  `PayrollParams.incentives`: si corregge un tetto in SQL, non in un deploy.
- **Rientro dei cervelli** → abbassa l'**IRPEF della persona** e non tocca il
  costo aziendale di un euro: 50% di reddito esente (60% con figlio minore)
  entro 600.000 €, cinque periodi d'imposta, obbligo di restare quattro anni.
  È la leva per rendere competitiva un'offerta a chi lavora all'estero.
- **Maxi-deduzione e iper-ammortamento** → abbassano l'**IRES** in
  dichiarazione (extracontabili, mai IRAP). La maxi-deduzione entra in
  `estimateTaxes` come deduzione solo-IRES; l'IRES premiale al 20% è **finita
  col 2025** e resta in catalogo marcata scaduta, per non rimetterla nel budget.

Due regole non negoziabili: **un requisito che il tool non può verificare non
lo dichiara vero** (l'età la sa; «disoccupato da 24 mesi», «incremento
occupazionale netto», «decreto attuativo pubblicato» no: restano condizioni
scritte), e **un esonero configurato senza requisiti non si applica** — il costo
resta pieno e la riga dice perché. Un'agevolazione presa male si restituisce con
le sanzioni: vale meno di quella non presa. Ogni esonero sa anche **quando
finisce**, perché il mese dopo il costo risale e va visto prima.

**L'F24 non si ripartisce.** `checkF24` dice se l'IRPEF dei cedolini combacia con
l'erario del modello e quanto dell'INPS resta a carico azienda — ma quel residuo è
aggregato: «Dato aziendale aggregato — ripartizione individuale non verificata»
finché non arriva il prospetto individuale del consulente.

Il costo vero di una persona: lordo + contributi + INAIL + TFR + ratei, che sulla
RAL fanno un +40/45%. `lib/payroll.ts` = motore puro (verificato da
`payroll.check.ts`, 124 controlli). Tre principi:

- **Nessuna aliquota nel codice.** Stanno in `hr_payroll_params`, per anno, con
  `verified_at`: finché è NULL la pagina dichiara che sta stimando e l'avviso
  resta. L'INPS azienda dipende dal CCNL (29-32% nel terziario) — va confermato
  dal consulente, non indovinato.
- **Competenza ≠ cassa.** Il TFR matura e non esce; la tredicesima matura in
  dodicesimi ed esce a dicembre. `personCost` dà `total` (conto economico) e
  `cash` (conto corrente) separati.
- **Il netto è una stima e lo dice.** Mancano familiari a carico, conguagli e le
  addizionali del comune preciso.

Otto tipologie contrattuali in `CONTRACTS` (struttura: matura TFR? quante
mensilità?), il confronto dipendente/P.IVA **a parità di netto per la persona**
— paragonare una RAL a una fattura è disonesto — e `payrollHints` per le leve
legali (welfare, buoni pasto, apprendistato, premi di risultato) con i loro
tetti e i loro rischi. «Porta nel conto economico» scrive una riga per persona
nella voce «Persone», sostituendo le precedenti invece di sommarle.

## Prepara il mese (conto economico)
Un mese nasce da **quattro sorgenti**, e `previewPrefill` le conta prima di
scrivere: entrate dai contratti dei progetti · costi di struttura dal piano ·
subappalti (col progetto attaccato) · personale dall'organico. Il pannello
`PrepareMonth` mostra quanto porterebbe ciascuna e il margine che ne uscirebbe,
poi si preme. Ogni sorgente sa non duplicarsi: rilanciare aggiunge il mancante.
Se una sorgente fallisce le altre proseguono e lo scarto finisce in `skipped` —
un mese preparato a metà è più utile di un errore.

## Dal conto economico al saldo (§199, `lib/cash-bridge.ts`)
Il conto economico dice **quando il lavoro è stato fatto**, la banca **quando i
soldi si sono mossi**: non possono coincidere, e chiederlo è chiedere la cosa
sbagliata. Quello che si può pretendere è che **ogni euro di differenza abbia un
nome**, e l'identità è esatta:

    saldo = cassa cumulata del piano + IVA incassata − IVA pagata − crediti
          + debiti + (compensi maturati − erogato pagato) + conferimenti
          − imposte − oneri + apertura

Si dimostra sostituendo `piano = maturato − distribuito − costi`. Perciò il
**residuo diverso da zero non è un arrotondamento**: è un movimento in banca che
nessuna riga giustifica, o una spunta «pagato» su qualcosa che non è uscito. Il
pannello sta in Banca — dove vive il saldo vero — e porta anche il **cumulato mese
per mese** delle due letture affiancate. I movimenti `derivato` non fanno cassa:
contarli farebbe quadrare il ponte grazie a quello che il ponte deve verificare.

## Banca (§189-190, `/economics/banca`)
Il conto corrente e il conto economico sono la stessa cosa vista due volte: uno
dice quando, l'altro dice di chi. La sezione li tiene agganciati.

- **Tre sorgenti per un movimento**: `banca` è la verità (viene dall'estratto
  conto e **non si cancella**: se è sbagliato si corregge la categoria o si
  rifà l'import), `derivato` nasce da una spunta «incassato/pagato» ed è una
  dichiarazione, `manuale` è contante o carta di un socio. Perciò il saldo si
  legge due volte: **reale** (solo `banca`) e **dichiarato** (tutto). La loro
  differenza è quanto il tool crede senza avere una prova.
- **Riconciliare non è automatico** (`matchCandidates`): il punteggio somma
  numero documento, importo lordo esatto, nome cliente e controparte, ma
  l'aggancio lo conferma una persona. Un abbinamento sbagliato dichiara incassata
  una fattura che nessuno ha pagato, ed è un errore che poi nessuno cerca.
- **Import** (`lib/bank-import.ts`): il **dialetto si riconosce
  dall'intestazione** (home banking italiano con la virgola decimale · Vivid col
  punto e la controparte in chiaro), non dal nome del file, e le righe illeggibili
  finiscono in `skipped` con la ragione. `merchant()` riconduce le descrizioni
  delle carte al fornitore vero — ventisei codici `FACEBK *…` sono «Meta Ads» — ed
  è **idempotente**, perché si applica all'import e poi rileggendo dal database.
- **Giroconti fra conti propri**: `pairTransfers` appaia i due lati per importo
  opposto e data vicina. Senza, la liquidità totale sembra scendere e la lista da
  riconciliare chiede due volte lo stesso fatto.
- **Provvista** (`fundingNeed`): il fabbisogno di un conto spese non è una stima,
  è la somma delle voci di piano delle aree che quel conto paga
  (`bank_account_centers`). Se il bonifico ricorrente è più basso, si può dire
  adesso quanti mesi regge invece di scoprirlo da una carta rifiutata.
- **Cosa è passato davvero** (`spendSplit`): le uscite divise fra operativo e
  `CHECK_FAMILIES` (ristoranti, spesa, carburante, elettronica). Non sono spese
  vietate: hanno deducibilità limitata e vanno attaccate a una ragione. Il conto
  dice quanto pesano, non se erano inerenti — e senza la famiglia non si vede,
  perché ogni singola spesa sembra piccola.
- **Spesa aziendale ≠ erogato, e li distingue il conto** (§191): una cena con un
  cliente, la trasferta per andarci, il materiale d'ufficio sono costi della
  **società** — attribuirli a un socio gli abbasserebbe il compenso per un lavoro
  fatto per l'azienda. `pushAccountSpend` li porta nel mese come «Spese fuori
  piano» **senza** `partner_id`, e solo per le famiglie che il piano non prevede:
  ads, software e hosting hanno già la loro riga a piano e si riconciliano, non si
  duplicano. L'erogato è quello che esce dai **sottoconti dei soci**
  (`pushPartnerSpend`): la regola è il conto da cui il denaro esce, non il tipo di
  spesa.
- **Due strade per l'erogato, da decidere ogni mese** (§191): la **spesa dal
  sottoconto** porta a costo quello che si sarebbe speso comunque, ma con la
  deducibilità della sua famiglia (un pranzo vale il 75% e non recupera IVA); la
  **fattura del socio** (`category='Compenso soci'`) è deducibile per intero con
  IVA tutta detraibile, ma sposta l'imposta sulla persona. Il pannello in
  `PlClient` mostra i due numeri e registra la scelta; l'unica cosa che impedisce
  è farlo uscire due volte — `registerPartnerInvoice` non supera il residuo.
- **Il tetto della rappresentanza** (`entertainmentCap` in `lib/tax.ts`): 1,5% dei
  ricavi fino a 10 milioni. È il vincolo che decide il mix: su 150.000 € di
  ricavi sono 2.250 €/anno, quindi 1.500 €/mese di quote soci non possono andare
  in cene. Oltre il tetto la spesa è uscita di cassa e non abbassa l'imponibile.
  `taxInsights` proietta entrambi sui mesi registrati e avvisa al 70%.
- **Le tasche dei soci** (§191): un sottoconto per socio con una quota mensile.
  Quei soldi **sono erogato**, non un costo in più: il socio invece di prenderli
  in denaro li spende in nome della società, che porta la spesa a costo e ne
  recupera l'IVA dove spetta. Da qui due regole che il codice rispetta o il conto
  si sballa — le righe con `partner_id` **restano fuori dal target del 35%**
  (erano già nel 30% di erogato, come i subappalti della §188), e **l'erogato in
  denaro è netto di quanto il socio ha già speso**, altrimenti la società paga
  due volte lo stesso compenso. Speso oltre la quota = anticipo da recuperare,
  non buco. `allowanceView` dà quota, speso e residuo del mese.
- **Deducibilità dichiarata** (`DEDUCTIBILITY` in `lib/bank-import.ts`): pasti al
  75% con IVA indetraibile senza fattura intestata, carburante a uso promiscuo al
  20% con IVA al 40%, alimentari a zero finché nessuno ne scrive la ragione.
  Sono **valori di partenza per famiglia**, correggibili riga per riga: il tool sa
  che tipo di spesa è, non se era inerente — ed è l'inerenza a decidere. La parte
  non deducibile torna nella base IRES (`estimateTaxes`, ultimo parametro):
  senza, la stima promette un'imposta più bassa di quella che arriva.
- **Quanto bonificare** (`suggestFunding`): vince il più alto fra il piano — che
  è ottimista, elenca i canoni e non gli imprevisti — e la media delle uscite dei
  mesi **completi**; da lì si toglie il saldo, perché quello che c'è già non si
  bonifica due volte, e si arrotonda ai 50 €. Il mese in corso non fa media: a
  metà mese dimezzerebbe il fabbisogno proprio quando serve saperlo.
- **Il previsionale non si salva**: `forecast` lo ricalcola dalle scadenze aperte
  ogni volta. Un previsionale scritto in tabella è vecchio il giorno dopo.
- I grafici stanno in `components/charts/Charts.tsx` e valgono per tutto
  l'economics: la parte piena della barra dei ricavi è incassato, quella smorzata
  è credito. Zero è sempre visibile e il numero sta scritto accanto al pixel.

## Asana — sezione temporanea (§215)
`/asana`, voce «Migrazione» nella sidebar admin. Serve a portare dentro il lavoro
che vive ancora sul workspace `twobee.it`, e **va tolta quando il travaso è
finito** — pagina, `lib/asana.ts`, voce di menu. Una sezione temporanea che resta
diventa una cosa che nessuno sa più cosa fa.

**Non scrive niente**, né su Asana né sul database: legge, incrocia, e dice cosa
non torna. Il file CSV si scarica e si guarda prima di decidere.

**La gerarchia sta nei nomi delle board, non nell'API**: i portfolio del PAT sono
zero e Asana vieta di listare quelli altrui (403). Il trattino da solo non basta —
`"Josè Restaurant - Tenuta Villa Guerra"` è un cliente, `"Elettra -GOOGLE ADS"` è
un servizio — quindi decide il **vocabolario dei servizi** (`SERVICES`): se la
coda è un servizio noto è una checklist, altrimenti il trattino fa parte del nome.
L'ordine dei controlli in `classify` è una regola, non uno stile: `Prospect - Sea
Power` va riconosciuto prima di `master`, perché Sea Power è anche cliente vero e
il suo lavoro commerciale finirebbe fra le consegne.

I refusi del workspace (`Sartoria Cpndotti`, `Propsect -`, `Plusvending`) si
mappano in `TYPOS`, non si correggono su Asana: là romperebbero i preferiti delle
persone. **Ogni riga che non passerebbe dice perché** invece di sparire — è la
lista da guardare per capire se manca un'anagrafica o è solo un nome scritto
male. Gate: `npx tsx lib/asana.check.ts` (45 controlli su nomi veri).

Rate limit: le board si leggono a gruppi di cinque e il 429 si rispetta
(`Retry-After`). Un travaso a cui mancano trenta board in silenzio è peggio di
un'attesa.

**Si parte dalle persone** (§216). «Cosa ha in mano Michele» è la domanda con cui
si decide cosa spostare, non «quali task esistono»: le sette risorse del workspace
arrivano dall'API — non dedotte dalle task, così chi ne ha zero compare lo stesso
invece di sembrare non letto — con quante ne ha e quante sono pronte, e il filtro
confronta l'**email**, perché lo stesso nome su Asana si scrive in tre modi.
Le task senza assegnatario hanno una riga loro: la somma delle risorse fa il
totale, o qualcosa è sparito per strada. Una risorsa Asana **senza email** non
eredita le orfane — sono due vuoti diversi, e confonderli le contava due volte
(bug trovato dal gate, non in pagina).

**Il travaso** (`importAsanaTasks`) aggancia le task selezionate a un progetto e
a un workstream **che esistono già**. Tre regole:

- **La milestone è obbligatoria**: senza `milestone_id` la task non compare nel
  board del progetto — importata e invisibile è peggio di non importata.
- **Si può rilanciare**: `tasks.asana_gid` è unico (003), le già presenti si
  saltano contandole invece di far fallire il lotto sulla prima. Chi è già
  dentro lo dice anche in elenco, prima di premere.
- **Il bersaglio si rilegge dal database**, non si crede al client: progetto,
  workstream e milestone devono esistere e appartenersi, o la task finisce in un
  board dove nessuno la cerca.

Gli assegnatari passano da `task_assignees` (sorgente canonica, il trigger
allinea `tasks.assignee_id`), e «seleziona tutto» significa **tutto quello che è
filtrato**, mai le righe nascoste da un filtro dimenticato.

**Chiudere Asana è un lavoro a strappi** (§217, migration 201). Passare in
rassegna 146 board e qualche centinaio di task non è un pomeriggio: si fa fra una
cosa e l'altra, e ogni volta serve sapere dove si era arrivati.

- **Due modalità.** `attive` = il lavoro non chiuso sulle board di consegna, la
  vista per migrare. `tutto` = ogni board (commerciali e interne comprese) e ogni
  task, **anche completata** — la vista per chiudere: quello che non si guarda
  resta lì dentro quando si spegne la luce.
- **`asana_triage`** tiene la decisione presa su ogni `gid`: `tieni`, `elimina`,
  `migrata`. Chiave = gid di Asana, **nessuna FK verso `tasks`** perché quasi
  nessuna di queste entrerà in TwoBee. Nel browser sarebbe costato zero ed era il
  posto sbagliato: una cache svuotata e tre giorni di decisioni spariscono senza
  che nessuno se ne accorga. Non c'è uno stato «forse» — chi resta senza riga è
  ancora da decidere, e un quarto stato avrebbe fatto sembrare deciso quello che
  non lo è. Le già importate contano come decise: su una task che è dentro non
  c'è più niente da scegliere.
- **Si decide per blocco**, non riga per riga: si filtra per cliente o per
  persona e si segna tutta la selezione. Annullare costa quanto scegliere, o si
  smette di decidere per paura di sbagliare. Le decise spariscono dalla lista di
  default — il senso è che si accorci mentre ci lavori — e una barra dice quanto
  manca, che è la sola cosa che rende finito un lavoro che sembra infinito.
- **Ad hoc è la destinazione giusta** (§220). Le 106 task con un proprietario
  stanno su ventisei board diverse — «Contratto Icura e acconto», «Aggiornare
  Centro Contatti Meta», «Organizzare strategia commerciale per neve»: non sono
  passi di una consegna, sono cose da fare per un cliente, che è la definizione
  di ad hoc. `importAsanaAdHoc` chiede **solo** il cliente (dal nome della board)
  e la risorsa (dall'email): niente milestone da scegliere, quindi niente da
  sbagliare. Costringerle in un workstream avrebbe voluto dire inventare
  centoquattro volte una struttura che su Asana non c'era. Una task **senza
  cliente si crea lo stesso** (§221) e lo dice: rifiutarla sembrava prudente e
  non lo era — costringeva a inventare un'anagrafica prima di sapere se serve.
  Nasce con `client_id` nullo e **l'avviso in cima alla descrizione**, dove lo
  legge chi apre la task fra due settimane, non in un messaggio che sparisce dopo
  tre secondi. Non toglie visibilità a nessuno: una ad hoc senza progetto la
  vedono già solo admin e assegnatario (RLS della 094).
- **Il cliente si cerca in due passaggi** (§221, `matchClient`): nome esatto, poi
  **prefisso** — la board «Industrial Service and Facility» è il cliente
  «Industrial Service» scritto per esteso, e senza questo finiva orfana con
  l'unica alternativa di creare un doppione. Il prefisso vale **solo se il
  candidato è uno**: «Fatima Leo» e «Fatima Leo Academy» non si scelgono da sole,
  perché indovinare male attacca il lavoro al cliente sbagliato, che è peggio di
  lasciarlo orfano. L'esito viaggia con la riga (`esatto`/`prefisso`) e in tabella
  un abbinamento dedotto lo dichiara.
- **Cancellare su Asana è un secondo gesto** (§219, `deleteOnAsana`). Segnare
  «da eliminare» non cancella niente: è una decisione, e un pulsante che marca e
  cancella insieme trasforma un ripensamento in un danno — con mille righe già
  marcate, il danno è mille. La conferma è a due passi e il secondo ripete
  **quante** e **dove finiscono**. Va a lotti di `ASANA_DELETE_BATCH` (40) perché
  mille richieste in una server action sola andrebbero in timeout a metà,
  lasciando cancellato un pezzo e nessuno che sa quale: il contatore avanza lotto
  per lotto, e se si rompe si sa quanto è passato. Un **404 non è un errore** —
  la task già sparita è il risultato voluto, si conta a parte. `DELETE` su Asana
  **sposta nel cestino**: 30 giorni per ripristinare, il che rende l'operazione
  accettabile senza backup — ma 30 giorni è un limite vero, non «per sempre».
  Il registro si aggiorna **solo per quelle andate**: una che non è passata deve
  restare in lista, o la si perde di vista.
- **La struttura si guarda per cliente**, non in ordine alfabetico: «Icura - META
  ADS» e «Ad Hoc - Icura» sono lo stesso cliente e si decidono insieme. Le board
  senza cliente stanno in fondo ma **ci sono**: sono quelle che di solito si
  buttano, e nasconderle fa chiudere Asana con dentro roba mai guardata.

## Ferie e assenze (§223, `lib/leave-calendar.ts`)
Le assenze vivono in **due tabelle che non si parlano**: `hr_requests` è quello
che la persona chiede dal Workspace (stati in inglese, e comprende tipi che
assenze non sono — una nota spesa, un documento), `team_leaves` è il registro che
l'admin tiene a mano (stati in italiano). Approvare una richiesta scrive in
`calendar_events`, **non** in `team_leaves`: sono indipendenti. `normalize()` le
fa diventare una lista sola, perché «chi manca il 12 agosto?» non può avere due
risposte a seconda di quale tabella si guarda.

Cosa resta fuori **si dichiara**, non si filtra in silenzio: `spesa` e
`documento_hr` (hanno una data, ma nessuno manca dall'ufficio), le righe senza
date, e gli **intervalli rovesciati** — sul database ce n'è uno vero, dal 24
agosto al 31 luglio. Non si aggiusta scambiando le date: non si sa quale delle
due sia giusta, quindi si scarta e si conta, e la pagina lo scrive.

- **L'avviso a dieci giorni** (`upcoming`) è la finestra in cui una consegna si
  può ancora spostare. Include **chi è già via**, con i giorni negativi: la
  domanda vera non è «chi parte» ma «su chi non posso contare», e una persona
  partita ieri non c'è esattamente come una che parte domani.
- **Nel calendario il colore dice il tipo e il tratteggio dice lo stato**: due
  informazioni su due canali, così una ferie da approvare non si confonde con un
  permesso approvato. I giorni degli altri mesi ci sono: un'assenza che comincia
  il 31 e finisce il 3 si legge solo se si vedono le due estremità.
- **Il countdown del workspace** (`countdown`) guarda **solo le ferie
  approvate**: metterlo su una richiesta che può essere rifiutata è il modo più
  veloce di far arrabbiare qualcuno. Sparisce quando non c'è niente da contare —
  un riquadro che dice «nessuna ferie» è una presa in giro — e il conteggio si fa
  **sul server**, perché nel browser darebbe giorni diversi a seconda del fuso.

Gate: `npx tsx lib/leave-calendar.check.ts` (42 controlli sulle righe vere).

## Architettura portali
- **Admin** (`/dashboard`, tutto): `super_admin`, `founder`, `admin`.
- **Workspace** (`/workspace/**` e nient'altro): `manager`, `senior`, `junior`, `stage`, `freelance`, `partner`.
- **Cliente** (`/portale/**`): `client`, `guest` non-risorsa.
- **Risorsa esterna** (`/risorsa/**`): `guest` con `resource_profiles.can_access_resource_portal`.

Il gate è in `middleware.ts` **e** nei layout: nascondere una voce di menu non è
una barriera. I gruppi di ruolo stanno in `lib/permissions.ts`
(`ADMIN_ROLES` / `WORKSPACE_ROLES`), unica fonte di verità: non riscriverli inline.

Solo il super admin vede `PortalSwitcher` e può entrare in `/portale` (in anteprima,
scegliendo il cliente da `?client=<id>`).

Il gate del gruppo `(dashboard)` non era un gate: il layout leggeva il profilo e
non guardava il ruolo, quindi l'unica barriera era il middleware. Ora rilegge il
ruolo dal database a ogni caricamento e rimanda a `/workspace` chi è workspace —
il percorso gli arriva in `x-pathname`, scritto dal middleware, perché
`/impostazioni/profilo` deve restare aperta: è l'unica pagina di quel gruppo che
la sidebar del workspace linka.

**Nascondere un cliente al workspace** (§213, `clients.workspace_hidden`).
GAV Sistemi non è un cliente: è un giro di fatture fra società collegate, e nel
portale operativo compariva in elenco, nella ricerca, nel selettore delle task ad
hoc e nel customer care. Il flag è **separato da `is_internal`** perché sono due
domande diverse: `is_internal` dice «non conta nelle statistiche» e riguarda i
**numeri**, `workspace_hidden` dice «il team non lo vede» e riguarda le
**persone** — un cliente interno può avere lavorazioni vere, e un cliente vero
può essere riservato senza uscire dai conti. Il filtro sta **nella VIEW**, non
nelle pagine: `clients_workspace` è già l'unica porta (§211), quindi vale per
tutte insieme e non si può dimenticare in una pagina nuova. Non nasconde il
**lavoro**: progetti e task assegnate restano visibili a chi le ha in carico, e
la UI lo dichiara — far sparire un'attività dalla lista di qualcuno senza dirglielo
è il modo peggiore di far perdere una consegna. Si tocca dall'anagrafica (admin),
e in lista un badge dice chi è fuori.

### Il workspace è usabile o non è (§211)
Tre difetti che rendevano il portale un vicolo cieco, e le regole che li chiudono:

- **Le sezioni personali non passano dai permessi.** La 079 ha seminato
  `workspace_section_permissions` per manager, senior, junior, stage e freelance:
  `partner` è arrivato dopo, `viewer` non c'è mai stato, e chi non era in quella
  lista entrava e trovava **una voce sola**. Dashboard, attività, profilo,
  richieste HR, calendario, buste paga, documenti personali, cronologia e
  feedback ora sono universali: mostrano **solo i dati di chi guarda**, e a
  garantirlo è la RLS — owner-only in tabella — non il menu. Nascondere la voce
  non proteggeva niente, rendeva solo il portale inutilizzabile. Restano ai
  permessi le sezioni che parlano di **altri**: clienti, progetti, customer care,
  ticket, documenti condivisi, task ad hoc.
- **Un link che rimbalza è peggio di un link assente.** Dal workspace ogni rotta
  admin la respinge il middleware: le rotte si costruiscono da una `base` sola
  (`ClientiList`, `ClientPageClient.portalBase`, `basePath`/`clientBase`), mai
  scritte a mano riga per riga. Le due sezioni in fondo alla lista clienti —
  sospesi e persi — se l'erano dimenticata, e un cliente sospeso che non si apre
  è esattamente la voce che serve di più a chi deve richiamarlo.
- **Niente economics, e non per convenzione.** Tre strati indipendenti:
  `clients_workspace` azzera canone e dati fiscali **in tabella** (100/197);
  `hideEconomics` spegne MRR, pagamenti, anagrafica fiscale, export ed elimina;
  la scheda Economics del progetto e del cliente **non viene montata**. In più
  quello che nessun riquadro mostra non parte nemmeno: stato pagamenti e date di
  contratto si azzerano prima di finire nel payload, perché una cosa nascosta
  nella UI si legge lo stesso dal pannello di rete. Le pagine del workspace
  leggono `clients_workspace`, **mai** `clients`, anche quando servono i soli
  nomi — è la sorgente che la RLS garantisce a tutto lo staff.

## Chat — quattro gruppi
`Team` (canali `type='team'`: `team-intern`, `angolo-informativo`, `best-ideas`) ·
`Progetti` (un solo canale interno per progetto) · `Messaggi diretti` (`type='dm'`,
partecipanti in `chat_dm_participants`, leggibili **solo** dai due, nemmeno dall'admin).

Il **Customer Care non sta più nella chat**: i canali `customer_care`/`cliente` esistono
ancora e li usa `/customer-care`. La chat li esclude a monte, non li cancella.
`#best-ideas` non è una chat: è un raccoglitore (`chat_best_ideas`).

## Calendario e Google
I token stanno in `google_credentials` (RLS deny-all, solo service role).
**Mai** in `user_metadata`: il client dell'utente lo legge e lo riscrive.
`/api/google/events?profileIds=a,b` legge le agende dei colleghi; degli eventi
altrui espone solo `"Occupato"` — niente titolo, descrizione o partecipanti.
Le task del calendario sono personali e nascoste di default.

## Stato attuale — widget dashboard
| Widget | Componente | Stato |
|---|---|---|
| Company Pulse | `CompanyPulse` + `KpiCards` + `RevenueChart` | ✅ attivo, ~50% doc |
| Client Health | `ClientsRiskPanel` | ✅ attivo, semplificato |
| Delivery Radar | `ProgettiWidget` + `TasksDue` | ✅ attivo, parziale |
| Team Capacity | `WorkloadPanel` | ✅ attivo, base |
| Risk/Alerts | `SmartInsights` + `AlertCenter` | ✅ attivo, rule-based |
| Founder Focus | `DailyFocus` | ✅ attivo |
| AI Chat | `AIDashboardChat` | ✅ attivo |
| Margin Radar | — | ❌ da costruire |
| Decision Center | — | ❌ da costruire |
| AI Executive Brief | `SmartInsights` (approssimazione) | ⚠️ parziale |
| Financial Control aggregato | — | ❌ solo in tab cliente |
| Growth Performance aggregato | — | ❌ solo in tab cliente |
| Sales Pipeline widget | Fetcha `deals` ma no widget | ⚠️ dati ci sono |
| Strategic Objectives widget | Fetcha `objectives` ma no widget | ⚠️ dati ci sono |
| AI & Automation Center | — | ❌ da costruire |

## Dove siamo — 2026-08-05

Ultimo commit: `f7a1782`. **`main` è 52 commit avanti a `origin/main`**, fermo a
`34c23f5`: il deploy Coolify builda da `origin/main`, quindi su os.twobee.it non
c'è niente di tutto quello che segue — banca, personale, agevolazioni,
ripartizione. Finché non si pusha, il tool in produzione e il tool in locale sono
due prodotti diversi. Gate del repo: `npx tsc --noEmit` (ESLint non è
configurato) più i **quattordici** `lib/*.check.ts`, che si lanciano con
`npx tsx lib/<nome>.check.ts` e devono dire «Tutti i controlli passano».
**Non lanciare `npm run build` mentre `npm run dev` gira**: condividono `.next`,
il dev server resta a servire chunk CSS sostituiti e la pagina si apre senza
stili. Se succede: ferma il dev, `rm -rf .next`, riavvia.

**Da eseguire: la `197_client_risk_rewrite.sql`** — cleanup, non prerequisito:
droppa le cinque colonne di rischio che nessuno legge più e ricrea
`clients_workspace` senza di loro. Finché non la esegui l'app funziona
identica, le colonne restano lì a zero e nessun codice le guarda.

Tutto il resto è già applicato. Verificato sul database il 2026-08-05,
colonna per colonna: 183→196 sono tutte applicate (`hr_people.birth_date` e
`hired_on`, `hr_incentives`, `pl_revenue_lines.risk_fund` e `pass_through`,
`revenue_stream_projects`, le tre tabelle di banca, `pl_cost_lines.partner_id`,
`clients.package` droppata). `pl_config` legge la 196: `digital_partner_pct`
**0,28** e `digital_cost_target_pct` **0**.

**Fatto finora**: il dominio economico completo (migration 168→178) — contratti
per progetto, piano dei costi con budget per area, subappalti con margine di
progetto, previsionale a sei mesi, IVA trimestrale e sezione Fiscale, stato
cliente `pending`, e la disciplina trasversale per cui **ogni valore economico è
derivato e dichiara la sua provenienza** (vedi le sezioni Economics, Tipo
cliente, Stato pagamenti).

**Committato in locale, mai arrivato in produzione** (i 52 commit di cui sopra):
- **Eliminazione clienti** singola e multipla (`deleteClients` /
  `previewClientDeletion`, caselle di selezione in `ClientiList`, conferma che
  dichiara cosa cade in cascata).
- **Cronologia rifatta** (§179): filtri sul database, statistiche esatte,
  attribuzione via `createActorClient`, ripristino che riporta indietro davvero,
  e il registro delle versioni con ciclo di 15 giorni. Migration già applicata.
- **Conservazione della cronologia** (§180): 20 giorni per riga, configurabile.
- **Budget dei costi derivato**: il tetto di un'area è la somma delle sue voci
  (non più `monthly_budget`), e il tetto del mese è il 35% del fatturato.
- **Sezione Personale** (§181): costo per risorsa, contratti italiani, TFR,
  13ª/14ª, ottimizzazioni fiscali, e la voce «Persone» del conto economico.
- **«Prepara il mese»**: una sola azione che compone contratti, piano dei costi,
  subappalti e organico, con anteprima di cosa entra prima di scrivere.
- **Agevolazioni** (§184, `lib/incentives.ts` + `lib/incentives.check.ts`):
  esoneri contributivi per persona con tetti e scadenze, rientro dei cervelli sul
  netto, maxi-deduzione e iper-ammortamento dentro la stima IRES, aliquote 2026
  aggiornate (IRPEF 33%, buono pasto 10 €, premi all'1%), tab «Agevolazioni» nel
  Personale e pannello «Agevolazioni e regimi» in Fiscale.
- **Area «Personale» in sola lettura** nel piano dei costi, con il doppio
  conteggio del costo del lavoro rimosso da «Porta nel mese» e dall'anteprima.
- **Subappalti e costi esterni** raccolti per subappaltatore (`bySupplier`),
  sezione richiudibile, fornitori aggiungibili e rinominabili in blocco.
- **Spartizione digital** (§186): sul margine dopo i subappalti, 28% a ciascun
  socio, 6% commerciale, 10% cassa, fondo rischio opzionale sopra 20.000 €, col
  commerciale letto dall'anagrafica del cliente.
- **Via i pacchetti** (187) e **un accordo, N progetti** (188): contratti
  multi-progetto con quota, e le partite di giro fuori dalle quote.
- **Banca** (189-191): due conti, import per dialetto, giroconti appaiati,
  provvista, `spendSplit`, sottoconti dei soci e le due strade per l'erogato.
- **Ponte conto economico → saldo** (§199, `lib/cash-bridge.ts`): l'identità è
  esatta, quindi un residuo diverso da zero è un movimento senza una riga che lo
  giustifichi, non un arrotondamento.
- **Un fatto, una riga** (193) e **un movimento a mano paga** (195).
- **Ripartizione maturato / incassato** (§204): stesso `computeMonth` sulle sole
  righe spuntate, così «Cassa TwoBee» si muove quando spunti «pagato».
- **Quota digital tornata al 28%** (196), che annulla la 194.
- **Rischio cliente riscritto** (§197, `lib/risk.ts` + `risk.check.ts`): motore
  puro sulle sorgenti vive, «n/d» invece di uno zero inventato, trend da due
  letture della stessa realtà, e le cinque colonne morte droppate.

**Com'è messo il database** (letto il 2026-08-05): **11 clienti** con P.IVA,
sede, SDI e commerciale · **21 progetti** dai template · **15 contratti** con 16
rate, di cui 3 multi-progetto · **5 mesi** aperti con **41 righe di ricavo** e
**89 di costo** · **47 voci** di piano · **173 movimenti** di banca · **5
persone** in organico. Nessun cliente ha più `package`.

Commerciali: Walter Giacobbe (ISF, iCura, Sartoria Condotti, Petito) · Marco
Lucci (Affinity, Seven) · Antonio Giarletta (Fatima Leo, Plus Vending) · Josè
Restaurant senza commerciale, quindi la provvigione si divide fra i soci. Walter
e Antonio **non hanno un account nel tool**: esistono solo come nome in
anagrafica, ed è il caso che §185 legge senza perdere la provvigione.

Fuori dai conti per scelta: 4 fatture ISF duplicate (14.400), GAV Sistemi (giro
di fatture, cliente interno), Gli Artigiani (stornato con nota di credito).

`npx tsx scripts/verify-month.ts 2026-07-01` legge un mese dal database e lo
passa a `computeMonth`: è il controllo della catena intera col codice che gira in
pagina. Su luglio la quadratura chiude a zero — 32.225 € di imponibile, 500 € di
partite di giro, quote + costi + subappalti = 31.725 €, differenza 0,00.

**Aperto, in ordine di importanza:**

1. **Pushare**: 52 commit fermi in locale. È il punto uno perché tutto il resto
   di questa sezione descrive un tool che gli utenti non hanno.
2. **Quotare i progetti che mancano**: 15 contratti su 21 progetti. Chi non ne ha
   legge «da quotare», non genera righe nel mese e non entra nella stima fiscale.
   È lavoro di inserimento, non di codice: si fa dalla scheda Economics.
3. **`promoteLineToPlan`** esiste in `app/actions/costs.ts` ma non ha un pulsante
   nell'economics del progetto: una spesa registrata a mano non si può ancora
   promuovere a ricorrente da lì.
4. **Attribuzione parziale**: `createActorClient` è adottato in `clients.ts`,
   `projects.ts`, `tasks.ts`, `ad-hoc-tasks.ts`, `create-project.ts` e
   `delete-client.ts`. Gli altri percorsi che scrivono su tabelle loggate (deals,
   tickets, objectives) continuano a registrare «Sistema» finché non passano
   anche loro.

## Regole di risposta
- Zero preamboli. Vai dritto a codice.
- Spiega solo se non ovvio o richiesto.
- Una sola soluzione proposta salvo richiesta esplicita.
- Modifica solo le righe necessarie.
- Niente riassunti: una riga di conferma basta.
- Leggi solo le righe rilevanti del file.
- TypeScript: zero errori al primo tentativo.
- Non chiedere conferma per modifiche non distruttive.

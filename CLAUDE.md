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
Numerazione: attenzione, `080_*`, `081_*` e `092_*` compaiono due volte. Il prossimo libero è **213**.

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

## Task completate (§283, `components/tasks/CompletedTasks.tsx`, migration 211)
Spuntare «fatta» le faceva sparire e non c'era modo di tornare indietro: nel
workspace la query stessa le escludeva (`neq('status','completato')`), negli
elenchi ad hoc il filtro di partenza è «aperte». Una spunta per sbaglio — la
casella è grande quanto il dito — voleva dire riscrivere la task da capo, con
descrizione, assegnatario e scadenza persi.

- **Una sezione loro, chiusa e contata**, in fondo ai tre elenchi (ad hoc admin,
  ad hoc del cliente, «Le mie attività»): la data in cui è stata completata, il
  gesto per riaprirla, e in testa quanto le resta da vivere. Sotto la settimana
  il countdown si scrive sulla riga: è l'unico momento in cui uno vorrebbe
  riaprirla prima che se ne vada.
- **Dopo 60 giorni si cancellano da sole** (`purge_completed_tasks`, cron alle
  3:20). Un elenco di completate che cresce all'infinito è un elenco che nessuno
  apre più, e allora tanto valeva cancellarle subito.
- **La data la garantisce un trigger**, non le azioni: `updateTaskStatus` la
  scriveva, `setAdHocTaskStatus` e `updateAdHocTask` no — due percorsi su tre
  l'avevano dimenticata, e senza quella data la retention non ha da dove
  contare. Le azioni la scrivono lo stesso, perché finché la 211 non è eseguita
  il trigger non c'è; il trigger copre i percorsi che non passano da lì (import
  Asana, UPDATE a mano).
- **Riaprire azzera**: da quel momento è una task viva come le altre, e i
  sessanta giorni ripartono solo se la si richiude.

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
| `207_payout_lines.sql` | **§243 — da eseguire.** `pl_payouts`: i compensi a soci e commerciali come righe spuntabili. Importo copiato dal piano, maturazione nel mese e uscita in quello dopo (`due_month`), `paid_on` scritto dal trigger con la data di oggi. Senza, la sezione Compensi resta in sola lettura come prima | — |
| `206_vat_settlements.sql` | **§242 — da eseguire.** `vat_settlements`: la liquidazione IVA come la dice il modello F24. Dove c'è, vince sulla stima di `lib/vat.ts`; la differenza resta visibile e dice quanto fatturato manca al conto economico. Seed del 2º trimestre 2026: 9.669,33 contro gli 8.399,87 stimati | — |
| `205_settled_from.sql` | **§230 — da eseguire.** Rinomina `payout_from` in **`settled_from`**: la linea del consolidato è una sola e vale per tre cose — compensi liquidati, spunte non certificate accettate, organico dei mesi vecchi non rincorso. Una colonna che dice meno del suo contenuto è il modo in cui il prossimo se ne inventa un altro uso | — |
| `204_payout_from.sql` | **§227 — applicata il 2026-08-08.** `pl_config.payout_from` (seed 2026-07-01): da quale mese si contano i compensi maturati verso soci e commerciali. Prima è liquidato. Senza, il registro conta da sempre e mostra a ciascuno un anticipo che non esiste | — |
| `212_payout_window.sql` | **§285/§286 — applicata il 2026-08-13.** `cost_items.installment_id` e `pl_cost_lines.installment_id`: la tranche di subappalto dichiara **quale rata del cliente finanzia**, e il margine digital la toglie da quella riga invece di spalmarla sul progetto. Più `pl_config.payout_day` (default 20) e `pl_months.payout_date`: la data dell'erogazione, che decide quali incassi entrano nella distribuzione. Backfill del legame per coda del nome, dove la corrispondenza è una sola. Senza, l'attribuzione resta proporzionale (§208) e la data cade sul giorno di default | — |
| `215_f24_documents.sql` | **§301 — da eseguire.** `f24_documents` + `f24_lines`: il modello F24 come documento, coi suoi tributi. Ogni riga dichiara a quale mondo appartiene (`iva`, `ritenute`, `inps`, `inail`, `credito`, `altro`) e punta al dominio che ne è l'autorità — `vat_settlements` per l'IVA (§242), `hr_f24` per il resto (§182). Il `credito` **si sottrae**: è l'indennità L. 207/2024 che esce in busta e rientra (§235). `payment_allocations.f24_id` come quarto bersaglio, col CHECK rifatto a «uno solo fra quattro». Trigger `f24_lines_balance` **deferred**: il totale versato deve essere la somma dei debiti meno i crediti, ma un modello nasce vuoto e si compila una riga alla volta. Senza, i modelli non hanno un posto e la sezione lo dichiara | — |
| `214_payment_allocations.sql` | **§297 — da eseguire.** `payment_allocations`: quanto di un movimento paga quale riga. Un movimento ha N allocazioni, una riga ne ha N, e ognuna dice se la certifica la banca o se è solo dichiarata. CHECK a un target solo (ricavo, costo, compenso), indice unico per (movimento, target) e **trigger `alloc_within_tx`** che vieta di allocare più di quello che il movimento contiene. Backfill dai legami diretti esistenti, con l'importo tagliato al minore fra il lordo del movimento e quello della riga. `bank_transactions.revenue_line_id`/`cost_line_id` restano: si droppano quando nessun chiamante li usa. Senza, il legame resta uno a uno e l'azione lo dichiara | — |
| `213_carry_forward.sql` | **§290 — da eseguire.** `carried_at`/`carried_from`/`carry_count` su `pl_revenue_lines` e `pl_cost_lines`: la chiusura del mese marca le righe non saldate invece di lasciarle dedurre da `openAt`. La riga **resta nel suo mese** — fattura, IVA e compensi di quel mese sono già stati dichiarati fuori — e il segno dice da quante chiusure si trascina. Backfill delle scoperte nei mesi già chiusi. Senza, il mese si chiude come prima e il trascinamento resta quello dedotto | — |
| `203_cash_calendar.sql` | **§224 — applicata il 2026-08-08.** `terms`/`due_date`/`paid_on` su `pl_revenue_lines` e `pl_cost_lines` + trigger che scrive la data di oggi quando si spunta «pagato». Backfill delle righe già spuntate **alla loro scadenza**: il costo del lavoro di giugno smette di pesare su giugno e passa a luglio. Senza, l'app funziona identica e la cassa resta quella di prima | — |

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
**Le righe del motore si costruiscono in un posto solo** (§287, `lib/pl-rows.ts`).
`computeMonth` non legge il database: legge `RevenueLine` e `CostLine`, e
qualcuno deve costruirli. Quel qualcuno era **dieci volte** — la pagina del conto
economico, quella della banca, il caricamento del prospetto, l'azione che scrive
i compensi e sei script di verifica — e ogni copia portava un sottoinsieme
diverso dei campi.

Non è disattenzione: **niente costringeva a ricordare**. E la conseguenza non è
un errore che si vede, è un numero **plausibile e sbagliato**, che è la sola
categoria di errore che nessuno va a controllare. Tre trovati in un giorno solo:
`materializePayouts` — l'azione che *scrive* i compensi — costruiva le righe
senza `project_value`, quindi nessuna risultava eleggibile al fondo rischio
(§186) e copiava in tabella **4.340,78 € a socio invece di 4.045,95**;
`verify-cash` aveva lo stesso buco, quindi **confermava** l'errore invece di
trovarlo; il report per il consiglio non portava `installment_id` e diceva un
centesimo diverso dalla pagina.

- **La checklist è il tipo, non la buona volontà**: `REVENUE_FIELDS` è dichiarato
  `Record<keyof RevenueLine, true>`, quindi aggiungere un campo al motore **non
  compila** finché non lo si elenca, e il gate verifica che il mapper lo porti
  davvero da una riga di database — non che lo prometta.
- **Il contesto si costruisce una volta** (`rowContext`): chi è il commerciale
  del cliente (§185), quali progetti copre un accordo (§207), quanto vale il
  lavoro venduto (§186). Erano tre mappe riscritte in ogni pagina, e ogni copia
  ne dimenticava una.
- **Gli script di verifica passano da lì come le pagine.** Un controllo che
  costruisce le righe a modo suo non verifica il codice che gira in pagina:
  verifica sé stesso, ed è il motivo per cui questi difetti sono sopravvissuti
  a tre script di controllo.

Gate: `npx tsx lib/pl-rows.check.ts` (31 controlli, col caso Seven a confronto —
contesto intero contro contesto vuoto).

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

**Il subappalto sa quale rata finanzia** (§285, `cost_items.installment_id`,
migration 212). §208 dice *quando* un costo esterno esce dal margine — il mese —
e per anni è bastato, perché `splitCostLikeClient` genera una tranche per ogni
rata del cliente e le dà lo stesso mese. Ma il legame restava **nel nome**
(«… — Rata 1 di 6»), che è una stringa, e da lì due danni.

- **L'attribuzione era proporzionale anche dove si poteva sapere.** Due rate
  dello stesso progetto nello stesso mese si dividevano i subappalti in
  proporzione all'imponibile: su Seven a luglio l'acconto avrebbe portato
  2.463,14 invece dei suoi 2.459,33 e la rata 2.668,41 invece di 2.672,22. Il
  totale tornava — ed è il motivo per cui non se ne accorgeva nessuno — ma la
  base di ogni singola riga era sbagliata, e basta che una sola delle due abbia
  il fondo rischio (§186) perché cambi anche il totale.
- **Una tranche datata altrove usciva dal margine del mese sbagliato.** Il
  grafico di Fatima, 650 €, era sul piano ad agosto contro la rata 1/4 che
  matura a luglio: luglio distribuiva 1.625 interi e agosto toglieva un costo
  che non aveva un ricavo da nettare. E lì il progetto non poteva salvare la
  situazione, perché **la riga di ricavo non ne ha uno**: quel contratto copre
  tre lavori (§188), quindi non porta un progetto e l'attribuzione per progetto
  non la raggiunge in nessun modo. La rata è l'unica cosa che le mette in
  contatto.

Tre conseguenze, e nessuna è un'opzione: **il mese lo decide la rata** (`fallsIn`
guarda il legame prima di `start_month`, per le una tantum) · **spostare la rata
sposta il subappalto** (§209, `moveInstallmentLine`, sia la voce di piano sia
l'occorrenza già nel mese — non quella già pagata, che è un fatto) · **quello che
non dichiara una rata si comporta esattamente come prima**, proporzionale sul
progetto, che è il ripiego giusto quando non si sa niente di meglio.

- **Subappalti** (§173): una voce di piano con `project_id` è una lavorazione
  affidata fuori. Si crea dalla scheda Economics del progetto, finisce da sé
  nell'area «Delivery & Fornitori» e dà il **margine del progetto** (ricavo del
  mese − costi esterni). Il tempo del team interno NON va lì: sta nel costo del
  lavoro aziendale, e mescolarli darebbe un margine che nessuno può calcolare.
- **Conto economico** (`/economics`): `generateRevenueFromClients` copia i
  contratti attivi nel mese (`origin='contratto'`); i clienti **senza nemmeno un
  contratto** entrano con l'MRR d'anagrafica (`origin='anagrafica'`, segnalati
  come «senza contratto»). Il ripiego è per cliente, mai globale.

**Il prospetto** (§239, `/economics/prospetto`, `lib/pl-aggregate.ts`). Il conto
economico risponde a «com'è andato **questo** mese», riga per riga, ed è il posto
dove si spunta. Il prospetto risponde all'altra domanda — **dove vanno i soldi**,
in che proporzione, e se sta cambiando — con le righe aggregate in **macro
categorie** e i mesi in colonna. Con quaranta righe di ricavo e novanta di costo
su cinque mesi quella risposta non c'era, e leggerla scorrendo cinque pagine
significa non leggerla.

- **Competenza e cassa sono due griglie, non due colonne accanto.** Lo stipendio
  di luglio sta in luglio sulla prima e in agosto sulla seconda (§224); metterli
  sulla stessa riga vorrebbe dire scegliere quale delle due domande tradire. In
  cassa una riga **non pagata non c'è**: raccontarla come fatto sarebbe peggio di
  non mostrarla.
- **Le macro non sono etichette libere**: `Personale` lo scrive l'organico (§184)
  e `Lavori affidati fuori` è già uscito dal margine del suo progetto (§188) —
  tenerli dentro un'area del piano fa sembrare struttura una cosa venduta al
  cliente. Le partite di giro stanno in riga loro (§188). Il resto tiene il nome
  della sua area, ordinato per peso: quello che costa di più si legge per primo.
- **La quota accanto al totale**: 8.899 € non dicono niente, «il 58% di quello
  che esce» sì. È la ragione per cui si guarda una tabella così.
- **Il prospetto è netto, la banca è lorda**, e l'IVA sta **in riga**: è l'unico
  modo di passare dall'uno all'altra senza barare. Il blocco «e in banca» mette
  sotto entrato/uscito/saldo dei soli movimenti veri (§189) e, mese per mese, la
  **differenza col prospetto**: se non è zero è una spunta senza movimento o un
  movimento senza riga, e il ponte in Banca (§199) dice quale.
- **Quale mese è chiuso si legge nell'intestazione**: una fotografia e un mese in
  corso non si confrontano, e l'ultima colonna è quasi sempre incompleta.

**I compensi stanno fra le uscite, ma non sono costi** (§240). Dal conto escono
come tutto il resto, quindi si vedono lì; ma non sono righe di conto economico —
non si scrivono, si ricalcolano (§227) — e sommarli ai costi darebbe un margine
diverso da quello del conto economico **con lo stesso nome**. Perciò la colonna
ha due totali: `Margine` (entrate − costi, lo stesso numero del conto economico)
e `Resta alla società` (dopo i compensi). In competenza sono due righe, perché si
sa a chi spettano; in **cassa una sola**, perché un bonifico a un socio che è
anche commerciale non dice quale dei due lavori sta pagando (§226). Le quote di
riga si leggono sul totale che esce, compensi compresi: tenerli fuori dal
denominatore farebbe sembrare il personale più pesante di quanto è.

**Un mese solo: le due letture affiancate** (§240). Su più mesi competenza e
cassa sono due griglie e si sceglie col selettore; su **un** mese la domanda
cambia — non è come si muove una proporzione, è «cosa il mese ha prodotto, cosa
si è mosso, e quanto manca fra le due» — e con un selettore quel «quanto manca»
te lo ricordi a mente da una schermata all'altra, che è il modo in cui non lo
guarda nessuno. La sezione si apre da **quello che c'è sul conto**: saldo a
inizio periodo, entrato, uscito, saldo adesso.

**Il compenso diventa una riga che si può spuntare** (§243, `pl_payouts`,
migration 207). I compensi si ricalcolano a ogni lettura (§227) — è la ragione
per cui basta mettere una rata nel mese giusto perché provvigioni ed erogato
tornino da soli — ed è anche la ragione per cui non si potevano **spuntare**:
non c'era niente su cui mettere la spunta, e «quanto è uscito» si poteva solo
dedurre dai bonifici, che non dicono se stanno pagando la quota di socio o la
provvigione (a una persona sola si bonifica una volta, §226).

- **L'importo si copia**, come per le entrate: un mese chiuso resta quello che
  era anche se domani una rata si sposta. Rigenerare aggiorna solo le righe
  **non pagate** — quello che è uscito è un fatto, e non si riscrive perché la
  base di calcolo è cambiata dopo.
- **Matura in un mese ed esce in quello dopo**, come il costo del lavoro (§224):
  le retribuzioni di luglio, l'erogato ai soci e le provvigioni di luglio si
  pagano ad agosto. `due_month` lo scrive la generazione, `paid_on` la spunta —
  e la data la mette il trigger con **oggi**, perché chiederla a mano significa
  averla sbagliata la metà delle volte.
- **La spunta sta sulla riga della persona**, accanto al numero, e da lì il
  prospetto sa in cassa anche **per quale dei due lavori** il compenso è uscito
  — cosa che un bonifico non dice. Senza righe materializzate la cassa torna al
  ripiego di prima: il totale dei movimenti `finanziamento` del mese, in una
  riga sola.

**Due regole imparate al primo uso** (§244):

- **La riga si ritrova per nome, non per chiave.** `mergePeople` fonde socio e
  commerciale in una persona sola e le dà la chiave del socio (`p:<id>`);
  `materializePayouts` scrive la provvigione con quella del commerciale
  (`o:<nome>`). Due spazi di chiavi diversi, e l'effetto era che la spunta
  compariva **solo** su chi è commerciale e basta — Antonio sì, Walter e Marco
  no. Il nome ce l'hanno tutte e due ed è quello che si legge sullo schermo; la
  chiave resta come ripiego.
- **La spunta resta viva a mese chiuso**, ed è l'unico posto in cui succede. Il
  compenso di luglio si eroga ad agosto: se chiudere luglio spegnesse la
  casella, la funzione sarebbe inutilizzabile proprio quando serve. Stessa regola
  degli arretrati (§224) — spuntare registra la data di oggi e non riapre il
  mese, perché il bonifico è un fatto di adesso.

E in testata la sezione dice **a che punto è**: «2 su 3 pagati · restano 3.367 €»,
con «Segna N pagati» accanto. Segnare dieci righe una a una è il motivo per cui
non le segna nessuno.

Gate: `npx tsx lib/pl-aggregate.check.ts` (47 controlli).

**Il conto economico è dove si registra il mese, non dove si guarda tutto**
(§293). Erano dodici sezioni in fila, e tre rispondevano a domande che si fanno
altrove: **Lavori affidati fuori** (i subappalti hanno una sezione loro), **I
prossimi sei mesi** (il previsionale vive nel prospetto, §262) e **Uscito
davvero dai conti** (il confronto fra spunte e movimenti è il ponte in Banca,
§199). Tolte. Con loro sono spariti dal payload `subItems`, `installmentMonths`
e `bankMonth`, che nessun altro leggeva.

Due cose che **non** se ne sono andate con i pannelli, ed è il punto:

- **I subappalti restano nel motore.** Sono righe di costo con `project_id`: il
  margine digital continua a toglierli dal ricavo del loro progetto (§186, §208)
  e restano elencati in Uscite dentro la loro area. Togliere il pannello non
  toglie la matematica — la quadratura di agosto chiude ancora a 0,00 con
  5.122,22 € di lavorazioni esterne.
- **«Chi non ha mai ricevuto un bonifico» adesso si vede.** `never` e `owed`
  erano calcolati in `CompensiSection` e **buttati via**: la sezione mostrava le
  quote del mese e taceva sul fatto che a una persona non fosse mai uscito un
  euro. Ora la testata dice quanto è maturato e mai erogato su tutti i mesi, e fa
  i nomi. Era l'unica cosa che «Uscito davvero» avrebbe potuto portarsi via, e
  non ce l'aveva nemmeno lui.

**Quattro difetti visti guardando lo schermo** (§307). Nessuno si trovava
leggendo il codice, e uno era un numero sbagliato travestito da errore di stampa.

- **«3.260 €/3.260 €»** sul chip del movimento: due numeri che sembrano uguali
  perché `eur` arrotonda all'euro, mentre la differenza vera era di **11
  centesimi**. E insieme erano più larghi della loro colonna, quindi finivano
  **sopra l'importo** — il primo numero che si guarda. Adesso il chip dice quello
  che **manca**, uno solo, e solo se supera l'euro: sotto, lo dice il colore e il
  resto sta nel titolo.
- **Due segnaposto per la stessa assenza**: la cella del documento scriveva «—» e
  sotto compariva «senza fattura». Se il documento c'è o si può collegare comanda
  la cella, se manca comanda l'avviso. Mai entrambi.
- **7.232 € senza nome nella ripartizione**, dipinti `bg-success` come «Cassa
  TwoBee»: due cose diverse con lo stesso colore, e il solo posto dove quella
  fetta aveva un nome era un tooltip che galleggiava sopra l'elenco. Ora è una
  riga con la sua etichetta — «non ancora destinato» — e un colore suo.
- **Il fornitore non arrivava al motore dell'intake.** La riga dell'acconto Seven
  si chiama «Subappalto — Digitalizzazione — CRM — Acconto» e non contiene
  «Affinity»: il nome non la trovava, e il bonifico da 3.000 € finiva sull'unica
  riga che quella parola conteneva — l'acconto ISF — con la frase «la controparte
  torna e questo movimento la chiude». **Una risposta sicura e sbagliata**, che è
  la sola categoria che nessuno va a controllare. Col fornitore le candidate
  diventano tre e la proposta dice «scegli quale».

**E il dialogo guarda tutti i mesi** (`intakeOverview`): apriva su uno e taceva
sugli altri, quindi il lavoro arretrato di luglio non si vedeva da agosto —
bisognava cambiare mese in cima alla pagina per scoprire se ce n'era. I mesi
chiusi sono in elenco e spenti: non si toccano, ma sapere che contengono qualcosa
è il motivo per cui uno decide di riaprirli.

**Un accordo in bozza non entra mai, e adesso lo dice** (§306,
`lib/stream-validation.ts`). La regola c'era dalla 164 ed è giusta: `bozza` non
fa canone, non genera righe nel mese, non conta nel valore venduto del lavoro
(§186), non apre la durata del rapporto (§179). È quotato, non venduto. Quello
che mancava era **dirlo**: la scheda mostrava l'importo e taceva, e chi lo
guardava aveva ragione a credere che fosse dentro i conti.

E il difetto vero era l'opposto di quello che sembrava. Non mancava il gesto per
validare — `activateStream` esisteva e la select dello stato c'era — **mancava la
regola su quella select**: `updateStream` cambiava lo stato senza guardare
niente. Si poteva riportare in bozza un contratto **con rate già incassate**, e
da lì il canone sparisce dall'economics mentre i soldi restano in cassa senza
niente che li spieghi; o attivare una manutenzione il cui progetto è ancora in
corso, scavalcando il controllo che `activateStream` faceva. **Una regola che
vive in un percorso e non nell'altro non è una regola**: adesso `guardStatus` sta
dentro `updateStream`, dove passano tutti e due.

- **Verso `attivo` si guarda l'importo e il padre**: un accordo da zero euro
  entrerebbe nel mese come una riga che non dice niente, e una manutenzione che
  parte prima fatturerebbe un servizio che nessuno sta erogando (§169). Da
  `sospeso` ad `attivo` è una **ripresa**, non una validazione: la regola vale
  sul passaggio dalla bozza.
- **Verso `bozza` decide quello che l'accordo ha già prodotto**, e l'ordine dei
  rifiuti è l'ostacolo più a monte: una rata **incassata** batte tutto, poi il
  **mese chiuso** — dove i compensi sono già stati calcolati su quel ricavo — e
  infine le rate materializzate, che **non bloccano ma restano lì**: senza
  l'avviso il mese continua a fatturare un contratto che non è più venduto.
- **`sospeso` e `concluso` non si controllano**: chiudono il futuro, non
  riscrivono il passato.

**Il piano del subappalto svincolato c'era: mancava il suo prezzo.**
`splitCostCustom` costruisce da sempre un piano indipendente da quello del
cliente, e «Su misura» è in evidenza nella scheda. Ma una tranche costruita a mano
**non dichiara quale rata finanzia** (§285), quindi il margine digital torna a
toglierla in proporzione all'imponibile del mese invece che dalla riga precisa
(§208). È il ripiego giusto quando il fornitore ha tempi suoi — e va saputo
**prima di scegliere**, non scoperto a valle guardando un margine.

Gate: `npx tsx lib/stream-validation.check.ts` (24 controlli).

**La posizione di ognuno era calcolata e mostrata a nessuno** (§304, `Posizione`
in `CompensiSection`). `payoutLedger` sa da mesi quanto spetta a una persona su
**tutti** i mesi, quanto le è uscito dal conto e quanto resta — e serviva a due
totali in testata: il resto veniva buttato. Per sapere se Marco era in pari
bisognava confrontare tre pannelli, e uno dei tre l'ha portato via §293.

Adesso è una tabella sola, in ordine di scoperto — chi aspetta di più si legge
per primo, che è l'unico ordine con cui si decide un bonifico. Tre colonne e la
differenza: **gli spetta · uscito dal conto · resta**. Sotto ogni nome sta scritto
**da quando si conta per lui** (§228), perché la stessa frase detta a due
situazioni opposte è peggio di nessuna frase: chi è stato pagato riparte dalla
liquidazione, chi non ha mai preso un euro si conta da sempre. E un **anticipo**
non è un errore: è quello che è uscito oltre il maturato, e si riassorbe col mese
dopo (§191).

**L'erogato lo dice il registro, non la categoria del movimento** (§305). Era la
riga che rendeva quella tabella inutilizzabile: `payoutsFromBank` filtrava per
`kind`, e `classify` etichetta `finanziamento` i bonifici ai soci di giugno e
`pagamento` quelli del 13 agosto — perché legge la descrizione, e quelle due
frasi sono scritte diversamente. Risultato: **a Marco 3.412 € usciti e «erogato
0»**, che è la stessa bugia di uno zero su chi non è stato pagato.

Tre difetti in fila, e ognuno nascondeva il successivo:

- **La categoria non è un criterio.** Dove il registro parla, `kind` non conta:
  qualcuno ha già detto che quel movimento paga un compenso, e l'ha detto
  guardandolo.
- **Il registro dice anche *a chi*, e per quanto.** Il bonifico a Toto dice
  «salvatore piacente» e il piano compensi lo chiama «Toto»: il nome non lo
  trovava. Non serve indovinarlo — sta scritto nell'allocazione.
- **Una persona ha più nomi.** «Marco» in `pl_partners` e «Marco Lucci» in
  anagrafica sono la stessa (§244), e `pl_payouts` scrive la quota col primo e la
  provvigione col secondo: confrontare una sola etichetta dava a Marco 442 €
  invece di 3.412. Gli alias stanno in `mergePeople` e sono **separati da
  `names`**, che si cercano nella descrizione di un bonifico: allargare quelli a
  un nome di battesimo solo farebbe corrispondere qualunque bonifico che lo
  contenga.

Sui dati veri: da erogare **3.892 € invece di 10.716**, ed è la verità — 6.824
sono usciti il 13 agosto e il tool non li vedeva.

**Un movimento non spiegato ha quattro risposte, non una** (§303,
`lib/month-intake.ts`). «Porta le spese del conto nel mese» scriveva righe
**senza chiedere niente**, e le doppie di questa estate sono nate tutte lì:
«Affinity (2 addebiti) 5.100 €» accanto ai due subappalti che quei bonifici
pagavano, «Beneficiari Vari Distinta» accanto alle tre righe che l'organico
aveva già scritto. Non era disattenzione: **una riga nuova era l'unica risposta
che quel gesto sapeva dare.**

- **accorpa** — la riga esiste e questo movimento la paga, in tutto o in parte.
  È la risposta giusta quasi sempre, ed è quella che mancava.
- **correggi** — la riga esiste ma **dice meno del vero**: «Meta Ads (3
  addebiti)» porta 109,12 € e dal conto sono usciti 166,01, che sono cinque
  addebiti. Qui una riga nuova è la peggiore delle risposte — creerebbe un
  secondo Meta Ads accanto al primo. E **due correzioni sulla stessa riga si
  sommano**: se la seconda ripartisse dall'importo iniziale la riga finirebbe a
  160,61 e i 5,40 della prima si perderebbero.
- **aggiungi** — solo dove a piano non ci sarà mai: commissioni, bolli, imposte.
  Per tutto il resto la proposta scrive che una riga in più è un costo contato
  due volte.
- **ignora** — giroconto, o qualcosa che qualcuno ha già dichiarato irrilevante
  (§298: chi ha deciso resta deciso).

Due regole nell'interfaccia, e sono la stessa cosa da due lati: **i casi senza
dubbio si confermano in blocco** — importo esatto, controparte che torna, una
riga sola possibile — e **gli altri no, ognuno col perché sotto**. Venti conferme
separate è il modo in cui non se ne conferma nessuna; una conferma in blocco su
casi ambigui è il modo in cui si sbaglia venti volte (§276). E le righe **si
consumano durante il giro**, in tutti e due i sensi: senza, due movimenti
trovano la stessa riga scoperta e la coprono entrambi (§300).

Gate: `npx tsx lib/month-intake.check.ts` (43 controlli) ·
`npx tsx scripts/verify-intake.ts <mese>` stampa la proposta senza scrivere —
su agosto: 27 movimenti su 30 già spiegati, 2 da correggere, 1 riga nuova.

**La fattura si collega dalla riga, sempre** (§302, `InvoiceCell` in
`PlClient`). Il documento si poteva agganciare **solo dentro il dialogo del
pagamento**: su una riga già incassata, o su una da collegare prima che i soldi
si muovano, non c'era strada. Ed è la terza gamba del triangolo — la riga dice a
che mese appartiene il lavoro, il movimento quando i soldi si sono mossi, la
fattura è l'unica cosa che vale davanti all'erario.

- **`invoiceOf` porta il documento, non un booleano.** Un booleano si può solo
  accendere in un avviso; il numero della fattura si può mostrare accanto alla
  spunta, che è dove serve. Il booleano di prima si deriva da lì: una fonte sola.
- **I candidati dicono la capienza.** Una fattura da 3.000 € già spesa su due
  righe non può coprirne una terza, e chi ha ancora spazio per il lordo di
  *questa* riga viene prima. Senza quel numero l'abbinamento sbagliato è la cosa
  più facile del mondo — ed è l'errore che poi nessuno cerca.
- **«Già su N righe» non è un allarme**: una fattura che copre due mesi di canone
  è normale (§297), tre volte lo stesso importo no. Il conteggio si mostra e la
  decisione resta di chi guarda.
- L'avviso «senza fattura» di §247 resta, ma solo quando **non c'è nessun
  candidato**: dove il documento c'è e basta collegarlo, il gesto batte
  l'avviso.

**L'F24 è un foglio, e dentro ci sono due mondi** (§301, `lib/f24.ts`,
migration 215). L'IVA di un trimestre e le ritenute dei dipendenti si versano
**con lo stesso modello**, e nel tool vivevano in due tabelle che non si
parlavano: `vat_settlements` (§242) e `hr_f24` (§182). Il documento che le
contiene non esisteva da nessuna parte, e il prezzo si legge in un movimento —
il 20 agosto dal conto sono usciti **10.547,24 €**, cioè 9.669,33 di IVA più
877,91 di ritenute e contributi, al centesimo, e nessuna riga del tool valeva
quella cifra.

- **Il documento è il contenitore, non un dominio nuovo.** Ogni riga dice a quale
  mondo appartiene e quel mondo resta l'autorità del *suo* numero; il modello sa
  una cosa che nessuno dei due sapeva, ed è **quando i soldi sono usciti insieme**.
  Prima la data si scriveva a mano in due tabelle, e le due mani potevano non
  essere d'accordo.
- **Il credito si sottrae**: l'indennità L. 207/2024 esce in busta e rientra qui
  (§235). Contarla come debito la farebbe pagare due volte, e abbatte il **costo
  del lavoro**, non l'IVA — imputarla all'IVA sposterebbe soldi fra due mondi.
- **`split` è la ragione per cui il documento serve**: dei 10.547,24 € solo
  877,91 sono un **costo**. L'IVA è un debito che si estingue e non era nostra
  nemmeno il giorno prima (§225): metterla fra le uscite di competenza farebbe
  costare diecimila euro un mese di stipendi.
- **Il totale è la somma delle righe**, e uno scarto non è un arrotondamento: è
  una riga che nessuno ha trascritto, e senza quella riga si sa *quanto* è uscito
  e non *per cosa*. Il trigger è `deferrable initially deferred`, perché un
  modello nasce vuoto e vietare lo stato intermedio vorrebbe dire non poterlo
  scrivere affatto.
- **La stima resta accanto e la differenza è informazione** (§242): sul 2º
  trimestre il tool diceva 8.399,87 e il modello chiede 9.669,33 — quei 1.269,46
  sono fatturato del trimestre che il conto economico non ha.

Gate: `npx tsx lib/f24.check.ts` (25 controlli, coi due modelli veri) ·
`npx tsx scripts/seed-f24.ts` li trascrive e li aggancia al loro movimento.

**Un movimento paga N righe, una riga è pagata da N movimenti** (§297,
`lib/allocations.ts`, migration 214). Per tutta la vita del tool il legame fra
conto corrente e conto economico è stato **un campo** — `cost_line_id` e il suo
gemello per le entrate. Un movimento, una riga. Regge finché il mondo è fatto
così, e il mondo non è fatto così:

- un bonifico paga **due fatture** dello stesso fornitore («Affinity, 2 addebiti»);
- una distinta paga **tre stipendi** — 4.077 € in una riga sull'estratto conto;
- una fattura si paga **a metà**: Affinity il 23 luglio ha incassato 2.100 su
  2.562, cioè l'imponibile e non l'IVA;
- un compenso è **due cose insieme**: a Marco a luglio sono usciti 3.412 €, che
  sono 3.191,12 di quota socio più 220,88 di provvigione — la sua, divisa a metà
  con Toto. E la stessa provvigione risulta quindi pagata da **due** bonifici,
  uno a testa.

Con un campo solo ognuno di questi casi ha una sola uscita: non agganciare
niente. Ed è quello che è successo — il ponte (§199) non quadra per −6.029 € e
quasi tutto sta in tre bonifici cumulativi che nessuno ha potuto spiegare. Qui
l'unità non è il legame: è **l'euro allocato**.

- **Non si alloca più di quello che il movimento contiene**, e il vincolo sta in
  tre posti: la UI lo mostra *mentre* si sceglie (sapere di aver sforato dopo
  aver premuto è saperlo troppo tardi), l'azione lo applica perché un file
  `'use server'` esporta endpoint, il trigger lo tiene per chi scrive da fuori.
- **L'importo è sempre positivo e sempre lordo**: dal conto passa il totale
  della fattura, la riga è imponibile, e lo scorporo si fa dove serve (§296).
  Il verso lo decide il target, non il segno.
- **La spunta «pagato» segue il registro**, non il contrario: una riga è pagata
  quando le allocazioni la coprono. Prima bastava che qualcuno avesse agganciato
  *qualcosa*, senza guardare quanto — l'acconto Affinity da 2.100 su 2.562
  risultava saldato e i 462 € di IVA ancora dovuti sparivano da ogni previsione.
- **Quello che avanza avanza e si vede.** `propose` riempie ogni riga scelta col
  suo scoperto finché il movimento tiene, dice **quanto manca** a quelle che non
  copre, e se resta denaro non gli inventa una destinazione: far tornare il
  conto nascondendo l'ambiguità è il modo in cui un registro smette di servire.
- **Certificata contro dichiarata resta la distinzione di §226**: `banca` e
  `manuale` sono fatti, `derivato` nasce dalla spunta che dovrebbe confermare.
- **§300 — un fatto spegne la dichiarazione** (`superseded`). È la regola di
  `bank_on_match` (§189) che al registro mancava, e la mancanza si è vista subito
  sui dati veri: la riga «Beneficiari Vari Distinta» aveva 3.868 € dichiarati
  dalla spunta e ha ricevuto 4.077 dal bonifico del 20 agosto — **7.945 su 4.077
  dovuti**, la riga pagata due volte. Si spengono solo le dichiarazioni dello
  stesso target, e solo quando arriva un fatto: una dichiarazione non ne scaccia
  un'altra, o si perde l'unica traccia di un pagamento che nessuno ha dimostrato.
- **Quello che un giro ha già proposto conta come allocato.** Due movimenti che
  guardano la stessa fotografia trovano la stessa riga scoperta e la coprono
  entrambi: il canone di aprile di Fatima si è preso 1.830 € dal bonifico del 13
  maggio **e** altri 1.830 da quello del 9 giugno. Chi propone in blocco tiene il
  conto di sé stesso, o il registro nasce con dentro l'errore che deve trovare.

Gate: `npx tsx lib/allocations.check.ts` (38 controlli, coi quattro casi veri) ·
`npx tsx scripts/verify-allocations.ts` legge il registro dal database e dice
quanto di ogni movimento è spiegato, quali righe sono coperte a metà e cosa non
torna.

**Il subappalto ha l'IVA, e l'effettivo lo dice la banca** (§295-§296,
`lib/bank-actual.ts`). Due regole che si tengono, ed è il motivo per cui vanno
lette insieme.

**L'IVA c'è.** Una lavorazione affidata a un fornitore italiano ha l'IVA, e su
un subappalto è detraibile: `addProjectCost` la accende di default. Ma il piano
del CRM di Seven — sette tranche Affinity S.r.l. per 18.402,64 € — è nato prima
di quel default e le aveva **tutte spente**, mentre lo stesso fornitore
sull'ISF ce l'ha accesa. Due conseguenze che non si vedono guardando il margine:
la cassa sottostimava ogni tranche di ~588 €, perché dal conto esce il lordo, e
il credito IVA non arrivava al trimestre. Corretto con
`scripts/fix-subcontract-vat.ts`: il 3º trimestre passa da **9.250 a 8.109 €**.
Il margine non cambia — l'imponibile è lo stesso.

**L'effettivo lo dice l'estratto conto**, quando c'è: da quando un movimento
`banca` è agganciato, la cifra scritta a mano non è più la stima migliore. Dal
conto passa il **lordo** e la riga è imponibile, quindi si scorpora sempre con
l'aliquota della riga — ed è qui che l'IVA sul subappalto smette di essere un
dettaglio fiscale: senza, lo scorporo non avviene e il costo sale del 22%.
Tre esiti, e la differenza fra gli ultimi due è tutto il punto:

- **combacia** — la banca conferma, non c'è niente da fare.
- **dice un altro numero** — si è pagato più o meno del previsto, e l'effettivo
  si corregge. Il toast lo scrive: scoprirlo fra un mese guardando il margine è
  il modo in cui non lo si scopre.
- **non copre il lordo** — l'acconto Affinity di luglio, 2.100 € versati su una
  fattura da 2.562: hanno pagato l'imponibile e non l'IVA. Qui **non si riscrive
  niente**. Il costo è quello che il fornitore ha fatturato; quello che manca è
  l'IVA, non una parte del lavoro, e mettere 1.721,31 nell'effettivo sarebbe un
  numero plausibile e sbagliato (§272).

Un movimento che paga **più righe** resta fuori: il suo lordo non appartiene a
nessuna delle due da solo, e spartirlo è il lavoro del registro delle
allocazioni. Finché non c'è, la funzione lo dichiara invece di indovinare. E un
mese chiuso non si riscrive perché arriva un estratto conto.

Gate: `npx tsx lib/bank-actual.check.ts` (24 controlli).

**Una riga si toglie, ma non tutte** (§294, `lib/line-removal.ts`). È l'altra
metà di §290: quello che non arriverà mai non deve trascinarsi per sempre, e una
riga scritta due volte o un canone di un cliente andato via vanno cancellati. Ma
`deleteRevenueLine` e `deleteCostLine` **non controllavano niente**: cancellavano
una riga pagata, una fatturata, dentro un mese chiuso, con un clic e senza un
messaggio. Sulle 103 righe del database ne bloccano ora **89**.

Tre blocchi, ognuno da un danno diverso: **il mese chiuso** è una fotografia e i
compensi di quel mese sono già stati bonificati su quelle righe · **una riga
pagata** è un fatto, e toglierla lascia in cassa un'uscita senza niente che la
spieghi — che è il residuo che il ponte (§199) esiste per stanare · **una
fattura esiste allo SdI**, l'IVA del suo trimestre la contiene, e la strada è la
nota di credito. Due avvisi che non bloccano: la riga marcata «fatturata» senza
un documento sotto, e quella che nasce da una rata — che **tornerà** alla
prossima preparazione del mese, perché la rata è ancora nell'accordo.

- **L'ordine dei controlli è una regola**: si dice sempre l'ostacolo più a monte.
  A chi ha davanti una riga pagata dentro un mese chiuso non serve sapere della
  spunta: deve prima riaprire il mese.
- **Il verdetto guarda il mese della riga, non quello aperto.** Una riga
  trascinata da luglio si toglie solo se luglio è aperto.
- **Il pulsante si spegne, non sparisce**: uno che sparisce è un mistero, uno
  spento con la ragione nel `title` insegna la regola una volta. Sparisce solo
  nel mese chiuso, dove ripeterlo su venti righe è rumore. La barriera vera è
  `guardRemoval` dentro l'azione: un file `'use server'` esporta endpoint.

Gate: `npx tsx lib/line-removal.check.ts` (19 controlli).

**Una riga non saldata non si perde alla chiusura** (§290, migration 213). Il
conto economico dice **in che mese il lavoro è stato fatto**, e quella
appartenenza non cambia perché il cliente paga in ritardo: la fattura è stata
emessa in quel mese, l'IVA di quel trimestre la contiene e i compensi sono già
stati calcolati su quel ricavo. Spostare la riga nel mese dopo vuol dire
riscrivere tre cose **già dichiarate fuori dal tool**, e il fatturato di un mese
chiuso cambierebbe ogni volta che qualcuno tarda a pagare.

Quello che serve è un'altra cosa: che nessuno la perda di vista. Finora la riga
scoperta compariva nel mese nuovo perché `openAt` la deduceva dalle date —
funzionava, ma era una deduzione: non si sapeva **quando** era stata trascinata
né **quante volte**, e una riga che gira da tre chiusure si leggeva identica a
una scaduta ieri. Adesso la chiusura lascia il segno (`carried_at`,
`carried_from`, `carry_count`), la riapertura lo cancella — riaprire vuol dire
che quella chiusura non è più successa — e sopra il blocco «Da mesi precedenti»
sta scritto quante si trascinano da più di una chiusura, che è la sola cosa che
distingue un ritardo da un credito che nessuno sta inseguendo. `carryOf` in
`lib/cash-calendar.ts` è l'unico lettore.

**I compensi si leggono nel P&L, al mese in cui escono** (§291,
`lib/pl-aggregate.ts`). Le quote di luglio si erogano ad agosto (§224, come il
costo del lavoro): finché il prospetto le metteva a luglio, la colonna di agosto
mostrava un «resta alla società» che nessun bonifico avrebbe mai confermato — il
mese pagava dodicimila euro che il suo P&L non conteneva. In cassa il problema
non c'era, perché `paidPartners` guarda la spunta e la spunta cade nel mese
dell'erogazione: lo spostamento riguarda la sola **competenza**, ed è proprio
quello che avvicina le due letture invece di separarle.

- **Il prezzo è dichiarato, non nascosto**: la riga porta scritto da quale mese
  arriva la maturazione. Un P&L che sottrae quote di un altro mese senza dirlo è
  il modo più veloce per non fidarsi del totale.
- **Una riga per persona** — Marco, Walter, Toto, e i commerciali separati — in
  ordine di importo. «Compensi 12.325 €» non risponde alla domanda che ci si fa
  guardando il P&L, che è «quanto a Marco». Le persone arrivano dal piano
  compensi (`perPartner`, `salesByOwner`): la UI non ricalcola percentuali.
- **Il totale si fa sulle righe di gruppo, mai su tutte**: sommare anche il
  dettaglio lo conterebbe due volte e darebbe un margine sbagliato con lo stesso
  nome di quello giusto. Per la stessa ragione la tabella «Dove esce» del report
  elenca le destinazioni e non le persone.
- **In cassa la persona porta la spunta**, non il maturato: è l'unico numero che
  un bonifico può confermare (§226).
- Nel conto economico i compensi restano **la leva**: è lì che si spunta
  l'erogazione (§243), e una leva lontana dal suo risultato non la usa nessuno.

**Tutte le uscite che cadono nel mese, anche quelle che nessuno ha portato
dentro** (§308). «Un mese aperto si legge dalle righe, uno mai aperto dal piano»
(§262) proteggeva dal doppio conteggio e **buttava via il resto**: una spesa
ricorrente che nessuno ha portato nel mese non compariva da nessuna parte, e la
cassa del mese risultava più leggera del vero. Su agosto erano **965 €** —
Google Workspace, Slack, OVHcloud, Aruba, il commercialista — con la loro data.

- **Il legame è `cost_item_id`**, che la riga porta da quando nasce dal piano:
  quello che ha già una riga si esclude, il resto entra.
- **Entra in cassa, non in competenza.** Il conto economico è l'autorità su cosa
  il mese ha prodotto (§264), e i totali di competenza del piano devono
  continuare a combaciare con lui **riga per riga** — è l'unica cosa che rende
  quei numeri controllabili. Metterle in competenza faceva dire al piano 29 voci
  contro 16 righe: due numeri con lo stesso nome. La loro presenza in cassa è
  **il segnale** che al mese manca qualcosa, e si porta dentro con «Prepara il
  mese» o dal dialogo dei movimenti (§303).
- **L'area Personale resta fuori** (§184): le sue voci a piano sono un residuo
  del seed, e le righe del costo del lavoro le scrive l'organico **senza**
  `cost_item_id` — quindi il filtro non le riconosce e comparirebbero accanto a
  quelle vere. Su agosto erano 8.640 € contati due volte. E l'esclusione va per
  **id dell'area**, non per nome: `cost_items.category` dice «HR», l'area si
  chiama «Personale», e `isPayrollCenter` guarda il nome — sul campo sbagliato
  non riconosceva niente.
- **Una data già passata è `scaduto`, non `atteso`**: chiamarla attesa insegna a
  non guardare le date.

**Fin dove il saldo è un fatto lo dice l'estratto conto** (§308). L'ancora era
**oggi**, ma il saldo di partenza è quello della banca e la banca contiene solo
ciò che l'estratto conto copre: con l'ultimo scaricato fermo al 20 e oggi il 25,
i cinque giorni in mezzo venivano dati per «già nel saldo» mentre il conto non li
aveva visti — e il mese chiudeva con un numero che nessun estratto conto avrebbe
confermato. Adesso l'ancora è la data dell'ultimo movimento caricato.

**E `verify-plan` costruiva il piano a modo suo** (`open ? [] : …`), quindi non
vedeva niente di tutto questo: un controllo che non passa dal codice che gira in
pagina verifica sé stesso (§287). Ora applica le stesse due regole.

**Il piano di cassa del mese** (§262, `lib/cash-plan.ts`, in cima al prospetto).
La tenuta di cassa (§225) dice **se** un mese regge; questa dice **da cosa
dipende**. Ogni fatto atteso è una riga con la sua data e la sua provenienza —
righe registrate, contratti, piano dei costi, organico, IVA, compensi — e ogni
riga si può **spegnere**. Spegnere non cancella niente: dice «e se questo non
succedesse», e il saldo di fine mese si muove mentre si sceglie, trascinandosi
dietro i mesi dopo. Il mese sta **nel titolo** ed è una tendina, coi mesi mai
aperti compresi: è lì che serve guardare.

- **Un mese aperto si legge dalle righe, uno mai aperto dal contratto e dal
  piano.** Sommarli conterebbe due volte lo stesso canone.
- **§284 — spuntare «pagato» non fa sparire i soldi.** Una riga spuntata che
  nessun movimento `banca` dimostra è un fatto **avvenuto** che il saldo non
  contiene ancora: il bonifico l'ha visto una persona sull'home banking e
  l'estratto conto si scarica la settimana dopo. Prima veniva marcata «già nel
  saldo» e spuntare un incasso da 7.930 € faceva **scendere** di 7.930 il saldo
  di fine mese — l'opposto di quello che era successo. Adesso `declared` la
  somma al saldo, la mette nel **pavimento** (è un incasso avvenuto, non una
  speranza) e resta riconoscibile — «spuntata, non in estratto conto» — finché
  la banca non la conferma (§226). Le righe **dimostrate** restano fuori dal
  totale, o si conterebbero due volte. Su agosto: +4.270 e −11.169 spuntati che
  il conto non ha ancora visto, saldo 34.846 → **contato come 27.947**.
  Il numero vale anche in Banca, dove **si conta dalle righe e non dai
  `derivato`**: quelli restano anche quando il fatto è arrivato ma nessuno l'ha
  riconciliato, e sui dati veri i due modi divergevano di **24.044 €**.
- **Si parte dal saldo vero della banca** (§263): il mese in corso apre con
  **quello che c'è sul conto adesso** — 30.876,09 € al 9 agosto, lo stesso
  numero di `verify-bank.ts` — non con un'apertura ricostruita dalle righe.
  Quel saldo contiene anche i movimenti che nessuna riga giustifica, ed è
  esattamente il motivo per cui è quello giusto. Da lì si somma solo quello che
  deve ancora succedere: le righe già mosse restano in elenco (`inBalance`,
  «già nel saldo», con una spunta e non una casella) ma non muovono il totale,
  o il mese conterebbe due volte incassi che ha già avuto. Un mese passato apre
  col saldo che aveva a inizio mese, perché lì è già successo tutto.
- **Gli arretrati pesano sul primo mese**, non sul loro: una fattura di maggio
  scoperta è una telefonata di adesso.
- **Il costo del lavoro si stima solo se il mese prima non è aperto** (§224:
  esce il 20 del mese dopo). Senza la regola settembre lo contava due volte —
  le righe di agosto in scadenza il 20 **più** la stima.
- **I compensi dei mesi futuri si stimano dal contratto**, con lo stesso
  `computeMonth`: dal primo mese non registrato in poi sparivano, e sono la
  seconda uscita del mese.
- **Una sola voce è spostabile: i compensi** (§237). L'IVA ha una data, i
  fornitori pure, gli stipendi sono un patto — e il modello lo dice invece di
  lasciar credere che tutto sia comprimibile.
- **Il primo consiglio è il verdetto**, coi tre esiti: un saldo positivo non
  dice su cosa poggia. Agosto 2026 chiude a **+306 €** ma solo perché rientrano
  **12.688 €** di crediti scaduti — «regge» e «chiude solo se rientrano gli
  arretrati» sono due situazioni che vogliono due azioni diverse.

- **L'appartenenza è quella del conto economico** (§264): una riga di agosto è
  di agosto, **pagata o no**, e i totali «di competenza» combaciano riga per
  riga con quella pagina — su agosto 2026: 7 righe di entrata per 24.064,50 € e
  21 di uscita per 16.334,13 €, identiche. La cassa è l'altro numero e non ci
  somiglia: comprende gli arretrati di luglio e **non** comprende le
  retribuzioni di agosto, che escono il 20 settembre. Ogni riga dichiara quale
  delle due cose è («di questo mese, esce settembre» · «matura 2026-07, si
  muove adesso»). IVA e compensi non sono righe di conto economico: escono dal
  conto ma restano fuori dal totale che deve combaciare.
- **L'elenco è quello che resta da fare** (§266): di default si vedono solo le
  voci che devono ancora muoversi in questo mese, **ritardi compresi**. Le altre
  — già in banca, o in scadenza il mese prossimo — stanno dietro una riga che
  dice quante sono e perché. I totali non si alleggeriscono mai: quello di
  competenza deve continuare a confermare il conto economico.
- **Il riscontro con la banca sta dentro la sezione** (§265). Erano due blocchi
  a parte — quattro tile e la tabella «E in banca» — che calcolavano il saldo
  sulla sola finestra del prospetto: dicevano «saldo a inizio mese **0 €**» e
  «sul conto adesso **10.568 €**» mentre in banca ce n'erano 30.876. Due numeri
  con lo stesso nome sono peggio di un numero solo, quindi sono stati tolti e il
  loro contenuto utile — entrato/uscito davvero e la differenza con quello che
  le spunte dicono — vive dove c'è il saldo vero, col link al ponte (§199).

- **Quello che si è già mosso ha una data, e quella data è il suo mese** (§267).
  Lo spostamento sul primo mese della catena vale **solo per gli scoperti**:
  applicarlo anche ai fatti chiusi trascinava dentro agosto ogni incasso di
  maggio e giugno — venticinque righe da «già nel saldo» che nessuno doveva più
  guardare. E quello che è già nel saldo **non si mostra**: è un fatto chiuso,
  non si può spegnere, e resta solo nei totali.

**Il report per il consiglio** (§268, `/api/prospetto?m=<mese>`,
`lib/prospetto-report.ts`). Una riunione di soci non si fa scorrendo una pagina
web: si fa su un foglio che si stampa, si allega a un verbale e si rilegge fra
sei mesi. HTML autonomo A4 col pulsante che apre la stampa del browser, come
`kpi-report`: il PDF lo fa il browser, e il documento è identico su ogni
macchina senza portarsi dietro un motore di stampa.

- **Risponde in ordine alle domande che vengono fatte**, non elenca quello che
  il tool sa: il verdetto in una frase · il mese ha prodotto margine
  (competenza) · da dove vengono e dove vanno i soldi · cosa deve ancora
  succedere (cassa) · le leve · come prosegue il conto.
- **Due pagine, e la divisione non è tipografica** (§269). La prima è quella che
  si proietta: sette numeri e tre frasi. La seconda si allega al verbale e si
  rilegge quando qualcuno chiede «e questi 5.772 da dove vengono» — ogni riga di
  entrata e di uscita col suo imponibile, la sua IVA, la sua scadenza e il suo
  stato. Metterle insieme voleva dire perdere la prima; toglierne una, non poter
  rispondere alla domanda che arriva sempre.
- **I compensi hanno una sezione loro, con due colonne che non si sommano**
  (§270): il **maturato** — quello che spetta per il lavoro consegnato — e
  quanto di quel maturato l'**incassato** copre davvero (`computeMonth` sulle
  sole righe spuntate, §232). Un socio che è anche commerciale compare **una
  volta sola** (`mergePeople`, §226): «Walter» in `pl_partners` e «Walter
  Giacobbe» in anagrafica erano due righe con lo stesso destinatario, e chi le
  legge cerca due bonifici che non esistono.
- **§274/§275 — l'erogato si emette sull'incassato, e «incassato» ha una sola
  definizione.** La sezione compensi mostra **solo** quello che si eroga: niente
  colonna del maturato e niente scoperto, che sul foglio di chi deve bonificare
  sono rumore. La base è **quello che si è mosso nel mese prima** — `movedIn`
  (§224), gli incassi *di* luglio di qualunque fattura — non «le righe di luglio
  che risultano pagate»: sono due insiemi diversi e davano 3.595,94 € a socio
  contro i **3.530,94** che la pagina Ripartizione mostra a schermo. Due numeri
  diversi sullo stesso compenso sono il modo più veloce per non fidarsi di
  nessuno dei due. Su luglio: 24.100 € rientrati → erogato 860 + digital
  2.610,94 + 60 da lead generation = 3.530,94 a socio, provvigioni 1.143 e
  589,67, **totale da erogare 12.325,49 €**. Chi non ha visto rientrare le sue
  fatture resta in tabella con scritto perché, invece di sparire.
- **I compensi che escono in un mese sono maturati in quello prima** (§271),
  come il costo del lavoro (§224): il foglio calcolava il maturato di agosto e
  lo intitolava «compensi di agosto», mentre la sezione di cassa contava —
  giustamente — quelli di luglio. **Due numeri con lo stesso nome nello stesso
  documento**, che in riunione diventano una discussione su chi ha ragione. Ora
  la tabella guarda il mese prima e lo dice nel titolo; e siccome le righe
  preparate portano l'importo copiato quando il mese è stato preparato (§243),
  la differenza col ricalcolo è **scritta** invece di far tornare i conti a
  mano: maturato a luglio 18.947,51 €, in uscita ad agosto 14.844,41 €.
- **Dove il mese di competenza non è quello di cassa, il foglio lo scrive**:
  «Persone · maturate a luglio 2026», «Compensi · maturati a luglio 2026», e su
  ogni subappalto «si paga quando incassiamo dal cliente» (§224, `a_incasso`) —
  altrimenti quella scadenza sembra arbitraria e quei totali sembrano contati
  due volte.
- **§273 — la tabella delle Uscite elenca quello che il mese paga.** Le
  retribuzioni di agosto sono competenza di agosto e cassa di settembre:
  elencarle lì, con scadenza 20 settembre, faceva leggere come «uscite di
  agosto» dei soldi che ad agosto non escono. Al loro posto ci sono le buste di
  **luglio** — 6.698 €, in scadenza il 20 — e ogni riga dice di che mese è. Il
  legame col conto economico non si perde, si **scrive**: `13.570,73 − 6.698,00
  + 8.191,51 = 15.064,24`, che è il costo di agosto.
- **§272 — una copia mutilata delle righe dà numeri plausibili e sbagliati.**
  `loadProspetto` restituiva le righe **senza `project_value`**, che è il valore
  venduto del lavoro e decide se il fondo rischio digital è disponibile (§186:
  sopra i 20.000 € ciascun socio scende dal 28% al 25%). Senza, nessuna riga
  risultava eleggibile e il report dava **4.340,78 € a socio invece di
  4.045,94** — un numero credibile, che nessuno avrebbe controllato. Le righe
  escono anche col **commerciale dell'anagrafica** (`client_sales_owner`), o
  `ownerOf` le legge come inbound e divide ogni provvigione fra i soci. Il
  riscontro è `npx tsx scripts/verify-month.ts <mese>`: se il report non dice i
  suoi stessi numeri, è il report a sbagliare.
- **Competenza e cassa stanno scritte**, non sottintese: è il punto in cui ogni
  consiglio si perde, e un numero di cui nessuno sa la provenienza diventa una
  discussione su chi ha ragione. Il primo blocco è imponibile, il terzo è lordo,
  e ognuno lo dichiara.
- **Il caricamento è uno solo** (`lib/prospetto-load.ts`): pagina e report
  leggono gli stessi numeri, o la riunione si apre con due fogli che non tornano.
- `npx tsx scripts/report-prospetto.ts <mese> [file.html]` lo genera su file:
  serve a **guardarlo** senza autenticarsi, perché una colonna che va a capo o
  un numero vuoto si notano sul foglio, non compilando.

Gate: `npx tsx lib/cash-plan.check.ts` (57 controlli) ·
`npx tsx scripts/verify-plan.ts <mese>` stampa il piano dal database e
**confronta le voci del mese col conto economico**, riga per riga.

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

**Una pagina lunga si usa se si sa dove sono le cose** (§237, `PlNav` in
`PlClient`). Il conto economico è dodici sezioni in fila: per arrivare alle
uscite si scorreva mezzo schermo tre volte, e per tornare al numero appena letto
altrettanto. La barra in cima è appiccicata e fa due cose diverse:

- **dove vado** — un salto per sezione **col numero di quella sezione accanto**,
  nell'ordine in cui la pagina scorre. Così non è solo navigazione: è già un
  riassunto, e spesso la risposta è lì senza scendere. Una barra che elenca in un
  ordine e una pagina che scorre in un altro fa cercare due volte la stessa cosa.
- **cosa devo fare** — «N da fare»: clienti fuori dal mese, righe che non dicono
  più quello che dice il contratto, arretrati scaduti, effettivi a zero, spunte
  che nessun movimento conferma, compensi da erogare, mesi futuri in cui esce più
  di quanto entra. Non duplica i pannelli: **porta** al pannello dove sta la
  leva, perché una leva lontana dal suo risultato non la usa nessuno.

E in testata restano le azioni di tutti i giorni: «Copia dal mese scorso» e
«Svuota mese» sono in un menu, perché erano grandi quanto «Chiudi mese» e quattro
pulsanti che competono si leggono tutti, ogni volta. La conferma a due passi
dello svuotamento è dentro il menu, non è sparita.

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

**Competenza e cassa sono due mesi diversi** (§224, `lib/cash-calendar.ts`, migration
203). Il conto economico sapeva **in che mese il lavoro è stato fatto**. Non sapeva
**quando i soldi si muovono**, e sono due domande: lo stipendio di luglio esce il
20 agosto, il subappalto si paga quando ha pagato il cliente, una fattura emessa il
1° vale quindici giorni. Con una sola spunta booleana la cassa di un mese conteneva
le sole righe di quel mese: agosto non vedeva un euro dello stipendio che stava
pagando, e luglio se lo teneva come se fosse uscito lì.

Tre colonne su `pl_revenue_lines` e `pl_cost_lines`, e nessuna è l'altra:
`terms` (l'accordo; NULL = lo decide la **natura** della voce) · `due_date` (la
scadenza scritta a mano, un'eccezione che vince sulla regola) · `paid_on` (quando i
soldi si sono mossi — **l'unico che fa cassa**, e lo riempie un trigger con la data
di oggi quando si spunta). Le regole stanno **solo** in `lib/cash-calendar.ts`,
mai in SQL: due copie e la seconda dimentica sempre un caso. Tre eccezioni alla
regola «entro il mese», e nessuna è un'opzione — costo del lavoro `mese_succ_20`,
subappalto `a_incasso`, entrata `giorni_15` (§177).

- **La cassa di un mese sono i fatti di quel mese**, di qualunque competenza
  (`movedIn`). Non ci si mette dentro niente di atteso: un totale che mescola quello
  che è successo con quello che dovrebbe succedere non risponde a nessuna delle due
  domande. Il selettore si chiama **Competenza / Cassa** e dichiara cosa entra e
  cosa esce prima che uno prema.
- **I compensi seguono la lettura.** In competenza sono quelli maturati — chi ha
  lavorato ha lavorato; in cassa sono quelli che il denaro passato copre davvero,
  che è la domanda a cui si risponde quando si decide quanto versare. Il maturato
  resta scritto accanto: un commerciale il cui cliente non ha pagato mostra **zero
  su X maturati**, non sparisce. (Supera §204, che li teneva fermi al maturato.)
- **Quello che non si è mosso si trascina** (`openAt`), e va visto **dove si
  spunta**: il blocco «Da mesi precedenti» sta dentro Entrate e Uscite, non in un
  riquadro altrove — una leva lontana dal suo risultato non la usa nessuno.
  Spuntare un arretrato registra **la data di oggi** e non riapre il suo mese, nemmeno
  se è chiuso: il movimento è un fatto di adesso. E la contropartita ha una riga
  anche lei — «passati in questo mese» — o la cassa avrebbe un numero senza niente
  dietro.
- **Il ritardo si legge, non si conta a mente**: bande a 15 e 45 giorni (`LATE_BANDS`),
  colore *e* parola («in ritardo di 3 giorni» e «di 54» sono due fatti diversi, un
  rosso solo li appiattisce). La riga in ritardo è **tinta**, e il pallino sta accanto
  al nome, dove l'occhio scorre. Oltre i 45 giorni non è un ritardo: è un credito da
  recuperare, e `diagnose` lo dice fra i problemi del mese.
- **In scadenza non è in ritardo**: lo stipendio di luglio, ad agosto, è il
  pagamento di agosto. Colorarlo di rosso insegnerebbe a ignorare il rosso.
- **Backfill dichiarato**: le righe già spuntate non avevano una data, e la 203
  assume **la scadenza**. Sposta l'attribuzione di cassa dei mesi già registrati, ed
  è quello che deve succedere. Senza la 203 l'app non si rompe: le colonne mancano,
  ogni riga resta nel suo mese (`assumed`) e la pagina lo dichiara invece di
  spostare numeri su una data che non esiste.

**Chi legge il calendario**: il conto economico (righe, arretrati, ripartizione),
la scorecard «Uscita di cassa» del Personale, il **previsionale** — che adesso ha
una colonna `Cassa` accanto a `Margine`, perché un canone di giugno pagato a 30
giorni è margine di giugno e soldi di luglio — e la **curva della Banca**, dove le
scadenze attese non sono più tutte datate al primo del mese. Manca la
Fatturazione. Chi aggiunge una lettura chiama `dueOf`, non riscrive la regola.

**La finestra dell'erogazione** (§286, `lib/payout-window.ts`, migration 212).
I compensi si erogano **il 20 del mese**, e quello che si distribuisce è quello
che è **maturato nel mese prima** e **rientrato entro il giorno in cui si
eroga**. Ad agosto 2026 l'erogazione è stata anticipata al 13, e la base sono
state le otto righe di luglio incassate entro quella data — comprese le quattro
arrivate a inizio agosto, che il giorno in cui luglio si è chiuso non c'erano.

Le due regole che questa supera dicevano ciascuna metà della cosa. Il
**maturato** (§227) distribuisce tutto quello che il mese ha prodotto, incassato
o no: è il numero giusto per «quanto spetta» ed è sbagliato per «quanto
bonifico». La **cassa del mese** (`movedIn`, §224/§275) prende gli incassi *di*
un mese di qualunque competenza: ci trascina dentro le fatture di maggio
rientrate a luglio — già erogate — e ne lascia fuori quelle di luglio rientrate
il 3 agosto, che sono esattamente quelle per cui si sta pagando.

- **Competenza fino al mese che si eroga, cassa fra un'erogazione e la
  successiva.** Da lì due proprietà: **niente si perde** — una fattura di luglio
  incassata il 25 agosto entra nell'erogazione dopo, perché quella finestra
  parte da dove è finita questa — e **niente si conta due volte**, perché il
  limite inferiore è esclusivo e coincide col superiore della precedente. La
  somma delle finestre è la somma degli incassi.
- **La data è un dato** (`pl_months.payout_date`, default `pl_config.payout_day`
  = 20). Un'eccezione senza un posto dove scriverla diventa un totale che
  nessuno sa più ricostruire, e soprattutto la finestra del mese dopo non sa da
  dove ripartire. Si cambia dalla sezione Compensi, e cambiarla **ricalcola**:
  le righe già pagate restano dove sono, quel bonifico è un fatto.
- **Il consolidato chiude la coda** (§230): prima di `settled_from` i conti sono
  liquidati e non si ripesca una fattura di aprile perché è rientrata adesso.
- **La sezione dichiara la finestra prima dei numeri**: quanto è nella finestra,
  quanto non è ancora rientrato («si eroga quando rientra», non sparisce), quanto
  è rientrato dopo («nella prossima»), e quante spunte sono senza data (§203:
  assunte dentro, e lo si scrive). «Genera i compensi» su una base che nessuno
  vede è il modo in cui si firma un bonifico sbagliato.
- **Non segue il selettore della pagina.** §210 dice che la lettura
  maturato/incassato governa ogni totale, e resta vero per «com'è andato il
  mese». «Quanto bonifico» ha **una** risposta, e un selettore lì farebbe
  scegliere fra due numeri entrambi presentati come il compenso.
- Lo leggono `materializePayouts`, la sezione Compensi, il report per il board
  (§274/§275) e la stima di cassa dei compensi futuri (`erogabileOf` in
  `prospetto-load`): la cassa deve aspettarsi quello che uscirà davvero, o
  promette un bonifico che non si farà proprio nei mesi in cui i clienti sono in
  ritardo. Per un mese mai aperto non ci sono spunte da guardare e il ripiego
  resta il maturato.
- **La provvigione condivisa non si scrive qui**: quando due persone si dividono
  una provvigione (Seven, 50/50 fra Marco e Toto) è un accordo fra loro, fuori
  dal tool. Il tool la attribuisce intera al commerciale del cliente, che è
  quello che l'anagrafica dice ed è l'unico dato che può verificare.

Gate: `npx tsx lib/payout-window.check.ts` (53 controlli, col caso vero di luglio
2026) · `npx tsx scripts/verify-payout.ts <mese> [--date <giorno>]` legge
l'erogazione dal database, dice riga per riga cosa entra e perché, e la
**riconcilia** con l'estratto conto e con l'archivio fatture.

**Tenuta di cassa** (§225, `lib/cash-runway.ts`, in cima al conto economico). Il
margine e i soldi sul conto sono due domande: il primo è **imponibile e di
competenza**, i secondi sono **lordi e con una data**. Un mese può chiudere in
utile e lasciarti a secco il 20. La sezione mette i due mondi nella stessa
schermata, e sono **scenari, non una previsione**: lo stesso saldo con dentro
cose diverse. Ognuno dichiara il suo delta, perché un numero solo non si
controlla.

**La scala ha due metà, e non sono simmetriche** (§233). Prima tutto quello che
esce comunque — uscite scoperte, IVA, compensi maturati — e sotto quello che
*potrebbe* entrare. Le uscite sono certe, gli incassi no, e mescolarli in
un'unica sequenza faceva sembrare un fatto una speranza. Da qui i **tre esiti**
in testa, che sono la sola cosa che si guarda per prima:

- **Se non incassi niente** (`floor`) — dopo uscite, IVA e compensi. È l'unico
  numero che dipende da te, e prima stava in fondo alla lista indistinguibile
  dagli altri.
- **Se pagano i puntuali** (`expected`) — le fatture ancora nei termini. Chi
  paga di solito paga: è la parte credibile.
- **Se rientrano gli arretrati** (`best`) — quelli scaduti, col ritardo del più
  vecchio scritto accanto. Non arrivano da soli: è una telefonata, non una
  previsione, e sommarli agli altri incassi li prometteva uguali.

Il verdetto ne discende, e distingue tre modi di essere in bilico: `negativo`
(non ci arrivi nemmeno incassando tutto) · `stretto` con `expected ≥ 0` (dipendi
dai clienti) · `stretto` con `expected < 0` (**dipendi da chi non ti ha
pagato**, che è un'altra cosa e vuole un'altra azione) · `regge`.

- **L'IVA è la leva, e va detta.** L'IVA che i clienti pagano entra in banca e
  finanzia fornitori e stipendi fino alla liquidazione: è legittimo e lo fanno
  tutti, ma non è capitale — è un debito con una data. `vatHeld` non è una nota a
  piè di pagina: è la quota del saldo che non è tua, e l'ultimo scenario è l'unico
  che dice se il mese regge davvero. Un'azienda in utile che resta senza soldi ha
  quasi sempre contato l'IVA due volte, una come cassa e una come margine.
- **I compensi sono l'ultimo gradino e l'unico con un interruttore** (§237).
  L'IVA ha una data, le fatture dei fornitori pure; i compensi no — «la
  decisione è quando, non se». Il tasto sta **sulla riga**, dove il numero
  cambia, e i tre esiti si spostano insieme: la domanda che si fa ogni mese è
  *quanto respiro dà rimandarli*, e senza il secondo numero quel respiro te lo
  calcoli a mente. Spenti, la riga scrive che restano da erogare: si spostano,
  non si tolgono. Con niente da erogare l'interruttore non c'è — uno che non
  cambia niente è peggio di uno assente.
- **L'IVA dichiara se scade in questo mese** (§233, `vatDueInMonth`). Si toglie
  sempre — non sono soldi tuoi nemmeno il giorno prima — ma ad agosto è un
  bonifico da fare il 20 e a settembre è un fondo da non toccare, e chiamarli
  con lo stesso nome fa preparare il bonifico sbagliato.
- **Il saldo è quello vero** — solo movimenti `banca` (§189). Contare i
  `derivato` farebbe quadrare la tenuta di cassa grazie alle spunte che la
  tenuta di cassa serve a verificare.
- **Il rotolo dei mesi** dice *quando* si rompe, non *se*: mesi già aperti →
  righe registrate; mesi chiusi → contratti e piano (sommarli entrambi
  conterebbe due volte lo stesso canone). Gli scoperti scaduti pesano sul
  **primo** mese: nella curva servono lì, non nel mese in cui erano attesi.
- **Una stima si dichiara sulla riga.** Il piano dei costi non contiene l'area
  Personale (§184: la scrive l'organico), quindi ogni mese futuro sembrerebbe
  costare novemila euro in meno. `payroll` la stima uguale a questo mese e la
  riga scrive «di cui X stimati» — e **solo** dai mesi che seguono uno non
  aperto, perché il costo del lavoro di un mese esce in quello dopo e dove le
  righe ci sono è già contato.
- **Il maturato si conta su tutti i mesi** (§233), non sulle righe che il mese
  guardato si trascina: un bonifico non sa di che mese è, e prendere i soli
  arretrati di cassa dava allo stesso registro 18.749 € su luglio e 25.557 € su
  agosto. `npx tsx scripts/verify-cash.ts <mese>` legge la sezione dal database
  e la stampa: gradini, esiti e registro dei compensi persona per persona.
- **«Mai un bonifico» guarda tutti i movimenti, non la finestra** (§233). Col
  consolidato a luglio i bonifici di giugno restano fuori dal conteggio, e
  `paid === 0` marcava «mai pagato» anche Marco, che ne ha ricevuti 6.165 € —
  quelli hanno chiuso i mesi prima della linea, ed è la ragione per cui la
  finestra esiste (§228). La stessa frase detta a due situazioni opposte è
  peggio di nessuna frase.

**Una persona costa dal mese in cui è entrata** (§233, `inForce` in
`lib/payroll.ts`). «Porta nel conto economico» scriveva l'organico di **oggi**
in qualunque mese si stesse preparando: maggio 2026 si è ritrovato il costo di
chi è arrivato a giugno, e quelle righe non restano ferme lì — sono scoperte, si
trascinano fra gli arretrati e la tenuta di cassa le conta come uscite da fare.

- **L'organico è uno solo e vale per tutti i mesi.** In quali mesi una persona
  pesa lo dice `hired_on` (con `end_date` dall'altro capo); il pagamento è il 20
  del mese dopo e discende dalla natura della voce (`mese_succ_20`), non si
  configura. L'unico modo che restava per togliere qualcuno da **un** mese era
  eliminarlo dall'organico — che lo toglie da tutti e si porta via cedolini e
  fatture col CASCADE. È successo davvero, il 9 agosto 2026:
  `supabase/RESTORE_HR_PEOPLE.sql` è il ripristino.
- **La riga resta visibile e lo dice**: chi non era ancora in forza compare in
  organico con «entra a giugno», fuori dai totali del mese. Una persona che
  sparisce dall'elenco è una persona che qualcuno riaggiunge.
- **Il confronto è fra mesi, non fra giorni**: chi entra il 20 costa quel mese,
  perché il cedolino di quel mese esiste. Senza data di assunzione si è in
  forza: l'assenza di un dato non è una data, e togliere un costo vero è peggio
  che tenerne uno da correggere. Nel consuntivo (`pushLedgerToProfitLoss`) il
  **documento batte l'anagrafica** (§182): se per quel mese c'è un cedolino o
  una fattura, la persona ha lavorato e la data sbagliata è l'altra.

**L'estratto conto certifica le spunte** (§226, `lib/cash-certify.ts`,
`scripts/certify-cash.ts`). Una spunta «pagato» è un'**opinione** finché un
movimento non la conferma, e per mesi le due cose si sono lette identiche. Sul
database vero, all'8 agosto: 24 righe certificate dalla banca e **58 dichiarate
per 70.835 €** che nessun movimento dimostra. Quattro stati, e la differenza fra
il secondo e il terzo è tutto il punto:

- **certificata** — movimento agganciato, data che combacia.
- **da datare** — il movimento c'è, la data no. Si corregge da sé, perché il
  giorno lo dice l'estratto conto e non chi ha spuntato. Ne sono state corrette
  **21**, con uno scarto medio di 13 giorni: iCura di maggio risultava incassata
  il 15 maggio e la banca dice **9 giugno**, Affinity di giugno il 15 giugno e la
  banca dice **6 agosto**. Quattro cambiavano mese di cassa.
- **dichiarata** — spuntata, nessun movimento la conferma. **Non si sbianchetta
  mai**: l'assenza di prova non è prova dell'assenza — può essere un conto non
  caricato o del contante — e cancellare l'incasso di un cliente che ha pagato
  davvero è un danno peggiore del dubbio. Si marca e si conta.
- **sospetta** — agganciata a un movimento **precedente al suo mese**. La rata
  di luglio di Josè era attaccata a un bonifico del 15 maggio: prendere quella
  data avrebbe peggiorato il dato invece di certificarlo. Si segnala, non si tocca.

Solo i movimenti `banca` certificano: un `derivato` nasce dalla spunta che si sta
verificando, e usarlo sarebbe far confermare a un'affermazione se stessa.

**L'erogato esiste solo in banca** (§226, `payoutsFromBank`). Il piano dice
quanto **spetta**; nessuna riga dice quanto è **uscito** — l'erogato non si
scrive, si ricalcola — e finché il confronto non c'è, un socio pagato per intero
e uno che non ha mai preso un euro si leggono uguali. Sul conto vero: Marco
6.165 · Toto 6.030 · Walter 8.990 · **Antonio Giarletta zero**, con provvigioni
maturate da mesi. Il pannello «Uscito davvero» sta nel conto economico, sotto i
compensi. Tre regole:

- **Il maturato si somma su tutti i mesi**, perché un bonifico non sa di che mese
  è: confrontarlo con un mese solo darebbe a chiunque uno scoperto o un anticipo
  enormi, e nessuno dei due vero.
- **Un socio che è anche commerciale è una persona sola** (`mergePeople`):
  erogato e provvigione arrivano sullo stesso conto. Tenerli separati spezzava
  il dovuto in due voci e non trovava nessuno dei due bonifici, perché due nomi
  corrispondevano allo stesso movimento e l'abbinamento si rifiutava
  (giustamente) di indovinare.
- **Il nome non basta: decide la classificazione.** Alla stessa persona si
  bonifica per ragioni diverse — a Walter sono usciti 3.000 € che pagano una
  fattura di GAV Sistemi, giro fra società collegate fuori dalle statistiche, e
  contarli come compenso gli avrebbe chiuso uno scoperto che invece esiste. Un
  compenso è un `finanziamento`; un movimento già agganciato a una riga è il
  pagamento di quella riga. Se una è classificata male si corregge la categoria
  in Banca (§189), non si aggiunge un'eccezione nel codice.

**I compensi non sono righe di costo, e per questo mancavano** (§227,
`lib/cash-runway.ts` + `payoutSchedule`, migration 204). La tenuta di cassa
diceva «resta un margine di 15.205 €» a un mese che doveva ancora erogare
**22.237 €** ai soci e ai commerciali: «se paghi tutto» pagava fornitori,
stipendi e subappalti e non chi aveva lavorato. Il motivo è strutturale — i
compensi non si scrivono da nessuna parte, si ricalcolano — quindi nessun costo
li conteneva e nessuno se ne accorgeva.

- **Un quinto gradino**, dopo l'IVA: «e poi eroghi i compensi maturati». Il
  verdetto lo guarda, ma quando è **solo** quello a far cadere il conto lo dice
  in chiaro — «regge fino all'IVA, sono i compensi a portarlo sotto» — perché
  un «negativo» secco farebbe cercare un problema che non c'è. E dichiara la
  differenza con l'IVA: i compensi **non hanno una scadenza**, la scelta è
  quando, non se.
- **Escono nel mese dopo** quello in cui maturano, come il costo del lavoro:
  il conto economico non può dire che il compenso di luglio è in ritardo il 2
  luglio. Nel rotolo dei mesi ogni quota cade dove è attesa, non tutta sul primo.
- **I bonifici si imputano dal più vecchio** (FIFO): un pagamento chiude
  l'arretrato più antico, che è l'unico ordine che una persona userebbe e
  l'unico che fa emergere un debito che si trascina.
- **Da quando si conta è una decisione, non un'inferenza** (`pl_config.payout_from`,
  default 2026-07-01: fino a giugno è tutto liquidato). Dedurlo dai mesi chiusi
  sembrava elegante e non lo era: il giorno in cui si è chiuso luglio la linea
  si è spostata da sola ad agosto e i compensi di luglio sono spariti dal
  registro senza che nessuno lo avesse deciso. **Una regola che cambia
  significato per un gesto che parla d'altro è peggio di nessuna regola.**
  `null` = si conta da sempre, come prima della 204.
- **§230 — la linea è una sola e vale per tutto** (`pl_config.settled_from`).
  Non riguarda solo i compensi: prima di luglio 2026 le **spunte** che nessun
  movimento certifica non sono lavoro arretrato (58 righe per 70.835 €, che
  segnalate per sempre insegnano solo a ignorare le segnalazioni) e l'**organico**
  di maggio-giugno contiene persone che allora non erano in forza, perché quei
  mesi sono stati preparati con l'organico di oggi. `certify` le marca
  `consolidata`: niente glifo, niente conteggio, e la testata scrive «mese
  consolidato». Dopo la linea si verifica come sempre — il consolidato è una
  data, non un interruttore che spegne i controlli.
- **§228 — la liquidazione è un fatto per persona, non una data per tutti**
  (`payoutLedger`). La linea vale per chi è stato pagato: i tre soci hanno
  bonifici fino a giugno, quindi da luglio ripartono da zero. **Antonio
  Giarletta non ha mai ricevuto un bonifico**, e a chi non ha mai preso niente
  non si può dire che fino a giugno è a posto: per lui si conta da sempre —
  1.860 € invece di 645 — e la riga scrive perché. La regola sbaglia in una
  direzione sola, ed è quella giusta: a chi è stato pagato in contanti mostra
  uno scoperto che non ha, che è un allarme falso e non una rassicurazione
  falsa, e si spegne registrando il movimento.

**La cassa è un sottoinsieme, e deve comportarsi come tale** (§232). Su luglio
l'erogato ai soci risultava **più alto** in cassa che in competenza — 4.588
contro 4.234 — il che è impossibile. Il filtro «mosso in questo mese» si
applicava a **tutte e due le gambe** del margine digital: entravano quattro rate
incassate e due soli subappalti su quattro, perché gli altri due non erano
ancora usciti. Il margine saliva da 10.944 a 12.566 e la quota del 28% con lui.

Ma il margine digital è un rapporto fra il ricavo di un progetto e i subappalti
**di quel progetto e di quel mese** (§208): filtrarne una gamba sola lo rompe.
Si incassa la rata a luglio, si paga il fornitore ad agosto, e a luglio si
distribuirebbe una quota calcolata sul ricavo lordo — soldi che sono già di
qualcun altro. Perciò `computeMonth` prende un quinto parametro, `marginCosts`:
in cassa i subappalti restano quelli **di competenza** delle righe che si stanno
contando. Cambia chi ha pagato, non quanto vale il lavoro. Il gate lo blocca con
il caso vero: cassa ≤ competenza, sempre.

**Un numero si scrive in un modo solo** (§231, `lib/money.ts`). L'helper `eur`
esisteva in **nove copie**, e ognuna sbagliava a modo suo: chi metteva l'euro
davanti (`€2.673`) e chi dietro, chi raggruppava le migliaia e chi no. Il
motivo non era distrazione: l'italiano di CLDR ha `minimumGroupingDigits: 2` e
**non raggruppa i numeri di quattro cifre**, quindi 2673 restava «2673» accanto
a «12.673» nella stessa colonna. Adesso c'è un modulo solo, il punto si mette a
mano — `Intl` dipende dai dati ICU con cui è compilato Node, e un motore puro
che scrive un messaggio diverso fra il gate e la pagina non è verificabile — e
l'euro sta sempre dopo.

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

**Due trimestri, due domande** (§238). «Quanto sta maturando il trimestre di
questo mese» e «quanto esce alla prossima scadenza» non sono la stessa cosa: ad
agosto 2026 sono il 3º (9.250 €, 16 novembre) e il 2º (8.400 €, 20 agosto). Il
riquadro IVA mostrava il primo col titolo «IVA da mettere da parte» e la Tenuta
di cassa toglieva il secondo, mezzo schermo più su: due numeri diversi sotto la
stessa parola, e non si crede più a nessuno dei due. Adesso il riquadro li porta
entrambi con un selettore, si apre sulla **scadenza** — la domanda di cassa, la
stessa della sezione sopra — e scrive perché sono diversi. La diagnosi e la barra
in cima leggono la scadenza.

**Il modello F24 batte la stima** (§242, `vat_settlements`, migration 206).
`lib/vat.ts` stima l'IVA dalle righe registrate — debito meno credito, più l'1%
dell'opzione trimestrale — ed è la stima giusta per sapere quanto mettere da
parte. Sarà **sempre** diversa dal modello: il registro IVA del commercialista
contiene fatture che il conto economico non ha ancora. Sul 2º trimestre 2026 il
tool dice 8.399,87 e il modello del 20 agosto chiede **9.669,33** (cod. 6032).

- **Quando il documento arriva, vince il documento**, come per i cedolini (§182).
- **La differenza resta scritta**, e non è rumore: il 22% dei ricavi registrati è
  un numero esatto (9.108,00 di debito), quindi lo scarto di 1.269,46 è
  **fatturato del trimestre che il conto economico non ha**. È l'unico posto in
  cui quel buco si vede senza andarlo a cercare.
- **Il riporto al trimestre dopo nasce dal saldo calcolato**: sostituirlo con un
  numero che il modello non contiene sposterebbe l'errore avanti invece di
  mostrarlo. Debito, credito e riporto restano quelli del motore; cambia solo
  quello che si versa.
- Lo leggono **tutte e due** le sezioni — Fiscale e il conto economico — o
  tornerebbero a dire due numeri diversi con lo stesso nome (§238). Nello stesso
  F24 ci sono anche ritenute, crediti e INPS: quelli sono costo del lavoro e
  stanno in `hr_f24`, non qui. Sommarli farebbe costare diecimila euro un mese di
  stipendi.

**Il fatturato nel tempo** (§278, `billingSeries` in `lib/invoices.ts`,
`components/charts/BillingChart.tsx`, in cima a Fatturazione). Emesso, rientrato,
in attesa e previsionale erano quattro numeri in quattro riquadri, e la domanda
«come andiamo» bisognava comporla a mente. Una forma sola, due letture — barre
per «quanto in ciascun mese», linea per «come si sta muovendo» — e il selettore
cambia la **forma, mai i numeri**: un grafico che cambia i totali quando cambi
vista è un grafico di cui non ci si fida più.

- **La barra è una divisa in parti**, non tre barre da sommare: pieno =
  rientrato, smorzato = credito aperto, grigio = stornato. Stessa convenzione
  delle altre barre dell'economics.
- **§279 — una nota di credito non è credito in attesa.** Scalava l'emesso —
  giusto in dichiarazione — ma produceva un «in attesa» negativo: una fattura
  stornata non è un incasso che deve ancora arrivare, è un incasso che **non
  arriverà mai**, e le due cose chiedono due azioni diverse (telefonare, o non
  fare niente). `credited` è una grandezza sua e `pending` non scende mai sotto
  zero. Sui dati veri: 98.550 € emessi lordi, di cui **10.500 stornati**
  (7.200 a maggio, 3.300 ad agosto).
- **§280 — nel grafico stanno solo tre cose: netto, rientrato, in attesa.**
  L'altezza della barra è il **fatturato netto**, e lo stornato non è una terza
  parte — disegnarlo alzerebbe una barra che il fatturato non ha. Resta scritto
  nel riquadro del mese, dove spiega perché il netto è più basso dell'emesso.
- **§281 — una fattura può non essere né incassata né da incassare**
  (`invoices.excluded_reason`, migration **210**). L'archivio conosceva due
  stati; sui dati veri ne servivano tre, e il terzo vale **nove documenti su
  trentanove**: le ISF duplicate con le loro note di credito, la Gli Artigiani
  stornata, la Tailors emessa due volte. Non sono crediti — nessuno telefonerà
  mai per averli — e fra gli «in attesa» gonfiavano lo scaduto. Non si
  cancellano: esistono, sono passate dallo SDI. Si dichiarano fuori **col
  perché accanto**, perché un'esclusione senza ragione fra sei mesi non si
  distingue da una dimenticanza — per questo la colonna è di testo e non un
  booleano. Escono dal netto e dall'atteso come le note di credito; restano nel
  conteggio dei documenti, che è un'altra domanda. Lo stato vero dell'archivio
  lo scrive `supabase/FIX_INVOICES_STATE.sql`, e **le date vengono
  dall'estratto conto**: dove il movimento non è unico la fattura resta in
  attesa, che è meglio di una data inventata.
- **Sotto il grafico, le fatture che devono rientrare** (§280,
  `PendingInvoices`): un totale non si insegue, si insegue una fattura con un
  nome. In ordine di **ritardo** — 14 aperte per 47.732,50 €, la più vecchia da
  86 giorni — e con le due strade che sono due fatti diversi: **il movimento
  c'è già** (candidati da `txCandidates`, un clic e la data è quella del
  movimento) oppure **deve ancora arrivare**, e allora l'unica cosa vera da
  scrivere è **quando** (`setInvoiceDue`). Senza una data una fattura non è né
  scaduta né attesa: sparisce dalle telefonate da fare. La terza strada —
  «segnala incassata» — resta per il contante, e dichiara di essere una spunta
  che nessun movimento dimostra (§226).
- **Il previsionale ha un'altra forma**, tratteggiata, e viene dai contratti
  firmati (`linesForMonth`, §176): 76.850 € da settembre a dicembre. Disegnarlo
  pieno accanto allo storico lo farebbe leggere come un fatto.
- **Il pallino porta il numero**: il riquadro sul mese dà i quattro valori e la
  quota rientrata, e l'asse resta pulito. Dal grafico si prende la direzione,
  dal numero la decisione.

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

**L'F24 non si ripartisce, ma può confermare una ripartizione** (§235,
`splitEmployer` in `lib/payroll-ceiling.ts`). Il modello è aggregato e non nomina
nessuno: `checkF24` dice solo se l'IRPEF dei cedolini combacia con l'erario. Però
il DM10 è la somma di quattro pezzi di cui tre si conoscono — le trattenute dei
lavoratori, i contributi dell'apprendista (aliquota **di legge** per anno, 3,11%
il primo) e lo zero dei tirocini — e quello che resta, diviso l'imponibile degli
ordinari, è l'aliquota vera: a giugno 2026 **29,57%**, dove la configurazione
diceva 30%. Due regole:

- **Il numero ricavato per differenza assorbe tutto quello che c'è dentro.** Se
  l'aliquota che ne esce sta fuori dalla banda 24–36% il modello contiene altro
  (conguagli, rate, sanzioni) e la ripartizione **non si fa**: si torna al
  listino e la riga lo scrive. Senza il controllo, la sanzione di un ritardato
  versamento diventerebbe il costo di una persona.
- **«Di legge» non è «stimato».** Il 3,11% dell'apprendista e lo zero del
  tirocinio sono fatti; marcarli come stime manderebbe a chiedere al consulente
  una conferma che non serve. La supposizione vera è una sola: l'aliquota
  ordinaria presa dal parametro invece che dal modello.

**Quanto costa davvero una persona al mese** (§235, `monthlyCeiling`). Non la
media del contratto — che non sa delle trasferte, non sa che l'apprendista paga
il 3,11% e non sa che a dicembre esce una mensilità in più — ma quello che dicono
il cedolino e l'F24. Tre numeri, tre domande:

- **ordinario** — il mese normale, quello che il cedolino descrive.
- **punta** — il mese con la mensilità aggiuntiva. Un budget costruito
  sull'ordinario salta proprio a dicembre, che è quando salta anche la cassa.
- **tetto** — l'annuo diviso dodici: il numero da mettere a budget, perché
  dodici tetti fanno esattamente quello che uscirà. Sui tre dipendenti:
  **5.392 €/mese** (8.192 € con le due P.IVA), punta 8.754 € nel mese delle
  tredicesime, contro i 6.573 € che la pagina mostrava leggendo RAL scritte a
  mano.

**Il costo del lavoro di un mese non pesa su quel mese** (§224): esce il 20 di
quello dopo. Perciò correggere agosto **non cambia la tenuta di cassa di
agosto** — nella sua finestra c'è il costo di luglio — e si vede dal mese dopo:
da settembre l'area Personale pesa 1.182 € in meno, 7.091 € sul semestre. È la
stessa ragione per cui un consuntivo di luglio non si sostituisce con una stima:
quei numeri sono già usciti.

Tre cose che il tetto tiene separate, e ognuna nasce da un numero sbagliato visto
sul LUL vero:

- **Le mensilità aggiuntive si contano dai ratei, non dal contratto.** Se il
  cedolino porta un rateo di quattordicesima quella mensilità è **già** dentro
  l'imponibile di ogni mese; quelle che il contratto prevede e il cedolino non
  ratealizza escono in un mese solo e valgono **dodici volte il rateo** — che è
  come le calcola il consulente. Contare due volte la quattordicesima sarebbe un
  errore da 1.500 € l'anno a testa.
- **Le trasferte non sono un extra: sono lo strumento** (§236). Su Michele e
  Sabrina bonus e trasferte servono ad arrivare al **netto concordato** — 1.500
  e 1.600 — e a giugno Michele ci arriva esatto *grazie* ai 57 € di trasferta:
  senza, la busta ne farebbe 1.443. Chiamarle «parte variabile» faceva sembrare
  comprimibile la parte che tiene in piedi il patto. Il tetto le divide in tre:
  quelle **a copertura** del netto (struttura), quelle **oltre** (le sole
  comprimibili — oggi zero su tutti e tre) e quanto **manca ancora**. Sabrina si
  ferma a 1.568: i 32 € scoperti entrano nel tetto, perché una promessa scoperta
  non è una spesa da decidere. Il pavimento è `hr_people.agreed_net`, che è il
  netto **promesso** e non quello uscito — scriverci 1.568 farebbe sparire lo
  scostamento invece di segnalarlo.
- **L'indennità L. 207/2024 non è un costo**: esce in busta e rientra come
  credito nell'F24 (75,25 + 31,79 = 107,04, ed è esattamente il credito del
  modello di giugno). Contarla gonfia il conto economico di soldi che tornano
  indietro il mese dopo.

**La retribuzione non è l'imponibile previdenziale**: su un tirocinio
l'imponibile è zero e l'indennità è ottocento euro. Il tetto parte dal totale
delle competenze e toglie quello che competenze non è — rimborsi e partite di
giro — e sui tre cedolini di giugno torna al centesimo con l'imponibile di chi ce
l'ha.

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

**Il ponte tiene il dovuto, non l'erogabile** (§286 su §199). Il termine
«compensi maturati e non pagati» **non si può allineare alla finestra**, ed è
una cosa che il codice deve dire prima che qualcuno provi a farlo: l'identità
poggia su `companyPlan = maturato − distribuito − costi`, quindi la posta deve
rimettere esattamente `distribuito − uscito`. Mettendoci l'erogabile, il residuo
si sposta della differenza e smette di significare qualcosa — e il residuo è
l'unico motivo per cui il ponte esiste.

E non è nemmeno sbagliato: sull'arco della vita dell'azienda quello che esce
**è** il maturato; la finestra decide solo *quando*. Quindi il numero resta e si
aggiunge l'altro tempo accanto — «dovuti 20.988,48 € · erogabili adesso
11.660,97 € · quando i clienti pagano 9.327,51 €» — perché due schermate che
dicono «compensi» e due cifre diverse è il difetto che si stava chiudendo.
`payableNow` **entra dall'esterno**: la regola ha dentro il consolidato (§230) e
chi non ha mai preso un euro (§228), vive in `payoutLedger`, e il ponte la mostra
senza ricalcolarla. Il gate blocca entrambe le cose: che la posta resti il
maturato, e che dichiarare l'erogabile non muova il residuo di un centesimo.

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
- **§276 — una conferma sola invece di venti** (`lib/auto-match.ts`,
  `confirmSureMatches`). La regola resta quella: nessun aggancio automatico. Ma
  fra i movimenti importati ce ne sono in cui **non c'è niente da giudicare** —
  importo lordo esatto al centesimo, nome che torna (o numero del documento
  nell'etichetta) e **una sola riga possibile in entrambi i sensi** — e
  chiederne venti conferme separate è il modo in cui non se ne conferma nessuna.
  Il pannello in Banca li elenca prima, con la ragione riga per riga, e un
  pulsante li conferma in blocco. L'**uno a uno** è la condizione che rende
  sicuro il resto: un movimento che potrebbe essere due righe, o una riga
  contesa da due movimenti, resta a mano e la pagina dice perché. L'azione
  **ricalcola la regola dal database**, non si fida dell'elenco che il browser
  ha visto: chi arriva secondo non deve poter disfare il lavoro del primo.
  Provata contro le decisioni già prese da una persona sui 115 movimenti
  agganciati a mano: **9 riproposti come certi, 9 d'accordo, 0 in disaccordo**,
  3 lasciati a mano perché ambigui. `npx tsx scripts/verify-match.ts` li stampa
  senza scrivere niente.
- **§277 — le virgolette tengono insieme il campo.** `split(sep)` va bene finché
  nessun campo contiene il separatore, e su Vivid non è così: `"ASANA.COM,
  DUBLIN, IE"` è **una** cella con due virgole dentro. Spezzandola, l'importo
  finiva nella colonna della valuta e la riga veniva scartata come «importo
  illeggibile» — sull'estratto conto vero **43 righe su 49**, quasi tutto, e il
  totale letto non lo diceva. Ora `cells` rispetta le virgolette (e il `""`
  interno, che è un apice). Nella stessa riparazione l'esito dell'import si dice
  com'è: **«0 nuovi» non è un errore** ed è la risposta più frequente — si
  riscarica l'estratto ogni settimana e le righe vecchie ci sono già — quindi
  diventa «Nessun movimento nuovo: tutti e 89 erano già in archivio (11 maggio →
  7 agosto)», e le righe scartate hanno un avviso loro **con la ragione**, che
  un contatore accanto al successo non lo guarda nessuno.
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

**Fra i due portali si muovono admin e super admin** (§234), e nessun altro:
`PortalSwitcher` compare quando `isAdminRole(app_role) || isSuperAdmin`, in
testata e nel workspace. A chi è confinato non si mostra un selettore che il
middleware rimbalzerebbe — un link che rimbalza è peggio di un link assente
(§211). In `/portale` (anteprima cliente, `?client=<id>`) entra solo il super
admin.

**I breadcrumb non attraversano il confine** (§234, `samePortal` in
`BackLink.tsx`). Le due sorgenti del ritorno arrivano da fuori: `?from=`, che
chiunque può scrivere nella barra, e la pagina precedente in sessione. Un admin
che apre il workspace ci arriva con la memoria del portale admin addosso, e la
freccia della scheda cliente lo riportava a `/clienti`, fuori dal portale in cui
stava lavorando; per chi è confinato al workspace il link non porta da nessuna
parte, perché il middleware lo rimbalza. La regola è simmetrica: **si torna
dentro il proprio dominio**, altrimenti vale il `fallback`, che il chiamante
costruisce già sulla `base` giusta. `/impostazioni/profilo` è l'unica eccezione,
ed è una porta che esiste davvero. `NavMemory` adesso è montato in **tutti e
due** i layout: nel workspace non c'era, e ogni «indietro» cadeva sul fallback.

**Il dominio economico è chiuso in un posto solo** (§234, `lib/economics-guard.ts`
+ `canSeeEconomics`). Nascondere una voce di menu non è una barriera, e nemmeno
nascondere un riquadro: un file `'use server'` **esporta endpoint**, e chi ha il
codice davanti — cioè chiunque abbia accesso al repository — ne conosce i nomi.
L'unica difesa che regge è il controllo dentro l'azione.

- `requireEconomicsAdmin()` è **uno**, e ci passano `pl`, `revenue`, `costs`,
  `payroll`, `bank`, `tax`, `invoices`. Prima erano sette copie della stessa
  funzione: sette posti dove dimenticarla, e infatti `ownVat` non ce l'aveva.
- Guarda `app_role`, non `role`: `role='admin'` è la mappatura grossolana per la
  RLS e ci cade dentro chiunque sia stato promosso admin di ruolo. Il dominio
  economico è l'ultimo posto dove essere generosi.
- Tre strati, e ognuno risponde a una domanda diversa: il **middleware** instrada
  per portale (col ruolo in memoria per mezzo minuto), il layout `(dashboard)`
  rimanda al workspace chi è workspace, il layout **`economics/`** rilegge dal
  database e chiede `canSeeEconomics`. «Non è workspace» non vuol dire «può
  vedere i numeri». Chi non passa torna alla dashboard, non a una pagina
  d'errore — che confermerebbe l'esistenza della sezione.
- Nel workspace i numeri non partono nemmeno: `clients_workspace` li azzera in
  tabella (100/197/213), `hideEconomics` spegne MRR, pagamenti e anagrafica
  fiscale, e la scheda Economics non viene montata (§211).

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

## Dove siamo — 2026-08-20 (sera)

**Il registro delle allocazioni è in produzione** (`2d45e53`). Il legame fra
conto corrente e conto economico non è più un campo: è l'euro allocato. Da lì
sono cadute sette cose in fila — l'F24 come documento, il dialogo che propone
«accorpa» invece di creare una riga, la posizione di ognuno, l'accordo validato.

Il ponte (§199) è passato da **−6.029 a −4.772 €**, e il numero è peggiorato due
volte **correggendo errori**: la spesa al supermercato da 3.751 € (era 37,51) e
le quattro righe che portavano il lordo dove il motore aspetta l'imponibile
stavano *coprendo per caso* uscite vere che nessuna riga spiega. Un residuo che
si allarga quando si corregge un dato era un residuo che mentiva.

Quello che resta da guardare, in ordine:

1. **6 spunte dichiarate** che nessun movimento conferma: è quasi tutto il
   residuo del ponte.
2. **Due bonifici Affinity di luglio**, 5.100 €: il motore dell'intake li propone
   e dice «scegli quale» — tre righe dello stesso fornitore, e la scelta è di una
   persona.
3. **Tre movimenti di agosto** per 148,91 €: due Meta da correggere (la riga dice
   109,12 e dal conto sono usciti 166,01) e un carburante da aggiungere.

Fuori dal tool per scelta: la **provvigione divisa** fra Marco e Toto è un accordo
fra loro (§286) e si registra a mano; il bonifico a Walter del 7 agosto è la
**riconciliazione con GAV Sistemi**, marcata «niente da abbinare» col perché
scritto.

## Dove siamo — 2026-08-20 (mattina)

**Allineato ai documenti veri** (`scripts/align-2026-08.ts`): estratto conto BPM
al 20 agosto (14 movimenti), Vivid al 14 (1), 7 fatture nuove. Il saldo reale è
**6.460,10 €** — non 34.845,84 — e la tenuta di cassa passa da «REGGE +5.531» a
**«STRETTO −25.749»**, che è la verità: IVA 9.669,33, compensi 9.824 e
retribuzioni 6.931 sono usciti fra il 7 e il 20 agosto. Le 74 fatture XML
coincidono al centesimo con l'archivio: **zero scostamenti** su importi,
imponibili e scadenze.

**Tre difetti trovati facendolo, tutti «una regola scritta due volte»**:

- **§288** — `scripts/import-bank-csv.ts` costruiva l'impronta con la *posizione
  nel file*: il bug §210 corretto nell'azione e mai nello script. Su un estratto
  conto sovrapposto avrebbe reinserito quasi tutti i 93 movimenti già in
  archivio. La regola ora è `buildImportRows` in `lib/bank-import.ts` e ci
  passano tutte e due le porte; `transferPairs` ha avuto lo stesso trattamento.
- **§289** — `verify-cash` leggeva la **stima** IVA mentre la pagina legge il
  modello F24 (§242): verificava sé stesso, non il codice che gira. E una
  liquidazione **già versata** continuava a essere sottratta dal saldo, quindi
  il conto perdeva 9.669 € due volte proprio il giorno in cui il verdetto serve.
  `vatPending` la esclude, `nextDue` è l'unico posto che risponde a «qual è la
  prossima scadenza da versare».
- Le **spunte gemelle**: la rata ISF «35% alla consegna» e il suo subappalto
  risultavano incassata e pagata l'11 agosto, ma quel giorno c'è un bonifico
  solo per parte, e appartiene alle rate di **luglio**. Della terza tranche non
  esiste fattura, né emessa né ricevuta. Tolte le spunte, non le righe.

**Il registro delle allocazioni ha chiuso quattro quinti del ponte** (§297, la
214 è applicata): residuo da **−6.029,01 a −1.083,25 €**. Il backfill ha scritto
142 allocazioni dai legami diretti, `scripts/allocate-open.ts` altre 5 per
11.956 €, e le due correzioni all'IVA dei subappalti (§295) hanno fatto il resto.

Tre cose che il registro ha trovato appena accesa la luce, e che nessuno vedeva:

- **Sette bonifici pagavano due mesi di canone.** La fattura di Fatima del 5
  maggio è 3.000 netti — due canoni da 1.500 — e il bonifico del 13 maggio ne
  pagava due. Con un campo solo il tool ne agganciava uno e l'altro mese restava
  scoperto per sempre. Cinque si sono chiusi da soli con due regole che non sono
  scelte: **un bonifico non paga una fattura non ancora emessa** e **un compenso
  si paga nel mese in cui è atteso**. Senza la prima, il canone di maggio aveva
  tre candidate e due erano nel futuro.
- **`pl_cost_lines` «Supermercato» dice 3.751 € e il movimento è 37,51.** Un
  fattore cento, invisibile finché nessuno confrontava la riga col bonifico.
- **Sei righe hanno `vat_applied` su un importo che è già lordo** — Asana,
  Talenti, Gialeda, Roberto Annunziata: il tool ci aggiunge il 22% e si aspetta
  un'uscita che non arriverà.

**§298 — le tre correzioni che il registro ha reso possibili**, e ognuna era
invisibile finché riga e movimento non stavano affiancati:

- **La riga di luglio del personale portava la busta di giugno**: 3.868 €, che è
  esattamente quello che era uscito il 17 luglio, mentre la distinta del 20
  agosto è di **4.077**. Il mese è stato preparato copiando quello prima.
- **La spesa al supermercato diceva 3.751 € e il movimento è 37,51.** Correggerla
  ha **peggiorato** il ponte, da −1.083 a −4.587,74: quei 3.713 € fasulli stavano
  coprendo per caso un'uscita vera che nessuna riga spiega. È il ponte che fa il
  suo lavoro — un residuo che si allarga quando si corregge un errore era un
  residuo che mentiva.
- **Cinque righe portano il lordo dove il motore aspetta l'imponibile**
  (`scripts/fix-gross-as-net.ts`), e le fatture dimostrano che **lo scorporo
  cieco al 22% sbaglierebbe**: Talenti è 300 + 66, e lo scorporo la
  indovinerebbe; Gialeda è 134 + **7,04**, cioè il 5,25%, perché una pratica
  CCIAA ha dentro diritti esenti. Vale §182 — il documento batte la stima — e
  dove il documento non c'è (Asana, fornitore irlandese) l'IVA **si spegne**:
  scorporare inventerebbe un credito che nessuno ha pagato. Quattro stanno in
  mesi chiusi e il tool non le tocca: cambiare l'imponibile di una fotografia ne
  muove le quote già distribuite.

**Due regole imparate allocando** (`scripts/allocate-open.ts`), e nessuna delle
due è un'euristica: **un bonifico non paga una fattura non ancora emessa** — senza
il vincolo il canone di maggio di Fatima aveva tre candidate e due erano nel
futuro — e **un compenso si paga nel mese in cui è atteso**, o il bonifico del 1º
giugno si prende le quote di agosto. Più due difetti di chi propone: `classify`
etichetta `finanziamento` i bonifici ai soci di giugno e `pagamento` quelli del
13 agosto, quindi **filtrare per categoria perde metà dei casi** — il segnale è
il nome più il mese; e il nome sull'estratto conto non è quello del piano
compensi, quindi passa da `PERSON_ALIASES` (§226) o il gemello di Toto non si
trova mai.

**Quello che resta a una persona.** Il bonifico a Walter del 7 agosto è la
riconciliazione con **GAV Sistemi** — giro fra società collegate, fuori dalle
statistiche — e non una quota: è marcato «niente da abbinare» col perché scritto,
e da allora `allocate-open` rispetta quella decisione invece di riproporla. La
seconda distinta del 20 agosto (2.854 €) resta aperta perché **1.300 + 1.530 fa
2.830, non 2.854**: le due fatture di Annalisa sono 1.530 e 1.554, e quale delle
due paga quella distinta il tool non lo può decidere. **La provvigione divisa fra
Marco e Toto** si registra a mano e lo dichiara: il tool la attribuisce intera al
commerciale del cliente (§286), e l'accordo fra loro vive fuori.

## Dove siamo — 2026-08-13

**Fatto il 2026-08-13**: la **212** è applicata e la riparazione di luglio è
passata (`npx tsx scripts/fix-july-2026.ts --apply`). Al mese mancavano
**5.209,33 €** di lavorazioni affidate fuori che il piano di progetto aveva già
— Seven acconto 2.459,33 e ISF 30% 2.100 mai portati nel mese, Fatima/Gianni
650 datato agosto contro una rata di luglio — e le sei tranche Seven stavano
**un mese avanti** rispetto alle rate che finanziano, fino a gennaio 2027.
Luglio è stato riaperto, corretto e richiuso: la quadratura chiude ancora a
**0,00**.

L'erogazione del **13 agosto** su luglio: base 25.325 € (8 righe su 12),
margine digital 10.293,45, **2.661,12 a socio** di quota digital, 470 di erogato
growth, 60 di provvigione divisa → **3.191,12 a testa**; provvigioni Walter
417,00 · Marco 442,11 · Antonio Giarletta 283,50 → **10.715,97 € da erogare**,
scritti in `pl_payouts` (`scripts/prepare-payouts.ts`, stesso motore del
pulsante). Restano fuori 6.900 € di righe di luglio non incassate: il loro
compenso si eroga nell'erogazione in cui rientrano. La finestra di agosto
riparte dal 13 e vale **945 €**; la tenuta di cassa dice lo stesso numero
(10.716 + 945 = 11.661 €).

**Due cose lasciate aperte da lì**: i due subappalti portati nel mese sono
entrati **non pagati** — nessun movimento dimostra che siano usciti (§226) — e
il fondo rischio di Seven è acceso sulle rate di luglio e **spento** su quella
di agosto: stesso progetto da 45.000 €, quota che salta dal 25% al 28% fra un
mese e l'altro senza che niente lo dica.

**Da eseguire subito, e non è una migration**: `supabase/RESTORE_HR_PEOPLE.sql`.
Il 9 agosto quattro persone su cinque sono state eliminate da `hr_people` per
togliere il loro costo dal solo mese di maggio; il CASCADE si è portato via
anche i tre cedolini di giugno. Lo script rimette persone (stessi id), cedolini,
la fattura di Annalisa e le date di assunzione — Gabriele da aprile, Annalisa da
giugno — e da lì in poi `inForce` (§233) fa il lavoro che si voleva: la persona
resta in organico e pesa solo dai mesi in cui era in forza.

**Da eseguire: la `210_invoice_unmanaged.sql`** (§281) — la colonna
`invoices.excluded_reason`: nove documenti su trentanove non sono né incassati
né da incassare, e finché non c'è quella colonna restano fra i crediti da
inseguire. Subito dopo, `supabase/FIX_INVOICES_STATE.sql` scrive lo stato vero.

**Verificato sul database il 2026-08-09, colonna per colonna**: 203, 204, 205,
206, 207, 208, 209 e 197 sono **applicate** — il registro le dava ancora per
mancanti. `pl_config.settled_from` c'è (quindi 204+205 sono passate),
`vat_settlements`, `pl_payouts`, `invoices.pdf_path`, `bank_tx_lines` ci sono, e
`clients.risk_score` è stata droppata come voleva la 197. L'unica che manca è la
**210**.

**Da eseguire**: `supabase/FIX_PAYSLIPS_FROM_LUL.sql` (§235) — i tre cedolini di
giugno trascritti dal LUL voce per voce (il seed della 182 aveva i totali giusti
e le scomposizioni no: l'imponibile previdenziale conteneva trasferte e indennità
esenti), l'F24 di luglio in scadenza il 20 agosto, e le RAL allineate ai
documenti. Senza, la pagina calcola i contributi su una base più alta del vero e
i tre dipendenti costano 6.573 €/mese invece di 5.360.

**Da eseguire, quando si vuole**: `supabase/FIX_ADS_FROM_BANK.sql` — la
pubblicità allineata al conto Vivid (Meta comincia il 25 luglio: 211,64 a
luglio, 109,12 ad agosto, zero prima). Senza, maggio porta 900 € di uscita
scoperta per una campagna mai partita e la tenuta di cassa la conta.

Ultimo commit: **`2d45e53`** (il registro delle allocazioni, §290→§307),
pushato su `origin/main` il 2026-08-20 — 78 file, +9.849/−1.226. **`main` è
allineato**, quindi su os.twobee.it c'è tutto quello che c'è qui.
Gate del repo: `npx tsc --noEmit` (ESLint non è configurato) più i
**trentaquattro** `lib/*.check.ts` (gli ultimi sono `allocations.check.ts` §297,
`f24.check.ts` §301, `month-intake.check.ts` §303 e `stream-validation.check.ts`
§306), che si lanciano con `npx tsx lib/<nome>.check.ts` e devono dire «Tutti i
controlli passano».
**Non lanciare `npm run build` mentre `npm run dev` gira**: condividono `.next`,
il dev server resta a servire chunk CSS sostituiti e la pagina si apre senza
stili. Se succede: ferma il dev, `rm -rf .next`, riavvia.

**Luglio 2026 è chiuso** (2026-08-09). La quadratura chiude a zero — 31.725 € di
imponibile, quote + costi + subappalti = 31.725, differenza 0,00 — e ogni riga
dice quello che dice il suo contratto. Quello che è stato **congelato con dentro**,
e che va guardato prima di fidarsi dei numeri di cassa di luglio:

- **19 spunte «dichiarate» per 31.622 €** che nessun movimento di banca dimostra
  (§226). Non sono soldi mancanti — a luglio dal conto sono entrati 28.859 € —
  sono spunte non agganciate al loro movimento.
- **2 righe sospette**: due canoni agganciati a bonifici *precedenti* al loro
  mese (uno di agosto attaccato al 17 luglio, uno di luglio al 15 maggio).
  Datarli dalla banca sposterebbe il mese di cassa: si segnalano, non si toccano.
- **Il ponte non quadra: −18.930 €** (§199). L'identità è esatta, quindi non è
  un arrotondamento: è un movimento in banca che nessuna riga giustifica, o una
  spunta su qualcosa che dal conto non è uscito. Da guardare con
  `npx tsx scripts/verify-bank.ts`.
- **L'IVA del 2º trimestre**: il tool stima 8.400 €, il modello F24 del 20/08 ne
  chiede **9.669,33**. Lo scarto (1.269 €) sta tutto sul debito: il 22% dei
  ricavi registrati fa 9.108 €, e il modello parte da più in alto. C'è
  fatturato del trimestre che il conto economico non ha.
- **2 giroconti spaiati** del 4 agosto (±550 €) e **un possibile doppione**:
  1.300 € a Gabriele Saraiello il 15 maggio, due volte.

**La `203_cash_calendar.sql` è applicata** (2026-08-08): le righe del conto
economico hanno la **data del movimento**, e da lì lo stipendio di luglio pesa
sulla cassa di agosto.

**La `204_payout_from.sql` è applicata** (2026-08-08).

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

`npx tsx scripts/certify-cash.ts` confronta ogni spunta con l'estratto conto e
dice cosa non torna; con `--apply` scrive **solo** le date dei movimenti già
agganciati e le spunte che la banca dimostra — non toglie mai una spunta.

`npx tsx scripts/verify-invoices.ts` incrocia le tre fonti: archivio fatture
(emesse e ricevute per mese), conti BPM e Vivid (in e out per mese), e chi è
agganciato a chi. Cerca anche i **pagamenti cumulativi** — un bonifico che copre
due fatture aperte — e gli **anticipi di tasca propria**, che se non sono
registrati come movimento `manuale` per il tool non esistono (§195).

`npx tsx scripts/verify-bank.ts [mese]` passa i movimenti ai motori veri: saldo
per conto, **il ponte** (§199), certificazione delle spunte, giroconti spaiati,
movimenti senza una riga dietro, duplicati e categorie mancanti. Sola lettura.

`npx tsx scripts/verify-cash.ts <mese>` fa lo stesso con la tenuta di cassa:
gradini, esiti e registro dei compensi persona per persona.

`npx tsx scripts/verify-month.ts 2026-07-01` legge un mese dal database e lo
passa a `computeMonth`: è il controllo della catena intera col codice che gira in
pagina. Su luglio la quadratura chiude a zero — 32.225 € di imponibile, 500 € di
partite di giro, quote + costi + subappalti = 31.725 €, differenza 0,00.

**Aperto, in ordine di importanza:**

1. **Fatturazione al calendario della cassa** (§224): è l'ultima sezione che non
   legge `dueOf` — previsionale, Banca, Personale e conto economico ci passano già.
   È una lettura, non una scrittura. Nella stessa riga: il **previsionale del
   costo del lavoro** è una stima (§225, uguale a questo mese) perché il piano dei
   costi non contiene l'area Personale; farlo derivare dall'organico come fa
   `pushPayrollToMonth` toglierebbe l'unica assunzione rimasta nella tenuta di cassa.
2. **Chiudere il travaso Asana** (§215-221): il codice c'è tutto, restano da passare
   in rassegna le 146 board — e poi si toglie la sezione, che è dichiarata temporanea.
3. **Quotare i progetti che mancano**: 15 contratti su 21 progetti. Chi non ne ha
   legge «da quotare», non genera righe nel mese e non entra nella stima fiscale.
   È lavoro di inserimento, non di codice: si fa dalla scheda Economics.
4. **`promoteLineToPlan`** esiste in `app/actions/costs.ts` ma non ha un pulsante
   nell'economics del progetto: una spesa registrata a mano non si può ancora
   promuovere a ricorrente da lì.
5. **Attribuzione parziale**: `createActorClient` è adottato in `clients.ts`,
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

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
| `179_os_versions.sql` | Cronologia: (a) `log_activity()` legge l'attore dall'header `x-actor-id` — col service role `auth.uid()` è NULL e tutto risultava «Sistema» — e non registra gli UPDATE che non cambiano niente; (b) `os_versions` + `os_version_changes`, il changelog di prodotto con un ciclo di 15 giorni dal 2026-08-01 (v1.0.0), bozze visibili ai soli admin; (c) seed della v1.0.0 con 13 voci | — |

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
- **Economics del cliente** (`ClientEconomicsTab`, tab 5): è il posto dove si
  quota. Un gruppo per **ogni** progetto del cliente — anche senza contratti,
  marcato «da quotare», con i suoi pulsanti listino/custom — più il gruppo
  «Accordi senza progetto». Non filtrare i progetti privi di righe: sono
  esattamente quelli da vedere.
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
- **Subappalti** (§173): una voce di piano con `project_id` è una lavorazione
  affidata fuori. Si crea dalla scheda Economics del progetto, finisce da sé
  nell'area «Delivery & Fornitori» e dà il **margine del progetto** (ricavo del
  mese − costi esterni). Il tempo del team interno NON va lì: sta nel costo del
  lavoro aziendale, e mescolarli darebbe un margine che nessuno può calcolare.
- **Conto economico** (`/economics`): `generateRevenueFromClients` copia i
  contratti attivi nel mese (`origin='contratto'`); i clienti **senza nemmeno un
  contratto** entrano con l'MRR d'anagrafica (`origin='anagrafica'`, segnalati
  come «senza contratto»). Il ripiego è per cliente, mai globale.

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

## Dove siamo — 2026-08-01

Ultimo commit: `34c23f5`. `main` e `origin/main` allineati; il deploy Coolify
builda da lì. Gate del repo: `npx tsc --noEmit` (ESLint non è configurato) più i
sette `lib/*.check.ts`, che si lanciano con `npx tsx lib/<nome>.check.ts` e
devono dire «Tutti i controlli passano».
**Non lanciare `npm run build` mentre `npm run dev` gira**: condividono `.next`,
il dev server resta a servire chunk CSS sostituiti e la pagina si apre senza
stili. Se succede: ferma il dev, `rm -rf .next`, riavvia.

**Migration da eseguire: la `183_hr_personal_data.sql` e la
`184_hiring_incentives.sql`.** Le altre (179-182) sono applicate e verificate sul
database: v1.0.0 pubblicata, retention a 90 giorni con pg_cron attivo, organico e
cedolini di giugno caricati. Senza la 183 i campi età e figli non esistono e il
suggerimento sull'apprendistato resta generico; senza la 184 il catalogo delle
agevolazioni si legge ma non si può attivare niente su una persona, il costo del
lavoro resta quello pieno, e l'area «Persone» del piano dei costi non prende il
nuovo nome (la pagina lo dichiara, non si rompe).

**Fatto finora**: il dominio economico completo (migration 168→178) — contratti
per progetto, piano dei costi con budget per area, subappalti con margine di
progetto, previsionale a sei mesi, IVA trimestrale e sezione Fiscale, stato
cliente `pending`, e la disciplina trasversale per cui **ogni valore economico è
derivato e dichiara la sua provenienza** (vedi le sezioni Economics, Tipo
cliente, Stato pagamenti).

**In coda, non ancora committato:**
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

**Com'è messo il database** (2026-08-01): 12 clienti (4 stabili, 3 partner, 3
pending, 1 in bilico, 1 perso), 11 progetti attivi — 10 con cliente, 1 interno —
68 task, 42 voci nel piano dei costi. Ma **zero contratti, zero rate, zero righe
di conto economico**: i tre `pl_months` aperti sono vuoti.

**Aperto, in ordine di importanza:**

1. **Quotare i progetti**: i progetti sono tornati, i contratti no. Finché
   `revenue_streams` è vuota ogni cliente legge «da quotare», il conto economico
   non ha righe da generare e Fiscale stima su niente. È lavoro di inserimento,
   non di codice: si fa dalla scheda Economics di ogni progetto.
2. **Risk score**: `compute_client_risk` (migration 014) dà ancora punti per
   «contratto scaduto» leggendo `clients.contract_end`, che ora è derivato e può
   essere NULL. Oggi vale 0 su tutti, quindi non si vede — ma va sistemato prima
   di riattivare il motore.
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

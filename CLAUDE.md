# TWO BEE Gestionale — Contesto Claude Code

## Dove sta il resto — leggilo prima di toccare il dominio
Qui c'è solo quello che vale sempre. Il dettaglio sta in `docs/`, e **non è
storia: sono le regole**. Prima di scrivere codice in uno di questi domini,
apri il suo file — le regole nascono tutte da un numero sbagliato visto sul
database vero, e riscoprirle costa più che leggerle.

| Se tocchi | Leggi |
|---|---|
| contratti, rate, subappalti, `lib/pl-rows.ts`, `lib/revenue.ts`, `lib/subcontracts.ts`, margine digital | `docs/economics-contratti.md` |
| prospetto, `lib/pl-aggregate.ts`, allocazioni (`lib/allocations.ts`), F24, intake movimenti, `lib/cash-plan.ts`, report board | `docs/economics-prospetto.md` |
| piano compensi (`lib/pl.ts`), `lib/cash-calendar.ts`, `lib/payout-window.ts`, `PlClient` | `docs/economics-compensi.md` |
| tenuta di cassa (`lib/cash-runway.ts`), certificazione spunte, ponte conto→saldo, «Prepara il mese» | `docs/economics-cassa.md` |
| IVA (`lib/vat.ts`), Fiscale (`lib/tax.ts`), fatturazione, `lib/money.ts`, provenienza dei numeri | `docs/economics-fiscale.md` |
| `/economics/personale`, `lib/payroll*.ts`, `lib/incentives.ts`, cedolini e F24 | `docs/personale.md` |
| `/economics/banca`, import estratti conto, riconciliazione, sottoconti soci | `docs/banca.md` |
| `lib/risk.ts`, badge rischio in lista/scheda/dashboard | `docs/clienti-rischio.md` |
| migration, `supabase/**`, «questa colonna esiste?» | `docs/migrations.md` |
| `activity_log`, ripristino, versioni, attribuzione | `docs/cronologia.md` |
| workspace, workload, ferie, task completate, widget dashboard | `docs/operativita.md` |
| `lib/tracking/**`, tab Tracking/Report/Chiavi/Accessi, QA giornaliero | `docs/tracking.md` |
| `lib/ai/**`, assistente Ctrl+J, tool e azioni rischiose | `docs/ai-assistant.md` |
| `/asana` (sezione temporanea, da togliere a travaso finito) | `docs/asana.md` |
| «a che punto siamo», cosa è applicato, cosa è aperto | `docs/stato.md` |

## Invarianti — valgono anche senza aprire i doc
- **Nessun valore economico si digita**: contratti e rate sono l'unica scrittura,
  tutto il resto legge e dichiara la provenienza (`lib/economics-source.ts`).
  Niente inline edit di MRR, date contratto o stato pagamenti fuori da Economics.
- **Ogni server action economica chiama `requireEconomicsAdmin()`**
  (`lib/economics-guard.ts`): un file `'use server'` esporta endpoint, nascondere
  un riquadro non è una barriera.
- **Scrivi su una tabella con cronologia? `createActorClient(userId)`**, non
  `createAdminClient()`, o la modifica risulta «Sistema».
- **Il motore delle righe è `lib/pl-rows.ts`**: non ricostruire `RevenueLine` /
  `CostLine` a mano, nemmeno in uno script di verifica.
- **Una regola scritta due volte non è una regola**: se un controllo vive in
  un percorso e non nell'altro, spostalo dentro l'azione che passano tutti.
- **Un numero plausibile e sbagliato è la sola categoria di errore che nessuno
  va a controllare.** Quando una fonte manca, dichiaralo («n/d», «stimato»,
  «senza contratto»): mai uno zero.
- **Gate del repo**: `npx tsc --noEmit` (ESLint non configurato) + i
  **quarantacinque** `lib/**/*.check.ts` — anche in sottocartella (`lib/ai/**`,
  `lib/tracking/**`) — con `npx tsx lib/<percorso>.check.ts`: devono dire «Tutti
  i controlli passano».
- **Non lanciare `npm run build` mentre `npm run dev` gira**: condividono `.next`
  e la pagina si apre senza stili. Se succede: ferma il dev, `rm -rf .next`, riavvia.

## Stack & architettura
- **Next.js 14** App Router, TypeScript strict, Tailwind CSS
- **Supabase** PostgreSQL + Auth + RLS (`@/lib/supabase/server` server-side, `@/lib/supabase/client` client-side, `@/lib/supabase/admin` service role)
- **UI**: design token light/dark (vedi «Design system» sotto); Radix UI; lucide-react; sonner toast
- **AI**: due provider. Customer care → Anthropic `claude-haiku-4-5` (`app/actions/cc-ai.ts`,
  chiave `ANTHROPIC_API_KEY`, **non impostata**: quella funzione è spenta e ritorna vuoto).
  Tutto il resto → Groq via fetch, chiave `GROQ_API_KEY`.
  **Il modello Groq non si scrive nel codice**: sta in `lib/ai/model.ts` (env `GROQ_MODEL`,
  default **`qwen/qwen3.6-27b`**). `llama-3.3-70b-versatile` è **dismesso** e risponde 404 —
  era copiato in cinque route e sono morte tutte insieme senza che niente lo segnalasse.
  Il cambio da `openai/gpt-oss-120b` a Qwen è stato fatto **misurando** sullo stesso carico:
  Qwen emette più tool call nello stesso turno (tre, su una domanda composta) dove gpt-oss
  ne fa una sola, **non è un modello di reasoning** (quindi un `max_tokens` stretto accorcia
  la risposta invece di **svuotarla**), e sull'azione che modifica i dati chiama lo strumento
  invece di chiedere conferma a parole. **Ma è durato tre domande**: su questo account
  `qwen/qwen3.8-27b` ha **8.000 token al minuto** e un turno dell'assistente ne consuma da
  3.700 a 9.900 — un turno bruciava il minuto e il secondo prendeva 429. Tutti gli altri
  modelli, `qwen/qwen3.6-27b` compreso, ne hanno **250.000**. Il 3.6 passa le stesse prove
  ed è il default; è un reasoning model, quindi i tetti larghi servono. **Prima di scegliere
  un modello, leggi `x-ratelimit-limit-tokens` sulla risposta**: la qualità si vede in
  quattro domande, il limite si vede in produzione.
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

## Stati del cliente (`client_label`)
`stabile` · `in_bilico` · **`pending`** · **`lead`** · `perso` · `partner`.

`pending` (§176) = lavorazioni sospese temporaneamente. **Non è un perso**: non
fattura — quindi fuori da MRR attivo, generazione del conto economico, alert e
insight — ma il rapporto è vivo e **non conta come churn**. `paused_at` tiene
l'ultima sospensione, così si sa da quanto è fermo: oltre i 60 giorni scatta
l'alert in dashboard, perché un rapporto sospeso che nessuno richiama diventa un
rapporto perso.

**`lead` (§321) = non è ancora un cliente.** Nasce scrivendo un nome che in
anagrafica non c'è — dal composer di una task ad hoc, dove le due risposte sono
«aggiungi in anagrafica» e «segna come lead». Non fattura, quindi vale la regola
della `pending`: fuori da MRR, conto economico, alert, punteggio di rischio. E
**non è un perso**: un perso era un cliente e non lo è più, un lead non lo è
ancora, e contarlo nel churn direbbe che abbiamo perso qualcuno che non avevamo.

L'alternativa era un campo di testo libero sulla task, ed è la ragione per cui
non si è fatta: un nome che non è una riga è un riferimento sospeso — non si
apre, non si raggruppa, non compare nella scheda di nessuno, e il giorno in cui
diventa un cliente vero non c'è niente da collegare.

`lib/clients.ts` è l'unica fonte: `isLost`, `isPaused`, `isLead`,
`countsInStats` (esclude interni + persi + fermi + lead), `pausedDays`. Non
riscrivere il filtro inline: ogni `client_label !== 'perso'` sparso è un posto
che dimenticherà il prossimo stato — ed è successo, perché gli stati sono già
sei. Gate: `npx tsx lib/clients.check.ts` (21 controlli, con l'elenco chiuso
delle label: se ne arriva una settima, il test è il posto dove qualcuno deve
decidere se conta).

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

**Il cliente nuovo lo apre anche il manager** (§317, `canCreateClients` in
`lib/permissions.ts`). Era admin-only, ma il cliente lo porta chi lo ha in mano:
i manager lo incontrano prima che esista un contratto, e far aprire l'anagrafica
a un altro rimandava referenti e canali a quando qualcuno passava dal portale
admin. Il bottone «Nuovo Cliente» in `ClientiList` non passa più da
`hideEconomics` — quello è il gate delle economics, non dei permessi — ma dal
ruolo, e la porta vera è `requireClientCreator()` nell'action: `admin` + `manager`.

**Creare non è gestire.** Modifica dell'anagrafica, label, canone, dati fiscali
ed eliminazione restano `requireAdmin`. Il workspace resta senza numeri perché
la `NewClientModal` non ne chiede: `mrr: 0`, `payment_status: 'in_attesa'`,
avvio a oggi (§169, li riscrive il primo contratto venduto). La riga che torna
dall'insert arriva però dalla tabella piena, non dalla VIEW: `onCreated` la
azzera prima di metterla in lista, come fa il server (§211).

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

## Regole di risposta
- Zero preamboli. Vai dritto a codice.
- Spiega solo se non ovvio o richiesto.
- Una sola soluzione proposta salvo richiesta esplicita.
- Modifica solo le righe necessarie.
- Niente riassunti: una riga di conferma basta.
- Leggi solo le righe rilevanti del file.
- TypeScript: zero errori al primo tentativo.
- Non chiedere conferma per modifiche non distruttive.

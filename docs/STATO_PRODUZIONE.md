# Stato di produzione — TwoBee OS

> **Aggiornato il 15 settembre 2026 dopo il rilascio commerciale**, dal codice e dall'infrastruttura,
> non dagli altri documenti. Dove un documento diceva una cosa e il codice ne
> diceva un'altra, qui c'è quella del codice — e la contraddizione è segnalata.
>
> Ogni riga dichiara **come è stata verificata**. Tre livelli, e non sono
> intercambiabili:
> **[verificato]** eseguito o letto adesso · **[dedotto]** ricavato da due fatti
> verificati · **[non verificato]** scritto da qualche parte e mai controllato.
> **[confermato dall'utente]** indica un esito riferito dal browser dell'utente,
> non un collaudo end-to-end eseguito dall'agente.

**Stato operativo:** area commerciale online e accessibile, collaudo funzionale
in corso **[confermato dall'utente]**. Commit `573351e` pubblicato su `main`,
migration commerciale e correzione dei ruoli applicate, quattro manager attivi
abilitati **[verificato]**. Il portale cliente resta il prossimo intervento;
non è stato implementato né distribuito.

---

## 1 · Cosa gira, e dove

| | |
|---|---|
| Applicazione | `twobee-crm` su **Coolify**, uuid `xo9jjzil22okdjx0rmwk0sha` **[verificato]** |
| Indirizzi | `https://os.twobee.it` + fallback `https://xo9jjzil22okdjx0rmwk0sha.57.128.243.135.sslip.io` **[verificato]** |
| Sorgente | GitHub `it-twobee/twobee-crm`, ramo **`main`**, deploy automatico **[verificato]** |
| Salute | Applicazione online e commerciale accessibile **[confermato dall'utente]**; healthcheck del nuovo container non ricontrollato |
| Ultimo deploy | **2026-09-15**, dopo il push commerciale; completamento **[confermato dall'utente]**, orario esatto non rilevato |
| Commit di rilascio | **`573351e`** — «feat(commerciale): pipeline, delivery e protezione dei ruoli», presente su `main` **[verificato]** |

Prima del push, il container eseguiva `85865c5`, che comprende le ricorrenze
§337; il commerciale è stato integrato sopra quei commit, senza sovrascriverli.
L'utente ha poi confermato deploy e accesso alla pagina. Lo SHA del nuovo
container non è stato verificato direttamente dopo il rilascio.

**Perché lo SHA è vuoto** (§327 non funziona in produzione). `next.config.mjs`
cerca `COOLIFY_GIT_COMMIT`, poi `SOURCE_COMMIT`, poi ripiega su `git rev-parse`.
L'ultimo controllo HTTP, prima del nuovo deploy, restituiva `sha: ""` e
`builtAt: "2026-09-15T11:33:54.985Z"` **[verificato]**. La valorizzazione dello
SHA a build time resta da correggere e ricontrollare: non è stata modificata
dal rilascio commerciale. Non dedurre un commit dalla sola data del build.

### Stack **[verificato]** — `package.json`

Next.js **14.2.18** App Router · React 18 · TypeScript strict · Tailwind ·
Supabase (`@supabase/ssr` 0.5.2, progetto `ujkrrryitfqboskdqhwf`) ·
AWS SDK S3 per i file · `googleapis` · `@anthropic-ai/sdk` · lucide-react ·
sonner. Output `standalone`, container Docker.

### Dimensioni **[verificato]**

| Cosa | Quanto |
|---|---|
| Righe TS/TSX (`app` + `lib` + `components`) | **103.286** |
| Rotte pagina | **57** |
| Rotte API | **33** |
| File server action (`app/actions/*.ts`) | **46** |
| File TS/TSX in `components/` | **137** |
| Moduli `lib/` (esclusi i check) | **112** |
| File di controllo `lib/**/*.check.ts` | **52** |
| File migration | **198** (l'ultima numerata è la **224**) |

---

## 2 · Le due facce dell'applicazione

I portali vivi sono **due**, non quattro. Il gate sta in `middleware.ts` **e**
nei layout. **[verificato]**

**Portale admin** — `super_admin`, `founder`, `admin`. **30 rotte**
(le altre 5 delle 57 sono pubbliche: `/`, `/login`, `/registrati`,
`/reset-password`, `/onboarding`):

- `/dashboard` · `/clienti` + scheda `/clienti/[id]` · `/progetti` + `/progetti/[projectId]` + `/workstream/[wsId]`
- `/commerciale` — Oggi, Opportunità e Risultati
- `/economics` con **sei** sottosezioni: `prospetto`, `costi`, `fatturazione`, `fiscale`, `personale`, `banca`
- `/customer-care` + `/customer-care/tickets` · `/tracking` · `/documenti` · `/calendario` · `/hr` · `/ad-hoc` · `/le-mie-attivita` · `/feedback`
- `/impostazioni` + `catalogo`, `cronologia`, `tracking`, `profilo`
- `/asana` — sezione dichiarata **temporanea**, da togliere a travaso finito

**Portale workspace** — `manager`, `senior`, `junior`, `stage`, `freelance`,
`partner`. **22 rotte** sotto `/workspace/**`, e **nient'altro**: chi è workspace
viene rimandato lì dal middleware. Ha la sua versione di clienti, progetti,
attività, customer care, tracking, documenti, calendario, HR, buste paga,
cronologia, feedback, profilo e documenti personali. Il commerciale è in
**`/workspace/commerciale`**, non in `/commerciale`: il secondo URL rimanda
un manager a `/workspace`, anche se è abilitato al modulo.

**Accessi commerciali attuali [verificato sul DB]:** Annalisa Smiraglia,
Gabriele Saraiello, Michele Cristallo e Sabrina Nastro hanno il grant
`can_view_deals` e accesso manager. Marco Lucci (`super_admin`) e Toto Piacente
(`admin`) hanno accesso completo senza grant aggiuntivo. I due manager
disattivati e il junior restano esclusi. Sono stati abilitati i quattro
manager attivi esistenti: un futuro manager richiede ancora l'abilitazione
esplicita, non è stata introdotta una concessione automatica per ruolo.

I numeri economici nel workspace non arrivano nemmeno in tabella: la VIEW
`clients_workspace` li azzera alla fonte.

---

## 3 · Cosa NON c'è (e i documenti dicono di sì)

Questa è la sezione che rende il documento utile. Tre cose descritte come
vive in `CLAUDE.md` o nei brief **non esistono nel codice**.

### Il portale cliente `/portale/**` è stato demolito **[verificato]**

Non esiste nessuna cartella `app/**/portale`. `middleware.ts:150` lo dichiara:

> *«Portale cliente e portale risorsa sono stati demoliti insieme al flusso
> progetto: finché non vengono ricostruiti, client/guest vedono solo il proprio
> profilo. Nessun redirect verso rotte inesistenti.»*

Un utente con ruolo `client` o `guest` che entra oggi viene mandato su
`/impostazioni/profilo` e **non può andare da nessun'altra parte**.

**`CLAUDE.md` è sbagliato su questo punto**: la sezione «Architettura portali»
elenca ancora `/portale/**` e `/risorsa/**` fra i quattro portali, descrive il
`PortalSwitcher`, l'anteprima `?client=<id>` per il super admin e i breadcrumb
che non attraversano il confine. Sono istruzioni su codice che non c'è.

**Conseguenza diretta sul brief «Portale cliente»**: la frase *«il percorso
/portale e le funzioni customer care risultano già citati nel documento
tecnico: verificarne stato e riuso»* ha una risposta netta — **del portale non
c'è niente da riusare**. Resta il customer care, che è vivo e sta dalla parte
interna.

### Il portale risorsa `/risorsa/**` non esiste **[verificato]**

Demolito insieme al precedente. `resource_profiles.can_access_resource_portal`
sopravvive nel database e in `components/hr/ResourceProfilesTab.tsx`: è un
permesso che non apre più nessuna porta.

### La chat interna non c'è più **[verificato]**

`/chat` fa `redirect('/customer-care')`, `SlackChat` è stato rimosso. Restano
vive le tabelle `chat_channels`/`chat_messages`, che tengono i canali
`customer_care`/`cliente` usati dal Customer Care, e i messaggi diretti
(`type='dm'`), leggibili solo dai due interlocutori — nemmeno dall'admin, ed è
nella RLS. Su questo `CLAUDE.md` è già corretto.

### Il commerciale ora c'è — prima versione in collaudo

La precedente descrizione «nessuna rotta, nessuna schermata» è superata dal
commit `573351e`. `/commerciale` e `/workspace/commerciale` condividono UI e
azioni: Oggi, pipeline/lista opportunità, ricerca e filtri, referenti,
follow-up, pause, esiti, storico e KPI con stime separate **[verificato nel codice]**.

Anagrafica e contatti restano canonici in `clients` / `client_contacts`.
Il lead crea atomicamente anagrafica, referente, canali e opportunità; gli
UUID di richiesta evitano duplicazioni sui retry. La vittoria non genera
contratti, fatture o MRR. La delivery richiede una conferma esplicita e collega
un progetto esistente oppure ne crea uno interno in bozza con PM e riepilogo.

`deals` e `deal_activities` erano assenti dal database: la migration commerciale
le ha ripristinate senza rieseguire la 011 o le sue policy aperte. Aggiunte
`sales_commands` e `sales_handoffs`, RLS e RPC privilegiate solo service role
**[verificato sul DB e nei test SQL]**.

**Collaudo utente in corso:** accesso alla pagina confermato, accettazione del
flusso completo ancora da concludere. Allegati/versionamento documentale,
integrazioni marketing, firma e funnel storico restano incrementi successivi.
Dettagli in `docs/commerciale.md`; il portale cliente viene dopo.

---

## 4 · Dati e migration

**198 file**, ultima numerata **224**. `080_*`, `081_*`, `092_*` e `223_*`
compaiono due volte. Le due 223 sono distinte: `223_recurring_milestones.sql`
(ricorrenze, già presente su main) e `223_sales_workspace.sql` (commerciale).
Prossimo numero libero: **225**. Usare sempre nome completo e schema reale.

**Applicazioni eseguite via MCP il 15 settembre [verificato]:**

| Ordine | Migration | Versione registrata |
|---|---|---|
| 1 | `224_profile_authorization.sql` | `20260915125653` |
| 2 | `223_sales_workspace.sql` | `20260915125709` |

La 221 era già presente nei suoi effetti: trigger e policy verificati, nessuna
riesecuzione. La 224 corregge anche `app_role` dai metadati e le modifiche
amministrative del proprio profilo (§7). La 222 ha già entrambe le colonne
`sales_split`, obbligatorie con default false: non rieseguita.

Il registro MCP inizialmente vuoto non provava un database vuoto. Prima delle
nuove applicazioni sono state lette le strutture reali; poi sono stati eseguiti
test su PostgreSQL isolato. Nessun account fittizio, ruolo esistente o dato
aziendale modificato dalle due migration. Successivamente, su richiesta
dell'utente, aggiunti soltanto i quattro grant commerciali descritti in §2.

**Vecchie pendenze documentali [verificato ora sul DB]:** esistono
`vat_settlements`, `pl_payouts`, `payment_allocations`, `f24_documents`,
`pl_revenue_lines.carried_at` e `pl_config.settled_from`. Non vanno ricreate
perché una riga storica le chiama ancora «da eseguire». Questa verifica prova
la presenza delle strutture, non certifica ogni backfill o data di applicazione.
Il dettaglio storico resta in `docs/migrations.md`.

> **§222 — «applicata» non vuol dire «c'è ancora».** Il reset del 2026-07-23
> (migration 146) ha ricreato tabelle portandosi via colonne e indici che il
> registro elenca come applicati. Prima di dare per esistente qualcosa aggiunto
> prima della 146, si verifica sul database.

---

## 5 · Automazioni, integrazioni e chiavi

La rilevazione iniziale riportava **16 variabili di produzione** e 4 di preview
su Coolify, contro **35** nomi nel codice: la configurazione non è stata
ricontrollata dopo il rilascio commerciale. La differenza non è tutta un problema — alcune hanno
un default sensato — ma tre assenze spengono funzioni che l'interfaccia mostra.

### Configurate nella rilevazione iniziale, non ricontrollate al rilascio

`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` ·
`SUPABASE_SERVICE_ROLE_KEY` · `NEXT_PUBLIC_APP_URL` · `NEXT_PUBLIC_SITE_URL` ·
`NEXT_TELEMETRY_DISABLED` · i sei `S3_*` (storage file) · `GROQ_API_KEY` ·
`GROQ_MODEL` · `VAULT_KEY` (cifratura chiavi tracking) · `TRACKING_CRON_SECRET`.

### Assenze della rilevazione iniziale, da ricontrollare

| Manca | Cosa spegne | Ripiego nel codice |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **Google Calendar**: `/api/google/auth`, `callback`, `events`, `webhook`. Il collegamento agenda non può funzionare | nessuno |
| `ASANA_PAT` | **Tutta la sezione `/asana`**, cioè il travaso in corso | nessuno: `app/actions/asana.ts:132` solleva «ASANA_PAT non configurato» |
| `COOLIFY_GIT_COMMIT` / `SOURCE_COMMIT` al build | `/api/version` rispondeva con SHA vuoto all'ultimo controllo (§1) | `git rev-parse`, che nel container non ha un `.git` |
| `ANTHROPIC_API_KEY` | Suggerimenti AI del Customer Care (`app/actions/cc-ai.ts`) | la funzione ritorna vuoto — **è documentato e voluto** |

I tre `TWOBEE_*` del tracking (GA4, Meta, Klaviyo) **non servono**: hanno il loro
default nel codice ed è l'endpoint ufficiale di ciascuna piattaforma.

### Lavori pianificati

**Su Coolify:** la rilevazione iniziale trovava `tracking-qa-daily`, `0 7 * * *`,
timeout 900s. L'elenco attuale non è stato ricontrollato. Il nuovo motore delle
ricorrenze espone `/api/recurrences/run` e richiede `RECURRENCE_CRON_SECRET` e
una schedulazione dedicata: configurazione da verificare, non creata dal deploy
commerciale.

**Su Supabase [verificato ora]:** `pg_cron` è installato e `cron.job` contiene:

| Lavoro | Schedule | Attivo |
|---|---|---|
| `sync-client-payment-status` | `20 3 * * *` | sì |
| `purge-completed-tasks` | `20 3 * * *` | sì |
| `purge-activity-log` | `40 3 * * *` | sì |

Questa verifica riguarda la **configurazione**, non l'ultima esecuzione riuscita.
Il vecchio `generate-recurring-tasks` non compare: il motore SQL è stato ritirato
dall'intervento ricorrenze (§337). Restano da controllare gli esiti dei job e
la schedulazione del motore applicativo.

---

## 6 · Qualità: cosa passa davvero

**Eseguiti il 15 settembre sul codice integrato di `573351e`** **[verificato]**:

| Gate | Comando | Esito |
|---|---|---|
| Tipi | `npx tsc --noEmit` | **0 errori**, exit 0 |
| Controlli di dominio | i **52** `lib/**/*.check.ts`, via loader `tsx` | **52 su 52**, letti dall'exit code |
| Action commerciali | `scripts/check-sales-actions.ts` | superato, confini Supabase simulati |
| SQL commerciale e sicurezza | `supabase/tests/223_sales.check.sql` e `224_profile_authorization.check.sql` | superati su PostgreSQL 16 isolato con struttura del DB reale 17.6; fixture annullate con ROLLBACK |
| Lint | `npm run lint` | **non è un gate**: `eslint-config-next` è installato, il file di configurazione non c'è, `next lint` apre la procedura interattiva |
| Build/deploy | Coolify dopo il push su `main` | completamento e pagina accessibile **[confermato dall'utente]**; log del nuovo build non riletti |

I 52 check coprono clienti, economics, compensi, cassa, IVA,
fiscale, payroll, tracking, AI e le guardie delle server action
(`lib/actions-guard.check.ts`, §329), commerciale e ricorrenze. I test SQL
provano isolamento owner, accesso manager, revoca/disattivazione, RPC service
role, audit con attore, retry e delivery senza contratti/MRR automatici.
Le migration sono state provate anche in riesecuzione. Il collaudo browser
completo è **in corso**, non ancora concluso.

---

## 7 · Sicurezza: com'è messa adesso

L'audit dell'11 settembre (`docs/audit-twobee-os.md`, commit `75e8f48`) ha
trovato quattro accessi indebiti. Le correzioni applicative sono nel codice;
per A-01 sono ora state verificate e completate anche le protezioni database.

| # | Cosa | Stato |
|---|---|---|
| A-01 | Ruoli amministrativi dai metadati dell'invito o dalla modifica del proprio profilo | **221 già presente, 224 applicata e verificata**: default guest/guest e guard sui campi amministrativi |
| A-02 | `getOrCreatePortal(clientId)` dava il token del portale ticket di qualunque cliente a chi avesse una sessione | corretto |
| A-03 | `/api/invite` scriveva il ruolo preso dal corpo della richiesta | corretto (ed è **codice morto** che però espone un endpoint) |
| A-04 | Due azioni AI senza alcun controllo | corretto |

**Segnalati e non corretti (P2)**:

- **`requireAdmin` / `requireStaff` esistono in copia locale in almeno dieci
  file** di `app/actions` (`activity`, `asana`, `clients`, `delete-client`,
  `os-versions`, `hr-requests`, `restore-entity`, `ad-hoc-tasks`,
  `milestones`…). Oggi le copie sono coerenti; il difetto è che sono dieci posti
  dove la prossima modifica può divergere. È lo stesso schema che §234 ha già
  risolto per le economics, dove di sette copie a una mancava il controllo.
- `/api/invite` è morto ma raggiungibile.
- Gli advisor segnalano ancora funzioni SECURITY DEFINER accessibili, funzioni
  senza search_path fisso e protezione password compromesse da valutare:
  il rilascio commerciale non certifica la sicurezza dell'intero sistema.

`channel_guests` e `ticket_portals` hanno le sole policy staff verificate.
La 224 protegge ruoli, email e altri campi amministrativi dai self-update,
lasciando modificabili i normali dati personali. Gli utenti esistenti non
sono stati promossi o retrocessi automaticamente.

**Mai misurato**: matrice ruolo × risorsa × azione oltre la colonna «server
action» (mancano API, RPC, Realtime, Storage, export) · performance, nessuna
baseline · accessibilità.

---

## 8 · Gli invarianti che reggono il sistema

Non sono stile: sono il motivo per cui i numeri tornano. Stanno per esteso in
`CLAUDE.md`, qui c'è la lista perché un documento di stato che non li nomina fa
credere che siano opzionali.

1. **Nessun valore economico si digita.** Contratti e rate sono l'unica
   scrittura; tutto il resto legge e dichiara la provenienza.
2. **Ogni server action economica chiama `requireEconomicsAdmin()`** — una
   funzione sola, non sette copie.
3. **Si può saltare il controllo di ruolo, o il client di servizio, non tutti e
   due** (§329). Un file `'use server'` esporta endpoint.
4. **Il ruolo non arriva mai dal client.**
5. **Chi scrive su una tabella con cronologia usa `createActorClient(userId)`**,
   o la modifica risulta «Sistema».
6. **Un numero plausibile e sbagliato è la sola categoria di errore che nessuno
   va a controllare**: quando una fonte manca si scrive «n/d», mai uno zero.
7. **Nessun colore scritto a mano.** Tema chiaro e scuro passano dai token.
8. **Il modello AI non si scrive nel codice**: sta in `lib/ai/model.ts`
   (`GROQ_MODEL`, default `qwen/qwen3.6-27b`).

---

## 9 · La documentazione: cosa è vivo e cosa mente

La tabella seguente conserva la rilevazione **precedente al rilascio commerciale**,
basata sull'ultimo commit per file. Non rappresenta le date attuali: `573351e`
aggiorna `CLAUDE.md`, stato, registro migration e audit, e aggiunge
`docs/commerciale.md`; questo documento recepisce ora il rilascio e il collaudo.

### Vivi — si aggiornano col codice

| File | Ultimo commit | Commit totali |
|---|---|---|
| `CLAUDE.md` | 2026-09-14 | **84** |
| `docs/stato.md` | 2026-09-14 | 20 |
| `docs/migrations.md` | 2026-09-14 | 9 |
| `docs/economics-compensi.md` | 2026-09-14 | 7 |
| `docs/operativita.md` | 2026-09-11 | 4 |
| `AGENTS.md` | 2026-09-11 | 2 |
| `docs/audit-twobee-os.md` | 2026-09-11 | 1 |
| `docs/economics-fiscale.md` | 2026-09-09 | 7 |
| `docs/HANDOFF_VPS.md` | 2026-09-09 | 5 |
| gli altri `docs/*.md` di dominio | 2026-09-07 | 1–2 |

**`CLAUDE.md` resta la fonte**, con l'eccezione dei portali (§3) e con la
struttura cartelle da ripassare: l'audit ha contato **cinque percorsi su
quindici che non esistono** e un elenco di `app/api/ai/**` interamente diverso
da quello reale.

### Morti — scritti una volta a luglio e mai più toccati

| Cartella | File | Ultimo commit |
|---|---|---|
| `docs/audit/` | 17 | 2026-07-11, **un commit ciascuno** |
| `docs/project-v2/` | 17 | 2026-07-24 |
| `docs/workspace/` | 9 | 2026-07-11 / 07-12 |
| in radice: `ARCHITECTURE_PLAN.md`, `DOCUMENTAZIONE.md`, `PROMPT_MODIFICHE.md`, `ANALISI_PORTALI.md`, `GUIDA_NON_SVILUPPATORE.md` | 5 | 2026-07-08 / 07-11 |

**48 file, circa il 70% della documentazione.** Descrivono un sistema con quattro
portali, un portale cliente da costruire in `/portale`, una chat interna a
quattro gruppi e un modello dati che il reset del 23 luglio ha già sostituito.

Il rischio non è che siano vecchi: è che sono **piani**, e un piano si legge come
un'istruzione. `docs/project-v2/15-CLIENT_PORTAL_PLAN.md` progetta esattamente
la cosa che i brief chiedono oggi — su un'architettura demolita da allora.
`AGENTS.md` lo dice già del proprio passato: *«non era vecchio, era sbagliato:
sono istruzioni, e un agente le esegue»*.

---

## 10 · Verifiche che restano da fare sul database

L'MCP Supabase è ora operativo. Sono stati verificati trigger/policy 221,
correzione 224, strutture e permessi commerciali, grant dei manager, presenza
delle vecchie strutture dubbie e configurazione `pg_cron`. Non sono più
pendenze di accesso al database.

**Restano:** esiti delle automazioni (non solo `active=true`), schedulazione
Coolify delle ricorrenze, SHA di build, collaudo completo commerciale e revisione
dei rilievi di sicurezza fuori dal modulo. Query utili per ripetere i controlli:

```sql
-- 1. pg_cron esiste? quali lavori girano davvero? (§5)
SELECT jobname, schedule, active FROM cron.job;

-- 2. definizione attuale dopo 224 e policy staff (§4, §7)
SELECT pg_get_functiondef(oid)
  FROM pg_proc WHERE proname = 'handle_new_user';
SELECT tablename, policyname, qual FROM pg_policies
 WHERE tablename IN ('channel_guests','ticket_portals');

-- 3. profili nati da metadati che nessuno ha dichiarato (§7)
SELECT id, email, role, app_role FROM public.profiles
 WHERE role = 'admin' AND app_role IS NULL;   -- l'esito atteso è: nessuna riga

-- 4. le sei migration contraddittorie (§4)
SELECT to_regclass('public.vat_settlements'), to_regclass('public.pl_payouts'),
       to_regclass('public.payment_allocations'), to_regclass('public.f24_documents');
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'pl_revenue_lines' AND column_name IN ('carried_at','sales_split');
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'pl_config' AND column_name = 'settled_from';
```

Per i test di scrittura usare esclusivamente le suite SQL su staging: non
creare fixture o cambiare ruoli reali per collaudare la produzione.

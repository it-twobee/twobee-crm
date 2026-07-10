# Prompt per Claude Code — Rework portali, chat, calendario, attività

> Copia tutto ciò che segue e incollalo come singolo messaggio in Claude Code.
> Se preferisci procedere per gradi, incolla il **Contesto** + un solo **Blocco** alla volta:
> i blocchi sono ordinati per dipendenza (B1 → B8) e ognuno è rilasciabile da solo.

---

## Contesto (leggi prima di scrivere codice)

Repo: `/Users/marcolucci/Claude_TwoBee_HQ_Room` — Next.js 14 App Router, TypeScript strict, Supabase, Tailwind.
Leggi `CLAUDE.md` prima di iniziare: contiene le convenzioni e il **design system a token**.

### Vincoli non negoziabili

1. **Nessun colore hardcoded.** Il progetto ha tema chiaro e scuro. Vietati `#hex`, `text-white`,
   `bg-red-500`, `text-black`, `style={{ color: '#F5C800' }}`. Usa i token: `bg-background`,
   `bg-surface`, `text-text-primary/secondary/tertiary`, `border-border`, `text-success|error|warning|info|accent`.
   Il gold ha **due** token e non sono intercambiabili: `bg-gold` + `text-on-gold` per i riempimenti,
   `text-gold-text` per testo e icone. Tipografia mai sotto `text-2xs` (12px).
2. **Accessibilità**: contrasto WCAG AA in entrambi i temi, `:focus-visible` su ogni interattivo,
   `aria-label` sui bottoni con la sola icona, drag-and-drop con alternativa da tastiera.
3. **Sicurezza dei dati** (da `CLAUDE.md`, vale su ogni schermata che tocchi):
   - `isSuperAdmin()` → `SUPER_ADMIN_EMAILS = ['m.lucci@twobee.it']` OPPURE `app_role === 'super_admin'`.
   - `marco.d.lucci@gmail.com` è un account di sviluppo, **non** è super admin.
   - Il **cliente** non deve MAI vedere: costi interni, marginalità, note private, dati di altri clienti.
   - Una **risorsa esterna** non deve vedere: marginalità, costi di altre risorse, MRR, strategia interna.
   - Solo Founder/SuperAdmin: margini, costi risorse, costi business, fatture specifiche, preventivi, compensi.
   - Gli utenti workspace vedono al massimo: MRR macro aggregato, fatturato totale, obiettivo revenue,
     % avanzamento. Mai il dato per singolo cliente.
   - Le sezioni non autorizzate devono essere **invisibili**, non visibili-ma-bloccate.
   - Ogni nuova tabella nasce con RLS abilitata. Insert su `chat_channels` richiede `createAdminClient()`.
4. **Migrations**: attenzione, esistono già numeri duplicati (`080_*` ×2, `081_*` ×2).
   **Il prossimo numero libero è `087`.** Numera in sequenza da lì e non riusare numeri.
   Ogni migration è idempotente (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` prima di `CREATE POLICY`).
5. **Verifica prima di dichiarare fatto**: `npx tsc --noEmit` pulito e `npm run build` verde.
   Per le modifiche visibili, apri la pagina, cambia tema e controlla il contrasto sul DOM renderizzato
   (gli screenshot mentono; le transizioni CSS falsano `getComputedStyle` — disabilitale con
   `* { transition: none !important }` prima di misurare).
6. **Non fare `git push` senza che io te lo chieda.** Commit atomici, uno per blocco.

### Mappa del codice rilevante

| Cosa | Dove |
|---|---|
| Routing per ruolo | `middleware.ts` |
| Ruoli e helper | `lib/permissions.ts` (`AppRole`, `SUPER_ADMIN_EMAILS`, `isSuperAdmin`) |
| Tipi DB | `lib/types/database.ts` (`ChannelType`, `ChatChannel`, `AppRole`…) |
| Sidebar admin | `components/shared/Sidebar.tsx` |
| Sidebar workspace | `components/workspace/WorkspaceSidebar.tsx` (guidata da tabella `workspace_sections`) |
| Rotte workspace | `app/(workspace)/workspace/**` |
| Portale cliente | `app/portale/`, `components/portale-cliente/ClientPortalView.tsx` |
| Chat | `components/chat/ChatLayout.tsx`, `SlackChat.tsx`, `ChatBridgeWidget.tsx` |
| Le mie attività | `components/tasks/MieAttivitaClient.tsx` (viste: elenco/bacheca/timeline/calendario/analitica) |
| Calendario | `components/calendario/CalendarioClient.tsx` |
| Portfolio | `components/progetti/PortfolioClient.tsx` (996 righe) |
| Google Calendar | `app/api/google/{auth,callback,events}` — refresh token in `profiles.google_refresh_token` |

Librerie: c'è `date-fns`. **Non** c'è una libreria di drag-and-drop: se serve, installa `@dnd-kit/core`
+ `@dnd-kit/sortable` (supporta la tastiera, a differenza di react-beautiful-dnd che è deprecato).

### Prima di iniziare: tre domande da farmi

Non indovinare, chiedimi:

1. **"White label dedicata"** per i collaboratori: intendi un branding sostituibile per collaboratore
   (logo/colori del loro studio), oppure semplicemente che i collaboratori usano `/workspace` come
   i dipendenti? Cambia radicalmente il lavoro nel Blocco 1.
2. **Calendari dei colleghi**: per vedere gli appuntamenti Google di un collega serve che *lui* abbia
   connesso il suo Google. Se non l'ha fatto, mostro solo gli eventi interni? E gli appuntamenti privati
   di un collega li mostro come "occupato" senza titolo, o con il titolo completo?
3. **Buste paga**: confermi che ogni dipendente deve vedere **solo le proprie** e che solo
   admin/super_admin possono caricarle per conto di altri?

---

## Blocco 1 — Accessi e switch tra portali

**Obiettivo.** L'accesso al tool completo è riservato agli admin. Dipendenti e collaboratori usano solo
`/workspace`. Il super admin, e solo lui, può passare da un portale all'altro.

### 1a. Gating degli accessi (`middleware.ts`)

Oggi il middleware ha già una logica per ruolo, ma va resa esplicita e coerente:

- `super_admin`, `founder`, `admin` → accesso completo (tutte le rotte).
- `manager`, `senior`, `junior`, `stage`, `freelance`, `partner` → **solo** `/workspace/**`,
  `/onboarding`, `/impostazioni/profilo`. Qualunque altra rotta redirige a `/workspace`.
- `client`, `guest` (non risorsa) → **solo** `/portale/**`.
- Risorsa esterna (`guest` con `resource_profiles.can_access_resource_portal`) → **solo** `/risorsa/**`.

Nota: `partner` oggi **non** è nell'array `WORKSPACE_ROLES` del middleware — aggiungilo o, se i partner
devono avere un portale separato, dimmelo prima di procedere.

Il gating server-side è la fonte di verità: non affidarti al nascondere le voci di menu.

### 1b. Switch portali (solo super admin)

Nuovo componente `components/shared/PortalSwitcher.tsx`:

- Visibile **solo** se `isSuperAdmin(profile)` è vero. Per chiunque altro non deve essere renderizzato
  (niente `disabled`, niente `hidden`: proprio assente dall'albero).
- Dropdown con tre destinazioni: **Admin** (`/dashboard`), **Portale Operativo** (`/workspace`),
  **Portale Cliente** (`/portale`). Evidenzia quello attivo.
- Montalo in tre punti: `components/shared/Sidebar.tsx`, `components/workspace/WorkspaceSidebar.tsx`
  e nel portale cliente (`components/portale-cliente/ClientPortalView.tsx` o il suo layout).
- Il middleware deve permettere al super admin di raggiungere `/portale` (oggi lo staff viene
  rimbalzato su `/dashboard`): aggiungi un'eccezione esplicita per il super admin.
- Se il portale cliente ha bisogno di un cliente selezionato per rendere, fai scegliere il cliente
  da un secondo select oppure atterra sul primo cliente attivo. Non far crashare la pagina.

**Fatto quando**: un utente `junior` che digita `/dashboard` finisce su `/workspace`; un `client` che
digita `/workspace` finisce su `/portale`; il super admin vede lo switcher nei tre portali e ci naviga;
nessun altro ruolo vede lo switcher nell'HTML servito.

---

## Blocco 2 — Logo unico

**Obiettivo.** Il logo TwoBee deve essere ovunque quello ufficiale di `www.twobee.it`.

`public/logo.svg` oggi è un segnaposto disegnato a mano (esagono + "2B"), **non** è il logo reale.

1. Scarica il logo reale dal sito. Cerca in ordine: `<link rel="icon">`, `<img>` nell'header,
   il `logo` referenziato nel CSS, `og:image`. Se è un SVG, salvalo così com'è; se è PNG, prendi la
   risoluzione più alta disponibile.
2. Salva in `public/logo.svg` (e, se serve, `public/logo-mark.svg` per la versione compatta/icona usata
   nella sidebar collassata, più `public/favicon.ico` se differisce).
3. Il logo deve leggersi su fondo chiaro **e** scuro. Se l'originale è monocromatico, usa
   `currentColor` o due varianti scambiate via `[data-theme]`. Non incorporare colori fissi che
   spariscono in uno dei due temi.
4. Sostituisci **tutti** i punti dove oggi il marchio è testo o segnaposto — almeno:
   `components/shared/Sidebar.tsx` (`two bee.`), `components/workspace/WorkspaceSidebar.tsx`,
   il portale cliente, le pagine di login/registrazione, `app/layout.tsx` (metadata/favicon).
   Cercali con `grep -rn "two bee\|logo.svg" app components`.

Se il sito blocca il download o il logo non è recuperabile, **fermati e dimmelo**: non inventare un
logo nuovo.

**Fatto quando**: nessun marchio testuale residuo, il logo rende correttamente nei due temi, favicon aggiornata.

---

## Blocco 3 — "Le mie attività": Bacheca e Timeline

File: `components/tasks/MieAttivitaClient.tsx` (viste in `type View`, componenti `BachecaView`, `TimelineView`).

### 3a. Bacheca (kanban)

- **Layout e responsive.** Oggi non regge su schermi stretti. Su desktop: colonne affiancate a larghezza
  uguale, con scroll verticale *interno* alla colonna e header di colonna sticky (titolo + contatore).
  Su tablet: scroll orizzontale con `scroll-snap` sulle colonne. Su mobile (`< 640px`): una colonna alla
  volta con un selettore di stato in alto (tab o segmented control). Il body della pagina non deve mai
  scrollare in orizzontale.
- **Drag & drop con conferma.** Installa `@dnd-kit/core` + `@dnd-kit/sortable`. Trascinando una task in
  un'altra colonna si apre una **modale di conferma** che dichiara il cambio (`"Sposto «Titolo» da
  In corso a Completato?"`) con Annulla / Conferma.
  - Aggiorna lo stato **solo dopo** la conferma. Se l'utente annulla, la card torna al suo posto.
  - Se preferisci l'ottimismo: sposta subito e fai rollback su annullamento o su errore Supabase.
    Scegli una delle due e sii coerente; non lasciare la card in uno stato intermedio.
  - Accessibilità: `@dnd-kit` supporta il drag da tastiera — mantienilo funzionante e annuncia lo
    spostamento con un live region.
  - Il drag deve reggere anche il touch (sensore `PointerSensor` con `activationConstraint` per non
    confondere tap e drag).

### 3b. Timeline

Aggiungi ciò che manca oggi:

- **Numeri dei giorni e nomi dei giorni** sull'asse (es. `LUN 6`, `MAR 7`), con il mese come intestazione
  di gruppo quando la finestra attraversa più mesi.
- **Linee guida verticali** in corrispondenza di ogni giorno (griglia leggera, `border-border`), più
  marcate a inizio settimana; **weekend** con fondo appena diverso (`bg-surface-hover`).
- **Linea "oggi"** verticale evidenziata (usa `bg-error` o `bg-gold`, purché superi 3:1 sul fondo).
- Mantieni i due livelli di zoom giorno/mese già presenti nella timeline del workspace
  (`components/workspace/WorkspaceProjectsClient.tsx` ha un'implementazione simile: riusa la logica,
  non duplicarla — estrai un componente condiviso se conviene).
- Contenitore con `overflow-x-auto` e `min-width` interna: la pagina non scrolla lateralmente.

**Fatto quando**: bacheca usabile a 375px e a 1440px; drag+conferma funziona con mouse, touch e tastiera;
la timeline mostra giorni numerati, griglia, weekend e linea di oggi.

---

## Blocco 4 — Calendario in stile Google Calendar

File: `components/calendario/CalendarioClient.tsx`. Riferimento visivo: Google Calendar in tema scuro
(vista Mese). **Non copiare i colori di Google**: usa i token TwoBee.

- **Layout mese** come nello screenshot: griglia 7 colonne con intestazioni `DOM…SAB`, numero del giorno
  in alto, eventi come righe compatte con pallino colorato + orario + titolo troncato, e la riga
  **"+N in più"** quando gli eventi eccedono lo spazio della cella (cliccando si apre il popover del giorno).
  Giorno corrente evidenziato con il numero dentro un cerchio pieno (`bg-gold` + `text-on-gold`).
- **Barra superiore**: `Oggi` + frecce `‹ ›` + titolo "Luglio 2026" + selettore vista (Giorno/Settimana/Mese)
  + ricerca. Mantieni le viste già esistenti se ci sono.
- **Selezione multipla dei colleghi.** Pannello laterale "I miei calendari" con una checkbox per collega
  (mostra solo i profili attivi). Ogni collega ha un colore stabile e distinguibile, derivato dal suo `id`
  (palette accessibile, non i colori Tailwind grezzi). Selezionando più colleghi, gli eventi si sovrappongono
  nella stessa griglia con il colore del proprietario e una legenda.
- **Google Calendar per collega.** L'integrazione esiste (`app/api/google/*`, refresh token in
  `profiles.google_refresh_token`). Estendi `/api/google/events` per accettare una lista di `profile_id`
  e restituire gli eventi di ciascuno usando il *suo* refresh token, lato server.
  - Rifiuta la richiesta se il richiedente non ha diritto di vedere quel collega.
  - Se un collega non ha collegato Google, non fallire l'intera risposta: restituisci per lui un array
    vuoto e segnalalo nella UI ("Google non collegato").
  - Non esporre mai i refresh token al client.
  - **Privacy**: chiarisci con me (domanda 2 sopra) se gli eventi privati altrui vanno mostrati con titolo
    o come "Occupato". Fino a risposta, mostra **"Occupato"** senza titolo né partecipanti.
- **Task personali**: restano personali, **non visibili per default**. Una checkbox dedicata
  ("Mostra le mie task") le fa comparire. Le task di un collega non sono mai visibili a nessun altro.

**Fatto quando**: la vista mese somiglia allo screenshot ma con i token TwoBee; posso spuntare 3 colleghi
e vedere i loro eventi sovrapposti con colori distinti; le task compaiono solo se attivo la checkbox.

---

## Blocco 5 — Chat: nuova architettura in stile Slack

File: `components/chat/ChatLayout.tsx`, `SlackChat.tsx`. Riferimento visivo: Slack (screenshot), estetica TwoBee.

### 5a. Struttura dei canali (questa è la parte importante)

La sidebar chat deve avere **quattro gruppi**:

1. **Team** — canali aziendali fissi:
   - `#team-intern` — chat generale del team
   - `#angolo-informativo` — comunicazioni/informazioni
   - `#best-ideas` — *raccoglitore* di link, screenshot e documenti (vedi 5c)
2. **Progetti** — per ogni progetto **un solo canale**: la chat **interna di team** di quel progetto.
   Niente altro tipo di canale qui dentro.
3. **Messaggi diretti** — DM 1-a-1 fra membri del team (nuovo, oggi non esiste).
4. ~~Customer Care~~ — **rimuovila dalla chat.** Il customer care resta nella sua sezione
   (`/customer-care`, `/customer-care/tickets`). Nella chat non deve comparire.

Implicazioni sul DB (`chat_channels.type` è `ChannelType` in `lib/types/database.ts`,
oggi: `'cliente' | 'interno' | 'task' | 'customer_care' | 'cliente_interno' | 'partner_customer_care'`):

- Migration `087_chat_rework.sql`:
  - estendi il tipo con `'team'` (canali aziendali) e `'dm'`;
  - tabella `chat_dm_participants (channel_id, profile_id)` con unique `(channel_id, profile_id)`
    e indice su `profile_id`, per i DM;
  - seed idempotente dei tre canali team (`team-intern`, `angolo-informativo`, `best-ideas`);
  - RLS: un DM è leggibile **solo** dai suoi partecipanti; i canali `team` da chi ha accesso al workspace;
    il canale progetto solo da chi è assegnato al progetto (o admin).
- **Non cancellare** i canali `customer_care` esistenti: vanno solo esclusi dalla query della chat,
  perché la sezione Customer Care continua a usarli.
- Ricorda: `INSERT` su `chat_channels` richiede `createAdminClient()` server-side.

### 5b. UI

- Sidebar canali con gruppi collassabili, badge non letti, ricerca, canale attivo evidenziato.
- Colonna messaggi: raggruppamento per autore e per giorno (divisore "Oggi"/"Ieri"), avatar, orario,
  hover-toolbar (reazione, rispondi in thread, segnalibro, altro), thread con contatore risposte,
  composer con toolbar formattazione. Prendi le proporzioni dallo screenshot Slack.
- Estetica TwoBee: token del design system, nessun colore Slack.

### 5c. Canale `#best-ideas`

Non è una chat normale: è un raccoglitore. Ogni messaggio è una "risorsa" con
link **oppure** allegato (screenshot/documento) + titolo + tag opzionali.
Vista a griglia di card con anteprima (og:image per i link, thumbnail per le immagini), filtro per tag
e ricerca. Salva gli allegati su Supabase Storage con RLS coerente.

**Fatto quando**: vedo i 4 gruppi, i DM funzionano fra due utenti reali, ogni progetto ha esattamente
un canale interno, il customer care non appare più nella chat ma continua a funzionare nella sua sezione.

---

## Blocco 6 — Portfolio dinamico

File: `components/progetti/PortfolioClient.tsx` (996 righe: valuta di spezzarlo).

Oggi il portfolio è statico. Deve diventare **dinamico** e **suggerire pattern** con cui raccogliere i progetti.

- Raggruppamento dinamico scelto dall'utente: per **cliente**, per **tipo** (`project_kind`: growth/digital),
  per **stato**, per **manager**, per **tag**, per **trimestre** di consegna.
- **Pattern suggeriti**: analizza i progetti esistenti e proponi raggruppamenti utili — es. "8 progetti
  Growth attivi", "5 progetti in scadenza questo trimestre", "3 progetti senza manager assegnato",
  "progetti con tag comune X". Ogni suggerimento è cliccabile e applica il filtro corrispondente.
  Derivali con logica deterministica (conteggi e soglie), **non** con una chiamata AI: devono essere
  istantanei e spiegabili. Mostra sempre *perché* un pattern è suggerito (il conteggio).
- Le raccolte create dall'utente vanno persistite: migration `088_portfolio_collections.sql` con
  `portfolio_collections (id, name, filter jsonb, created_by, created_at)` + RLS.
- Vista a griglia/lista commutabile, ricerca, stato vuoto curato.

**Fatto quando**: cambio il criterio di raggruppamento e la griglia si riorganizza; i pattern suggeriti
riflettono i dati veri; una raccolta salvata sopravvive al reload.

---

## Blocco 7 — Portale Operativo (`/workspace`)

Il portale dei **dipendenti, collaboratori e partner**. La sidebar è guidata dalla tabella
`workspace_sections` (migration 079) e resa da `components/workspace/WorkspaceSidebar.tsx`:
per aggiungere voci servono sia le righe in tabella (migration) sia le rotte.

### 7a. Struttura della sidebar (da rispettare esattamente)

```
Dashboard              ← dashboard della risorsa (non quella admin)
Lavori
  Le mie attività
  Calendario
  Chat
  Progetti
  Portfolio
  Documenti
Clienti
  Clienti attivi
  Customer Care
  Ticket
Team
  Richieste HR
  Buste Paga          ← nuovo
  Documenti Personali ← nuovo
  Cronologia          ← nuovo
Profilo               ← da sviluppare
```

Rotte già esistenti: `attivita`, `calendario`, `chat`, `progetti`, `documenti`, `clienti`,
`customer-care`, `customer-care/tickets`, `hr`, `task`.
Mancano: `portfolio`, `buste-paga`, `documenti-personali`, `cronologia`, `profilo`.

Ogni pagina nuova deve applicare il filtro dati sul **profilo corrente** e rispettare le regole di
sicurezza: nessun dato di altre risorse, nessuna marginalità, nessun MRR per cliente.

### 7b. Buste Paga (`/workspace/buste-paga`)

- Migration `089_payslips.sql`: `payslips (id, profile_id, year, month, file_path, uploaded_by,
  uploaded_at, notes)`, unique `(profile_id, year, month)`, indice su `profile_id`.
- **RLS**: il dipendente legge **solo le proprie** (`profile_id = auth.uid()`); solo admin/super_admin
  possono inserire, aggiornare, eliminare e leggere quelle altrui.
- Storage: bucket privato `payslips` (crealo dal Dashboard Supabase — non è creabile da migration).
  Policy sul bucket coerenti con la tabella. Download tramite **signed URL** a scadenza breve,
  generato server-side. Mai URL pubblici: sono dati retributivi.
- UI dipendente: elenco per anno, raggruppato per mese, download. UI admin: upload per dipendente/mese.

### 7c. Documenti Personali (`/workspace/documenti-personali`)

Documenti della risorsa con **scadenze e rinnovi** (carta d'identità, permesso di soggiorno,
visita medica, certificazioni, contratto…).

- Migration `090_personal_documents.sql`: `personal_documents (id, profile_id, doc_type, label,
  file_path, issued_at, expires_at, reminder_days_before, created_at)`.
- RLS come sopra: ognuno vede solo i propri; admin/HR possono vedere tutti **solo se** mi confermi
  che è quello che vuoi (altrimenti: solo il proprietario).
- UI: elenco con badge di stato — `Valido` / `In scadenza fra N giorni` (soglia `reminder_days_before`,
  default 30) / `Scaduto`, con i token `success` / `warning` / `error`.
- Un banner in cima alla Dashboard workspace se esiste almeno un documento scaduto o in scadenza.

### 7d. Cronologia (`/workspace/cronologia`)

La risorsa vede **solo le proprie** attività e può richiamarle, modificarle o eliminarle.
Esiste già una cronologia admin (`/impostazioni/cronologia`): riusa la stessa sorgente
(cerca la tabella di activity log con `grep -rn "activity" supabase/migrations lib/types/database.ts`)
filtrando per `profile_id = auth.uid()`. Non creare una tabella nuova se ce n'è già una.

- Elenco cronologico con filtro per tipo e periodo, azione "Apri" verso l'entità originale,
  modifica ed eliminazione **solo** delle proprie voci, con conferma per l'eliminazione.

### 7e. Profilo (`/workspace/profilo`)

Dati personali (nome, avatar, contatti), competenze/skill, ruolo e seniority in sola lettura,
connessione Google Calendar (collega/scollega), preferenze (tema).
Il ruolo **non** è modificabile dall'utente.

### 7f. Dashboard risorsa

Deve mostrare le sue cose: task di oggi e in scadenza, i suoi progetti, prossimi appuntamenti,
richieste HR aperte, alert documenti in scadenza. Nessun dato aggregato aziendale oltre a quanto
concesso dalle regole di sicurezza.

**Fatto quando**: la sidebar rispecchia esattamente l'albero sopra; un dipendente non riesce a leggere
la busta paga di un collega nemmeno chiamando l'API a mano; le scadenze documenti generano l'avviso.

---

## Blocco 8 — Chiusura

1. `npx tsc --noEmit` pulito, `npm run build` verde.
2. Audit contrasto su almeno: `/workspace`, `/workspace/attivita`, `/calendario`, `/chat`, `/portfolio`
   — 0 violazioni AA in entrambi i temi.
3. Verifica di sicurezza manuale: con un utente `junior`, prova a raggiungere `/dashboard`,
   `/controllo-gestione`, la busta paga di un altro, il DM di altri. Devono fallire **server-side**.
4. Aggiorna `CLAUDE.md`: nuova architettura chat, nuove tabelle, nuove rotte workspace.
5. Commit atomici per blocco, messaggi in italiano, nessun push senza mio ok.

---

## Ordine consigliato

`B1` (accessi, sblocca il resto) → `B2` (logo, veloce) → `B7` (struttura workspace) →
`B3` (attività) → `B5` (chat, il più grosso) → `B4` (calendario) → `B6` (portfolio) → `B8` (chiusura).

Se un blocco si rivela più grande del previsto, **fermati e dimmelo** invece di consegnare metà lavoro.

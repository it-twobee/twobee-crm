# TWO BEE Gestionale — Analisi funzionale dei portali e piano di stabilizzazione

> Documento di audit. Fotografa lo stato reale del codice e del DB alla data di
> stesura, e propone le ultime modifiche per portare la piattaforma a uno stato
> stabile e pronto all'uso quotidiano. Ogni affermazione è verificata su codice,
> middleware o database — non su assunzioni.

---

## 1. Architettura: quattro portali, un gate

L'app serve quattro esperienze separate, decise dal **ruolo** dell'utente. Il
routing è imposto in **`middleware.ts`** (server-side) e ribadito nei layout:
nascondere una voce di menu non è mai una barriera.

| Portale | Rotte | Ruoli (`app_role`) | `role` grezzo |
|---|---|---|---|
| **Admin** | `/dashboard` e tutto il resto | `super_admin`, `founder`, `admin` | `admin` |
| **Operativo (Workspace)** | `/workspace/**` e nient'altro | `manager`, `senior`, `junior`, `stage`, `freelance`, `partner`, `viewer` | `team` |
| **Cliente** | `/portale/**` | `client`, `guest` non-risorsa | `client` / `guest` |
| **Risorsa esterna** | `/risorsa/**` | `guest` con `resource_profiles.can_access_resource_portal` | `guest` |

**Fonte di verità dei ruoli:** `lib/permissions.ts`.
- `ADMIN_ROLES`, `WORKSPACE_ROLES`, `CLIENT_ROLES`
- `coarseRole(app_role) → role` — usata da registrazione (`/api/invite/accept`),
  cambio ruolo admin (`adminUpdateUserProfile`) e implicitamente dal middleware.
- Regola chiave (già attiva): **ogni utente `role='team'` non-admin è confinato a
  `/workspace`**, non solo quelli in `WORKSPACE_ROLES`. Un `viewer` non raggiunge
  più il tool admin.

Solo il **super admin** vede il `PortalSwitcher` e può entrare in `/portale` in
anteprima (scegliendo il cliente da `?client=<id>`).

---

## 2. Portale Admin — `/dashboard`

**Chi:** `super_admin`, `founder`, `admin` (+ `manager` per alcune viste operative).

### Funzionalità (rotte reali)
- **Dashboard** — 17 query parallele, grid drag/resize con template, widget
  (Company Pulse, Client Health, Delivery Radar, Team Capacity, Alert, AI chat).
- **Clienti** — lista + dettaglio `[id]` a tab (Panoramica, KPI, Fatturazione,
  Documenti, Anagrafica, Relazione) + progetto `[projectId]`.
- **Progetti / Portfolio** — CRUD progetti, portfolio con raccolte dinamiche e
  pattern suggeriti (deterministici).
- **Le mie attività** — 5 viste (elenco, bacheca drag&drop, timeline, calendario,
  analitica).
- **Workload** *(nuovo)* — progetti in parallelo, effort, timeline interattiva,
  carico per risorsa. Editing riservato al PM/manager/admin.
- **Calendario** — stile Google, agende colleghi multi-select, task personali.
- **Chat** — Team / Progetti / Messaggi diretti / #best-ideas.
- **Commerciale** (deal, preventivi), **Fatturazione**, **Controllo Gestione**
  (margini/costi — founder/super_admin), **Soldi/costi-risorse**.
- **Customer Care** + Ticket.
- **HR** (+ timesheet), **Reparti** (growth/marketing/digital/ai).
- **Direzione** — Strategia & OKR, Roadmap, Decision Center.
- **Sistema** — Feedback, Impostazioni, Cronologia, TwoBee OS.

### Confini di sicurezza
- Founder/super_admin **only**: margini, costi risorse, costi business, fatture
  specifiche, preventivi, compensi.
- `PortalSwitcher` e `/portale` in anteprima: **solo** super admin.

**Stato:** ✅ maturo. È il portale più completo.

---

## 3. Portale Operativo (Workspace) — `/workspace/**`

**Chi:** dipendenti, collaboratori, partner (`manager`…`partner`, `viewer`).
È anche la **white label** dei collaboratori (stesso portale, nessun dato admin).

### Sidebar (gruppi)
```
Dashboard            ← dashboard della risorsa
Lavori
  Le mie attività · Calendario · Progetti · Portfolio · Workload · Documenti
Clienti
  Clienti attivi · Customer Care · Ticket
Team
  Richieste HR · Buste Paga · Documenti Personali · Cronologia
Profilo
```
La sidebar è guidata da `workspace_sections` (con `group_key`/`group_order`); il
layout inietta `workload` come fallback e nasconde `chat` e `task` globale.

### Funzionalità dedicate
- **Buste Paga** — solo le proprie; upload admin; download via **signed URL** a
  scadenza breve (mai URL pubblici).
- **Documenti Personali** — scadenze e rinnovi con stato (valido / in scadenza /
  scaduto), owner-only.
- **Cronologia** — le proprie attività, richiamabili.
- **Workload** — la risorsa vede solo i progetti su cui lavora o che gestisce;
  admin/manager vedono tutto. Nessun dato economico.
- **Search ⌘K** *(nuovo)* — barra in cima, cerca clienti/progetti/task/documenti
  con rotte `/workspace/*`; RLS scopa i risultati.

### Confini di sicurezza
- Mai marginalità, costi altrui, MRR per cliente, strategia interna.
- I `team` leggono clienti/progetti/task (migration `092_workspace_team_read_all`),
  ma la **scrittura** delle task resta scoped; l'editing Workload è gated al PM.

**Stato:** ✅ funzionale. Vedi §7 per i ritocchi.

---

## 4. Portale Cliente — `/portale`

**Chi:** `client` (e `guest` non-risorsa). Il super admin vi accede in anteprima.

### Funzionalità
Vista a tab in `ClientPortalView`: Panoramica, Progetti, Da fare (task cliente),
Aggiornamenti, Chat (customer care), Documenti, Report/KPI, Fatture.
Un solo `page.tsx`: i dati sono filtrati per `client_assignments` e RLS.

### Confini di sicurezza
Il cliente non vede **mai**: costi interni, marginalità, note private, dati di
altri clienti. La chat è solo il canale customer care del proprio progetto.

**Stato:** ✅ funzionale. Manca il selettore di tema (§7).

---

## 5. Portale Risorsa esterna — `/risorsa`

**Chi:** `guest` con `resource_profiles.can_access_resource_portal`.

### Funzionalità
Dashboard, Le mie attività, Progetti, Documenti, Timesheet.

### Confini di sicurezza
Non vede: marginalità, costi di altre risorse, MRR, strategia interna. Degli
eventi calendario altrui vede solo "Occupato".

**Stato:** ⚠️ il più snello. Manca il selettore di tema (§7).

---

## 6. Matrice dati sensibili (chi vede cosa)

| Dato | Admin/Founder | Manager | Team | Cliente | Risorsa |
|---|:---:|:---:|:---:|:---:|:---:|
| Margini / costi risorse / compensi | ✅ (founder+) | ❌ | ❌ | ❌ | ❌ |
| Fatture specifiche / preventivi | ✅ | ❌ | ❌ | proprie | ❌ |
| MRR per cliente | ✅ | ❌ | ❌ | ❌ | ❌ |
| MRR macro aggregato | ✅ | ✅ | ✅ | ❌ | ❌ |
| Clienti/progetti/task (lettura) | ✅ | ✅ | ✅ | propri | propri |
| Scrittura task | ✅ | ✅ (PM) | scoped | ❌ | proprie |
| Buste paga / doc personali altrui | ✅ | ❌ | ❌ | — | — |
| Eventi Google colleghi | solo "Occupato" | " | " | ❌ | ❌ |
| DM di altri | ❌ (nemmeno admin) | ❌ | ❌ | — | — |

---

## 7. Stato infrastruttura & DB

### Migration (086–095) — **APPLICATE** ✅
Verificato sul DB: `decisions`, `payslips`, `personal_documents`,
`google_credentials`, `chat_dm_participants`, `chat_best_ideas`, `feedback`
esistono. Numerazione: `080/081/092` duplicati; prossimo libero **096**.

### Bucket storage privati — **DA VERIFICARE A MANO**
Servono privati: `payslips`, `personal-documents`, `best-ideas`. Le migration non
creano bucket. `hr-attachments`, `documents`, `chat-attachments` sono già usati.
→ Controlla in Supabase → Storage che i tre nuovi esistano e siano **privati**.

### Env Google sul deploy — **DA CONFIGURARE** 🔴
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` (dominio reale)
+ redirect URI `https://<dominio>/api/google/callback` in Google Console.
Finché mancano: il calendario mostra solo eventi interni e la connessione fallisce
(ora con messaggio leggibile, non più errore 400 di Google).

---

## 8. Ultime modifiche per la stabilità (prioritizzate)

### 🔴 P0 — bloccanti per l'uso reale
1. **Configurare le env Google sul deploy** (§7). Senza, il calendario è mutilo.
2. **Verificare i tre bucket privati** (`payslips`, `personal-documents`,
   `best-ideas`): senza, buste paga / doc personali / best-ideas danno errore di
   upload/download.
3. **Assegnare un PM ai progetti** (`projects.manager_id`): oggi **0/4**. Senza,
   nel Workspace nessuno può modificare le task dal Workload (editing gated al PM).

### 🟠 P1 — qualità e completezza
4. **Stime ore sulle task** (`estimated_hours`): oggi **0/46** → il Workload usa
   il default di 4h/task, quindi l'effort è approssimato. Aggiungere il campo
   "ore stimate" ben visibile nel form task e popolarlo sui progetti attivi.
5. **Selettore di tema nei portali Cliente e Risorsa**: oggi assente in entrambi.
   Montare `ThemeToggle` nell'header di `ClientPortalView` e in `RisorsaNav`.
6. **Onboarding del PM**: quando un progetto non ha PM, mostrare un hint nel
   Workload ("assegna un responsabile") con link alla modifica progetto.

### 🟡 P2 — rifiniture
7. **Timesheet**: esiste in admin e risorsa; valutare se serve anche nel workspace
   (oggi la voce è nascosta). Decisione di prodotto.
8. **Consolidare i numeri di migration duplicati** in un README dello schema per
   evitare futuri conflitti (già annotato in CLAUDE.md).
9. **Audit accessibilità** sulle sezioni nuove (Workload, buste paga, doc
   personali) nei due temi — il resto è già a 0 violazioni WCAG AA.
10. **Portale Risorsa**: è il più scarno; se cresce l'uso, allinearlo al Workspace
    (profilo, documenti personali) o dichiararlo esplicitamente minimale.

---

## 9. Checklist pre-lancio

- [ ] Env Google impostate sul deploy + redirect URI in Console
- [ ] Bucket `payslips`, `personal-documents`, `best-ideas` esistono e sono privati
- [ ] Ogni progetto attivo ha un `manager_id` (PM)
- [ ] Task dei progetti attivi con `estimated_hours` popolato
- [ ] `ThemeToggle` in portale Cliente e Risorsa
- [ ] Prova end-to-end per ruolo: login come `senior` → confinato a `/workspace`;
      come `client` → solo `/portale`; come super admin → i tre portali via switcher
- [ ] `npm run build` verde (già verificato) e deploy Vercel/host aggiornato

---

## 10. Riferimenti nel codice

| Cosa | Dove |
|---|---|
| Gate per ruolo | `middleware.ts` |
| Ruoli / coarseRole | `lib/permissions.ts` |
| Workload (calcoli / UI / dati) | `lib/workload.ts`, `components/workload/WorkloadClient.tsx`, `lib/workload-data.ts` |
| Multi-assegnatario | `app/actions/task-assignees.ts`, `components/tasks/AssigneePicker.tsx` |
| Google Calendar | `app/api/google/{auth,callback,events}`, token in `google_credentials` |
| Chat (4 gruppi) | `components/chat/ChatLayout.tsx`, `app/actions/chat-dm.ts` |
| Ricerca | `app/actions/global-search.ts`, `components/shared/GlobalSearch.tsx` |
| Buste paga / doc personali | `app/actions/payslips.ts`, `lib/personal-documents.ts` |
| Design system / temi | `app/globals.css`, `tailwind.config.ts`, `components/theme/` |

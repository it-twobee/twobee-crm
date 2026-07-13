# Handoff VPS — stato allineamento & piano storage

> Scopo: far ripartire allineata una sessione Claude Code **sulla VPS** (deploy da
> Coolify, GitHub `it-twobee/twobee-crm` branch `main`). Il `CLAUDE.md` viaggia col
> repo; questo file cattura lo stato **DB / infra / storage** che il repo da solo
> non racconta. Scritto il **2026-07-13**.

---

## 1. Stato codice
- `main` allineato a GitHub. Il fix WL-01 (hint "assegna PM" nel Workload) è nel
  merge che porta anche questo documento.
- La VPS deploya da `main`: ogni cosa che deve andare in produzione passa da lì.

## 2. Stato DB (Supabase `ujkrrryitfqboskdqhwf`, eu-west-1)
**Il DB NON è stato costruito eseguendo le migration in sequenza, ma da uno
snapshot/schema consolidato.** Conseguenze verificate (script node `pg` con service
role, 2026-07-13):
- `channel_type` **non esiste come enum** → `chat_channels.type` è TEXT+CHECK.
- Le colonne obiettivo di `clients` (008: `industry`, `market_area`, `target_*`,
  `goals_notes`, `ad_budget_monthly`) **ci sono** comunque.
- Migration 086–107 risultano **essenzialmente tutte applicate** a livello schema
  (decisions, payslips, personal_documents, chat rework, google_credentials,
  feedback, data_quality_report VIEW, time_entries, clients_workspace VIEW,
  task requests, calendar_events, workload portfolio, client names, knowledge…).

**Buchi dello snapshot risolti stasera** (applicati direttamente sul DB di
produzione; i file migration erano già nel repo):
| Cosa | Migration | Stato |
|---|---|---|
| `workspace_sections.workload` (voce sidebar persistente, `sort_order=2`, 6 permessi) | 095 + 104 | ✅ applicata |
| `resource_profiles` (tabella+trigger+RLS `_self`/`_admin` + policy `projects_resource_own`/`documents_resource_own`/`time_entries_own`) → sblocca tab **Risorse** in HR | 068 | ✅ applicata |
| `client_accounts` (tabella+RLS) → sblocca **"Gestisci Accessi"** nel Customer Care (insert/delete in `CustomerCareClient` ~670/683) | 008 (solo righe 2-14, **NO** `ALTER TYPE`, **NO** colonne clients già presenti) | ✅ applicata |

**Nota metodo**: prima di dire "manca X", riverifica sul DB reale. `psql` non è
installato: connettersi via modulo node `pg` (in `node_modules`), SSL
`rejectUnauthorized:false`, `DATABASE_URL` da `.env.local`. Falsi positivi già
esclusi: `proposals`, `appointments`, `comments`, `kpi_config` (nessuna migration
li crea, 0 usi nel codice).

## 3. Google (Calendar oggi, Drive da fare)
**Causa del "non riesco a collegare Google"**: in `.env.local` mancavano
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (e `GROQ_API_KEY`). Con quelle assenti,
`app/api/google/auth/route.ts:22` rimbalza con `error=google_not_configured` senza
mai arrivare a Google.

### Checklist env su Coolify (VPS)
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GROQ_API_KEY=...
NEXT_PUBLIC_APP_URL=https://<dominio-reale>          # NON localhost
DATABASE_URL=...                                     # pooler eu-west-1, ! → %21
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Google Cloud Console
- OAuth consent screen → **User Type = Internal** (siete Workspace `@twobee.it`:
  nessuna verifica Google, anche per gli scope "restricted" come Drive).
- Authorized redirect URI → `https://<dominio-reale>/api/google/callback`
  (deve combaciare **esatto** con `NEXT_PUBLIC_APP_URL` + `/api/google/callback`).

Con questo il **Calendar** si collega. **Drive no**: gli scope OAuth attuali sono
solo Calendar (`auth/route.ts:50-53`) e non esiste codice Drive-API — solo iframe
di link incollati a mano (`lib/drive.ts` lo dichiara: "Nessuna API/OAuth").

## 4. Storage — decisione e piano
**Decisione presa**: **ibrido Google Drive (documenti/knowledge) + MinIO/S3 su
Coolify (file sensibili)**. Supabase Storage **scartato** (spazio free minuscolo).
Rimpiazza anche la vecchia proposta Nextcloud in `docs/storage-architecture.md`.

| Uso | Backend | Perché |
|---|---|---|
| Documenti cliente, Knowledge | **Google Drive Shared Drive** | TB già pagati nel Workspace Business, durabile, backup Google, il team già ci lavora |
| Buste-paga, documenti-personali, best-ideas, allegati sensibili | **MinIO/S3 su Coolify** | presigned URL brevi, semantica S3, controllo totale sulla VPS |

### Principi architetturali
- **UI nativa, ZERO iframe.** Oggi `DocumentsTab` + `DriveEmbed` mostrano un
  `<iframe embeddedfolderview>` di un URL incollato. Va sostituito da componenti
  nostri che leggono dalla Drive API v3 (`files.list`, `files.create`,
  `files.get?alt=media`, `thumbnailLink` per anteprime).
- **Il frontend non parla mai con Drive/MinIO.** Tutto passa dal backend Next.js,
  che verifica auth+ruoli Supabase, esegue l'op, e restituisce download controllati
  / URL temporanei. (Stesso principio del vecchio doc storage.)
- **Drive ownership** = **Shared Drive** di Workspace (non Drive personali) via
  **service account con domain-wide delegation** (l'admin Workspace autorizza il
  client-id del service account con lo scope Drive nella Admin Console). L'OAuth
  per-utente resta solo per il Calendar.
- **Metadata su Supabase** (id, provider, drive_file_id / s3_key, client_id,
  project_id, name, mime, size, uploaded_by, created_at), binari sul provider.

### Layer da costruire
```
lib/storage/
  index.ts        # sceglie il provider per caso d'uso / env
  types.ts        # interfaccia comune
  providers/
    googleDrive.ts # Shared Drive via service account + scope auth/drive
    s3.ts          # MinIO su Coolify, presigned URL
```
Interfaccia minima: `uploadFile`, `deleteFile`, `getDownloadUrl`, `getPreviewUrl`,
`listFolder`, `ensureProjectFolder`.
API interne: `POST /api/files/upload`, `GET /api/files/:id/download`,
`DELETE /api/files/:id`, `GET /api/files?folder=...`.

### Env storage (Coolify)
```
STORAGE_DOCS_PROVIDER=googleDrive
GOOGLE_SA_CLIENT_EMAIL=...            # service account
GOOGLE_SA_PRIVATE_KEY=...
GOOGLE_DRIVE_ROOT_FOLDER_ID=...       # cartella radice nella Shared Drive
STORAGE_SENSITIVE_PROVIDER=s3
S3_ENDPOINT=https://<minio-su-coolify>
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET_PAYSLIPS=payslips
S3_BUCKET_PERSONAL=personal-documents
S3_BUCKET_BEST_IDEAS=best-ideas
```

### Migrazione incrementale (non rompere l'esistente)
1. Introdurre `lib/storage` + `/api/files/*` senza cambiare UX.
2. Documenti cliente/knowledge: nuova UI nativa su Drive API; **lettura di
   compatibilità** per i vecchi `documents.file_url` (link Drive + `DriveEmbed`).
3. Buste-paga / documenti-personali / best-ideas: da subito su MinIO (erano su
   bucket Supabase mai creati).
4. Allegati chat (oggi serializzati in `chat_messages.attachments`): ultimi,
   più delicati.

## 5. Cosa resta (non-code, da piattaforma)
- **Data quality**: assegnare PM (`projects.manager_id`) ai progetti attivi;
  popolare `client_assignments`; stime/scadenze sulle task; marcare clienti interni.
- Creare la **Shared Drive** + service account + cartella radice.
- Creare i **bucket MinIO** su Coolify (`payslips`, `personal-documents`,
  `best-ideas`).

## 6. Primo comando utile sulla VPS
```bash
git pull origin main          # porta WL-01 + questo handoff
# imposta le env su Coolify (sez. 3 e 4), poi redeploy
```

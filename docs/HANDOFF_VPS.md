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

## 4. Storage — DECISIONE RIVISTA + infra fatta (2026-07-13)
**Semplificazione rispetto al piano precedente.** Niente Drive-API/service account:
- **MinIO interno = storage UNICO del CRM.** Tutto ciò che si carica dalla UI del
  CRM finisce su MinIO (VPS), dietro il backend. Sostituisce anche i bucket Supabase
  "mai creati" (buste paga, documenti personali, best-ideas).
- **Google Drive = SOLO iframe** (`lib/drive.ts` + `DriveEmbed`, "Nessuna API/OAuth")
  per incollare/condividere roba che vive già su Drive del cliente. **Scartati**
  service account, domain-wide delegation, Shared Drive, provider `googleDrive.ts`,
  migrazione Drive-API. Il layer storage è **mono-provider (S3/MinIO)**.
- Supabase Storage resta scartato (spazio free minuscolo).

### Infra MinIO (già deployata e verificata)
- Service Coolify **`minio`** (progetto Twobee, service uuid `a2bmvfs0bz0g1a3pxa5h2eob`,
  immagine `minio/minio:latest`, volume `minio-data`). **NON esposto** (nessun FQDN/
  Traefik). Agganciato via `docker_compose_raw` alla rete esterna **`coolify` con
  alias `minio`** → il container CRM (anch'esso su `coolify`) lo raggiunge a
  **`http://minio:9000`** (verificato: health 200 dal CRM). L'alias è nel compose,
  quindi persiste ai redeploy.
- **Bucket unico `twobee-crm`** (privato). Organizzazione per **prefissi in-code**
  (`clients/ payslips/ personal/ best_ideas/ chat/ knowledge/ misc/`), non bucket
  separati. Access control fatto dal backend (unico a parlare con MinIO).
- **Access key dedicata `twobee-crm-app`** (NON root) con policy `twobee-crm-rw`
  limitata al solo bucket (testato PUT/GET/DELETE + isolamento).
- **Env su app CRM in Coolify (runtime, non buildtime)**: `S3_ENDPOINT=http://minio:9000`,
  `S3_REGION=us-east-1`, `S3_FORCE_PATH_STYLE=true`, `S3_ACCESS_KEY_ID=twobee-crm-app`,
  `S3_SECRET_ACCESS_KEY=***`, `S3_BUCKET=twobee-crm`.

### Codice (branch `feat/storage-minio`, buildato + smoke-testato)
- `lib/storage/shared.ts` — cartelle, `SENSITIVE_FOLDERS`, tipi (client-safe).
- `lib/storage/s3.ts` — provider S3/MinIO (`@aws-sdk/client-s3`, `forcePathStyle`),
  `putObject/getObject/deleteObject/listObjects` + `buildObjectKey`.
- `lib/storage/guard.ts` — `getCaller()` (user+ruolo), `canReadFile/canDeleteFile`
  (cartelle sensibili → solo owner/admin).
- `app/api/files/*` — `POST /upload` (multipart, max 50MB, rollback oggetto se il
  metadato fallisce), `GET /` (lista filtrata per permesso), `GET /:id/download`
  (**proxy**: streama i byte, MinIO resta interno), `DELETE /:id`.
- `components/shared/FileManager.tsx` — uploader+lista riutilizzabile; il browser
  parla SOLO con `/api/files/*`, mai con MinIO. Montato in `DocumentsTab` come
  "Allegati interni" (staff-only, non nel portale) accanto alla sezione Drive.
- **Migration `108_files_storage.sql`** — tabella `public.files` (metadati) + RLS
  (admin all; owner CRUD dei propri; team select cartelle non-sensibili).

### Metadati — tabella `public.files`
`id, bucket, object_key (unique), folder, entity_type, entity_id, name, mime, size,
uploaded_by → profiles(id), created_at`. Binari su MinIO, metadati qui.

## 5. Cosa RESTA per chiudere lo storage
1. **Applicare la migration `108`** al DB di produzione (metodo handoff §2: modulo
   node `pg`, `DATABASE_URL` pooler, SSL `rejectUnauthorized:false`). **Bloccante**:
   fino a qui `/api/files/*` va in 500 (tabella assente).
2. **Merge del branch `feat/storage-minio` in `main`** → auto-deploy Coolify. NB:
   mergiare DOPO il punto 1, o la tab Documenti mostra un errore all'apertura.
3. (Incrementale) montare `FileManager` sulle altre superfici: documenti personali /
   buste paga (`personal`/`payslips`), best-ideas (`best_ideas`), allegati chat
   (`chat`), knowledge (`knowledge`). Il layer è già pronto: basta il componente.
4. (Opzionale) backup del volume `minio-data` (i file sensibili stanno su un solo
   disco VPS): snapshot Hetzner o `mc mirror` verso un S3 esterno.

## 6. Altri "cosa resta" (non-storage, da piattaforma)
- **Google Calendar**: impostare `GOOGLE_CLIENT_ID/SECRET` (+ `GROQ_API_KEY`) su
  Coolify e OAuth Console (vedi §3). Drive resta iframe: nessun setup Google.
- **Data quality**: assegnare PM (`projects.manager_id`); popolare
  `client_assignments`; stime/scadenze sulle task; marcare clienti interni.

## 7. Primo comando utile sulla VPS
```bash
git fetch origin && git checkout feat/storage-minio   # oppure main dopo il merge
# 1) applica migration 108 al DB prod  2) merge in main → deploy Coolify
```

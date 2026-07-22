# 05 — Digital Project

## Cosa esiste

Struttura dati completa: `projects` → `sprints` → milestone
(`tasks.is_milestone`) → task → subtask (`parent_task_id`), più
`task_dependencies` e multi-assegnatario. In produzione: 4 sprint, 1 progetto di
test.

UI in `ProjectPageClient.tsx` — 3000 righe condivise con Growth.

## Cosa manca

### Fasi (§14)

Lo sprint è temporale, la fase è logica: `Discovery · Analisi · Progettazione ·
UX/UI · Sviluppo · Integrazione · Test interno · Test cliente · Revisioni ·
Rilascio · Hypercare · Chiusura`. Non tutte servono a tutti i progetti.

```sql
CREATE TABLE public.project_phases (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT, name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  start_date DATE, end_date DATE,
  owner_id UUID REFERENCES profiles(id),
  status TEXT,                        -- da_avviare|in_corso|completata|bloccata
  requires_client_approval BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  deliverables JSONB DEFAULT '[]'
);
ALTER TABLE public.tasks ADD COLUMN phase_id UUID REFERENCES project_phases(id);
ALTER TABLE public.sprints ADD COLUMN phase_id UUID REFERENCES project_phases(id);
```

### Release (§15)

Wireframe, design, alpha, beta, test cliente, produzione, handover. Ogni release
è una **milestone di progetto** con campi aggiuntivi:

```sql
ALTER TABLE public.tasks
  ADD COLUMN release_env TEXT,        -- dev|staging|produzione
  ADD COLUMN release_outcome TEXT;    -- ok|con_riserve|respinta
```

Non una tabella nuova: una release *è* una milestone, con un ambiente e un esito.

### Tempo cliente vs tempo TwoBee (§16)

Il punto più importante del capitolo Digital: un progetto in ritardo perché il
cliente non risponde **non è** un ritardo operativo.

```sql
ALTER TABLE public.tasks
  ADD COLUMN wait_type TEXT
    CHECK (wait_type IN ('lavoro_twobee','lavoro_partner','attesa_cliente','test_cliente','revisione'));
```

Il Workload conta come carico solo `lavoro_twobee` e `lavoro_partner`; le attese
allungano la timeline senza pesare su nessuno.

### Data fine dinamica (§17)

```sql
ALTER TABLE public.projects
  ADD COLUMN desired_end_date DATE,     -- concordata col cliente, MAI toccata dal sistema
  ADD COLUMN estimated_end_date DATE,   -- calcolata
  ADD COLUMN estimate_confidence TEXT,  -- alta|media|bassa
  ADD COLUMN estimate_updated_at TIMESTAMPTZ;
```

Il calcolo somma durata fasi, `estimated_hours`, dipendenze, capacità
(`profiles.weekly_capacity_hours`, già esistente), progetti paralleli, giorni
lavorativi, assenze (`team_leaves`, esiste), testing, tempi cliente, partner e
buffer.

`lib/workload.ts` ha già metà di questi calcoli.

**La confidenza è obbligatoria**: se metà delle task non ha stima, il numero è un
indovinello e va detto. Una data stimata di cui nessuno si fida è peggio di
nessuna data.

### Partner e subappalto (§18)

`resource_profiles` (068) ha già i tipi partner e i flag di visibilità, ma è a
0 righe: mai esercitata.

```sql
CREATE TABLE public.project_work_packages (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  partner_profile_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL, scope TEXT,
  internal_owner_id UUID REFERENCES profiles(id),
  deadline DATE, status TEXT,
  agreed_cost NUMERIC(12,2),     -- admin-only, MAI al partner
  sla TEXT, approved_at TIMESTAMPTZ, approved_by UUID
);
ALTER TABLE public.tasks ADD COLUMN work_package_id UUID REFERENCES project_work_packages(id);
```

Il partner vede solo le task del proprio work package. Non vede marginalità,
prezzo cliente, costi altrui, fatture, note interne, né le parti di progetto non
assegnate. `agreed_cost` è visibile a founder/super_admin/admin.

**Questo va scritto in RLS, non solo in UI.** È lo stesso errore già corretto due
volte in questa sessione.

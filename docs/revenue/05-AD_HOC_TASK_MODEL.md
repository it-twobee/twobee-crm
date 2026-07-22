# 05 — Modello task ad hoc cliente

## Il conflitto che il brief non poteva conoscere

Il §10 propone: `client_id` valorizzato, `project_id` nullable, `scope_type='client'`,
`bucket_type='ad_hoc'`.

Verifica sul codice:

1. **`tasks.client_id` NON esiste.** La migration 058 aggiunge `is_client_task`
   e `tags`, non `client_id`. Confermato anche sui tipi (`lib/types/database.ts`,
   `interface Task`).
2. **`tasks.project_id` è già nullable** — ma il significato è **già occupato**.
   Migration `094_private_personal_tasks.sql`:

   > «una task senza progetto (`project_id IS NULL`) è un todo personale del suo
   > assegnatario e NON deve comparire ai colleghi. […] Nessuna nuova colonna:
   > "privata" = "senza progetto".»

   E la policy:
   ```sql
   CREATE POLICY "tasks_team_read_all" ON public.tasks
     FOR SELECT USING (get_my_role() = 'team' AND project_id IS NOT NULL);
   ```

**Se implementi il §10 alla lettera, ogni task ad hoc di cliente diventa invisibile
a tutto il team tranne l'assegnatario e l'admin.** Il pannello "Attività ad hoc del
cliente" (§10) risulterebbe vuoto per manager e senior. È il bug più insidioso di
tutta questa modifica, e sarebbe passato silenziosamente: nessun errore, solo
liste vuote.

Va risolto **prima** di scrivere la UI, non dopo.

## Il terzo problema: esiste già un "Ad Hoc" diverso

`app/actions/workspace-create.ts:131` — `AD_HOC_TITLE = 'Ad Hoc'`: una **milestone
senza sprint dentro un progetto**, creata on-demand, usata da
`WorkspaceQuickCreate` e `ContextualCreate` («⚡ Ad Hoc — richiesta una tantum»).

Semanticamente è l'opposto di quello che chiede il §10: lega la richiesta a un
progetto invece di liberarla. Convivranno due cose chiamate "Ad Hoc" con
significati diversi. Va deciso se il nuovo scope-cliente **sostituisce** il
meccanismo esistente o gli si affianca (Q22).

## Modello proposto

```sql
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'project'
    CHECK (scope_type IN ('project','client','personal')),
  ADD COLUMN IF NOT EXISTS work_type TEXT NOT NULL DEFAULT 'project'
    CHECK (work_type IN ('project','startup','routine','initiative','adhoc'));
```

`scope_type` rende **esplicito** ciò che oggi è implicito nel `NULL`:

| `scope_type` | `project_id` | `client_id` | Visibilità team | Significato |
|---|---|---|---|---|
| `project` | NOT NULL | derivato | ✅ | task di progetto (default, invariato) |
| `client` | NULL | NOT NULL | ✅ | **ad hoc cliente** (nuovo) |
| `personal` | NULL | NULL | ❌ solo owner+admin | todo personale (comportamento 094) |

Backfill: le 7 task esistenti sono tutte di test → `scope_type='personal'` o
cancellazione. Zero righe a rischio.

RLS da riscrivere (sostituisce la 094):

```sql
DROP POLICY IF EXISTS "tasks_team_read_all" ON public.tasks;
CREATE POLICY "tasks_team_read_all" ON public.tasks
  FOR SELECT USING (
    public.get_my_role() = 'team' AND scope_type IN ('project','client')
  );
```

La privacy delle task personali è **preservata** (`scope_type='personal'` resta
escluso) e le ad hoc cliente diventano visibili al team. Reversibile: la vecchia
policy è una riga.

`CHECK` di coerenza consigliato:
```sql
ALTER TABLE public.tasks ADD CONSTRAINT tasks_scope_coherent CHECK (
  (scope_type = 'project'  AND project_id IS NOT NULL) OR
  (scope_type = 'client'   AND project_id IS NULL AND client_id IS NOT NULL) OR
  (scope_type = 'personal' AND project_id IS NULL AND client_id IS NULL)
);
```

## «Collegare successivamente a un progetto» (§10)

È una transizione `client → project`: si valorizza `project_id` e si porta
`scope_type` a `'project'`. Il `client_id` resta (ridondante ma utile e coerente:
va tenuto allineato a `projects.client_id` da trigger). Nessun dato si perde,
l'operazione è reversibile.

## Impatto Workload

`lib/workload.ts` dichiara `WLTask.project_id: string` — **non nullable**.
`computeResourceLoads` / `computeProjectLoads` / `filterTasks` assumono che ogni
task abbia un progetto. Perché le ad hoc concorrano al carico (§10, §14, §20.15)
serve:

- `WLTask.project_id: string | null` + `client_id: string | null` + `work_type`
- `computeProjectLoads` invariato (le ad hoc non hanno progetto, restano fuori)
- `computeResourceLoads` / `computeEffortBuckets` / `computeIntensity` devono
  **includerle**: è lavoro reale che occupa una persona
- `WLFilters.kind` va esteso: oggi è `'growth' | 'digital' | null` letto da
  `project_kind`. Con le ad hoc senza progetto serve un `work_type` filter
  separato (§14: routine / iniziative / ad hoc)

Dettaglio in `08-UI_UX_PLAN.md`.

## Imputazione economica

Volutamente **non decisa** (§10 chiude con «da definire dopo la discovery»).
Le opzioni: costo generale cliente / costo progetto / overhead / non fatturabile.
La scelta è Q26. Nota tecnica: `project_cost_entries` ha già `client_id`
nullable **oltre** a `project_id NOT NULL` — per imputare un costo a un cliente
senza progetto quel `NOT NULL` andrebbe rilassato.

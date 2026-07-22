# 11 — Migrazione e backfill

## Da migrare: quasi niente

| Entità | Righe | Azione |
|---|---|---|
| `projects` | **2** | 1 da riclassificare, 1 da cancellare |
| `tasks` | 65 | 27 da tenere, 38 da cancellare |
| `sprints` | 4 | da verificare (appartengono al progetto `Test`?) |
| `growth_routines` | 11 | tenere |
| `revenue_streams` | 10 | tenere |
| `lead_contacts` | 3 | cancellare (prova) |
| `quotes`, `deals`, `task_templates`, `resource_profiles` | 0 | — |

Il §29 chiede dry run, categorie di confidenza, script di backfill e rollback.
Su due progetti sono sproporzionati. Il vero rischio non è dietro, è davanti:
**gli 85 progetti Asana** che stanno per essere importati.

## L'ordine che conta

```
1. migration 132 (delivery_model a 5)
2. migration 133 (Service Catalog + seed 13 servizi)
3. adeguare scripts/import-asana.ts a scrivere il servizio
4. SOLO ORA lanciare l'import
```

Se l'import parte prima, 85 progetti nascono senza servizio e la
classificazione torna a essere un backfill manuale — cioè esattamente ciò che
questo lavoro deve evitare. `scripts/import-asana.ts` già calcola `projectKind`
per ogni progetto: gli va aggiunta la mappatura al servizio del catalogo.

## Pulizia preliminare

```sql
-- da confermare
DELETE FROM public.tasks WHERE project_id = (SELECT id FROM projects WHERE name = 'Test');
DELETE FROM public.projects WHERE name = 'Test';
DELETE FROM public.tasks WHERE scope_type = 'personal' AND title IN
  ('Test 1','Bello 2','test','tewst','Ads Petito Grafiche',
   'Supporto: Ads Petito Grafiche','Supporto: Supporto: Ads Petito Grafiche');
DELETE FROM public.lead_contacts WHERE email IN ('giulia@esempio.it','marco@esempio.it')
   OR full_name = 'Anna Verdi';
```

## Riclassificazione

Un solo progetto reale:

```sql
UPDATE public.projects
SET delivery_model = 'growth_program', growth_vertical = 'lead_gen'
WHERE name = 'Growth Fatima Leo';
```

## Reversibilità

Le migration 132–140 sono additive tranne la 132, che riscrive `delivery_model`.
Il rollback è la mappatura inversa e con 2 righe è banale. La 141 (rimozione
colonne) è l'unica irreversibile: va fatta per ultima e solo a codice ripuntato.

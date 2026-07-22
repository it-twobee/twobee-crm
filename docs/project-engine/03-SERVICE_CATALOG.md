# 03 — Service Catalog

## Cosa esiste

- `task_templates` (011): `name`, `service_type ∈ (growth|digital|entrambi)`,
  `tasks JSONB`, `created_by`. **0 righe, nessuna UI.**
- 6 template **hardcoded** in `components/progetti/ProgettiClient.tsx:864`,
  usati da 1 form su 8.

Il catalogo di fatto vive dentro un componente React, e uno dei sei template è
già classificato male (`E-commerce` marcato `growth` con milestone da progetto
Digital).

## Proposta: estendere `task_templates`, non crearne una nuova

`task_templates` è vuota, ha già il campo giusto (`service_type`) e un JSONB per
il contenuto. Rinominarla concettualmente in "catalogo servizi" costa meno che
creare `service_catalog` e lasciare una tabella morta accanto.

```sql
ALTER TABLE public.task_templates
  ADD COLUMN key TEXT UNIQUE,             -- 'growth_ecommerce', 'brand_identity'
  ADD COLUMN description TEXT,
  ADD COLUMN service_line TEXT,           -- growth|digital|marketing|ai|consulting|hybrid
  ADD COLUMN delivery_engine TEXT,        -- growth_program|digital_project|recurring_service|structured_one_off|hybrid_delivery
  ADD COLUMN default_revenue_model TEXT,  -- recurring|one_off|milestone_based|maintenance|retainer|usage_based|non_billable
  ADD COLUMN vertical TEXT,               -- ecommerce|lead_gen|null
  ADD COLUMN suggested_duration_days INT,
  ADD COLUMN suggested_frequency TEXT,
  ADD COLUMN deliverables JSONB DEFAULT '[]',
  ADD COLUMN suggested_roles JSONB DEFAULT '[]',
  ADD COLUMN required_fields JSONB DEFAULT '[]',
  ADD COLUMN kpi_keys JSONB DEFAULT '[]',
  ADD COLUMN phases JSONB DEFAULT '[]',      -- fasi Digital
  ADD COLUMN routines JSONB DEFAULT '[]',    -- seed routine Growth
  ADD COLUMN is_active BOOLEAN DEFAULT true,
  ADD COLUMN position INT DEFAULT 0;
```

`tasks JSONB` resta e ospita il template task della Startup.

`service_type` (growth|digital|entrambi) diventa ridondante con `service_line`:
va deprecata, non riusata.

## I 13 servizi iniziali

| # | Servizio | Linea | Motore | Ricavo | Verticale |
|---|---|---|---|---|---|
| 1 | Growth E-commerce | growth | growth_program | recurring | ecommerce |
| 2 | Growth Lead Generation | growth | growth_program | recurring | lead_gen |
| 3 | Brand Identity | marketing | structured_one_off | one_off | — |
| 4 | Continuing Designer | marketing | recurring_service | recurring | — |
| 5 | Analisi di mercato | marketing | structured_one_off | one_off | — |
| 6 | Creazione evento | marketing | structured_one_off | one_off | — |
| 7 | Sito web | digital | digital_project | one_off | — |
| 8 | Sito e-commerce | digital | digital_project | milestone_based | — |
| 9 | CRM | digital | digital_project | milestone_based | — |
| 10 | Gestionale | digital | digital_project | milestone_based | — |
| 11 | AI Automation | ai | digital_project | milestone_based | — |
| 12 | Marketing Automation | marketing | structured_one_off | one_off | — |
| 13 | Consulenza strategica | consulting | recurring_service | retainer | — |

**Il punto del catalogo**: "Sito e-commerce" è commercialmente vicino a "Growth
E-commerce" ma usa un motore completamente diverso. Il catalogo è ciò che
impedisce di confonderli — oggi la confusione è già nel codice.

## Configurabilità

Admin e super_admin possono creare, modificare, disattivare e riordinare le voci.
RLS: lettura staff, scrittura admin.

## Da confermare

L'elenco dei 13 servizi e la loro mappatura su motore/ricavo. È la matrice del
§28 e va approvata prima di qualsiasi seed.

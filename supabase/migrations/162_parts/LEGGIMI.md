# 162 — Libreria template, in cinque pezzi

Il seed completo è ~48.000 caratteri di JSON: incollarlo in un colpo solo è
fragile. Qui è spezzato in blocchi che contengono **una sola istruzione
ciascuno**, quindi anche se il copia-incolla perde il punto e virgola finale
funzionano lo stesso.

Esegui in ordine nel SQL Editor di Supabase:

| # | File | Cosa fa |
|---|---|---|
| 1 | `1_funzione.sql` | Crea `seed_project_template(jsonb)`, l'espansore |
| 2 | `2_growth.sql` | 6 template: Lead Generation, SaaS, E-commerce |
| 3 | `3_marketing.sql` | 7 template: Branding, Social, Audit, Design, Evento |
| 4 | `4_digital.sql` | 5 template: AI, CRM, Gestionale, Applicativo |
| 5 | `5_pulizia.sql` | Rimuove la funzione: serviva solo al seed |

Ogni chiamata salta i template già presenti per (servizio, nome): rieseguire
non duplica. Se un blocco fallisce, gli altri restano validi — la funzione del
punto 1 resta finché non esegui il 5.

Controllo finale:

    SELECT p.service_type, count(DISTINCT p.id) AS template, count(n.id) AS nodi
    FROM public.project_templates p
    LEFT JOIN public.project_template_nodes n ON n.template_id = p.id
    GROUP BY 1 ORDER BY 1;

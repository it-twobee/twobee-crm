# 09 — Migrazione e backfill

## Il piano è quasi vuoto, ed è una buona notizia

Righe da migrare in tutta la piattaforma:

| Entità | Righe | Azione |
|---|---|---|
| `clients` | 12 | classificazione manuale + creazione di 1 `revenue_streams` per i 9 con MRR |
| `tasks` | 7 (tutte di test) | cancellazione, oppure `scope_type='personal'` |
| `projects` | 0 | — |
| `invoices` | 0 | — |
| `quotes` / `deals` / `sprints` / `client_kpis` / `project_cost_entries` | 0 | — |
| `business_costs` / `resource_costs` | 11 / 6 | non toccati |

Non serve una UI di backfill assistito. Non serve un processo di
riclassificazione reversibile. Serve **una sessione di 10 minuti** in cui
confermi 12 righe.

## Sequenza

### Passo 0 — Backup

`pg_dump` completo prima di qualsiasi migration, anche se il DB è piccolo. È la
sola rete di sicurezza sul `DROP CONSTRAINT` della 118.

### Passo 1 — Migration strutturali (115–120)

Nell'ordine, in un'unica transazione, dal SQL Editor (pattern
`supabase/APPLY_PENDING.sql`). Nessuna riscrive dati esistenti tranne il backfill
delle 7 task nella 120.

### Passo 2 — Backfill `revenue_streams` dai 12 clienti

Uno stream per cliente con `mrr > 0`. **Non generabile automaticamente**: dipende
dalle tue risposte (Q1, Q2, Q4) e in particolare dai 4 casi ambigui del doc 02.

Bozza per i 7 Growth non controversi (`start_date` = `clients.contract_start`):

```sql
INSERT INTO public.revenue_streams
  (client_id, label, service_line, revenue_model, amount, billing_frequency, start_date, status, source)
SELECT id, 'Canone Growth', 'growth', 'recurring', mrr, 'mensile',
       COALESCE(contract_start, CURRENT_DATE), 'attivo', 'backfill'
FROM public.clients
WHERE mrr > 0 AND is_internal = false AND client_type = 'growth'
  AND client_label <> 'perso';
```

Restano fuori, da fare a mano:
- **Industrial Services & Facility** (digital, 1.800) → Q2 decide `service_line`
  e `revenue_model`
- **AV Gioielli** (perso, 1.200) → stream `status='cessato'` con `end_date`
  reale, così il churn resta spiegabile
- **Affinity - SofiA** → `growth` o `ai`?
- **Seven Holding / Elettra Group** (mrr 0) → nessuno stream, o stream
  `one_off` se hanno lavori attivi mai censiti

### Passo 3 — Verifica di quadratura

Prima di attivare il trigger che rende `clients.mrr` derivato:

```sql
SELECT c.company_name, c.mrr AS mrr_attuale,
       COALESCE(SUM(rs.amount) FILTER (
         WHERE rs.status='attivo' AND rs.revenue_model IN ('recurring','maintenance')
       ), 0) AS mrr_da_stream
FROM public.clients c
LEFT JOIN public.revenue_streams rs ON rs.client_id = c.id
GROUP BY c.id, c.company_name, c.mrr
HAVING c.mrr <> COALESCE(SUM(rs.amount) FILTER (
         WHERE rs.status='attivo' AND rs.revenue_model IN ('recurring','maintenance')
       ), 0);
```

Zero righe = quadratura. Se ci sono righe, sono le decisioni non ancora prese —
non un errore tecnico.

### Passo 4 — Attivare il trigger su `clients.mrr`

Solo dopo la quadratura. Da qui in poi `clients.mrr` è **derivato**: rendere il
campo read-only in `NewClientModal` e `AnagraficaTab` nella stessa PR, altrimenti
qualcuno lo riscrive a mano e la divergenza torna.

### Passo 5 — Uniformare le 6 formule MRR

Doc 01 §1: tre filtri diversi in sei punti. Estrarre in `lib/revenue.ts` una
funzione unica (o meglio, leggere l'aggregato dal DB) e sostituire le `reduce`.
Da fare **dopo** il passo 4, così il numero non cambia mentre si rifattorizza.

### Passo 6 — Fix dei bug economici latenti

- `ControlloGestioneClient.tsx:119` → aggiungere il filtro `invoice_type`
  e **sottrarre** le note di credito
- `ControlloGestioneClient.tsx:133-135` → ricavo di progetto da
  `revenue_streams.project_id` / `invoices.project_id`, non dal fatturato totale
  del cliente
- `ControlloGestioneClient.tsx:123-126` → decidere se l'overhead entra nel
  margine (oggi calcolato e ignorato) e allineare i periodi ricavi/costi
- `workspace/page.tsx:203` → label "Totale incassato" su dato filtrato per
  `month`

Nessuno di questi produce oggi un numero sbagliato visibile, perché le tabelle
sono vuote. Diventano tutti attivi **al primo dato reale**: vanno chiusi prima
dell'inserimento delle prime fatture, non dopo.

## Data quality (§16) — dopo, non prima

Estendere `data_quality_report` (migration 097) con:

- progetti senza `service_line` / senza `revenue_streams`
- clienti attivi senza stream attivo
- fatture senza `stream_id` / senza `client_id`
- fatture con `taxable_amount + vat_amount <> total_gross`
- note di credito con `status='pagata'` (segno invertito)
- preventivi `accettata` senza stream generato
- progetti Growth senza routine attive / senza Startup
- progetti Digital senza sprint
- task `scope_type='client'` senza `client_id` (impossibile col CHECK, ma il
  report lo dice se il CHECK venisse rilassato)
- task `work_type='routine'` senza `routine_id` o senza `period_key`
- stream sovrapposti sullo stesso `(client_id, service_line)` → doppio conteggio

## Reversibilità

Ogni migration ha il suo rollback:
- 115/116/117/119/120 → `DROP COLUMN` / `DROP TABLE` (dati nuovi, nessuna perdita
  di storico)
- 118 → il `DROP CONSTRAINT` è ripristinabile solo se non sono state inserite
  due fatture nello stesso `(client_id, month)`. **Dopo la prima settimana di uso
  reale non è più reversibile.** È la decisione più irreversibile del piano —
  ed è anche quella con maggior beneficio.
- 121 → ricreare la policy della 094

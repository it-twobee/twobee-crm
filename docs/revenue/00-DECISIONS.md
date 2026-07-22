# 00 — Decisioni prese

## Stato: FASE 0 e FASE 1 in produzione (2026-07-19)

Migration applicate: 115, 116, 117, 118, 122, 123, 124, 125, 126.
MRR reale € 12.100 (era dichiarato 16.300). Obiettivo 2026 € 300.000.

Verificato sul DB di produzione con inserimenti di prova poi rimossi:
- `UNIQUE(client_id, month)` su `invoices` rimosso — due fatture stesso
  cliente/mese accettate
- trigger IVA: imponibile 1,00 → IVA 0,22 → lordo 1,22
- trigger `service_line`: growth→growth, marketing→marketing, ai→ai,
  digital→digital, con `delivery_model` coerente
- guard `workspace_revenue_summary` e `refresh_mrr_now`: rifiutano un chiamante
  senza profilo (prima, con `NOT NULL` in un IF, passavano)

Non verificabile dall'esterno: pg_cron e la VIEW `client_service_lines`
(richiede una sessione autenticata).


Registro delle risposte alle domande bloccanti. Aggiornare qui, non nei doc 01–10.

## Round 1 — 2026-07-19

### Q28 — `UNIQUE(client_id, month)` su `invoices` → **DROP** ✅

Confermato. Migration 118. Da eseguire **prima** di emettere la prima fattura
reale: dopo diventa una migrazione delicata.

Conseguenza: un cliente può avere N fatture nello stesso mese, ciascuna legata al
proprio `revenue_streams` (canone Growth, SAL Digital, una tantum). È il
prerequisito tecnico della separazione Growth/Digital.

### Q2 — Industrial Services & Facility → **contratto Growth concluso** ✅

Non è un canone Digital di manutenzione. Era **Growth ricorrente, ora cessato**.

Backfill corretto:
```sql
-- revenue_streams: service_line='growth', revenue_model='recurring',
--                  status='cessato', end_date = <data reale di chiusura>
-- clients.mrr → 0 (derivato dal trigger)
```

⚠️ Serve la **data di fine contratto** — non è desumibile dal DB
(`clients.contract_end` va verificato).

⚠️ `clients.client_type` è `'digital'` su questo cliente: da correggere o da
lasciare se oggi ha lavori Digital attivi. Aperta.

**Conseguenza sull'MRR reale**: i € 16.300 mostrati oggi in dashboard non sono
l'MRR corrente. Tolti Industrial (€ 1.800, concluso) e AV Gioielli
(€ 1.200, `client_label='perso'`), l'MRR attivo è **€ 13.300**. Le dashboard
sovrastimano del 23%.

### Q7 / Q8 — Fatturato = **incassato, al netto IVA** ✅

Definizione canonica:
```
Fatturato(periodo) = Σ invoices.taxable_amount
                     WHERE status='pagata' AND paid_at ∈ periodo
                     MENO Σ delle note di credito con lo stesso criterio
```

Tre conseguenze operative:

1. **La data di periodo è `paid_at`, non `month`.** Tutto il codice attuale usa
   `month` (dashboard righe 122/160, workspace riga 108). Va cambiato: una
   fattura di gennaio incassata a marzo appartiene a **marzo**.
2. **L'importo è `taxable_amount` (imponibile), non `amount`.** Serve la
   scomposizione IVA della migration 118. Finché non c'è, `amount` va trattato
   come imponibile — da confermare con chi inserirà le prime fatture.
3. Le fatture emesse e non ancora incassate **non compaiono** nel fatturato.
   Vivono in una metrica separata ("Da incassare"), già presente in dashboard
   come `totalPending` / `totalOverdue`.

### Q10 — Workspace vede **Total MRR + Total Fatturato** ✅

Deviazione consapevole dal §8 del brief (che autorizzava solo il fatturato).

`workspace_revenue_summary()` ritorna quindi:
```
year, revenue_ytd, monthly_revenue[], total_mrr,
annual_target?, target_progress?, updated_at
```
Entrambi **solo come somma aziendale**. Restano vietati al Workspace: MRR per
cliente, ricavo per cliente/progetto, fatture, preventivi, margini, costi.

La garanzia si sposta dal codice di pagina (oggi: service role inline in
`workspace/page.tsx:106`) alla RPC `SECURITY DEFINER` con guardia `is_staff()`.

### Q19 — routine Growth → **da chiarire, vedi sotto**

Domanda riformulata nel round 2.

---

---

## Round 2 — 2026-07-19

### Date di fine contratto ✅

| Cliente | `end_date` | Stream |
|---|---|---|
| Industrial Services & Facility | **2026-06-30** | `growth` / `recurring` / `cessato` |
| AV Gioielli | **2026-04-30** | `growth` / `recurring` / `cessato` |

Entrambe già passate (oggi 2026-07-19). **MRR attivo reale = € 13.300**, non
€ 16.300. Le dashboard sovrastimano del 23% finché il trigger su `clients.mrr`
non è attivo.

### Q9 — Note di credito → **sottratte** ✅

```
Fatturato(periodo) = Σ taxable_amount (invoice_type='fattura')
                   − Σ taxable_amount (invoice_type='nota_credito')
   con status='pagata' AND paid_at ∈ periodo
```

Corregge il bug latente di `ControlloGestioneClient.tsx:119`, dove oggi una nota
di credito `pagata` verrebbe **sommata** (manca il filtro `invoice_type`).

### Q11 — Obiettivo annuale nel Workspace → **sì** ✅

Serve la tabella `company_targets(year, revenue_target, updated_at)` — non esiste
(`client_targets` della 047 sono target KPI di cliente, cosa diversa).
Admin-only in scrittura; l'RPC `workspace_revenue_summary` espone `annual_target`
e `target_progress` al Workspace.

⚠️ Serve il **valore dell'obiettivo 2026**.

### Q19 / Q20 — Template routine → **generato** ✅

`docs/revenue/11-GROWTH_ROUTINE_TEMPLATES.md`: 9 routine, modificabili per
cliente. Owner per cliente con fallback sul template. Rollout su un cliente
pilota prima dell'estensione.

⚠️ Da confermare: lista, frequenze, ore stimate, Q21 (routine non eseguite).

### Q25 — Ad hoc → il nuovo scope-cliente **sostituisce** ✅

La milestone "Ad Hoc" di `app/actions/workspace-create.ts` viene rimossa.
Impatti: `workspace-create.ts` (`AD_HOC_TITLE`, `ensureAdHocMilestone`),
`WorkspaceQuickCreate.tsx`, `ContextualCreate.tsx` (voce «⚡ Ad Hoc — richiesta
una tantum» → punta al nuovo scope cliente).

In produzione non esistono milestone "Ad Hoc" (0 progetti): nessuna migrazione
di dati, solo rimozione di codice.

---

---

## Round 3 — 2026-07-19

### Q13 — Metriche Digital in Fase 2 ✅

Quattro, come raccomandato:

| Metrica | Formula |
|---|---|
| Digital **venduto** | Σ `quotes.final_price` · `status='accettata'` · accettato ∈ periodo |
| Digital **incassato** | Σ `invoices.taxable_amount` · stream `service_line='digital'` · `paid_at` ∈ periodo |
| Digital **backlog** | Σ `revenue_streams.amount` (attivi, digital) − già fatturato |
| **SAL non fatturati** | Σ `revenue_milestones.amount` · `status='maturato'` · `invoice_id IS NULL` |

Escluse per ora: "fatturato" (ridondante con incassato, data la definizione di
Q7) e "contrattualizzato" (utile con più progetti Digital in parallelo).

### Q27 — `service_line` unica verità, `project_kind` deprecata ✅

Migration 115 aggiunge `service_line`. `project_kind` resta in tabella come
colonna morta, rimossa in una migration successiva. Da aggiornare i punti che la
leggono: `lib/workload.ts` (`WLProject.project_kind`, `filterTasks`),
`WorkloadClient`, `ProgettiWidget`, `ProgettiClient`.

Zero conversione dati (`projects` = 0 righe).

### Obiettivo fatturato 2026 → **€ 300.000** ✅

```sql
INSERT INTO public.company_targets (year, revenue_target) VALUES (2026, 300000);
```

**Sanity check**: MRR attivo € 13.300 × 12 = **€ 159.600** di ricorrente teorico
annuo. Per arrivare a € 300.000 servono **~€ 140.000 di Digital / una tantum**,
cioè il 47% del fatturato da lavoro non ricorrente. È il numero che giustifica
tutta questa separazione: metà del fatturato oggi non è misurabile.

### Industrial Services & Facility ✅

- `client_type` resta **`digital`**
- stream Growth `recurring` **cessato** al 2026-06-30
- esiste una **proposta Digital in corso** → da censire come `quotes` (stato
  `inviata`) e, se accettata, come `revenue_streams` `digital`

È il primo caso reale che userà il nuovo modello: stesso cliente, uno stream
Growth chiuso e uno Digital aperto. Nel modello vecchio (`clients.mrr` = un
numero) era irrappresentabile.

### Ore stimate routine → **default basso uniforme, 1,0 h** ✅ (round 4)

Non eliminate: `lib/workload.ts` applica `DEFAULT_TASK_HOURS = 4` alle task senza
stima, quindi "nessuna ora" significherebbe 4 h ciascuna → 508 h/mese e Workload
inutilizzabile. Default esplicito a 1,0 h, modificabile per routine e per cliente.

Aggregato risultante: **127 h/mese su 7 clienti** — quasi identico alla stima
differenziata (128 h). Cambia la distribuzione, non il totale.

### Q21 — Routine non eseguite → **C+** ✅ (round 4)

| Frequenza | Comportamento |
|---|---|
| settimanale, quindicinale | **auto-chiusura** a `non_svolta` alla generazione del periodo successivo. Esce dalle liste operative e dal Workload, resta nello storico |
| mensile, trimestrale | **resta scaduta** finché non viene chiusa a mano |

Serve un nuovo stato task `non_svolta` (ALTER del CHECK su `tasks.status`, come
già fatto dalla 101 per `richiesta_supporto`). La chiusura automatica è un job
idempotente che gira insieme al generatore: alla creazione di `period_key` N+1,
le occorrenze della stessa `routine_id` con `period_key` ≤ N-1 ancora aperte e
frequenza settimanale/quindicinale passano a `non_svolta`.

Beneficio: il tasso di esecuzione delle routine per cliente diventa una metrica
reale ("su Petito 3 controlli saltati su 4"), oggi non misurabile.

---

## Aperte dopo il round 2

- valore dell'obiettivo di fatturato 2026
- `client_type` di Industrial S&F: resta `digital` o torna `growth`?
- `invoices.amount` sulle prime fatture: imponibile o lordo, chi lo inserisce?
- conferma lista/frequenze/ore delle 9 routine (doc 11)
- Q13 (metriche Digital), Q27 (`project_kind`) — riformulate nel round 3
- Q1, Q3, Q4, Q5, Q6, Q12, Q14–Q18, Q21–Q24, Q26 (doc 10, sezione A)

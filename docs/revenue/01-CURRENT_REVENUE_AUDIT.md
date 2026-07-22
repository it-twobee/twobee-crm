# 01 — Audit economico attuale (read-only)

Data: 2026-07-19 · Metodo: lettura di migration, tipi, query, componenti + SELECT
read-only sul DB di produzione via service role. Nessuna scrittura eseguita.

---

## 0. Il fatto che cambia tutto: la produzione è quasi vuota

Conteggi reali (produzione, `Prefer: count=exact`):

| Tabella | Righe |
|---|---|
| `clients` | **12** (11 esterni + "Two Bee") |
| `profiles` | 9 |
| `projects` | **0** |
| `invoices` | **0** |
| `quotes` | **0** |
| `deals` | **0** |
| `sprints` | **0** |
| `client_kpis` | **0** |
| `project_cost_entries` | **0** |
| `tasks` | **7** (tutte `project_id IS NULL`, tutte di test: "Test 1", "tewst", "Supporto: Supporto: Ads Petito Grafiche") |
| `business_costs` | 11 |
| `resource_costs` | 6 |

**Conseguenza operativa**: il brief presuppone «clienti reali, progetti reali,
task reali, sprint, milestone, fatture, preventivi» da riclassificare con cautela.
Non esistono. L'unico dato economico reale in piattaforma è la colonna
`clients.mrr` su 12 righe, inserita a mano.

Questo elimina quasi tutto il rischio di migrazione (§15, §16, Fase 6) e apre la
possibilità di **modellare correttamente adesso**, invece di stratificare campi
additivi su un modello che non regge. Vedi `07-DATABASE_CHANGE_PLAN.md`.

---

## 1. Come viene calcolato oggi l'MRR

Una sola formula, ripetuta in 6 punti del codice:

```ts
MRR = Σ clients.mrr  dove !is_internal  (talvolta anche client_label != 'perso')
```

Occorrenze:

| File | Riga | Filtro |
|---|---|---|
| `app/(dashboard)/dashboard/page.tsx` | 270 | `!is_internal` |
| `app/(workspace)/workspace/page.tsx` | 107–110 | `client_label != 'perso'` |
| `components/controllo-gestione/ControlloGestioneClient.tsx` | 120 | `!is_internal` |
| `components/dashboard/MarginRadar.tsx` | 24, 32–34 | split per `client_type` |
| `components/dashboard/GrowthPerformance.tsx` | 70 | media sui growth |
| `components/dashboard/RevenueChart.tsx` | 193, 211 | `currentMrr` come linea di riferimento |

**Non esiste** una view SQL, una RPC o una funzione condivisa per l'MRR. È una
`reduce` copiata sei volte con **tre filtri diversi**: dashboard e controllo di
gestione includono i clienti persi, il Workspace no. I tre numeri divergono.

### Cosa entra nel calcolo

`clients.mrr` è un `NUMERIC` scritto a mano in `NewClientModal` / `AnagraficaTab`.
Non deriva da contratti, preventivi o fatture. Non ha data di inizio o fine, non
ha storicità, non ha valuta, non distingue competenza da cassa. Cambiare l'MRR di
un cliente riscrive retroattivamente ogni grafico che lo usa.

Dati reali: 9 clienti su 12 hanno `mrr > 0`, totale **€ 16.300**. Fra questi c'è
**Industrial Services & Facility, `client_type='digital'`, `mrr = 1.800**` — cioè
il problema del brief è già in produzione: un cliente Digital contribuisce
all'MRR aziendale senza che nulla dica se sia un canone o un progetto spalmato.
Al contrario Seven Holding ed Elettra Group (entrambi `digital`) hanno `mrr = 0`.

`AV Gioielli` ha `client_label = 'perso'` e `mrr = 1.200`: entra nell'MRR di
dashboard e controllo di gestione, non in quello del Workspace.

---

## 2. Come viene calcolato il fatturato

```ts
Fatturato = Σ invoices.amount  dove status = 'pagata'
```

- `app/(dashboard)/dashboard/page.tsx:122` — ultimi 6 mesi, `invoice_type='fattura'`, `status='pagata'`, raggruppato per `month`
- `app/(dashboard)/dashboard/page.tsx:160,306-312` — split `totalPaid` / `totalPending` / `totalOverdue`
- `app/(workspace)/workspace/page.tsx:108` — YTD, `invoice_type='fattura'`, `status='pagata'`
- `ControlloGestioneClient.tsx:119` — tutto lo storico, `status='pagata'`, **senza** filtro `invoice_type`

### È emesso o incassato?

**Incassato** — `status = 'pagata'`. Ma la data usata per il periodo è
`invoices.month`, non `paid_at`. `month` è il mese di **competenza** della
fattura. Quindi il valore è "importo delle fatture di competenza del periodo X
che risultano incassate a oggi": né cassa pura né competenza pura. Una fattura di
gennaio pagata a marzo cade in gennaio. Il label UI del Workspace dice
"Totale incassato quest'anno" (`workspace/page.tsx:203`) ed è impreciso.

`paid_at` esiste in tabella ma **non è mai usato in un'aggregazione**.

---

## 3. IVA e note di credito

- **IVA**: `invoices` ha un solo campo `amount NUMERIC(10,2)`. Nessun
  `imponibile` / `vat_rate` / `vat_amount` / `total_gross`. È impossibile sapere
  se gli importi inseriti siano lordi o netti — è una convenzione implicita
  nella testa di chi inserisce. Nessun punto del codice applica o scorpora IVA.
- **Note di credito**: `invoice_type IN ('fattura','nota_credito')` (migration
  006). Sono **escluse** dagli aggregati tramite `.eq('invoice_type','fattura')`
  in dashboard e Workspace — cioè ignorate, **non sottratte**.
  `ControlloGestioneClient.tsx:119` omette il filtro: se una nota di credito
  avesse `status='pagata'` verrebbe **sommata**, invertendo il segno.
  Bug latente, oggi inerte perché `invoices` è vuota.

---

## 4. Collegamenti fra entità economiche

| Collegamento | Esiste? |
|---|---|
| `invoices → clients` | ✅ `client_id` |
| `invoices → projects` | ❌ **nessuna colonna** |
| `invoices → quotes` | ❌ |
| `quotes → clients` | ✅ `client_id` |
| `quotes → deals` | ✅ `deal_id` |
| `quotes → projects` | ❌ **nessuna colonna** |
| `deals → clients` | ✅ `client_id` (nullable) |
| `deals → projects` | ❌ |
| `projects → prezzo/valore` | ❌ `projects` non ha **nessun campo economico** |
| `project_cost_entries → projects` | ✅ (unico link progetto↔economia, ma è il **costo**, non il ricavo) |

**`invoices` ha `UNIQUE(client_id, month)`** (migration 002). Un cliente può avere
**una sola fattura per mese**. Un cliente Growth+Digital che nello stesso mese
riceve il canone e un SAL di progetto **non è rappresentabile**. Questo vincolo
da solo rende impossibile qualsiasi separazione Growth/Digital sul fatturato.

### Come viene derivato il "ricavo di progetto"

`ControlloGestioneClient.tsx:133-135`:

```ts
const revenue = invoices
  .filter(i => i.client_id === p.client_id && i.status === 'pagata')
  .reduce((s, i) => s + i.amount, 0)
```

Il ricavo di **ogni** progetto è il fatturato **totale del cliente**. Un cliente
con 3 progetti produce 3 volte lo stesso ricavo. Il margine per progetto
(riga 733) e il "Costi e margine per progetto" sono **strutturalmente errati** —
doppio conteggio garantito appena esisteranno più progetti per cliente.

---

## 5. I ricavi Digital sono identificabili?

**No.** Le uniche dimensioni disponibili sono:

- `clients.client_type ∈ (growth | digital | growth_digital)` — **sul cliente**, non sul ricavo
- `projects.project_kind ∈ (growth | marketing | digital | ai)` — esiste ma non è collegato ad alcun importo
- `projects.project_type ∈ (ecommerce | lead_gen | sito_web | app_ai | campagna | custom)` — tipologia tecnica

Nessuna fattura, nessun preventivo, nessun deal porta una linea di servizio.
`MarginRadar.tsx:32-34` produce `growthMrr` / `digitalMrr` / `bothMrr`
partitionando i clienti per `client_type` — ma un cliente `growth_digital`
finisce interamente in `bothMrr`, e il suo MRR non è scomponibile perché è **un
solo numero**.

Nessuna delle metriche del §7 del brief (Digital venduto / contrattualizzato /
fatturato / incassato / backlog / SAL) è oggi calcolabile, nemmeno in teoria.

---

## 6. Costi e marginalità

Tre tabelle, tutte `FOR ALL USING (get_my_role() = 'admin')`:

- `resource_costs` (6 righe) — costo risorsa con `calculated_hourly_cost`, `markup_default`
- `project_cost_entries` (0 righe) — costi imputati a progetto/cliente, 7 categorie
- `business_costs` (11 righe) — overhead mensile aziendale

Formula margine (`ControlloGestioneClient.tsx:119-126`):

```
grossMargin = Σ invoices(pagata) − Σ project_cost_entries
marginPct   = grossMargin / totalRevenue
```

`business_costs` (`monthlyOverhead`, riga 123) è **calcolato ma escluso** dal
margine. Il "margine lordo" mostrato ignora l'overhead. Inoltre somma ricavi
storici (tutti gli anni) contro costi storici senza allineare i periodi:
`project_cost_entries.month` esiste ma non viene filtrato.

`quotes` ha un motore margini completo (migration 064: `total_cost`,
`target_margin`, `final_price`, `margin_amount`, `margin_percentage`) — **ben
modellato e completamente inutilizzato**, perché `quotes` è vuota e non è
collegata né a progetti né a fatture. È l'unico posto della piattaforma dove il
prezzo è già una entità di prima classe.

---

## 7. Superficie di sicurezza economica

Stato attuale (migration 100, già in produzione):

- `deals`, `quotes`, `proposal_documents`, `invoices`, `resource_costs`,
  `project_cost_entries`, `business_costs` → RLS `admin` only ✅
- VIEW `clients_workspace` con `mrr = 0` e fiscali `NULL`, `security_invoker=false` ✅
- `clients_team_all` droppata ✅

**Falla**: `app/(workspace)/workspace/page.tsx:106` usa `createAdminClient()`
(service role, bypassa ogni RLS) per calcolare `totalMrr` e `totalInvoicedYtd` e
li rende al Workspace. Al browser arriva solo la somma — corretto come principio —
ma:

1. l'aggregazione avviene in una pagina, non in una view/RPC governata: chiunque
   modifichi quel file può passare da `select('mrr')` a `select('mrr,company_name')`
   senza che nessuna RLS lo fermi;
2. il §8 del brief autorizza il Workspace a vedere **solo il fatturato
   aggregato**. Oggi vede **anche il Total MRR**. È una deviazione da decidere
   (vedi domanda Q10);
3. non esiste `workspace_revenue_summary`.

---

## 8. Dati storici da riclassificare

Praticamente nulla:

- **12 clienti** — da assegnare a una linea di servizio e a un modello di ricavo
  reale (oggi: `client_type` + un numero `mrr`).
- **0 progetti, 0 fatture, 0 preventivi, 0 deal** — niente da migrare.
- **7 task** — tutte di test, tutte senza progetto. Da cancellare, non da migrare.
- 11 `business_costs` + 6 `resource_costs` — non toccati da questa modifica.

Dettaglio in `02-PROJECT_CLASSIFICATION_PLAN.md`.

---

## 9. Rischi di doppio conteggio (attuali e futuri)

| # | Rischio | Stato |
|---|---|---|
| R1 | Ricavo di progetto = fatturato dell'intero cliente → N progetti moltiplicano il ricavo ×N | **Bug presente**, latente solo perché `projects` è vuota |
| R2 | MRR annualizzato + fatture del canone contate entrambi come "ricavo" | Certo appena si fattureranno i canoni: `clients.mrr` e `invoices` sono scollegati |
| R3 | Nota di credito `pagata` sommata invece che sottratta in Controllo di Gestione | Bug presente (`riga 119`, manca `invoice_type`) |
| R4 | Tre definizioni divergenti di MRR (con/senza persi, con/senza interni) | Presente |
| R5 | `UNIQUE(client_id, month)` forza a fondere canone e progetto in una riga → il Digital diventa indistinguibile per costruzione | Presente |
| R6 | Deal `chiuso_vinto` + quote `accettata` + fattura emessa: tre importi per lo stesso ricavo, nessun link | Certo appena si userà il commerciale |
| R7 | Overhead escluso dal margine → marginalità sovrastimata | Presente |

---

## 10. Verdetto

Non esiste un "modello economico" da estendere. Esiste `clients.mrr`, un numero
scritto a mano, e `invoices` con un vincolo che impedisce più di una fattura per
cliente al mese. Tutto il resto (`quotes` con i margini, `deals`, i costi) è
modellato ma scollegato e vuoto.

Aggiungere `service_line` e `revenue_model` a `projects` — la proposta del §5 del
brief — **non risolve nulla**, perché `projects` non porta importi: il ricavo
resta su `clients.mrr` e su `invoices`, nessuno dei due classificabile.

La leva corretta è spostare il ricavo su un'entità dedicata
(`revenue_streams` / accordo economico) e collegare `invoices` a essa. Proposta
in `07-DATABASE_CHANGE_PLAN.md`.

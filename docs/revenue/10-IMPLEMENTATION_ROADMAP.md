# 10 — Roadmap di implementazione e domande bloccanti

## A. Le domande bloccanti

Numerate per poter rispondere in blocco («Q1: solo Growth. Q2: sì. …»).

### MRR e ricorrenza

- **Q1** — L'MRR deve comprendere **esclusivamente** Growth ricorrente?
- **Q2** — I contratti Digital di manutenzione entrano nell'MRR generale?
  *(Caso concreto: Industrial Services & Facility, `digital`, € 1.800/mese oggi
  dentro l'MRR.)*
- **Q3** — Mostriamo **Growth MRR / Digital recurring / Total Recurring Revenue**
  come tre metriche separate?
- **Q4** — Un contratto **sospeso** entra nel mese corrente?
- **Q5** — L'MRR segue il **mese di competenza** o la **data fattura**?
- **Q6** — Dilazioni e fatture emesse in ritardo: si imputano al mese di
  competenza o al mese di emissione?

### Fatturato

- **Q7** — «Fatturato 2026» = fatture **emesse**, **incassate** o **ricavi di
  competenza**? *(Oggi è un ibrido: importi `pagata` datati per `month`.)*
- **Q8** — Gli importi sono al **netto** dell'IVA? *(Oggi `invoices.amount` è un
  campo unico e ambiguo: nessuno sa se chi inserisce mette lordo o netto.)*
- **Q9** — Le note di credito vanno **sottratte** (oggi sono solo escluse)?
- **Q10** — Il Workspace vede **solo** il fatturato YTD, o anche il Total MRR?
  *(Oggi vede entrambi — deviazione dal §8 del brief.)*
- **Q11** — Serve un **obiettivo annuale** di fatturato? Se sì va creata
  `company_targets` (non esiste).
- **Q12** — Il Workspace vede la suddivisione Growth/Digital o solo il totale?

### Digital

- **Q13** — Quali indicatori Digital servono davvero **in Fase 2**: venduto,
  contrattualizzato, fatturato, incassato, backlog, SAL? *(Tutti e sei è
  fattibile, ma allunga la fase.)*
- **Q14** — Ogni progetto Digital ha **sempre** un preventivo iniziale? *(Se sì,
  `revenue_streams.quote_id` può essere reso obbligatorio per il Digital.)*
- **Q15** — Un progetto Digital può avere canoni ricorrenti **oltre** al progetto
  (es. sito + manutenzione)? *(Se sì servono 2 stream sullo stesso progetto — il
  modello lo prevede, ma cambia la UI del wizard.)*
- **Q16** — Acconto / SAL / saldo: percentuali standard o libere per progetto?

### Growth

- **Q17** — Quanto dura tipicamente la fase **Startup**?
- **Q18** — Le routine sono settimanali, mensili o configurabili per cliente?
- **Q19** — **Quali routine** vanno generate automaticamente? Serve l'elenco
  reale — è il seed di `task_templates` e determina il carico generato su 9
  clienti Growth.
- **Q20** — Le routine hanno **owner predefinito** per template, o per cliente?
- **Q21** — Una routine non eseguita si **riporta** al ciclo successivo, resta
  scaduta, o si chiude come "non svolta"?
- **Q22** — Le iniziative una tantum devono avere **sprint e milestone propri**,
  o bastano milestone dentro il progetto Growth?

### Ad hoc

- **Q23** — Le 7 task di test in produzione: **cancellare** o convertire in
  `personal`?
- **Q24** — Le task ad hoc sono visibili nel **portale cliente**? *(Esiste già
  `is_client_task` per governarlo per singola task.)*
- **Q25** — Il nuovo scope-cliente **sostituisce** la milestone "Ad Hoc" già in
  uso in `workspace-create.ts`, o convivono? *(Due cose chiamate "Ad Hoc" con
  significati diversi confondono chiunque.)*
- **Q26** — Imputazione economica delle ad hoc: costo generale cliente / costo
  progetto / overhead / non fatturabile?

### Trasversale

- **Q27** — Confermi la **deprecazione di `project_kind`** in favore di
  `service_line`? *(Tenerle entrambe = due fonti di verità sulla stessa cosa.)*
- **Q28** — Confermi il **`DROP` del vincolo `UNIQUE(client_id, month)`** su
  `invoices`? È la sola modifica non additiva, oggi a rischio zero (0 fatture),
  irreversibile dopo il primo uso reale. Senza, Growth e Digital **non sono
  separabili** sul fatturato.

---

## B. Roadmap rivista

La sequenza del §19 è corretta come ordine. Cambiano i pesi, perché la
produzione è vuota:

| Fase | Contenuto | Peso reale |
|---|---|---|
| **0** | Backup + fix dei 4 bug economici latenti (doc 09, passo 6) | **piccola, da fare subito** |
| **1** | Classificazione (115) + `revenue_streams`/`revenue_milestones` (116–117) + `invoices` (118) + RPC Workspace (122) + backfill 12 clienti | grande — è il cuore |
| **2** | Dashboard economiche: scorecard Admin, tooltip formula/fonte, card unica Workspace | media |
| **3** | Task ad hoc: scope (120), RLS (121), `ClientAdHocPanel`, Workload | media |
| **4** | Growth engine: `growth_routines`/`growth_initiatives` (119), generatore idempotente, `GrowthProjectView` | **la più grande** |
| **5** | Digital: estrazione `DigitalProjectView`, Gantt | piccola — esiste già quasi tutto |
| **6** | Backfill | **quasi nulla** — 12 clienti, 7 task |
| **7** | Test: RLS con utente `team` reale, formule, dashboard, Workload, build | media |

**Nota sulla Fase 5**: l'estrazione di `DigitalProjectView` dai 2980 righe di
`ProjectPageClient` va anticipata all'inizio della **Fase 4**, come commit isolato
senza modifiche funzionali. Costruire `GrowthProjectView` dentro un file già a
3000 righe è il modo più affidabile per introdurre regressioni invisibili.

---

## C. Top rischi

| # | Rischio | Mitigazione |
|---|---|---|
| **1** | **RLS ad hoc**: `project_id IS NULL` significa già "task personale privata" (migration 094). Implementare il §10 alla lettera nasconde ogni task ad hoc a tutto il team. Fallisce in silenzio — liste vuote, nessun errore | `scope_type` esplicito (doc 05) + test con un login `team` reale, non con l'admin |
| **2** | **Finestra sul vincolo `UNIQUE(client_id, month)`**: oggi si droppa a costo zero. Dopo le prime fatture reali diventa una migrazione delicata, e nel frattempo Growth e Digital restano fusi | Decidere Q28 **prima** di emettere la prima fattura |
| **3** | **`clients.mrr` letto in 6 punti con 3 filtri diversi**: qualunque nuova metrica costruita sopra eredita l'incoerenza | Renderlo derivato da `revenue_streams` (trigger) **prima** di toccare le dashboard |
| **4** | **Doppio conteggio ricavo di progetto**: `ControlloGestioneClient.tsx:133` assegna a ogni progetto il fatturato dell'intero cliente. Latente solo perché `projects` è vuota; si attiva al secondo progetto di un cliente | Fix in Fase 0, prima di importare i progetti da Asana |
| **5** | **Import Asana imminente** (commit `2c3e418`, `7112157`): sta per creare i primi progetti reali. Se arriva prima della 115, nascono tutti senza `service_line` e la classificazione torna a essere un backfill | Allineare le due cose: o la 115 prima dell'import, o l'import scrive già `service_line` |
| **6** | **Volume di routine generate**: 9 clienti Growth × N routine × frequenza. Con l'elenco sbagliato (Q19) si producono centinaia di task da cancellare a mano | Seed su **un solo cliente pilota**, poi estensione |
| **7** | **`ProjectPageClient` a 2980 righe** deve ospitare due esperienze | Estrazione preventiva, commit separato |
| **8** | **Service role nel Workspace** (`workspace/page.tsx:106`): la barriera economica dipende da un `.select()` che nessuno deve allargare | RPC `workspace_revenue_summary`, garanzia spostata nel DB |

---

## D. Top decisioni ancora da prendere

1. **Q2 / Q28** — se il Digital ricorrente entra nell'MRR e se si droppa il
   vincolo sulle fatture. Insieme determinano se la separazione Growth/Digital è
   davvero possibile o solo cosmetica.
2. **Q7 / Q8** — competenza vs cassa, lordo vs netto. Ogni scorecard del §7
   dipende da queste due.
3. **Q19** — l'elenco reale delle routine Growth. È il contenuto della Fase 4.
4. **Q10** — cosa vede esattamente il Workspace (oggi vede più di quanto il §8
   autorizzi).
5. **Q26** — imputazione economica delle ad hoc; senza, la marginalità per
   cliente resta approssimata.

---

## E. Schema dati consigliato (sintesi)

```
clients ──┬─< revenue_streams >──┬── projects
          │    service_line       │
          │    revenue_model      └── quotes
          │    amount, date, status
          │         │
          │         └─< revenue_milestones ──> invoices
          │                trigger_task_id ──> tasks (milestone di progetto)
          │
          ├─< invoices  (+ stream_id, project_id, IVA scorporata)
          │
          └─< tasks (scope_type: project | client | personal)
                     work_type: project | startup | routine | initiative | adhoc
                     routine_id + period_key  ← UNIQUE = idempotenza
                     initiative_id

projects ──< growth_routines      (la regola)
         ──< growth_initiatives   (il lavoro una tantum)
         ──< sprints ──< tasks(is_milestone) ──< tasks(parent_task_id)
```

Tre principi:
1. **Il prezzo non sta sul progetto.** Sta su `revenue_streams`, che può esistere
   senza progetto (i 9 canoni Growth di oggi) o con più di uno per progetto
   (progetto + manutenzione).
2. **Il dominio task resta unico** (§20.16). Cambiano due colonne di
   classificazione, non la tabella.
3. **La ricorrenza è una regola separata dalle sue occorrenze**, e l'idempotenza
   è un `UNIQUE` nel database, non un `if` nel codice.

---

## F. Formule consigliate

```
Growth MRR       = Σ rs.amount /mese  | service_line='growth'
                                       ∧ revenue_model ∈ (recurring, maintenance)
                                       ∧ status='attivo' ∧ start ≤ oggi < COALESCE(end, ∞)
Total Recurring  = idem, tutte le service_line
Digital venduto  = Σ quotes.final_price | status='accettata' ∧ accepted_at ∈ anno
Digital contratt = Σ rs.amount | service_line='digital' ∧ status='attivo'
Digital fatturato= Σ inv.taxable_amount | stream.service_line='digital' ∧ sent_at ∈ anno
Digital incassato= idem su paid_at
Backlog Digital  = contrattualizzato − fatturato
Fatturato YTD    = Σ inv.taxable_amount(fattura) − Σ inv.taxable_amount(nota_credito)
Margine cliente  = ricavi − costi diretti − quota overhead allocata
```

Da confermare con Q5–Q9: se il fatturato è per competenza si usa `month`, se è
cassa si usa `paid_at`, se è emesso si usa `sent_at`. **Oggi il codice usa
`month` chiamandolo "incassato": è la prima cosa da chiarire**, perché tre
dashboard su tre ereditano l'ambiguità.

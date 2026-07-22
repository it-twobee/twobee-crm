# 12 — Roadmap e domande bloccanti

## A. Le domande

Numerate per rispondere in blocco. Le prime tre bloccano l'architettura, il
resto blocca singole fasi.

### Architettura (bloccanti)

- **A1** — `delivery_model` passa ai 5 valori del brief (`growth_program`,
  `digital_project`, `recurring_service`, `structured_one_off`,
  `hybrid_delivery`)? Oggi sono 3 e mettono nello stesso secchio il Growth
  Program e il Continuing Designer, che sono motori diversi. Con 2 progetti in
  produzione si rinomina a costo zero; dopo l'import Asana no.
- **A2** — `project_type` si divide? Oggi fa due lavori: verticale Growth
  (`ecommerce`/`lead_gen`) e tipologia Digital (`sito_web`/`app_ai`). Propongo
  `growth_vertical` separato e `project_type` solo tecnico.
- **A3** — Service Catalog dentro `task_templates` (esiste, vuota, ha già
  `service_type` e `tasks JSONB`) o tabella nuova?

### Growth

- **A4** — Le 3 settimane di Startup sono un default modificabile per cliente, o
  fisse?
- **A5** — Quali task della Startup sono **obbligatorie** (gate) e quali
  facoltative?
- **A6** — I 3 flow di Marketing Automation: confermi welcome / abandoned cart /
  post purchase per e-commerce, e nuova lead / nurturing / follow-up per lead gen?
- **A7** — Le 4 creatività sono 4 **concept** o 4 **formati** dello stesso concept?
- **A8** — Serve la frequenza **giornaliera** per le routine? Oggi il minimo è
  settimanale.
- **A9** — Chi approva la chiusura della Startup: PM, admin o cliente?
- **A10** — Il Planning Cycle è obbligatorio per ogni Growth Program o opzionale?
- **A11** — Chi può modificare i template ricorrenti: admin, o anche il PM del
  progetto?

### Digital

- **A12** — Quali fasi sono standard nel template? Le 12 del brief o un
  sottoinsieme?
- **A13** — Il test cliente ha una durata predefinita (es. 5 giorni lavorativi)?
- **A14** — Le revisioni extra oltre il pattuito: si tracciano come task, si
  fatturano, o si accumulano in un contatore?
- **A15** — Chi approva una milestone: PM, admin o cliente?
- **A16** — La data stimata si aggiorna da sola a ogni cambiamento, o solo su
  richiesta esplicita ("ricalcola")?
- **A17** — Il cliente vede la data **stimata** o solo quella **concordata**?

### Partner

- **A18** — Il partner può creare task dentro il suo work package?
- **A19** — Il partner può modificare milestone?
- **A20** — Il partner vede il nome del cliente?
- **A21** — Chi approva le consegne del partner?

### Marketing

- **A22** — Continuing Designer: a ore, a task, a pacchetto o a canone?
- **A23** — Brand Identity usa la Gantt Digital o basta l'elenco fasi?
- **A24** — Analisi di mercato: servizio a sé, blocco della Startup Growth, o
  entrambi?
- **A25** — Creazione evento: serve gestione fornitori dedicata, o bastano
  `project_cost_entries`?

### Ad hoc

- **A26** — Imputazione economica: costo cliente, costo progetto, overhead o non
  fatturabile? *(era Q26 del brief precedente, ancora aperta)*
- **A27** — Serve un plafond/monte ore mensile con avviso al superamento?

### Pulizia

- **A28** — Confermi la cancellazione del progetto `Test` (31 task), delle 7 task
  di prova e dei 3 lead finti?

---

## B. Roadmap

Le fasi del §32 riordinate su ciò che esiste davvero.

| Fase | Contenuto | Stato | Peso |
|---|---|---|---|
| **1** | Classificazione: `delivery_model` a 5, Service Catalog, `growth_vertical`, tipi TS | parziale | media |
| **2** | Wizard unico: 8 step, creazione atomica, rimozione degli 8 form | **da fare** | **grande** |
| **3** | Attività ad hoc | ✅ **fatto** (128) | — |
| **4** | Growth Startup: template 3 settimane, verticali, gate, creatività, tracking, automation | da fare | grande |
| **5** | Growth Operations: routine, ricorrenze, generazione idempotente | ✅ **fatto** (129/130) | — |
| **6** | Growth Planning: cicli, stagionalità, eventi, iniziative | parziale (iniziative ✅) | media |
| **7** | Digital Engine: fasi, release, testing, date dinamiche, partner | **da fare** | **la più grande** |
| **8** | Marketing Services: mapping ai motori, Recurring Service | da fare | media |
| **9** | Portali: Admin, Workspace, Cliente, Partner | da fare | media |
| **10** | Backfill e test | quasi nulla | piccola |

**Il peso è tutto su 2, 4 e 7.** Le fasi 3 e 5 sono chiuse, la 10 è quasi vuota.

### Percorso consigliato

```
1 (classificazione)  →  adeguare import Asana  →  2 (wizard)  →  4 (Startup)  →  7 (Digital)
```

La fase 1 va **prima dell'import Asana**: 85 progetti che nascono senza servizio
sono 85 classificazioni da rifare a mano.

---

## C. Top problemi attuali

1. **Otto punti di creazione progetto**, nessuno chiede il servizio e uno
   (`NewClientModal`) crea progetti senza chiedere nulla.
2. **Il catalogo servizi vive in un componente React**, hardcoded, e uno dei sei
   template è già classificato male (`E-commerce` marcato `growth` con milestone
   Digital).
3. **`project_type` fa due lavori** e con il catalogo diventa ambiguo.
4. **`ProjectPageClient` a 3000 righe** serve Growth e Digital insieme; con
   Marketing e Recurring Service diventa insostenibile.
5. **Nessuna nozione di fase, release, test cliente, data stimata**: il Digital
   ha la struttura ma non il governo.
6. **Il partner non esiste operativamente**: `resource_profiles` a 0 righe,
   nessuna RLS che limiti un partner al suo work package.

## D. Top rischi

| # | Rischio | Mitigazione |
|---|---|---|
| 1 | **L'import Asana parte prima della classificazione** → 85 progetti da riclassificare a mano | fase 1 prima dell'import, e lo script scrive il servizio |
| 2 | **Data stimata inaffidabile** (§17): se metà delle task non ha stima, il numero è un indovinello e nessuno si fida più | `estimate_confidence` obbligatoria e mostrata accanto alla data |
| 3 | **RLS partner**: la barriera va nel database, non nella UI | test con un utente partner reale, non col service role — due volte oggi la guardia applicativa è passata mentre il DB lasciava fare |
| 4 | **Unificare 8 form** rompe abitudini di chi li usa ogni giorno | il wizard accetta un contesto (cliente/reparto precompilato) così i punti d'ingresso restano |
| 5 | **Split di `ProjectPageClient`** | estrazione senza modifiche funzionali, commit separato, prima di ogni novità |
| 6 | **`delivery_model` rinominato in ritardo** | farlo ora che ci sono 2 righe |

## E. Modello consigliato — in una riga

> Il **servizio** dice cosa ha comprato il cliente, la **linea** chi lo fa, il
> **motore** come si organizza il lavoro, l'**accordo** come si guadagna.
> Quattro cose separate, un solo wizard che le sceglie insieme, e l'utente ne
> vede una sola.

---

## F. Decisioni prese (2026-07-19)

### A1 — `delivery_model` ai 5 valori ✅ (migration 132)
`growth_program` · `digital_project` · `recurring_service` · `structured_one_off`
· `hybrid_delivery`. Trigger 124 riallineato.

**Import Asana cancellato.** `scripts/import-asana.ts` rimosso (recuperabile dal
commit 7112157). Cade con lui il vincolo temporale: non c'è più fretta di
classificare prima che entrino 85 progetti.

### A1-bis — Obbligo dell'accordo economico ✅ (migration 132)
Ogni progetto nasce `economic_status='da_definire'` e finisce nella coda
`projects_missing_agreement`, visibile al solo admin. Non è una FK obbligatoria
perché il manager crea progetti ma non può scrivere `revenue_streams`
(admin-only dalla 116): bloccarlo avrebbe fermato l'operatività invece di
assegnare una responsabilità. Lo stato lo mantiene un trigger.

Il manager non vede l'importo del singolo progetto; il cumulo gli arriva
dall'aggregato di `workspace_revenue_summary`.

### A2 — `growth_vertical` separato ✅ (migration 132)
`project_type` smette di fare doppio lavoro. Backfill eseguito.

### A3 — Service Catalog: tabella nuova ✅ (migration 133)
`service_catalog`, 13 servizi seminati. `task_templates` resta e verrà dismessa.

### A4 — Startup: 3 settimane di **default modificabile per cliente** ✅
`projects.startup_target_days INT DEFAULT 21`, già previsto.

### A5 — Gate obbligatori: **nessuno per ora**
Le task di Startup nascono tutte facoltative. La chiusura della fase resta una
decisione umana, non un vincolo di sistema. Da riprendere quando ci sarà
esperienza reale su qualche cliente.

### A6 — 3 flow di automation confermati, ma **estendibili** ✅
E-commerce: welcome · abandoned cart · post purchase.
Lead gen: nuova lead · nurturing · follow-up.
Devono poter essere aggiunti flussi nuovi per cliente → i flow vivono in
`service_catalog.startup_tasks` (JSONB) e diventano task modificabili sul
progetto, non un elenco cablato nel codice.

### A7 — 4 creatività di **default modificabile** ✅
Dipende dal lavoro. Stesso trattamento dei flow: un numero suggerito dal
catalogo, non un vincolo.

### A28 — Pulizia dati di prova ✅ eseguita
Cancellati: progetto `Test` (+31 task in cascade, +4 sprint), 7 task di prova,
3 lead finti. Restano: 1 progetto reale, 27 occorrenze di routine, 11 routine,
10 accordi economici.

---

## G. Il principio che emerge da A4–A7

Tutte e quattro le risposte dicono la stessa cosa: **il catalogo propone, il
progetto dispone.** Durata Startup, flussi di automation, numero di creatività,
task obbligatorie — nessuno di questi è un vincolo di sistema, sono default che
si modificano per cliente.

Conseguenza architetturale: il contenuto dei template sta in `service_catalog`
come JSONB e viene **copiato** sul progetto alla creazione. Da quel momento le
due cose divergono liberamente. È lo stesso modello già usato per le routine
Growth (`growth_routines.template_key` ricorda l'origine ma non vincola), e va
esteso a Startup, flow e creatività.

Il rovescio della medaglia da tenere a mente: cambiare il default aziendale
**non** aggiorna i progetti esistenti. È voluto — propagare all'indietro
sorprenderebbe chi ha personalizzato — ma va detto nella UI del catalogo.

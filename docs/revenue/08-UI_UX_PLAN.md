# 08 — Piano UI/UX

## 1. Creazione progetto — il tipo come primo campo (§11)

Oggi: `NewProjectDetailedModal` (in `components/progetti/ProgettiClient.tsx`) e
il CRUD in `PanoramicaTab` chiedono i campi tutti insieme, con `project_kind`
come una select fra le altre.

Nuovo: **step 0 = Tipo di progetto** (Growth / Digital / AI / Hybrid /
Consulting), a card grandi, e da lì due wizard distinti con progressive
disclosure. Il tipo scelto scrive `projects.service_line` e determina
`delivery_model` di default (Growth → `recurring_operations`, Digital →
`structured_project`).

Il campo **Contratto/accordo economico** (step 3 Growth, step 4 Digital) crea o
collega un `revenue_streams`. È visibile **solo all'admin**: se il wizard è
aperto da un `manager` quello step è assente e lo stream resta da creare
dall'admin. Non mostrare un campo prezzo disabilitato — comunica comunque che
esiste un prezzo.

## 2. Router di progetto

`components/projects/ProjectPageClient.tsx` (~2980 righe) diventa un router
sottile:

```
ProjectPageClient
├── project.service_line === 'growth' → GrowthProjectView   (nuovo)
└── altrimenti                        → DigitalProjectView  (estratto invariato)
```

L'estrazione di `DigitalProjectView` è un taglia-incolla senza modifiche
funzionali: va fatta **come commit separato**, prima di ogni novità, così una
regressione è attribuibile.

Sotto-componenti condivisi (Appuntamenti, Riunioni, KPI, Aggiornamenti,
Customer Care, Documenti, Chat) restano comuni ai due.

## 3. Navigazione Growth (§12)

`Panoramica · Startup · Routine · Iniziative · Ad hoc cliente · KPI ·
Aggiornamenti · Appuntamenti · Riunioni · Customer Care · Documenti`

**Panoramica** (nessuna Gantt in prima battuta):
- stato Startup — barra di completamento; se completata, collassata a una riga
- Routine: da fare questa settimana / **scadute** (in `text-error`) / completate
- Iniziative attive con owner e scadenza
- KPI principali del mese
- Prossima attività, prossimo controllo, alert

**Routine** — filtri a segmenti: `Questa settimana · Questo mese · Scadute ·
Prossime · Completate`. Azioni per riga: completa, rimanda, assegna, commenta,
apri. Modifica: dialog a due scelte esplicite — «solo questa occorrenza» (UPDATE
sulla task) vs «tutte le prossime» (UPDATE su `growth_routines`). Mai un
comportamento implicito.

**Iniziative** — elenco / board / timeline. Un'iniziativa complessa apre una
struttura sprint+milestone riusando i componenti Digital.

## 4. Navigazione Digital (§13)

`Panoramica · Piano progetto · Sprint e Milestone · Task · Ad hoc cliente ·
Appuntamenti · Riunioni · KPI · Aggiornamenti · Customer Care · Documenti`

Rispetto a oggi cambiano solo: il tab **Ad hoc cliente** (nuovo), **Piano
progetto** (Gantt, Fase 5, riusa `lib/workload.ts`), e il blocco **stato
economico** in Panoramica — renderizzato **solo se `role === 'admin'`, con il
dato fetchato server-side dietro guardia di ruolo**, non nascosto via CSS.

## 5. Pannello "Attività ad hoc del cliente"

Componente unico `<ClientAdHocPanel clientId>` montato in due posti:
- tab dedicato nel dominio cliente (`clienti/[id]`)
- tab contestuale in ogni progetto del cliente (Growth e Digital)

Query: `scope_type='client' AND client_id = X`. **Non tocca mai `project_id`** —
è il punto del §10 da non tradire: nel pannello di progetto queste task si
vedono, ma restano di scope cliente.

Azioni: crea, assegna owner, scadenza, priorità, **collega a un progetto**
(transizione `client → project`, doc 05), filtra per stato/risorsa, visibilità
cliente (`is_client_task`, campo già esistente).

## 6. Scorecard Admin (§7)

Sostituire la singola card "MRR" di `KpiCards`:

| Scorecard | Formula |
|---|---|
| Growth MRR | Σ `revenue_streams.amount` normalizzato/mese · `service_line='growth'` · `revenue_model IN ('recurring','maintenance')` · `status='attivo'` |
| Total Recurring Revenue | idem, tutte le service_line |
| Digital venduto YTD | Σ `quotes.final_price` · `status='accettata'` · anno corrente |
| Digital fatturato YTD | Σ `invoices` join stream `service_line='digital'` · `sent_at` anno corrente |
| Digital incassato YTD | idem su `paid_at` |
| Fatturato totale YTD | Σ `invoices` · `invoice_type='fattura'` **meno** Σ `nota_credito` |
| Backlog Digital | contrattualizzato − fatturato |
| Marginalità media | (ricavi − costi diretti − quota overhead) / ricavi |

Ogni card ha un tooltip con **formula, periodo, fonte, ultimo aggiornamento**
(§7, §20.19). Proposta: un componente `<MetricTooltip>` che riceve i quattro
campi, così la spiegazione vive accanto al numero e non in un doc.

`MarginRadar.tsx:32-34` (split MRR per `client_type`) va riscritto sulla
`service_line` dello stream: oggi un cliente `growth_digital` finisce
interamente in `bothMrr` e non è scomponibile.

## 7. Workspace (§8)

Una sola card: **Fatturato TwoBee {anno}** — totale YTD, sparkline mensile,
obiettivo annuale + % se configurato, data ultimo aggiornamento. Sorgente:
RPC `workspace_revenue_summary`. Nessun filtro per cliente/progetto/risorsa.

Decisione aperta: se il Total MRR resta visibile (Q10). Oggi c'è.

## 8. Workload (§14)

`lib/workload.ts` va esteso (doc 05):
- `WLTask.project_id: string | null`, `+ client_id`, `+ work_type`
- le task `scope='client'` entrano in `computeResourceLoads`,
  `computeEffortBuckets`, `computeIntensity`; restano fuori da `computeProjectLoads`
- `WLFilters`: `kind` diventa `serviceLine`; si aggiunge
  `workType: 'routine' | 'initiative' | 'adhoc' | 'project' | null`
- ogni elemento espone: cliente, progetto **o scope cliente**, tipo lavoro,
  owner, periodo, effort, priorità, stato
- l'AI Planning deve proiettare le **routine future non ancora generate**
  (leggere `growth_routines` attive, non solo le `tasks` esistenti) — altrimenti
  il carico di un cliente Growth risulta sistematicamente sottostimato

## 9. Design system

Vincoli di `CLAUDE.md` validi ovunque: token only (`bg-surface`, `text-gold-text`
per il gold-inchiostro, `bg-gold`+`text-on-gold` per il gold-riempimento), mai
sotto `text-2xs`, `aria-label` sulle icon-only, `overflow-x-auto` sui wrapper
tabella. Verifica in entrambi i temi sul DOM renderizzato.

Nota: `RevenueChart.tsx:211` usa `stroke="#F5C800"` hardcoded — da correggere
in `var(--color-gold-text)` quando si tocca il grafico.

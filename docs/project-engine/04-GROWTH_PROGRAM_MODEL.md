# 04 — Growth Program

## Cosa esiste già (Fase 4, oggi)

- `growth_routines` — la regola ricorrente, per progetto
- occorrenze come `tasks` con `routine_id` + `period_key`, unicità nell'indice
- `growth_initiatives` — le una tantum
- `lib/growth-routines.ts` — seed per verticale, calcolo periodi, auto-chiusura
- `GrowthSections.tsx` — Panoramica / Routine / Iniziative / Lead

Verificato su Fatima: 11 routine, 27 occorrenze, seconda esecuzione 0 inserimenti.

## Cosa manca

```
Growth Program
├── Startup & Setting        ← MANCA
├── Operations ricorrenti    ✅
├── Planning Cycles          ← MANCA
├── Iniziative una tantum    ✅
└── Attività ad hoc cliente  ✅
```

---

## Startup & Setting (§8)

Fase una tantum, **3 settimane di default, configurabile**. Non si rigenera.

Non serve una tabella: è un insieme di task con `work_type='startup'` sotto una
milestone di sistema, più i gate di uscita. Lo stesso pattern già usato per le
routine — il dominio task resta unico (§20.16 del brief precedente).

```sql
ALTER TABLE public.projects
  ADD COLUMN startup_started_on DATE,
  ADD COLUMN startup_target_days INT DEFAULT 21,
  ADD COLUMN startup_completed_at TIMESTAMPTZ,
  ADD COLUMN growth_vertical TEXT CHECK (growth_vertical IN ('ecommerce','lead_gen'));
```

`growth_vertical` risolve il doppio lavoro di `project_type`: il verticale Growth
smette di condividere il campo con la tipologia tecnica Digital.

### Contenuto (dal brief §8.2–8.6)

**Comune**: onboarding, accessi, documenti, analisi mercato/competitor/benchmark,
analisi offerta e target, storico dati, marginalità preliminare, budget, audit
canali e tracking, piano misurazione, dashboard, KPI, strategia.

**Tracking (§8.3)**: GA4, Google Ads, Meta Pixel, Conversion API, Tag Manager,
eventi, conversioni, verifica form/checkout, attribuzione, test, documentazione.

**Automation (§8.4)**: 3 flow per verticale.
E-commerce → welcome, abandoned cart, post purchase.
Lead gen → nuova lead, nurturing, follow-up.

**E-commerce (§8.5)**: audit, funnel, conversion rate, checkout, catalogo, best
seller, marginalità prodotto, AOV, retention, CRO, upsell, cross-sell,
creatività, campagne.

**Lead gen (§8.6)**: processo commerciale, qualification, definizione lead
qualificata, SLA primo contatto, pipeline, feedback vendita, script, follow-up,
valore lead, campagne, funnel.

**Creatività (§8.7)**: 4 di default, modificabile. Ogni creatività è una task con
concept, formato, canale, copy, asset, owner, stato, date, approvazione,
campagna collegata — nei campi task esistenti più `metadata`.

### Gate di uscita (§8.8)

La Startup si chiude solo se: accessi ricevuti · tracking verificato · KPI
definiti · dashboard disponibile · automazioni attive · creatività pronte ·
campagne avviate · budget approvato · piano confermato.

I gate sono task `work_type='startup'` marcate come bloccanti. Chiudere la
Startup non cancella nulla: la sezione resta consultabile e si collassa.

---

## Planning Cycles (§10)

Contenitore **dentro** il Growth Program, non un progetto separato.

```sql
CREATE TABLE public.growth_planning_cycles (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,               -- 'Q4 Black Friday e Natale'
  cadence TEXT,                      -- trimestrale|semestrale|annuale|custom
  start_date DATE, end_date DATE,
  objectives TEXT, targets JSONB,
  budget NUMERIC(12,2),
  seasonality JSONB,                 -- eventi, promozioni, ricorrenze
  kpi_targets JSONB,
  risks TEXT, opportunities TEXT,
  status TEXT,                       -- bozza|proposto|approvato|chiuso
  approved_by UUID, approved_at TIMESTAMPTZ
);
```

`growth_initiatives` guadagna `planning_cycle_id` per legare le iniziative al
ciclo che le ha decise.

L'AI può precompilare da Knowledge, storico KPI e planning precedenti, ma
**non salva** (§27).

---

## UI

Navigazione: `Panoramica · Startup · Routine · Pianificazione · Iniziative ·
Ad hoc · Lead|Negozio · KPI · Aggiornamenti · Appuntamenti · Riunioni ·
Customer Care · Documenti`.

Le prime cinque esistono o sono in costruzione; le altre sono già in
`ProjectPageClient`.

Panoramica (§12.1): stato Startup con percentuale, routine di oggi/scadute/
prossime, iniziative attive, planning corrente, KPI, alert, richieste cliente,
prossima azione. **Nessuna Gantt in prima battuta.**

Routine (§12.2): viste Oggi / Settimana / Mese / Scadute / Prossime / Completate.
Oggi ce ne sono tre (Settimana, Scadute, Regole) — da estendere. Serve anche la
frequenza **giornaliera**, non ancora supportata.

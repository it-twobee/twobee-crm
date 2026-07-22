# 08 — Wizard unico di creazione progetto

## Il problema

**Otto punti di creazione progetto**, nessuno condiviso:

| File | Cosa chiede |
|---|---|
| `workspace-create.ts:59` | nome, kind, type |
| `workspace-create.ts:306` | nome, kind |
| `NewClientModal.tsx:110` | **niente** — crea `Progetto {cliente}` in automatico |
| `PanoramicaTab.tsx:469` | nome, descrizione, type, kind |
| `ProjectStatusTab.tsx:766` | nome, … |
| `ProgettiClient.tsx:927` | template con milestone |
| `CreateProjectModal.tsx:51` | reparto |
| `OperativaClient.tsx:93` | inline |

Nessuno scrive `service_line` (ci pensa il trigger 124), nessuno chiede il
servizio, nessuno collega un accordo economico. `NewClientModal` è il peggiore:
crea un progetto senza chiedere nulla, e con il catalogo diventerebbe un progetto
non classificabile.

## Gli 8 step (§6)

**1. Cliente** — precompilato se apri dalla scheda cliente. Mostra servizi e
progetti già attivi, sovrapposizioni, referente, alert.

**2. Servizio** — prima la linea (Growth / Digital / Marketing / AI /
Consulenza), poi il servizio dal catalogo. Il motore operativo e il modello
economico li sceglie il **sistema**, non l'utente.

**3. Configurazione** — domande in italiano, non in schema:
*"È continuativo o ha una fine?"* · *"Lo fate voi o con un partner?"* ·
*"Quando parte?"* · *"Qual è l'obiettivo?"*
L'utente non deve mai leggere `delivery_engine`.

**4. Accordo commerciale** — collega lead, deal, preventivo, `revenue_streams`.
Se il preventivo esiste, **l'importo non si riscrive**: si collega.

**5. Team** — PM, responsabile operativo, risorse, freelance, partner,
supervisore, referente cliente. Mostra carico attuale (da `lib/workload.ts`).
**Mai i costi risorsa** a chi non è autorizzato.

**6. Template e pianificazione** — flusso diverso per motore:
Growth Program → verticale, Startup 3 settimane, routine, planning
Digital Project → fasi, sprint, milestone, release
Recurring Service → ciclo, capacità, backlog
Structured One-off → fasi, deliverable

**7. Anteprima** — cliente, servizio, modello, struttura, date, risorse, task
generate, milestone, routine, KPI, partner, **dati mancanti e warning**. Si può
tornare indietro.

**8. Creazione atomica** — progetto, membri, fasi, sprint, milestone, task,
routine, KPI, collegamenti commerciali, cartelle, notifiche.

## Atomicità (§6 step 8)

PostgREST non dà transazioni multi-statement. Due strade:

- **A** — una funzione Postgres `create_project_from_catalog(payload jsonb)` che
  fa tutto in una transazione. Atomica davvero, ma la logica finisce in SQL.
- **B** — una server action che crea in sequenza e, in caso di errore, cancella
  quanto creato (compensazione). Più leggibile, ma un crash del processo a metà
  lascia un progetto parziale.

**Raccomandazione: A.** Il brief chiede "non deve lasciare progetti parziali
senza segnalazione" e la compensazione non lo garantisce. Il costo è una funzione
SQL lunga, il beneficio è che non esiste lo stato intermedio.

## Cosa fare degli 8 form

- `ProgettiClient`, `PanoramicaTab`, `ProjectStatusTab`, `CreateProjectModal`,
  `OperativaClient`, i due `workspace-create` → **rimpiazzati** dal wizard, con
  il contesto passato come parametro (cliente precompilato, reparto precompilato)
- `NewClientModal` → **smette di creare progetti**. Alla fine propone "Attiva un
  servizio per questo cliente" e apre il wizard.

## AI Prefill (§27)

`Compila con AI` · `Genera piano` · `Usa template`, alimentati da dati cliente,
Knowledge, recap meeting, preventivo, storico. Le rotte `app/api/ai/*` esistono
già (`extract-project`, `sprint-plan`).

Flusso obbligatorio: **AI suggerisce → utente modifica → utente conferma →
sistema crea**. Mai salvataggio automatico.

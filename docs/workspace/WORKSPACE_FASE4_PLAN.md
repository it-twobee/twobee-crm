# WORKSPACE — Piano Fase 4: Dominio Cliente / Progetto

> DA APPROVARE. Copre §12, §13, §14, §15 (+sotto), §16, §16.1, §17, §20, §24, §6.1.
> Decisioni già prese: D13 (appuntamenti 20gg, matching OR), D14 (riunioni→task interne+cliente).
> Componenti condivisi Admin↔Workspace (ClientPageClient/ProjectPageClient): stesso codice, flag portale.

## Slice (ordine per rischio/dipendenze)

### 4a — Anagrafica: `display_name` / `legal_name` (§24) 🟠 [migration 105]
Oggi `clients.company_name` è l'unico nome. Migration 105: `ADD display_name`, `legal_name`
(backfill `display_name = company_name`). `AnagraficaTab`: campi separati, modifica solo
super_admin/admin (server+RLS). UI: dove si mostra il "nome visualizzato" si usa `display_name`
(fallback company_name); `legal_name` compare su documenti fiscali/preventivi/fatture.
*Propagazione ampia (scheda/ricerca/preventivi/fatture/documenti/portale) → incrementale, con fallback.*

### 4b — CTA "Crea" contestuale (§12, §15) 🟠
Menu "Crea" in alto a destra nel dominio cliente e progetto: nuovo progetto/sprint/milestone/
task/subtask, con contesto precompilato (client_id dal cliente; client+project dal progetto;
sprint dallo sprint; ecc.). Niente opzioni impossibili (sprint richiede progetto; milestone
richiede progetto+sprint). Riusa `workspace-create.ts` (createProjectWs/Sprint/Milestone) + create task.

### 4c — Panoramica pulita + tab "Progetti attivi" autonoma (§13, §14) 🟠
`ClientPageClient`: rimuovi link "Tutta" dalla scorecard Relazione commerciale; sposta
"Progetti attivi (N)" in una **tab autonoma** tra Panoramica e KPI (no duplicazione con
Panoramica, che mostra solo sintesi + CTA). Tab mostra progetto/tipo/stato/PM/risorse/sprint
corrente/milestone prossima/deadline/rischio/avanzamento/task aperte/scadute; click → dominio progetto.

### 4d — Brief view/edit mode (§15.1) 🟢
`BriefPanel`: dopo salvataggio resta in **lettura** (brief pulito + CTA "Modifica brief").
Template/AI/genera-piano/form visibili solo in edit-mode. Annulla non perde il brief.

### 4e — Gantt collassabile + hover condiviso (§15.2) 🟠
`GanttChart`: collassato di base (mostra sprint + milestone); task/subtask solo su espansione.
Scala giorno/mese/anno. Hover ricco riusando `taskHoverText` (già in lib/workload da 3c) →
niente doppia implementazione. Fix colori hardcoded del Gantt.

### 4f — Drawer su sprint/milestone (§15.3) 🟠
Le task già aprono `TaskDrawer` (Fase 1b). Aggiungere: click su riga sprint/milestone → drawer
laterale coerente (sezioni specifiche per non-task, stesso stile). Sub-task → stesso TaskDrawer.

### 4g — Appuntamenti 20gg + matching normalizzato (§16) 🟢
Finestra 60→**20gg** (D13). Funzione di matching verificabile: lowercase, rimozione punteggiatura,
normalizzazione spazi, token match su **nome cliente OR nome progetto** (D13); soglia minima.
Stati: match sicuro / suggerito / non collegato. (§16.1 nuovo evento da progetto: già fatto in 2d.)

### 4h — Riunioni → task (§17) 🟠
L'estrazione AI (già in RiunioniTab) genera **task suggerite** in una preview modificabile
(titolo/descrizione/scadenza/priorità/owner/progetto/sprint/milestone; select/deselect/elimina).
Solo le confermate diventano task reali; interne **o** cliente (`is_client_task`, D14). File non conservato (già così).

### 4i — Dashboard task cliccabili → drawer (§6.1, residuo Fase 1) 🟢
Le liste task della dashboard workspace aprono il `TaskDrawer` condiviso.

### 4j — Task cliente: preview inline-editabile (§20, rifinitura) 🟢
Nella preview AI/template, rendere editabili titolo/scadenza/priorità **prima** della conferma.

## Output §37
- **Migration**: `105_client_names.sql` (display_name/legal_name + backfill).
- **File**: `ClientPageClient`, `tabs/AnagraficaTab`, `tabs/PanoramicaTab`, nuova tab progetti attivi,
  `ProjectPageClient` (Brief/Gantt/drawer/CTA), `tabs/AppuntamentiTab`, `tabs/RiunioniTab`,
  `tabs/ClientPlanTab`, dashboard workspace, `workspace-create.ts`, lib matching.
- **Rischi**: ClientPageClient/ProjectPageClient sono grandi e condivisi (regressioni); il matching
  deve essere verificabile (no falsi positivi ad alta confidenza); display_name propagazione ampia.
- **Rollback**: migration additiva; slice indipendenti e committate singolarmente.

## Domande bloccanti
- **Q1 (§16 matching)**: basta la **normalizzazione dei nomi** (lowercase/punteggiatura/token, cliente OR progetto) o vuoi anche un **campo alias** esplicito su clienti/progetti (più preciso ma migration + UI in più)? *Consiglio: normalizzazione per la v1.*
- **Q2 (§24 nomi)**: confermi che `display_name` = l'attuale `company_name` (backfill) e `legal_name` è **nuovo/opzionale** (ragione sociale, da compilare)? La modifica anagrafica resta solo admin (D3).
- **Q3 (§17 riunioni)**: le task generate dalla riunione le può creare chiunque veda il progetto o solo **admin/PM**? (Consiglio: admin/PM, come le altre scritture di progetto.)

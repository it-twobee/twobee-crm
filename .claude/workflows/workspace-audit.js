export const meta = {
  name: 'workspace-audit',
  description: 'Audit read-only del Portale Workspace TwoBee OS: 12 lettori paralleli per sottosistema, output strutturato per WORKSPACE_AUDIT.md',
  phases: [{ title: 'Audit', detail: 'un agente per sottosistema, confronto codice reale vs spec' }],
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string' },
    routes: { type: 'array', items: { type: 'string' } },
    components: { type: 'array', items: { type: 'string' } },
    tables: { type: 'array', items: { type: 'string' } },
    serverActions: { type: 'array', items: { type: 'string' } },
    apiRoutes: { type: 'array', items: { type: 'string' } },
    rls: { type: 'string' },
    dataFlow: { type: 'string' },
    duplicates: { type: 'array', items: { type: 'string' } },
    reusable: { type: 'array', items: { type: 'string' } },
    dataQualityIssues: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      requirement: { type: 'string' }, current: { type: 'string' }, gap: { type: 'string' } }, required: ['requirement','current','gap'] } },
    risks: { type: 'array', items: { type: 'string' } },
    blockingQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['area','routes','components','tables','gaps','risks','blockingQuestions'],
}

const base = (a) => `Sei un auditor READ-ONLY del monorepo Next.14/Supabase "TwoBee OS" (cwd already the repo).
NON modificare file. Leggi il codice REALE (Read/Grep/Glob) e ritorna dati verificati, non congetture.
Stai auditando l'area: **${a.label}**.
File/dir da leggere (non esaustivi, segui le dipendenze reali): ${a.files}
Confronta lo stato attuale con questi requisiti della spec (segnala ogni scostamento in gaps[]):
${a.focus}
Per ogni gap: requirement (cosa chiede la spec), current (cosa fa oggi il codice, con file:riga), gap (cosa manca/diverge).
Popola: routes, components, tables (DB reali), serverActions, apiRoutes, rls (chi legge/scrive, policy pertinenti), dataFlow (come i dati fluiscono), duplicates (componenti/logiche duplicate Admin vs Workspace), reusable (cosa riusare), dataQualityIssues, risks (rischi tecnici del refactor), blockingQuestions (SOLO domande che NON si risolvono leggendo codice o DB).
Sii conciso ma specifico: cita file e simboli reali.`

const AREAS = [
  { key: 'auth', label: 'Auth, routing e permessi',
    files: 'middleware.ts, lib/permissions.ts',
    focus: 'Spec §3: perimetro Workspace per ruolo (manager/senior/junior/stage/freelance/partner/viewer). Cosa il Workspace PUÒ vedere (clienti attivi, progetti, sprint, milestone, task, subtask, calendario, documenti operativi, CC, ticket, HR personale, MRR macro aggregato, fatturato totale aggregato) vs NON vedere (MRR per cliente, fatture, preventivi, marginalità, costi risorse, compensi, buste paga altrui, note founder, strategia riservata). Verifica che le protezioni esistano lato UI+ServerAction+API+query+RLS (non solo menu). Come sono definiti WORKSPACE_ROLES/ADMIN_ROLES/coarseRole.' },
  { key: 'shell', label: 'Workspace shell: layout, sidebar, sezioni, navigazione',
    files: 'app/(workspace)/layout.tsx, components/workspace/WorkspaceSidebar.tsx, app/(workspace)/workspace/** (elenca tutte le rotte e cosa rendono), supabase/migrations/087_workspace_groups_sections.sql',
    focus: 'Spec §9: la voce "Progetti attivi" deve diventare "Workload" (verifica rotte esistenti, serve redirect/alias). §21: in v1.0 resta SOLO la chat Customer Care; rimuovere dalla nav chat interne/DM/#best-ideas (senza cancellare tabelle). §28: bug active-state Ticket che tiene evidenziato Customer Care in giallo (route matching). Mappa sidebar attuale, workspace_sections e permessi sezione.' },
  { key: 'task', label: 'Task domain condiviso (task/subtask/stati/owner)',
    files: 'lib/types/database.ts (Task/status), components/tasks/* (MieAttivitaClient, KanbanBoard, ListView, TaskHub, TimeTracker, AssigneePicker), app/actions/task-assignees.ts, app/actions/workspace-create.ts, app/actions/workload-tasks.ts. Cerca in migrations lo status di tasks (enum vs text vs CHECK) e is_client_task, parent_task_id, depth.',
    focus: 'Spec §5/§7: UN SOLO dominio task condiviso tra Le mie attività, progetto, sprint/milestone, dashboard, workload, calendario (stessi campi/stati/validazione/drawer/owner/subtask/commenti/visibilità). Esiste già un TaskDetailDrawer/TaskEditor condiviso o ci sono N form diversi? Elenca ogni punto che rende un dettaglio/form task diverso. §7.1: conteggi private/operative/totali che escludono le completate — verifica se la definizione di "completata" è coerente ovunque (query/scorecard/board/dashboard/analitica/filtri) o se ci sono stringhe diverse (completato/completata/done/archiviato/annullato). Serve helper stati terminali? §6.1 task cliccabili ovunque → drawer condiviso.' },
  { key: 'project', label: 'Dominio Progetto (tab, sprint, milestone, gantt, brief)',
    files: 'components/projects/ProjectPageClient.tsx, components/projects/project-shared.*, components/projects/tabs/* (AppuntamentiTab, RiunioniTab, KpiTab, AggiornamentiTab, ChatTab, ClientPlanTab), components/projects/ProjectPrimitives.tsx. Cerca schema sprints/milestones nelle migrations.',
    focus: 'Spec §15: CTA "Crea" contestuale (sprint/milestone/task/subtask precompilati). §15.1 Brief view-mode/edit-mode (dopo salvataggio resta in lettura; template/AI/genera-piano solo in edit). §15.2 Gantt collassato di default, hover con data esatta/intervallo/owner/stato, stessa funzione hover del Workload. §15.3 click su sprint/milestone/task/subtask apre drawer condiviso. §16 Appuntamenti: eventi calendario reali prossimi 20 giorni con matching nome cliente/progetto normalizzato. §17 Riunioni: AI su PDF/DOC senza conservare il file; task suggerite modificabili prima di creare. §20 Task cliente: preview modificabile prima di conferma, is_client_task, appare nel portale cliente.' },
  { key: 'workload', label: 'Workload (griglia, timeline, intensità, AI planning)',
    files: 'lib/workload.ts, lib/workload-data.ts, components/workload/WorkloadClient.tsx, app/actions/workload-tasks.ts',
    focus: 'Spec §9: Workload come vista centrale progetti paralleli/risorse/effort/scadenze/milestone/conflitti. §9.1 progetti collassabili in timeline (default coerente, ricordo preferenza). §9.2 vista griglia + timeline con scale giorno/settimana/mese/anno/sprint/milestone e hover (data, intervallo, progetto, sprint/milestone, owner, effort, stato). §9.3 intensità futura su dati reali (estimated_hours, due_date, date sprint/milestone, assegnatari, assenze) con finestre 7/14/30/60/90; warning se mancano stime (niente default 4h silenzioso spacciato per reale). §9.4 AI planning che PROPONE senza modificare in automatico. Come calcola oggi l effort (default 4h?).' },
  { key: 'calendar', label: 'Calendario + Google Calendar',
    files: 'components/calendario/CalendarioClient.tsx, app/api/google/auth/route.ts, app/api/google/callback/route.ts, app/api/google/events/route.ts, app/api/google/disconnect/route.ts, google_credentials (migration 091), components/projects/tabs/AppuntamentiTab.tsx. Cerca un eventuale form evento.',
    focus: 'Spec §8.1: solo email @twobee.it possono collegare Google, verificato LATO SERVER (non solo CTA nascosta). §8.2 form "Nuovo evento" condiviso (CalendarEventForm) tra Calendario Workspace, Admin e Appuntamenti progetto, stile Google (titolo/data/ora/all-day/timezone/descrizione/luogo/partecipanti/meet/ricorrenza/promemoria/colore/cliente/progetto). §8.3 sync bidirezionale (external event id, calendar id, sync status, last synced, conflitti, token scaduto, retry, audit). §8.3 le TASK non vanno create come eventi Google: solo overlay interno. Stato attuale reale della sync e del form.' },
  { key: 'client', label: 'Dominio Cliente (panoramica, progetti, anagrafica, knowledge)',
    files: 'components/clients/ClientPageClient.tsx, components/clients/ClientiList.tsx, components/clients/tabs/* (PanoramicaTab, KpiTab, AnagraficaTab, e Relazione/ProjectStatus), app/actions/client-knowledge.ts. Cerca client_knowledge nelle migrations e campi clients (company_name, display_name, legal_name).',
    focus: 'Spec §12 CTA "Crea" contestuale nel dominio cliente. §13 Panoramica: rimuovere link "Tutta" dalla scorecard Relazione commerciale; "Progetti attivi (N)" diventa tab autonoma tra Panoramica e KPI (no duplicazione progetti). §14 tab Progetti attivi dedicata. §24 Anagrafica: distinguere display_name vs legal_name (oggi company_name NON è ragione sociale); permessi modifica super_admin/admin/manager server+RLS. §26 Knowledge: redesign in centro strategico (Mercato/Competitor/Brand/SWOT/Offerta/Idee/Info strategiche) con area Marginalità visibile SOLO a founder/super_admin/admin (server+RLS). Stato attuale di knowledge.' },
  { key: 'cc', label: 'Customer Care, Ticket e chat',
    files: 'components/customer-care/CustomerCareClient.tsx, components/ticket/TicketSystem.tsx, app/actions/cc-ai.ts, components/chat/ChatLayout.tsx, components/chat/SlackChat.tsx. Verifica come Workspace gestisce/esclude la chat.',
    focus: 'Spec §21: in v1.0 SOLO chat Customer Care; niente chat interne/DM/#best-ideas nel Workspace (nascondere/deprecare, non cancellare tabelle). §27 "Aggiungi persone" collassato di default; AI assistant INTERNO (invisibile al cliente, CTA "Suggerisci azioni" in basso a destra, non invia messaggi né crea task in automatico). §28 bug active-state Ticket vs Customer Care. Stato attuale.' },
  { key: 'docs', label: 'Documenti (Drive-only) + buste paga + documenti personali',
    files: 'components/documenti/DocumentiClient.tsx, components/workspace/payslips/PayslipsClient.tsx, app/actions/payslips.ts, components/workspace/personal/PersonalDocsClient.tsx, lib/personal-documents.ts. Cerca integrazione Google Drive esistente.',
    focus: 'Spec §11/§23: Documenti Workspace e Documenti cliente devono gestire SOLO link/cartelle Google Drive (niente upload/dropzone/storage generico lì), con anteprima alberatura Drive (espandi/collassa, apri in Drive, ricerca, filtro cliente/progetto, breadcrumb, stato integrazione). NON rimuovere upload usati da buste paga/documenti personali/HR. §31 buste paga: bucket privati, signed URL, mai pubblici. §32 documenti personali: ownership, signed URL, scadenza. Esiste già integrazione Drive o va costruita? Cosa usa storage locale oggi.' },
  { key: 'hr', label: 'HR + Feedback',
    files: 'components/workspace/WorkspaceHR.tsx, components/hr/HRClient.tsx, components/feedback/*, cerca le server action HR (ferie/permessi) e upload documento HR.',
    focus: 'Spec §29: dalla sezione Richieste HR rimuovere SOLO "Caricamento documento HR"; mantenere ferie/permessi/malattia/richieste/stato/approvazione e i documenti personali in area dedicata (non cancellare tabelle/dati). §30 Feedback: solo verificare submit/stato/notifica/ownership/error. Stato attuale HR (WorkspaceHR vs HRClient: sono due?).' },
  { key: 'history', label: 'Activity log, cronologia, restore, profilo',
    files: 'supabase/migrations/013_activity_log.sql, supabase/migrations/099_activity_log_uniform.sql, app/actions/restore-entity.ts, app/(workspace)/workspace/cronologia/page.tsx, components/workspace/CronologiaClient.tsx, app/(dashboard)/impostazioni/cronologia/page.tsx, components/workspace/ProfiloClient.tsx. Cerca campi profiles (competenze, email).',
    focus: 'Spec §33: cronologia con restore singola modifica quando reversibile (reversible vs not_reversible); l activity_log salva before/after snapshot e changed_fields? Servono colonne (reversible, restored_at, restored_by)? verifica schema esistente prima. §33.2 retention 30 giorni cronologia operativa, audit sicurezza separato e non cancellato. §34 Profilo: UI su griglia, aggiungere campo Email (read-only da Auth, mai solo in profiles), rimuovere "Competenze" dalla UI senza droppare colonna. Stato attuale.' },
  { key: 'dq', label: 'Data quality, RLS, migration, esposizione dati economici',
    files: 'supabase/migrations/097_data_quality_view.sql, panoramica supabase/migrations/ (elenca le tabelle chiave e le RLS helper: is_staff, get_my_role, get_my_client_ids, coarseRole), cerca policy USING(true) residue e tabelle con dati economici (invoices, deals, resource_costs, client marginality).',
    focus: 'Spec §35: verificare progetti senza PM, task senza owner/stima/scadenza/sprint, milestone senza sprint, subtask orfane, clienti senza assegnazioni/progetti, progetti senza membri, eventi non sincronizzati, documenti Drive senza folder id, risorse senza profilo. Estendere data_quality_report. Spec §3/§26: verificare che i dati economici (MRR per cliente, fatture, preventivi, marginalità, costi, compensi, buste paga altrui) NON siano esposti al Workspace a livello RLS/query, non solo UI. Elenca le tabelle economiche e chi può leggerle oggi.' },
]

const results = await parallel(AREAS.map(a => () =>
  agent(base(a), { label: `audit:${a.key}`, phase: 'Audit', schema: SCHEMA })
    .then(r => r ? { ...r, _key: a.key, _label: a.label } : { area: a.label, _key: a.key, _label: a.label, _failed: true })
))

return results.filter(Boolean)
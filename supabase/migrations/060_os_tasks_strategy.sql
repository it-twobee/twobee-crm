-- ─── TwoBee OS — task derivati dalla riunione strategica 23/06/2026 ──────────
-- Solo feature di piattaforma. I task operativi (campagne, clienti) sono esclusi.

-- ╔══════════════════════════════════════════════════════════╗
-- ║  A) GIÀ CONSEGNATE — storico (status completato)         ║
-- ╚══════════════════════════════════════════════════════════╝
INSERT INTO public.os_tasks (category, priority, section, status, completed_at, title, description, effort_days) VALUES
('costruire','alta','portale','completato',NOW(),
 'Task assegnate al cliente con tracciamento richieste',
 'Sezione dedicata alle task assegnate al cliente (condivisione documenti, autorizzazioni) come prova scritta delle richieste. Implementata con is_client_task, visibile nel Portale Cliente e in PanoramicaTab.',2.0),
('costruire','alta','reparti','completato',NOW(),
 'Tagging task e filtro trasversale Automation/Tracking',
 'Sistema di tagging sulle task per filtraggio trasversale dei progetti (Automation, Tracking, ecc.). Campo tags[] + filtri nella Board Team.',2.0),
('costruire','alta','reparti','completato',NOW(),
 'Vista trasversale per operativita (Board Team cross-cliente)',
 'Filtrare le attivita partendo dall operativita (es. tutte le task Automation su tutti i clienti) senza entrare nel singolo cliente. Realizzato in /reparti con Board Team.',3.0),
('costruire','alta','portale','completato',NOW(),
 'Portale cliente con login dedicato e RLS',
 'Portale dove il cliente accede ai propri dati (progetti, task, KPI, fatture). Login ruolo client, routing dedicato e hardening RLS (migration 059).',5.0),
('costruire','media','portale','completato',NOW(),
 'Aggiornamenti progetto visibili al cliente (blog/forum)',
 'Sezione stile blog/forum per pubblicare aggiornamenti e traguardi, visibile al cliente. Basata su project_comments.',2.0),
('costruire','alta','customer_care','completato',NOW(),
 'Customer Care e ticketing da portale',
 'Sezione Customer Care con chat e ticket; modalita portale dove il cliente inoltra ticket di supporto centralizzati con note interne.',4.0),
('costruire','alta','clienti','completato',NOW(),
 'Health score e classificazione rischio cliente',
 'Classificazione clienti (stabile, a rischio, perso) con Health Score basato su punteggi e parametri specifici. Filtro Growth/Digital.',3.0),
('costruire','media','clienti','completato',NOW(),
 'Relazioni commerciali e umore cliente',
 'Tracciamento interazioni commerciali (email, meeting, demo, proposte) e registrazione umore cliente. Tabella client_interactions, tab Relazione.',3.0),
('costruire','media','ai','completato',NOW(),
 'Recap riunioni AI da audio o trascrizione',
 'Upload audio/trascrizioni per recap automatico con decisioni e prossime azioni. Realizzato con Groq (extract-meeting).',3.0),
('costruire','alta','progetti','completato',NOW(),
 'Struttura Sprint Milestone Task',
 'Struttura progetti tipo Asana con sprint, milestone e task. Base per template di avvio progetto.',5.0),
('costruire','media','hr','completato',NOW(),
 'HR — ferie, permessi, straordinari',
 'Sezione gestione interna (HR) per tracciare ferie, permessi e straordinari del team.',3.0),
('costruire','media','reparti','completato',NOW(),
 'Strumenti interni (UTM builder, brief, prompt library)',
 'Strumenti di utilita: builder di UTM, generatori di brief e librerie di prompt. Realizzati in DeptToolbox.',3.0)
ON CONFLICT DO NOTHING;

-- ╔══════════════════════════════════════════════════════════╗
-- ║  B) PARZIALI — da completare (status aperto)             ║
-- ╚══════════════════════════════════════════════════════════╝
INSERT INTO public.os_tasks (category, priority, section, status, title, description, effort_days) VALUES
('modificare','alta','progetti','aperto',
 'Template onboarding progetti con task predefinite per tipo',
 'Struttura basata su template per l onboarding che assegna task predefinite ai progetti per tipo. Facilita avvio nuovi progetti con scadenze e fasi chiare.',3.0),
('modificare','media','kpi','aperto',
 'KPI report: integrare sezione di servizio e timeline operative',
 'Integrare la sezione di servizio e le timeline operative all interno dei report KPI per ogni cliente.',3.0),
('costruire','media','clienti','aperto',
 'Brief Knowledge per cliente (competitor, target, offerta)',
 'Sezione Brief per ogni cliente con informazioni strategiche, competitor, target e offerta, per facilitare l onboarding di nuovi collaboratori.',3.0),
('modificare','media','calendario','aperto',
 'Appuntamenti creabili dal portale cliente + sync Google Calendar',
 'Sincronizzazione con Google Calendar e creazione appuntamenti direttamente dal portale, con visibilita condivisa per il cliente sullo stato del progetto.',2.0),
('costruire','media','commerciale','aperto',
 'Forecast commerciale aggregato (revenue, budget, forecast)',
 'Visione aggregata con revenue complessiva, budget gestito e forecast commerciale per stimare la crescita in base al tasso di acquisizione clienti.',4.0),
('modificare','bassa','progetti','aperto',
 'Portfolio sostituito con vista per cliente',
 'Sostituire la sezione Portfolio con la visualizzazione per cliente; il filtraggio Growth/Digital avviene nella lista progetti.',2.0)
ON CONFLICT DO NOTHING;

-- ╔══════════════════════════════════════════════════════════╗
-- ║  C) GAP NETTI — da costruire (status aperto)             ║
-- ╚══════════════════════════════════════════════════════════╝
INSERT INTO public.os_tasks (category, priority, section, status, is_next_step, title, description, effort_days) VALUES
('costruire','critica','fatturazione',true,
 'Fatturazione elettronica — integrazione Aruba',
 'Configurare il sistema di fatturazione elettronica tramite integrazione con Aruba. Obbligo fiscale, assegnato a Marco.',6.0)
ON CONFLICT DO NOTHING;

INSERT INTO public.os_tasks (category, priority, section, status, title, description, effort_days) VALUES
('costruire','alta','portale','aperto',
 'File storage Google Drive + webview nel portale',
 'Integrare Google Drive come storage principale per file e documenti, visualizzati nella piattaforma tramite webview per sicurezza e risparmio spazio server. Il cliente accede ai file dal portale.',4.0),
('costruire','media','ricerca','aperto',
 'Ricerca globale cross-section (stile WhatsApp)',
 'Funzione di ricerca globale che permette di cercare parole chiave attraverso tutte le chat e sezioni della piattaforma.',5.0),
('costruire','media','hr','aperto',
 'Organigramma e definizione ruoli team',
 'Organigramma interno nella piattaforma per chiarire responsabilita e ruoli (Growth, Automation/Tracking, IT, Social Media Organic).',2.0),
('costruire','bassa','commerciale','aperto',
 'Import Excel benchmark, dati settore, competitor',
 'Integrare nella piattaforma il foglio Excel con dati di settore, benchmark e informazioni sui competitor.',3.0),
('costruire','media','lead','aperto',
 'Notifiche automatiche nuovi lead (SMS / in-app)',
 'Centralizzare la raccolta lead (sostituendo fogli Excel) e inviare notifiche automatiche (SMS o avvisi in app) all arrivo di nuovi lead per velocizzare la risposta commerciale.',3.0),
('modificare','bassa','clienti','aperto',
 'Gestire 2B come cliente attivo',
 '2B deve essere gestito come un cliente attivo e non piu come progetto secondario.',0.5)
ON CONFLICT DO NOTHING;

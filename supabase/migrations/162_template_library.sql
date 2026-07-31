-- 162 — Libreria template: più di un punto di partenza per ogni voce di catalogo.
--
-- Prima: 13 servizi a catalogo e 2 soli template, entrambi per Growth e fatti di
-- soli presidi ricorrenti. Undici servizi aprivano il wizard su «Nessun template»,
-- e nessun template sapeva descrivere un arco di consegna, perché l'editor cablava
-- workstream_type = 'recurring'.
--
-- Qui entrano 17 template: ogni servizio reale ne ha almeno uno, i principali
-- due o tre — di norma «avvio» (consegna datata) e «presidio» (ricorrente), più
-- una variante dove ha senso (rilancio, picco stagionale, restyling).
--
-- Le date sono relative all'avvio del progetto (`relative_due_days`): il wizard
-- le trasforma in date vere sulla data di inizio, e spostare l'inizio ridatta
-- tutto il piano. Le ore alimentano il Workload.
--
-- Idempotente: un template già presente con lo stesso servizio e nome viene
-- saltato, quindi rieseguire non duplica e non sovrascrive le tue modifiche.
-- Le stime sono un punto di partenza: si correggono in Impostazioni → Catalogo.

DO $seed$
DECLARE
  spec  JSONB := $json$
[
  {
    "service_type": "lead_generation", "service_subtype": null, "sort": 10,
    "name": "Lead Generation — Avvio e primo lancio",
    "description": "Da zero al primo lancio: accessi, tracciamento, funnel, campagne. Poi passa a presidio.",
    "ws": [
      { "name": "Setup e tracciamento", "type": "project", "desc": "Tutto ciò che deve esistere prima di spendere un euro in advertising.",
        "ms": [
          { "name": "Kickoff e accessi", "due": 5, "role": "Project Manager", "desc": "Il progetto non parte finché non abbiamo accessi e obiettivi condivisi.",
            "tasks": [
              { "name": "Riunione di avvio con il cliente", "due": 2, "h": 2, "role": "Project Manager", "prio": "alta", "desc": "Obiettivi, budget, vincoli, referenti. Verbale condiviso." },
              { "name": "Raccolta accessi e asset", "due": 5, "h": 2, "role": "Project Manager", "prio": "alta", "desc": "Ads, analytics, CRM, sito, brand kit. Manca un accesso, slitta il lancio." },
              { "name": "Definizione KPI e target", "due": 5, "h": 2, "role": "Growth Specialist", "prio": "alta", "desc": "CPL e volume attesi, con la soglia sotto cui si interviene." }
            ] },
          { "name": "Tracciamento e CRM", "due": 14, "role": "Data Analyst", "desc": "Senza dati affidabili l'ottimizzazione è a sensazione.",
            "tasks": [
              { "name": "Implementazione pixel e conversioni", "due": 10, "h": 4, "role": "Data Analyst", "prio": "alta" },
              { "name": "Collegamento CRM e sorgenti lead", "due": 12, "h": 3, "role": "Automation Specialist" },
              { "name": "Verifica end-to-end del tracciamento", "due": 14, "h": 2, "role": "Data Analyst", "prio": "alta", "desc": "Lead di prova che arriva fino al CRM con la sorgente giusta." }
            ] }
        ] },
      { "name": "Creatività e funnel", "type": "project", "desc": "Il messaggio e la pagina su cui atterra il traffico.",
        "ms": [
          { "name": "Landing e materiali", "due": 21, "role": "Creative", "desc": "Pagina pronta e testata prima delle campagne.",
            "tasks": [
              { "name": "Copy e messaggistica", "due": 17, "h": 4, "role": "Copywriter" },
              { "name": "Creatività per i canali", "due": 19, "h": 6, "role": "Creative" },
              { "name": "Landing page e form", "due": 21, "h": 6, "role": "UX Designer" }
            ] },
          { "name": "Lancio campagne", "due": 30, "role": "Media Buyer", "vis": "client_visible", "desc": "Prima erogazione reale, con budget contenuto e controllo quotidiano.",
            "tasks": [
              { "name": "Struttura campagne e pubblici", "due": 26, "h": 5, "role": "Media Buyer", "prio": "alta" },
              { "name": "Controllo pre-lancio", "due": 29, "h": 2, "role": "Media Buyer", "prio": "alta", "desc": "Budget, targeting, link, conversioni, limiti di spesa." },
              { "name": "Go live e presidio primi giorni", "due": 30, "h": 4, "role": "Media Buyer", "prio": "alta" }
            ] },
          { "name": "Prima ottimizzazione", "due": 45, "role": "Growth Specialist", "desc": "Con due settimane di dati si taglia ciò che non funziona.",
            "tasks": [
              { "name": "Analisi risultati e qualità lead", "due": 42, "h": 3, "role": "Growth Specialist" },
              { "name": "Riallocazione budget e stop agli sprechi", "due": 45, "h": 3, "role": "Media Buyer" },
              { "name": "Report di fine avvio al cliente", "due": 45, "h": 3, "role": "Project Manager", "prio": "alta" }
            ] }
        ] },
      { "name": "Presidio continuativo", "type": "recurring", "desc": "Parte a lancio avvenuto e non si ferma.",
        "rec": [
          { "name": "Check Ads", "freq": "weekly", "h": 1, "role": "Media Buyer" },
          { "name": "Check Budget", "freq": "weekly", "h": 0.5, "role": "Media Buyer" },
          { "name": "Check Tracking", "freq": "weekly", "h": 0.5, "role": "Data Analyst" },
          { "name": "Reportistica", "freq": "monthly", "h": 2, "role": "Growth Specialist" }
        ] }
    ]
  },
  {
    "service_type": "lead_generation", "service_subtype": null, "sort": 30,
    "name": "Lead Generation — Rilancio account esistente",
    "description": "Account già attivo che non rende: diagnosi, ristrutturazione, nuovo ciclo di test.",
    "ws": [
      { "name": "Diagnosi", "type": "project", "desc": "Capire perché non funziona prima di rimettere mano.",
        "ms": [
          { "name": "Audit account e funnel", "due": 7, "role": "Growth Specialist", "vis": "client_visible", "desc": "Fotografia dello stato con le tre cose che pesano di più.",
            "tasks": [
              { "name": "Analisi storica performance", "due": 4, "h": 4, "role": "Data Analyst" },
              { "name": "Revisione struttura campagne", "due": 5, "h": 3, "role": "Media Buyer" },
              { "name": "Verifica tracciamento e attribuzione", "due": 6, "h": 3, "role": "Data Analyst", "prio": "alta" },
              { "name": "Presentazione diagnosi al cliente", "due": 7, "h": 2, "role": "Project Manager", "prio": "alta" }
            ] }
        ] },
      { "name": "Ristrutturazione", "type": "project", "desc": "Si rifà l'impianto, non si aggiustano i dettagli.",
        "ms": [
          { "name": "Nuova struttura campagne", "due": 21, "role": "Media Buyer",
            "tasks": [
              { "name": "Riscrittura pubblici e segmentazione", "due": 16, "h": 4, "role": "Media Buyer" },
              { "name": "Migrazione budget sulla nuova struttura", "due": 19, "h": 3, "role": "Media Buyer", "prio": "alta" },
              { "name": "Correzione tracciamento", "due": 21, "h": 3, "role": "Data Analyst" }
            ] },
          { "name": "Nuove creatività e test", "due": 35, "role": "Creative",
            "tasks": [
              { "name": "Nuovo angolo di comunicazione", "due": 28, "h": 4, "role": "Copywriter" },
              { "name": "Produzione creatività", "due": 32, "h": 6, "role": "Creative" },
              { "name": "Avvio test strutturato", "due": 35, "h": 3, "role": "Media Buyer", "prio": "alta" }
            ] },
          { "name": "Verifica del rilancio", "due": 50, "role": "Growth Specialist", "vis": "client_visible",
            "tasks": [
              { "name": "Confronto prima/dopo su CPL e volume", "due": 48, "h": 3, "role": "Data Analyst" },
              { "name": "Report e decisione sul proseguo", "due": 50, "h": 2, "role": "Project Manager", "prio": "alta" }
            ] }
        ] },
      { "name": "Presidio continuativo", "type": "recurring",
        "rec": [
          { "name": "Check Ads", "freq": "weekly", "h": 1, "role": "Media Buyer" },
          { "name": "Ottimizzazione campagne", "freq": "weekly", "h": 2, "role": "Media Buyer" },
          { "name": "Reportistica", "freq": "monthly", "h": 2, "role": "Growth Specialist" }
        ] }
    ]
  },
  {
    "service_type": "saas", "service_subtype": null, "sort": 10,
    "name": "SaaS — Avvio acquisition",
    "description": "Impianto di acquisizione per un prodotto SaaS: tracciamento del funnel, campagne, onboarding.",
    "ws": [
      { "name": "Fondamenta dati", "type": "project", "desc": "Nel SaaS il costo per lead non dice niente: conta il percorso fino ad attivazione.",
        "ms": [
          { "name": "Mappatura funnel e eventi", "due": 12, "role": "Data Analyst",
            "tasks": [
              { "name": "Definizione eventi di prodotto", "due": 7, "h": 4, "role": "Data Analyst", "prio": "alta", "desc": "Signup, attivazione, conversione a pagamento." },
              { "name": "Implementazione tracciamento in-app", "due": 11, "h": 6, "role": "Developer" },
              { "name": "Verifica del percorso completo", "due": 12, "h": 2, "role": "Data Analyst", "prio": "alta" }
            ] }
        ] },
      { "name": "Acquisizione", "type": "project",
        "ms": [
          { "name": "Prime campagne", "due": 28, "role": "Media Buyer", "vis": "client_visible",
            "tasks": [
              { "name": "Ricerca keyword e pubblici", "due": 20, "h": 4, "role": "Growth Specialist" },
              { "name": "Landing di prodotto", "due": 24, "h": 6, "role": "UX Designer" },
              { "name": "Lancio campagne trial", "due": 28, "h": 4, "role": "Media Buyer", "prio": "alta" }
            ] },
          { "name": "Onboarding e attivazione", "due": 40, "role": "Automation Specialist", "desc": "Portare l'iscritto al primo valore, altrimenti l'acquisizione non paga.",
            "tasks": [
              { "name": "Sequenza email di onboarding", "due": 35, "h": 5, "role": "Automation Specialist" },
              { "name": "Analisi punti di abbandono", "due": 40, "h": 3, "role": "Data Analyst" }
            ] }
        ] },
      { "name": "Presidio continuativo", "type": "recurring",
        "rec": [
          { "name": "Check Ads", "freq": "weekly", "h": 1, "role": "Media Buyer" },
          { "name": "Analisi funnel di attivazione", "freq": "weekly", "h": 2, "role": "Data Analyst" },
          { "name": "Ottimizzazione campagne", "freq": "weekly", "h": 2, "role": "Media Buyer" },
          { "name": "Reportistica", "freq": "monthly", "h": 2, "role": "Growth Specialist" }
        ] }
    ]
  },
  {
    "service_type": "saas", "service_subtype": null, "sort": 20,
    "name": "SaaS — Presidio e retention",
    "description": "Prodotto già a regime: acquisizione presidiata, churn e retention sotto controllo.",
    "ws": [
      { "name": "Acquisizione", "type": "recurring",
        "rec": [
          { "name": "Check Ads", "freq": "weekly", "h": 1, "role": "Media Buyer" },
          { "name": "Ottimizzazione campagne", "freq": "weekly", "h": 2, "role": "Media Buyer" },
          { "name": "Analisi costo per attivazione", "freq": "monthly", "h": 2, "role": "Data Analyst" }
        ] },
      { "name": "Retention", "type": "recurring",
        "rec": [
          { "name": "Analisi churn", "freq": "monthly", "h": 3, "role": "Data Analyst" },
          { "name": "Campagne di riattivazione", "freq": "monthly", "h": 3, "role": "Automation Specialist" },
          { "name": "Check flussi automatici", "freq": "biweekly", "h": 1, "role": "Automation Specialist" }
        ] },
      { "name": "Governance", "type": "recurring",
        "rec": [
          { "name": "Reportistica", "freq": "monthly", "h": 2, "role": "Growth Specialist" },
          { "name": "Meeting periodico", "freq": "monthly", "h": 1, "role": "Project Manager" }
        ] }
    ]
  },
  {
    "service_type": "ecommerce", "service_subtype": null, "sort": 10,
    "name": "E-commerce — Avvio store e campagne",
    "description": "Store da lanciare o rilanciare: feed, tracciamento, campagne, primo ciclo di ottimizzazione.",
    "ws": [
      { "name": "Fondamenta tecniche", "type": "project",
        "ms": [
          { "name": "Catalogo e feed", "due": 12, "role": "Developer", "desc": "Il feed sbagliato blocca tutto lo shopping.",
            "tasks": [
              { "name": "Verifica catalogo e disponibilità", "due": 7, "h": 3, "role": "Developer" },
              { "name": "Configurazione feed prodotti", "due": 10, "h": 4, "role": "Developer", "prio": "alta" },
              { "name": "Approvazione feed sui canali", "due": 12, "h": 2, "role": "Media Buyer", "prio": "alta" }
            ] },
          { "name": "Tracciamento e-commerce", "due": 16, "role": "Data Analyst",
            "tasks": [
              { "name": "Eventi acquisto e valore ordine", "due": 14, "h": 4, "role": "Data Analyst", "prio": "alta" },
              { "name": "Verifica dati contro il gestionale", "due": 16, "h": 3, "role": "Data Analyst", "prio": "alta", "desc": "Se ROAS e fatturato non tornano, il resto non conta." }
            ] }
        ] },
      { "name": "Lancio commerciale", "type": "project",
        "ms": [
          { "name": "Campagne di lancio", "due": 30, "role": "Media Buyer", "vis": "client_visible",
            "tasks": [
              { "name": "Creatività di prodotto", "due": 24, "h": 6, "role": "Creative" },
              { "name": "Struttura campagne shopping e retargeting", "due": 28, "h": 5, "role": "Media Buyer" },
              { "name": "Go live", "due": 30, "h": 3, "role": "Media Buyer", "prio": "alta" }
            ] },
          { "name": "Primo ciclo CRO", "due": 45, "role": "CRO Specialist",
            "tasks": [
              { "name": "Analisi checkout e abbandoni", "due": 40, "h": 4, "role": "CRO Specialist" },
              { "name": "Interventi su scheda prodotto", "due": 45, "h": 5, "role": "UX Designer" }
            ] }
        ] },
      { "name": "Presidio continuativo", "type": "recurring",
        "rec": [
          { "name": "Check Ads", "freq": "weekly", "h": 1, "role": "Media Buyer" },
          { "name": "Check feed e disponibilità", "freq": "weekly", "h": 1, "role": "Developer" },
          { "name": "Check CRO", "freq": "weekly", "h": 1, "role": "CRO Specialist" },
          { "name": "Reportistica", "freq": "monthly", "h": 2, "role": "Growth Specialist" }
        ] }
    ]
  },
  {
    "service_type": "ecommerce", "service_subtype": null, "sort": 30,
    "name": "E-commerce — Picco stagionale",
    "description": "Black Friday, saldi, festività: preparazione, settimana calda, consuntivo.",
    "ws": [
      { "name": "Preparazione", "type": "project", "desc": "Tutto pronto prima che il traffico arrivi: dopo non si fa in tempo.",
        "ms": [
          { "name": "Piano promozionale", "due": 14, "role": "Growth Specialist", "vis": "client_visible",
            "tasks": [
              { "name": "Definizione offerte e margini", "due": 8, "h": 3, "role": "Growth Specialist", "prio": "alta" },
              { "name": "Calendario di comunicazione", "due": 11, "h": 3, "role": "Project Manager" },
              { "name": "Budget dedicato al picco", "due": 14, "h": 2, "role": "Media Buyer", "prio": "alta" }
            ] },
          { "name": "Materiali e tenuta tecnica", "due": 25, "role": "Creative",
            "tasks": [
              { "name": "Creatività e banner della campagna", "due": 20, "h": 8, "role": "Creative" },
              { "name": "Test di carico e checkout", "due": 23, "h": 3, "role": "Developer", "prio": "alta" },
              { "name": "Flussi email e carrello abbandonato", "due": 25, "h": 4, "role": "Automation Specialist" }
            ] }
        ] },
      { "name": "Settimana calda", "type": "project",
        "ms": [
          { "name": "Presidio del picco", "due": 32, "role": "Media Buyer", "desc": "Controllo quotidiano: in questi giorni un errore costa quanto un mese.",
            "tasks": [
              { "name": "Monitoraggio giornaliero spesa e ROAS", "due": 32, "h": 6, "role": "Media Buyer", "prio": "alta" },
              { "name": "Presidio disponibilità e ordini", "due": 32, "h": 4, "role": "Developer", "prio": "alta" }
            ] },
          { "name": "Consuntivo", "due": 40, "role": "Data Analyst", "vis": "client_visible",
            "tasks": [
              { "name": "Analisi risultati del picco", "due": 38, "h": 4, "role": "Data Analyst" },
              { "name": "Report e note per l'anno prossimo", "due": 40, "h": 3, "role": "Project Manager", "prio": "alta" }
            ] }
        ] }
    ]
  },
  {
    "service_type": "branding", "service_subtype": null, "sort": 10,
    "name": "Branding — Identità da zero",
    "description": "Marchio nuovo: discovery, posizionamento, identità visiva, manuale, applicazioni.",
    "ws": [
      { "name": "Discovery e strategia", "type": "project",
        "ms": [
          { "name": "Ricerca e posizionamento", "due": 21, "role": "Consultant", "vis": "client_visible",
            "tasks": [
              { "name": "Interviste e workshop con il cliente", "due": 10, "h": 6, "role": "Consultant", "prio": "alta" },
              { "name": "Analisi concorrenza e territorio", "due": 15, "h": 6, "role": "Consultant" },
              { "name": "Piattaforma di posizionamento", "due": 21, "h": 8, "role": "Consultant", "prio": "alta", "desc": "Promessa, valori, tono di voce. È il documento che regge tutto il resto." }
            ] }
        ] },
      { "name": "Identità visiva", "type": "project",
        "ms": [
          { "name": "Concept e proposte", "due": 40, "role": "Brand Designer", "vis": "client_visible",
            "tasks": [
              { "name": "Esplorazione visiva", "due": 30, "h": 10, "role": "Brand Designer" },
              { "name": "Presentazione delle proposte", "due": 35, "h": 4, "role": "Brand Designer", "prio": "alta" },
              { "name": "Revisione sulla direzione scelta", "due": 40, "h": 8, "role": "Brand Designer" }
            ] },
          { "name": "Sistema e manuale", "due": 60, "role": "Brand Designer", "vis": "client_visible",
            "tasks": [
              { "name": "Costruzione del sistema visivo", "due": 50, "h": 12, "role": "Brand Designer", "desc": "Colori, tipografia, griglie, iconografia." },
              { "name": "Manuale d'uso del marchio", "due": 57, "h": 10, "role": "Brand Designer" },
              { "name": "Consegna file e formati", "due": 60, "h": 4, "role": "Brand Designer", "prio": "alta" }
            ] }
        ] },
      { "name": "Applicazioni", "type": "project",
        "ms": [
          { "name": "Prime applicazioni", "due": 75, "role": "Creative",
            "tasks": [
              { "name": "Materiali istituzionali", "due": 70, "h": 8, "role": "Creative" },
              { "name": "Declinazione social e digitale", "due": 75, "h": 8, "role": "Creative" }
            ] }
        ] }
    ]
  },
  {
    "service_type": "branding", "service_subtype": null, "sort": 20,
    "name": "Branding — Restyling",
    "description": "Marchio esistente da attualizzare senza perdere riconoscibilità.",
    "ws": [
      { "name": "Analisi dell'esistente", "type": "project",
        "ms": [
          { "name": "Audit del marchio", "due": 14, "role": "Consultant", "vis": "client_visible",
            "tasks": [
              { "name": "Ricognizione materiali in uso", "due": 8, "h": 5, "role": "Brand Designer", "desc": "Cosa esiste davvero là fuori, non cosa dovrebbe esistere." },
              { "name": "Cosa tenere e cosa cambiare", "due": 14, "h": 5, "role": "Consultant", "prio": "alta" }
            ] }
        ] },
      { "name": "Evoluzione visiva", "type": "project",
        "ms": [
          { "name": "Nuova versione del marchio", "due": 35, "role": "Brand Designer", "vis": "client_visible",
            "tasks": [
              { "name": "Proposte di evoluzione", "due": 28, "h": 10, "role": "Brand Designer" },
              { "name": "Revisione e messa a punto", "due": 35, "h": 8, "role": "Brand Designer" }
            ] },
          { "name": "Aggiornamento del sistema", "due": 50, "role": "Brand Designer",
            "tasks": [
              { "name": "Aggiornamento manuale", "due": 45, "h": 8, "role": "Brand Designer" },
              { "name": "Piano di migrazione dei materiali", "due": 50, "h": 5, "role": "Project Manager", "prio": "alta" }
            ] }
        ] }
    ]
  },
  {
    "service_type": "social_media_management", "service_subtype": null, "sort": 10,
    "name": "Social — Avvio e piano editoriale",
    "description": "Presenza social da impostare: strategia, format, primo mese di pubblicazione.",
    "ws": [
      { "name": "Impostazione", "type": "project",
        "ms": [
          { "name": "Strategia e format", "due": 14, "role": "Social Media Manager", "vis": "client_visible",
            "tasks": [
              { "name": "Analisi pubblico e concorrenza", "due": 7, "h": 5, "role": "Social Media Manager" },
              { "name": "Definizione format ricorrenti", "due": 11, "h": 5, "role": "Creative", "desc": "Pochi format ripetibili battono tanti contenuti irripetibili." },
              { "name": "Tono di voce e linee guida", "due": 14, "h": 4, "role": "Copywriter" }
            ] },
          { "name": "Profili e primo piano editoriale", "due": 25, "role": "Social Media Manager", "vis": "client_visible",
            "tasks": [
              { "name": "Ottimizzazione profili", "due": 18, "h": 3, "role": "Social Media Manager" },
              { "name": "Piano editoriale del primo mese", "due": 22, "h": 6, "role": "Social Media Manager", "prio": "alta" },
              { "name": "Produzione contenuti del primo mese", "due": 25, "h": 12, "role": "Creative" }
            ] }
        ] },
      { "name": "Presidio continuativo", "type": "recurring",
        "rec": [
          { "name": "Piano editoriale mensile", "freq": "monthly", "h": 4, "role": "Social Media Manager" },
          { "name": "Produzione contenuti", "freq": "weekly", "h": 6, "role": "Creative" },
          { "name": "Pubblicazione e programmazione", "freq": "weekly", "h": 2, "role": "Social Media Manager" },
          { "name": "Community management", "freq": "daily", "h": 0.5, "role": "Social Media Manager" },
          { "name": "Reportistica", "freq": "monthly", "h": 2, "role": "Social Media Manager" }
        ] }
    ]
  },
  {
    "service_type": "social_media_management", "service_subtype": null, "sort": 20,
    "name": "Social — Presidio continuativo",
    "description": "Account già avviati: produzione, pubblicazione, community, report.",
    "ws": [
      { "name": "Contenuti", "type": "recurring",
        "rec": [
          { "name": "Piano editoriale mensile", "freq": "monthly", "h": 4, "role": "Social Media Manager" },
          { "name": "Produzione contenuti", "freq": "weekly", "h": 6, "role": "Creative" },
          { "name": "Revisione e approvazione cliente", "freq": "weekly", "h": 1, "role": "Project Manager" }
        ] },
      { "name": "Pubblicazione e community", "type": "recurring",
        "rec": [
          { "name": "Pubblicazione e programmazione", "freq": "weekly", "h": 2, "role": "Social Media Manager" },
          { "name": "Community management", "freq": "daily", "h": 0.5, "role": "Social Media Manager" }
        ] },
      { "name": "Governance", "type": "recurring",
        "rec": [
          { "name": "Reportistica", "freq": "monthly", "h": 2, "role": "Social Media Manager" },
          { "name": "Meeting periodico", "freq": "monthly", "h": 1, "role": "Project Manager" }
        ] }
    ]
  },
  {
    "service_type": "audit", "service_subtype": null, "sort": 10,
    "name": "Audit — Analisi completa",
    "description": "Fotografia dello stato con priorità di intervento. Lavoro chiuso, con consegna.",
    "ws": [
      { "name": "Raccolta e analisi", "type": "project",
        "ms": [
          { "name": "Accessi e perimetro", "due": 5, "role": "Project Manager",
            "tasks": [
              { "name": "Raccolta accessi", "due": 3, "h": 2, "role": "Project Manager", "prio": "alta" },
              { "name": "Definizione perimetro dell'audit", "due": 5, "h": 2, "role": "Consultant", "desc": "Cosa entra e cosa no, messo per iscritto." }
            ] },
          { "name": "Analisi", "due": 18, "role": "Data Analyst",
            "tasks": [
              { "name": "Analisi dati e performance", "due": 12, "h": 8, "role": "Data Analyst" },
              { "name": "Analisi tecnica", "due": 15, "h": 6, "role": "Developer" },
              { "name": "Analisi comunicazione e creatività", "due": 18, "h": 5, "role": "Creative" }
            ] }
        ] },
      { "name": "Consegna", "type": "project",
        "ms": [
          { "name": "Report e priorità", "due": 28, "role": "Consultant", "vis": "client_visible", "desc": "Non un elenco di problemi: una scaletta di interventi ordinata per impatto.",
            "tasks": [
              { "name": "Stesura del report", "due": 25, "h": 8, "role": "Consultant", "prio": "alta" },
              { "name": "Piano di intervento con stime", "due": 27, "h": 4, "role": "Consultant", "prio": "alta" },
              { "name": "Presentazione al cliente", "due": 28, "h": 3, "role": "Project Manager", "prio": "alta" }
            ] }
        ] }
    ]
  },
  {
    "service_type": "continuing_design", "service_subtype": null, "sort": 10,
    "name": "Design — Presidio continuativo",
    "description": "Flusso di richieste creative gestito a coda, con revisione e consegna ricorrenti.",
    "ws": [
      { "name": "Produzione", "type": "recurring",
        "rec": [
          { "name": "Triage delle richieste in coda", "freq": "weekly", "h": 1, "role": "Project Manager", "desc": "Priorità e stime prima di produrre, altrimenti vince chi urla." },
          { "name": "Produzione grafica", "freq": "weekly", "h": 8, "role": "Creative" },
          { "name": "Revisione e consegna", "freq": "weekly", "h": 2, "role": "Creative" }
        ] },
      { "name": "Coerenza di marca", "type": "recurring",
        "rec": [
          { "name": "Controllo coerenza con il manuale", "freq": "monthly", "h": 2, "role": "Brand Designer" },
          { "name": "Aggiornamento libreria asset", "freq": "monthly", "h": 2, "role": "Creative" }
        ] },
      { "name": "Governance", "type": "recurring",
        "rec": [
          { "name": "Meeting periodico", "freq": "monthly", "h": 1, "role": "Project Manager" }
        ] }
    ]
  },
  {
    "service_type": "event", "service_subtype": null, "sort": 10,
    "name": "Evento — Dal concept al post-evento",
    "description": "Un evento è una data che non si sposta: il piano lavora a ritroso da lì.",
    "ws": [
      { "name": "Concept e pianificazione", "type": "project",
        "ms": [
          { "name": "Concept approvato", "due": 14, "role": "Consultant", "vis": "client_visible",
            "tasks": [
              { "name": "Obiettivi e pubblico dell'evento", "due": 7, "h": 4, "role": "Consultant", "prio": "alta" },
              { "name": "Concept creativo e format", "due": 12, "h": 6, "role": "Creative" },
              { "name": "Budget e approvazione", "due": 14, "h": 3, "role": "Project Manager", "prio": "alta" }
            ] },
          { "name": "Logistica confermata", "due": 30, "role": "Project Manager",
            "tasks": [
              { "name": "Location e fornitori", "due": 22, "h": 6, "role": "Project Manager", "prio": "alta" },
              { "name": "Programma e relatori", "due": 27, "h": 5, "role": "Project Manager" },
              { "name": "Piano tecnico e allestimento", "due": 30, "h": 5, "role": "Project Manager" }
            ] }
        ] },
      { "name": "Comunicazione", "type": "project",
        "ms": [
          { "name": "Materiali e campagna", "due": 45, "role": "Creative", "vis": "client_visible",
            "tasks": [
              { "name": "Identità dell'evento e materiali", "due": 38, "h": 10, "role": "Creative" },
              { "name": "Pagina iscrizioni", "due": 42, "h": 5, "role": "UX Designer" },
              { "name": "Campagna di promozione", "due": 45, "h": 4, "role": "Media Buyer" }
            ] },
          { "name": "Gestione iscrizioni", "due": 58, "role": "Automation Specialist",
            "tasks": [
              { "name": "Flussi di conferma e promemoria", "due": 50, "h": 4, "role": "Automation Specialist" },
              { "name": "Monitoraggio iscrizioni e spinta finale", "due": 58, "h": 4, "role": "Growth Specialist", "prio": "alta" }
            ] }
        ] },
      { "name": "Evento e chiusura", "type": "project",
        "ms": [
          { "name": "Giorno dell'evento", "due": 60, "role": "Project Manager", "vis": "client_visible",
            "tasks": [
              { "name": "Prove e allestimento", "due": 59, "h": 6, "role": "Project Manager", "prio": "alta" },
              { "name": "Presidio in giornata", "due": 60, "h": 10, "role": "Project Manager", "prio": "alta" },
              { "name": "Documentazione foto e video", "due": 60, "h": 6, "role": "Creative" }
            ] },
          { "name": "Post-evento", "due": 75, "role": "Project Manager", "vis": "client_visible",
            "tasks": [
              { "name": "Follow-up ai partecipanti", "due": 67, "h": 3, "role": "Automation Specialist" },
              { "name": "Contenuti post-evento", "due": 70, "h": 6, "role": "Creative" },
              { "name": "Consuntivo e report", "due": 75, "h": 4, "role": "Project Manager", "prio": "alta" }
            ] }
        ] }
    ]
  },
  {
    "service_type": "ai_project", "service_subtype": null, "sort": 10,
    "name": "AI — Discovery e proof of concept",
    "description": "Prima di costruire: capire se il caso d'uso regge, con un prototipo misurabile.",
    "ws": [
      { "name": "Discovery", "type": "project",
        "ms": [
          { "name": "Caso d'uso e fattibilità", "due": 14, "role": "Business Analyst", "vis": "client_visible",
            "tasks": [
              { "name": "Interviste e mappatura del processo", "due": 7, "h": 6, "role": "Business Analyst", "prio": "alta" },
              { "name": "Valutazione dati disponibili", "due": 11, "h": 5, "role": "Data Analyst", "prio": "alta", "desc": "Senza dati usabili il caso d'uso non esiste, per quanto sia bello." },
              { "name": "Criteri di successo misurabili", "due": 14, "h": 3, "role": "Business Analyst", "prio": "alta" }
            ] }
        ] },
      { "name": "Prototipo", "type": "project",
        "ms": [
          { "name": "Proof of concept", "due": 35, "role": "AI Engineer",
            "tasks": [
              { "name": "Preparazione dataset", "due": 22, "h": 8, "role": "Data Analyst" },
              { "name": "Sviluppo del prototipo", "due": 31, "h": 20, "role": "AI Engineer" },
              { "name": "Valutazione contro i criteri", "due": 35, "h": 5, "role": "AI Engineer", "prio": "alta" }
            ] },
          { "name": "Decisione", "due": 42, "role": "Project Manager", "vis": "client_visible",
            "tasks": [
              { "name": "Demo al cliente", "due": 39, "h": 3, "role": "Project Manager", "prio": "alta" },
              { "name": "Stima di industrializzazione", "due": 42, "h": 5, "role": "AI Engineer", "prio": "alta" }
            ] }
        ] }
    ]
  },
  {
    "service_type": "ai_project", "service_subtype": null, "sort": 20,
    "name": "AI — Messa in produzione",
    "description": "Il prototipo funziona: portarlo in esercizio, con presidio e misurazione.",
    "ws": [
      { "name": "Industrializzazione", "type": "project",
        "ms": [
          { "name": "Architettura e integrazione", "due": 21, "role": "Developer",
            "tasks": [
              { "name": "Disegno dell'architettura", "due": 10, "h": 8, "role": "Developer", "prio": "alta" },
              { "name": "Integrazione con i sistemi del cliente", "due": 18, "h": 16, "role": "Developer" },
              { "name": "Gestione errori e casi limite", "due": 21, "h": 8, "role": "AI Engineer" }
            ] },
          { "name": "Collaudo e rilascio", "due": 40, "role": "Project Manager", "vis": "client_visible",
            "tasks": [
              { "name": "Collaudo con utenti reali", "due": 33, "h": 8, "role": "Business Analyst", "prio": "alta" },
              { "name": "Formazione agli utenti", "due": 37, "h": 6, "role": "Business Analyst" },
              { "name": "Rilascio in produzione", "due": 40, "h": 5, "role": "Developer", "prio": "alta" }
            ] }
        ] },
      { "name": "Esercizio", "type": "recurring",
        "rec": [
          { "name": "Monitoraggio qualità delle risposte", "freq": "weekly", "h": 2, "role": "AI Engineer" },
          { "name": "Verifica errori e log", "freq": "weekly", "h": 1, "role": "Developer" },
          { "name": "Report di utilizzo", "freq": "monthly", "h": 2, "role": "Data Analyst" }
        ] }
    ]
  },
  {
    "service_type": "digital_transformation", "service_subtype": "crm", "sort": 10,
    "name": "CRM — Implementazione",
    "description": "Dal processo commerciale al CRM in uso: configurazione, migrazione, adozione.",
    "ws": [
      { "name": "Analisi", "type": "project",
        "ms": [
          { "name": "Processo commerciale mappato", "due": 14, "role": "Business Analyst", "vis": "client_visible",
            "tasks": [
              { "name": "Interviste alla forza vendita", "due": 7, "h": 6, "role": "Business Analyst" },
              { "name": "Disegno pipeline e stati", "due": 11, "h": 5, "role": "Business Analyst", "prio": "alta" },
              { "name": "Mappatura dati da migrare", "due": 14, "h": 4, "role": "Data Analyst" }
            ] }
        ] },
      { "name": "Configurazione", "type": "project",
        "ms": [
          { "name": "CRM configurato", "due": 32, "role": "Developer",
            "tasks": [
              { "name": "Configurazione pipeline e campi", "due": 22, "h": 10, "role": "Developer" },
              { "name": "Automazioni e notifiche", "due": 28, "h": 8, "role": "Automation Specialist" },
              { "name": "Integrazioni con sito e sorgenti lead", "due": 32, "h": 8, "role": "Developer", "prio": "alta" }
            ] },
          { "name": "Migrazione dati", "due": 40, "role": "Data Analyst",
            "tasks": [
              { "name": "Pulizia e normalizzazione anagrafiche", "due": 36, "h": 8, "role": "Data Analyst", "desc": "Migrare dati sporchi significa rifare il lavoro dopo." },
              { "name": "Importazione e verifica", "due": 40, "h": 6, "role": "Data Analyst", "prio": "alta" }
            ] }
        ] },
      { "name": "Adozione", "type": "project",
        "ms": [
          { "name": "Team operativo sul CRM", "due": 55, "role": "Business Analyst", "vis": "client_visible", "desc": "Un CRM configurato ma non usato è un progetto fallito.",
            "tasks": [
              { "name": "Formazione agli utenti", "due": 48, "h": 8, "role": "Business Analyst", "prio": "alta" },
              { "name": "Affiancamento nelle prime settimane", "due": 55, "h": 10, "role": "Business Analyst" },
              { "name": "Verifica utilizzo reale", "due": 55, "h": 3, "role": "Project Manager", "prio": "alta" }
            ] }
        ] },
      { "name": "Presidio", "type": "recurring",
        "rec": [
          { "name": "Supporto agli utenti", "freq": "weekly", "h": 2, "role": "Business Analyst" },
          { "name": "Controllo qualità dati", "freq": "monthly", "h": 2, "role": "Data Analyst" }
        ] }
    ]
  },
  {
    "service_type": "digital_transformation", "service_subtype": "management_software", "sort": 10,
    "name": "Gestionale — Implementazione",
    "description": "Sostituzione o introduzione di un gestionale: analisi, configurazione, migrazione, avvio.",
    "ws": [
      { "name": "Analisi dei processi", "type": "project",
        "ms": [
          { "name": "Processi mappati", "due": 18, "role": "Business Analyst", "vis": "client_visible",
            "tasks": [
              { "name": "Interviste ai reparti", "due": 10, "h": 10, "role": "Business Analyst" },
              { "name": "Mappatura processi attuali", "due": 14, "h": 8, "role": "Business Analyst" },
              { "name": "Requisiti e priorità", "due": 18, "h": 6, "role": "Business Analyst", "prio": "alta" }
            ] }
        ] },
      { "name": "Configurazione", "type": "project",
        "ms": [
          { "name": "Sistema configurato", "due": 45, "role": "Developer",
            "tasks": [
              { "name": "Configurazione moduli", "due": 32, "h": 20, "role": "Developer" },
              { "name": "Ruoli e permessi", "due": 38, "h": 6, "role": "Developer", "prio": "alta" },
              { "name": "Integrazioni con i sistemi esistenti", "due": 45, "h": 14, "role": "Developer" }
            ] },
          { "name": "Migrazione", "due": 58, "role": "Data Analyst",
            "tasks": [
              { "name": "Estrazione e bonifica dati", "due": 52, "h": 12, "role": "Data Analyst" },
              { "name": "Migrazione di prova", "due": 55, "h": 6, "role": "Data Analyst", "prio": "alta" },
              { "name": "Migrazione definitiva", "due": 58, "h": 6, "role": "Data Analyst", "prio": "alta" }
            ] }
        ] },
      { "name": "Avvio", "type": "project",
        "ms": [
          { "name": "Go live", "due": 70, "role": "Project Manager", "vis": "client_visible",
            "tasks": [
              { "name": "Formazione per reparto", "due": 64, "h": 12, "role": "Business Analyst", "prio": "alta" },
              { "name": "Periodo di doppio binario", "due": 68, "h": 10, "role": "Business Analyst", "desc": "Vecchio e nuovo in parallelo finché i numeri non coincidono." },
              { "name": "Passaggio definitivo", "due": 70, "h": 6, "role": "Project Manager", "prio": "alta" }
            ] }
        ] },
      { "name": "Presidio", "type": "recurring",
        "rec": [
          { "name": "Supporto agli utenti", "freq": "weekly", "h": 3, "role": "Business Analyst" },
          { "name": "Verifica errori e log", "freq": "weekly", "h": 1, "role": "Developer" },
          { "name": "Meeting periodico", "freq": "monthly", "h": 1, "role": "Project Manager" }
        ] }
    ]
  },
  {
    "service_type": "digital_transformation", "service_subtype": "custom_application", "sort": 10,
    "name": "Applicativo su misura — Discovery e rilascio",
    "description": "Software costruito da zero: discovery, sviluppo a iterazioni, collaudo, rilascio.",
    "ws": [
      { "name": "Discovery", "type": "project",
        "ms": [
          { "name": "Perimetro e requisiti", "due": 21, "role": "Business Analyst", "vis": "client_visible",
            "tasks": [
              { "name": "Workshop di raccolta requisiti", "due": 10, "h": 10, "role": "Business Analyst", "prio": "alta" },
              { "name": "Flussi utente e casi d'uso", "due": 16, "h": 8, "role": "UX Designer" },
              { "name": "Perimetro della prima versione", "due": 21, "h": 5, "role": "Project Manager", "prio": "alta", "desc": "Cosa NON entra nella prima versione, messo per iscritto." }
            ] },
          { "name": "Prototipo navigabile", "due": 35, "role": "UX Designer", "vis": "client_visible",
            "tasks": [
              { "name": "Wireframe delle schermate principali", "due": 28, "h": 12, "role": "UX Designer" },
              { "name": "Prototipo e validazione col cliente", "due": 35, "h": 10, "role": "UX Designer", "prio": "alta" }
            ] }
        ] },
      { "name": "Sviluppo", "type": "project",
        "ms": [
          { "name": "Prima iterazione utilizzabile", "due": 60, "role": "Developer",
            "tasks": [
              { "name": "Impianto tecnico e ambienti", "due": 42, "h": 12, "role": "Developer", "prio": "alta" },
              { "name": "Sviluppo funzionalità principali", "due": 56, "h": 40, "role": "Developer" },
              { "name": "Revisione interna", "due": 60, "h": 6, "role": "Developer" }
            ] },
          { "name": "Versione completa", "due": 85, "role": "Developer",
            "tasks": [
              { "name": "Funzionalità secondarie", "due": 76, "h": 30, "role": "Developer" },
              { "name": "Rifiniture di interfaccia", "due": 82, "h": 10, "role": "UX Designer" },
              { "name": "Correzione difetti", "due": 85, "h": 12, "role": "Developer" }
            ] }
        ] },
      { "name": "Rilascio", "type": "project",
        "ms": [
          { "name": "Collaudo e messa in linea", "due": 100, "role": "Project Manager", "vis": "client_visible",
            "tasks": [
              { "name": "Collaudo con il cliente", "due": 92, "h": 10, "role": "Business Analyst", "prio": "alta" },
              { "name": "Formazione e documentazione", "due": 96, "h": 8, "role": "Business Analyst" },
              { "name": "Rilascio in produzione", "due": 100, "h": 6, "role": "Developer", "prio": "alta" }
            ] }
        ] },
      { "name": "Manutenzione", "type": "recurring",
        "rec": [
          { "name": "Check IT/bug", "freq": "weekly", "h": 2, "role": "Developer" },
          { "name": "Verifica errori e log", "freq": "weekly", "h": 1, "role": "Developer" },
          { "name": "Aggiornamenti e sicurezza", "freq": "monthly", "h": 3, "role": "Developer" }
        ] }
    ]
  }
]
$json$;
  t JSONB; w JSONB; m JSONB; x JSONB;
  v_tpl UUID; v_ws UUID; v_ms UUID;
  wi INT; mi INT; xi INT;
  n_tpl INT := 0;
BEGIN
  FOR t IN SELECT * FROM jsonb_array_elements(spec) LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.project_templates p
      WHERE p.service_type = t->>'service_type'
        AND p.service_subtype IS NOT DISTINCT FROM (t->>'service_subtype')
        AND p.name = t->>'name'
    );

    INSERT INTO public.project_templates (service_type, service_subtype, name, description, sort_order)
    VALUES (t->>'service_type', t->>'service_subtype', t->>'name', t->>'description', COALESCE((t->>'sort')::int, 100))
    RETURNING id INTO v_tpl;
    n_tpl := n_tpl + 1;

    wi := 0;
    FOR w IN SELECT * FROM jsonb_array_elements(t->'ws') LOOP
      INSERT INTO public.project_template_nodes
        (template_id, parent_id, node_type, name, description, workstream_type, visibility, sort_order)
      VALUES (v_tpl, NULL, 'workstream', w->>'name', w->>'desc',
              COALESCE(w->>'type', 'project'), 'internal', wi)
      RETURNING id INTO v_ws;

      -- ricorrenti appese al workstream
      xi := 0;
      FOR x IN SELECT * FROM jsonb_array_elements(COALESCE(w->'rec', '[]'::jsonb)) LOOP
        INSERT INTO public.project_template_nodes
          (template_id, parent_id, node_type, name, description, frequency,
           suggested_owner_role, priority, estimated_hours, visibility, sort_order)
        VALUES (v_tpl, v_ws, 'recurring_task', x->>'name', x->>'desc',
                COALESCE(x->>'freq', 'weekly'), x->>'role',
                COALESCE(x->>'prio', 'media'), (x->>'h')::numeric, 'internal', xi);
        xi := xi + 10;
      END LOOP;

      mi := 0;
      FOR m IN SELECT * FROM jsonb_array_elements(COALESCE(w->'ms', '[]'::jsonb)) LOOP
        INSERT INTO public.project_template_nodes
          (template_id, parent_id, node_type, name, description, milestone_type,
           suggested_owner_role, relative_due_days, visibility, sort_order)
        VALUES (v_tpl, v_ws, 'milestone', m->>'name', m->>'desc',
                COALESCE(m->>'type', 'delivery'), m->>'role', (m->>'due')::int,
                COALESCE(m->>'vis', 'internal'), mi)
        RETURNING id INTO v_ms;

        xi := 0;
        FOR x IN SELECT * FROM jsonb_array_elements(COALESCE(m->'tasks', '[]'::jsonb)) LOOP
          INSERT INTO public.project_template_nodes
            (template_id, parent_id, node_type, name, description, suggested_owner_role,
             relative_due_days, priority, estimated_hours, visibility, sort_order)
          VALUES (v_tpl, v_ms, 'task', x->>'name', x->>'desc', x->>'role',
                  (x->>'due')::int, COALESCE(x->>'prio', 'media'),
                  (x->>'h')::numeric, COALESCE(x->>'vis', 'internal'), xi);
          xi := xi + 10;
        END LOOP;

        mi := mi + 10;
      END LOOP;

      wi := wi + 10;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Template inseriti: %', n_tpl;
END $seed$;

-- Controllo: quanti template e quanti nodi per servizio
SELECT p.service_type,
       COALESCE(p.service_subtype, '—') AS subtype,
       count(DISTINCT p.id)             AS template,
       count(n.id)                      AS nodi
FROM public.project_templates p
LEFT JOIN public.project_template_nodes n ON n.template_id = p.id
GROUP BY 1, 2
ORDER BY 1, 2;

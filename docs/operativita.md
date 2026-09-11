# Workspace, workload, ferie, task completate, widget

## Progetti: la propria roba si tocca sempre (§322)

Dal calendario milestone si clicca una tappa e si arriva sulla pagina del
workstream, dove `canEdit` era **uno**: admin o manager del progetto. Per tutti
gli altri scadenza, stato e responsabile erano disabilitati **anche sulle
proprie** — e in «Le mie attività» le stesse task si modificano da sempre,
quindi la stessa persona trovava due risposte alla stessa domanda a seconda
della pagina da cui ci arrivava.

- **Due diritti, non uno.** `canEdit` (governo: struttura, titoli, creazione,
  eliminazione) resta ad admin e manager del progetto; chi ha la **milestone in
  carico** (`owner_id`) ne cambia scadenza, stato e responsabile, chi ha la
  **task assegnata** (`assignee_id`, il primario) ne cambia spunta,
  assegnatario e — nel drawer — data e descrizione. Eliminare non è modificare:
  `canManage` e `canDelete` restano di chi governa, e il drawer li distingue
  perché lo monta anche «Le mie attività», dove valgono insieme.
- **Il server non è cambiato**: `requireStaff` in
  `app/actions/{tasks,milestones}.ts` ammette già tutto lo staff interno. Era
  una barriera solo nella UI, che è il posto in cui una barriera non protegge
  niente (§211) e blocca il lavoro vero.

## Nel calendario milestone stanno i clienti da presidiare (§328)

`/progetti` apre con una riga per cliente — anche senza progetti, perché chi è
fermo si vede solo se la sua riga c'è — e ci finiva **tutta l'anagrafica** meno
i persi: i sospesi con «0 progetti» in rosso, i lead, e GAV Sistemi, che non è
un cliente ma un giro di fatture fra società collegate (§326) e non avrà mai un
progetto. Una riga rossa che nessuno può spegnere insegna a ignorare le altre.

- **`countsInDelivery` in `lib/clients.ts`**, non `countsInStats`: quella
  risponde ai **numeri**, questa alle **consegne**, e le risposte divergono.
  Metroquadro e Costruisci e arreda non contano nell'MRR ma hanno milestone
  vere: dentro. Il **giro** ha solo fatture: fuori. Fuori anche perso (nessun
  presidio), sospeso (lo si segue dalla sua sezione, con i giorni da quanto è
  fermo) e lead (niente da consegnare ancora).
- **Il filtro sta nel componente**, `ProgettiClient`, e le due pagine passano
  i campi grezzi: il flag `lost` calcolato inline in due `page.tsx` era la stessa
  regola scritta due volte, ed era già indietro di tre stati.
- **Il workspace passa solo la label.** Là le aree non esistono (§326) e la VIEW
  `clients_workspace` non espone `internal_kind`: passare `is_internal` da solo
  farebbe passare un lavoro interno per un giro e cancellerebbe Metroquadro dal
  calendario del team. GAV sta fuori già dalla VIEW, via `workspace_hidden`
  (§213).

## La milestone si aggiunge dalla pagina progetto (§322)

Il wizard mette le milestone del template e poi non ci si rientra: l'unico posto
per aggiungerne una era la pagina del singolo workstream, che dal progetto si
raggiunge solo aprendola. Ora ogni riga della scheda Workstream porta il
conteggio e un tasto «Milestone» — la stessa `NewMilestoneModal` del workstream,
così la convention del titolo `M{n}` la scrive un posto solo — il calendario ha
un «+» per corsia, e lo stato vuoto («nessuna milestone datata») offre il gesto
invece di descriverlo. La riga della lista è diventata un `div` col click sul
figlio: due `<button>` annidati non sono HTML valido.

**E «Operatività continua» non è una scelta di chi guarda** (§322). La milestone
di sistema nasce dal trigger `tbv2_ensure_system_milestone` su **ogni**
workstream (migration 147), quindi il riquadro verde compariva sempre — anche su
una workstream a termine, anche vuoto, senza modo di toglierlo. Resta aperto
dove ha senso (workstream continuativa, o c'è già dentro qualcosa: task o
ricorrenti); altrove è un invito richiudibile. La milestone **non si cancella**:
regge le task senza consegna, dato che `tasks.milestone_id` è NOT NULL.

## Task ad hoc: il cliente può anche non esserci (§321)

`TaskComposer` chiedeva un cliente e basta, e le due cose che mancavano erano
opposte: un cliente **che non esiste ancora** e **nessun cliente affatto**.

- **«Nessun cliente» è la prima voce dell'elenco**, non un campo lasciato vuoto:
  una ricerca, una sistemata al sito, un adempimento sono lavoro nostro e non
  sono di nessuno. Nel composer è una sentinella (`NO_CLIENT`), non la stringa
  vuota, perché «ho scelto di non averlo» e «non ho ancora scelto» sono due
  stati diversi e col vuoto per tutti e due il pulsante Crea resta spento su una
  scelta che è stata fatta. `tasks.client_id` è nullable dalla 155 e la RLS della
  094 fa il resto: una task senza progetto la vedono solo admin e assegnatario.
  **Su una task «al cliente» la voce non c'è**: senza cliente non avrebbe un
  portale dove comparire.
- **Un nome che in anagrafica non c'è si scrive lo stesso**, e le risposte sono
  due — «aggiungi in anagrafica» e «segna come lead» (§321). Sono entrambe una
  riga in anagrafica: cambia `client_label`, e con quello il peso della riga.
  Un campo di testo libero sulla task sarebbe stato un riferimento sospeso.
- **La proposta non compare se il nome è già in elenco**: offrire «aggiungi
  Affinity» mentre Affinity è tre righe sotto è il modo di creare un doppione
  senza accorgersene. E non compare a chi non può aprire un'anagrafica (§317):
  un pulsante che rimbalza è peggio di un pulsante assente (§211). La porta vera
  resta `requireClientCreator()` dentro l'azione.
- **Si passa da `createClientRecord`**, non da una seconda insert: stesso guard,
  stessa cronologia, stessi default della `NewClientModal` (`mrr: 0`, avvio a
  oggi, pagamento in attesa — li riscrive il primo contratto venduto, §169).
- Nell'elenco delle ad hoc «nessun cliente» **si scrive**, non è un trattino: un
  trattino si legge come un'anagrafica che manca e manda a cercarla. C'è anche
  il suo filtro.

## Workload (`/workload` e `/workspace/workload`)
Vista strategica dei progetti in parallelo: effort (ore stimate, default 4h dove
manca), timeline, carico per risorsa. Stessa `WorkloadClient` per admin e workspace.
`lib/workload.ts` = calcoli puri (l'effort di una task multi-assegnata si **divide**
fra gli assegnatari). Filtri: tipo/cliente/risorsa/periodo. Editing (stato,
riassegnazione, elimina) riservato al **PM** (`projects.manager_id`), al `manager`
di ruolo o all'admin, via `app/actions/workload-tasks.ts` (service role). Nessun
dato economico: è sicuro anche nel workspace.

## Task completate (§283, `components/tasks/CompletedTasks.tsx`, migration 211)
Spuntare «fatta» le faceva sparire e non c'era modo di tornare indietro: nel
workspace la query stessa le escludeva (`neq('status','completato')`), negli
elenchi ad hoc il filtro di partenza è «aperte». Una spunta per sbaglio — la
casella è grande quanto il dito — voleva dire riscrivere la task da capo, con
descrizione, assegnatario e scadenza persi.

- **Una sezione loro, chiusa e contata**, in fondo ai tre elenchi (ad hoc admin,
  ad hoc del cliente, «Le mie attività»): la data in cui è stata completata, il
  gesto per riaprirla, e in testa quanto le resta da vivere. Sotto la settimana
  il countdown si scrive sulla riga: è l'unico momento in cui uno vorrebbe
  riaprirla prima che se ne vada.
- **Dopo 60 giorni si cancellano da sole** (`purge_completed_tasks`, cron alle
  3:20). Un elenco di completate che cresce all'infinito è un elenco che nessuno
  apre più, e allora tanto valeva cancellarle subito.
- **La data la garantisce un trigger**, non le azioni: `updateTaskStatus` la
  scriveva, `setAdHocTaskStatus` e `updateAdHocTask` no — due percorsi su tre
  l'avevano dimenticata, e senza quella data la retention non ha da dove
  contare. Le azioni la scrivono lo stesso, perché finché la 211 non è eseguita
  il trigger non c'è; il trigger copre i percorsi che non passano da lì (import
  Asana, UPDATE a mano).
- **Riaprire azzera**: da quel momento è una task viva come le altre, e i
  sessanta giorni ripartono solo se la si richiude.


## Ferie e assenze (§223, `lib/leave-calendar.ts`)
Le assenze vivono in **due tabelle che non si parlano**: `hr_requests` è quello
che la persona chiede dal Workspace (stati in inglese, e comprende tipi che
assenze non sono — una nota spesa, un documento), `team_leaves` è il registro che
l'admin tiene a mano (stati in italiano). Approvare una richiesta scrive in
`calendar_events`, **non** in `team_leaves`: sono indipendenti. `normalize()` le
fa diventare una lista sola, perché «chi manca il 12 agosto?» non può avere due
risposte a seconda di quale tabella si guarda.

Cosa resta fuori **si dichiara**, non si filtra in silenzio: `spesa` e
`documento_hr` (hanno una data, ma nessuno manca dall'ufficio), le righe senza
date, e gli **intervalli rovesciati** — sul database ce n'è uno vero, dal 24
agosto al 31 luglio. Non si aggiusta scambiando le date: non si sa quale delle
due sia giusta, quindi si scarta e si conta, e la pagina lo scrive.

- **L'avviso a dieci giorni** (`upcoming`) è la finestra in cui una consegna si
  può ancora spostare. Include **chi è già via**, con i giorni negativi: la
  domanda vera non è «chi parte» ma «su chi non posso contare», e una persona
  partita ieri non c'è esattamente come una che parte domani.
- **Nel calendario il colore dice il tipo e il tratteggio dice lo stato**: due
  informazioni su due canali, così una ferie da approvare non si confonde con un
  permesso approvato. I giorni degli altri mesi ci sono: un'assenza che comincia
  il 31 e finisce il 3 si legge solo se si vedono le due estremità.
- **Il countdown del workspace** (`countdown`) guarda **solo le ferie
  approvate**: metterlo su una richiesta che può essere rifiutata è il modo più
  veloce di far arrabbiare qualcuno. Sparisce quando non c'è niente da contare —
  un riquadro che dice «nessuna ferie» è una presa in giro — e il conteggio si fa
  **sul server**, perché nel browser darebbe giorni diversi a seconda del fuso.

Gate: `npx tsx lib/leave-calendar.check.ts` (42 controlli sulle righe vere).


### Il workspace è usabile o non è (§211)
Tre difetti che rendevano il portale un vicolo cieco, e le regole che li chiudono:

- **Le sezioni personali non passano dai permessi.** La 079 ha seminato
  `workspace_section_permissions` per manager, senior, junior, stage e freelance:
  `partner` è arrivato dopo, `viewer` non c'è mai stato, e chi non era in quella
  lista entrava e trovava **una voce sola**. Dashboard, attività, profilo,
  richieste HR, calendario, buste paga, documenti personali, cronologia e
  feedback ora sono universali: mostrano **solo i dati di chi guarda**, e a
  garantirlo è la RLS — owner-only in tabella — non il menu. Nascondere la voce
  non proteggeva niente, rendeva solo il portale inutilizzabile. Restano ai
  permessi le sezioni che parlano di **altri**: clienti, progetti, customer care,
  ticket, documenti condivisi, task ad hoc.
- **Un link che rimbalza è peggio di un link assente.** Dal workspace ogni rotta
  admin la respinge il middleware: le rotte si costruiscono da una `base` sola
  (`ClientiList`, `ClientPageClient.portalBase`, `basePath`/`clientBase`), mai
  scritte a mano riga per riga. Le due sezioni in fondo alla lista clienti —
  sospesi e persi — se l'erano dimenticata, e un cliente sospeso che non si apre
  è esattamente la voce che serve di più a chi deve richiamarlo.
- **Niente economics, e non per convenzione.** Tre strati indipendenti:
  `clients_workspace` azzera canone e dati fiscali **in tabella** (100/197);
  `hideEconomics` spegne MRR, pagamenti, anagrafica fiscale, export ed elimina;
  la scheda Economics del progetto e del cliente **non viene montata**. In più
  quello che nessun riquadro mostra non parte nemmeno: stato pagamenti e date di
  contratto si azzerano prima di finire nel payload, perché una cosa nascosta
  nella UI si legge lo stesso dal pannello di rete. Le pagine del workspace
  leggono `clients_workspace`, **mai** `clients`, anche quando servono i soli
  nomi — è la sorgente che la RLS garantisce a tutto lo staff.


## Stato attuale — widget dashboard
| Widget | Componente | Stato |
|---|---|---|
| Company Pulse | `CompanyPulse` + `KpiCards` + `RevenueChart` | ✅ attivo, ~50% doc |
| Client Health | `ClientsRiskPanel` | ✅ attivo, semplificato |
| Delivery Radar | `ProgettiWidget` + `TasksDue` | ✅ attivo, parziale |
| Team Capacity | `WorkloadPanel` | ✅ attivo, base |
| Risk/Alerts | `SmartInsights` + `AlertCenter` | ✅ attivo, rule-based |
| Founder Focus | `DailyFocus` | ✅ attivo |
| AI Chat | `AIDashboardChat` | ✅ attivo |
| Margin Radar | — | ❌ da costruire |
| Decision Center | — | ❌ da costruire |
| AI Executive Brief | `SmartInsights` (approssimazione) | ⚠️ parziale |
| Financial Control aggregato | — | ❌ solo in tab cliente |
| Growth Performance aggregato | — | ❌ solo in tab cliente |
| Sales Pipeline widget | Fetcha `deals` ma no widget | ⚠️ dati ci sono |
| Strategic Objectives widget | Fetcha `objectives` ma no widget | ⚠️ dati ci sono |
| AI & Automation Center | — | ❌ da costruire |



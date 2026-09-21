# Workspace, workload, ferie, task completate, widget

## Anagrafica cliente per i manager

La scheda **Anagrafica** è visibile anche ai manager (`canSeeClientAnagrafica`):
dati operativi, referenti, stakeholder e team. Nel workspace continua a leggere
`clients_workspace`: dati fiscali, ragione sociale, note amministrative,
commerciale e area contabile non vengono mostrati come campi vuoti o dedotti.
La modifica dell'azienda, degli stakeholder e del team resta riservata agli
admin; i permessi già esistenti sui contatti non cambiano. Nessuna migration.
Gate: matrice dei ruoli in `lib/clients.check.ts`.

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

## Manager vuol dire manager (§339)

Il governo di un progetto — struttura, titoli, creazione, eliminazione — era una
riga scritta a mano in due pagine: `role === 'admin' || (app_role === 'manager'
&& (project.manager_id === userId || isMemberManager))`. Nessun manager ci
passava, e la ragione non era il ruolo ma il **dato**: Sabrina Nastro è
`app_role = manager` e membro di sei progetti, e su tutti e sei
`role_in_project` è **nullo**. La condizione leggeva quella colonna, quindi era
falsa ovunque.

Un permesso che dipende da una colonna che nessuno compila è un permesso che non
esiste, e si scopre solo quando qualcuno prova a spostare la data di una
milestone e trova tutto spento. Il perimetro per progetto era una finzione: nel
codice sì, nei dati no.

- **`canGovernProjects` in `lib/permissions.ts`**, una volta sola: admin,
  founder, super admin e **manager**, su qualunque progetto. Stesso insieme di
  chi può aprire un cliente (§317), e il gate lo verifica.
- **Il server non è cambiato**, come già diceva §322: `requireStaff` in
  `app/actions/{tasks,milestones}.ts` ammette tutto lo staff interno. Era una
  barriera solo nella UI, cioè nel posto in cui una barriera non protegge niente
  (§211) e blocca il lavoro vero.
- **Governare non è il portale**: un manager governa i progetti e resta
  confinato al workspace (`coarseRole('manager') === 'team'`, §234). Due domande
  diverse, e vanno tenute diverse.
- **La propria roba resta di chi ce l'ha** (§322): milestone in carico e task
  assegnate si toccano sempre, anche senza governo. Questa regola aggiunge, non
  sostituisce.

Gate: `npx tsx lib/permissions.check.ts`.

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

## La scheda progetto si apre sulle lavorazioni (§342)

Il progetto si apriva sulla **Panoramica** e, dentro il tab Workstream, la prima
cosa a schermo era il **calendario**. Due volte lo stesso difetto: un riassunto
prima di sapere di cosa, e delle date prima di sapere a cosa appartengono. Chi
apre un progetto si sta chiedendo «a che punto sono le lavorazioni», non «quante
ne ho in tutto» — e su un progetto con una workstream sola erano due schermate
di bandierine prima del contenuto.

- **Workstream è il primo tab e quello di default**; la Panoramica viene dopo ed
  è il posto giusto per le statistiche d'insieme, che restano dove sono.
- **Dentro il tab, il calendario sta sotto l'elenco**: prima *cosa* c'è da fare
  — le corsie, con avanzamento, prossima tappa e task aperte — poi *quando*
  cade. I segnali (in ritardo, ≤7 giorni, non assegnate, avanzamento) restano in
  cima, perché filtrano l'elenco che viene subito dopo.
- `?tab=panoramica` diventa una scelta esplicita che le due pagine accettano: il
  default è cambiato, e un link che voleva il riassunto deve poterlo chiedere.

## Il calendario si scorre e si apre (§345)

Il calendario milestone mostrava date che non portavano da nessuna parte e una
griglia più larga dello schermo senza un modo visibile di muovercisi.

- **Una barra di navigazione orizzontale sotto la griglia**, dove il browser
  mette la sua. La barra nativa è nascosta (`scroll-x-touch`, per non mostrarne
  una diversa su ogni sistema) e l'unico modo di scorrere era la rotellina
  orizzontale: chi ha un mouse a una rotella, o un trackpad che quel gesto lo
  usa per tornare indietro nella cronologia, restava fermo al giorno in cui il
  calendario si apre **senza sapere che oltre il bordo c'è dell'altro**. Il
  cursore dice quanta parte del totale si sta guardando, le frecce spostano di
  una schermata, la pista si clicca per saltare, e da tastiera rispondono ←/→ e
  Home/Fine. Compare **solo quando c'è qualcosa oltre il bordo**: una barra
  sempre piena direbbe «scorri» dove non c'è niente da scorrere.
  - **La posizione del cursore non passa dallo stato React.** Tenerla lì voleva
    dire ridisegnare tutto il calendario — ogni corsia, ogni bandierina, i due
    portali — a ogni tacca di rotellina e a ogni frame di trascinamento: la
    barra arrancava dietro al dito. Nello stato resta la sola **geometria**
    (zoom, corsie, larghezza della finestra, con un `ResizeObserver` che scrive
    solo se le misure sono cambiate davvero); dove sta il cursore lo scrive una
    funzione sul nodo, una volta per frame.
  - **La matematica sta in `lib/gantt-scroll.ts`, sotto test**
    (`npx tsx lib/gantt-scroll.check.ts`), perché è la parte che si sbaglia in
    silenzio: un cursore che si stacca dal dito non solleva nessun errore, si
    vede solo trascinandolo — cioè non si vede. La regola che la prima versione
    aveva sbagliato: il moltiplicatore del trascinamento è **corsa del
    calendario / corsa del cursore**, e la corsa del cursore è `pista − cursore`,
    non la pista. Finché il cursore resta proporzionale le due forme coincidono;
    sotto la larghezza minima di 28px divergono, e il calendario scorre più in
    fretta della mano.
  - Cursore e pista hanno `touch-action: none`: da telefono trascinare la barra
    trascinava anche la pagina.
- **Il calendario non torna su oggi da solo.** Scorrendo verso le tappe lontane
  bastava passare col mouse su una bandierina e la vista saltava indietro alla
  posizione di partenza: le milestone passate e future erano di fatto
  irraggiungibili. La catena, tutta dentro `ProjectGantt`: `workstreams = []` e
  `milestones = []` come **prop di default** creano un array nuovo a ogni
  render, l'array nuovo invalida il `useMemo` delle corsie, che invalida quello
  del modello, e l'effetto legato al modello riportava lo scorrimento su oggi.
  Un `setState` qualunque — il recap in hover, la tendina di un cliente —
  bastava a farla ripartire.
  - Gli array di default sono due **costanti di modulo**: la catena si spezza
    all'origine, e il calendario smette di ricalcolare corsie e modello a ogni
    ridisegno.
  - Su oggi ci si apre **una volta sola** (`avviato`). Per tornarci c'è il
    pulsante «Oggi», che è una richiesta — non un ripensamento del calendario.
  - **Cambiare scala non è spostarsi**: il giorno al centro resta al centro
    (`centerDay`/`scrollForCenterDay`, sotto test). Prima ogni passaggio fra
    giorni, settimane e mesi riportava a oggi, e la scala si cambia proprio per
    guardare lontano da oggi.
  - Gate: `lib/gantt-lanes.check.ts` controlla la **causa** nel sorgente — le
    prop di default e la guardia sull'avvio — come `actions-guard.check.ts` fa
    con le porte: un difetto che chiede un ridisegno e un puntatore non si
    riproduce senza browser, ma la sua origine nel codice si vede.
- **La corsia è la porta della corsia** (`GanttLane.href`, `laneHref`). In
  `/progetti` la riga cliente apre la scheda del cliente e la riga progetto apre
  il progetto; nella scheda progetto la corsia apre la workstream — la stessa
  destinazione della riga dell'elenco qui sopra. Prima il nome era un'etichetta:
  si leggeva «iCura» accanto alle sue scadenze e per aprirlo bisognava tornare
  indietro e ricercarlo in un elenco.
  - **Il bersaglio è tutta la riga, non il nome.** Il primo tentativo metteva il
    link sul solo nome: su un nome corto sono quaranta pixel su una riga di
    duecentosessanta, e la risposta è stata «non è cliccabile» — che era vero
    nei fatti anche se il link c'era. Le due specie di riga rispondono a due
    gesti diversi, perché è quello che ci si aspetta da loro: la riga **con
    tendina** (il cliente) si apre e si chiude col clic, e la scheda si apre dal
    nome; la riga **senza tendina** (progetto, workstream) *è* il link — il nome
    si allarga su tutta la riga con uno strato invisibile (`after:inset-0`), che
    a differenza di un `onClick` lascia funzionare tasto centrale e «apri in una
    nuova scheda». Chevron, chip e «+» stanno sopra lo strato (`z-10`), o si
    vedrebbero e aprirebbero un'altra pagina.
  - Gate: `npx tsx lib/gantt-lanes.check.ts` rende il componente fuori dal
    browser e guarda il markup che esce. «Non è cliccabile» è un difetto che il
    compilatore non vede e che dal codice si legge come funzionante.
  - **Dal workspace si resta nel workspace** (§234): la riga cliente porta a
    `/workspace/clienti/<id>`, che il middleware non rimbalza. «Progetti
    interni» non ha un link — è un raggruppamento, non un'anagrafica, e un link
    che non porta da nessuna parte è peggio di un link assente (§211).
- **Il recap in hover si usa, non si legge soltanto.** Dentro ci stanno tre
  cose — milestone, progetto, workstream — e sono tre posti dove andare: il
  titolo apre la milestone (`milestoneHref`), la riga del contesto apre il
  progetto o la workstream (`contextHref`). Prima il riquadro era
  `pointer-events-none`: mostrava la strada e non la faceva percorrere. Perché
  sia raggiungibile col puntatore la chiusura è **ritardata di 160ms**, o
  sparirebbe nel varco di 8px fra la bandierina e il riquadro.

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

## Le ricorrenze: una regola, e un motore che gira davvero (§337)

**Il motore non è mai partito.** `recurring_task_templates` esiste dalla 147 e
`generate_recurring_task_occurrences()` dalla 152, schedulata via `pg_cron`
dentro un `EXCEPTION WHEN undefined_function`. L'estensione su questo database
non c'è: la migration è passata, non l'ha più detto, e la misura prima della
riparazione era **185 template attivi, zero occorrenze, `last_generated_at` NULL
su tutti**. Una schedulazione che fallisce in silenzio è peggio di una che non
c'è — quella almeno si nota.

- **La regola sta in `lib/recurrence.ts`**, pura e con un gate, e non in SQL: le
  serviva anche alla pagina — «la prossima è il 22» prima di salvare, e sul
  calendario solo la tappa più vicina — e una seconda implementazione della
  stessa regola dà la stessa risposta finché qualcuno non ne corregge una.
  `matches`/`occurrencesBetween`/`nextOccurrence` contano in **UTC**: «ogni
  lunedì» calcolato con l'ora locale cade di domenica per mezza Europa una volta
  l'anno, e si scopre dal calendario di qualcun altro.
- **Le settimane si contano dalla prima occorrenza**, non dalla data di
  partenza: una quindicinale creata mercoledì 2 per i lunedì deve partire dal 7
  e non dal 14, e contando i giorni trascorsi ne saltava una su due.
- **Il 31 non si sposta al 28.** Una mensile sul 31 salta i mesi che non ce
  l'hanno: spostarla farebbe comparire una chiusura tre giorni prima senza che
  nessuno l'abbia chiesto, e chi la riceve non ha modo di sapere perché.
- **Materializza `lib/recurrence-run.ts`**, idempotente **leggendo**: prima
  guarda cosa c'è, poi scrive quello che manca — come l'import dell'estratto
  conto (§210) — e l'indice unico resta l'ultima difesa, non la prima.
- **Due strade, un motore**: il cron (`/api/recurrences/run`, task pianificato
  di Coolify col suo segreto, come il QA del tracking §316) e la **generazione
  immediata** dentro l'azione. Una ricorrente si scrive per darla a qualcuno, e
  finché la prima occorrenza non esiste chi la riceve non ha niente da vedere:
  «l'ho assegnata» e «non mi è arrivato niente» sono la stessa sera. La
  generazione immediata non fa fallire l'azione — se inciampa ci ripensa il
  cron, mentre perdere il template sarebbe il danno peggiore.
- **`task_assignees` si scrive** (CLAUDE.md): il trigger sincronizza nell'altro
  verso, quindi il motore che scrive solo `tasks.assignee_id` lascia il ponte
  vuoto. Oggi i tre lettori di «le mie attività» guardano tutti e due, ma il
  giorno in cui una vista nuova legge solo il ponte la ricorrente di qualcuno
  sparisce dalla sua lista senza che nessuno tocchi niente.
- **Trenta giorni, non tre.** Tre erano la difesa del doc 08 contro la
  proliferazione, e con la generazione ferma il problema non si è mai
  presentato; ma tre giorni vogliono dire che una ricorrente si vede solo quando
  è già da fare, e «le mie attività» smette di servire a organizzarsi la
  settimana. Resta per template: chi produce troppo si abbassa da solo.

**§388–§390 — i periodi di un progetto.** Alcuni servizi hanno un ritmo, e
il ritmo non è lo stesso per tutti: `service_catalog.period_shape` dice
`quarter` (Lead Generation, E-commerce, SaaS), `month` (Social Media
Management, Continuing Design) o `none` (tutto il resto). Sta nel catalogo e
non in uno `switch (area)` perché «Sito Web» sta in Marketing e dura tre
settimane: i mesi non gli servono, e il catalogo è già modificabile da admin.

**I trimestri sono quelli della stagione, non del calendario**: Q1 gen-mar ·
Q2 apr-giu · Q3 **lug-ago** · Q4 **set-dic**. Per chi fa advertising il
blocco che conta va dal rientro al Natale, e spezzarlo in due avrebbe diviso
a metà la parte dell'anno in cui si lavora di più. Lo dicevano già i dati:
nove corsie in archivio si chiamano «Set-Dic 2026» e nessuna «Q3».

Un trimestre è una **corsia** (visibile al cliente), un mese è una **tappa**
dentro la continuativa del progetto — se non c'è, si crea «Piano
editoriale», perché `milestones.workstream_id` è obbligatorio e ha ragione:
una tappa senza corsia non comparirebbe da nessuna parte.

**Cosa è già aperto si legge da `project_periods`, per chiave** (`2026-Q4`)
e non dal nome della corsia: i nomi si cambiano, e alla prima rinomina il
generatore riaprirebbe lo stesso trimestre. La riga si scrive **subito dopo**
la corsia, non alla fine del giro: se si interrompe a metà, quello che è
stato creato risulta creato.

**E si guardano anche le date delle corsie che ci sono.** Nove corsie in
archivio *sono* un periodo senza saperlo, e un generatore che legge solo il
registro ne aprirebbe un secondo accanto. La soglia è metà del periodo: una
campagna di dieci giorni che ci capita dentro non è il trimestre, una corsia
che ne copre la metà è la stessa cosa con un altro nome. Quello che salta lo
**dice**, con il nome della corsia che lo copriva — saltare in silenzio è
indistinguibile da un generatore rotto.

Il bottone «Apri i periodi» sta sulla pagina del progetto e viene **prima**
del giro automatico, apposta: il primo periodo si apre a mano e si guarda.
`npx tsx scripts/prova-periodi.ts` stampa cosa farebbe su tutti i progetti
senza scrivere niente.

**Le tappe ricorrenti** (§337, `recurring_milestone_templates`). Il doc 16 dice
«mai una workstream nuova per settimana/mese» e ha ragione — il contenitore è
stabile — ma la **tappa** dentro quel contenitore torna eccome: chiusura del
mese, review trimestrale, piano stagionale. Sono una regola che genera milestone
vere, una per periodo, ognuna col suo stato: una riga sola con la data che
avanza sarebbe stata più semplice e avrebbe cancellato il passato — non si
saprebbe più se la chiusura di settembre è stata fatta in ritardo, perché quella
riga adesso parla di ottobre.

- **Sul calendario ne compare una sola** (`collapseSeries`): la più vicina a
  oggi guardando avanti, che è quella su cui si può ancora fare qualcosa. Dodici
  bandierine identiche in fila nasconderebbero le consegne vere, cioè il
  calendario smetterebbe di servire a quello per cui esiste. Quando la serie è
  tutta passata resta l'ultima: «finita» e «non c'è mai stata» non possono
  leggersi uguali. Le consegne vere passano intere.
- **Il taglio sta in `ProjectGantt`**, non nelle due pagine che costruiscono le
  corsie: una regola scritta due volte non è una regola.
- Nascono `delivery` e non `system`: una tappa che torna **ha una data e si
  chiude**, ed è esattamente quello che la milestone di sistema non è (§322).
  Marcarla di sistema la farebbe sparire dal calendario, che è il posto per cui
  è stata chiesta.
- Togliere la regola non toglie la storia: `recurring_template_id` va a NULL e
  le tappe generate restano.

**La riga di una ricorrente si modifica dove si legge** (§338). Diceva titolo e
frequenza, e tutto il resto stava dietro una matita che compariva solo passandoci
sopra — su un touch, mai. Il **responsabile** non era nemmeno visibile, ed è la
sola cosa che decide se l'occorrenza arriverà a qualcuno: una regola senza
responsabile genera task di nessuno, che è come sono nate tutte e 185 quelle in
archivio. Adesso la riga dice **chi, ogni quanto, la prossima volta e quante ne
fa al mese**; responsabile e pausa si toccano sul posto, e assegnare **rigenera
subito**. Matita e cestino sono sempre visibili.

- **Il form dice cosa produrrà, prima di salvare**: le prime tre date e il
  volume mensile. Una regola si scrive a parole e si legge in date — «ogni due
  settimane di lunedì» non dice se la prima cade domani o fra dodici giorni — e
  una ricorrenza che sforna trenta righe invece di una si scopre quando il
  calendario è già pieno. Se non produce nessuna data, lo dice in giallo invece
  di salvare una regola muta.
- **Da quando e fino a quando** erano assenti, e su una tappa sono la domanda
  principale: «la review parte da gennaio». Senza fine la serie continua, ed è
  il caso normale.
- **Una tappa nata da una regola porta il badge «ricorrente»**: altrimenti chi
  la trova in elenco la corregge a mano e al giro dopo ne ricompare un'altra
  identica, senza capire da dove. Il posto per cambiarla è la regola.

Gate: `npx tsx lib/recurrence.check.ts` e `npx tsx lib/recurrence-run.check.ts`.

## La sezione Task le contiene tutte (§340)

`/ad-hoc` mostrava le sole `task_type = 'ad_hoc'` e si chiamava «Task Ad Hoc»:
l'altra metà del lavoro stava nella scheda di ogni progetto, e per sapere cosa
ha in mano una persona bisognava guardare in due posti **sapendo già in quale**.
Adesso è «Task» e le carica tutte.

Il **menu del workspace** ha continuato a dirlo «Task Ad Hoc» fino alla
migration 229 (§346): l'etichetta non sta nel codice ma in
`workspace_sections`, quindi rinominare la pagina non rinomina la voce — ed è
proprio la voce a promettere metà del contenuto a chi deve ancora entrare.

- **Il selettore in cima rifà la separazione**: *Tutte · Di progetto · Ad hoc*,
  ognuna col suo numero, così si sa cosa si lascia fuori **prima** di premere.
  Si apre su «Tutte»: la domanda che porta qui è «cosa c'è da fare», e la
  risposta non è mai metà del lavoro.
- **I riquadri in cima seguono la scelta**: un «12 in ritardo» che conta anche
  quello che non stai guardando manda a cercare due task che non esistono.
- **Il progetto si vede sulla riga** quando ce n'è uno, e si tace dove sarebbe
  una ripetizione (sotto il titolo del gruppo «Progetto»): in una lista
  mescolata è ciò che distingue una consegna da una richiesta veloce.
- **Si può raggruppare per progetto**, oltre che per cliente, persona e
  scadenza.
- Le azioni non sono cambiate: `setAdHocTaskStatus` e compagnia lavorano per id
  e non filtrano il tipo. Ma ora la revalidazione tocca anche `/progetti` e «le
  mie attività»: spuntare qui una task di progetto la lasciava aperta là, e due
  schermate dicevano due cose.

## Le ricorrenti del wizard erano regole e basta (§346)

**Misurato sul database il 17 settembre 2026**: 15 regole ricorrenti attive,
**zero occorrenze**, `last_generated_at` nullo su tutte e 15, `owner_id` nullo
su tutte e 15. §337 aveva riparato il motore e il motore funziona: non lo
chiamava nessuno. Quattro cause in fila, e ognuna bastava da sola.

- **Il wizard non accendeva il motore.** `createRecurring` generava subito
  (§337), ma le regole quasi nessuno le scrive a mano: nascono dentro
  `create_project_from_template`, che le inserisce e non materializza niente.
  Stessa strada per la conversione di un'opportunità vinta (225). Adesso il
  «genera subito» sta in **`lib/recurrence-kick.ts`** e lo chiamano tutte e tre
  le strade; `runRecurrences` accetta `projectId`, perché il wizard scrive dieci
  regole in una volta e non ne conosce gli id — sono nate dentro la RPC — e
  rigenerare l'archivio intero a ogni progetto creato farebbe pagare a chi crea
  un progetto il lavoro di tutti gli altri.
- **La regola nasceva di nessuno.** Nella riga ricorrente del wizard c'erano
  titolo e frequenza: il responsabile non era chiedibile, e l'espansione da
  template lo passava sempre nullo. Il motore copia `owner_id` del template in
  `assignee_id` dell'occorrenza, quindi ogni ricorrente generava task di
  nessuno — che è il modo più silenzioso di non consegnare un lavoro. Ora la
  riga ha la sua select, la catena è **`recOwner`** (riga → workstream → PM) in
  un posto solo perché la chiedono in tre (la select, il payload, il controllo
  finale), «Assegna al PM» tocca anche le ricorrenti, e la migration 227 mette
  lo stesso pavimento dentro la funzione, per i payload che la UI non costruisce.
- **La finestra era di tre giorni, e trenta non era la risposta.** §337 aveva
  deciso trenta e la 223 ha messo `DEFAULT 30` sulla colonna, ma tutti e tre i
  punti di scrittura passavano 3 esplicito: il default non si applicava mai, e
  con tre giorni una mensile non produce niente per settimane («tre giorni non
  ne prendono nessuno», `lib/recurrence-run.check.ts`). Portate tutte a trenta
  (227), però, un giro avrebbe creato **236 occorrenze**, ~170 dalle sole sei
  giornaliere: trenta giorni di «Check Ads» sono trenta righe identiche. §337
  aveva previsto la valvola — «chi produce troppo si abbassa da solo» — ma il
  campo non è esposto in nessun form, quindi non è mai stato possibile: un
  parametro che nessuno può toccare non è una scelta, è un numero. Adesso **la
  finestra la decide la cadenza** (228): giornaliera 7, settimanale e
  quindicinale 30, mensile 90, trimestrale 180 — così quante righe una regola
  mette in lista non dipende da quanto spesso torna. Lo stesso giro ne fa 85.
  Il numero vive in un posto solo, `recurrence_lead_days()` sul database: la
  colonna è nullable, NULL vuol dire «decidila tu», e lo scrive un trigger —
  perché i due scrittori (l'azione via PostgREST e la funzione del wizard) non
  possono condividere una costante.
- **Una regola senza responsabile non genera.** Il motore copia `owner_id` in
  `assignee_id`: materializzarla vuol dire fabbricare lavoro di nessuno, una
  riga nuova ogni giorno che nessuno raccoglie — sarebbero state 113 in un colpo
  solo. Fermarsi **non è nascondere**: il report dice quante ne ha lasciate
  ferme, la scheda progetto le conta in giallo, e assegnare rigenera subito
  (§338). Il gesto che manca diventa quello che accende la serie.
- **Il motore è uno.** Il bottone «Genera ricorrenti» chiamava ancora
  `generate_recurring_task_occurrences()` della 152 — la funzione SQL che §337
  aveva sostituito: non scrive `task_assignees`, non conosce le tappe ricorrenti
  e non dice cosa ha fatto. Due motori sulla stessa regola danno la stessa
  risposta solo finché nessuno ne corregge uno. Adesso passa da
  `generateRecurrencesNow`, ristretto al progetto che lo chiede, e il vecchio
  endpoint non c'è più (§329: lasciarlo esportato voleva dire lasciare
  raggiungibile il motore sbagliato).
- **Il cron poteva non passare.** `RECURRENCE_CRON_SECRET` non era nemmeno in
  `.env.local.example`: senza segreto `fromCron()` rifiuta e la schedulazione
  fallisce in silenzio — lo stesso difetto che §337 diceva di aver chiuso, un
  piano più su. Ora è documentato, **e la scheda progetto dichiara lo stato**:
  «mai generate» in rosso, «N senza responsabile» in giallo, altrimenti la data
  dell'ultima generazione. Un motore fermo e un motore che gira non possono
  avere la stessa faccia.

## La sezione Task mostra anche le milestone (§346)

Una milestone non compariva in **nessun** elenco di lavoro: non nella sezione
Task (§340), che pure «le contiene tutte», e nemmeno in «Le mie attività». Chi
ne aveva una in carico la trovava solo aprendo il calendario del progetto, cioè
solo se sapeva già di doverla cercare — sedici tappe con un responsabile, zero
liste personali che le nominano.

- **Una fascia loro, sopra l'elenco**, contata (in ritardo, senza responsabile,
  consegnate) e **chiusa di default**: la domanda che porta in quelle pagine è
  «cosa c'è da fare», le consegne sono il contesto — e da chiusa l'intestazione
  dice già tutto quello per cui uno la aprirebbe. Sullo schermo la parola è
  **milestone**, quella che il team usa e quella che sta sul calendario; nel
  codice il tipo resta `TappaRow`, il nome del dominio nei doc. Non righe mescolate, e la ragione non è estetica: le
  task di una tappa sono **già** nell'elenco, quindi in una lista sola lo stesso
  lavoro si conta due volte e «12 in ritardo» diventa un numero che non esiste da
  nessuna parte; lo stato parla un'altra lingua (`in_approvazione`/`completata`
  contro `in_review`/`completato`); e una tappa non si spunta — si consegna, e a
  volte si fa approvare.
- **Le milestone di sistema restano fuori.** «Operatività continua» nasce dal
  trigger su ogni workstream (§322), non ha data e non si chiude: diciotto righe
  identiche in cima sono lo stesso rumore che §337 ha tolto dal calendario.
- **Segue i filtri dell'elenco** (ricerca, cliente, persona, in ritardo/≤7g/non
  assegnate): una fascia che li ignora mostra le tappe di altri mentre stai
  guardando le tue. Sparisce su «Ad hoc», che è per definizione quello che sta
  fuori dai progetti.
- **La riga è il link** (§345), con lo strato invisibile su tutta la riga e non
  sul solo titolo, e porta alla workstream — dove la tappa si modifica davvero
  (§322). Dal workspace resta nel workspace: la rotta si costruisce da `projectBase`.
- **In «Le mie attività» il conteggio delle task è di tutti**, non delle mie: «2
  aperte su 3» contato sulla propria lista direbbe un numero più piccolo del
  vero, e la domanda è quanto manca alla consegna. E «nessuna attività
  assegnata» con tre consegne in carico è la frase che fa chiudere la pagina:
  adesso le nomina.
- Il modello è in **`lib/task-board.ts`** perché lo chiedono in tre — sezione
  Task admin, workspace, «Le mie attività» — e una regola scritta tre volte
  diverge alla prima correzione. Gate: `npx tsx lib/task-board.check.ts`, che
  prova il modello **e rende la fascia** fuori dal browser: «non è cliccabile» è
  un difetto che il compilatore non vede.

## La riga della task dice dove sta (§346)

Nell'elenco della sezione Task le colonne non avevano un nome — una data
relativa («tra 7g»), un cerchietto con due lettere e una parola di stato si
leggono solo se qualcuno dice cosa sono — e il contesto stava in un chip
tagliato a 150px: su un nome scritto dalla convention (`Cliente · Area ·
Servizio`) si leggeva **«Affinity · Growth · Le…»**, cioè il nome del cliente,
che il titolo del gruppo diceva già, e del progetto niente. Del **workstream**
non c'era traccia: due task dello stesso progetto ma di due corsie diverse erano
due righe identiche.

- **Intestazione e righe da una griglia sola** (`GRID` in `AdHocClient`): due
  elenchi di colonne scritti a mano divergono al primo ritocco, e
  un'intestazione disallineata è peggio di nessuna intestazione. La colonna si
  chiama **Progetto** e non «Dove»: il nome dice la cosa che ci si legge sotto.
- **Il nome del progetto è la porta del progetto** (§345): si legge lì e per
  aprirlo si tornava indietro a cercarlo in un elenco. Dal workspace resta nel
  workspace, perché la rotta si costruisce da `projectBase` e non a mano (§211).
  Quando si raggruppa **per** progetto il link non c'è: quel nome è già il
  titolo del gruppo, e la riga tace quello che il gruppo dice.
- **Il contesto non si ripete**: `progettoBreve` toglie dal nome del progetto il
  cliente che è già scritto accanto (o in testa al gruppo), `workstreamBreve`
  toglie dal workstream il prefisso che ripete il progetto e resta muto quando
  la corsia **è** il progetto. Valgono per ogni raggruppamento — cliente,
  progetto, persona, scadenza, piatta — perché la riga sa cosa il gruppo ha già
  detto. Il nome intero resta nel titolo del puntatore: accorciare non è
  nascondere.
- **Due colonne per la stessa cosa non ci sono più**: data relativa e campo data
  stavano una accanto all'altra, come l'avatar e la tendina dell'assegnatario —
  ed è il motivo per cui al progetto restavano 150px. Ora il campo prende il
  posto del testo al passaggio del mouse, come in «Le mie attività».
- Da telefono restano due colonne (attività e stato) e «dove» scende sotto il
  titolo, invece di sparire: è quello che distingue due righe con lo stesso nome.

Gate: `npx tsx lib/task-board.check.ts` prova i due tagli sui nomi veri del
database.

## Quanto manca, e chi te l'ha data (§347)

Due cose che una lista di task non diceva, e sono le due domande che ci si fa
guardandola.

**Il colore dice quanto manca**, e solo per ciò su cui si può ancora fare
qualcosa: **scaduta** (tinta rossa) e **scade adesso** — oggi o domani — (tinta
gialla). Non tre livelli: «entro sette giorni» colorerebbe in una settimana
tutto l'elenco, e una lista dove tutto è urgente non ha righe urgenti. La tinta
è tenue per costruzione (i token `-dim` stanno al 14-20% di alfa) e non è mai
l'unico canale — la data continua a scrivere «3g fa», «oggi», «domani» — perché
chi non distingue i rossi deve leggere la stessa cosa. La regola è
`urgenzaDi` in `lib/task-board.ts`, sotto test: la usano la sezione Task e «Le
mie attività», e la stessa task non può sembrare urgente in un elenco e no
nell'altro.

**Chi ha assegnato la task** non era scritto da nessuna parte. `tasks.created_by`
risponde a un'altra domanda — chi l'ha **creata** — e le due divergono ogni volta
che un lavoro cambia mano, che è esattamente quando uno vuole chiedere
spiegazioni a qualcuno.

- La colonna sta su **`task_assignees.assigned_by`** (migration 231), dove sta il
  fatto che descrive: l'assegnazione. Su `tasks` sarebbe una seconda copia da
  riallineare a mano a ogni cambio di titolare — cioè un valore plausibile e
  sbagliato in attesa di essere letto.
- La scrivono tutti i percorsi che assegnano: creazione e modifica di una task,
  `setTaskAssignees`, e il motore delle ricorrenze, dove l'autore è **chi ha
  scritto la regola** — il motore non decide niente, esegue.
- **Nessun backfill.** L'unica traccia era `activity_log`, dove le righe delle
  task sono anteriori al reset del dominio progetto e hanno `user_id` nullo.
  Riempire con `created_by` sarebbe stata un'attribuzione inventata, e il giorno
  dopo indistinguibile da una vera. In lista non si scrive niente, nel dettaglio
  si dichiara: «assegnata prima che registrassimo da chi».
- In riga sta **sotto il nome di chi ce l'ha in carico** («da Marco»), non in un
  titolo che compare al passaggio del mouse: da telefono un tooltip non esiste.
- Le pagine personali reggono la colonna mancante: se la 231 non è ancora
  applicata la query ripiega su quella di prima, perché perdere **tutte** le task
  multi-assegnate per una colonna che serve a dire un nome sarebbe il danno
  peggiore.

## «Le mie attività» è la sezione Task, ristretta a te (§348)

Erano **due liste di task**: la sezione Task e «Le mie attività», ognuna con le
sue righe, il suo dettaglio, le sue parole. Avevano già preso strade diverse —
«Completata» di qua, «Completato» di là — e ogni correzione andava fatta due
volte, finché qualcuno non se ne dimenticava: colonne, colori di urgenza, chi ha
assegnato e il dettaglio nuovo erano arrivati solo da una parte.

Adesso il componente è **uno** (`components/tasks/TaskList.tsx`) e cambia una
cosa sola: quali righe arrivano. La pagina personale passa le task assegnate a
chi guarda e `personale`, che toglie quello che su una lista di una persona non
ha senso — il filtro per assegnatario (è già uno) e il raggruppamento per
persona (sarebbe un gruppo solo) — e aggiunge il **verdetto** in testa, che su
una lista propria è la prima cosa che si legge.

- **Bacheca e calendario sono passati di là**, non spariti: erano tre modi di
  guardare lo stesso lavoro che esistevano solo in «Le mie attività», e non
  c'era ragione perché la sezione Task ne avesse uno solo. Stanno in
  `components/tasks/TaskViews.tsx`, sopra lo stesso modello di riga.
- **Il vocabolario visivo è in `components/tasks/task-ui.ts`**: stati, toni,
  priorità e i due modi di scrivere una scadenza — compatto per la colonna,
  esteso per le schede. Erano scritti due volte e già divergevano.
- **Si apre raggruppata per scadenza**, ed è la prima voce del selettore: la
  domanda che porta in queste pagine è «cosa devo fare adesso», e la risposta è
  una data. Per cliente serve quando si prepara una call, non quando si apre la
  mattina.
- **I colori dell'urgenza sono opachi e per tema** (`--color-row-late`,
  `--color-row-soon`): una velatura lascia passare lo sfondo della pagina,
  quindi la stessa classe rendeva due colori diversi in chiaro e in scuro e sul
  buio mangiava l'elevazione della riga. Sono la superficie con dentro un 6-9%
  di rosso o d'ambra; il bordo di sinistra è l'unico segno vivo e resta sotto
  metà opacità.
- Il dettaglio è lo stesso modale in tutte e due le pagine, con dentro chi ha
  assegnato (§347). Il pannello laterale di «Le mie attività» non c'è più: era
  un secondo modo di aprire la stessa cosa.

**E il modale dice la verità** (§349). Si intitolava «Dettaglio task ad hoc» su
**qualunque** task, comprese quelle di progetto — un titolo che afferma una cosa
falsa su metà delle righe insegna a non leggere i titoli. Adesso è «Dettaglio
task» e l'occhiello dice dove sta: `Ad hoc · Cliente` oppure
`Cliente › Progetto › Corsia`. Il file si chiama `TaskDetailModal`, come la cosa
che è.

Dentro mancava uno stato su cinque — **Supporto** — e non era solo una voce
assente: lo stato di partenza ripiegava su «Da fare» quando non lo riconosceva,
quindi aprire una task in supporto e salvare qualunque altra modifica la
retrocedeva in silenzio. Gli stati arrivano da `task-ui`, dove sono scritti una
volta sola.

## La voce delle liste: dinamica, e con le mani legate (§351)

«4 in ritardo: recuperale prima di aprire altro» era una frase fissa, e una
frase fissa si smette di leggere al terzo giorno — con lei si smette di leggere
il numero che porta. Adesso il verdetto, il sottotitolo dell'elenco e il saluto
della home operativa ruotano, cambiano con l'ora e col giorno, e si permettono
di lamentarsi. `lib/task-mood.ts`, sotto gate, con tre vincoli che il test
controlla uno per uno:

- **il numero non si tocca**: la battuta ci gira intorno, non lo sostituisce e
  non lo arrotonda. Il gate prova tutte le varianti per ogni ora e ogni giorno e
  conta quelle che «dimenticano» il conteggio: devono essere zero;
- **stessa situazione, stessa frase**: la scelta è deterministica e il seme
  dipende dal giorno e dai conteggi, **non** da quello che si sta scrivendo
  nella ricerca — un testo che balla mentre digiti è un difetto, non brio;
- **l'ora arriva dopo il montaggio**: il server sta su UTC e chi legge no, quindi
  finché il momento non si conosce si pesca solo fra le frasi che valgono sempre.
  Senza questa regola il browser scriverebbe «buongiorno» dove il server aveva
  scritto «è tardi», e React lo direbbe a voce alta.

L'ordine della gravità non cambia mai — ritardo, scadenza vicina, buone notizie —
e a chi non ha nemmeno una task non si parla di ritardi: il caso vuoto viene
prima di tutti, o la lista di chi è appena arrivato lo accoglierebbe con un
rimprovero.

**La voce copre undici sezioni del workspace**, non solo le task: clienti,
progetti, ticket, documenti, documenti personali, buste paga, richieste HR,
feedback, cronologia, profilo, tracking — più il saluto della home.
`VoceSezione` sta **solo nel portale operativo**: sei di quelle pagine sono le
stesse del portale admin, che si apre davanti a un cliente in call, quindi la
riga arriva per prop e la passa solo la pagina del workspace. Calendario e
customer care restano fuori: le loro intestazioni sono barre compatte con dentro
un conteggio, e una riga in più le spezzerebbe — meglio due sezioni senza voce
che due barre rotte, e nessun gruppo di frasi che non legge nessuno.

**Il gate guarda la struttura, non le parole.** La prima versione cercava
«mattina» nel testo per dire se una frase dipendeva dall'orologio, e bocciava
righe legittime che il mattino lo nominano per modo di dire («carte che servono
sempre di lunedì mattina»). Adesso prova la proprietà vera: una frase pescabile
senza momento deve restare pescabile a ogni ora e ogni giorno — cosa vera solo
per quelle senza condizione. E i semi di prova sono **consecutivi**: la scelta è
un modulo sulla lunghezza del gruppo, e una serie a passo sette copriva un resto
su sette, bocciando frasi che non aveva mai pescato. Un test che campiona male
accusa il codice del proprio difetto.

## Il saluto sa chi sei e come stai messo (§352)

Sotto «Ciao, nome 👋» c'era la data, e basta. Adesso c'è una riga che guarda **i
numeri di chi apre la pagina** — in ritardo, in scadenza oggi, chiuse in
giornata, aperte in tutto — e il suo **ruolo**, perché a uno stage e a un manager
la stessa frase non dice la stessa cosa:

- *junior, 3 in ritardo* → «3 in ritardo: se una si è incagliata, chiedi. Non è
  una sconfitta.»
- *manager, 3 in ritardo* → «3 in ritardo tue. E sei quello che dovrebbe dare
  l'esempio.»
- *chi ha chiuso 5 task oggi* → «5 chiuse. Sospettosamente produttivo, ci piace.»

**Il ruolo cambia di cosa si parla, non il rispetto**: chiedere aiuto, il lavoro
degli altri, il pezzo difficile. Un junior non si tratta da incapace e un
manager non si tratta da capo — e a chi non ha niente in lista non si rinfaccia
niente, perché è il caso di chi è appena arrivato e sarebbe un benvenuto pessimo.
Il gate lo verifica su tutti e nove i ruoli.

**Nessuna query in più**: i numeri erano già tutti nella pagina, comprese le
completate di recente che §283 carica per poter disfare una spunta.

Sui numeri il gate ha una regola diversa da §351, e più giusta: **un numero
scritto nel testo dev'essere un numero dei dati** — cerca ogni cifra nella frase
e la confronta con lo stato — mentre *pretendere* che ogni frase ne citi uno
bocciava «Elenco pulito», che un numero non ce l'ha perché non c'è niente da
contare. Dove però il numero **è** la notizia — ritardi, scadenze di oggi, chiuse
in giornata, carico aperto — la frase deve dirlo.

## I dettagli della task si scrivono dove si crea la task (§353)

Nel wizard la task aveva titolo, data, assegnatario — e il campo dei **dettagli**
dietro un bottone che si apre solo se uno sa che c'è. Il risultato si legge in
archivio: il contesto finiva nel titolo («Creatività statica x3 (3 formati, no
logo, consegna giovedì)»), e chi riceveva la task leggeva una riga di elenco
lunga il doppio e comunque incompleta.

Adesso è una riga sotto il titolo, facoltativa: se non serve resta vuota e non
occupa niente. Sotto il bottone restano **ore e priorità**, che sono
impostazioni, non contenuto — e infatti il bottone ha cambiato nome: due cose
diverse non possono chiamarsi tutte e due «dettagli».

**Il campo si chiama «Dettagli» ovunque** — composer, wizard, modale, pannello
laterale del progetto — perché è sempre la stessa colonna (`tasks.description`).
Si chiamava «Descrizione» in due posti su quattro, e un campo con due nomi fa
cercare due campi.

**E si chiede dove la task nasce**, cioè nel composer di «Nuova task»: lì non
c'era affatto, quindi la richiesta arrivava a chi la riceve senza una riga di
contesto. Subito sotto il titolo, facoltativo.

**«Nuova task» e il «crea» della testata aprono la stessa cosa.** Erano due
porte per lo stesso modale con due contenuti diversi: dalla sezione Task
mancavano i progetti, l'anagrafica era quella delle righe in elenco e il
permesso di aprire un cliente non veniva passato. Adesso le due chiamate
combaciano — stessi tipi, stessa anagrafica, stessi progetti, stesso permesso —
e l'unica differenza è contestuale: se in pagina c'è un filtro cliente attivo,
quel cliente arriva già scelto.

**Da «Nuova task» si crea anche dentro un progetto.** Il composer offriva solo
«Ad hoc» e «Al cliente», mentre quella sezione le contiene tutte (§340): per
aggiungere una task a una milestone bisognava aprire il progetto, poi la
workstream, poi la tappa. La cascata progetto → workstream → milestone il
composer ce l'ha da sempre — era il chiamante a non offrirla. Le pagine
personali passano **tutti** i progetti attivi e non solo i propri, o si
potrebbe creare una task solo dove se ne ha già una.

Nel passaggio è emerso che `createProjectTask` scriveva il ponte degli
assegnatari **senza autore** e senza avvisare nessuno: era l'unico percorso di
creazione rimasto fuori da §347 e §350, e proprio quello che crea task già
assegnate.

## Il calendario milestone prende la pagina, e il fine settimana è spento (§354)

Tre cose sulla sezione Progetti, tutte sullo stesso schermo.

- **La pagina non è più larga 1024px.** Il calendario è la cosa per cui questa
  pagina si apre, e in una colonna stretta il nome di un progetto («iCura
  Impresa · Digital · Sito web») arrivava ai puntini dopo tre parole mentre a
  destra restava un mese e mezzo di griglia da guardare. La colonna dei nomi
  passa da 260 a 320, e **dentro la riga di un cliente il nome del cliente
  sparisce** dal nome del progetto: era scritto due volte, e la seconda mangiava
  il servizio — l'unica cosa che distingue due righe dello stesso cliente
  (`progettoBreve`, la stessa regola delle task §346).
- **Si apre sull'area di chi guarda** (§358). La prima domanda di un manager
  growth non è «cosa fa la società», è «cosa faccio io». L'idea era leggere
  `profiles.area`: misurata prima di scriverci sopra, è **nulla per tutte e
  sette le persone attive** — un default costruito lì non avrebbe selezionato
  niente per nessuno, lo stesso difetto di §339. Quindi l'area si **deduce dal
  lavoro**: quella che compare di più fra i progetti in cui la persona è dentro,
  come membro o come PM. Sui dati veri esce netta. Chi governa — admin, founder,
  super admin — parte da «Tutte», perché governa tutto. Resta un default, non un
  confine: si cambia con un clic, e a parità vince l'ordine dell'elenco, perché
  un default che cambia da solo a ogni ricarico è peggio di nessun default.
- **I progetti in cui sei dentro non spariscono mai.** Filtrare per area è utile
  finché non nasconde il lavoro tuo: un manager growth che presidia un digital
  deve continuare a vederne le scadenze anche con «growth» scelto, o il
  calendario gli racconta una settimana che non è la sua.
- **Ogni cambio di filtro riporta il calendario su oggi.** Le corsie cambiano
  sotto i piedi e la finestra resta dov'era: restare fermi a dicembre davanti a
  una griglia vuota fa sembrare che il filtro abbia cancellato tutto. §345 aveva
  tolto il ritorno **automatico** — che ripartiva a ogni ridisegno e rendeva le
  milestone lontane irraggiungibili — non quello **richiesto**: questo è
  richiesto, come il pulsante «Oggi».
- **Il filtro area governa anche il calendario.** Era solo dell'elenco qui
  sotto: scegliendo «growth» le bandierine sopra continuavano a mostrare tutto,
  e le due metà della pagina rispondevano a due domande diverse. Adesso è un
  comando solo (`AreaPicker`, stesso stato) in due posti — in testata al
  calendario, dove si vede l'effetto, e nella barra dell'elenco, dove stava già.
  Con un'area scelta restano solo i clienti che in quell'area hanno qualcosa: una
  riga «nessun progetto in corso» sotto il filtro «growth» direbbe una cosa
  falsa, perché i progetti quel cliente ce li ha — solo non di quell'area.
- **Il segno di oggi stava su domani** (§355). Le colonne nascevano a mezzanotte
  **locale** e si rileggevano con `toISOString()`, che è UTC: a Roma sono due ore
  indietro, quindi la cella del 19 si dichiarava «18» e l'oro finiva sul giorno
  dopo. Un errore di un giorno non alza nessuna eccezione — si vede solo
  guardando il calendario sapendo che giorno è. Adesso le colonne si contano in
  **UTC** (come le ricorrenze, §337) e «oggi» si legge dall'**orologio di chi
  guarda**, perché `toISOString()` dopo le 22 a Roma dà già il giorno dopo.
  `lib/calendario-lavorativo.ts`, sotto gate, con il giro completo: costruire un
  giorno e rileggerlo deve restituire la stessa data, comprese le due domeniche
  del cambio d'ora.
- **Sabato, domenica e festivi sono spenti su tutta l'altezza, a ogni scala.** In testata erano già in
  ombra, ma sotto le corsie il fine settimana spariva: una bandierina di sabato
  si legge come un giorno di lavoro qualunque, e un piano fatto contando quei due
  giorni sfora di due giorni a settimana. La banda sta **sotto** le corsie e non
  intercetta il puntatore — se coprisse le bandierine il calendario diventerebbe
  bello e inservibile. Sono le feste nazionali italiane più Pasquetta, che è
  l'unica mobile e si calcola; il patrono resta fuori, perché cambia da città a
  città e spegnere un giorno lavorativo per metà squadra fa più danno che non
  spegnerne nessuno. **Il festivo ha un colore suo** (§356): un sabato lo si sa
  già, il 25 aprile no, ed è il giorno che sorprende chi sta facendo un piano.
  Stessa profondità del fermo — resta una colonna spenta — con dentro un'ombra
  d'oro, e il numero del giorno nell'inchiostro d'oro tenue. Passandoci sopra il
  riquadro dice **quale** festa è: «Pasquetta», «Liberazione», «Ferragosto». Non
  il titolo del browser, che compare dopo un secondo, sparisce da solo e da
  telefono non esiste: il riquadro è lo stesso che usano i badge delle corsie.

  **Il colore è opaco, non una velatura**, e questa è la parte che avevo
  sbagliato due volte. Prima con `bg-overlay/[0.05]`, una classe che il CSS
  compilato **non conteneva**: banda nel markup, niente sullo schermo. Poi con
  `bg-overlay/5`, che esiste ma prende il tono del **testo**: al buio è bianco,
  quindi quelle colonne risultavano più **chiare** dello sfondo — l'opposto di
  spegnerle. Adesso c'è `--color-cal-fermo`, un colore pieno per tema: la
  superficie della tabella spinta verso il fondo pagina (#0D0D0F al buio,
  #ECEFF3 sulla carta). Una velatura prende il colore di chi sta sotto; un token
  per tema dice esattamente che colore vuoi, in tutti e due i temi.

Gate: `npx tsx lib/gantt-lanes.check.ts` rende il componente e conta le bande —
«zero» e «tutti i giorni» sono i due modi in cui questa cosa si rompe, e nessuno
dei due si vede leggendo il codice.

## Le date che muovono le campagne (§357)

Il calendario spegne i giorni in cui **non si consegna** (§355); un terzo colore
accende quelli in cui si lavora **di più**. Sono due domande opposte, e infatti
le colonne marketing non vanno verso il fondo pagina come weekend e festivi ma
verso l'accento: «qui succede qualcosa», non «qui non si fa niente».

- **Poche e vere**: Black Friday, Cyber Monday, Singles' Day, avvio del
  calendario dell'avvento, saldi invernali ed estivi, San Valentino, festa della
  donna, del papà, della mamma, Halloween, rientro di settembre. Il gate impone
  il numero — **fra nove e venti l'anno** — perché una colonna colorata dice
  «guarda qui» solo finché resta rara, e le giornate mondiali di qualcosa sono
  trecentosessantacinque.
- **La Black Week è una settimana, non un venerdì**: da lunedì a Cyber Monday,
  perché le creatività partono lunedì e segnare il solo venerdì vuol dire
  segnare il giorno in cui è già tardi. Dentro la settimana, Black Friday e
  Cyber Monday tengono il loro nome. È l'unica finestra: tutto il resto è un
  giorno solo.
- **Una data marketing vince il colore anche di domenica.** La festa della mamma
  è sempre domenica: lasciarla nel grigio del weekend vuol dire nasconderla
  proprio nel calendario che dovrebbe farla vedere. Il riquadro in hover dice
  tutte e due le cose — «Festa della mamma» e «domenica: non si lavora» — perché
  sono due informazioni diverse e servono entrambe a chi pianifica.
- **Le date calcolate sono il punto debole**, e stanno sotto gate: «venerdì dopo
  il quarto giovedì di novembre» non è «ultimo venerdì di novembre» — nel 2025
  le due regole danno risultati diversi — e un errore così si scopre l'anno in
  cui capita, cioè col piano già in mano al cliente. Il test fissa cinque anni
  di Black Friday, e controlla che festa della mamma cada di domenica, i saldi
  estivi di sabato e il rientro di lunedì.

## La parola che non ci descrive (§359)

TwoBee è una **società di consulenza digitale**, non un'agenzia: è la cosa più
lontana da come lavoriamo, e la parola era in quarantotto punti fra codice,
interfaccia e documentazione. Non tutti uguali, ed è la ragione per cui non è
bastato un cerca-e-sostituisci:

- **su di noi** se n'è andata: i prompt dell'assistente («Sei l'assistente di
  TWO BEE, società italiana di consulenza digitale»), i report KPI, «Come sta
  TwoBee?» in dashboard, i sottotitoli delle liste, gli insight economici;
- **sugli altri resta**, perché è vera: un fornitore può essere un'agenzia, il
  cliente può avere la sua agenzia di supporto, e l'Agenzia delle Entrate si
  chiama così;
- nel tracking la famiglia delle **«chiavi d'agenzia»** — le credenziali che
  valgono per tutto il portafoglio, contro quelle del singolo cliente — diventa
  **«chiavi condivise»**: dice meglio cosa sono e non nomina nessun tipo di
  azienda. Rinominati anche gli identificatori (`SHARED_CREDENTIALS`,
  `TRACKING_SHARED_ROLES`, `SharedKeysSettings`), o la parola sarebbe tornata su
  dalla prima frase scritta leggendo il codice. **La tabella
  `agency_platform_keys` resta**: rinominarla vuol dire una migration, le RLS e
  un rischio vero per una parola che nessuno vede.

Gate: `npx tsx lib/parole.check.ts` — cerca la parola in `app`, `components`,
`lib` e `docs`, e la ammette solo dove l'elenco delle eccezioni dice **perché**
parla di altri. Una regola di lingua che vive nella testa di chi l'ha detta dura
fino al prossimo che scrive un testo.

## Progetti: filtrabili e raggruppati per cliente (§341)

L'elenco sotto il calendario era una griglia piatta di trenta schede, coi
progetti dello stesso cliente sparsi in mezzo: per sapere cosa c'è aperto su
iCura bisognava scorrere tutto e tenerlo a mente — mentre il calendario, dieci
centimetri più su, è già per cliente. Le due metà della pagina rispondevano alla
stessa domanda in due ordini diversi.

- **Raggruppato per cliente** di default, con il conteggio e quanti sono attivi;
  il pulsante «per cliente» torna all'elenco unico per chi lo preferisce.
- **Il filtro cliente** elenca solo chi ha davvero un progetto: un filtro con
  voci vuote fa premere per scoprire che non c'era niente.
- **Una sola `ProjectCard`** per tutti e due i modi di leggere: due copie dello
  stesso markup divergono al primo campo aggiunto, e la pagina finisce col dire
  due cose di sé. Sotto il titolo del cliente il nome del cliente sparisce —
  ripeterlo su ogni riga allontana il servizio, che è l'informazione vera.

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


## La testata del workspace fa quello che fa quella admin (§350)

Nel portale operativo la testata aveva **solo** il «crea»: niente campanella,
quindi un'assegnazione la si scopriva ricaricando; niente menu profilo, quindi
per uscire bisognava sapere dove andare; e il tema si cambiava solo dalla barra
laterale, che sotto i 1024px non esiste — da telefono, quindi, non si poteva
cambiare affatto. Non era una decisione: era una testata scritta a parte, e
quello che nasce a parte resta indietro.

- **`components/shared/HeaderActions.tsx`**: notifiche, profilo e tema, un
  componente solo per i due portali. Prima erano centocinquanta righe dentro
  `Header` e non esistevano altrove.
- Il portale cambia **due cose**, e nessuna riguarda cosa si può fare: dove
  porta la voce profilo (`/impostazioni/profilo` o `/workspace/profilo`) e se
  compare «Impostazioni», che è una pagina del portale admin — mostrarla a chi
  il middleware rimbalza sarebbe un link che non porta da nessuna parte (§211).
- Le notifiche restano in ascolto in realtime e sono **di chi le riceve**: la
  RLS (009) le dà a `user_id = auth.uid() OR profile_id = auth.uid()`, nessuno
  legge quelle di un altro.

**Ma la campanella leggeva metà di quello che le spettava.** `notifications` ha
due colonne per il destinatario — `profile_id` (001) e `user_id`, arrivato dopo —
la RLS le guarda tutte e due e la query ne guardava una. Misurato: **11
notifiche su 23** avevano `user_id` nullo (le `task_request` di luglio,
indirizzate ai manager e a un junior): consegnate dal database, invisibili sullo
schermo. Adesso la campanella legge come legge la RLS, e la **232** tiene le due
colonne uguali con un trigger, così un produttore nuovo non può più sbagliarne
una. Una notifica che il database consegna e l'interfaccia non mostra è peggio
di una che non esiste: il sistema sembra funzionare.

**E qualcosa da notificare, nel workspace, non c'era.** Le tre specie esistenti
— cliente perso, richiesta di accesso, nuovo lead — sono tutte indirizzate agli
admin: un junior aveva una campanella che non avrebbe suonato mai. Adesso
`lib/notify.ts` scrive **«ti hanno assegnato»** — task, supervisione, milestone
in carico — con dentro chi te l'ha data (§347) e il link per aprirla. Tre regole,
e sono tutte su quando **non** si scrive:

- **mai a sé stessi**: una notifica per una cosa appena fatta da chi la legge
  insegna a ignorare la campanella, e da lì non si torna indietro;
- **mai dal motore delle ricorrenze**: trenta occorrenze al mese, tutte uguali,
  seppellirebbero le tre righe che contano — la regola si assegna una volta, e
  quella assegnazione la notifica chi l'ha fatta;
- **mai a costo dell'operazione**: se la scrittura inciampa il lavoro resta
  assegnato, perché perdere l'assegnazione per una notifica sarebbe il danno
  peggiore.

Rimettere lo stesso responsabile su una milestone non suona: si legge chi c'era
prima di scrivere, e una riassegnazione a sé stessa non è una notizia.

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


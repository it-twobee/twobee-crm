# Asana — sezione temporanea (§215)

## Asana — sezione temporanea (§215)
`/asana`, voce «Migrazione» nella sidebar admin. Serve a portare dentro il lavoro
che vive ancora sul workspace `twobee.it`, e **va tolta quando il travaso è
finito** — pagina, `lib/asana.ts`, voce di menu. Una sezione temporanea che resta
diventa una cosa che nessuno sa più cosa fa.

**Non scrive niente**, né su Asana né sul database: legge, incrocia, e dice cosa
non torna. Il file CSV si scarica e si guarda prima di decidere.

**La gerarchia sta nei nomi delle board, non nell'API**: i portfolio del PAT sono
zero e Asana vieta di listare quelli altrui (403). Il trattino da solo non basta —
`"Josè Restaurant - Tenuta Villa Guerra"` è un cliente, `"Elettra -GOOGLE ADS"` è
un servizio — quindi decide il **vocabolario dei servizi** (`SERVICES`): se la
coda è un servizio noto è una checklist, altrimenti il trattino fa parte del nome.
L'ordine dei controlli in `classify` è una regola, non uno stile: `Prospect - Sea
Power` va riconosciuto prima di `master`, perché Sea Power è anche cliente vero e
il suo lavoro commerciale finirebbe fra le consegne.

I refusi del workspace (`Sartoria Cpndotti`, `Propsect -`, `Plusvending`) si
mappano in `TYPOS`, non si correggono su Asana: là romperebbero i preferiti delle
persone. **Ogni riga che non passerebbe dice perché** invece di sparire — è la
lista da guardare per capire se manca un'anagrafica o è solo un nome scritto
male. Gate: `npx tsx lib/asana.check.ts` (45 controlli su nomi veri).

Rate limit: le board si leggono a gruppi di cinque e il 429 si rispetta
(`Retry-After`). Un travaso a cui mancano trenta board in silenzio è peggio di
un'attesa.

**Si parte dalle persone** (§216). «Cosa ha in mano Michele» è la domanda con cui
si decide cosa spostare, non «quali task esistono»: le sette risorse del workspace
arrivano dall'API — non dedotte dalle task, così chi ne ha zero compare lo stesso
invece di sembrare non letto — con quante ne ha e quante sono pronte, e il filtro
confronta l'**email**, perché lo stesso nome su Asana si scrive in tre modi.
Le task senza assegnatario hanno una riga loro: la somma delle risorse fa il
totale, o qualcosa è sparito per strada. Una risorsa Asana **senza email** non
eredita le orfane — sono due vuoti diversi, e confonderli le contava due volte
(bug trovato dal gate, non in pagina).

**Il travaso** (`importAsanaTasks`) aggancia le task selezionate a un progetto e
a un workstream **che esistono già**. Tre regole:

- **La milestone è obbligatoria**: senza `milestone_id` la task non compare nel
  board del progetto — importata e invisibile è peggio di non importata.
- **Si può rilanciare**: `tasks.asana_gid` è unico (003), le già presenti si
  saltano contandole invece di far fallire il lotto sulla prima. Chi è già
  dentro lo dice anche in elenco, prima di premere.
- **Il bersaglio si rilegge dal database**, non si crede al client: progetto,
  workstream e milestone devono esistere e appartenersi, o la task finisce in un
  board dove nessuno la cerca.

Gli assegnatari passano da `task_assignees` (sorgente canonica, il trigger
allinea `tasks.assignee_id`), e «seleziona tutto» significa **tutto quello che è
filtrato**, mai le righe nascoste da un filtro dimenticato.

**Chiudere Asana è un lavoro a strappi** (§217, migration 201). Passare in
rassegna 146 board e qualche centinaio di task non è un pomeriggio: si fa fra una
cosa e l'altra, e ogni volta serve sapere dove si era arrivati.

- **Due modalità.** `attive` = il lavoro non chiuso sulle board di consegna, la
  vista per migrare. `tutto` = ogni board (commerciali e interne comprese) e ogni
  task, **anche completata** — la vista per chiudere: quello che non si guarda
  resta lì dentro quando si spegne la luce.
- **`asana_triage`** tiene la decisione presa su ogni `gid`: `tieni`, `elimina`,
  `migrata`. Chiave = gid di Asana, **nessuna FK verso `tasks`** perché quasi
  nessuna di queste entrerà in TwoBee. Nel browser sarebbe costato zero ed era il
  posto sbagliato: una cache svuotata e tre giorni di decisioni spariscono senza
  che nessuno se ne accorga. Non c'è uno stato «forse» — chi resta senza riga è
  ancora da decidere, e un quarto stato avrebbe fatto sembrare deciso quello che
  non lo è. Le già importate contano come decise: su una task che è dentro non
  c'è più niente da scegliere.
- **Si decide per blocco**, non riga per riga: si filtra per cliente o per
  persona e si segna tutta la selezione. Annullare costa quanto scegliere, o si
  smette di decidere per paura di sbagliare. Le decise spariscono dalla lista di
  default — il senso è che si accorci mentre ci lavori — e una barra dice quanto
  manca, che è la sola cosa che rende finito un lavoro che sembra infinito.
- **Ad hoc è la destinazione giusta** (§220). Le 106 task con un proprietario
  stanno su ventisei board diverse — «Contratto Icura e acconto», «Aggiornare
  Centro Contatti Meta», «Organizzare strategia commerciale per neve»: non sono
  passi di una consegna, sono cose da fare per un cliente, che è la definizione
  di ad hoc. `importAsanaAdHoc` chiede **solo** il cliente (dal nome della board)
  e la risorsa (dall'email): niente milestone da scegliere, quindi niente da
  sbagliare. Costringerle in un workstream avrebbe voluto dire inventare
  centoquattro volte una struttura che su Asana non c'era. Una task **senza
  cliente si crea lo stesso** (§221) e lo dice: rifiutarla sembrava prudente e
  non lo era — costringeva a inventare un'anagrafica prima di sapere se serve.
  Nasce con `client_id` nullo e **l'avviso in cima alla descrizione**, dove lo
  legge chi apre la task fra due settimane, non in un messaggio che sparisce dopo
  tre secondi. Non toglie visibilità a nessuno: una ad hoc senza progetto la
  vedono già solo admin e assegnatario (RLS della 094).
- **Il cliente si cerca in due passaggi** (§221, `matchClient`): nome esatto, poi
  **prefisso** — la board «Industrial Service and Facility» è il cliente
  «Industrial Service» scritto per esteso, e senza questo finiva orfana con
  l'unica alternativa di creare un doppione. Il prefisso vale **solo se il
  candidato è uno**: «Fatima Leo» e «Fatima Leo Academy» non si scelgono da sole,
  perché indovinare male attacca il lavoro al cliente sbagliato, che è peggio di
  lasciarlo orfano. L'esito viaggia con la riga (`esatto`/`prefisso`) e in tabella
  un abbinamento dedotto lo dichiara.
- **Cancellare su Asana è un secondo gesto** (§219, `deleteOnAsana`). Segnare
  «da eliminare» non cancella niente: è una decisione, e un pulsante che marca e
  cancella insieme trasforma un ripensamento in un danno — con mille righe già
  marcate, il danno è mille. La conferma è a due passi e il secondo ripete
  **quante** e **dove finiscono**. Va a lotti di `ASANA_DELETE_BATCH` (40) perché
  mille richieste in una server action sola andrebbero in timeout a metà,
  lasciando cancellato un pezzo e nessuno che sa quale: il contatore avanza lotto
  per lotto, e se si rompe si sa quanto è passato. Un **404 non è un errore** —
  la task già sparita è il risultato voluto, si conta a parte. `DELETE` su Asana
  **sposta nel cestino**: 30 giorni per ripristinare, il che rende l'operazione
  accettabile senza backup — ma 30 giorni è un limite vero, non «per sempre».
  Il registro si aggiorna **solo per quelle andate**: una che non è passata deve
  restare in lista, o la si perde di vista.
- **La struttura si guarda per cliente**, non in ordine alfabetico: «Icura - META
  ADS» e «Ad Hoc - Icura» sono lo stesso cliente e si decidono insieme. Le board
  senza cliente stanno in fondo ma **ci sono**: sono quelle che di solito si
  buttano, e nasconderle fa chiudere Asana con dentro roba mai guardata.



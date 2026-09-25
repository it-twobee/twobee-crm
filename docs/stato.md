# Dove siamo

## Il calendario ha orari, colleghi e assenze — §446, 2026-09-25

Giorno e Settimana sono una griglia oraria con le voci affiancate; una barra
laterale sceglie chi (io, i colleghi, tutto il team) e cosa (eventi, task,
ferie e permessi, milestone). Lo staff interno legge il titolo degli eventi dei
colleghi, i privati restano «Occupato». Ferie (9–18) e permessi (nelle loro
ore) sono impegni; l'orario di lavoro è 9–18 ovunque. Corretto l'orario dei
permessi approvati, scritto male e senza fuso. Resta la 2c: conflitti e primo
orario libero con gli invitati nel modulo evento.

## Data, stato e assegnatario dalla riga della task — §445, 2026-09-25

Il calendario della scadenza spariva appena si muoveva il mouse (il campo
esisteva solo in hover): adesso un clic apre il mini-calendario con le scelte
rapide, e resta aperto. Lo stato si cambia dal chip della riga, anche nella
scheda cliente e nelle task di progetto. Il menu della fase dei lead scorre
invece di chiudersi. Primo di quattro blocchi: seguono calendario, personale,
automazione di Economics.

## La cronologia ha un nome su fatture, milestone e workstream — §444, 2026-09-25

Diciannove scritture su tabelle con la cronologia passavano dal client di
servizio e risultavano «Sistema»: segnare pagata una fattura, cambiarne la
scadenza, eliminarla, creare o spostare una milestone o una workstream. Adesso
passano da `createActorClient(uid)`, e `lib/attribuzione.check.ts` fa
l'inventario di tutte le azioni e le route, così la prossima non sfugge.

## La Fatturazione legge il calendario della cassa — §443, 2026-09-25

Le fatture nostre senza scadenza scadono per regola (quindici giorni, §177) e
lo dicono; «scaduta» ha le tre fasce della cassa (in ritardo, scaduta, da
recuperare); il grafico si legge anche per mese di incasso. Nella tenuta di
cassa il costo del lavoro dei mesi futuri parte dai cedolini veri e aggiunge
solo chi entra o esce dall'organico — il costo da contratto da solo faceva 930 €
al mese di troppo. Nessuna migration.

## L'export dei lead e dei contatti — §441, 2026-09-25

Fase 4 e ultima del commerciale. «Esporta» scarica il lead completo (campi,
note, interazioni) o la rubrica dei contatti in Excel, CSV o PDF: le righe
selezionate, quelle filtrate o tutte. Solo super admin, founder e admin. Nessuna
migration; due dipendenze nuove, `jspdf` e `jspdf-autotable`.

## Filtri, ordine e viste che si ritrovano — §440, 2026-09-25

Fase 3 del commerciale. Ogni filtro attivo è una frase che si clicca per
cambiarla; «+ Filtro» aggiunge variabili e date (intervalli pronti o dal
calendario); Miei, Da richiamare e Fermi sono a un clic; l'ordine ha un
secondo criterio. Tutto sta nell'indirizzo, si ricorda al ricarico e si salva
con un nome, anche per il team. Migration **265 applicata** il 2026-09-25 (le viste).

## Il follow-up si fissa guardando la propria giornata — §439, 2026-09-25

Fase 2 del commerciale. «Pianifica follow-up» apre un mese e, accanto, la
propria giornata con Google, eventi del tool, altri follow-up, ferie e task:
si apre sul primo buco libero, le scorciatoie fissano giorno e ora in un clic,
e i conflitti (8–18 lun–ven, festivi, ferie, sovrapposizioni) avvisano senza
bloccare. Senza Google si pianifica lo stesso e ricorda la campanella.
Migration **264 applicata** il 2026-09-25 (il promemoria).

## La timeline del lead — §438, 2026-09-25

Nella scheda del lead c'è il diario dei contatti (chiamata con esito, email,
messaggio, meeting, nota), e ultimo contatto, tentativi e prossimo follow-up
li ricalcola il database invece di scriverli a mano. «Oggi» registra una
chiamata in un clic, con dieci secondi per correggerla; in elenco la riga dice
«Sentito ieri 09:10». Fase 1 di sette richieste sul commerciale: seguono il
selettore del follow-up con l'agenda e i conflitti, poi filtri e viste, poi
l'export. Migration **263 applicata** il 2026-09-25.

## I campi personalizzati della scheda lead — §437, 2026-09-24

Da `/impostazioni/commerciale` si aggiungono campi alla scheda del lead (nove
tipi, niente importi), ognuno nel riquadro che si sceglie, compilabili come le
altre celle. Un campo con dei valori non cambia tipo e non si elimina: si
ritira. Chiude il piano in nove fasi del commerciale. Migration **262 applicata** il
2026-09-24.

## Priorità e membership si governano — §436, 2026-09-24

Da `/impostazioni/commerciale` si aggiungono, rinominano, riordinano e ritirano
le voci di Priority e Membership, come i motivi del perso. Le chiavi restano i
valori già sui lead, cambia l'etichetta; l'ordine dell'editor è l'ordine con
cui si ordina l'elenco. Migration **261 applicata** il 2026-09-24.

## I motivi del perso si governano — §435, 2026-09-24

In `/impostazioni/commerciale` c'è l'editor dei motivi del perso: aggiungi,
rinomini, riordini, ritiri. Un motivo già usato non si elimina, perché la
chiave esterna `ON DELETE SET NULL` svuoterebbe in silenzio il motivo sui persi
che lo hanno: lo blocca l'azione, contando prima.

## Il ritorno sul foglio dei lead — §434, 2026-09-24

Il giro notturno e il bottone «Aggiorna dal foglio», dopo aver fatto entrare i
lead nuovi, scrivono sul foglio Meta cinque colonne loro (`Fase OS`, `Qualifica
OS`, `Owner OS`, `Ultimo contatto OS`, `Motivo perso OS`), e solo dove il valore
è cambiato. `STATUS` e `Note` non si toccano. Scrive un account di servizio
Google: **finché `GOOGLE_SHEETS_SA_JSON` non c'è, il ritorno è spento** e il
riepilogo lo dice. Prova a secco sul foglio vero: 38 lead abbinati su 38.

## Import dei lead da Excel — §433, 2026-09-24

«Nuovo lead → Da un file» accetta `.xlsx` oltre al CSV, lo apre nel browser e
lo passa dallo stesso percorso: riconoscimento colonne, anteprima, doppioni. Il
titolo sopra la tabella si salta da sé, la mappa delle colonne si corregge con
un menu per campo, i doppioni dicono la riga vera del file. Sul server, tetto
di duemila righe.

## I numeri leggono quello che legge l'elenco — §431, 2026-09-24

Ricerca e filtri valgono anche per «Numeri», con la riga «calcolati su N lead
di M». Si sceglie il periodo di arrivo (30 giorni, 3 mesi, un anno, da sempre)
e ci sono due tabelle nuove, per Account Owner e per qualifica. Niente valore
della pipeline: sarebbe un valore economico digitato fuori dai contratti.
Migration **260 applicata**.

## Chi vede solo i suoi lead li vede davvero solo lui — §430, 2026-09-24

Il perimetro «solo i propri» valeva nella RLS e non nella pagina, che legge
col service role: da §429 un senior abilitato avrebbe visto e modificato tutta
la pipeline. `requireDealAccess` chiude le azioni sulla singola trattativa,
`SalesPage` taglia le righe sul server. In produzione non è mai successo (le
concessioni erano tutte a manager). In più gli Account Owner si leggono e si
assegnano dalla scheda (admin e manager), e i filtri hanno Account Owner — con
«Nessuno» — e Qualifica. `sales_can_read` che non conosceva `deal_owners` lo chiude la 260 (`sales_can_read_deal`).

## Chi lavora i lead si sceglie di nuovo — §429, 2026-09-24

In `/impostazioni/commerciale`, sotto le fasi, c'è l'elenco del team con un
interruttore per `can_view_deals`: la schermata era sparita con il modulo
vecchio e l'area commerciale la vedevano solo gli admin. La colonna «Vede» dice
se è tutta la pipeline (manager) o solo le proprie trattative. L'azione passa
dallo stesso gate della pagina, `requireSalesConfig()`.

## La scheda del lead risponde prima di mostrare i campi — §428, 2026-09-23

Fase 3 del rifacimento commerciale. In cima alla scheda ci sono **la prossima
azione** (una sola, la più urgente), **cosa manca adesso** (i campi che contano
nella fase in cui sta, già compilabili) e **quello che sappiamo già** dalla
provenienza Meta — proposto, non scritto: quei dati li ha dichiarati chi ha
compilato il modulo, e un campo che si riempie da solo non lo ricontrolla
nessuno.

La scheda **segue lo scorrimento** invece di scivolare via: si apriva una riga
in cima e per rivederla bisognava risalire. `sticky` e non `fixed`, così resta
nella sua colonna e non copre l'elenco.

E si chiude un buco della Fase 1: `qualifica`, `tentativi` e `motivo_perso`
esistevano nel database dalla 258 e **non erano visibili da nessuna parte**.

## L'elenco dei lead si legge — §426, 2026-09-23

Fase 2 del rifacimento commerciale. I **persi** — un terzo dell'archivio —
escono dal mezzo dell'elenco e finiscono in un blocco chiuso in fondo, col
numero sopra: non nascosti, perché una riga che sparisce fa credere di averla
persa. La **nota** si legge in riga, appiattita su una sola linea e tagliata su
una parola. E il **chip della fase è un bottone ovunque**: elenco, cella larga,
scheda.

Il menu non è più un `select` nativo: nel menu di sistema il colore non si vede,
e il colore è metà dell'informazione di una fase. Sta in un portale perché il
contenitore dell'elenco ha `overflow-hidden` e un menu assoluto verrebbe
tagliato sulle ultime righe.

La regola dei persi guarda il **ruolo**, non la chiave: vale anche per la
seconda fase persa che qualcuno creerà dall'editor.

## L'editor delle fasi commerciali — §425, 2026-09-23

`/impostazioni/commerciale`, admin e super admin: aggiungi, rinomini, riordini,
ritiri. Chiude la Fase 1 del rifacimento.

Tre scelte che vale la pena ricordare. **Si salva tutto insieme**, perché
l'elenco è una forma e non otto righe indipendenti — «una sola fase vinta» non è
una proprietà di una riga, e salvandone una alla volta si passerebbe da stati
che non stanno in piedi. **I problemi si vedono mentre scrivi**, con la stessa
funzione che controlla il server e che verifica il gate: tre copie della stessa
regola sono tre regole diverse. **Si sposta con due bottoni**, non trascinando:
il trascinamento HTML5 sul dito non esiste.

Una fase con delle trattative sopra **non si elimina**: si ritira. La differenza
è che ritirata resta leggibile sulle righe vecchie e sparisce dalle scelte
nuove, mentre eliminarla lascerebbe righe che puntano a niente — e il vincolo lo
impedisce comunque, ma con un messaggio da database. Qui si contano prima e si
dice quante sono.

Rinominare la chiave è permesso perché la chiave esterna è `ON UPDATE CASCADE`:
le righe seguono. È l'unica ragione per cui si può lasciar cambiare invece di
congelarla per sempre.

## Le fasi commerciali diventano dati — §424, 2026-09-23

Fase 1 del rifacimento dell'area commerciale. Notion si spegne: cade la regola
che teneva dodici fasi trascritte lettera per lettera (§367), il percorso si
accorcia a **otto stati veri** e l'elenco passa dal codice a una tabella che si
governa dalle impostazioni.

**Ogni fase dichiara il suo ruolo**, ed è la ragione per cui la configurabilità
non diventa una trappola: `active_client` stava scritto dentro la conversione a
cliente, dentro tre controlli di igiene e dentro il tasso di conversione, e il
giorno in cui qualcuno la rinomina quei confronti smettono di combaciare **in
silenzio**. Adesso il codice chiede il ruolo — `vinto`, `perso`, `nuovo` — e
rinominare una fase non rompe niente.

**Due cose escono dalla pipeline e diventano campi della riga**: la qualifica
(in target / non in target / da valutare), che è un giudizio e non un punto del
percorso, e i **tentativi**, perché «chiamata senza risposta» come fase fa
rimbalzare un lead avanti e indietro facendo perdere dov'era davvero. Si vede
sui dati: due dei sette STATUS del foglio non erano fasi, erano qualifiche.

**Il gate ha cambiato mestiere.** Non verifica più *quali* fasi esistono — le
decide un amministratore mentre il tool gira — ma le regole che valgono su
qualunque elenco, ed è la stessa funzione che l'editor chiamerà prima di
salvare: una sola porta d'ingresso, una sola vinta, almeno una persa, nessuna
coppia adiacente dello stesso colore.

Migration **258 applicata**. Manca l'editor delle fasi, che chiude la Fase 1.

## Chi ha creato una cartella si può eliminare — §422, 2026-09-23

La 256 aveva reso slegabili i file e i movimenti del portale e aveva lasciato
fuori, dichiarandolo, le cartelle dell'area cliente. Bastava una cartella vuota
creata da una persona perché quell'account non si eliminasse più.

Migration **259** (applicata): la cartella resta, l'autore si slega. La
guardia accetta questa sola modifica, e rifiuta il resto come prima.

## Zip: si scarica una cartella, e uno zip caricato si apre — §421, 2026-09-23

- Si scarica come zip una cartella, tutto lo spazio o una selezione. Lo zip esce
  mentre si scrive, con la dimensione annunciata e i nomi che si creano anche su
  Windows.
- Uno zip caricato si apre sempre, nel browser, e diventa una cartella col suo
  nome. Ogni file passa dalla stessa rotta di caricamento; `__MACOSX` ed
  eseguibili restano fuori, e lo spazio si controlla prima di cominciare.
- Rar e 7z si accettano (dall'estensione) e restano file.

Vale anche per il portale del cliente. Nessuna migration.

## Le due guardie che non conoscevano la cancellazione — §420, 2026-09-23

La 256 non bastava: eliminare un membro continuava a fallire, e in faccia
arrivava «An error occurred in the Server Components render» — cioè niente.

Due cause, tutte e due trovate solo provandoci davvero, perché i trigger
colpevoli nascono dentro un `DO ... EXECUTE format(...)` e cercarli nel
repository non li trova. **`portal_immutable`** rifiuta ogni UPDATE su
`portal_events`, e `ON DELETE SET NULL` è un UPDATE: svuotare `actor_id` era
vietato. **`portal_log_event`** pretende `x-actor-id`, e la server action
scriveva col service role nudo — la regola di `docs/cronologia.md` non era stata
applicata a quell'azione.

Migration **257** per la prima, `createActorClient` per la seconda. E una terza
cosa che non c'entra col portale ma è la ragione per cui ci sono volute due
prove: l'azione adesso **risponde invece di lanciare**. In produzione Next
maschera il messaggio di un throw da server action, quindi la causa vera
finiva nei log del server e all'utente arrivava una frase che non dice niente.

## Un account si elimina davvero, il file del cliente resta — §419, 2026-09-23

Scelta del committente, e cambia una regola scritta a §362: **eliminare un
membro lo fanno admin e super admin**, non più il solo super admin. La ragione
di prima era buona — cancellare non si disfa — ma reggeva finché il super admin
era l'unico a fare pulizia, e con gli account di prova che si accumulano era
diventata un collo di bottiglia. Resta la parte che conta: un **ruolo
amministrativo** lo elimina solo un super admin, perché lì la cancellazione è
anche una perdita di governo.

E si accetta il prezzo: quello che una persona ha caricato nell'area di un
cliente **resta dov'è**, con l'autore slegato. Il nome non si perde —
`uploaded_by_name` è scritto accanto all'id dal giorno del caricamento — e la
lista lo mostra con «non più nel sistema»: senza quell'avvertenza chi legge
cercherebbe in rubrica una persona che non c'è più.

Migration **256**: `portal_materials.uploaded_by` e `portal_events.actor_id`
diventano slegabili. La guardia del materiale impara l'unica modifica che non
arriva da una persona — l'autore che diventa NULL, e nient'altro nella riga.
Le altre colonne del portale hanno guardie proprie e restano per una seconda
passata: la verifica della migration le elenca.

E le due migration numerate **254** erano due davvero: la mia è diventata
**255**, quella dell'area file era su `main` per prima.

## Eliminare un membro non era un vicolo cieco per caso — §418, 2026-09-23

La finestra di eliminazione spiegava perché la porta è chiusa e offriva un
bottone solo: «Annulla». L'azione giusta — disattivare — stava **scritta nel
testo** e non si poteva fare da lì.

Sotto c'erano due cose diverse. Una è un difetto vero: `tasks.assignee_id`
puntava a `profiles` senza clausola di cancellazione, quindi `NO ACTION`, quindi
una sola task in carico — anche completata, anche assegnata per sbaglio a un
account del portale (§409) — bloccava per sempre l'eliminazione. Migration
**255**: `SET NULL`, come le altre colonne di attribuzione dello stesso schema.
La task resta e torna libera.

L'altra non è un difetto: i file caricati nell'area di un cliente e i movimenti
del portale **non devono sparire** perché cancelliamo un account. Quelli si
tolgono dal posto in cui stanno, non da una finestra delle impostazioni, e
adesso la finestra lo dice invece di limitarsi a rifiutare.

In più le tracce si leggono: «1 task assegnata», «1 file caricato nell'area di
un cliente» al posto di «1 in tasks», «1 in portal_materials»
(`lib/tracce-membro.ts`). Una tabella che non conosciamo esce col **nome vero** e
non con una parola rassicurante: travestirla da «altri dati» è il modo migliore
per far cancellare a qualcuno una cosa che non ha capito.

## «Da quanto non c'è» aveva una risposta, in un'altra tabella — §417, 2026-09-23

Il primo giorno la vista sull'utilizzo mostrava cinque righe su otto senza
niente: nessuna sessione, nessun tempo, nessuna interazione. Era vero — la misura
era accesa da tre ore — ma una vista che risponde «non lo so» sette volte non
risponde.

`auth.users.last_sign_in_at` c'era da sempre: Annalisa 46 giorni, Gabriele 46,
Sabrina 8, Michele 2, Toto 75. Adesso sta sotto lo stato, come seconda riga, e
la tabella non sparisce più quando le sessioni sono zero.

Con un'avvertenza che è metà del lavoro: **l'accesso non è l'utilizzo**. Una
sessione si rinnova da sola, quindi Agostino ha l'ultimo login il 10 luglio e le
interazioni di oggi. L'etichetta dice «accesso» e il blocco «Come si conta» lo
scrive, perché la versione comoda di quella riga — «ultimo utilizzo» — avrebbe
dato per sparito da due mesi e mezzo qualcuno che stava lavorando.

## Anteprime: il PDF si vede — §415, 2026-09-23

- Il PDF si apre nell'anteprima, disegnato da pdf.js dai byte, e la risposta
  resta in sandbox.
- La miniatura di un PDF è la sua prima pagina.
- Testo e CSV (con il `;` italiano) si leggono per il primo mega.
- Nell'anteprima si scorre fra i file con le frecce, e le immagini si guardano
  anche a grandezza reale.

Vale anche per il portale del cliente. Fuori, dichiarati: Office, fotogrammi dei
video (manca `ffmpeg`), HEIC. Nessuna migration.

## L'area file si organizza — §413, 2026-09-23

Nell'esploratore si può mettere in ordine:
- cartelle nuove, anche vuote;
- file e cartelle trascinati su una cartella o su una tappa del breadcrumb, o
  spostati con «Sposta in…»;
- selezione multipla per spostare, archiviare ed eliminare;
- rinomina di file (il nome, non il tipo) e di cartelle;
- archiviazione di una cartella intera, ed eliminazione solo se è vuota.

Nello spazio del cliente non si carica, ma si mette in ordine: le sue cartelle
le vede anche lui.

**Migration 254 applicata** il 2026-09-23, senza la sezione 3 perché la 256 era
già arrivata (dettaglio in `docs/migrations.md`). Senza la 254 l'area
funzionerebbe come prima, solo senza le voci per organizzare.

## L'area file è un esploratore — §416, 2026-09-23

La scheda File di ogni cliente, e Documenti, non mostrano più due elenchi uno
sopra l'altro. C'è un esploratore:
- i due spazi («Nostri», «Dal cliente») e il breadcrumb della cartella
  corrente, che sta nell'indirizzo;
- elenco o griglia, l'ordine per data, nome o dimensione, e la vista «Recenti»
  con tutti i file dall'ultimo arrivato;
- la ricerca per nome di file e cartelle in tutti e due gli spazi;
- gli archiviati a richiesta;
- il drag and drop di file e cartelle dal computer: finiscono nella cartella
  che si guarda, o in quella su cui li si lascia;
- tre caricamenti in parallelo, con un totale e il bottone Annulla.

Nessuna migration. Spostare, rinominare e creare cartelle vuote arrivano col
passo dopo, che tocca il trigger della 251.

Dettaglio in `docs/storage-access.md`. Prova nel browser vero:
`scripts/check-area-file-browser.mjs`.

## L'area file ha una porta sola, e chiude — §414, 2026-09-23

Questo è il primo passo per togliere di mezzo il Google Drive interno. L'area
file di ogni cliente deve diventare un esploratore vero: cartelle, spostamenti,
zip, link e note. Prima di costruirci sopra si è guardato il terreno. Nessuna
migration.

- `/api/files/**` non tocca più `materiali`. Dalle API generiche una DELETE
  toglieva i byte e lasciava il materiale vivo; il download li serviva a chi la
  RLS esclude.
- Tutte le rotte `/api/area-cliente/**` passano da `requireMaterialAccess` e
  `requireMaterialRow`. La PATCH non guardava l'azienda: un file di un'azienda
  nascosta al workspace restava archiviabile.
- L'area la vede chi la vede il database (`PORTAL_STAFF_ROLES`, copia di
  `portal_is_staff`). Viewer, freelance e partner vedevano un'area vuota che
  diceva «nessuno ancora»: adesso ricevono una frase.
- Il DELETE del portale stacca il file con l'autore. Senza, la cronologia
  rifiutava il `SET NULL` e il metadato restava con i byte già spariti.
- Letture a pagine (elenco e quota) e scheda File che si ricarica dopo ogni
  modifica.

Dettaglio in `docs/storage-access.md`.

## La cronologia era cieca sulle task — §412, 2026-09-23

La vista sull'utilizzo diceva «0 modifiche» per quasi tutti, e non era un
difetto della vista. `activity_log` **non riceveva una riga da `tasks` dal 20
luglio 2026**: la 144 ha droppato il dominio progetti con `CASCADE` — che porta
via anche i trigger — e la 147 l'ha ricostruito rimettendo solo quelli di
`updated_at`. Stessa storia per `projects` e `invoices`. Nel frattempo le task
si muovevano: 149 toccate negli ultimi trenta giorni, 45 chiuse.

Nessuno se n'è accorto per due mesi perché una cronologia che si svuota non dà
errore: dà una pagina vuota, che somiglia a una giornata tranquilla.

Migration **253** (applicata): i trigger tornano su tutte le tabelle con
cronologia che esistono davvero, `milestones` e `project_workstreams` comprese.
Il passato non si ricostruisce, quindi la vista **dichiara** la finestra
parziale e scrive `n/d` dove il conteggio non ha sotto una fonte — mai uno zero.
Nella stessa passata: chi non ha sessioni non è più «mai entrato» ma «nessuna
sessione», e le interazioni non sono più gonfiate dalla rotella (una sessione di
cinque minuti ne segnava 599).

## Chi usa il tool, misurato sulle interazioni — §410, 2026-09-23

`/impostazioni/utilizzo`, solo super admin: chi è collegato adesso, da quanto
non entra chi non c'è, quanto tempo ha passato dentro nelle ultime cinque
sessioni e quante righe ha toccato nella finestra.

La scelta che regge tutto il resto: **non si misura la sessione, si misurano le
interazioni**. Una scheda aperta non è una persona al lavoro — un tab
dimenticato la mattina direbbe «online» fino a sera — quindi il browser manda un
battito solo se nel minuto passato ha contato un click, un tasto, una rotellata
o un cambio di pagina, e solo a scheda in primo piano. Due ore di tool aperto con
dieci minuti di lavoro dentro valgono dieci minuti.

Accanto al tempo c'è il lavoro lasciato sui dati (`activity_log`), perché sono
due domande diverse e il confronto è l'informazione: si può stare due ore dentro
senza cambiare una riga, e cambiarne dieci in cinque minuti.

Migration **252 applicata**. Il portale cliente resta fuori di proposito (il
battito non è montato lì) e la pagina lo dichiara, invece di mostrare «mai
entrato» su gente che nessuno sta misurando. La misura parte da oggi: prima non
c'è un silenzio, non ci sono dati. Effetto collaterale voluto:
`profiles.last_seen_at`, aggiunta dalla 009 e mai scritta da nessuno, adesso ha
un valore vero. Dettaglio in `docs/presenza.md`.

## Un referente del cliente non assegna il nostro lavoro — §409, 2026-09-22

Un manager si è creato un accesso al portale di un cliente col proprio nome,
per provare l'area file. Da quel momento «Michele Cristallo **guest**» compariva
fra le persone a cui assegnare milestone e task — **su qualunque progetto, anche
di aziende diverse**.

Due difetti, e il secondo peggiore del primo.

Le sei pagine dei progetti caricavano *ogni* profilo attivo senza guardare il
ruolo, e quattro non chiedevano nemmeno `app_role`: l'interfaccia non avrebbe
potuto filtrare neanche volendo. E dove un filtro c'era — il composer delle
task — guardava `CLIENT_ROLES`, che è solo `client`, mentre un invito al portale
crea un profilo **guest/guest** (trigger della 224). Chi l'ha scritto ha pensato
«cliente» e ha coperto metà dei modi in cui un cliente esiste.

La regola adesso è una sola e sta in `lib/permissions.ts`: un account del
portale non è un assegnatario del nostro lavoro, mai — nemmeno sui progetti
della sua azienda. Una milestone è roba nostra; se serve qualcosa dal cliente la
strada è la **task al cliente**, che sceglie già fra i referenti di
quell'azienda e gli arriva nel portale come attività. Il filtro sta **nella
query** (`role IN ('admin','team')`, la stessa definizione che legge la RLS),
così i profili del portale non arrivano nemmeno al browser.

I collaboratori esterni restano assegnabili: sono `freelance` e `partner`, il
cui ruolo grossolano è `team`. Nel manuale c'è scritto che i `guest` possono
essere risorse esterne con un portale `/risorsa/**`: **quel portale non esiste
nel codice** — nessuna rotta, nessuna riga nel middleware — quindi oggi nessun
guest lavora per noi. Un'altra riga di manuale che descrive codice assente.

Il check di `lib/permissions.check.ts` prova la regola e tiene l'inventario
delle sei sorgenti. Non previene una **settima** pagina che se ne dimentichi —
quello non si vede a macchina — ma se qualcuno toglie il filtro da una di
queste, se ne accorge il gate invece di un cliente.

## `/api/version` dice di nuovo quale commit gira — §407, 2026-09-22

L'endpoint esiste per rispondere a «l'ultimo push è arrivato?», e rispondeva
`sha: ""`. La causa: `.dockerignore` esclude `.git`, quindi nel container non
c'è niente da interrogare e `next.config.mjs` può solo ricevere lo SHA dal
build — ma il `Dockerfile` non dichiarava nessun `ARG` per farselo passare.
Coolify poteva anche esporlo: non c'era la presa.

Adesso il builder dichiara `ARG COOLIFY_GIT_COMMIT` e `ARG SOURCE_COMMIT` —
due nomi perché Coolify usa l'uno o l'altro a seconda della versione — e la
nota dell'endpoint, quando lo SHA manca, dice **cosa impostare** invece di
limitarsi a dire che manca.

Verificato con un build Docker isolato che riproduce la catena di
`next.config.mjs`: senza build arg lo SHA resta vuoto, con `COOLIFY_GIT_COMMIT`
o con `SOURCE_COMMIT` arriva. **Resta da fare una cosa a mano**: marcare la
variabile come Build Variable nell'applicazione su Coolify. Finché non è fatta,
l'endpoint continua a rispondere vuoto — con la nota che adesso spiega perché.

Il perché è arrivato dal vivo: il deploy di `b8c800c` è fallito e quello dopo è
passato, e per sapere quale codice stesse girando è servito incrociare
`builtAt` con gli orari dei deploy. Con tre sessioni che spingono su `main` è
una domanda che si fa ogni giorno.

## Il numero del paragrafo si prende alla fine — §406, 2026-09-22

Su `main` spingono tre sessioni in parallelo, su sezioni diverse. Ognuna sceglie
il prossimo `§NNN` leggendo il repository, e nessuna vede il lavoro non ancora
spinto delle altre: in una giornata sono uscite **sei collisioni**, tutte
scoperte al push, tutte rinumerate a mano.

La regola che costa meno è non prendere il numero all'inizio: si scrive il
codice, e un attimo prima del commit si lancia `npm run paragrafo`, che fa il
fetch e guarda `origin/main`, i titoli dei commit e il lavoro locale non ancora
spinto. `npm run paragrafo 406` dice se quel numero è ancora libero ed esce 1 se
non lo è. La finestra di collisione passa da tutta la lavorazione a trenta
secondi.

**Nessun check**, ed è una scelta: 52 `§` sono citati nel codice e in nessun
documento, quindi una regola tipo «ogni § deve avere una sua riga nei doc»
nascerebbe rossa su roba preesistente — e un gate che nasce rosso è un gate che
qualcuno spegne. La collisione non si può nemmeno riconoscere a macchina dal
numero soltanto: riusare un `§` per correggere la stessa cosa è legittimo, ed è
il caso del `§393` che compare due volte su main — una funzione e la sua
correzione, non un doppione.

## Lo spazio file c'è prima del portale — §403, 2026-09-22

Nella scheda di ogni cliente compare la scheda **File**. C'è dal primo giorno,
per ogni anagrafica, senza dover prima invitare un referente: il mezzo spazio
nostro non è mai dipeso dal portale — la guard di scrittura non ha mai chiesto
una membership — ma non c'era un posto nella scheda cliente da cui usarlo, e la
sezione Documenti mostrava un'azienda solo se aveva già dei file. Sembrava
spento, ed era invisibile.

Quello del cliente si accende con l'invito, e finché non succede il gruppo
«Caricati dal cliente» lo dice con una frase e un link alla scheda Portale
cliente, invece di restare un riquadro vuoto.

L'area è **lo stesso componente** nei due posti: la stessa domanda non può avere
due risposte a seconda della pagina da cui ci si arriva. Nessuna migration.
TypeScript senza errori, **87 check**, prove dell'azione con Supabase simulato
(account cliente rifiutato, azienda nascosta esclusa, `viewer` che guarda e non
carica, portale spento e acceso) e browser con **290 richieste al mock e zero
scritture**.

## Miniature nell'elenco — §401, 2026-09-22

L'anteprima a richiesta (§399) risolveva il problema sbagliato: fra venti
immagini non si clicca una alla volta. Adesso le immagini si vedono
**nell'elenco**, al posto dell'icona, in Documenti e nel portale.

Non è il file rimpicciolito dal CSS: una webp da 320 px generata con `sharp` e
lasciata accanto all'originale su MinIO, così la seconda visita la trova già
fatta e il ritiro del file se la porta via. Autorizzazione identica al download,
cioè la RLS. `Cache-Control: private, max-age=300`: abbastanza per scorrere,
abbastanza poco perché una revoca si senta.

`sharp` è una dipendenza nuova, ed è **un di più**: modulo nativo, in produzione
si gira su musl, quindi se il binario non carica la rotta risponde 404 e
l'elenco torna alle icone. Una miniatura assente non è un guasto. I video non
hanno ancora un fotogramma di copertina: servirebbe `ffmpeg`, che non c'è.

TypeScript senza errori, **87 check** — quello delle rotte usa sharp vero e
verifica che da un PNG esca davvero una webp più piccola — e browser con **290
richieste al mock e zero scritture**.

## Anteprima dei file e file di progetto — §399, 2026-09-22

Immagini, video e audio si guardano dall'area cliente senza scaricarli, in
Documenti e nel portale: l'anteprima usa la stessa porta autenticata del
download, che li serve `inline` e risponde al Range — nessun indirizzo pubblico,
e il video si fa scorrere.

Provando è venuto fuori che l'elenco dei tipi ammessi era più stretto del
mestiere: un `.afdesign` non si caricava affatto, e un `.psd` passava
spacciandosi per immagine — l'anteprima gli avrebbe disegnato sopra un
rettangolo rotto. Adesso i file di progetto si riconoscono dall'estensione e
contano come documenti, e l'elenco di ciò che si anteprima è chiuso e corto:
fuori da lì il bottone non compare. Il PDF resta senza anteprima apposta,
perché la risposta è sandboxata e quell'header non si toglie per una comodità.

Nessuna migration: il tipo dei file di progetto è `documento`, che è quello che
sono per noi. TypeScript senza errori, **87 check**, browser con **289 richieste
al mock e zero scritture**, inclusa l'anteprima che prende i byte dalla porta
autenticata e si chiude con Esc.

## Area file dei clienti — §398, 2026-09-22

Lo spazio del cliente (§397) era metà del lavoro. Adesso l'area file di
un'azienda è **una sola**, con due gruppi dichiarati: **Caricati dal cliente** e
**Nostri**, che lui non vede. Il confine è `portal_materials.source` dentro la
policy di lettura del cliente — una riga, nel posto in cui non si può
dimenticare, non un filtro sparso nelle pagine.

Si caricano **cartelle intere**: il browser consegna ogni file con il suo
percorso relativo, quel percorso si salva accanto al file e l'albero si
ricostruisce da lì. Niente tabella delle cartelle da tenere integra. Il prezzo,
dichiarato: una cartella vuota non esiste.

La sezione **Documenti** smette di essere una finestra su una tabella che
nessuno poteva riempire — non esisteva una sola scrittura su `documents` in
tutto il codice, e lo stato vuoto mandava a cercare una porta inesistente nella
scheda cliente. Adesso il filtro in alto sceglie l'azienda e sotto ci sono i tre
gruppi: i suoi file, i nostri e i link Drive. Da lì si carica, si archivia e si
elimina.

**Archiviare toglie dai nostri elenchi, non dai suoi**: il cliente continua a
vedere quello che ha caricato. Eliminare è irreversibile — un file del cliente
lo elimina solo un amministratore, uno nostro chi l'ha caricato.

Corretto un difetto preesistente: la tendina dei clienti passava da
`clients_workspace`, la query dei documenti no. Un documento di un'azienda
nascosta sarebbe comparso nell'albero col nome dell'azienda sopra.

**Migration 251 applicata in produzione**, versione `20260922113154`: quattro
colonne nuove, le due policy al loro posto, zero colonne riservate esposte, e
l'espressione di `portal_material_read` che contiene davvero `source` — il
confine è nel database. Verificato anche che `documents` in produzione ha **0
righe**: la sezione Documenti non mostrava niente perché non c'era niente, e
perché non esisteva un modo di metterci qualcosa. TypeScript senza errori, **87 check**, prove delle rotte con Supabase e storage simulati, suite
SQL 244→251 due volte su PostgreSQL 16 effimero, browser con **288 richieste al
mock e zero scritture**.

## Portale cliente — lo spazio file del cliente (§397), 2026-09-22

Fin qui il portale leggeva soltanto. Adesso il cliente ha **il suo spazio**:
`/portale/file`, voce «I tuoi file». Carica immagini, video, audio e documenti
fino a **1 GB** l'uno, li riscarica quando vuole, e li rimuove se ha sbagliato.
Lo spazio è **dell'azienda**: lo vedono tutti i suoi referenti nel limite dei
progetti a cui sono abilitati, e il team. Carica chi partecipa — il lettore
consulta e basta — e l'anteprima interna non scrive.

Su richiesta del committente è stato valutato Google Drive al posto di S3. Due
fatti hanno deciso: **S3 non era da configurare** (MinIO gira da mesi, le
variabili sono in produzione, le consegne della §395 ci scrivono già), e nel
repository Drive non è uno storage ma un convertitore di link — usarlo avrebbe
richiesto service account, Drive condiviso e scope nuovi, cioè più
configurazione, e un link di condivisione **sopravvive alla revoca**, che è ciò
che la 246 vieta. Drive resta per i documenti che il cliente tiene suoi, come
link. Dettagli e misure in `docs/portale-cliente.md`.

Un giga non passa da `formData()`: il corpo della richiesta è il file grezzo e
`putObjectStream` lo manda a pezzi mentre arriva, annullando l'upload al primo
byte di troppo. In discesa arriva il **Range**, che mancava anche alle consegne:
senza, un video si scarica tutto e non si può far scorrere.

**Migration 250 applicata in produzione**, versione `20260922093617`: tabella,
2 policy, 3 trigger, **zero colonne riservate esposte** e nessun privilegio di
tabella ad `authenticated`; 0 materiali e 0 file. Al momento dell'applicazione
gli accessi portale attivi erano **0** — lo spazio c'è e non lo apre ancora
nessuno, perché invitare resta un gesto esplicito. Verificata anche due volte su
PostgreSQL 16 isolato con
`supabase/tests/250_portal_materials.check.sql`, insieme a 244/245/246/249.
TypeScript senza errori, **87 check**, prove delle rotte con Supabase e storage
simulati, suite browser con **287 richieste al mock e zero scritture**.

## Portale cliente — pubblicazione dei contenuti (step 2), 2026-09-22

Il portale aveva schema, RLS e pagine, e **nessuna riga di codice che ci
scrivesse dentro**: i contenuti si popolavano solo a mano col service role.
Adesso la scheda del progetto ha la tab **Portale**: pubblica e ritira il
progetto, tiene i campi condivisi (titolo, obiettivo, perimetro, aggiornamento,
prossimo passo, referente, data prevista o confermata, momento della relazione)
e mostra **l'anteprima con i componenti veri** del portale, non una loro imitazione.

Le **task «al cliente»** diventano le attività del portale senza reinserirle:
`portal_activities.source_task_id` le collega, e un trigger propaga titolo,
perché, scadenza e stato. Eliminare la task ritira l'attività. Una task al
cliente non può avere un progetto (vincolo della 158), quindi l'attività vive
sull'**azienda**: la vede solo chi ha l'accesso a tutta l'azienda.

Le **consegne** si caricano dentro il progetto (cartella storage `deliverables`,
sempre legata a un progetto), diventano una versione immutabile con autore e
data, e si pubblicano una per volta. Il cliente le scarica da
`/api/portale/consegne/:id`: l'autorizzazione **è** la RLS, `storage_key` non è
fra le colonne concesse al browser e il service role arriva solo dopo. Una
versione pubblicata non si corregge: si ritira, o se ne pubblica una nuova.

**Migration 249 applicata in produzione**, versione `20260922084609` (il file
era numerato 247: rinumerato dopo l'applicazione perché main aveva preso 247 e
248 — `docs/migrations.md`), dopo
aver riletto i prerequisiti sul database reale: 244, 246 e 108 presenti, 247
assente, e **0 attività, 0 versioni, 0 progetti pubblicati, 0 task al cliente**.
È additiva e non ha pubblicato niente: i conteggi sono rimasti a zero, nessun
dato di prova creato, e ad `authenticated` non è concessa nessuna scrittura né
la lettura di `storage_key`. Il **codice va rilasciato insieme**: senza, il
database ha le colonne e nessuno le scrive. Verificata anche due volte su
PostgreSQL 16 isolato con `supabase/tests/249_portal_publishing.check.sql`,
insieme alle 244/245/246. TypeScript senza errori, **81 check**, prove delle action e della
rotta di download con Supabase simulato, suite browser con **258 richieste al
mock e zero scritture**, inclusi download, versioni precedenti, attività
d'azienda e isolamento fra due aziende con utenti distinti. Dettagli in
`docs/portale-cliente.md`, `docs/migrations.md` e `docs/storage-access.md`.

## Portale cliente — rilascio step 1 file isolati, 2026-09-21

Chiuse nel codice le API degli allegati interni a clienti, ospiti e account
disattivati. Letture tramite RLS, contesto/parent verificati prima di upload,
nomi delle cartelle sensibili protetti e DELETE ricorsivo con controllo dei
proprietari. I file cliente/progetto non producono link anonimi; i vecchi token
privati non vengono più accettati. Rinnovo/revoca delle condivisioni ammisse
sono atomici. **Migration 246 applicata**, versione `20260921150329`; codice
distribuito tramite il push di questo intervento. Riletti grant/policy/trigger
e verificate le letture RLS in produzione, senza scrivere fixture. Conteggi
invariati: 4 file, 1 cartella, 0 link pubblici. TypeScript, **80 check**, prove
API e PostgreSQL isolato superati. Il prossimo step è la
pubblicazione dal lavoro interno al portale. Dettagli: `docs/storage-access.md`.

## Accessi cliente — rilascio e migration applicate, 2026-09-21

Nuova tab **Portale cliente** nella scheda cliente, dopo Tracking/Report/Chiavi/
Accessi. Compare automaticamente per i clienti effettivi creati manualmente o
dal commerciale e per quelli già presenti. Manager e amministrativi gestiscono
inviti personali, link stabile, ruoli, scope progetti, revoca/riattivazione e
link per reimpostare la password. Il cliente sceglie la propria password;
nessuna password del cliente è conservata o mostrata al team.

Ritirato il generatore di URL `/ticket-portal/...` senza pagina: il Customer
Care porta alla scheda cliente; i vecchi URL hanno una pagina esplicativa.
**Migration 244 e 245 applicate in produzione**, versioni `20260921133528` e
`20260921133529`; codice distribuito tramite il push di questo intervento.
Riletti schema, permessi e prerequisiti; aggiunta dalla 244 la colonna
`documents.project_id` che il reset aveva eliminato. Verificate in sola lettura
le aziende visibili al manager e l'isolamento senza membership. Nessun accesso,
progetto pubblicato, account o ruolo creato/modificato implicitamente. Auth:
redirect produzione già autorizzato e link personali con scadenza di un'ora.
TypeScript senza errori e **79 check** superati. Test action, browser e suite
SQL eseguiti con confini simulati/PostgreSQL isolato, senza account o scritture
di prova in produzione. Dettagli e comandi
in `docs/portale-cliente.md` e `docs/migrations.md`.

## Portale cliente — integrazione in main, 2026-09-21

Integrato **`feat/portale-cliente`** (`bbcba7f`) sul main aggiornato a
**9c3789b**, per il deploy automatico Coolify. `/portale` offre Home, Progetti,
Da fare e Richieste in consultazione; anteprima per manager e amministrativi,
accesso dal selettore portali e dal Customer Care. Invio richieste, upload,
approvazioni e azioni operative della coda restano al secondo incremento.

Migration portale rinumerata **244**, perché 239–243 sono già occupate:
**non applicata**, il primo incremento gestisce lo schema assente con letture
legacy limitate. Verificati sul merge: TypeScript senza errori, **78 check**
con exit 0 (`TZ=Europe/Rome`) e suite browser isolata con **182 richieste al
mock, zero scritture**, inclusi ruoli, revoca, URL alterati e i due temi.
Dettagli e limiti in `docs/portale-cliente.md`.

## Commerciale — foglio attivo, follow-up integrati in main, 2026-09-21

Attivato il foglio Meta su Coolify: variabili runtime e task giornaliero alle
03:00 (fuso scheduler), riavvio del `main` **eaeb732** completato. Primo import
reale: 3 nuovi + 28 già presenti; secondo import: 0 nuovi + 31 già presenti.
Tre righe di test scartate in entrambi. Prima esecuzione notturna da osservare.

Integrato **`feat/commerciale-calendar`** nel main aggiornato a **7d3093a**:
follow-up dalla scheda commerciale
al calendario personale, invito al contatto facoltativo, retry senza duplicati,
modifica/annullamento con controllo revisioni Google, guard commerciale e RLS
del lead, collegamento privato sull'evento. Nessuna migration. Verificati
TypeScript, 76 check (calendario lavorativo con `TZ=Europe/Rome`), route/OAuth
simulati e browser nei due temi, mobile e tastiera.

**Calendario non ancora attivabile in produzione**: mancano le credenziali
OAuth `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` su Coolify; dopo il deploy del
main integrato serve il consenso del titolare. Il portale cliente è ora
integrato come descritto sopra. Dettagli e comandi in `docs/commerciale.md`.

## Progetti — il calendario si scorre e si apre, 2026-09-16

Il calendario milestone ha una **barra di navigazione orizzontale** sotto la
griglia (cursore proporzionale, frecce, clic sulla pista, ←/→ e Home/Fine da
tastiera), visibile solo quando c'è qualcosa oltre il bordo. La sua matematica
sta in `lib/gantt-scroll.ts` con 22 controlli: la prima versione scorreva più in
fretta del dito col cursore alla larghezza minima, e la posizione passava dallo
stato React — cioè ridisegnava il calendario a ogni frame. **Tutta la riga della corsia
è cliccabile** (non il solo nome, che su un nome corto sono quaranta pixel):
cliente e progetto in `/progetti`, workstream nella scheda progetto; dal
workspace il link resta nel workspace (§234). Il recap in hover della milestone
è diventato usabile: il titolo apre la milestone, la riga del contesto apre il
progetto o la workstream. E il calendario **non torna più su oggi da solo**: due
prop di default che creavano un array nuovo a ogni render facevano ripartire
l'effetto di posizionamento a ogni ridisegno — passare col mouse su una
bandierina rispediva indietro chi stava guardando le tappe lontane. Nessuna
migration.
Dettagli in `docs/operativita.md` (§345).

## Compensi — il foglio si chiede, 2026-09-16

`/api/compensi` non risponde più «Permesso negato» a chi non ha accesso: mostra
un modulo con **nome e cognome obbligatori**, la richiesta arriva nella
campanella di tutti gli admin e si approva o si rifiuta dal riquadro «Richieste
di accesso al foglio», in testa a «Erogato soci». Il sì vale **solo per il mese
chiesto** e **scade dopo quindici giorni**; la revoca è immediata, il rifiuto non
riapre il modulo. Chi ha `canSeeEconomics` non vede nessun cambiamento.

Migration **226 applicata** (verificata il 2026-09-25; `report_access_requests`, deny-all). Prima
di applicarla la porta mostrava il modulo e l'invio diceva che non era stato possibile —
nessun 500. Verifiche: TypeScript, 54 check, gate delle action, e le quattro
facce della porta provate in locale (modulo, nomi rifiutati, errore d'invio).
Il collaudo autenticato in produzione resta agli utenti. Dettagli in
`docs/economics-compensi.md` (§344) e `docs/migrations.md`.

## Commerciale — acquisizione automatica e fonti guidate, 2026-09-15

La vittoria acquisisce subito il lead come cliente, senza aspettare la delivery
e senza creare contratti, fatture o MRR. Riusa l'anagrafica; per le opportunità
precedenti prive di collegamento consente la scelta di un cliente esistente o
la creazione del bundle, senza unire automaticamente nomi uguali. La proposta
accettata si può indicare nell'esito. Fonte a menu con le otto opzioni richieste
e conservazione dei valori storici. Migrazione **225 applicata**
(`20260915142808`), nessun dato aziendale preesistente modificato.

Verifiche: TypeScript, 53 check, test action, suite SQL 223/225 e browser locale
con dati simulati (fonti, vittoria, collegamento anagrafica, mobile nei due temi).
Il collaudo autenticato in produzione resta agli utenti. Dettagli in
`docs/commerciale.md` e `docs/migrations.md`.

## Verifica database — 2026-09-15

MCP Supabase operativo in lettura/scrittura sul progetto `ujkrrryitfqboskdqhwf`.
Gli effetti della **221 erano già presenti** (trigger e policy verificati),
nonostante il registro migration vuoto; non è stata rieseguita. Applicate
**224** (ruoli iniziali guest, blocco delle modifiche amministrative dal browser)
e **223** (commerciale). Test SQL passati su PostgreSQL isolato con struttura
reale e dati fittizi annullati; verifiche remote di schema, RLS e RPC superate.
Nessun ruolo o dato aziendale esistente modificato. Dettagli in `docs/migrations.md`.

`deals` e `deal_activities` erano assenti: la 223 le ha ripristinate insieme
allo storico, senza rilanciare le vecchie migration dei domini demoliti.

## Commerciale — primo rilascio del 2026-09-15

Prima versione di `/commerciale` e `/workspace/commerciale`: Oggi, pipeline,
esiti e follow-up, referenti, storico, stime separate e passaggio guidato alla
delivery. Riuso di anagrafiche e motore progetti; grant `can_view_deals`, RLS
per owner e responsabili, comandi atomici con idempotenza e controllo revisioni.
Dettagli, limiti e checklist in `docs/commerciale.md`.

**223 e 224 applicate.** Verifiche locali: TypeScript e 50 check di dominio
passati, più test delle action con Supabase simulato e suite SQL/RLS su
PostgreSQL isolato. Successivamente distribuito: l'utente ha confermato deploy
e accesso dei manager, con test funzionali in corso. Il portale cliente resta
il secondo intervento.

## Dove siamo — 2026-09-14

**Movimenti e fatture aggiornati.** 176 XML dallo SdI (2 nuove: la FPR 60/26 a
Marietta, la FPR 30/26 di Giacobbe Walter), l'estratto conto BPM al 11/09 (1
nuovo: i 4.392 € di Affinity, che la causale dichiara «saldo fatture n 40 e n
47») e il camt Vivid al 14/09 (4 nuovi). Restano da confermare a mano gli 8
pagamenti cumulativi: nessuno è **certo** secondo §276.

**§330 — un commerciale di riferimento, una provvigione divisa.** Il piano
conosceva due casi e ne servivano tre: il digital di iCura ha Walter come
commerciale — è lui che il cliente chiama — ma il lavoro è stato portato in tre.
`sales_split` lo dichiara sull'accordo e sulla riga; il nome resta scritto e
cambia solo la tasca. Prima l'unica strada era marcare la riga `inbound`, cioè
cancellare il commerciale per far tornare un numero. **Serve la migration 222.**

**§331 — un arretrato si incassa come tutto il resto.** Le righe di mesi
precedenti erano l'unico posto del conto economico in cui «pagato» restava per
forza una dichiarazione: niente dialogo, niente fattura, niente movimento — e i
candidati non venivano nemmeno costruiti. Spuntandone una, poi, spariva dalla
pagina: finiva in «passati in questo mese», montato **solo** in lettura di
cassa. Adesso ha le stesse due celle delle righe del mese, lo stesso dialogo, e
il blocco di destinazione c'è in tutte e due le letture.

**§334 — il foglio dell'erogazione, da stampare.** «Report compensi» in testata
a Erogato soci apre `/api/compensi`: chi prende cosa, quanto è già uscito, quanto
resta da versare, e sotto ogni persona il dettaglio riga per riga — voce di
ricavo, base, percentuale applicata, motivo. Non ricalcola niente: rende i
`QuotaRow` che il motore produce già. Su agosto: 15.498,02 € a quattro persone,
e le 5 righe maturate e non incassate per 12.200 € dette accanto, perché è quasi
sempre lì la ragione di un compenso più basso del previsto.

**§343 — il pannello contratti sapeva di zero progetti.** Tutti e tre i punti che
montano `ContractsPanel` gli passavano `projects={[]}`: il selettore «Progetto»
era sempre vuoto e il riquadro diceva «questo cliente non ha progetti attivi»
anche a chi ne ha quattro. Un accordo senza lavoro si poteva solo creare, mai
collegare. Insieme: il commerciale esterno si scrive (il campo
`sales_owner_name` c'era già nel database e `ownerOf` lo leggeva, mancava solo il
modo di scriverlo) e la casella della provvigione divisa non sembra più spenta.

**§342 — la scheda progetto si apre sulle lavorazioni.** Era Panoramica, e nel
tab Workstream il calendario stava sopra l'elenco: un riassunto prima di sapere
di cosa, e delle date prima di sapere a cosa appartengono. Ora Workstream è il
primo tab e il calendario sta sotto le corsie.

**Workstream azzerate.** Su richiesta esplicita, dopo aver misurato la cascata e
averla dichiarata: via **93 workstream** e con loro, per `ON DELETE CASCADE`,
**144 milestone**, **124 task di progetto** e **185 regole ricorrenti**. Le
**53 task ad hoc** sono rimaste tutte, nessuna riga orfana in `task_assignees`.
I 30 progetti restano: era una pulizia delle workstream, non dei progetti.

**§341 — i progetti si raggruppano per cliente.** L'elenco sotto il calendario
era una griglia piatta; ora è per cliente, con filtro cliente e ritorno
all'elenco unico.

**§340 — la sezione Task le contiene tutte.** Era «Task Ad Hoc» e mostrava metà
del lavoro; l'altra metà stava nella scheda di ogni progetto. Ora si chiama
«Task», le carica tutte, e un selettore *Tutte · Di progetto · Ad hoc* rifà la
separazione quando serve.

**§339 — manager vuol dire manager.** Il governo dei progetti leggeva
`project_members.role_in_project`, che è nullo su quasi tutte le righe: Sabrina
Nastro è manager e membro di sei progetti, e non poteva modificare niente da
nessuna parte. Un permesso che dipende da una colonna che nessuno compila è un
permesso che non esiste. Ora `canGovernProjects` in `lib/permissions.ts`, una
volta sola: admin e manager, su qualunque progetto. Il server ammetteva già
tutti — era una barriera della sola UI.

**§338 — la ricorrente si modifica dove si legge.** Il responsabile stava dietro
una matita che compariva solo al passaggio del mouse, ed è la sola cosa che
decide se l'occorrenza arriverà a qualcuno. Ora la riga porta responsabile,
regola in italiano, prossima data e volume mensile; il form mostra le prime tre
date prima di salvare e chiede da quando a quando; le tappe generate portano il
badge «ricorrente».

**§337 — le ricorrenze, e un motore che gira davvero.** Misurato prima di
toccare niente: **185 template ricorrenti attivi, zero occorrenze mai generate**.
La 152 schedulava il motore con `pg_cron` dentro un `EXCEPTION WHEN
undefined_function`, l'estensione non c'è e per mesi non l'ha detto nessuno. Ora
la regola sta in `lib/recurrence.ts` (pura, due gate), la materializzazione in
`lib/recurrence-run.ts`, e gira da due parti: il cron `/api/recurrences/run` e la
generazione immediata dentro l'azione — chi riceve una ricorrente la vede quando
gliela assegni, non il giorno dopo. Finestra a 30 giorni, `task_assignees`
scritto. **Nuove: le tappe ricorrenti** (`recurring_milestone_templates`), e sul
calendario ne compare una sola per serie, la più vicina a oggi. **Serve la
migration 223** e il segreto `RECURRENCE_CRON_SECRET`.

**§336 — e anche perché la finestra comincia lì.** «Fra il 13 agosto e il 20
settembre» faceva nascere la domanda giusta: e fra il 1° e il 12 agosto? Quello
che è rientrato prima è stato erogato il 13 agosto, sulla competenza di luglio —
8 righe per 25.325 €, fra cui i 3.500 di Industrial Service dell'11 agosto e i
1.625 di Fatima Leo del 3. Ora stanno nel foglio: un limite senza la sua ragione
fa cercare un ammanco che non c'è.

**§335 — il foglio dice su cosa è calcolato.** La base era già l'incassato — le
sole fatture rientrate nella finestra, le altre slittano da sole — ma la colonna
si chiamava «Maturato» e la frase diceva «maturati in questa finestra»: la parola
faceva credere il contrario del numero. Adesso la regola sta in cima, e quello
che slitta porta i nomi dei clienti invece di un conteggio. Le partite di giro in
quell'elenco sono marcate: entrano in cassa e non generano quota.

**§333 — l'elenco dei commerciali è di persone, non di importi.** Conseguenza vista
subito su agosto: marcata iCura «divisa», la sola provvigione incassata di
Walter Giacobbe è andata nel pool e la sua riga è uscita dai commerciali senza
una parola — il denaro c'era (260 € dentro «Erogato soci»), il nome no. Il
filtro `amount > 0` contraddiceva la regola scritta sopra `owners`. Adesso resta
a zero col maturato accanto (603 €), e il blocco del pool nomina chi prende cosa.
Stessa ragione per chi non ha portato niente: Toto non compariva affatto, e
un'assenza si legge «non è un commerciale». Ci sono tutti, ordinati per importo.

**§332 — «Prepara i compensi» spariva dopo il primo clic.** Compariva solo con
zero righe, quindi chi maturava una provvigione dopo — Walter Giacobbe ad
agosto, coi 20.000 di iCura rientrati il 9 settembre dentro la finestra del 20 —
aveva l'importo in elenco e nessuna casella accanto. La testata adesso conta gli
scoperti e offre «Aggiorna N»; le righe già pagate e quelle decise a mano non si
toccano.

## Dove siamo — 2026-09-11

**§329 — il campo «ruolo» del form ospiti scriveva nella RLS.** Nel Customer
Care, il form «ospite esterno» ha un campo ruolo **a testo libero**. Quel testo
finiva in `user_metadata.role`, e il trigger `handle_new_user` (001) copia
`raw_user_meta_data->>'role'` dentro `profiles.role` — la colonna che
`get_my_role()` legge per tutta la RLS e che il middleware usa per scegliere il
portale. Scrivere «admin» e invitare un proprio indirizzo bastava: il profilo
nasceva con i permessi di un admin, al momento dell'invito. L'azione chiedeva
solo «c'è una sessione», e a quella pagina ci arriva ogni ruolo del workspace,
`freelance` e `partner` compresi.

Accanto, la stessa forma: `getOrCreatePortal` dava il **token del portale
ticket** di qualunque cliente a chiunque fosse autenticato — e quel token, da
solo, apre i ticket di quel cliente con nomi ed email di chi li ha aperti.

Chiuse tutte e due dal lato applicazione, più `/api/invite` (che scriveva
`profiles.role` dal corpo della richiesta, senza passare da `coarseRole`) e le
due azioni AI del customer care, che non chiedevano niente a nessuno e chiamano
un servizio a consumo. La **221 era indicata come non eseguita; i suoi effetti
sono stati verificati sul DB il 2026-09-15** (vedi avvertenze sopra): toglie al trigger la
lettura del ruolo dai metadati e restringe allo staff due policy che erano
`FOR ALL USING (auth.uid() IS NOT NULL)` — cioè la RLS accesa e lasciata
passare.

**La regola che resta**, ed è la parte che vale più delle quattro correzioni: si
può saltare il controllo di ruolo **o** il client di servizio, non tutti e due.
Chi lavora sulla roba di chi chiama può affidarsi alla RLS — ma allora deve
passarci. Le due falle stavano esattamente nell'incrocio: sessione letta, ruolo
no, service role sì. `lib/actions-guard.check.ts` (48° file del gate) elenca
tutte le server action e lo verifica; è stato provato **rimettendo le falle**, e
fallisce nominandole entrambe. Cinque eccezioni dichiarate, tutte del portale
ospite, che autorizza col token e non con la sessione.

**E il manuale diceva cose che non sono più vere.** Non è pignoleria: `CLAUDE.md`
e `AGENTS.md` sono istruzioni, e un agente le esegue. L'esempio Groq usava il
modello **dismesso** che lo stesso file dichiara morto (il codice è a posto:
tutte e sei le chiamate passano da `GROQ_MODEL`); l'albero diceva «migration
001–091, 086–091 da eseguire» mentre sul disco ce ne sono 193 e la 086 è
**esplicitamente da non eseguire**; cinque dei quindici percorsi elencati non
esistono; la sezione «Chat — quattro gruppi» descriveva un componente cancellato
(`/chat` fa redirect al Customer Care). `AGENTS.md` era fermo a luglio — colori
esadecimali a mano, `llama-3.3-70b`, «001–034» — ed è diventato un puntatore:
due manuali che si contraddicono sono peggio di uno. Il registro completo, con
cosa è verificato e cosa no, sta in `docs/audit-twobee-os.md`.

## Dove siamo — 2026-09-11 (calendario milestone)

**§328 — il calendario milestone mostrava tutta l'anagrafica.** Meno i persi,
che erano l'unico stato che il filtro conosceva — scritto inline in due
`page.tsx` come `client_label === 'perso'`, cioè esattamente il caso che
`lib/clients.ts` esiste per evitare. Così in `/progetti` stavano i sospesi con
«0 progetti» in rosso, i lead, e GAV Sistemi, che non è un cliente ma un giro
di fatture (§326) e non avrà mai un progetto: una riga d'allarme che nessuno può
spegnere. Adesso il filtro è **uno**, `countsInDelivery`, e non è
`countsInStats`: quella risponde ai numeri, questa alle consegne. Metroquadro e
Costruisci e arreda non contano nell'MRR ma hanno milestone vere e restano;
il giro esce con persi, sospesi e lead. Il workspace passa solo la label —
là le aree non esistono e la VIEW non espone `internal_kind` (`docs/operativita.md`).

## Dove siamo — 2026-09-09

**§326 — la lista clienti chiedeva a GAV Sistemi di quotare un canone.** E a
TwoBee. Sotto `is_internal` stavano due cose che non si somigliano: GAV ha
partita IVA e una fattura emessa da 3.660 € — è un **giro fra società
collegate**, e quel documento sta nel registro IVA come tutti gli altri —
mentre Twobee, Metroquadro, Visionark e Costruisci e arreda non hanno né l'una
né le altre: sono **marchi e lavori nostri**. In una lista sola il danno era
doppio e opposto: al primo si chiedeva «da quotare» e non c'è niente da quotare,
al secondo lo stato dei pagamenti e non c'è nessun pagamento. Adesso sono **tre
aree** — Clienti (11) · Società collegate (1) · Progetti interni TwoBee (4).
La **220 è applicata**: il backfill ha seguito i documenti e ha separato GAV dai
quattro marchi al primo colpo. Il CHECK regge (§313: `internal_kind` inventato →
**23514**, `giro` passa), e nessun cliente vero ha preso un genere.

**§327 — «interni» non vuol dire «nostri», e l'area si cambia anche
dall'anagrafica.** La descrizione diceva «marchi e lavori nostri» ed era troppo
stretta: lì dentro ci vanno anche **aziende clienti vere** con cui il rapporto
non passa da una fattura — scambio merce, permute, accordi di altra natura.
Elettra Group è una di quelle, e adesso sta lì (Progetti interni: 5). Quello che
accomuna l'area non è la proprietà: è che **il valore non passa da un
documento**, ed è per questo che non hanno stato di fatturazione né un canone da
quotare — non perché contino meno.

L'area si cambia adesso da tre punti: la barra della selezione in lista, la
scheda del cliente, e la scelta alla creazione. Tutti e tre passano da
`setClientSegment`: il rimedio al caso Elettra non era togliere il comando, era
farlo scrivere **le due colonne insieme**. In anagrafica si applica subito e non
è un campo del form — salvarlo col resto lo rimetterebbe in `EDITABLE` dalla
porta di servizio.

**Le sezioni sono più nette**: sfondo pieno, un bordo sopra che chiude la
precedente, e il nome in un chip colorato per area col conteggio dentro. Il
colore non decora — dice a colpo d'occhio in quale delle tre stai leggendo.

**§327 — e finalmente si sa quale commit gira.** «Il redeploy va verificato a
mano» era una nota nel manuale, e a mano non si poteva: da fuori si vede solo
che l'etag della pagina di login è cambiato, cioè che **un** build è passato, non
quale. Dopo sette push in un giorno quella distinzione è tutta la domanda.
`/api/version` restituisce lo SHA, letto a **build time** in `next.config.mjs` —
nel container non c'è nessun `.git` da interrogare a runtime. Non è protetto: uno
SHA abbreviato non è un segreto, e un endpoint di versione dietro autenticazione
non risponde alla domanda per cui esiste, che si fa prima di aver fatto login.

**E si è visto subito perché serviva un modo di spostarle.** Elettra Group è
stata segnata interna **dopo** il backfill della 220, è rimasta senza
`internal_kind` ed è comparsa fra le società collegate. Il default prudente ha
funzionato — meglio una riga di troppo in vista che una sparita — ma il difetto
era a monte: `is_internal` si poteva scrivere **da solo**, dal form anagrafica e
dalla creazione. Adesso non è più in `EDITABLE`, nella scheda l'area è in sola
lettura, e si sposta da un posto solo: la barra della selezione in lista, anche
su più anagrafiche insieme, o la scelta alla creazione. Le due colonne si
muovono insieme o non si muovono.

**E la lista si legge.** Le sezioni erano un filetto con la scritta in mezzo, che
si legge come una riga vuota — nello screenshot la prima anagrafica sotto
sembrava appartenere alla riga sopra. Adesso sono bande con un bordo colorato, il
conteggio e lo scaduto della sezione. E le righe degli interni non ripetono più
«nessuna scadenza» in due colonne accanto: nella prima resta il vuoto, nella
seconda c'è **perché** è vuoto — «non fattura» — che è l'unica cosa che quelle
righe hanno da dire.

**La colonna Pagamenti era una parola, adesso è un numero.** Leggeva
`clients.payment_status` — scritta dal cron notturno — e sotto lo scoperto **del
solo mese in corso**: un credito di luglio non compariva da nessuna parte.
Adesso è lo **scaduto cumulativo** delle fatture del cliente, dalla stessa porta
di Fatturazione: **13.176,00 €**, gli stessi che dice la sezione Fatture — se
divergessero, una delle due pagine starebbe mentendo e non si saprebbe quale.
Affinity 4.392 (2 fatture) e iCura 8.784 (2).

**E dov'era «Settore» — il ramo merceologico, che non fa decidere niente — c'è
il ciclo dei soldi**, con i tre stati che Fatturazione e Banca già conoscono:
`pagato` · `da emettere fattura` · `non pagato`. Il secondo non è un ritardo del
cliente: è **nostro**, ed è competenza del mese senza un documento sotto — Seven
6.500, Josè 1.200. L'ordine conta: prima il non pagato, che sono soldi già
dovuti; poi il da emettere, che è lavoro nostro.

**Chi non si quota**, e la regola non è «chi conta nelle statistiche»: è **chi
può firmare qualcosa**. Non i giri, non gli interni, non i persi — ma sì i lead,
che è il loro motivo (§321), e sì i fermi, perché il giorno che ripartono serve
un contratto.

**§325 — l'IVA aveva tre letture in tre posti diversi.** La Fiscale la calcolava
solo dalle righe del conto economico, l'archivio delle fatture per conto suo in
un'altra pagina, e il modello F24 arrivava mesi dopo. Adesso stanno nella stessa
riga, e sul **2º trimestre** la misura è netta: il modello ha chiesto
**9.669,33**, i documenti dicevano **9.804,96** e le righe **8.451,96** — i
documenti hanno sbagliato di 135,63, la stima di 1.132,85. **Otto volte meno.**

Sul **3º trimestre** in corso il segno si ribalta (righe 15.476,54, documenti
11.059,67) e non è un errore: sul venduto le righe hanno 2.816 € di imposta in
più perché settembre è competenza e le fatture escono a fine mese; sul comprato i
documenti ne hanno 1.600 in più perché sono arrivate fatture che le uscite non
registrano. Per questo lo scarto adesso si attribuisce **al lato che lo produce**
— una spiegazione sola sbaglierebbe una volta su due.

**Il versamento non cambia**: resta il modello quando c'è, la stima quando non
c'è (§242). I documenti stanno accanto come controllo, perché spostare la
liquidazione su una terza fonte muoverebbe la cassa senza che nessuno l'abbia
deciso.

**Il 2º trimestre è versato per intero.** 9.669,33 di IVA dentro l'F24 da
10.547,24 del 20 agosto (cod. 6032) — il resto sono ritenute 239,48, INPS 856,00
e crediti 217,57, che stanno in `hr_f24`. **Riporto al 3º trimestre: zero.**

**E la somma era scritta tre volte.** Da righe a IVA del mese: la Fiscale
applicava la detraibilità parziale (§191), il prospetto e il piano di cassa no.
Coincidevano *per caso* — nessuna riga ha una percentuale sotto il 100% — e alla
prima che arriva avrebbero detto tre liquidazioni diverse. Adesso è `monthsVat`,
una sola. Il piano di cassa resta con un limite dichiarato: le righe di
`lib/pl-rows.ts` non portano `vat_deductible_pct`, quindi lì il credito si legge
pieno, e c'è scritto dove guardare quando smetterà di essere lo stesso numero.

**Settembre è aperto**, e si vede: il 3º trimestre passa da 12.429,17 a
15.476,54 di saldo IVA sulle righe, perché la competenza del mese è entrata.

**Archivio a 86 documenti** (47 emesse, 39 ricevute): 5 fatture nuove — FPR
57/26 Fatima, FPR 59/26 iCura, la nota di **debito** FPR 58/26 ad Affinity, la
nota di **credito** FPR 56/26 a Petito, e in entrata la FPR 14/26 di Affinity da
12.200 €, che è la più grossa mai ricevuta.

**§323 — la nota di credito diceva già quale fattura stornava, e per otto mesi
nessuno l'ha letta.** `DatiFattureCollegate` è nel tracciato FatturaPA ed è
compilato su **tutte** le TD04 dell'archivio: la FPR 56/26 dichiara di annullare
la FPR 41/26 del 3 luglio, con numero e data. Finché quel campo restava nell'XML
e non in una colonna, il legame lo ricostruiva una persona scrivendo a mano una
ragione di esclusione (§281) su **una** delle due righe della coppia — e ha
sbagliato riga due volte su quattro.

**Due numeri diversi per la stessa parola, nella stessa schermata** (§238 di
nuovo). La scorecard «Fatturato emesso» sommava ogni documento col suo segno e
diceva **123.075 €**; il grafico sotto toglieva le note di credito **e** le
esclusioni a mano e diceva **112.375 €**. La differenza — **10.700 €** — sono
quattro fatture sottratte **due volte**: una come «fuori dai conti» e una come
storno della loro nota di credito, perché `credited` non escludeva le note già
escluse. Il netto giusto è 123.075: ogni documento conta una volta, col suo
segno. Non c'era modo di accorgersene guardando un totale: entrambi erano
plausibili.

**E lo storno stava nel mese sbagliato.** Adesso pesa nel mese della **fattura
annullata**, non in quello della nota. Maggio 26.800 · giugno 17.300 · luglio
30.725 · agosto 39.725 · settembre 8.525. Prima i 3.300 delle note del 3 agosto
cadevano su agosto mentre annullavano due fatture di **giugno**, e il 1.500 di
Petito cadeva su settembre mentre annullava **luglio**: due mesi sbagliati per
un documento solo. La dichiarazione resta un'altra domanda e la risponde
`vatByQuarter`, che tiene ogni documento nel suo trimestre.

**La coda del «da incassare» chiedeva di telefonare per soldi già stornati.**
Erano 17 documenti per 69.479 €, e dentro c'erano la FPR 31/26 di Affinity
(2.196) e la FPR 41/26 di Petito (1.830) — entrambe annullate da una nota che
era in archivio — più due note di credito contate come crediti **negativi**, che
nascondevano altri 4.270 €. Adesso sono **13 fatture vere per 69.723 €**, di cui
**47.122,50 scaduti**. Il totale si somiglia; la lista è un'altra.

**Gli stati sono uno solo, in `invoiceStatus()`**, e coprono tutto l'archivio
senza sovrapporsi: 22 pagate · 8 scadute · 5 nei termini · 6 stornate · 6 note
di credito · 0 non gestite. Le esclusioni a mano rimaste sono **zero**: le otto
che c'erano le spiegava già una nota di credito. Il campo resta, ed è giusto che
resti — serve per quello che nessun documento spiega — ma non è più il posto
dove si tiene a mano una cosa che il file dice da sé.

**Emessa non è inviata** (§323): `from_sdi` è **generata** da `raw_xml IS NOT
NULL`, perché un file tornato dallo SdI è la prova del transito e uno stato che
si può digitare è uno stato di cui fidarsi a metà. La data dell'invio nell'XML
non c'è e non si inventa: `sent_on` esiste per le fatture scritte a mano (§247).

**Banca riallineata al 9 settembre.** BPM: 116 righe nell'estratto, **5 nuove**
(iCura 24.400 in entrata, Affinity 12.200 e 3.260 in uscita, due commissioni).
Vivid: il camt di 57 movimenti era **già tutto in archivio**, e il saldo di
chiusura che il file dichiara — 428,15 — è al centesimo quello del tool. BPM
quadra allo stesso modo: le 116 righe del CSV più i tre movimenti del 28 aprile
che quel CSV non copre fanno **24.295,92**, cioè il saldo dell'archivio.
**Liquidità reale 24.724,07 €.**

**Otto abbinamenti fattura↔movimento scritti**, tutti col criterio di §276 —
importo lordo identico, controparte che torna, e su sei di essi **il numero
della fattura scritto dalla banca nella causale**: FPR 43, 44, 48, 49, 53, 55 in
entrata, e le due Affinity in uscita (FPR 12/26 e 14/26). Nessuno era ambiguo;
gli undici che lo sono restano a mano, e la ragione è scritta accanto a ciascuno.

**Il ponte (§199) non quadra, e si sa di quanto**: residuo −24.109,08 €. Non è
un movimento senza nome: **settembre ha 14 movimenti in banca per +20.408,97 € e
non ha un mese di conto economico**. La cassa cumulata del piano si ferma ad
agosto, il saldo vero no, e la differenza è quasi tutta lì. Si chiude preparando
settembre, che è un'altra operazione — crea righe di ricavo e di costo — e non
si fa di straforo insieme a un import.

**§324 — il lato «da pagare», che aveva la forma sbagliata.** I debiti verso i
fornitori si leggevano come i crediti verso i clienti: una lista piatta ordinata
per ritardo. Ma un credito si insegue una fattura alla volta e un debito si paga
**un fornitore alla volta**. Adesso «Chi dobbiamo pagare» raggruppa, e sopra c'è
quando esce: **6.031,73 € verso 4 fornitori**, di cui **3.034,13 già scaduti** e
**2.997,60 senza una data**. Nei prossimi 30 giorni non scade nient'altro — tutto
il debito aperto è già oltre il termine o non ne ha uno.

**Quattro debiti, e ognuno per una ragione diversa.** Affinity **FPR 13/26**
(2.989) è il «Saldo sviluppo modulo gestione trasferte I.S.F.»: la catena è
acconto 30% + secondo 35% + **saldo 35% al completamento**, e quel saldo è dovuto
quando il lavoro chiude, non adesso. OVH **IT3087078** (45,13) è settembre, e la
carta addebita circa un mese dopo — luglio il 4 agosto, agosto il 3 settembre —
quindi arriva a inizio ottobre: non è un arretrato. Saraiello **6/2026** (1.500)
è settembre e basta. Spaduzzi **3PR** (1.497,60) non ha scadenza e non ha
storico: l'unica delle quattro che vada davvero decisa a mano.

**Un buco da 462 € che vale la pena guardare.** La FPR 9/26 di Affinity (acconto
30% ISF) è di 2.562 € e il bonifico del 23 luglio è di **2.100**, cioè il solo
imponibile: manca l'IVA. È saldata — lo dice chi ha in mano il rapporto — ma il
conto corrente ne dimostra 2.100, e la differenza non è un arrotondamento.

**La catena Saraiello, rimessa in ordine dal fornitore stesso.** Sei fatture e
quattro pagamenti sparsi, con la 5/2026 che risultava pagata 19 giorni prima di
essere emessa. Il pattern vero, una volta saputo che la distinta del 20 agosto da
2.854 € è **1.300 a Saraiello + 1.554 a Smiraglia** (l'unica scomposizione
esatta): paga **circa due settimane dopo l'emissione, sempre prima della
scadenza** — 3/2026 il 1º luglio, 4/2026 il 17, 5/2026 il 20 agosto. Resta aperta
**solo la 6/2026 di settembre**, 1.500 €. La distinta non si aggancia a nessuna
delle due: paga due fatture e la colonna ne regge una (§189), quindi entrambe
restano «dichiarate» e lo scadenzario delle spunte lo dice.

Nel riquadro «Oltre la scadenza» c'era lo stesso numero già scritto nel riquadro
accanto: due volte la stessa cifra sulla stessa riga fa contare a mano invece di
leggere (§238). Al suo posto la domanda che mancava — **quanto serve avere sul
conto entro il mese**, scaduto compreso. Non «la prossima uscita»: con tutto il
debito già oltre il termine, quel riquadro avrebbe mostrato una data passata
sotto la parola «prossima».

**La scadenza che manca la dice il fornitore.** Metà delle ricevute non porta
`DataScadenzaPagamento`, e senza quella un debito non è né scaduto né atteso:
sparisce dalla cassa. Non si inventano trenta giorni — si legge il termine che
quel fornitore scrive **sulle sue altre fatture**, col campione accanto.
Saraiello: 31 giorni su 5 documenti, quindi la 6/2026 del 2 settembre scade il
**3 ottobre**. Spaduzzi ha una fattura sola e nessuno storico: lì la pagina dice
che non lo sa.

**Tre agganci impossibili, e la soglia che li lasciava passare.** Il bonifico
Tailors del 17 giugno era attaccato a una fattura del 4 agosto — 48 giorni prima
che esistesse — e iCura uguale a 14 giorni. `txCandidates` li proponeva:
importo esatto più controparte fanno 75, la penalità era 20, restava esattamente
la soglia di 55. Ora la penalità oltre il termine della differita è 40, e la
riconciliazione ha un controllo suo. **Due riparati** con
`scripts/fix-invoice-links.ts` — la fattura giusta portava già la data giusta,
quindi non si è mosso un euro — e **uno lasciato aperto**: la 5/2026 di Saraiello
è pagata 19 giorni prima di essere emessa, ma quale delle due più vecchie sia la
vera destinataria non lo dice nessun documento.

**Un falso positivo che valeva per tutte le parcelle.** La 3PR di Spaduzzi —
una delle due senza data — era segnata come incoerente: righe 1.440, imponibile
1.497,60. Torna: in mezzo ci sono 57,60 di cassa previdenziale, che è
**imponibile** e va sommata. Il controllo la sottraeva. Una sola nell'archivio,
ma ogni parcella con la cassa avrebbe preso lo stesso avviso, ed è il difetto
già visto sul bollo (§211). Riscritti i tre avvisi che cambiavano, rileggendo
l'XML conservato.

**Un bug di fuso trovato scrivendo il test.** La scadenza dedotta cadeva il 2
ottobre invece del 3: `new Date('...T00:00:00')` è mezzanotte locale e
`toISOString()` la riporta a Greenwich, che da Napoli in ora legale è il giorno
prima. Adesso la somma è in UTC, e il gate passa anche a UTC+14 e UTC−11.

**219 applicata, e il riallineamento è passato.** 6 storni collegati leggendo
`DatiFattureCollegate` dagli XML già in archivio, 9 esclusioni a mano rimosse —
una in più delle otto previste, perché nel frattempo qualcuno aveva escluso anche
la FPR 41/26, che adesso la nota di credito spiega da sé. **Esclusioni a mano
rimaste: zero.**

I numeri, sul database vero: **netto 123.075,00 €**, e la scorecard e il grafico
adesso dicono **la stessa cifra** — prima erano 123.075 contro 112.375. Mese per
mese: maggio 26.800 · giugno 17.300 · luglio 30.725 · agosto 39.725 · settembre
8.525. Gli stati coprono tutte e 47 le emesse senza sovrapporsi: 28 pagate · 5
stornate · 6 note di credito · 4 scadute · 4 nei termini. E **47 su 47 sono
passate dallo SdI**, quindi nessuna è «da inviare»: quello stato esiste per le
fatture scritte a mano (§247), e per ora non ce ne sono.

## Dove siamo — 2026-09-07

**Allineato ai documenti veri al 7 settembre**: estratto conto BPM al 7/9 (7
movimenti nuovi su 114 letti), 7 fatture nuove (3 emesse, 4 ricevute). Archivio
a 81 documenti, 151 movimenti. **Saldo reale 15.787,07 €** (BPM 15.358,92 + Vivid 428,15) — e il gate del
prospetto lo conferma: 4.315 + 12.204 − 732 = 15.787, ✓ combacia.

**Il fatto nuovo grosso: iCura AI Digital Trainer.** La FPR 55/26 del 31 agosto
fattura **20.000 €** di «acconto contrattuale per kick-off», e nel tool quel
progetto non esisteva — iCura aveva tre lavori e un canone da 3.600. Registrato
come vuole §194: progetto, contratto digital, rata di agosto, e la riga che
nasce **da lì** e non a mano. **Fondo rischio acceso** (§186: il valore venduto
tocca la soglia dei 20.000, e la scelta è dell'admin riga per riga) → 9% al
fondo e ciascun socio al 25%. Agosto passa da 19.725 a **39.725 €** di
imponibile e la quadratura chiude ancora a **0,00**.

Il corrispettivo **totale** del progetto non è nel tool: la fattura dice
«imputato al corrispettivo complessivo», e finché non si sa, `amount` resta
20.000 — cioè la soglia toccata appena. Quando si alza, il fondo rischio resta
disponibile e si aggiungono le rate.

**Tre bonifici che le fatture rendono non ambigui** (§302 prima di §297: il
documento dice chi e quanto, ed è l'unica cosa che distingue due righe dello
stesso importo). Seven 7.930 € del 7/9 è la FPR 53/26 · Fatima 3.812,50 € del
7/9 è la FPR 48/26, che copre **due** righe di agosto (1.982,50 + 1.830, al
centesimo) · Marietta 1.464 € del 25/8 certifica una spunta che era solo
dichiarata. E sette righe di agosto hanno finalmente il documento sotto, le due
lavorazioni esterne comprese — Affinity le ha fatturate il 1º settembre.

**Due volte la stessa lezione, trovata in fila** (§318-§319). «Una regola
scritta due volte non è una regola», e qui la regola era §297 — *la spunta
«pagato» segue il registro*:

- **`allocate-open` scriveva le allocazioni e non allineava `paid`.** Lo faceva
  solo l'azione. Sul bonifico a Walter del 27 agosto le due allocazioni c'erano
  e il tool continuava a dire «erogato 0»: la regola viveva in un percorso e non
  nell'altro. Adesso lo script chiama la stessa `targetCoverage` dell'azione.
- **Il prospetto leggeva l'erogato dalla spunta, il conto economico dal
  registro.** Due schermate che dicono «erogato» e due cifre diverse. Si è visto
  su un difetto di 35 centesimi: la provvigione di Marco Lucci è 442,11 € e i
  due bonifici che se la dividono ne portano 441,76, quindi la spunta non
  scatta — e con la spunta come sola sorgente l'erogato di una persona pagata si
  leggeva **zero**, che è la stessa bugia di uno zero su chi non è stato pagato
  (§305). Ora `prospetto-load` legge le allocazioni, con la data del
  **movimento** invece di `paid_on`, e la spunta resta il ripiego dove il
  registro tace (§226). Effetto immediato: **Walter Giacobbe da 0 a 417 €**
  erogati, che erano usciti dal conto il 27 agosto e non li vedeva nessuno.

**Compensi di agosto ricalcolati** sulla finestra del 20 settembre (§286): base
10.825 € su 4 righe incassate, **1.856,78 € a socio**, provvigioni 322,50 e
229,67 → **6.122,51 € da erogare**. Fuori restano 35.800 € maturati e non
ancora incassati, iCura da 20.000 compresa: si erogano nell'erogazione in cui
rientrano.

**Tenuta di cassa: STRETTO.** Il mese chiude solo se rientrano gli arretrati —
43.676 € già scaduti, il più vecchio da 54 giorni; senza quelli si resta sotto
di 19.238 €. Piano di cassa e conto economico combaciano riga per riga su
agosto: 48.464,50 € di entrate su 8 righe, 15.658,59 € di uscite su 24.

**Settembre non è stato aperto**, ed è una scelta: un mese mai aperto si legge
dal contratto e dal piano (§262), che il 7 è la lettura giusta — le fatture del
mese si emettono a fine mese, e aprirlo adesso significa fotografare un mese
vuoto.

**Quello che resta, in ordine:**

1. ~~Manca l'estratto conto Vivid.~~ **Arrivato**, in camt.053 (§320): 57
   movimenti letti, 52 già riconosciuti, **5 nuovi** — cashback 11,73, Google
   Workspace 177,88, Slack 57,75, OVHcloud 45,13, e il **lato mancante del
   giroconto del 2 settembre**, che adesso è appaiato: i giroconti sono 8 su 8,
   nessuno spaiato. Vivid passa da 247,18 a **428,15 €** e il saldo totale a
   **15.787,07 €**. Fra il 15 e il 31 agosto su quel conto non è successo
   niente, quindi agosto non cambia.
2. **L'incasso ISF da 2.196 € del 6 agosto** non è stato toccato: quell'importo
   torna su quattro righe di due clienti diversi — Affinity ha lo stesso canone
   — e attaccarlo alla sbagliata dichiara incassata una fattura che nessuno ha
   pagato (§189). La scelta è di una persona.
3. **Tre uscite di agosto da sistemare col dialogo dei movimenti** (§303), 148,91 €
   in tutto: due Meta Ads da accorpare (la riga dice 109,12 e dal conto sono
   usciti 166,01) e un carburante da 92,02 da aggiungere. Con l'estratto Vivid è
   arrivato anche un **Google Workspace da 177,88 €** del 2 settembre che
   `merchant()` non riconduce a niente e finisce in «Altro»: a piano la voce
   esiste e dice 170.
4. **Antonio Giarletta non ha ancora ricevuto un bonifico**: 1.821 € maturati,
   contati da sempre perché a chi non ha mai preso un euro la linea del
   consolidato non si applica (§228).

Lo script dell'allineamento è `scripts/align-2026-09.ts` (anteprima senza
`--apply`), fratello di quello di agosto.

## Dove siamo — 2026-08-20 (sera)

**Il registro delle allocazioni è in produzione** (`2d45e53`). Il legame fra
conto corrente e conto economico non è più un campo: è l'euro allocato. Da lì
sono cadute sette cose in fila — l'F24 come documento, il dialogo che propone
«accorpa» invece di creare una riga, la posizione di ognuno, l'accordo validato.

Il ponte (§199) è passato da **−6.029 a −4.772 €**, e il numero è peggiorato due
volte **correggendo errori**: la spesa al supermercato da 3.751 € (era 37,51) e
le quattro righe che portavano il lordo dove il motore aspetta l'imponibile
stavano *coprendo per caso* uscite vere che nessuna riga spiega. Un residuo che
si allarga quando si corregge un dato era un residuo che mentiva.

Quello che resta da guardare, in ordine:

1. **6 spunte dichiarate** che nessun movimento conferma: è quasi tutto il
   residuo del ponte.
2. **Due bonifici Affinity di luglio**, 5.100 €: il motore dell'intake li propone
   e dice «scegli quale» — tre righe dello stesso fornitore, e la scelta è di una
   persona.
3. **Tre movimenti di agosto** per 148,91 €: due Meta da correggere (la riga dice
   109,12 e dal conto sono usciti 166,01) e un carburante da aggiungere.

Fuori dal tool per scelta: la **provvigione divisa** fra Marco e Toto è un accordo
fra loro (§286) e si registra a mano; il bonifico a Walter del 7 agosto è la
**riconciliazione con GAV Sistemi**, marcata «niente da abbinare» col perché
scritto.

## Dove siamo — 2026-08-20 (mattina)

**Allineato ai documenti veri** (`scripts/align-2026-08.ts`): estratto conto BPM
al 20 agosto (14 movimenti), Vivid al 14 (1), 7 fatture nuove. Il saldo reale è
**6.460,10 €** — non 34.845,84 — e la tenuta di cassa passa da «REGGE +5.531» a
**«STRETTO −25.749»**, che è la verità: IVA 9.669,33, compensi 9.824 e
retribuzioni 6.931 sono usciti fra il 7 e il 20 agosto. Le 74 fatture XML
coincidono al centesimo con l'archivio: **zero scostamenti** su importi,
imponibili e scadenze.

**Tre difetti trovati facendolo, tutti «una regola scritta due volte»**:

- **§288** — `scripts/import-bank-csv.ts` costruiva l'impronta con la *posizione
  nel file*: il bug §210 corretto nell'azione e mai nello script. Su un estratto
  conto sovrapposto avrebbe reinserito quasi tutti i 93 movimenti già in
  archivio. La regola ora è `buildImportRows` in `lib/bank-import.ts` e ci
  passano tutte e due le porte; `transferPairs` ha avuto lo stesso trattamento.
- **§289** — `verify-cash` leggeva la **stima** IVA mentre la pagina legge il
  modello F24 (§242): verificava sé stesso, non il codice che gira. E una
  liquidazione **già versata** continuava a essere sottratta dal saldo, quindi
  il conto perdeva 9.669 € due volte proprio il giorno in cui il verdetto serve.
  `vatPending` la esclude, `nextDue` è l'unico posto che risponde a «qual è la
  prossima scadenza da versare».
- Le **spunte gemelle**: la rata ISF «35% alla consegna» e il suo subappalto
  risultavano incassata e pagata l'11 agosto, ma quel giorno c'è un bonifico
  solo per parte, e appartiene alle rate di **luglio**. Della terza tranche non
  esiste fattura, né emessa né ricevuta. Tolte le spunte, non le righe.

**Il registro delle allocazioni ha chiuso quattro quinti del ponte** (§297, la
214 è applicata): residuo da **−6.029,01 a −1.083,25 €**. Il backfill ha scritto
142 allocazioni dai legami diretti, `scripts/allocate-open.ts` altre 5 per
11.956 €, e le due correzioni all'IVA dei subappalti (§295) hanno fatto il resto.

Tre cose che il registro ha trovato appena accesa la luce, e che nessuno vedeva:

- **Sette bonifici pagavano due mesi di canone.** La fattura di Fatima del 5
  maggio è 3.000 netti — due canoni da 1.500 — e il bonifico del 13 maggio ne
  pagava due. Con un campo solo il tool ne agganciava uno e l'altro mese restava
  scoperto per sempre. Cinque si sono chiusi da soli con due regole che non sono
  scelte: **un bonifico non paga una fattura non ancora emessa** e **un compenso
  si paga nel mese in cui è atteso**. Senza la prima, il canone di maggio aveva
  tre candidate e due erano nel futuro.
- **`pl_cost_lines` «Supermercato» dice 3.751 € e il movimento è 37,51.** Un
  fattore cento, invisibile finché nessuno confrontava la riga col bonifico.
- **Sei righe hanno `vat_applied` su un importo che è già lordo** — Asana,
  Talenti, Gialeda, Roberto Annunziata: il tool ci aggiunge il 22% e si aspetta
  un'uscita che non arriverà.

**§298 — le tre correzioni che il registro ha reso possibili**, e ognuna era
invisibile finché riga e movimento non stavano affiancati:

- **La riga di luglio del personale portava la busta di giugno**: 3.868 €, che è
  esattamente quello che era uscito il 17 luglio, mentre la distinta del 20
  agosto è di **4.077**. Il mese è stato preparato copiando quello prima.
- **La spesa al supermercato diceva 3.751 € e il movimento è 37,51.** Correggerla
  ha **peggiorato** il ponte, da −1.083 a −4.587,74: quei 3.713 € fasulli stavano
  coprendo per caso un'uscita vera che nessuna riga spiega. È il ponte che fa il
  suo lavoro — un residuo che si allarga quando si corregge un errore era un
  residuo che mentiva.
- **Cinque righe portano il lordo dove il motore aspetta l'imponibile**
  (`scripts/fix-gross-as-net.ts`), e le fatture dimostrano che **lo scorporo
  cieco al 22% sbaglierebbe**: Talenti è 300 + 66, e lo scorporo la
  indovinerebbe; Gialeda è 134 + **7,04**, cioè il 5,25%, perché una pratica
  CCIAA ha dentro diritti esenti. Vale §182 — il documento batte la stima — e
  dove il documento non c'è (Asana, fornitore irlandese) l'IVA **si spegne**:
  scorporare inventerebbe un credito che nessuno ha pagato. Quattro stanno in
  mesi chiusi e il tool non le tocca: cambiare l'imponibile di una fotografia ne
  muove le quote già distribuite.

**Due regole imparate allocando** (`scripts/allocate-open.ts`), e nessuna delle
due è un'euristica: **un bonifico non paga una fattura non ancora emessa** — senza
il vincolo il canone di maggio di Fatima aveva tre candidate e due erano nel
futuro — e **un compenso si paga nel mese in cui è atteso**, o il bonifico del 1º
giugno si prende le quote di agosto. Più due difetti di chi propone: `classify`
etichetta `finanziamento` i bonifici ai soci di giugno e `pagamento` quelli del
13 agosto, quindi **filtrare per categoria perde metà dei casi** — il segnale è
il nome più il mese; e il nome sull'estratto conto non è quello del piano
compensi, quindi passa da `PERSON_ALIASES` (§226) o il gemello di Toto non si
trova mai.

**Quello che resta a una persona.** Il bonifico a Walter del 7 agosto è la
riconciliazione con **GAV Sistemi** — giro fra società collegate, fuori dalle
statistiche — e non una quota: è marcato «niente da abbinare» col perché scritto,
e da allora `allocate-open` rispetta quella decisione invece di riproporla. La
seconda distinta del 20 agosto (2.854 €) resta aperta perché **1.300 + 1.530 fa
2.830, non 2.854**: le due fatture di Annalisa sono 1.530 e 1.554, e quale delle
due paga quella distinta il tool non lo può decidere. **La provvigione divisa fra
Marco e Toto** si registra a mano e lo dichiara: il tool la attribuisce intera al
commerciale del cliente (§286), e l'accordo fra loro vive fuori.

## Dove siamo — 2026-08-13

**Fatto il 2026-08-13**: la **212** è applicata e la riparazione di luglio è
passata (`npx tsx scripts/fix-july-2026.ts --apply`). Al mese mancavano
**5.209,33 €** di lavorazioni affidate fuori che il piano di progetto aveva già
— Seven acconto 2.459,33 e ISF 30% 2.100 mai portati nel mese, Fatima/Gianni
650 datato agosto contro una rata di luglio — e le sei tranche Seven stavano
**un mese avanti** rispetto alle rate che finanziano, fino a gennaio 2027.
Luglio è stato riaperto, corretto e richiuso: la quadratura chiude ancora a
**0,00**.

L'erogazione del **13 agosto** su luglio: base 25.325 € (8 righe su 12),
margine digital 10.293,45, **2.661,12 a socio** di quota digital, 470 di erogato
growth, 60 di provvigione divisa → **3.191,12 a testa**; provvigioni Walter
417,00 · Marco 442,11 · Antonio Giarletta 283,50 → **10.715,97 € da erogare**,
scritti in `pl_payouts` (`scripts/prepare-payouts.ts`, stesso motore del
pulsante). Restano fuori 6.900 € di righe di luglio non incassate: il loro
compenso si eroga nell'erogazione in cui rientrano. La finestra di agosto
riparte dal 13 e vale **945 €**; la tenuta di cassa dice lo stesso numero
(10.716 + 945 = 11.661 €).

**Due cose lasciate aperte da lì**: i due subappalti portati nel mese sono
entrati **non pagati** — nessun movimento dimostra che siano usciti (§226) — e
il fondo rischio di Seven è acceso sulle rate di luglio e **spento** su quella
di agosto: stesso progetto da 45.000 €, quota che salta dal 25% al 28% fra un
mese e l'altro senza che niente lo dica.

**Da eseguire subito, e non è una migration**: `supabase/RESTORE_HR_PEOPLE.sql`.
Il 9 agosto quattro persone su cinque sono state eliminate da `hr_people` per
togliere il loro costo dal solo mese di maggio; il CASCADE si è portato via
anche i tre cedolini di giugno. Lo script rimette persone (stessi id), cedolini,
la fattura di Annalisa e le date di assunzione — Gabriele da aprile, Annalisa da
giugno — e da lì in poi `inForce` (§233) fa il lavoro che si voleva: la persona
resta in organico e pesa solo dai mesi in cui era in forza.

**Da eseguire: la `210_invoice_unmanaged.sql`** (§281) — la colonna
`invoices.excluded_reason`: nove documenti su trentanove non sono né incassati
né da incassare, e finché non c'è quella colonna restano fra i crediti da
inseguire. Subito dopo, `supabase/FIX_INVOICES_STATE.sql` scrive lo stato vero.

**Verificato sul database il 2026-08-09, colonna per colonna**: 203, 204, 205,
206, 207, 208, 209 e 197 sono **applicate** — il registro le dava ancora per
mancanti. `pl_config.settled_from` c'è (quindi 204+205 sono passate),
`vat_settlements`, `pl_payouts`, `invoices.pdf_path`, `bank_tx_lines` ci sono, e
`clients.risk_score` è stata droppata come voleva la 197. L'unica che manca è la
**210**.

**Da eseguire**: `supabase/FIX_PAYSLIPS_FROM_LUL.sql` (§235) — i tre cedolini di
giugno trascritti dal LUL voce per voce (il seed della 182 aveva i totali giusti
e le scomposizioni no: l'imponibile previdenziale conteneva trasferte e indennità
esenti), l'F24 di luglio in scadenza il 20 agosto, e le RAL allineate ai
documenti. Senza, la pagina calcola i contributi su una base più alta del vero e
i tre dipendenti costano 6.573 €/mese invece di 5.360.

**Da eseguire, quando si vuole**: `supabase/FIX_ADS_FROM_BANK.sql` — la
pubblicità allineata al conto Vivid (Meta comincia il 25 luglio: 211,64 a
luglio, 109,12 ad agosto, zero prima). Senza, maggio porta 900 € di uscita
scoperta per una campagna mai partita e la tenuta di cassa la conta.

Ultimo commit: **`2d45e53`** (il registro delle allocazioni, §290→§307),
pushato su `origin/main` il 2026-08-20 — 78 file, +9.849/−1.226. **`main` è
allineato**, quindi su os.twobee.it c'è tutto quello che c'è qui.
Gate del repo: `npx tsc --noEmit` (ESLint non è configurato) più i
**quarantacinque** `lib/**/*.check.ts` (gli ultimi sono `allocations.check.ts` §297,
`f24.check.ts` §301, `month-intake.check.ts` §303, `stream-validation.check.ts`
§306, `ai/tools/access.check.ts`, `ai/format.check.ts` §314 e
`ai/tools/result.check.ts` §315), che si lanciano con
`npx tsx lib/<percorso>.check.ts` e devono dire «Tutti i controlli passano».
**Non lanciare `npm run build` mentre `npm run dev` gira**: condividono `.next`,
il dev server resta a servire chunk CSS sostituiti e la pagina si apre senza
stili. Se succede: ferma il dev, `rm -rf .next`, riavvia.

**Luglio 2026 è chiuso** (2026-08-09). La quadratura chiude a zero — 31.725 € di
imponibile, quote + costi + subappalti = 31.725, differenza 0,00 — e ogni riga
dice quello che dice il suo contratto. Quello che è stato **congelato con dentro**,
e che va guardato prima di fidarsi dei numeri di cassa di luglio:

- **19 spunte «dichiarate» per 31.622 €** che nessun movimento di banca dimostra
  (§226). Non sono soldi mancanti — a luglio dal conto sono entrati 28.859 € —
  sono spunte non agganciate al loro movimento.
- **2 righe sospette**: due canoni agganciati a bonifici *precedenti* al loro
  mese (uno di agosto attaccato al 17 luglio, uno di luglio al 15 maggio).
  Datarli dalla banca sposterebbe il mese di cassa: si segnalano, non si toccano.
- **Il ponte non quadra: −18.930 €** (§199). L'identità è esatta, quindi non è
  un arrotondamento: è un movimento in banca che nessuna riga giustifica, o una
  spunta su qualcosa che dal conto non è uscito. Da guardare con
  `npx tsx scripts/verify-bank.ts`.
- **L'IVA del 2º trimestre**: il tool stima 8.400 €, il modello F24 del 20/08 ne
  chiede **9.669,33**. Lo scarto (1.269 €) sta tutto sul debito: il 22% dei
  ricavi registrati fa 9.108 €, e il modello parte da più in alto. C'è
  fatturato del trimestre che il conto economico non ha.
- **2 giroconti spaiati** del 4 agosto (±550 €) e **un possibile doppione**:
  1.300 € a Gabriele Saraiello il 15 maggio, due volte.

**La `203_cash_calendar.sql` è applicata** (2026-08-08): le righe del conto
economico hanno la **data del movimento**, e da lì lo stipendio di luglio pesa
sulla cassa di agosto.

**La `204_payout_from.sql` è applicata** (2026-08-08).

Tutto il resto è già applicato. Verificato sul database il 2026-08-05,
colonna per colonna: 183→196 sono tutte applicate (`hr_people.birth_date` e
`hired_on`, `hr_incentives`, `pl_revenue_lines.risk_fund` e `pass_through`,
`revenue_stream_projects`, le tre tabelle di banca, `pl_cost_lines.partner_id`,
`clients.package` droppata). `pl_config` legge la 196: `digital_partner_pct`
**0,28** e `digital_cost_target_pct` **0**.

**Fatto finora**: il dominio economico completo (migration 168→178) — contratti
per progetto, piano dei costi con budget per area, subappalti con margine di
progetto, previsionale a sei mesi, IVA trimestrale e sezione Fiscale, stato
cliente `pending`, e la disciplina trasversale per cui **ogni valore economico è
derivato e dichiara la sua provenienza** (vedi le sezioni Economics, Tipo
cliente, Stato pagamenti).

**Committato in locale, mai arrivato in produzione** (i 52 commit di cui sopra):
- **Eliminazione clienti** singola e multipla (`deleteClients` /
  `previewClientDeletion`, caselle di selezione in `ClientiList`, conferma che
  dichiara cosa cade in cascata).
- **Cronologia rifatta** (§179): filtri sul database, statistiche esatte,
  attribuzione via `createActorClient`, ripristino che riporta indietro davvero,
  e il registro delle versioni con ciclo di 15 giorni. Migration già applicata.
- **Conservazione della cronologia** (§180): 20 giorni per riga, configurabile.
- **Budget dei costi derivato**: il tetto di un'area è la somma delle sue voci
  (non più `monthly_budget`), e il tetto del mese è il 35% del fatturato.
- **Sezione Personale** (§181): costo per risorsa, contratti italiani, TFR,
  13ª/14ª, ottimizzazioni fiscali, e la voce «Persone» del conto economico.
- **«Prepara il mese»**: una sola azione che compone contratti, piano dei costi,
  subappalti e organico, con anteprima di cosa entra prima di scrivere.
- **Agevolazioni** (§184, `lib/incentives.ts` + `lib/incentives.check.ts`):
  esoneri contributivi per persona con tetti e scadenze, rientro dei cervelli sul
  netto, maxi-deduzione e iper-ammortamento dentro la stima IRES, aliquote 2026
  aggiornate (IRPEF 33%, buono pasto 10 €, premi all'1%), tab «Agevolazioni» nel
  Personale e pannello «Agevolazioni e regimi» in Fiscale.
- **Area «Personale» in sola lettura** nel piano dei costi, con il doppio
  conteggio del costo del lavoro rimosso da «Porta nel mese» e dall'anteprima.
- **Subappalti e costi esterni** raccolti per subappaltatore (`bySupplier`),
  sezione richiudibile, fornitori aggiungibili e rinominabili in blocco.
- **Spartizione digital** (§186): sul margine dopo i subappalti, 28% a ciascun
  socio, 6% commerciale, 10% cassa, fondo rischio opzionale sopra 20.000 €, col
  commerciale letto dall'anagrafica del cliente.
- **Via i pacchetti** (187) e **un accordo, N progetti** (188): contratti
  multi-progetto con quota, e le partite di giro fuori dalle quote.
- **Banca** (189-191): due conti, import per dialetto, giroconti appaiati,
  provvista, `spendSplit`, sottoconti dei soci e le due strade per l'erogato.
- **Ponte conto economico → saldo** (§199, `lib/cash-bridge.ts`): l'identità è
  esatta, quindi un residuo diverso da zero è un movimento senza una riga che lo
  giustifichi, non un arrotondamento.
- **Un fatto, una riga** (193) e **un movimento a mano paga** (195).
- **Ripartizione maturato / incassato** (§204): stesso `computeMonth` sulle sole
  righe spuntate, così «Cassa TwoBee» si muove quando spunti «pagato».
- **Quota digital tornata al 28%** (196), che annulla la 194.
- **Rischio cliente riscritto** (§197, `lib/risk.ts` + `risk.check.ts`): motore
  puro sulle sorgenti vive, «n/d» invece di uno zero inventato, trend da due
  letture della stessa realtà, e le cinque colonne morte droppate.

**Com'è messo il database** (letto il 2026-08-05): **11 clienti** con P.IVA,
sede, SDI e commerciale · **21 progetti** dai template · **15 contratti** con 16
rate, di cui 3 multi-progetto · **5 mesi** aperti con **41 righe di ricavo** e
**89 di costo** · **47 voci** di piano · **173 movimenti** di banca · **5
persone** in organico. Nessun cliente ha più `package`.

Commerciali: Walter Giacobbe (ISF, iCura, Sartoria Condotti, Petito) · Marco
Lucci (Affinity, Seven) · Antonio Giarletta (Fatima Leo, Plus Vending) · Josè
Restaurant senza commerciale, quindi la provvigione si divide fra i soci. Walter
e Antonio **non hanno un account nel tool**: esistono solo come nome in
anagrafica, ed è il caso che §185 legge senza perdere la provvigione.

Fuori dai conti per scelta: 4 fatture ISF duplicate (14.400), GAV Sistemi (giro
di fatture, cliente interno), Gli Artigiani (stornato con nota di credito).

`npx tsx scripts/certify-cash.ts` confronta ogni spunta con l'estratto conto e
dice cosa non torna; con `--apply` scrive **solo** le date dei movimenti già
agganciati e le spunte che la banca dimostra — non toglie mai una spunta.

`npx tsx scripts/verify-invoices.ts` incrocia le tre fonti: archivio fatture
(emesse e ricevute per mese), conti BPM e Vivid (in e out per mese), e chi è
agganciato a chi. Cerca anche i **pagamenti cumulativi** — un bonifico che copre
due fatture aperte — e gli **anticipi di tasca propria**, che se non sono
registrati come movimento `manuale` per il tool non esistono (§195).

`npx tsx scripts/verify-bank.ts [mese]` passa i movimenti ai motori veri: saldo
per conto, **il ponte** (§199), certificazione delle spunte, giroconti spaiati,
movimenti senza una riga dietro, duplicati e categorie mancanti. Sola lettura.

`npx tsx scripts/verify-cash.ts <mese>` fa lo stesso con la tenuta di cassa:
gradini, esiti e registro dei compensi persona per persona.

`npx tsx scripts/verify-month.ts 2026-07-01` legge un mese dal database e lo
passa a `computeMonth`: è il controllo della catena intera col codice che gira in
pagina. Su luglio la quadratura chiude a zero — 32.225 € di imponibile, 500 € di
partite di giro, quote + costi + subappalti = 31.725 €, differenza 0,00.

**Aperto, in ordine di importanza:**

1. ~~**Fatturazione al calendario della cassa** (§224)~~ — **fatto** (§443,
   2026-09-25): le nostre senza scadenza scadono per regola, «scaduto» usa le
   fasce della cassa, il grafico ha la lettura per mese di cassa, e il costo del
   lavoro stimato è il mese vero più o meno chi entra o esce dall'organico.
   Resta aperto il **picco di tredicesima** in dicembre, che la stima non vede.
2. **Chiudere il travaso Asana** (§215-221): il codice c'è tutto, restano da passare
   in rassegna le 146 board — e poi si toglie la sezione, che è dichiarata temporanea.
3. **Quotare i progetti che mancano**: 15 contratti su 21 progetti. Chi non ne ha
   legge «da quotare», non genera righe nel mese e non entra nella stima fiscale.
   È lavoro di inserimento, non di codice: si fa dalla scheda Economics.
4. **`promoteLineToPlan`** esiste in `app/actions/costs.ts` ma non ha un pulsante
   nell'economics del progetto: una spesa registrata a mano non si può ancora
   promuovere a ricorrente da lì.
5. ~~**Attribuzione parziale**~~ — **fatto** (§444, 2026-09-25). Deals e ticket
   erano già attribuiti (azioni del commerciale con `createActorClient`, ticket
   con la sessione); a scrivere «Sistema» erano fatture, milestone e workstream,
   ora sistemate. `lib/attribuzione.check.ts` le cerca in tutte le azioni e le
   route. Resta anonimo il giro del foglio dei lead (`lib/sales-sync.ts`) anche
   quando lo lancia il bottone: è in `lib/`, fuori dall'inventario.

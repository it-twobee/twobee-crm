# Economics — tenuta di cassa, certificazione, ponte

**Tenuta di cassa** (§225, `lib/cash-runway.ts`, in cima al conto economico). Il
margine e i soldi sul conto sono due domande: il primo è **imponibile e di
competenza**, i secondi sono **lordi e con una data**. Un mese può chiudere in
utile e lasciarti a secco il 20. La sezione mette i due mondi nella stessa
schermata, e sono **scenari, non una previsione**: lo stesso saldo con dentro
cose diverse. Ognuno dichiara il suo delta, perché un numero solo non si
controlla.

**La scala ha due metà, e non sono simmetriche** (§233). Prima tutto quello che
esce comunque — uscite scoperte, IVA, compensi maturati — e sotto quello che
*potrebbe* entrare. Le uscite sono certe, gli incassi no, e mescolarli in
un'unica sequenza faceva sembrare un fatto una speranza. Da qui i **tre esiti**
in testa, che sono la sola cosa che si guarda per prima:

- **Se non incassi niente** (`floor`) — dopo uscite, IVA e compensi. È l'unico
  numero che dipende da te, e prima stava in fondo alla lista indistinguibile
  dagli altri.
- **Se pagano i puntuali** (`expected`) — le fatture ancora nei termini. Chi
  paga di solito paga: è la parte credibile.
- **Se rientrano gli arretrati** (`best`) — quelli scaduti, col ritardo del più
  vecchio scritto accanto. Non arrivano da soli: è una telefonata, non una
  previsione, e sommarli agli altri incassi li prometteva uguali.

Il verdetto ne discende, e distingue tre modi di essere in bilico: `negativo`
(non ci arrivi nemmeno incassando tutto) · `stretto` con `expected ≥ 0` (dipendi
dai clienti) · `stretto` con `expected < 0` (**dipendi da chi non ti ha
pagato**, che è un'altra cosa e vuole un'altra azione) · `regge`.

- **L'IVA è la leva, e va detta.** L'IVA che i clienti pagano entra in banca e
  finanzia fornitori e stipendi fino alla liquidazione: è legittimo e lo fanno
  tutti, ma non è capitale — è un debito con una data. `vatHeld` non è una nota a
  piè di pagina: è la quota del saldo che non è tua, e l'ultimo scenario è l'unico
  che dice se il mese regge davvero. Un'azienda in utile che resta senza soldi ha
  quasi sempre contato l'IVA due volte, una come cassa e una come margine.
- **I compensi sono l'ultimo gradino e l'unico con un interruttore** (§237).
  L'IVA ha una data, le fatture dei fornitori pure; i compensi no — «la
  decisione è quando, non se». Il tasto sta **sulla riga**, dove il numero
  cambia, e i tre esiti si spostano insieme: la domanda che si fa ogni mese è
  *quanto respiro dà rimandarli*, e senza il secondo numero quel respiro te lo
  calcoli a mente. Spenti, la riga scrive che restano da erogare: si spostano,
  non si tolgono. Con niente da erogare l'interruttore non c'è — uno che non
  cambia niente è peggio di uno assente.
- **L'IVA dichiara se scade in questo mese** (§233, `vatDueInMonth`). Si toglie
  sempre — non sono soldi tuoi nemmeno il giorno prima — ma ad agosto è un
  bonifico da fare il 20 e a settembre è un fondo da non toccare, e chiamarli
  con lo stesso nome fa preparare il bonifico sbagliato.
- **Il saldo è quello vero** — solo movimenti `banca` (§189). Contare i
  `derivato` farebbe quadrare la tenuta di cassa grazie alle spunte che la
  tenuta di cassa serve a verificare.
- **Il rotolo dei mesi** dice *quando* si rompe, non *se*: mesi già aperti →
  righe registrate; mesi chiusi → contratti e piano (sommarli entrambi
  conterebbe due volte lo stesso canone). Gli scoperti scaduti pesano sul
  **primo** mese: nella curva servono lì, non nel mese in cui erano attesi.
- **Una stima si dichiara sulla riga.** Il piano dei costi non contiene l'area
  Personale (§184: la scrive l'organico), quindi ogni mese futuro sembrerebbe
  costare novemila euro in meno. `payroll` la stima uguale a questo mese e la
  riga scrive «di cui X stimati» — e **solo** dai mesi che seguono uno non
  aperto, perché il costo del lavoro di un mese esce in quello dopo e dove le
  righe ci sono è già contato.
- **Il maturato si conta su tutti i mesi** (§233), non sulle righe che il mese
  guardato si trascina: un bonifico non sa di che mese è, e prendere i soli
  arretrati di cassa dava allo stesso registro 18.749 € su luglio e 25.557 € su
  agosto. `npx tsx scripts/verify-cash.ts <mese>` legge la sezione dal database
  e la stampa: gradini, esiti e registro dei compensi persona per persona.
- **«Mai un bonifico» guarda tutti i movimenti, non la finestra** (§233). Col
  consolidato a luglio i bonifici di giugno restano fuori dal conteggio, e
  `paid === 0` marcava «mai pagato» anche Marco, che ne ha ricevuti 6.165 € —
  quelli hanno chiuso i mesi prima della linea, ed è la ragione per cui la
  finestra esiste (§228). La stessa frase detta a due situazioni opposte è
  peggio di nessuna frase.

**Una persona costa dal mese in cui è entrata** (§233, `inForce` in
`lib/payroll.ts`). «Porta nel conto economico» scriveva l'organico di **oggi**
in qualunque mese si stesse preparando: maggio 2026 si è ritrovato il costo di
chi è arrivato a giugno, e quelle righe non restano ferme lì — sono scoperte, si
trascinano fra gli arretrati e la tenuta di cassa le conta come uscite da fare.

- **L'organico è uno solo e vale per tutti i mesi.** In quali mesi una persona
  pesa lo dice `hired_on` (con `end_date` dall'altro capo); il pagamento è il 20
  del mese dopo e discende dalla natura della voce (`mese_succ_20`), non si
  configura. L'unico modo che restava per togliere qualcuno da **un** mese era
  eliminarlo dall'organico — che lo toglie da tutti e si porta via cedolini e
  fatture col CASCADE. È successo davvero, il 9 agosto 2026:
  `supabase/RESTORE_HR_PEOPLE.sql` è il ripristino.
- **La riga resta visibile e lo dice**: chi non era ancora in forza compare in
  organico con «entra a giugno», fuori dai totali del mese. Una persona che
  sparisce dall'elenco è una persona che qualcuno riaggiunge.
- **Il confronto è fra mesi, non fra giorni**: chi entra il 20 costa quel mese,
  perché il cedolino di quel mese esiste. Senza data di assunzione si è in
  forza: l'assenza di un dato non è una data, e togliere un costo vero è peggio
  che tenerne uno da correggere. Nel consuntivo (`pushLedgerToProfitLoss`) il
  **documento batte l'anagrafica** (§182): se per quel mese c'è un cedolino o
  una fattura, la persona ha lavorato e la data sbagliata è l'altra.

**L'estratto conto certifica le spunte** (§226, `lib/cash-certify.ts`,
`scripts/certify-cash.ts`). Una spunta «pagato» è un'**opinione** finché un
movimento non la conferma, e per mesi le due cose si sono lette identiche. Sul
database vero, all'8 agosto: 24 righe certificate dalla banca e **58 dichiarate
per 70.835 €** che nessun movimento dimostra. Quattro stati, e la differenza fra
il secondo e il terzo è tutto il punto:

- **certificata** — movimento agganciato, data che combacia.
- **da datare** — il movimento c'è, la data no. Si corregge da sé, perché il
  giorno lo dice l'estratto conto e non chi ha spuntato. Ne sono state corrette
  **21**, con uno scarto medio di 13 giorni: iCura di maggio risultava incassata
  il 15 maggio e la banca dice **9 giugno**, Affinity di giugno il 15 giugno e la
  banca dice **6 agosto**. Quattro cambiavano mese di cassa.
- **dichiarata** — spuntata, nessun movimento la conferma. **Non si sbianchetta
  mai**: l'assenza di prova non è prova dell'assenza — può essere un conto non
  caricato o del contante — e cancellare l'incasso di un cliente che ha pagato
  davvero è un danno peggiore del dubbio. Si marca e si conta.
- **sospetta** — agganciata a un movimento **precedente al suo mese**. La rata
  di luglio di Josè era attaccata a un bonifico del 15 maggio: prendere quella
  data avrebbe peggiorato il dato invece di certificarlo. Si segnala, non si tocca.

Solo i movimenti `banca` certificano: un `derivato` nasce dalla spunta che si sta
verificando, e usarlo sarebbe far confermare a un'affermazione se stessa.

**L'erogato esiste solo in banca** (§226, `payoutsFromBank`). Il piano dice
quanto **spetta**; nessuna riga dice quanto è **uscito** — l'erogato non si
scrive, si ricalcola — e finché il confronto non c'è, un socio pagato per intero
e uno che non ha mai preso un euro si leggono uguali. Sul conto vero: Marco
6.165 · Toto 6.030 · Walter 8.990 · **Antonio Giarletta zero**, con provvigioni
maturate da mesi. Il pannello «Uscito davvero» sta nel conto economico, sotto i
compensi. Tre regole:

- **Il maturato si somma su tutti i mesi**, perché un bonifico non sa di che mese
  è: confrontarlo con un mese solo darebbe a chiunque uno scoperto o un anticipo
  enormi, e nessuno dei due vero.
- **Un socio che è anche commerciale è una persona sola** (`mergePeople`):
  erogato e provvigione arrivano sullo stesso conto. Tenerli separati spezzava
  il dovuto in due voci e non trovava nessuno dei due bonifici, perché due nomi
  corrispondevano allo stesso movimento e l'abbinamento si rifiutava
  (giustamente) di indovinare.
- **Il nome non basta: decide la classificazione.** Alla stessa persona si
  bonifica per ragioni diverse — a Walter sono usciti 3.000 € che pagano una
  fattura di GAV Sistemi, giro fra società collegate fuori dalle statistiche, e
  contarli come compenso gli avrebbe chiuso uno scoperto che invece esiste. Un
  compenso è un `finanziamento`; un movimento già agganciato a una riga è il
  pagamento di quella riga. Se una è classificata male si corregge la categoria
  in Banca (§189), non si aggiunge un'eccezione nel codice.

**I compensi non sono righe di costo, e per questo mancavano** (§227,
`lib/cash-runway.ts` + `payoutSchedule`, migration 204). La tenuta di cassa
diceva «resta un margine di 15.205 €» a un mese che doveva ancora erogare
**22.237 €** ai soci e ai commerciali: «se paghi tutto» pagava fornitori,
stipendi e subappalti e non chi aveva lavorato. Il motivo è strutturale — i
compensi non si scrivono da nessuna parte, si ricalcolano — quindi nessun costo
li conteneva e nessuno se ne accorgeva.

- **Un quinto gradino**, dopo l'IVA: «e poi eroghi i compensi maturati». Il
  verdetto lo guarda, ma quando è **solo** quello a far cadere il conto lo dice
  in chiaro — «regge fino all'IVA, sono i compensi a portarlo sotto» — perché
  un «negativo» secco farebbe cercare un problema che non c'è. E dichiara la
  differenza con l'IVA: i compensi **non hanno una scadenza**, la scelta è
  quando, non se.
- **Escono nel mese dopo** quello in cui maturano, come il costo del lavoro:
  il conto economico non può dire che il compenso di luglio è in ritardo il 2
  luglio. Nel rotolo dei mesi ogni quota cade dove è attesa, non tutta sul primo.
- **I bonifici si imputano dal più vecchio** (FIFO): un pagamento chiude
  l'arretrato più antico, che è l'unico ordine che una persona userebbe e
  l'unico che fa emergere un debito che si trascina.
- **Da quando si conta è una decisione, non un'inferenza** (`pl_config.payout_from`,
  default 2026-07-01: fino a giugno è tutto liquidato). Dedurlo dai mesi chiusi
  sembrava elegante e non lo era: il giorno in cui si è chiuso luglio la linea
  si è spostata da sola ad agosto e i compensi di luglio sono spariti dal
  registro senza che nessuno lo avesse deciso. **Una regola che cambia
  significato per un gesto che parla d'altro è peggio di nessuna regola.**
  `null` = si conta da sempre, come prima della 204.
- **§230 — la linea è una sola e vale per tutto** (`pl_config.settled_from`).
  Non riguarda solo i compensi: prima di luglio 2026 le **spunte** che nessun
  movimento certifica non sono lavoro arretrato (58 righe per 70.835 €, che
  segnalate per sempre insegnano solo a ignorare le segnalazioni) e l'**organico**
  di maggio-giugno contiene persone che allora non erano in forza, perché quei
  mesi sono stati preparati con l'organico di oggi. `certify` le marca
  `consolidata`: niente glifo, niente conteggio, e la testata scrive «mese
  consolidato». Dopo la linea si verifica come sempre — il consolidato è una
  data, non un interruttore che spegne i controlli.
- **§228 — la liquidazione è un fatto per persona, non una data per tutti**
  (`payoutLedger`). La linea vale per chi è stato pagato: i tre soci hanno
  bonifici fino a giugno, quindi da luglio ripartono da zero. **Antonio
  Giarletta non ha mai ricevuto un bonifico**, e a chi non ha mai preso niente
  non si può dire che fino a giugno è a posto: per lui si conta da sempre —
  1.860 € invece di 645 — e la riga scrive perché. La regola sbaglia in una
  direzione sola, ed è quella giusta: a chi è stato pagato in contanti mostra
  uno scoperto che non ha, che è un allarme falso e non una rassicurazione
  falsa, e si spegne registrando il movimento.

**La cassa è un sottoinsieme, e deve comportarsi come tale** (§232). Su luglio
l'erogato ai soci risultava **più alto** in cassa che in competenza — 4.588
contro 4.234 — il che è impossibile. Il filtro «mosso in questo mese» si
applicava a **tutte e due le gambe** del margine digital: entravano quattro rate
incassate e due soli subappalti su quattro, perché gli altri due non erano
ancora usciti. Il margine saliva da 10.944 a 12.566 e la quota del 28% con lui.

Ma il margine digital è un rapporto fra il ricavo di un progetto e i subappalti
**di quel progetto e di quel mese** (§208): filtrarne una gamba sola lo rompe.
Si incassa la rata a luglio, si paga il fornitore ad agosto, e a luglio si
distribuirebbe una quota calcolata sul ricavo lordo — soldi che sono già di
qualcun altro. Perciò `computeMonth` prende un quinto parametro, `marginCosts`:
in cassa i subappalti restano quelli **di competenza** delle righe che si stanno
contando. Cambia chi ha pagato, non quanto vale il lavoro. Il gate lo blocca con
il caso vero: cassa ≤ competenza, sempre.


## Prepara il mese (conto economico)
Un mese nasce da **quattro sorgenti**, e `previewPrefill` le conta prima di
scrivere: entrate dai contratti dei progetti · costi di struttura dal piano ·
subappalti (col progetto attaccato) · personale dall'organico. Il pannello
`PrepareMonth` mostra quanto porterebbe ciascuna e il margine che ne uscirebbe,
poi si preme. Ogni sorgente sa non duplicarsi: rilanciare aggiunge il mancante.
Se una sorgente fallisce le altre proseguono e lo scarto finisce in `skipped` —
un mese preparato a metà è più utile di un errore.

## Dal conto economico al saldo (§199, `lib/cash-bridge.ts`)
Il conto economico dice **quando il lavoro è stato fatto**, la banca **quando i
soldi si sono mossi**: non possono coincidere, e chiederlo è chiedere la cosa
sbagliata. Quello che si può pretendere è che **ogni euro di differenza abbia un
nome**, e l'identità è esatta:

    saldo = cassa cumulata del piano + IVA incassata − IVA pagata − crediti
          + debiti + (compensi maturati − erogato pagato) + conferimenti
          − imposte − oneri + apertura

Si dimostra sostituendo `piano = maturato − distribuito − costi`. Perciò il
**residuo diverso da zero non è un arrotondamento**: è un movimento in banca che
nessuna riga giustifica, o una spunta «pagato» su qualcosa che non è uscito. Il
pannello sta in Banca — dove vive il saldo vero — e porta anche il **cumulato mese
per mese** delle due letture affiancate. I movimenti `derivato` non fanno cassa:
contarli farebbe quadrare il ponte grazie a quello che il ponte deve verificare.

**Il ponte tiene il dovuto, non l'erogabile** (§286 su §199). Il termine
«compensi maturati e non pagati» **non si può allineare alla finestra**, ed è
una cosa che il codice deve dire prima che qualcuno provi a farlo: l'identità
poggia su `companyPlan = maturato − distribuito − costi`, quindi la posta deve
rimettere esattamente `distribuito − uscito`. Mettendoci l'erogabile, il residuo
si sposta della differenza e smette di significare qualcosa — e il residuo è
l'unico motivo per cui il ponte esiste.

E non è nemmeno sbagliato: sull'arco della vita dell'azienda quello che esce
**è** il maturato; la finestra decide solo *quando*. Quindi il numero resta e si
aggiunge l'altro tempo accanto — «dovuti 20.988,48 € · erogabili adesso
11.660,97 € · quando i clienti pagano 9.327,51 €» — perché due schermate che
dicono «compensi» e due cifre diverse è il difetto che si stava chiudendo.
`payableNow` **entra dall'esterno**: la regola ha dentro il consolidato (§230) e
chi non ha mai preso un euro (§228), vive in `payoutLedger`, e il ponte la mostra
senza ricalcolarla. Il gate blocca entrambe le cose: che la posta resti il
maturato, e che dichiarare l'erogabile non muova il residuo di un centesimo.



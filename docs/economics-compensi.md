# Economics — piano compensi e calendario di cassa


**Piano compensi** (`lib/pl.ts`, §185). Due formule perché sono due lavori
diversi, non per incoerenza:

- **Growth**: 15% commerciale · 30% **erogato** ai soci in parti uguali · 35%
  target costi · 10% fondo rischio · 10% residuo in cassa. Lì il lavoro lo fanno
  i soci, quindi la loro quota è erogato.
- **Digital** (§186): la base è il **margine** — ricavo del mese meno i
  subappalti di quel progetto (`pl_cost_lines.project_id`, allocati pro-quota se
  un progetto ha più righe nel mese). Sul margine: 6% commerciale · **28% a
  ciascun socio** · 10% casse TwoBee = **100%**, distribuito per intero.
  `digital_cost_target_pct` esiste e **vale zero** (§206): far contribuire il
  digital alla struttura è una leva disponibile, ma la quota dei soci non è la
  variabile da cui prendere — la struttura la copre il growth, e la cassa negativa
  in un mese a prevalenza digital è la conseguenza aritmetica, non un errore. Il
  ricavo lordo non è distribuibile perché su un lavoro affidato fuori metà è già
  di qualcun altro; sul growth invece il costo di delivery è il tempo dei soci,
  ed è già la loro quota.
- **Fondo rischio digital: opzionale, e la sceglie l'admin.** Solo sopra
  `digital_risk_threshold` (20.000 € di **valore venduto del progetto**, non
  della rata): il 9% del margine va al fondo e ciascun socio scende dal 28% al
  25%. La scelta sta su `pl_revenue_lines.risk_fund`, riga per riga — due lavori
  da 30.000 nello stesso mese possono meritare risposte diverse.
- **Conseguenza da tenere presente**: il margine digital è distribuito per
  intero, quindi il digital **non alimenta** il 35% di target costi né il fondo
  rischio ordinario del 10%. Struttura e personale li copre il growth, e in un
  mese a prevalenza digital la cassa TwoBee risulta **negativa**: il tool la
  mostra negativa perché è la verità del piano, non un errore di calcolo.
- **L'erogato ha due forme** (§191): quello in denaro e quello già uscito come
  spesa dal sottoconto del socio. `perPartner` dà `total` (quanto gli spetta),
  `spent` (già uscito) e `cash` (da versare) — e `overspent` quando ha speso più
  del dovuto, che è un anticipo sul mese dopo, non un errore.
- Con un numero di soci diverso da tre le quote non fanno 100%: `retained` lo
  dice invece di riscalarle di nascosto (due soci → 28% non assegnato, quattro →
  −28% di sforo).
- **Il commerciale è quello dell'anagrafica del cliente** (`ownerOf` in
  `lib/pl.ts`): la riga del mese vince se ne porta uno — è una fotografia, e un
  mese chiuso non si riscrive perché l'anagrafica è cambiata dopo — altrimenti si
  legge `clients.sales_owner_name`, che spesso è un segnalatore senza account nel
  tool. **Se non c'è da nessuna parte, la provvigione non resta in cassa: si
  divide fra i soci in parti uguali** (5% a testa sul growth, 2% sul digital).
- `rowToPlConfig` è l'unico mapper da `pl_config`: era scritto due volte
  (economics e scheda cliente) e la seconda copia si dimenticava ogni colonna
  nuova.

**Una pagina lunga si usa se si sa dove sono le cose** (§237, `PlNav` in
`PlClient`). Il conto economico è dodici sezioni in fila: per arrivare alle
uscite si scorreva mezzo schermo tre volte, e per tornare al numero appena letto
altrettanto. La barra in cima è appiccicata e fa due cose diverse:

- **dove vado** — un salto per sezione **col numero di quella sezione accanto**,
  nell'ordine in cui la pagina scorre. Così non è solo navigazione: è già un
  riassunto, e spesso la risposta è lì senza scendere. Una barra che elenca in un
  ordine e una pagina che scorre in un altro fa cercare due volte la stessa cosa.
- **cosa devo fare** — «N da fare»: clienti fuori dal mese, righe che non dicono
  più quello che dice il contratto, arretrati scaduti, effettivi a zero, spunte
  che nessun movimento conferma, compensi da erogare, mesi futuri in cui esce più
  di quanto entra. Non duplica i pannelli: **porta** al pannello dove sta la
  leva, perché una leva lontana dal suo risultato non la usa nessuno.

E in testata restano le azioni di tutti i giorni: «Copia dal mese scorso» e
«Svuota mese» sono in un menu, perché erano grandi quanto «Chiudi mese» e quattro
pulsanti che competono si leggono tutti, ogni volta. La conferma a due passi
dello svuotamento è dentro il menu, non è sparita.

**Due letture della ripartizione** (§204): la seconda lettura chiama lo stesso
`computeMonth` sulle **sole righe con la spunta** — entrate incassate e costi
pagati — quindi «Cassa TwoBee» si muove quando spunti «pagato», che è la domanda
che quel nome fa venire in mente. Il motore è puro, quindi non c'è una seconda
formula da tenere allineata. I **compensi** restano quelli del maturato: chi ha
lavorato ha lavorato, e un cliente lento non azzera il compenso di chi ha già
consegnato.

**La lettura è della pagina, non di un riquadro** (§210, `BasisSwitch` in
`PlClient`). Il selettore della §204 stava dentro «Ripartizione»: cambiava sette
numeri su quaranta, e i **quattro in cima** — quelli che si guardano per primi —
restavano sul maturato. Due letture della stessa sezione che non concordano sono
peggio di una sola, perché chi legge non sa quale delle due sta guardando. Adesso
i due tasti macro stanno **sopra le scorecard** e `basis` governa ogni totale:
entrate, costi, margine, incidenza e ripartizione. Tre regole:

- **Il selettore dichiara cosa esclude**, prima che uno prema: quante righe sono
  spuntate su quante, e quanti euro restano fuori. Un selettore che non lo dice
  fa credere che il numero più basso sia il numero vero.
- **Zero spuntate non è zero euro**: se nessuno ha ancora messo una spunta,
  l'incassato vale zero e la pagina lo scrive invece di mostrare un mese vuoto.
- **I compensi non seguono la lettura** (§204 resta), ma diventano dinamici lo
  stesso: sotto ogni socio e ogni commerciale compare **quanto ne copre
  l'incassato** di quel mese. La quota non cala perché un cliente è in ritardo;
  quello che cambia è quanta ne è già in cassa.

Le righe di entrata e uscita non si filtrano mai: sono i fatti, e sono anche il
posto dove si spunta. La leva e il risultato devono stare nella stessa schermata.

**Competenza e cassa sono due mesi diversi** (§224, `lib/cash-calendar.ts`, migration
203). Il conto economico sapeva **in che mese il lavoro è stato fatto**. Non sapeva
**quando i soldi si muovono**, e sono due domande: lo stipendio di luglio esce il
20 agosto, il subappalto si paga quando ha pagato il cliente, una fattura emessa il
1° vale quindici giorni. Con una sola spunta booleana la cassa di un mese conteneva
le sole righe di quel mese: agosto non vedeva un euro dello stipendio che stava
pagando, e luglio se lo teneva come se fosse uscito lì.

Tre colonne su `pl_revenue_lines` e `pl_cost_lines`, e nessuna è l'altra:
`terms` (l'accordo; NULL = lo decide la **natura** della voce) · `due_date` (la
scadenza scritta a mano, un'eccezione che vince sulla regola) · `paid_on` (quando i
soldi si sono mossi — **l'unico che fa cassa**, e lo riempie un trigger con la data
di oggi quando si spunta). Le regole stanno **solo** in `lib/cash-calendar.ts`,
mai in SQL: due copie e la seconda dimentica sempre un caso. Tre eccezioni alla
regola «entro il mese», e nessuna è un'opzione — costo del lavoro `mese_succ_20`,
subappalto `a_incasso`, entrata `giorni_15` (§177).

- **La cassa di un mese sono i fatti di quel mese**, di qualunque competenza
  (`movedIn`). Non ci si mette dentro niente di atteso: un totale che mescola quello
  che è successo con quello che dovrebbe succedere non risponde a nessuna delle due
  domande. Il selettore si chiama **Competenza / Cassa** e dichiara cosa entra e
  cosa esce prima che uno prema.
- **I compensi seguono la lettura.** In competenza sono quelli maturati — chi ha
  lavorato ha lavorato; in cassa sono quelli che il denaro passato copre davvero,
  che è la domanda a cui si risponde quando si decide quanto versare. Il maturato
  resta scritto accanto: un commerciale il cui cliente non ha pagato mostra **zero
  su X maturati**, non sparisce. (Supera §204, che li teneva fermi al maturato.)
- **Quello che non si è mosso si trascina** (`openAt`), e va visto **dove si
  spunta**: il blocco «Da mesi precedenti» sta dentro Entrate e Uscite, non in un
  riquadro altrove — una leva lontana dal suo risultato non la usa nessuno.
  Spuntare un arretrato registra **la data di oggi** e non riapre il suo mese, nemmeno
  se è chiuso: il movimento è un fatto di adesso. E la contropartita ha una riga
  anche lei — «passati in questo mese» — o la cassa avrebbe un numero senza niente
  dietro.
- **Il ritardo si legge, non si conta a mente**: bande a 15 e 45 giorni (`LATE_BANDS`),
  colore *e* parola («in ritardo di 3 giorni» e «di 54» sono due fatti diversi, un
  rosso solo li appiattisce). La riga in ritardo è **tinta**, e il pallino sta accanto
  al nome, dove l'occhio scorre. Oltre i 45 giorni non è un ritardo: è un credito da
  recuperare, e `diagnose` lo dice fra i problemi del mese.
- **In scadenza non è in ritardo**: lo stipendio di luglio, ad agosto, è il
  pagamento di agosto. Colorarlo di rosso insegnerebbe a ignorare il rosso.
- **Backfill dichiarato**: le righe già spuntate non avevano una data, e la 203
  assume **la scadenza**. Sposta l'attribuzione di cassa dei mesi già registrati, ed
  è quello che deve succedere. Senza la 203 l'app non si rompe: le colonne mancano,
  ogni riga resta nel suo mese (`assumed`) e la pagina lo dichiara invece di
  spostare numeri su una data che non esiste.

**Chi legge il calendario**: il conto economico (righe, arretrati, ripartizione),
la scorecard «Uscita di cassa» del Personale, il **previsionale** — che adesso ha
una colonna `Cassa` accanto a `Margine`, perché un canone di giugno pagato a 30
giorni è margine di giugno e soldi di luglio — e la **curva della Banca**, dove le
scadenze attese non sono più tutte datate al primo del mese. Manca la
Fatturazione. Chi aggiunge una lettura chiama `dueOf`, non riscrive la regola.

**La finestra dell'erogazione** (§286, `lib/payout-window.ts`, migration 212).
I compensi si erogano **il 20 del mese**, e quello che si distribuisce è quello
che è **maturato nel mese prima** e **rientrato entro il giorno in cui si
eroga**. Ad agosto 2026 l'erogazione è stata anticipata al 13, e la base sono
state le otto righe di luglio incassate entro quella data — comprese le quattro
arrivate a inizio agosto, che il giorno in cui luglio si è chiuso non c'erano.

Le due regole che questa supera dicevano ciascuna metà della cosa. Il
**maturato** (§227) distribuisce tutto quello che il mese ha prodotto, incassato
o no: è il numero giusto per «quanto spetta» ed è sbagliato per «quanto
bonifico». La **cassa del mese** (`movedIn`, §224/§275) prende gli incassi *di*
un mese di qualunque competenza: ci trascina dentro le fatture di maggio
rientrate a luglio — già erogate — e ne lascia fuori quelle di luglio rientrate
il 3 agosto, che sono esattamente quelle per cui si sta pagando.

- **Competenza fino al mese che si eroga, cassa fra un'erogazione e la
  successiva.** Da lì due proprietà: **niente si perde** — una fattura di luglio
  incassata il 25 agosto entra nell'erogazione dopo, perché quella finestra
  parte da dove è finita questa — e **niente si conta due volte**, perché il
  limite inferiore è esclusivo e coincide col superiore della precedente. La
  somma delle finestre è la somma degli incassi.
- **La data è un dato** (`pl_months.payout_date`, default `pl_config.payout_day`
  = 20). Un'eccezione senza un posto dove scriverla diventa un totale che
  nessuno sa più ricostruire, e soprattutto la finestra del mese dopo non sa da
  dove ripartire. Si cambia dalla sezione Compensi, e cambiarla **ricalcola**:
  le righe già pagate restano dove sono, quel bonifico è un fatto.
- **Il consolidato chiude la coda** (§230): prima di `settled_from` i conti sono
  liquidati e non si ripesca una fattura di aprile perché è rientrata adesso.
- **La sezione dichiara la finestra prima dei numeri**: quanto è nella finestra,
  quanto non è ancora rientrato («si eroga quando rientra», non sparisce), quanto
  è rientrato dopo («nella prossima»), e quante spunte sono senza data (§203:
  assunte dentro, e lo si scrive). «Genera i compensi» su una base che nessuno
  vede è il modo in cui si firma un bonifico sbagliato.
- **Non segue il selettore della pagina.** §210 dice che la lettura
  maturato/incassato governa ogni totale, e resta vero per «com'è andato il
  mese». «Quanto bonifico» ha **una** risposta, e un selettore lì farebbe
  scegliere fra due numeri entrambi presentati come il compenso.
- Lo leggono `materializePayouts`, la sezione Compensi, il report per il board
  (§274/§275) e la stima di cassa dei compensi futuri (`erogabileOf` in
  `prospetto-load`): la cassa deve aspettarsi quello che uscirà davvero, o
  promette un bonifico che non si farà proprio nei mesi in cui i clienti sono in
  ritardo. Per un mese mai aperto non ci sono spunte da guardare e il ripiego
  resta il maturato.
- **La provvigione condivisa non si scrive qui**: quando due persone si dividono
  una provvigione (Seven, 50/50 fra Marco e Toto) è un accordo fra loro, fuori
  dal tool. Il tool la attribuisce intera al commerciale del cliente, che è
  quello che l'anagrafica dice ed è l'unico dato che può verificare.

Gate: `npx tsx lib/payout-window.check.ts` (53 controlli, col caso vero di luglio
2026) · `npx tsx scripts/verify-payout.ts <mese> [--date <giorno>]` legge
l'erogazione dal database, dice riga per riga cosa entra e perché, e la
**riconcilia** con l'estratto conto e con l'archivio fatture.



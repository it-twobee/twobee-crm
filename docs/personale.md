# Personale (§181-182)

## Personale (§181-182, `/economics/personale`)

**La regola che tiene in piedi tutto (§182): tre valori, mai sommati fra loro.**
- **Costo economico** — competenze + oneri datore + TFR maturato. Va nel P&L.
- **Uscita di cassa** — netto + F24 + fatture pagate. Il TFR **non** c'è: matura
  ora, esce alla fine del rapporto, e contarlo due volte è l'errore classico.
- **Netto percepito** — dal cedolino. Per una P.IVA è **null**: Two Bee conosce
  l'importo pagato, non le imposte personali di chi fattura. In UI si dice
  «importo pagato al collaboratore», mai «netto».

`monthLedger` calcola i due piani insieme e la loro differenza è per costruzione
il solo TFR — se fosse altro, qualcosa sarebbe contato due volte.

**Il documento batte la stima.** `payslipViews` legge il cedolino; `employer_contrib`
NULL significa «non ancora avuto dal consulente», e allora si stima **dichiarandolo**
(`estimated`). Zero e NULL sono cose diverse. `ledgerAlerts` controlla quadrature
(netto vs cedolino, IRPEF vs F24), TFR mancante o su chi non lo matura, scostamenti
dal netto concordato, fatture senza documento, IVA indetraibile a costo.

**Si scrive il mese, non la RAL** (§183). Nessuno pensa in retribuzione annua:
si pensa «a Michele do 1.500 al mese». Il campo dell'organico chiede il **netto
mensile** per i dipendenti e il **compenso** per chi fattura;
`grossFromMonthlyNet` risale alla RAL per bisezione — gli scaglioni IRPEF non si
invertono con una formula. Prima il campo chiedeva l'annuo e chi scriveva «1300»
pensando al mese si vedeva 108 €/mese.

**Età e famiglia contano nei conti** (§183): `birth_date` decide se
l'apprendistato è ancora possibile (fino ai 29 compiuti) e l'avviso diventa
urgente quando mancano meno di dodici mesi; `has_children` raddoppia la soglia
dei fringe benefit esenti, e il potenziale welfare somma le soglie vere invece
di moltiplicare per un tetto medio.

**Le agevolazioni si applicano, non si sperano** (§184, `lib/incentives.ts`).
Tre leve che agiscono su tre cose diverse e **non si sommano**:

- **Esoneri contributivi** → abbassano i contributi *datore*, mai l'INAIL.
  Catalogo in `hr_incentives` (percentuale, tetto mensile *e* annuo, durata,
  finestra delle assunzioni, requisiti): under 30 strutturale al 50% entro
  3.000 €/anno per 36 mesi, nuovo esonero 2026 al 100% entro 650 €/mese
  (800 in ZES) per 24 mesi, decreto Coesione a finestra chiusa, donne
  svantaggiate, over 50, decontribuzione Sud. Il catalogo viaggia dentro
  `PayrollParams.incentives`: si corregge un tetto in SQL, non in un deploy.
- **Rientro dei cervelli** → abbassa l'**IRPEF della persona** e non tocca il
  costo aziendale di un euro: 50% di reddito esente (60% con figlio minore)
  entro 600.000 €, cinque periodi d'imposta, obbligo di restare quattro anni.
  È la leva per rendere competitiva un'offerta a chi lavora all'estero.
- **Maxi-deduzione e iper-ammortamento** → abbassano l'**IRES** in
  dichiarazione (extracontabili, mai IRAP). La maxi-deduzione entra in
  `estimateTaxes` come deduzione solo-IRES; l'IRES premiale al 20% è **finita
  col 2025** e resta in catalogo marcata scaduta, per non rimetterla nel budget.

Due regole non negoziabili: **un requisito che il tool non può verificare non
lo dichiara vero** (l'età la sa; «disoccupato da 24 mesi», «incremento
occupazionale netto», «decreto attuativo pubblicato» no: restano condizioni
scritte), e **un esonero configurato senza requisiti non si applica** — il costo
resta pieno e la riga dice perché. Un'agevolazione presa male si restituisce con
le sanzioni: vale meno di quella non presa. Ogni esonero sa anche **quando
finisce**, perché il mese dopo il costo risale e va visto prima.

**L'F24 non si ripartisce, ma può confermare una ripartizione** (§235,
`splitEmployer` in `lib/payroll-ceiling.ts`). Il modello è aggregato e non nomina
nessuno: `checkF24` dice solo se l'IRPEF dei cedolini combacia con l'erario. Però
il DM10 è la somma di quattro pezzi di cui tre si conoscono — le trattenute dei
lavoratori, i contributi dell'apprendista (aliquota **di legge** per anno, 3,11%
il primo) e lo zero dei tirocini — e quello che resta, diviso l'imponibile degli
ordinari, è l'aliquota vera: a giugno 2026 **29,57%**, dove la configurazione
diceva 30%. Due regole:

- **Il numero ricavato per differenza assorbe tutto quello che c'è dentro.** Se
  l'aliquota che ne esce sta fuori dalla banda 24–36% il modello contiene altro
  (conguagli, rate, sanzioni) e la ripartizione **non si fa**: si torna al
  listino e la riga lo scrive. Senza il controllo, la sanzione di un ritardato
  versamento diventerebbe il costo di una persona.
- **«Di legge» non è «stimato».** Il 3,11% dell'apprendista e lo zero del
  tirocinio sono fatti; marcarli come stime manderebbe a chiedere al consulente
  una conferma che non serve. La supposizione vera è una sola: l'aliquota
  ordinaria presa dal parametro invece che dal modello.

**Quanto costa davvero una persona al mese** (§235, `monthlyCeiling`). Non la
media del contratto — che non sa delle trasferte, non sa che l'apprendista paga
il 3,11% e non sa che a dicembre esce una mensilità in più — ma quello che dicono
il cedolino e l'F24. Tre numeri, tre domande:

- **ordinario** — il mese normale, quello che il cedolino descrive.
- **punta** — il mese con la mensilità aggiuntiva. Un budget costruito
  sull'ordinario salta proprio a dicembre, che è quando salta anche la cassa.
- **tetto** — l'annuo diviso dodici: il numero da mettere a budget, perché
  dodici tetti fanno esattamente quello che uscirà. Sui tre dipendenti:
  **5.392 €/mese** (8.192 € con le due P.IVA), punta 8.754 € nel mese delle
  tredicesime, contro i 6.573 € che la pagina mostrava leggendo RAL scritte a
  mano.

**Il costo del lavoro di un mese non pesa su quel mese** (§224): esce il 20 di
quello dopo. Perciò correggere agosto **non cambia la tenuta di cassa di
agosto** — nella sua finestra c'è il costo di luglio — e si vede dal mese dopo:
da settembre l'area Personale pesa 1.182 € in meno, 7.091 € sul semestre. È la
stessa ragione per cui un consuntivo di luglio non si sostituisce con una stima:
quei numeri sono già usciti.

Tre cose che il tetto tiene separate, e ognuna nasce da un numero sbagliato visto
sul LUL vero:

- **Le mensilità aggiuntive si contano dai ratei, non dal contratto.** Se il
  cedolino porta un rateo di quattordicesima quella mensilità è **già** dentro
  l'imponibile di ogni mese; quelle che il contratto prevede e il cedolino non
  ratealizza escono in un mese solo e valgono **dodici volte il rateo** — che è
  come le calcola il consulente. Contare due volte la quattordicesima sarebbe un
  errore da 1.500 € l'anno a testa.
- **Le trasferte non sono un extra: sono lo strumento** (§236). Su Michele e
  Sabrina bonus e trasferte servono ad arrivare al **netto concordato** — 1.500
  e 1.600 — e a giugno Michele ci arriva esatto *grazie* ai 57 € di trasferta:
  senza, la busta ne farebbe 1.443. Chiamarle «parte variabile» faceva sembrare
  comprimibile la parte che tiene in piedi il patto. Il tetto le divide in tre:
  quelle **a copertura** del netto (struttura), quelle **oltre** (le sole
  comprimibili — oggi zero su tutti e tre) e quanto **manca ancora**. Sabrina si
  ferma a 1.568: i 32 € scoperti entrano nel tetto, perché una promessa scoperta
  non è una spesa da decidere. Il pavimento è `hr_people.agreed_net`, che è il
  netto **promesso** e non quello uscito — scriverci 1.568 farebbe sparire lo
  scostamento invece di segnalarlo.
- **L'indennità L. 207/2024 non è un costo**: esce in busta e rientra come
  credito nell'F24 (75,25 + 31,79 = 107,04, ed è esattamente il credito del
  modello di giugno). Contarla gonfia il conto economico di soldi che tornano
  indietro il mese dopo.

**La retribuzione non è l'imponibile previdenziale**: su un tirocinio
l'imponibile è zero e l'indennità è ottocento euro. Il tetto parte dal totale
delle competenze e toglie quello che competenze non è — rimborsi e partite di
giro — e sui tre cedolini di giugno torna al centesimo con l'imponibile di chi ce
l'ha.

Il costo vero di una persona: lordo + contributi + INAIL + TFR + ratei, che sulla
RAL fanno un +40/45%. `lib/payroll.ts` = motore puro (verificato da
`payroll.check.ts`, 124 controlli). Tre principi:

- **Nessuna aliquota nel codice.** Stanno in `hr_payroll_params`, per anno, con
  `verified_at`: finché è NULL la pagina dichiara che sta stimando e l'avviso
  resta. L'INPS azienda dipende dal CCNL (29-32% nel terziario) — va confermato
  dal consulente, non indovinato.
- **Competenza ≠ cassa.** Il TFR matura e non esce; la tredicesima matura in
  dodicesimi ed esce a dicembre. `personCost` dà `total` (conto economico) e
  `cash` (conto corrente) separati.
- **Il netto è una stima e lo dice.** Mancano familiari a carico, conguagli e le
  addizionali del comune preciso.

Otto tipologie contrattuali in `CONTRACTS` (struttura: matura TFR? quante
mensilità?), il confronto dipendente/P.IVA **a parità di netto per la persona**
— paragonare una RAL a una fattura è disonesto — e `payrollHints` per le leve
legali (welfare, buoni pasto, apprendistato, premi di risultato) con i loro
tetti e i loro rischi. «Porta nel conto economico» scrive una riga per persona
nella voce «Persone», sostituendo le precedenti invece di sommarle.



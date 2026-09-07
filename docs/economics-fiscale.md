# Economics — IVA, fiscale, fatturazione, provenienza

**Un numero si scrive in un modo solo** (§231, `lib/money.ts`). L'helper `eur`
esisteva in **nove copie**, e ognuna sbagliava a modo suo: chi metteva l'euro
davanti (`€2.673`) e chi dietro, chi raggruppava le migliaia e chi no. Il
motivo non era distrazione: l'italiano di CLDR ha `minimumGroupingDigits: 2` e
**non raggruppa i numeri di quattro cifre**, quindi 2673 restava «2673» accanto
a «12.673» nella stessa colonna. Adesso c'è un modulo solo, il punto si mette a
mano — `Intl` dipende dai dati ICU con cui è compilato Node, e un motore puro
che scrive un messaggio diverso fra il gate e la pagina non è verificabile — e
l'euro sta sempre dopo.

**Struttura e subappalti non si sommano** (§188): `costs.structural` sono i costi
interni, `costs.external` i subappalti. Il **target del 35% riguarda solo la
struttura** — un subappalto è già stato tolto dal margine del suo progetto, e
contarlo anche nello scostamento lo farebbe pagare due volte alla cassa.
`costs.actual` resta il totale uscito, che è un'altra domanda.

**Partite di giro** (§188): un anticipo che torna al cliente — il budget
pubblicitario che Two Bee spende per lui — si marca `pass_through`. Entra nel
fatturato e nell'IVA (è fatturato) e in nient'altro: provvigione ed erogato su
un anticipo si prenderebbero da una tasca che non esiste.

**Un accordo, N progetti** (§188): `revenue_stream_projects` dice quali progetti
copre un contratto. Con un solo progetto vale `revenue_streams.project_id`, come
prima. Le righe di un contratto multi-progetto **non** portano un progetto: dei
3.600 di iCura non si sa quanto sia lead generation e quanto sito web, e
attribuirlo a uno dei tre falserebbe i margini.

**Piani di pagamento** (`buildSchedule` in `lib/revenue.ts`, UI in
`components/economics/CustomPlan.tsx`): acconto % + N rate, rate uguali, o
tranche a percentuali libere, con cadenza in mesi. Un solo posto che fa i conti,
usato sia sul contratto col cliente sia sul subappalto — l'ultima rata assorbe
sempre l'arrotondamento. I preset sono suggerimenti, non vincoli: dopo la
generazione ogni rata resta spostabile e se ne aggiungono a mano.

**Fiscale** (`/economics/fiscale`, `lib/tax.ts`): scadenzario SRL con anno
solare (liquidazioni IVA, LIPE, acconto IVA 27/12, saldo+1º acconto 30/06, 2º
acconto 30/11, dichiarazioni), stima IRES/IRAP proiettata sui mesi registrati,
accantonamenti effettivi contro quelli necessari, il pannello **Agevolazioni e
regimi** (§184: cosa è in vigore, cosa è scaduto, quanto vale con i numeri che il
tool ha già), e `taxInsights` — regole, non consigli fiscali. **Ogni stima dichiara la sua assunzione**: se i costi
effettivi non sono registrati la previsione è gonfiata e va detto prima del
numero, non in nota.

**Due trimestri, due domande** (§238). «Quanto sta maturando il trimestre di
questo mese» e «quanto esce alla prossima scadenza» non sono la stessa cosa: ad
agosto 2026 sono il 3º (9.250 €, 16 novembre) e il 2º (8.400 €, 20 agosto). Il
riquadro IVA mostrava il primo col titolo «IVA da mettere da parte» e la Tenuta
di cassa toglieva il secondo, mezzo schermo più su: due numeri diversi sotto la
stessa parola, e non si crede più a nessuno dei due. Adesso il riquadro li porta
entrambi con un selettore, si apre sulla **scadenza** — la domanda di cassa, la
stessa della sezione sopra — e scrive perché sono diversi. La diagnosi e la barra
in cima leggono la scadenza.

**Il modello F24 batte la stima** (§242, `vat_settlements`, migration 206).
`lib/vat.ts` stima l'IVA dalle righe registrate — debito meno credito, più l'1%
dell'opzione trimestrale — ed è la stima giusta per sapere quanto mettere da
parte. Sarà **sempre** diversa dal modello: il registro IVA del commercialista
contiene fatture che il conto economico non ha ancora. Sul 2º trimestre 2026 il
tool dice 8.399,87 e il modello del 20 agosto chiede **9.669,33** (cod. 6032).

- **Quando il documento arriva, vince il documento**, come per i cedolini (§182).
- **La differenza resta scritta**, e non è rumore: il 22% dei ricavi registrati è
  un numero esatto (9.108,00 di debito), quindi lo scarto di 1.269,46 è
  **fatturato del trimestre che il conto economico non ha**. È l'unico posto in
  cui quel buco si vede senza andarlo a cercare.
- **Il riporto al trimestre dopo nasce dal saldo calcolato**: sostituirlo con un
  numero che il modello non contiene sposterebbe l'errore avanti invece di
  mostrarlo. Debito, credito e riporto restano quelli del motore; cambia solo
  quello che si versa.
- Lo leggono **tutte e due** le sezioni — Fiscale e il conto economico — o
  tornerebbero a dire due numeri diversi con lo stesso nome (§238). Nello stesso
  F24 ci sono anche ritenute, crediti e INPS: quelli sono costo del lavoro e
  stanno in `hr_f24`, non qui. Sommarli farebbe costare diecimila euro un mese di
  stipendi.

**Il fatturato nel tempo** (§278, `billingSeries` in `lib/invoices.ts`,
`components/charts/BillingChart.tsx`, in cima a Fatturazione). Emesso, rientrato,
in attesa e previsionale erano quattro numeri in quattro riquadri, e la domanda
«come andiamo» bisognava comporla a mente. Una forma sola, due letture — barre
per «quanto in ciascun mese», linea per «come si sta muovendo» — e il selettore
cambia la **forma, mai i numeri**: un grafico che cambia i totali quando cambi
vista è un grafico di cui non ci si fida più.

- **La barra è una divisa in parti**, non tre barre da sommare: pieno =
  rientrato, smorzato = credito aperto, grigio = stornato. Stessa convenzione
  delle altre barre dell'economics.
- **§279 — una nota di credito non è credito in attesa.** Scalava l'emesso —
  giusto in dichiarazione — ma produceva un «in attesa» negativo: una fattura
  stornata non è un incasso che deve ancora arrivare, è un incasso che **non
  arriverà mai**, e le due cose chiedono due azioni diverse (telefonare, o non
  fare niente). `credited` è una grandezza sua e `pending` non scende mai sotto
  zero. Sui dati veri: 98.550 € emessi lordi, di cui **10.500 stornati**
  (7.200 a maggio, 3.300 ad agosto).
- **§280 — nel grafico stanno solo tre cose: netto, rientrato, in attesa.**
  L'altezza della barra è il **fatturato netto**, e lo stornato non è una terza
  parte — disegnarlo alzerebbe una barra che il fatturato non ha. Resta scritto
  nel riquadro del mese, dove spiega perché il netto è più basso dell'emesso.
- **§281 — una fattura può non essere né incassata né da incassare**
  (`invoices.excluded_reason`, migration **210**). L'archivio conosceva due
  stati; sui dati veri ne servivano tre, e il terzo vale **nove documenti su
  trentanove**: le ISF duplicate con le loro note di credito, la Gli Artigiani
  stornata, la Tailors emessa due volte. Non sono crediti — nessuno telefonerà
  mai per averli — e fra gli «in attesa» gonfiavano lo scaduto. Non si
  cancellano: esistono, sono passate dallo SDI. Si dichiarano fuori **col
  perché accanto**, perché un'esclusione senza ragione fra sei mesi non si
  distingue da una dimenticanza — per questo la colonna è di testo e non un
  booleano. Escono dal netto e dall'atteso come le note di credito; restano nel
  conteggio dei documenti, che è un'altra domanda. Lo stato vero dell'archivio
  lo scrive `supabase/FIX_INVOICES_STATE.sql`, e **le date vengono
  dall'estratto conto**: dove il movimento non è unico la fattura resta in
  attesa, che è meglio di una data inventata.
- **Sotto il grafico, le fatture che devono rientrare** (§280,
  `PendingInvoices`): un totale non si insegue, si insegue una fattura con un
  nome. In ordine di **ritardo** — 14 aperte per 47.732,50 €, la più vecchia da
  86 giorni — e con le due strade che sono due fatti diversi: **il movimento
  c'è già** (candidati da `txCandidates`, un clic e la data è quella del
  movimento) oppure **deve ancora arrivare**, e allora l'unica cosa vera da
  scrivere è **quando** (`setInvoiceDue`). Senza una data una fattura non è né
  scaduta né attesa: sparisce dalle telefonate da fare. La terza strada —
  «segnala incassata» — resta per il contante, e dichiara di essere una spunta
  che nessun movimento dimostra (§226).
- **Il previsionale ha un'altra forma**, tratteggiata, e viene dai contratti
  firmati (`linesForMonth`, §176): 76.850 € da settembre a dicembre. Disegnarlo
  pieno accanto allo storico lo farebbe leggere come un fatto.
- **Il pallino porta il numero**: il riquadro sul mese dà i quattro valori e la
  quota rientrata, e l'asse resta pulito. Dal grafico si prende la direzione,
  dal numero la decisione.

**IVA** (`lib/vat.ts`): l'IVA incassata non è cassa disponibile. Liquidazione
trimestrale, scadenze ordinarie 16/05 · **20/08** · 16/11 · 16/03 (il quarto con
la dichiarazione annuale), 1% di interessi sui primi tre. Il credito di un
trimestre si riporta sul successivo — per questo il conto economico carica
**tutto l'anno** e non solo il trimestre.

**Durata del rapporto e rinnovo** (§179, `relationship()` in
`lib/client-economics.ts`): dal **primo contratto venduto**, non da
`clients.contract_start`. Il rinnovo è l'ultimo contratto a scadere, e se un
canone è a tempo indeterminato non c'è nessun rinnovo da aspettare. Senza
contratti l'indicatore dice perché, invece di mostrare mesi inventati.

**Provenienza obbligatoria**: ogni punto del tool che mostra un valore
economico passa da `lib/economics-source.ts` (`mrrOrigin`, `CONTRACT_PERIOD_HINT`,
`PAYMENT_STATUS_HINT`, `economicsHref`). Un numero senza «da N contratti» / «da
anagrafica» accanto è un numero di cui nessuno si fida: non aggiungerne.
Nessun campo economico è editabile fuori da Economics — niente inline edit
dell'MRR in intestazione o in lista.

Le server action in `app/actions/revenue.ts` prendono un `RevCtx`
(`{ projectId, clientId }`): serve a revalidare tutte le viste che mostrano lo
stesso contratto. Passalo sempre completo.



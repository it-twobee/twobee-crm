# Economics — contratti, rate, subappalti

## Economics — una sola fonte, tre letture
Il contratto (`revenue_streams` + `revenue_installments`) è **l'unico posto dove
si scrive un importo**. Tutto il resto lo legge:

- **Anagrafica cliente**: `mrr`, `contract_start/end`, `payment_status` sono in
  sola lettura e li scrivono i trigger della 169. `mrr_source='anagrafica'` =
  valore storico, nessun contratto ancora. Non riaprire quei campi in edit.
- **Economics del cliente** (§194, `ClientDealsPanel` dentro `ClientEconomicsTab`):
  **l'unico posto dove si quota**, organizzato per **lavoro**. Un riquadro per
  progetto — anche senza contratti, marcato «da quotare» — e dentro ciascuno le
  due metà del patto: `ContractsPanel` (quanto paga il cliente) e
  `ProjectCostsPanel` (quanto si dà via), col margine del lavoro in testata.
  Prima c'erano due posti dove scrivere lo stesso accordo, cliente e progetto, e
  il conto economico lo contava due volte. In fondo gli «Accordi senza progetto»
  (quota partner, retainer) con scritto che **non entrano nel margine di nessun
  lavoro**. Non filtrare i progetti privi di righe: sono esattamente quelli da
  vedere. **Solo super admin e admin**: il gate è `isAdminRole(app_role)`, non
  `role === 'admin'` — quello è la mappatura grossolana per le RLS e ci farebbe
  cadere dentro chiunque sia stato promosso admin di ruolo.
- **Sola lettura a valle**: nel conto economico l'importo di una riga
  `origin='contratto'` non è modificabile e la riga porta due link — il progetto
  e «modifica l'accordo», che apre l'economics del cliente. Lo stesso per i
  costi: preventivato bloccato, lucchetto che linka la fonte. **Quando cade una
  rata, quanto vale e chi la eroga si decide in un posto solo.**
- **Economics del progetto** (`ProjectEconomics`): stesso pannello ristretto a
  un lavoro. Entrambi montano `components/economics/ContractsPanel.tsx` — se
  cambi il comportamento dei contratti, cambia lì e basta.
- **Regola d'ingresso** (§176): l'economics **nasce dal progetto e solo se ha un
  cliente**. Progetti interni o senza cliente non hanno la scheda. Tutti gli
  accordi sono **IVA esclusa**: nessun campo IVA nei contratti né nei
  subappalti, l'IVA vive solo in Fiscale & Tasse (a debito e a credito).
- **Wizard** (`StepEconomics`): quota, modalità, rate e subappalto si decidono
  alla creazione. Passo visibile solo dal portale admin e solo con un cliente;
  `attachWizardEconomics` ricontrolla il ruolo lato server e fallisce da sola
  senza travolgere la creazione del progetto.
- **Previsionale** (`lib/forecast.ts`, in fondo al conto economico): i sei mesi
  che verranno, calcolati da contratti, rate e subappalti. «Apri il mese» crea
  le righe vere (`openMonth`), da lì in poi valgono le spunte fattura/incassato
  /pagato.
- **Preventivato derivato, effettivo scrivibile**: nel conto economico il
  preventivato di una riga nata dal piano, dall'organico o da un movimento è in
  **sola lettura** — riscriverlo creerebbe un secondo numero che dice un'altra
  cosa. Il lucchetto linka la fonte, e `syncBudgetsFromPlan` spinge nel mese le
  correzioni del piano (solo il preventivato: l'effettivo l'ha registrato una
  persona che ha visto la fattura). L'effettivo **nasce uguale al preventivato**:
  uno zero non significa «non speso» ma «nessuno l'ha guardato», e a fine mese si
  legge come un costo che non c'è stato — novemila euro di stipendi sparivano così.
  Le righe rimaste a zero col preventivato pieno sono segnalate in cima con un
  pulsante che le allinea.
- **Costi e budget** (`/economics/costi`): il piano delle uscite — aree con
  budget mensile, spese ricorrenti con la loro frequenza, fissi contro
  variabili. «Porta nel mese» crea le `pl_cost_lines` dal piano (idempotente).
  `lib/costs.ts` = calcoli puri. L'importo di una voce è quanto costa **ogni
  volta che torna**, non la dodicesima parte: un annuale pesa tutto nel mese in
  cui si paga. **Solo costi interni e societari**: le voci con `project_id`
  (subappalti) sono filtrate via, altrimenti il budget di un'area si muoverebbe
  per una lavorazione venduta al cliente.
- **Personale, in sola lettura** (§184): l'area del costo del lavoro si chiama
  `Personale` (`PAYROLL_CENTER` in `lib/costs.ts`) e da `/economics/costi` si
  **legge soltanto** — nessun rinomina, nessuna voce, nessuna modifica: il
  blocco vero è in `app/actions/costs.ts`, non nei pulsanti nascosti. Quelle
  righe le scrive la sezione Personale leggendo cedolini e contratti, e
  `applyPlanToMonth`/`previewPrefill` escludono l'area a monte: prima veniva
  contata due volte, una dal piano e una dall'organico.
**Le righe del motore si costruiscono in un posto solo** (§287, `lib/pl-rows.ts`).
`computeMonth` non legge il database: legge `RevenueLine` e `CostLine`, e
qualcuno deve costruirli. Quel qualcuno era **dieci volte** — la pagina del conto
economico, quella della banca, il caricamento del prospetto, l'azione che scrive
i compensi e sei script di verifica — e ogni copia portava un sottoinsieme
diverso dei campi.

Non è disattenzione: **niente costringeva a ricordare**. E la conseguenza non è
un errore che si vede, è un numero **plausibile e sbagliato**, che è la sola
categoria di errore che nessuno va a controllare. Tre trovati in un giorno solo:
`materializePayouts` — l'azione che *scrive* i compensi — costruiva le righe
senza `project_value`, quindi nessuna risultava eleggibile al fondo rischio
(§186) e copiava in tabella **4.340,78 € a socio invece di 4.045,95**;
`verify-cash` aveva lo stesso buco, quindi **confermava** l'errore invece di
trovarlo; il report per il consiglio non portava `installment_id` e diceva un
centesimo diverso dalla pagina.

- **La checklist è il tipo, non la buona volontà**: `REVENUE_FIELDS` è dichiarato
  `Record<keyof RevenueLine, true>`, quindi aggiungere un campo al motore **non
  compila** finché non lo si elenca, e il gate verifica che il mapper lo porti
  davvero da una riga di database — non che lo prometta.
- **Il contesto si costruisce una volta** (`rowContext`): chi è il commerciale
  del cliente (§185), quali progetti copre un accordo (§207), quanto vale il
  lavoro venduto (§186). Erano tre mappe riscritte in ogni pagina, e ogni copia
  ne dimenticava una.
- **Gli script di verifica passano da lì come le pagine.** Un controllo che
  costruisce le righe a modo suo non verifica il codice che gira in pagina:
  verifica sé stesso, ed è il motivo per cui questi difetti sono sopravvissuti
  a tre script di controllo.

Gate: `npx tsx lib/pl-rows.check.ts` (31 controlli, col caso Seven a confronto —
contesto intero contro contesto vuoto).

**Il subappalto ha una gerarchia, e sta scritta in ogni sezione** (§192,
`lib/subcontracts.ts`). Un lavoro affidato fuori è **un fatto solo visto da quattro
posti**, e finché ognuno se lo raccontava a modo suo i conti non tornavano:

1. **Sorgente — la scheda Economics del progetto.** Importo, fornitore, frequenza,
   finestra: si scrivono lì e solo lì. Ogni voce mostra dov'è arrivata («da
   portare», «nel mese», «pagata», «scostata»), col vocabolario del conto economico.
2. **Atterraggio — il conto economico.** «Porta nel mese» crea l'occorrenza; lì si
   scrive **quanto è uscito davvero** e **se è pagato**, mai il pattuito. La
   sezione «Lavori affidati fuori» mostra ogni riga con fornitore, progetto e
   cliente cliccabili, il margine per progetto (ricavo − esterni) e cosa non
   torna: `subcontractFindings` segnala le **orfane** (riga con progetto e senza
   voce di piano: il margine la paga e la scheda progetto non la vede), gli
   scostamenti, i fornitori senza nome, i margini negativi e i mesi in cui il
   costo cade e la rata no.
3. **Lettura — Costi & budget e la scheda cliente.** Raggruppano e sommano; il
   primo per subappaltatore (lì si rinominano i fornitori, che è un'operazione
   trasversale), il secondo per capire quanto di un cliente esce verso qualcun
   altro. **L'importo non è modificabile in nessuno dei due**: la riga porta il
   link al progetto.

In una riga: **il patto si scrive sul progetto, il fatto nel mese, tutto il resto
legge.**

**Un fatto, una riga** (§193). L'economics del cliente e quella del progetto sono
la stessa tabella vista da due punti: senza un vincolo, generare il mese da tutte
e due creava **due ricavi per la stessa fattura** — sui 10.000 € del CRM di
Industrial Service faceva 6.500 € di fatturato inventato. Ora è il database a
impedirlo: indice unico su `installment_id`, e un trigger per le lavorazioni «una
tantum», che atterrano in un mese solo. `subcontractFindings` segnala anche le
righe rimaste nel **mese sbagliato**: due mesi che pagano lo stesso acconto hanno
entrambi un margine falso.

**La riga copia il contratto, e il contratto può cambiare dopo** (§207,
`contractDrift` in `lib/revenue.ts` + `lib/pl-realign.ts`). Il conto economico non
rilegge l'accordo: se lo copia quando il mese si prepara. Per i **fatti del mese**
è giusto — fatturata, incassata, chi era il commerciale allora — ma il **Tipo** non
è un fatto del mese: è growth o digital, e decide il **15% sull'imponibile** o il
**6% sul margine**. Correggerlo sul contratto lasciava indietro i mesi già
preparati, che continuavano a pagare la percentuale di un altro mestiere: sui
1.625 € di una rata di Fatima Leo, 243,75 invece di 97,50, senza un numero che lo
dicesse. Da qui tre regole:

- **`updateStream` riallinea da sé** i mesi **aperti**. Un mese chiuso è una
  fotografia e non si aggiorna perché la realtà è cambiata dopo.
- **Si riallinea l'accordo, non il mese**: tipo, progetto, IVA e partita di giro.
  Gli importi no — un canone partito a metà mese vale mezzo canone, e quella è
  una decisione presa da una persona guardando quel mese.
- **Il Tipo di una riga da contratto è in sola lettura** nel conto economico, col
  lucchetto che linka l'accordo e la percentuale scritta sotto. Finché era una
  select c'erano due risposte alla stessa domanda e niente diceva quale valeva.

Le righe rimaste indietro le mostra un avviso in cima alle Entrate con «Allinea ai
contratti»; `npx tsx scripts/verify-month.ts <mese>` lo dice dalla riga di comando.
Serve perché **la quadratura chiude a zero anche sui numeri sbagliati**: le quote
tornano lo stesso, solo prese dalla tasca di qualcun altro.

**Un accordo su N progetti, in codice** (§207). La 188 era solo tabella: nessuno
leggeva `revenue_stream_projects`, quindi una riga si prendeva il primo dei tre
progetti. Adesso `coveredProjects` decide — un progetto solo → la riga lo porta;
più d'uno → **non ne porta nessuno** (§188) ma li conosce tutti, e il margine
digital toglie i subappalti di **tutti quelli coperti**: senza, la quota si
prenderebbe su un ricavo di cui una parte è già del fornitore. Dove il ricavo non
è attribuibile il margine di progetto dice **n/d** invece di un negativo, e
`subcontractFindings` non manda a cercare una rata che è al posto suo.

**Spostare la scadenza sposta il mese** (§209, `lib/pl-realign.ts`). Il conto
economico **materializza** rate e lavorazioni: una volta scritte, cambiare il
piano non le muoveva, e sbagliare il mese sbaglia **due** mesi — quello che
perde il fatto continua a contarlo, quello che lo riceve non lo vede. Sul digital
il danno è doppio, perché il margine è ricavo meno subappalti *dello stesso mese*.
Adesso:

- `updateInstallment({ due_month })` sposta la riga di ricavo (creando il mese di
  destinazione se non c'è); `{ amount }` ne aggiorna l'importo.
- `deleteInstallment` e `generateInstallments` **tolgono** le righe delle rate che
  spariscono: `installment_id` è `ON DELETE SET NULL`, quindi restavano a
  fatturare senza più un contratto dietro, invisibili a ogni controllo.
- `updateCostItem`/`updateProjectCost` spostano l'occorrenza di una **una tantum**
  (§193: vive in un mese solo). Le ricorrenti no: hanno un'occorrenza per mese e
  cambiare la finestra non dice quale mese debba emigrare dove.
- Rateizzare una lavorazione già portata nel mese toglieva… niente: restava il
  costo intero **più** le tranche. Ora le occorrenze non pagate spariscono con la
  voce, e se una è **pagata** l'operazione si rifiuta dicendo in quale mese.

**I mesi chiusi non si toccano**, né in uscita né in entrata. E i **compensi non
si riallineano**: non sono scritti da nessuna parte, si ricalcolano a ogni lettura
dalle righe — è il motivo per cui basta mettere la riga nel mese giusto perché
provvigioni, erogato e quote digital tornino da sé.

**Il netto digital si fa mese per mese** (§208). La base delle percentuali è
**la rata di quel mese meno il subappalto che cade in quel mese**, mai il totale
del progetto e mai una quota spalmata: 6.500 in 4 rate con 650 di grafico pagati
ad agosto fanno agosto 1.625 − 650 = 975 (6% = 58,50 · 28% = 273 a socio) e gli
altri tre mesi 1.625 pieni. Vale identico se il subappalto è una tantum o
rateizzato (conta l'occorrenza del mese), se il cliente paga a corpo o a rate, e
se più rate dello stesso progetto cadono insieme (il costo si spartisce fra loro
in proporzione). Finché l'effettivo non è scritto vale il preventivato, altrimenti
si distribuirebbe un margine che il fornitore si porta via il mese dopo.

**Il tetto a zero non è un silenzio**: se il subappalto supera la rata, il margine
si ferma a zero — una quota negativa non si eroga — ma la differenza è uscita di
cassa che **non ha ridotto nessuna quota**. Ogni mese torna lo stesso, e sulla
vita del progetto commerciale e soci hanno preso su una base più alta del margine
vero: per questo `plan.digitalExcess` la conta, la riga scrive «+X oltre la rata»
e la diagnosi la segnala. Il caso gemello — costo in un mese dove quel progetto
non ha rata — lo dice `subcontractFindings` con «nessun ricavo nel mese».

**Il subappalto sa quale rata finanzia** (§285, `cost_items.installment_id`,
migration 212). §208 dice *quando* un costo esterno esce dal margine — il mese —
e per anni è bastato, perché `splitCostLikeClient` genera una tranche per ogni
rata del cliente e le dà lo stesso mese. Ma il legame restava **nel nome**
(«… — Rata 1 di 6»), che è una stringa, e da lì due danni.

- **L'attribuzione era proporzionale anche dove si poteva sapere.** Due rate
  dello stesso progetto nello stesso mese si dividevano i subappalti in
  proporzione all'imponibile: su Seven a luglio l'acconto avrebbe portato
  2.463,14 invece dei suoi 2.459,33 e la rata 2.668,41 invece di 2.672,22. Il
  totale tornava — ed è il motivo per cui non se ne accorgeva nessuno — ma la
  base di ogni singola riga era sbagliata, e basta che una sola delle due abbia
  il fondo rischio (§186) perché cambi anche il totale.
- **Una tranche datata altrove usciva dal margine del mese sbagliato.** Il
  grafico di Fatima, 650 €, era sul piano ad agosto contro la rata 1/4 che
  matura a luglio: luglio distribuiva 1.625 interi e agosto toglieva un costo
  che non aveva un ricavo da nettare. E lì il progetto non poteva salvare la
  situazione, perché **la riga di ricavo non ne ha uno**: quel contratto copre
  tre lavori (§188), quindi non porta un progetto e l'attribuzione per progetto
  non la raggiunge in nessun modo. La rata è l'unica cosa che le mette in
  contatto.

Tre conseguenze, e nessuna è un'opzione: **il mese lo decide la rata** (`fallsIn`
guarda il legame prima di `start_month`, per le una tantum) · **spostare la rata
sposta il subappalto** (§209, `moveInstallmentLine`, sia la voce di piano sia
l'occorrenza già nel mese — non quella già pagata, che è un fatto) · **quello che
non dichiara una rata si comporta esattamente come prima**, proporzionale sul
progetto, che è il ripiego giusto quando non si sa niente di meglio.

- **Subappalti** (§173): una voce di piano con `project_id` è una lavorazione
  affidata fuori. Si crea dalla scheda Economics del progetto, finisce da sé
  nell'area «Delivery & Fornitori» e dà il **margine del progetto** (ricavo del
  mese − costi esterni). Il tempo del team interno NON va lì: sta nel costo del
  lavoro aziendale, e mescolarli darebbe un margine che nessuno può calcolare.
- **Conto economico** (`/economics`): `generateRevenueFromClients` copia i
  contratti attivi nel mese (`origin='contratto'`); i clienti **senza nemmeno un
  contratto** entrano con l'MRR d'anagrafica (`origin='anagrafica'`, segnalati
  come «senza contratto»). Il ripiego è per cliente, mai globale.



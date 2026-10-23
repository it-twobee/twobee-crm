# Assistente AI agentico (§314)

Slide-over con Ctrl+J, montato nei layout `(dashboard)` e `(workspace)`. Non
risponde soltanto: chiama le funzioni dell'app **con i permessi di chi ha
scritto**. Fuori dai portali cliente e risorsa (quelli sono v2).

**Il modello non è mai l'autorità sui permessi.** Tre strati indipendenti, e
ognuno regge da solo se gli altri due cedono:

1. **`toolsFor(ctx)` filtra il catalogo** prima di mandarlo al modello: un junior
   non riceve `get_financials` e non sa nemmeno che esiste. È l'equivalente della
   voce di menu nascosta — **comodità, non barriera**.
2. **Ogni `run` richiama i guard già esistenti** dei server action. Non si
   riscrive l'autorizzazione dentro i tool: se AI e UI applicassero due regole
   diverse, prima o poi divergono e l'AI diventa la scorciatoia.
3. **Tutte le letture passano da `ctx.sb`**, il client col JWT dell'utente, mai
   dal service role. Così la RLS resta il pavimento. Nel workspace i clienti si
   leggono da `clients_workspace`, che azzera MRR e dati fiscali **in tabella**.

**Le regole di accesso stanno in un modulo puro** (`lib/ai/tools/access.ts`) e non
inline nei tool, per un motivo pratico: il registry importa i server action,
quindi `lib/ai/tools/index.ts` **non si carica fuori da Next** (`react.cache`) e
la matrice dei ruoli si potrebbe provare solo facendo login come quattro persone
diverse. Sul database quei quattro ruoli sono due: **`freelance` e `partner` non
hanno un account**, quindi quelle righe della matrice non sarebbero verificabili
in nessun modo. `accessFor(name)` **lancia** su un nome non dichiarato: un tool
nuovo non entra nel catalogo senza che qualcuno decida chi lo vede.
Gate: `npx tsx lib/ai/tools/access.check.ts` (44 controlli).

**Le azioni rischiose non eseguono** (`risky: true`): parcheggiano gli argomenti
in `ai_pending_actions` e restituiscono al client **solo un `pending_id`**. Il
client conferma con quell'id e nient'altro, quindi non si può far confermare una
cosa ed eseguirne un'altra dai devtools. `consumed_at` si marca **prima** di
eseguire, con update condizionale su `consumed_at IS NULL`: doppio clic ≠ doppia
eliminazione. Scadenza 5 minuti, RLS deny-all sulla tabella.

**Gli errori tornano al modello, non vengono sollevati**: un tool che fallisce
risponde `{ error }` e il modello si autocorregge nello stesso turno invece di
far fallire la conversazione. Le action di main **lanciano**, quindi i tool le
avvolgono in `attempt()`.

**Due cose misurate su `openai/gpt-oss-120b`, e il codice le assume:**
- **Non emette tool call parallele.** Una sola per turno, anche chiedendone due
  esplicitamente; le risolve in sequenza. Per questo `MAX_ROUNDS` è **6** e non 4:
  con quattro giri una domanda composta tornava a metà.
- **Sull'azione che modifica i dati è incoerente**: a volte chiede conferma **a
  parole** invece di chiamare lo strumento, e allora la card di conferma non
  nasce, l'utente scrive «sì» e l'azione parte **avendo scavalcato** la UI. La
  mitigazione è nel system prompt («la conferma la gestisce l'applicazione, non
  tu») e nel **non scrivere la parola "conferma" nelle description dei tool
  mutanti**: è quella che lo induce a fare da sé il lavoro dell'app.

**Vincoli sui tool**: description ≤ 15 parole e schema con `enum` — i modelli
piccoli sbagliano su descrizioni lunghe e campi liberi. Gli stati task nell'enum
sono quelli del CHECK: **`in_review`**, non `in_revisione`.

**La risposta si formatta, non si stampa** (`lib/ai/format.ts` + `AssistantAnswer`).
Il pannello mostrava il Markdown grezzo con `whitespace-pre-wrap`: alla prima
domanda vera il modello ha risposto con una **tabella a pipe di cinque colonne** e
a schermo si leggeva `|--------|-------|`, con ogni riga spezzata a metà. Su un
telefono era illeggibile. Due lati, e servono entrambi:

- **Il prompt chiede di non usare tabelle** (sezione «COME SCRIVI»): un elenco, una
  cosa per riga, date in giorno/mese, stati a parole («da fare», non `da_fare`),
  niente UUID a schermo. Misurato: cambia davvero l'output.
- **Il renderer regge comunque**, perché un prompt è una preferenza e la tabella è
  **intermittente** — nella stessa prova, senza le regole, a volte non compare.
  Una tabella in 420px non si salva con `overflow-x`: si legge scorrendo, cioè non
  si legge. Quindi la si **ribalta** in righe, titolo sopra e il resto sotto in
  piccolo. `parseAnswer` è puro, quindi lo importa un componente client.

Gate: `npx tsx lib/ai/format.check.ts` (27 controlli, col caso vero dello
screenshot).

**Un elenco tagliato deve sapere di essere tagliato** (§315). Il difetto che ha
aperto il giro: alla domanda «le milestone di Metroquadro» l'assistente ha
risposto «non trovo un cliente **o progetto** con quel nome» dopo aver chiamato
`search` e `list_clients` — `list_projects` non l'aveva chiamato, e `search` non
copre progetti e task (lo dice la sua description). Un «non esiste» detto al
posto di un «non l'ho trovato qui» è la categoria di errore che nessuno va a
controllare, ed è la stessa che si presenta in altri tre modi:

- **I nomi si cercano** (`list_projects.nome`, `list_tasks.titolo`): senza un
  filtro per nome l'unico modo di trovare un progetto era elencarli tutti e
  guardarli a occhio. E una ricerca per nome **ignora il default «solo
  attivi»/«solo aperte»**: chi cerca un titolo preciso vuole quella riga, anche
  chiusa — restringere lì produce un «non esiste» falso in un altro modo.
- **Il totale è un dato, non il numero di righe che si è visto** (`listInfo` in
  `tools/types.ts`): il cap sulle liste è necessario, ma senza il totale il
  modello conta quello che ha in mano — venti task su settanta diventano «hai
  venti task». Ogni tool di elenco fa `count: 'exact'` e, quando taglia, dice
  quanti ne restano fuori e come vederli. **`search` non lo dichiara di
  proposito**: `globalSearch` limita ogni sorgente a monte (6 clienti, 8
  messaggi, 6 documenti), quindi un totale costruito lì sarebbe la stessa bugia
  scritta con più sicurezza.
- **Il risultato si tronca per righe, non per caratteri** (`capResult`):
  `JSON.stringify(x).slice(0, cap)` consegnava al modello un JSON rotto in mezzo
  a una stringa, in silenzio. Si dimezza la lista più lunga finché sta nel tetto
  e si dichiara il taglio; se un solo elemento non ci sta, un errore leggibile
  batte un JSON invalido.
- **Una risposta tagliata dal tetto di token lo dice** (`finish_reason: 'length'`)
  **e va nel log come turno non riuscito**: altrimenti non si scopre mai che
  `AI_MAX_TOKENS` è troppo basso. Stessa regola della trappola di osservabilità
  già scritta sopra — dove un errore diventa una risposta gentile, il turno deve
  portarsi dietro il motivo.

Due difetti gemelli chiusi nello stesso giro. **La milestone di sistema è una per
workstream** — Metroquadro ne ha sei — e `create_task` senza `milestone_id`
sceglieva con `order('milestone_type')`, che fra le sei non ne distingue nessuna:
la task atterrava nel filone che decideva Postgres e il messaggio non diceva
quale. Ora il tipo si filtra per valore (`'system'`, il CHECK della 147), si
prende il primo workstream per `sort_order` e la conferma **dice dove è
atterrata**. E la route `/api/ai/assistant/confirm` scriveva in
`ai_assistant_messages` col service role **senza verificare di chi fosse la
conversazione** (la route principale lo fa in `ensureConversation`): un id
qualunque dai devtools infilava un messaggio «assistente» nella conversazione di
un collega, che `loadHistory` gli rimetteva nel contesto al turno dopo.

Gate: `npx tsx lib/ai/tools/result.check.ts` (15 controlli su `listInfo` e
`capResult`, coi casi che a mano non si incrociano — lista da 400 elementi,
elemento singolo non riducibile, `count` assente).


## Il connettore di Claude (§493, `lib/mcp/**`, `/api/mcp`)

Gli stessi strumenti di Ctrl+J, dentro Claude: si aggiunge da **Connettori →
Aggiungi connettore personalizzato** con l'indirizzo del gestionale seguito da
`/api/mcp`. Il login è quello del gestionale, e ognuno vede quello che vede già.

**Come entra.** Claude chiama `/api/mcp` senza token e riceve 401 con
`resource_metadata`: i metadati (`/.well-known/oauth-protected-resource/api/mcp`,
un rewrite verso `/api/mcp/risorsa`) dicono che i token li rilascia **Supabase
Auth**, col server OAuth 2.1 del progetto e la registrazione automatica dei
client. Supabase manda la persona su `/oauth/consent` («Autorizza Claude»): chi
non ha fatto login passa dal login e torna lì (`portalLoginDestination` ammette
quel solo `next`, nella sua forma esatta). Il token che Claude riceve è un JWT
del progetto come quello del browser, quindi **la RLS vale identica**.

**Da configurare una volta, nel pannello di Supabase**: Authentication → OAuth
Server → attivo, percorso di autorizzazione `/oauth/consent`, registrazione
dinamica dei client attiva; il Site URL deve essere il dominio del gestionale.
Il 23 ottobre 2026 era spento (`OAuth server is disabled`).

**L'identità arriva dal token, non dal cookie** (`conToken` in
`lib/supabase/server.ts`). Gli strumenti chiamano i server action, e i server
action riconoscono l'utente con `createClient()`: dentro `conToken()` quel
client usa il token, e `getUser()`/`getClaims()` verificano quello. Così
`requireStaff`, `getSessionUser` e tutti gli altri guard valgono senza
riscriverli. Fuori da `conToken()` non cambia niente.

**Chi**: lo staff interno attivo (`puoUsareIlConnettore`). Portale cliente
(§409), invitati e risorse esterne no. La pagina di consenso lo ripete per dire
«no» subito, ma **la barriera è l'endpoint**: chiunque abbia una sessione può
chiedere un token a Supabase senza passare dalla pagina, e `/api/mcp` rifiuta
con 403 il token di chi non è staff, a ogni richiesta. La superficie la decide
il ruolo: chi non è admin legge i clienti da `clients_workspace` (§211).

**Cosa**: il catalogo di `toolsFor(ctx)`, tolti `ESCLUSI` — `open_page` (apre
una pagina nel pannello Ctrl+J, in Claude non c'è niente da aprire) e
`delete_task` (eliminare resta fuori dalla prima versione). Uno strumento nuovo
dell'assistente deve finire in `TITOLI` o in `ESCLUSI`: il controllo lo ferma
finché qualcuno non decide. Gli strumenti che modificano non hanno
`readOnlyHint`, quindi Claude chiede il permesso prima di usarli: è quella la
conferma, al posto della card di Ctrl+J. `assign_task`, che in Ctrl+J
parcheggia in `ai_pending_actions`, qui esegue dopo il permesso di Claude.
Ogni chiamata finisce in `ai_tool_calls` con `conversation_id` vuoto.

**Il protocollo** (`lib/mcp/protocollo.ts`) è JSON-RPC senza stato:
`initialize`, `ping`, `tools/list`, `tools/call`; ogni POST ha la sua risposta
in JSON, le notifiche rispondono 202, `GET` risponde 405 (nessuno stream).
Versioni 2025-06-18, 2025-03-26, 2024-11-05. Gli errori di uno strumento
tornano nel risultato con `isError`, come in Ctrl+J: il modello li legge e si
corregge.

**Cosa non c'è**: il legame del token alla risorsa (RFC 8707). Supabase
rilascia token con `aud: authenticated`, validi per tutto il progetto, quindi
`/api/mcp` accetta anche il token di una sessione del browser: è la stessa
persona con gli stessi permessi.

Gate: `npx tsx lib/mcp/protocollo.check.ts`.

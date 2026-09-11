# Audit TwoBee OS — registro

> Aperto l'**11 settembre 2026** sul commit `75e8f48`, branch `main`.
> Ambiente: macOS, Node locale, nessun accesso al database di produzione e
> nessun accesso alla UI di Coolify. **Niente è stato applicato in produzione**:
> le correzioni sono modifiche al repository, la migration è scritta e non
> eseguita.
>
> Le colonne che contano sono due: **come lo so** e **cosa resta da verificare**.
> Un sospetto non è un difetto, e un difetto non verificato sul database vero
> non è chiuso.

## Baseline — com'era prima di toccare niente

| Controllo | Comando | Esito |
|---|---|---|
| Tipi | `npx tsc --noEmit` | **0 errori** |
| Gate dei check | 47 file `lib/**/*.check.ts`, ognuno con `npx tsx` | **47/47 exit 0** |
| Lint | `npm run lint` → `next lint` | **non eseguibile**: `eslint-config-next` è installato ma **non c'è un file di configurazione** in repo, quindi `next lint` aprirebbe la procedura interattiva. Il manuale lo diceva già («ESLint non configurato») e insieme elencava il comando. |
| Migration sul disco | `ls supabase/migrations` | **193 file**, l'ultima è la `220_client_segments.sql` |
| Build di produzione | `npm run build` | **non eseguito**: condivide `.next` col dev server e il manuale lo vieta finché quello gira. Resta da fare in ambiente isolato. |

L'esito dei check è stato letto dall'**exit code**, non dalla stringa stampata:
uno di essi potrebbe stampare «Tutti i controlli passano» e uscire 1.

## P0 — accessi indebiti

### A-01 · Chiunque avesse una sessione poteva farsi fare un account admin — **corretto (codice), migration da eseguire**

**Cosa succedeva.** Il form «ospite esterno» del Customer Care ha un campo
**ruolo a testo libero**. Quel testo arrivava a `inviteChannelGuest`
(`app/actions/invite-guest.ts`), che lo passava a `inviteUserByEmail` dentro
`data: { role }` — cioè in `raw_user_meta_data`. Il trigger `handle_new_user`
(`001_initial_schema.sql`) fa:

```sql
COALESCE(NEW.raw_user_meta_data->>'role', 'team')
```

e lo scrive in `profiles.role`, che è la colonna letta da `get_my_role()` per
tutta la RLS e dal middleware per scegliere il portale. Scrivere `admin` nel
campo «ruolo» e invitare un proprio indirizzo bastava: il profilo nasce con la
RLS di un admin **al momento dell'invito**, prima ancora che qualcuno accetti.

**Chi poteva farlo.** L'azione chiedeva soltanto «c'è una sessione».
`/workspace/customer-care` non ha un gate di ruolo oltre alla sessione, quindi
ci arriva ogni ruolo del workspace — `junior`, `stage`, `freelance`, `partner`
compresi. Non serviva forgiare niente: è un campo di un form.

**Come lo so.** Letto nel codice: il form (`CustomerCareClient.tsx:701`),
l'azione, il trigger nella migration 001. La RLS di `channel_guests` (021) è
`FOR ALL USING (auth.uid() IS NOT NULL)`, quindi non fermava l'inserimento.
**Non verificato sul database di produzione**: il reset del 2026-07-23 ha
ricreato tabelle e il registro avverte di non dedurre lo schema dai numeri
(§222). Il trigger va guardato con `SELECT prosrc FROM pg_proc WHERE proname =
'handle_new_user'` prima di considerare chiuso il punto.

**Cosa ho fatto.** Tre strati, perché nessuno dei tre da solo basta:
1. `inviteChannelGuest` e `revokeChannelGuest` chiedono **staff** (`role` in
   `admin`/`team`), non più solo una sessione.
2. L'invito **non passa più `role`** nei metadati. L'etichetta del ruolo è una
   descrizione del compito e sta già in `channel_guests.role`.
3. `221_role_not_from_metadata.sql` (**scritta, non eseguita**) toglie al
   trigger la lettura di `role` dai metadati, gli fa leggere `app_role` solo se
   è dell'elenco chiuso, e mette il default a `guest` invece che a `team`.

**Cosa resta.** Eseguire la 221 su un database isolato, poi in produzione; e
prima, il controllo che è in fondo alla migration: `SELECT id, email, role,
app_role FROM profiles WHERE role = 'admin' AND app_role IS NULL` — se esce
qualcosa, è un profilo da guardare a mano. **La migration non corregge i ruoli
esistenti**: cambiare i permessi di qualcuno non è una cosa che deve fare uno
script.

### A-02 · Il token del portale ticket di qualunque cliente, con la sola sessione — **corretto**

`getOrCreatePortal(clientId)` (`app/actions/ticket-portal.ts`) controllava solo
che ci fosse un utente e poi usava il **service role** per leggere — o creare —
la riga di `ticket_portals` del `clientId` ricevuto. Un utente del portale
cliente, o un `freelance` che vede solo i propri progetti, poteva passare l'id
di un altro cliente e avere il suo token. Con quel token le altre azioni del
file — che sono giustamente senza sessione, perché le usa l'ospite dal magic
link — restituiscono i ticket di quel cliente con **nomi ed email** di chi li ha
aperti, e permettono di scrivere nei suoi thread.

La RLS non era una rete: `ticket_portals` aveva
`FOR ALL USING (auth.uid() IS NOT NULL)` (028), cioè la stessa porta aperta
anche in lettura diretta dal browser, DELETE compreso.

**Fatto**: `getOrCreatePortal` chiede staff. **Da fare**: la 221 restringe anche
le due policy (`channel_guests`, `ticket_portals`) a `is_staff()`.

### A-03 · `/api/invite` scriveva il ruolo preso dal corpo della richiesta — **corretto**

La route accettava `{ role }` e lo metteva **verbatim** in `profiles.role` e nei
metadati. Il guard c'era (`profile.role === 'admin'`), quindi non è una scalata
da zero, ma è la stessa colonna di A-01 scritta senza passare da `coarseRole()`,
che il manuale indica come unica fonte. Adesso accetta un `app_role`
dell'elenco chiuso e deriva `role` da `coarseRole`. **Nota**: la route non ha
chiamanti nel repository — il flusso vivo è `invitations` + `/api/invite/accept`,
che era già corretto. Candidata alla rimozione, non rimossa qui: togliere un
endpoint è una decisione, non una pulizia.

### A-04 · Due azioni AI senza alcun controllo — **corretto**

`suggestCCReplies` e `summarizeClientThread` (`app/actions/cc-ai.ts`) non
chiedevano niente a nessuno e chiamano un servizio **a consumo** con il testo
ricevuto. Oggi `ANTHROPIC_API_KEY` non è impostata, quindi l'effetto pratico è
una risposta vuota — ed è esattamente il modo in cui una cosa così resta ferma
lì fino al giorno in cui qualcuno mette la chiave. Adesso chiedono staff.

## Il controllo che impedisce il ritorno

`lib/actions-guard.check.ts` (48° file del gate). Non è un test di unità: è un
**inventario delle porte**. Elenca ogni `export async function` dei file
`'use server'` di `app/actions` e verifica una regola sola:

> si può saltare il controllo di ruolo, **o** il client di servizio, non tutti e
> due.

Chi lavora sulla roba di chi chiama (le proprie task, i propri ticket, la
propria dashboard) può non guardare il ruolo: la domanda giusta la fa la RLS,
riga per riga, meglio di qualunque `if`. Ma allora deve passare **dalla** RLS.
Le due falle di §329 stavano precisamente nell'incrocio: sessione letta, ruolo
no, service role sì. Sedici azioni stanno oggi nella prima categoria, cinque —
tutte del portale ospite, che autorizza col token — sono in un **elenco chiuso e
motivato** dentro il file.

Il controllo è stato provato **rimettendo le due falle**: fallisce con exit 1 e
le nomina entrambe. Un test di regressione che non si è mai visto fallire non è
un test di regressione.

## P2 — segnalato, non corretto

- **La stessa guard scritta dieci volte.** `requireAdmin` / `requireStaff`
  esistono in copia locale in almeno dieci file di `app/actions` (`activity`,
  `asana`, `clients`, `delete-client`, `os-versions`, `hr-requests`,
  `restore-entity`, `ad-hoc-tasks`, `milestones`, …). È lo stesso difetto che
  §234 ha risolto per le economics — sette copie, e a una mancava il controllo.
  Qui le copie sono coerenti **oggi**: il problema è che sono dieci posti dove
  la prossima modifica può divergere. Consolidarle è un lotto a sé.
- **`/api/invite` è codice morto** che però espone un endpoint (vedi A-03).
- **`inviteChannelGuest` scrive su `channel_guests` col client dell'utente**, e
  la RLS di quella tabella è aperta a chiunque sia autenticato fino alla 221.

## Incongruenze del manuale — verificate una per una

Il documento di audit ne segnalava sei. Quello che ho trovato guardando il
codice:

| # | Segnale | Verificato | Esito |
|---|---|---|---|
| 1 | L'esempio Groq nel `CLAUDE.md` usa `llama-3.3-70b-versatile`, dichiarato dismesso dallo stesso file | **Il codice è a posto**: nessun modello scritto a mano, tutte e sei le chiamate passano da `GROQ_MODEL` (`lib/ai/model.ts`). Il difetto è **solo nell'esempio**, che è la parte che si copia | corretto nel manuale |
| 2 | L'albero dice «migration 001–091 (086–091 da eseguire)» | Sul disco ce ne sono **193**, l'ultima è la 220; `docs/migrations.md` dice che non c'è niente da eseguire e che la **086 non va eseguita** | corretto nel manuale |
| 3 | `npm run lint` elencato ma ESLint non configurato | Confermato: lo script c'è, la configurazione no | corretto nel manuale |
| 4 | «Chat — quattro gruppi» ne descrive tre | Più grave: **la chat non esiste più**. `/chat` fa `redirect('/customer-care')`, `components/chat/SlackChat.tsx` non c'è | corretto nel manuale |
| 5 | «Nessun valore economico si digita» va letto coi documenti specialistici | Confermato come principio: contratti e rate **sono** l'input. Nessuna modifica | — |
| 6 | Dashboard a 17 query e `ProjectPageClient` grande | Da profilare, non difetti. `ProjectPageClient.tsx` **non esiste più**; la dashboard fa 19 chiamate a `supabase` | rimandato a P2 |

In più, trovate guardando: **cinque dei quindici percorsi** elencati nella
struttura del `CLAUDE.md` non esistono, e l'elenco di `app/api/ai/**` è
interamente diverso da quello reale. E **`AGENTS.md` è fermo a luglio**: dice
colori esadecimali a mano (`bg #111111`, `gold #F5C800`), `llama-3.3-70b` e
«migration 001–034». È il file che legge un altro agente: lì dentro le
istruzioni sbagliate non confondono, **guidano**.

## Cosa resta aperto (checkpoint)

1. **Eseguire la 221** su database isolato con dati rappresentativi, poi in
   produzione. Finché non è eseguita, A-01 è chiusa solo dal lato applicazione.
2. **Verificare sul database** che `handle_new_user` sia quello della 001 e che
   le due policy siano quelle della 021/028.
3. **Build di produzione** in ambiente isolato + smoke test dei percorsi toccati
   (invito ospite dal Customer Care, apertura portale ticket).
4. **Matrice ruolo × risorsa × azione**: fatta la colonna «server action», da
   fare API, RPC, Realtime, Storage ed export.
5. **Performance**: nessuna misura presa. La baseline non esiste ancora, quindi
   non esiste nessun «prima».
6. **Usabilità e accessibilità**: non toccate in questo giro.

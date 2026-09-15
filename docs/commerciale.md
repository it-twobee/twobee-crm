# Area commerciale — prima implementazione

Stato al 15 settembre 2026: **migration 223 e 224 applicate; codice locale non distribuito**.
Fonte funzionale: `TwoBee-OS_Brief_Area-Commerciale_v1.0.pdf`.
Il portale cliente resta il secondo intervento, dopo la verifica di questo modulo.

## Flusso implementato

`/commerciale` nel portale admin e `/workspace/commerciale` per lo staff abilitato
montano lo stesso componente. Tre sezioni: **Oggi**, **Opportunità**, **Risultati**.

- Oggi: follow-up scaduti, incontri e azioni della giornata, opportunità ferme
  da 14 giorni, riprese da confermare, schede senza prossima azione e delivery pendenti.
- Opportunità: ricerca per azienda, referente ed esigenza; filtri per owner,
  fonte e fase; elenco e pipeline. «Da riprendere» ha una data ed esce dalla
  pipeline attiva e dal forecast fino alla riattivazione deliberata.
- Inserimento: azienda esistente o nuovo lead, almeno un recapito per il nuovo
  lead, owner precompilato con chi crea, primo contatto a oggi modificabile.
  Il nome precompila il titolo. I nomi simili vengono suggeriti, mai uniti.
- Esiti: nota, non risponde, ricontattare, incontro, proposta, pausa,
  riattivazione, perdita e vittoria. Date rapide domani/una settimana.
  Proposte identificate da riferimento/versione; incontri collegati al referente.
- Referenti: riuso di `client_contacts`, aggiunta dalla trattativa, controllo
  di email/telefono già presenti nella stessa azienda. Supportato il solo telefono.
- Storico persistente in `deal_activities`, con autore verificato, data,
  esito e data della prossima azione. Paginazione a blocchi di 50.
- Delivery: riepilogo precompilato con l’esigenza, referente, proposta,
  inclusioni/esclusioni, promesse/dipendenze e materiali. Salvataggio intermedio
  con responsabile e campo «cosa manca», anche per contratto o referente ancora
  da definire. Una conferma esplicita collega un progetto esistente oppure ne
  crea uno **in bozza**, usando catalogo e `create_project_from_template`.
  Il PM deve essere un admin o un manager abilitato al commerciale.
- `sales_handoffs` conserva il riepilogo confermato sulla scheda progetto:
  admin e membri/manager del progetto lo leggono anche senza accedere alla pipeline.

## Invarianti e scelte

**Anagrafica, persona e opportunità sono distinte.** `clients` e
`client_contacts` sono le fonti canoniche. Più opportunità possono riferirsi
alla stessa azienda. Una perdita non cambia la label cliente. La conversione
da `lead` a `stabile` avviene solo alla conferma della delivery, sulla stessa riga.
Altre label non vengono riscritte.

**Le stime non sono Economics.** `monthly_value`, `setup_value` e
`one_off_value` sono imponibili stimati e vengono presentati separatamente.
Una vittoria non crea fatture, contratti, ricavi o MRR. La creazione del progetto
non chiama `attachWizardEconomics`. Gli accordi passano dalle azioni Economics
esistenti. L’eventuale assenza del contratto va dichiarata nel riepilogo:
questa versione non certifica automaticamente la completezza contrattuale.

**Creazione atomica.** `create_client_bundle` è la porta condivisa per
anagrafica, referenti e canali; `createClientRecord` la usa dopo la 223. Prima
della migration mantiene il vecchio percorso solo su `PGRST202` (RPC assente).
Il comando commerciale crea bundle, opportunità e prima attività nella stessa
transazione. Qualunque errore li annulla tutti.

**Retry e concorrenza.** Ogni operazione ha un UUID stabile fino alla risposta
e una riga in `sales_commands`; un lock transazionale serializza la stessa
richiesta. Le modifiche controllano anche `revision` dopo un lock sulla riga.
Gli esiti e i progetti non vengono duplicati da retry. Il ripristino generico
di `deals` è disabilitato: ripristinare una riga isolata separerebbe progetto,
storico e stato della vendita. La cronologia resta leggibile.

**Permessi.** Nessun nuovo ruolo:

| Persona | Accesso |
|---|---|
| Super admin, founder, admin attivi | Gestione completa e abilitazioni |
| Manager attivo con `can_view_deals` | Tutte le opportunità; assegnazioni e delivery |
| Altro ruolo workspace attivo con `can_view_deals` | Solo opportunità proprie; prepara la delivery |
| Non abilitato, disattivato, viewer, client, guest | Nessun accesso |

Il grant vive in `profile_permissions`, con `granted_by`; si gestisce da
«Accessi» nell’area commerciale. Si rilegge sul server a ogni richiesta, anche
dopo una revoca. SQL e server verificano il ruolo granulare `app_role`.
L’abilitazione consente di creare **lead commerciali**, anche senza il permesso
generico di creazione clienti; il comando forza label `lead` e valori economici
iniziali neutri. Non concede la gestione generale delle anagrafiche.
I nuovi RPC di scrittura e lettura privilegiata sono invocabili **solo** dal
service role. Le SELECT di opportunità/storico attraversano la RLS dell’utente.
La policy restrittiva su `activity_log` evita che gli snapshot aggirino lo scope.
Gli esterni vedono nelle opzioni solo aziende dei progetti assegnati, create da
loro o collegate alle opportunità proprie; `workspace_hidden` resta rispettato
nelle opzioni. Non vengono restituiti dati Economics dalle opzioni.

## Metriche

Fonte: opportunità CRM visibili con i filtri selezionati, con ultimo caricamento
indicato. Nessun campione silenzioso: caricamento delle righe paginato fino alla fine.

- Nuove opportunità per data di apertura; vinte/perse per data di chiusura.
- Win rate = vinte / (vinte + perse); ciclo medio = apertura → vittoria.
- Forecast attuale separato per canoni, setup e una tantum. Probabilità iniziali
  esplicite: 10/20/35/50/65/80%. Sono ipotesi di lavoro da validare, non un modello
  predittivo calibrato. Le pause sono escluse. Il periodo non filtra il forecast.
- Dati mancanti e denominatore zero → `n/d`. Gli importi sconosciuti nel forecast
  vengono contati. Il legacy `deals.value` non viene riclassificato a mano.
  Le chiusure legacy senza data restano escluse dai KPI per periodo.
- La distribuzione delle fasi è una fotografia, non un funnel storico per coorte.
  CPC/CPL/conversione clic→lead sono `n/d` finché non esiste una fonte marketing.

## Rilascio e verifiche

1. Su staging verificare le tabelle e funzioni richiamate dalla 223, in
   particolare `deals`, `deal_activities`, `client_contacts`, `profile_permissions`,
   `create_project_from_template`, `get_my_v2_project_ids`, `activity_log`.
   La migration ripristina le sole `deals`/`deal_activities` della 011 se assenti,
   senza le policy aperte e senza ricreare gli altri domini demoliti.
2. Verificare la **221** e applicare **224_profile_authorization.sql** prima
   di abilitare nuovi accessi: nessun ruolo dai metadati o da self-update.
3. Applicare `supabase/migrations/223_sales_workspace.sql` in staging.
4. Eseguire `supabase/tests/223_sales.check.sql` con `psql -v ON_ERROR_STOP=1`:
   crea fixture con email `example.invalid`, prova RLS, RPC, retry e delivery,
   e annulla le fixture con `ROLLBACK`. Usare esclusivamente staging.
5. Verificare UI con admin, manager abilitato, due owner, utente non abilitato
   ed esterno: creazione, aggiornamenti concorrenti, revoca, pause, esiti, delivery.
   Provare tastiera, schermo mobile, tema chiaro/scuro e recupero dagli errori.
6. Applicare la migration e distribuire il codice nell’ambiente di destinazione
   solo dopo le verifiche. Abilitare le persone necessarie da «Accessi».

Verifiche locali eseguite:

- `npx tsc --noEmit`: zero errori.
- I 50 `lib/**/*.check.ts`: tutti passati, incluso `lib/sales.check.ts`.
- `scripts/check-sales-actions.ts`: passate chiamate dirette alle action vere
  con confini Supabase simulati (autorizzazione, owner, validazione, attore, grant).
- Per i check è stato usato il loader `tsx` già disponibile con `node --import`:
  il launcher richiede un socket IPC che il sandbox non consente.
- Suite SQL `224_profile_authorization.check.sql`: metadati assenti, NULL,
  invalidi e amministrativi producono solo guest; tentativi di self-update di
  ruolo/email/stato attivo respinti; dati personali e assegnazione server ammessi.
- Suite SQL `223_sales.check.sql`: RPC con service role reale, isolamento owner,
  accesso manager, revoca e disattivazione, audit con attore, retry/revisioni,
  progetto interno in bozza con PM e milestone di sistema, nessun contratto o
  MRR automatico. Test ripetuti dopo la riesecuzione delle migration.

Ambiente SQL: PostgreSQL **16** in container senza rete, senza porte esposte,
con snapshot di sole strutture dal database Supabase **17.6** (120 tabelle,
vincoli, indici, funzioni, trigger e policy). Nessun dato aziendale copiato;
le fixture sono annullate con ROLLBACK. Lo snapshot locale omette il privilegio
MAINTAIN specifico di PostgreSQL 17, irrilevante per i flussi provati; non è
un collaudo end-to-end del servizio Supabase Auth/PostgREST.

**Applicazione remota verificata:** 224 `20260915125653`, 223 `20260915125709`.
RLS e grant controllati sul database vero; opzioni admin funzionanti (16 aziende,
28 progetti non eliminati, 12 servizi attivi). Le quattro tabelle commerciali
sono vuote; nessun account di test, ruolo esistente o dato aziendale modificato.
Gli advisor segnalano intenzionalmente `sales_commands` deny-all e l'helper
RLS `sales_can_read` SECURITY DEFINER; gli altri rilievi preesistenti sono nel
registro audit e non sono stati chiusi da questa attività.

**Restano:** deploy del codice, smoke test browser e collaudo autenticato
end-to-end. Le migration applicate non distribuiscono le nuove pagine.

## Incrementi successivi

Allegati commerciali con accessi propri (ora riferimento/versione testuale),
import marketing e KPI pubblicitari, funnel storico, assegnazione per fonte,
rinnovi e referral. Email/WhatsApp, firma, provvigioni e AI restano valutazioni
separate come nel brief. La ripresa di trattative chiuse richiede un flusso
esplicito ancora da costruire; «Riattiva» riguarda le opportunità sospese.

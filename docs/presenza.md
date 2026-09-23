# Utilizzo del tool — chi c'è, da quanto, e quanto ha lavorato (§410)

`/impostazioni/utilizzo`, **solo super admin**. Risponde a tre domande che prima
non avevano una risposta: chi è collegato adesso, da quanto non entra chi non
c'è, e quanto tempo ha passato davvero dentro il tool nelle ultime sessioni.

## Perché non si misura la sessione

La misura ovvia — «da quando ha fatto login a quando ha chiuso» — è quella
sbagliata, e lo è in un modo che non si vede: **una scheda aperta non è una
persona al lavoro.** Un tab dimenticato la mattina dice «online» fino a sera, e
il tempo fra login e logout conta le riunioni, il pranzo e la notte. Il numero
esce plausibile, quindi nessuno va a controllarlo.

Quello che si misura sono i **minuti in cui è successo qualcosa**. Il browser
(`components/shared/PresenceBeat.tsx`) conta click, tocchi, tasti, rotella,
scorrimento e cambi di pagina; ogni minuto manda un battito **solo se** ne ha
contata almeno una e **solo se** la scheda è in primo piano. Niente interazioni,
niente battito, e il tempo non avanza.

Il movimento del mouse non conta — un urto alla scrivania non è lavoro — e
nemmeno il tornare sulla scheda. Lo scorrimento è strozzato a uno ogni due
secondi: una rotellata sola vale un'interazione, non trenta.

## Le due misure, e perché stanno accanto

| | cos'è | a cosa risponde |
|---|---|---|
| **attivo** | battiti × un minuto | «quanto ha lavorato» |
| **durata** | dal primo all'ultimo battito | «in che finestra è successo» |

`attivo ≤ durata` sempre, e quanto le due si allontanano dice quanto la sessione
era fatta di pause. Due ore di scheda aperta con dieci minuti di lavoro dentro
valgono **dieci minuti**: è tutto il punto.

Accanto c'è una terza colonna che viene da un'altra parte: le **modifiche**,
cioè le righe di `activity_log` scritte nella finestra. Tempo e modifiche sono
domande diverse — si può stare due ore dentro senza cambiare una riga, e
cambiarne dieci in cinque minuti — e il confronto fra le due è l'informazione.
«Solo lettura» (dentro, zero modifiche) non è un allarme: consultare è lavoro.

## Le soglie

- **battito**: un minuto (`INTERVALLO_BEAT_MS`, `lib/presenza.ts`).
- **fine sessione**: 15 minuti di silenzio (`GAP_SESSIONE_MIN`). Il battito che
  arriva dopo ne apre una nuova. La soglia vive **due volte** — qui e nella
  migration, che è la sola a poterla applicare — quindi
  `lib/presenza.check.ts` legge il file SQL e confronta i due numeri.
- **online**: ha toccato qualcosa negli ultimi 5 minuti (`ONLINE_MS`). Tre
  direbbero offline a chi sta leggendo una pagina lunga; quindici sarebbero la
  sessione intera.

## Dove stanno le cose

`supabase/migrations/252_presenza_risorse.sql` — tabella `os_sessions` e tre
funzioni: `registra_presenza` (scrive, `authenticated`), `ultime_sessioni` e
`presenza_totali` (leggono, solo service role).

**Il battito non porta l'id di chi lo manda.** Lo legge `auth.uid()` dentro la
funzione: un contatore che si fida del corpo della richiesta è un contatore che
chiunque può scrivere sul conto di chiunque — sé stesso compreso, a ritroso.
Per la stessa ragione `os_sessions` ha RLS **senza policy**: dice chi lavora e
quanto, e non è una cosa che si legge fra colleghi. Ci arriva il service role da
dentro la pagina, e la pagina passa da `lib/presenza-guard.ts`.

`lib/presenza.ts` è l'unica fonte delle regole di lettura (stato, durate,
parole, composizione delle righe): funzioni pure, nessuna query, verificate da
`npx tsx lib/presenza.check.ts`.

## Cosa non è misurato, e perché

**Il portale cliente.** Il battito è montato nei layout `(dashboard)` e
`(workspace)`: lo staff. Un cliente che apre il suo spazio non è una risorsa
nostra, e misurarlo sarebbe una decisione diversa da quella presa qui. La
colonna `portale` di `os_sessions` prevede già `portale` e `risorsa` per il
giorno in cui lo si volesse — ma finché il battito non c'è, quelle righe non
esistono, e la pagina lo **dichiara** invece di mostrare «mai entrato» su
qualcuno che nessuno sta guardando: uno zero che sembra un dato è peggio di
un'assenza dichiarata.

**Il passato.** La misura parte dal giorno in cui la migration è applicata.
Prima di quella data non c'è un silenzio: non ci sono dati.

## Le due fonti hanno due orizzonti, e la pagina lo dice (§412)

Il tempo viene da `os_sessions` e parte dal giorno in cui la misura è stata
accesa. Le modifiche vengono da `activity_log`, che si conserva a finestra
(`activity_config.retention_days`) ed è stato **cieco su task e progetti dal 20
luglio al 23 settembre 2026** — vedi `docs/cronologia.md`. Due fonti, due
orizzonti, e una colonna a zero si legge in un modo o nell'altro a seconda di
quale delle due si sta guardando.

Quindi la pagina dichiara la provenienza in cima — da quando si misura il tempo,
quanto conserva la cronologia — e dove il conteggio non ha sotto una fonte
scrive **`n/d`**, non `0`. Per la stessa ragione una persona senza sessioni non
è «mai entrata»: è **«nessuna sessione»**, perché quello che manca è la misura,
non il suo lavoro. Il pallino accanto è un cerchio vuoto e non un allarme.
`modificheParziali()` e `etichettaStato()` stanno in `lib/presenza.ts` con i
loro controlli.

**Le interazioni erano gonfiate** e si è visto il primo giorno: una sessione di
cinque minuti ne segnava 599, un'altra 99 in un minuto solo. Rotella e
scorrimento erano contati a evento, e una rotellata sul trackpad ne emette
decine. Adesso passano dallo stesso freno (una ogni due secondi) e un tasto
tenuto premuto conta una volta. Era il tipo di numero che resta plausibile per
sempre, perché nessuno va a contare i click di una giornata.

## L'ultimo accesso, che non è l'ultimo utilizzo (§417)

Il primo giorno la tabella era piena di righe mute: cinque persone su otto senza
una sessione, e quindi senza niente da dire. Era vero — la misura era accesa da
tre ore — ma «non lo so» scritto sette volte non è una vista, e la domanda che
porta qui è proprio **da quanto non c'è**.

La risposta per il periodo scoperto esiste da sempre e sta in un'altra tabella:
`auth.users.last_sign_in_at`. La pagina la legge dall'API di amministrazione e la
mette sotto lo stato, seconda riga.

**Va chiamata col suo nome.** È l'ultima volta che ha messo le credenziali, non
l'ultima volta che ha lavorato: una sessione si rinnova da sola, quindi si usa il
tool per mesi senza rifare login. Agostino è la prova vivente — accesso il 10
luglio 2026, interazioni il 23 settembre — e presentarlo come «ultimo utilizzo»
avrebbe dato per sparito da settantacinque giorni qualcuno che stava lavorando
mezz'ora prima. Per questo l'etichetta dice «accesso», non «visto», e il blocco
«Come si conta» lo spiega.

Con la stessa riga cade la ragione per cui la tabella spariva quando non c'era
nessuna sessione: adesso ha sempre qualcosa da dire, e l'ordinamento per presenza
mette in fondo chi non ha sessioni **dal login più vecchio**, che lì dentro è
l'unica cosa che distingue una riga dall'altra.

## L'effetto collaterale che vale la pena

`profiles.last_seen_at` esiste dalla migration 009 e **nessuno la scriveva**.
La leggono `lib/person-copy.ts` («assente da N giorni») e la scheda della
persona, e rispondevano sempre la stessa cosa perché la colonna era vuota da
sempre. Adesso la aggiorna `registra_presenza` a ogni battito.

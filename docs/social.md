# Social — il calendario dei contenuti (§467)

`/social` (admin), `/workspace/social` (workspace), tab **Social** nella scheda
cliente. Codice: `lib/social.ts` (regole pure, con `lib/social.check.ts`),
`lib/social-server.ts` (lettura), `app/actions/social.ts` (scritture),
`app/api/social/media/**` (creatività), `components/social/**`.

## Perché c'è
Il lavoro social stava dentro task e milestone generiche: «Sviluppo PED
Novembre», «Shooting PED», «Approvazione PED Ottobre». Il piano editoriale era
un **nome di task**, e i post non esistevano da nessuna parte: alla domanda
«cosa esce giovedì per Fatima Leo?» non rispondeva il tool, rispondeva un file.
Misurato il 6 ottobre 2026: 12 progetti social (9 attivi, 8 clienti), nessun
post registrato.

## Le decisioni del committente
1. **L'unità è il singolo contenuto**: giorno (e ora, se c'è), canali, formato,
   tema, didascalia, creatività, stato, responsabile. Il PED del mese sono i
   contenuti del mese, non un'entità a parte.
2. **Il cliente, quando arriverà il portale, vedrà e basta**: niente
   approvazioni, niente commenti. Si fa in un secondo passo, con pubblicazione
   esplicita — oggi nessuna colonna `portal_*`.
3. **Il tool non pubblica sui social.** Si pubblica da Meta Business Suite o
   dagli strumenti di ogni piattaforma; qui si segna «pubblicato» e si incolla
   il link del post.
4. **La sezione la vede tutto lo staff interno**, con «Solo i miei».

## Il progetto social
È un progetto con `service_type = 'social_media_management'` (area
marketing): esisteva già, con i suoi template. Niente flag nuovi: `isSocialProject()`
è l'unica domanda, e la tab Social compare solo dove ce n'è uno.

## Il modello (migration `270_social.sql`)
- `social_contents` — una riga per contenuto, `channels text[]`. Un reel su IG
  e TikTok è **un** lavoro: un testo, una creatività, uno stato. Una riga per
  canale duplicherebbe tutto e spezzerebbe lo stato. FK composta
  `(project_id, client_id) → projects`: il cliente è quello del progetto per
  costruzione.
- `social_content_links` — il link del post, **uno per canale**. Solo `https`
  nel database; il dominio del canale lo controlla `validaLinkPost`.
- `social_content_media` — le creatività, su MinIO nella cartella `social`.
- **Data e ora da muro**, ora di Roma: `planned_date date` + `planned_time
  time`. Un `timestamptz` mette il post delle 00:30 nel giorno prima a chi
  legge in UTC, e la griglia è a giorni.
- Gli elenchi chiusi (canali, formati, stati) sono gli stessi in SQL e in
  `lib/social.ts`: il check legge la migration e li confronta.

### Le guardie del database
`social_guard_content` vale per qualunque percorso, anche uno script:
progetto social, attivo e dello stesso cliente; milestone dello stesso
progetto; niente canali doppi; progetto, cliente e autore non cambiano;
**«pubblicato» vuol dire un link per canale** (la story no: scade in un giorno).
`social_guard_link` vuole il canale fra quelli del contenuto;
`social_guard_media` vuole la riga `files` della cartella `social`, dello
stesso progetto e con la stessa chiave.

### Chi legge
Come i progetti (148): admin tutto, team interno tutto, esterni (freelance,
partner) solo i progetti in cui sono dentro — `social_staff_can_read()`.
Il portale cliente niente. **Nessuna scrittura dal browser**: si scrive dalle
azioni col client dell'attore, e `storage_key` non è concessa ad
`authenticated`.

## Chi fa cosa (§322, §339)
| | |
|---|---|
| crea, elimina | chi governa i progetti: admin e manager (`canGovernProjects`) |
| modifica testo, data, canali, creatività, stato, responsabile; segna pubblicato | chi governa, **più** il responsabile e chi l'ha creato |
| legge | tutto lo staff interno; gli esterni solo i loro progetti |

Il committente ha scelto la versione stretta: crea solo chi governa, non tutto
il team del progetto. Il responsabile deve essere «uno di noi» (§409).

## «Solo i miei»
`manager_id` da solo non basta: su nove progetti social attivi cinque non ce
l'hanno. È mio un progetto che **gestisco**, di cui sono **membro**, dove ho
una **task assegnata** o un **contenuto in carico** (`progettiMiei`). Si parte
da «Solo i miei» se se ne ha almeno uno: lo dicono i dati, non un nome o un
reparto scritto nel codice.

## Quello che la pagina segnala
- **in ritardo**: il giorno è passato e non è né uscito né annullato;
- **settimana scoperta**: progetto attivo senza niente in uscita nei prossimi
  sette giorni, da oggi — anche se si guarda un altro mese;
- **il PED del mese**: la milestone del progetto che ha il mese nel titolo
  («M2 · PED Novembre 2026»), o la scadenza nel mese (`suggerisciMilestone`);
- **avvisi che non bloccano**: didascalia oltre il limite del canale (X 280,
  Instagram 2.200…), carosello con una slide, reel senza video;
- weekend, festivi e **date marketing** (`lib/date-marketing.ts`) sulla griglia.

## Le creatività
Cartella `social` in `OWN_DOOR_FOLDERS`: le API generiche dei file la
rifiutano. Le porte sono `POST /api/social/media?contenuto=` (corpo grezzo,
idempotenza in header, come i materiali), `GET`/`DELETE /api/social/media/:id`
(Range per i video) e `/miniatura` (sharp, una volta sola; i video restano
icona, sulla macchina non c'è ffmpeg). Immagini, video e PDF; 1 GB per file,
20 per contenuto. Le miniature stanno in `lib/storage/thumb.ts`, condiviso con
i materiali.

Eliminare un contenuto toglie prima la riga, poi i byte: se lo storage non
risponde, l'oggetto rimasto **si dichiara** («N file sono rimasti sullo
storage»). Un cliente eliminato porta via i contenuti a cascata, ma i byte
restano su MinIO: non c'è ancora un conteggio in `previewClientDeletion`.

## Cronologia
`social_contents` ha la cronologia (`log_activity()`, etichetta «12/11 ·
Tema»), ed è in `LOGGATE`. Link e creatività no.

## Verifiche
- `npx tsx lib/social.check.ts`, `lib/storage/access.check.ts`,
  `lib/attribuzione.check.ts`, `lib/actions-guard.check.ts`.
- 22 prove SQL in produzione dentro una transazione annullata, il 6 ottobre
  2026: inserimento, progetto non social, cliente diverso, milestone altrui,
  canali doppi e inventati, ora coi secondi, pubblicato senza link e con un
  link su due, link su un canale non del contenuto, `javascript:`, cambio di
  progetto, media senza file, cronologia con etichetta e attore, RLS per
  Annalisa e per uno sconosciuto, `storage_key` negata, scrittura negata ad
  `authenticated`.

## Prossimi passi
1. **Portale cliente in sola lettura**: colonne di pubblicazione, viste
   `security_barrier` sul modello di `portal_projects`, rotta media per il
   cliente, il calendario dentro la pagina del progetto pubblicato (brief §14:
   niente voce di menu nuova).
2. Contenuti nel calendario personale (`TIPI_VOCE`), alert «settimana scoperta»
   in dashboard, esportazione del PED.

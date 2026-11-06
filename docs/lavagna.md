# La lavagna del team (§499)

`/lavagna` (admin), `/workspace/lavagna` (workspace, gruppo Team). Codice:
`lib/lavagna.ts` (regole pure, con `lib/lavagna.check.ts`), `lib/lavagna-server.ts`
(porta, firma, lettura), `app/actions/lavagna.ts` (l'unica scrittura delle righe),
`app/api/lavagna/media/**` (i file), `components/lavagna/` (lavagna, galleria,
editor degli sticker), `lib/lavagna-sticker.ts` (gli algoritmi dell'editor, con
`lib/lavagna-sticker.check.ts`). Migration `280_lavagna.sql`.

## Perché c'è
Un'area goliardica: il team attacca post-it, sticker, foto e link su una
lavagna comune, **in forma anonima**. Sticker e foto caricati finiscono in una
galleria di tutti, che cresce man mano: lo sticker che fai tu lo attaccano anche
gli altri. Lo sticker si crea dentro l'OS, anche partendo da una foto appena
caricata.

## Le regole
1. **Solo chi ha attaccato una cosa la sposta, la ruota, la ridimensiona, la
   modifica e la stacca.** Gli altri la guardano e ci reagiscono (😂 🔥 ❤️ 👏 💀
   🤯, una per emoji a testa). La regola sta **nella query**: ogni `update` e
   `delete` di `app/actions/lavagna.ts` ha `.eq('autore', firma)`, e il check lo
   verifica riga per riga.
2. **Chi ha caricato uno sticker o una foto lo può ritirare**, e ritirarlo lo
   stacca da ogni punto della lavagna dove l'hanno attaccato (`ON DELETE CASCADE`).
   Il contenuto è suo; chi l'ha attaccato l'ha solo usato.
3. Chi entra: lo staff interno attivo (`canSeeLavagna`). Un account `viewer`
   guarda e non scrive (`canWriteLavagna`). Il portale cliente non entra.
4. Un tetto contro la raffica: 40 cose attaccate e 20 file caricati per persona
   ogni dieci minuti (`TETTO_RECENTI`). L'anonimato non deve diventare un megafono.

## L'anonimato, e dove poteva rompersi
«Anonimo» non è un'interfaccia che non mostra il nome: è un dato che non
arriva. Le falle possibili erano sei, e sono chiuse una per una.

| Dove | Cosa avrebbe detto | Come è chiusa |
|---|---|---|
| la riga nel database | l'id di chi ha scritto | la colonna `autore` è una **firma**: HMAC-SHA256 dell'id con la chiave di `lavagna_chiave`, generata dalla migration. Nessuna chiave esterna verso `profiles` |
| quello che arriva al browser | la firma, e quindi chi ha scritto due cose | `costruisciStato` è l'unico passaggio: esce solo `mio: boolean`. Il check prova che nel risultato non c'è né la firma né un campo `autore` |
| la cronologia | `activity_log` porta l'attore | nessun trigger sulle tabelle della lavagna, e scritture con `createAdminClient`, non `createActorClient` (che metterebbe l'id nell'intestazione) |
| la presenza (`os_sessions`) | «chi era sulla lavagna nel minuto in cui è comparso quel post-it» | `rottaDaRegistrare` (`lib/presenza.ts`): il tempo si conta lo stesso, la sezione resta quella del portale |
| l'ora sotto ogni cosa | la stessa correlazione | al browser arriva solo il giorno (`quando`: «oggi», «ieri», «3 nov»), mai l'ora |
| i dati EXIF delle foto | modello del telefono, posizione | il server ricodifica tutto in WebP con sharp, che non copia i metadati |

**Il limite, detto chiaro:** chi ha accesso completo al database può risalire a
una persona, ma deve **volerlo** — prendere la chiave e rifare il conto per ogni
profilo. Chi apre la tabella per tutt'altro vede stringhe che non portano a
nessuno. Cambiare la chiave toglierebbe a tutti il diritto di staccare le
proprie cose: non si fa.

**Non c'è moderazione.** Per regola, nemmeno un admin stacca la roba degli
altri. Se servisse, la strada coerente è una segnalazione anonima che nasconde
un elemento dopo N segnalazioni di persone diverse — non un tasto «elimina» per
qualcuno.

## Il database
Quattro tabelle, tutte **deny-all** (RLS attiva, nessuna policy, `REVOKE` ad
`anon` e `authenticated`): legge e scrive solo il server, col service role,
dopo `requireLavagna` (ruolo, poi firma). `requireLavagna` sta in
`GUARD_CONDIVISE` di `lib/actions-guard.check.ts`.
- `lavagna_chiave`: una riga, la chiave della firma.
- `lavagna_media`: sticker e foto della galleria. File su MinIO in
  `lavagna/<id>.webp` (+ `-mini.webp` per le foto, 480 px): niente riga `files`,
  non è un documento e non passa da `/api/files/**`.
- `lavagna_elementi`: le cose attaccate. Coordinate = centro, su una lavagna di
  4000 × 2600 punti; `z` per l'ordine.
- `lavagna_reazioni`: una per emoji, per elemento, per firma.

I limiti (colori, emoji, dimensioni, lunghezze) vivono due volte, nel codice e
nei `CHECK` della migration: `lib/lavagna.check.ts` legge il file SQL e li
confronta.

## I file
- `POST /api/lavagna/media` (multipart: `file`, `tipo`, `nome`): ricodifica in
  WebP — foto a 1600 px più la miniatura a 480, sticker a 512 con trasparenza,
  GIF animate che restano animate. Prima i byte, poi la riga; se la riga non
  entra, i byte si tolgono.
- `GET /api/lavagna/media/:id[?v=mini]`: solo allo staff, `Cache-Control:
  private, immutable` — il contenuto di un id non cambia mai, quindi la lavagna
  che si ridisegna ogni venti secondi non riscarica niente.

## La lavagna nel browser
Si trascina lo sfondo per spostarsi, rotella per scorrere, Ctrl/⌘ + rotella (o
due dita) per lo zoom. Le proprie cose si trascinano; la barra in alto, per la
cosa selezionata, ha reazioni e — se è tua — ruota, dimensione, primo piano,
modifica, stacca (due clic). Doppio clic su una foto la ingrandisce, su un link
lo apre. Si incolla: un'immagine apre «Che ci facciamo?», un link apre «Attacca
un link», un testo apre un post-it già scritto. Un'immagine trascinata sulla
lavagna finisce dove la lasci. Ogni venti secondi (e al ritorno sulla scheda)
la lavagna si rilegge, senza toccare quello che stai spostando.

## L'editor degli sticker
`components/lavagna/StickerMaker.tsx`, caricato solo quando si apre. Da una
foto o da un foglio bianco: **Magia** (tocca o scarabocchia il soggetto),
bacchetta (toglie lo sfondo di colore simile), gomma, ripristina, pennarello,
forme (cerchio, cuore, stella), scritta stile meme sopra e sotto, bordo bianco
fustellato con ombra facoltativa, annulla (Ctrl+Z). Esce un PNG trasparente
ritagliato, al massimo 512 px.

La Magia è `InteractiveSegmenter` di `@mediapipe/tasks-vision`, **versione
esatta 0.10.35** (Apache-2.0), e gira **nel browser**: la foto non esce dal
computer finché non la salvi. Wasm da jsdelivr e modello `magic_touch` (~6 MB)
da storage.googleapis.com, scaricati alla prima Magia. **Nella maschera il
soggetto vale 0, non 255** (`SOGGETTO_MEDIAPIPE`): verificato in Chromium con la
0.10.35 su un'immagine sintetica, 7.879 pixel a 0 contro i 7.854 attesi. Se si
aggiorna la libreria, quella prova va rifatta. Se il download fallisce restano
gli strumenti manuali.

## Verifiche
```bash
npx tsx lib/lavagna.check.ts          # anonimato, ruoli, link, giorni di Roma, codice ↔ migration
npx tsx lib/lavagna-sticker.check.ts  # bacchetta, pennello, riquadro, contorno
npx tsx lib/presenza.check.ts         # la lavagna non lascia la sezione nel battito
npx tsx lib/actions-guard.check.ts
```
Provata in Chromium headless con azioni simulate in memoria e il CSS vero: il
proprio post-it si trascina e si salva una volta, quello di un collega no;
reazione, pan, zoom, nuovo post-it, stacca in due clic, link incollato;
contrasto del post-it 9,0:1 al buio e 11,6:1 alla luce. L'editor è stato provato
a parte, con MediaPipe vero. La migration 280 è applicata (6 novembre 2026, vedi
`docs/migrations.md`); il giro completo con un account vero — attaccare,
spostare, staccare, caricare — si fa al primo deploy.

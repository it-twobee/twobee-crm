# Sfida LinkedIn — la classifica del mese (§477)

`/linkedin` (admin), `/workspace/linkedin` (workspace). Codice: `lib/linkedin.ts`
(regole pure, con `lib/linkedin.check.ts`), `lib/linkedin-server.ts` (lettura),
`app/actions/linkedin.ts` (l'unica scrittura), `components/linkedin/SfidaLinkedin.tsx`,
`public/estensione-linkedin/` (l'estensione Chrome), `app/api/linkedin/estensione`
(la stessa cartella, zippata al volo da `lib/zip-store.ts`).

## Perché c'è
Ogni mese il team fa una sfida: chi fa più impression e reazioni con i propri
post. Le impression le vede **solo l'autore**, quindi nessuno le può leggere per
gli altri: ognuno raccoglie le sue e le carica.

## Le decisioni
1. **Estensione Chrome, non script.** Da Chrome 136 un programma esterno non
   pilota più il profilo predefinito (`--remote-debugging-port` ignorato),
   quindi uno script Playwright dovrebbe aprire un profilo a parte e chiedere
   un nuovo login, oltre a Python o Node su ogni portatile. L'estensione gira
   nel profilo vero, già collegato, ed è identica su Windows, Mac e Linux.
2. **CSV caricato a mano, non un indirizzo aperto.** L'identità la dà il login
   dell'OS: `profile_id` non arriva dal file. Con un endpoint pubblico il file
   avrebbe dovuto dire di chi sono i numeri, e in una sfida chiunque se ne
   attribuisce o ne attribuisce a un collega; con un token personale servivano
   una pagina per generarlo, una per revocarlo e uno script che lo custodisce.
   Se il caricamento a mano stanca, il token si aggiunge sopra la stessa
   `caricaCsvLinkedin`: cambia la porta, non la regola.
3. **La regola del mese** (decisione del committente, 16 ottobre 2026): contano
   i post **pubblicati nel mese** (ora di Roma), con i numeri dell'ultimo
   caricamento **fatto entro la fine del mese**. Un post di settembre che prende
   like a ottobre non conta per ottobre. La regola sta in `leggiCsvSfida`, che
   accetta solo i post del mese in corso: un mese chiuso non si aggiorna più
   perché nessuno lo può più scrivere, e chi carica il 5 novembre non si porta
   dietro i like dei primi di novembre.

## La data del post viene dall'ID
LinkedIn nella pagina scrive «3 sett.», non una data. L'URN invece è esatto: i
41 bit alti dell'ID sono i millisecondi (`msDaUrn`). L'OS ricalcola il mese
dall'URN e ignora qualunque data nel file. L'estensione ha la sua copia della
funzione (non può importare TypeScript): il check prova che le due danno lo
stesso mese sugli stessi URN, confini del mese e cambio d'ora compresi.

## Cosa legge l'estensione
L'icona apre una **finestrella** (`popup.html`) con «Dal» e «Al», giorni di
Roma, di default dal 1° del mese a oggi. Se il «dal» cade prima del mese la
finestrella avvisa: l'OS ignora quei post, la sfida conta solo il mese in
corso. `background.js` porta la scheda su «Attività → Post»
(`/in/me/recent-activity/shares/`), passa l'intervallo alla pagina e inietta
`raccolta.js`:
- **i tuoi post** sono quelli con l'ingresso alle analisi (`a[href*="/analytics/"]`,
  `ca-entry-point`): le impression le vede solo l'autore. Un repost semplice
  non ce l'ha e resta fuori; un repost con commento è un tuo post.
- **un elemento è del post se il post più vicino ha lo stesso URN**, non se è
  lo stesso elemento: LinkedIn ripete l'URN su blocchi interni. Un post
  condiviso dentro il tuo ha un altro URN e resta fuori.
- i numeri si leggono **dal testo** («45 reazioni», «1.234 impressions»), in
  italiano e in inglese: etichette accessibili, barra social e ogni pezzo di
  testo breve del post, **fuori dal testo dell'autore** («100 commenti» in una
  frase non è un conteggio). Il testo si prende **nodo per nodo**: `innerText`
  incolla due elementi senza spazio, e «12» più «8 commenti» diventava «128
  commenti».
- **le reazioni non hanno la parola**: accanto alle icone c'è solo «18», o
  «Claudia Amodei e 78 altre persone» (= 79). Si cercano in quest'ordine: la
  parola, il numero accanto alle icone delle reazioni (`alt` like, praise,
  empathy…), il numero senza parola sulla riga di «3 commenti · 1 diffusione»
  (`numeroNudo`), la vecchia classe `reactions-count`.
- scorre finché trova un tuo post più vecchio del «dal». La pazienza cresce a
  ogni giro a vuoto, si clicca «Mostra altri…» e si scorre anche il contenitore
  se la pagina non scorre nella finestra.

**La prima versione, sul LinkedIn vero (16 ottobre 2026), leggeva zero
reazioni su tutti i post e perdeva i post di inizio mese**: le reazioni erano
scritte senza parola, e lo scorrimento si fermava presto. I commenti invece
tornavano. Per questo il pannello ora avvisa **post per post** quando non trova
il contatore delle reazioni (e quando il totale è zero), e dice di non caricare
il file se sotto quei post si vedono reazioni.

**Reazioni e commenti senza contatore sono zero** (LinkedIn non mostra il
contatore a zero), ma con l'avviso sopra; **le impression senza testo restano
vuote** — sui propri post ci sono sempre, quindi se mancano non si sono lette,
e nella classifica il totale diventa «≥» invece di un numero plausibile e
sbagliato.

**La diagnostica.** Il secondo bottone della finestrella scarica
`linkedin-diagnostica-<giorno>.html`: l'HTML dei **soli tuoi post**
dell'intervallo (al massimo sei), senza script, stili, immagini e link tranne
quelli alle analisi. È il materiale per riprodurre la pagina vera in un
Chromium senza testa e capire dove LinkedIn ha spostato un numero.

## Il database (migration `272_sfida_linkedin.sql`)
`linkedin_posts`, una riga per post. `post_urn` **unico da solo**: un post ha un
autore, e lo stesso URN da due persone vuol dire che una ha caricato quello di
un'altra — `caricaCsvLinkedin` lo salta e lo conta («già caricati da un
collega»). RLS: lettura allo staff (`get_my_role()` admin o team), **nessuna
policy di scrittura**: scrive solo l'azione, col service role, dopo il
controllo di ruolo (§329). La voce `sfida_linkedin` del workspace sta nel
gruppo Team, per manager, senior, junior, stage, freelance e partner.

## Il rischio da sapere
I termini di LinkedIn vietano la raccolta automatica. Leggere le proprie
statistiche poche volte al mese, a velocità umana (1,5–3 secondi fra uno
scorrimento e l'altro), è a rischio basso ma non nullo. E la pagina di
LinkedIn cambia: quando l'estensione smette di trovare i post o un numero, il
file di diagnostica è il punto da cui ripartire.

# Passaggio Economics a Claude Code

Aggiornamento del checkpoint: 14 novembre 2026. Documento operativo per riprendere
dal repository in un altro terminale; non sostituisce le regole di dominio.

## Mandato e autorizzazioni

L'utente ha approvato il progetto e l'implementazione graduale nel Laboratorio,
con commit e push su main dopo le verifiche. Il checkpoint corrente è Conto
economico: Effettivo, Maturato e area compensi soci con PDF mensile. L'utente
chiede espressamente continuità fra Codex e Claude Code se finiscono i crediti.
Non è disponibile una misura dei crediti dell'account: non dichiararli esauriti.

Prima leggere CLAUDE.md, docs/lab.md, docs/progetto-moduli-economics.md
(piano corrente prima dell'archivio), documenti di dominio pertinenti e
docs/stato.md. Non riscrivere il progetto da capo.

## Vincoli che persistono

- Database di produzione solo SELECT. Nessuna migration o scrittura sui dati.
- Lab solo super admin attivo, sola lettura; requireLabAdmin prima del service
  role e anche sulle API. Nessuna condivisione automatica dei documenti.
- Nessuna sostituzione delle sezioni Economics prima dei gate di promozione.
- Fonti mancanti n/d o stimate. Derivati e spunte non certificano la banca.
- Righe PL costruite solo in lib/pl-rows.ts; formule soci in lib/pl.ts e
  finestra in lib/payout-window.ts. Non duplicarle nel nuovo modulo/PDF.
- Design token chiaro/scuro. Nessun numero di paragrafo/migration inventato.
- Non avviare dev durante una build. Non stampare credenziali o dati personali.

## Stato verificato prima del checkpoint corrente

- 813dd42: home Lab e prime letture Banca/Fatturazione.
- d759615: recupero errori chunk, massimo un reload per build e scheda.
- 598e60b: Accordi, cliente/progetto/rate/subappalti, sola lettura.
- 243c935: Risorse & tasse, documenti privati, 133 gate e build passati.
- b1addb9: IVA, 134 gate e build passati; pushed su main. All'inizio del checkpoint esponeva ancora 243c935; durante il lavoro
  /api/version ha confermato b1addb9a26c4, builtAt 2026-11-14T18:02:52.216Z.

Gli ingressi implementati sono /lab/banca, /lab/fatturazione, /lab/accordi,
/lab/risorse e /lab/iva. Le sezioni in uso sono rimaste operative.
Il browser integrato nell'ultima verifica non esponeva sessioni: prova visiva
autenticata e matrice dei ruoli non certificate.

## Ripresa del lavoro corrente

Il checkpoint Conto economico è implementato e verificato nel Lab, senza promozione.
Per trovare il commit esatto: git log -1 -- lib/lab-economics.ts.
Verificare che sia incluso in origin/main e confrontare /api/version prima di
dichiarare il deploy; commit/push sono autorizzati e fanno parte della chiusura.

File implementati: lib/lab-economics.ts (cassa, fonti e coperture),
lib/lab-economics-load.ts, lib/lab-economics-report.ts (payload condiviso),
lib/lab-economics-token.ts (fotografia firmata per utente, scadenza 15 minuti),
lib/lab-economics-pdf.ts (PDF binario), lib/lab-economics.check.ts,
app/(dashboard)/lab/conto-economico/page.tsx e
app/api/lab/economics/compensi/route.ts. La home collega il modulo.
La POST di download non scrive: verifica ruolo attivo, firma, utente e scadenza;
non rilegge/recalcola il report, così la fotografia coincide con la pagina.

Verifiche già passate: TypeScript aggiornato e gate mirato; PDF sintetico renderizzato e
ispezionato su nove pagine. Suite finale: 135/135 passati con Europe/Rome, gate nuovo anche UTC e
America/Los_Angeles. Build finale passata.
HTTP locale: sei chunk 200, Effettivo e Maturato anonimi 307 verso login
(con filtri preservati), POST PDF anonima 403 con private, no-store. Server
locale di prova fermato. Nessuna prova autenticata nel browser dichiarata.

SELECT reali del 14 novembre: ottobre flussi principali senza giroconti
13.294,36 entrato, 18.227,87 uscito, differenza -4.933,51 EUR; sei lati di
trasferimenti non riconciliati nel perimetro. Novembre fino al 14: 12.237,00,
4.815,78, differenza +7.421,22 EUR; quattro lati da riconciliare. Sono flussi
registrati e classificati, non saldi consolidati certificati.
Il confronto trova tre occorrenze ricavo e sei costo mancanti nei due mesi;
43 righe nello storico hanno riferimenti concorrenti fra registri; risultano
anche divergenze fra righe dei mesi aperti e accordi. Nessuna
scelta automatica su quale registro correggere: i compensi completi restano n/d.
Il primo audit ad hoc aveva ordinato revenue_stream_projects per id inesistente:
query corretta e ripetuta su stream_id,project_id; non dedurre dati vuoti.

Correzioni già applicate: costsKnown coincide col totale costi canonico anche
con spese dei soci; intestazione delle pagine commerciali distinta; contractDrift
blocca percentuali incoerenti nei mesi aperti senza cambiare i mesi chiusi.
Suite completa 135/135, TypeScript/build finali e regressione del modulo in
tre fusi passati. PDF binario controllato anche con segni negativi conservati.
Un primo controllo HTTP pretendeva /login senza query: corretto per il
redirect che conserva m/vista; nessun difetto del gate di accesso rilevato.
Verificare git status e diff prima di intervenire: possono esserci modifiche
non committate. Conservare il lavoro esistente e completarlo, senza reset.
Gli esiti di chiusura sono registrati qui e nel dossier di progetto. Prima
di proseguire restano la verifica del deploy e le decisioni sulle fonti
concorrenti/occorrenze mancanti; non correggere dati in produzione.

Primi passi: Effettivo dai movimenti reali per conto, giroconti nel raccordo;
Maturato dalle righe canoniche con confronto occorrenze contrattuali mancanti;
compensi da computeMonth e placeLine, copertura bancaria alla data, nessun
pagamento o residuo certificato senza prova. PDF scaricabile dallo stesso
payload usato nella pagina, anche bozza con n/d, protetto dal gate Lab.

## Verifica e pubblicazione

TypeScript senza errori e tutti i lib/**/*.check.ts con TZ=Europe/Rome;
gate del nuovo modulo anche UTC e America/Los_Angeles. Build isolata con
NEXT_BUILD_DIR=.next-build npm run build; controlli HTTP dei chunk e degli
accessi anonimi. Il numero di gate cresce: scoprirli dal filesystem.

tsx non è una dipendenza locale: usare npm exec --yes --package=tsx@4.20.6.
La sandbox può bloccare npm/DB/rete: richiedere l'esecuzione autorizzata,
senza aggirarla. Non installare dipendenze cambiando manifest o lockfile.
Le credenziali sono già nell'ambiente locale: non copiarle in questo file.

Prima del push fare fetch e verificare la divergenza da origin/main; includere
solo i file del checkpoint, nessun force push. Verificare /api/version dopo
il push; i nomi hash dei chunk locali differiscono da quelli di produzione.
Per il controllo remoto leggere gli asset dall'HTML realmente servito.

Fermarsi al checkpoint con sintesi ed esiti; prossimo modulo Previsionale
solo dopo il via dell'utente. Se una parte resta aperta, riportarla come tale.

## Prompt da incollare nell'altro terminale

«Leggi CLAUDE.md e docs/passaggio-economics-claude.md, poi controlla git status.
Riprendi dalle attività ancora aperte del checkpoint Economics, rispettando
le autorizzazioni e i vincoli registrati. Non ripartire dal progetto iniziale.
Completa verifiche, documentazione e pubblicazione autorizzata su main;
distingui sempre implementazione, deploy e promozione.»

# Tracking (§316)

Port nel CRM dell'app «arealavoro» scritta a parte (Express + SQLite) da un
collega: è entrata solo la logica di dominio, agganciata a clienti, auth e
portali esistenti. Il DB del collega era vuoto: nessun travaso.

**Dove sta.** Quattro tab nella scheda cliente (`ClientPageClient`, indici
6–9: Tracking · Report · Chiavi · Accessi), condivise da `/clienti/[id]` e
`/workspace/clienti/[id]`; pagina elenco `/tracking` e `/workspace/tracking`
(badge per cliente, colonna QA, «Controlla ora»); `/impostazioni/tracking`
(admin) e `/workspace/tracking/impostazioni` (manager) per le chiavi d'agenzia. Le action rispondono con `ActionResult`
(`lib/tracking/action-result.ts`) e **non lanciano**: in produzione Next
maschera il messaggio di un throw da server action, e qui i messaggi sono la
sostanza («Pixel ID non valido», «manca il service account»).

**Dati.** `client_tracking` è una tabella satellite 1:1 e non colonne su
`clients`, perché `clients_workspace` è una VIEW con l'elenco esplicito delle
colonne: ogni campo nuovo lì obbligherebbe a rifarla. L'URL del sito resta
`clients.website`. Il tab Note di arealavoro non esiste: le note stanno già in
Anagrafica. `client_accounts` esisteva già (customer care) → gli accessi umani
sono `client_logins`.

**Segreti.** AES-256-GCM con la chiave in env **`VAULT_KEY`** (32 byte hex o
base64), letta a chiamata e mai all'import: `next build` non deve averne
bisogno. Blob = base64 di iv(12)|tag(16)|ct, stesso formato di arealavoro. Le
tre tabelle segrete hanno RLS senza policy: ci arriva solo il service role da
dentro una server action, e **chi vede** lo decide `TRACKING_SECRET_ROLES` in
`lib/permissions.ts` (admin + manager/senior/junior/stage; mai freelance,
partner, viewer) — unica fonte per i tab montati e per `requireInternalStaff`.
Le liste restituiscono solo `hasValue`/`has_secret`; il valore esce solo dalle
azioni `reveal*`. Non c'è rekey per scelta: persa la chiave, i segreti si
reinseriscono dalle piattaforme. Le chiavi d'agenzia le gestiscono **admin e manager**
(`TRACKING_AGENCY_ROLES`, guard `requireAgencyKeyManager`): valgono per tutto il
portafoglio, e i manager vivono nel workspace, da cui il portale admin non si
raggiunge. Per Meta il token è d'agenzia e nello slot
Chiavi del cliente va l'**Ad Account ID**; Google Ads è dichiarato
`implemented: false` e la UI lo mostra come non attivo invece di fingere.

**Verifica sito e QA: la politica asimmetrica.** Lo snippet GTM sta sempre
nell'HTML, quindi il suo stato sale e scende; GA4, Pixel e Klaviyo spesso li
inietta GTM a runtime, quindi dall'HTML si può solo **promuovere** ad attivo,
mai declassare, e con GTM presente l'assenza vale «non deducibile» (giallo), non
«problema». Il QA giornaliero fa tre controlli per cliente con una sola richiesta al sito:
i controlli sono puri in `lib/tracking/qa-checks.ts` (li condivide anche
l'app di laboratorio `it-twobee/arealavoro`, vedi sotto), `qa.ts` è solo
l'orchestrazione su Supabase; per il Pixel, se il connettore Meta è
configurato, vince l'API (`last_fired_time` nelle 48h). Un cliente in cui nessun
controllo era possibile **non è verde**. Il giro lo lancia
`POST /api/tracking/qa/run` con `Authorization: Bearer $TRACKING_CRON_SECRET`
(task pianificato Coolify `tracking-qa-daily`, `0 7 * * *`, `wget` di busybox
perché l'immagine è alpine e curl non c'è; **`127.0.0.1`, non `localhost`**: nel
container `localhost` risolve in IPv6 e Next ascolta solo su IPv4, quindi
«connection refused»): sincrono, sequenziale, guardia anti-concorrenza a 30
minuti. Se Traefik risponde 504 sui giri lunghi, la route passa a «avvia e
rispondi 202» senza toccare `runQa`.

**Report.** GA4 via service account (JWT RS256 fatto a mano con `node:crypto`,
niente `google-auth-library`), Klaviyo con chiave per cliente, Meta con token
d'agenzia; 30 giorni che **chiudono ieri** più i 30 precedenti; funnel B2B a
due query (la Data API v1beta non ha un endpoint funnel); parametri custom
saltati con il motivo, non fatali; la definizione usata viene **congelata nel
run**; 30 run per cliente, anche quelli falliti. Template checklist e
definizioni report sono **JSON importati come moduli**
(`lib/tracking/templates`, `lib/tracking/definitions`): con `output: standalone`
una lettura da `fs` non verrebbe tracciata. Gli id delle voci di checklist sono
chiavi a DB: rinominarne uno perde la spunta.

Gate: `npx tsx lib/tracking/{crypto,vocab,site-check,meta,checklist,reporting,csv,qa-checks}.check.ts`.
Env: `VAULT_KEY`, `TRACKING_CRON_SECRET` (entrambe `openssl rand -hex 32`),
opzionali `TWOBEE_GA4_TOKEN_URL`, `TWOBEE_GA4_DATA_URL`, `TWOBEE_META_BASE`,
`TWOBEE_KLAVIYO_BASE`, `TWOBEE_KLAVIYO_REVISION`.


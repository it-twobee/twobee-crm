# TWO BEE Gestionale — contesto per gli agenti

## Le regole stanno in `CLAUDE.md`. Qui non si duplicano.

Leggi **`CLAUDE.md`** e i documenti di dominio che indica (`docs/`). Questo file
non è un secondo manuale: era diventato uno, e quello che conteneva a luglio
2026 — colori scritti a mano, `llama-3.3-70b-versatile`, «migration 001–034»,
un «BUG NOTO» risolto da un reset di due mesi prima — non era *vecchio*, era
**sbagliato**: sono istruzioni, e un agente le esegue.

Due manuali che si contraddicono sono peggio di uno solo: chi legge non sa
quale vale, e la risposta giusta («il codice») è quella che nessuno dei due dà.
Quindi qui resta solo il puntatore, e la memoria del perché.

## Le tre cose che non devono sfuggire

1. **I colori non si scrivono.** L'app ha tema chiaro e scuro: ogni colore passa
   dai token (`bg-surface`, `text-text-primary`, `text-gold-text`…). Un `#hex` o
   un `text-white` rompe il contrasto in uno dei due temi. La tabella completa è
   in `CLAUDE.md`, sezione «Design system».
2. **Il modello AI non si scrive.** Sta in `lib/ai/model.ts`, si cambia con la
   env `GROQ_MODEL`. Un literal copiato in cinque route le ha fatte morire tutte
   insieme il giorno che il modello è stato dismesso.
3. **Un file `'use server'` esporta endpoint.** «C'è una sessione» non è un
   permesso. Si può saltare il controllo di ruolo **o** il client di servizio,
   non tutti e due (§329): `npx tsx lib/actions-guard.check.ts`.

## I gate, prima di dire che è fatto

```bash
npx tsc --noEmit                       # zero errori
npx tsx lib/<percorso>.check.ts        # i 48 file lib/**/*.check.ts, exit 0
```

`npm run lint` è nel `package.json` ma non controlla niente: manca la
configurazione ESLint.

## Stato del lavoro

`docs/stato.md` — cosa è applicato e cosa è aperto.
`docs/migrations.md` — quali migration esistono davvero sul database.
`docs/audit-twobee-os.md` — il registro dei problemi aperti e delle verifiche.

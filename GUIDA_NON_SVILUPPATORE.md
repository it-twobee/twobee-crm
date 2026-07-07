# TwoBee OS - guida semplice per costruirlo con Codex

Questa guida serve a lavorare sul gestionale senza dover essere sviluppatore.

## Come userai Codex

Tu decidi cosa deve fare il gestionale.
Codex legge il codice, modifica i file, controlla gli errori e ti dice dove cliccare.

Il modo migliore per chiedere le cose e questo:

```txt
Voglio aggiungere [funzione] in [pagina].
Deve servire a [obiettivo pratico].
L'utente deve poter fare queste azioni:
1. ...
2. ...
3. ...
```

Esempio:

```txt
Voglio aggiungere un widget in dashboard per vedere i clienti con margine basso.
Deve mostrare cliente, MRR, costo stimato, margine e alert.
Deve usare lo stile TwoBee gia presente.
```

## Prima cosa da fare

Il progetto esiste gia. Non va ricreato da zero.

La priorita e questa:

1. Farlo partire in locale.
2. Sistemare il database Supabase.
3. Verificare login, dashboard, clienti, progetti e chat.
4. Aggiungere un modulo alla volta.

## Comandi base

Apri il terminale dentro questa cartella:

```bash
/Users/marcolucci/Claude_TwoBee_HQ_Room
```

Poi usa:

```bash
npm run dev
```

Apri:

```txt
http://localhost:3000
```

Quando Codex finisce una modifica importante, chiedi:

```txt
Controlla che non ci siano errori TypeScript e dimmi cosa devo testare nel browser.
```

## Configurazione minima

Il file importante e:

```txt
.env.local
```

Deve contenere:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
GROQ_API_KEY=...
```

Non condividere mai `SUPABASE_SERVICE_ROLE_KEY` in chat pubbliche, screenshot o frontend.

## Bug urgente da risolvere su Supabase

In Supabase Dashboard vai su:

```txt
SQL Editor -> New query
```

Esegui:

```sql
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_channels_project
  ON public.chat_channels(project_id);
```

Questo serve per isolare correttamente le chat per progetto.

## Ordine consigliato dei lavori

### Fase 1 - Base funzionante

Obiettivo: entrare nel gestionale e usare le funzioni principali.

- Login Supabase
- Dashboard
- Clienti
- Progetti
- Task
- Chat progetto

Prompt da usare:

```txt
Verifica lo stato della piattaforma e correggi solo gli errori che bloccano npm run build.
```

### Fase 2 - Dashboard direzionale

Obiettivo: Marco apre la dashboard e capisce subito cosa fare.

- Company Pulse
- Client Health
- Delivery Radar
- Team Capacity
- Sales Pipeline
- Strategic Objectives
- Decision Center
- Margin Radar

Prompt da usare:

```txt
Migliora la dashboard founder: voglio vedere priorita, rischi, soldi, decisioni e task urgenti. Modifica solo i widget necessari.
```

### Fase 3 - Operativita

Obiettivo: il team capisce cosa deve fare ogni giorno.

- Vista "Le mie attivita"
- Scadenze
- Task assegnati
- Task bloccati
- Commenti e aggiornamenti

Prompt da usare:

```txt
Rendi la pagina Le mie attivita utile per una risorsa: task di oggi, task in ritardo, task bloccati e prossima azione.
```

### Fase 4 - Portali

Obiettivo: clienti, partner e risorse vedono solo cio che devono vedere.

- Portale cliente
- Portale risorsa
- Portale partner
- Permessi RLS

Prompt da usare:

```txt
Controlla il portale cliente: deve mostrare solo dati autorizzati, essere semplice e avere chat, task cliente, KPI e documenti.
```

### Fase 5 - AI

Obiettivo: l'AI aiuta a decidere, non fa decorazione.

- Executive Brief
- Sintesi progetto
- Estrazione dati da documenti
- Piano sprint
- Report KPI

Prompt da usare:

```txt
Crea un Executive Brief AI che legga dashboard, clienti, progetti, task, deals e decisioni. Deve restituire massimo 5 priorita operative.
```

## Regola d'oro

Non chiedere:

```txt
Costruisci tutto il CRM.
```

Chiedi:

```txt
Costruisci questo pezzo, in questa pagina, con questo risultato visibile.
```

Un gestionale grande si costruisce bene a blocchi piccoli.


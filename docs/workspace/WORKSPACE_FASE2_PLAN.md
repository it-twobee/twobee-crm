# WORKSPACE — Piano Fase 2: Calendario

> DA APPROVARE prima di scrivere codice. Basato su WORKSPACE_AUDIT §3.4 e D8/D4-bis.
> §8.1 (gate @twobee.it) è già chiuso in Fase 0.

## Stato attuale (dall'audit)
- Un solo `CalendarioClient` condiviso admin+workspace (✅). Ma **due form evento** divergenti
  (`EventEditorModal` vs modale in `AppuntamentiTab`) e **nessuna persistenza**: gli eventi si
  leggono LIVE da Google a ogni GET; le scritture vanno diritte su `primary`.
- Conseguenza: "Google → tool" è già riflesso **al refresh** (live-read). Manca: form unico,
  link stabile evento↔cliente/progetto, e push real-time (webhook).
- Appuntamenti (§16) oggi collega gli eventi al progetto con `title.includes(nome)` (fragile).

## Obiettivo
Form evento unico stile Google; persistenza + sync robusta (link cliente/progetto reale,
external id, stato sync); push real-time via webhook (D8); form da progetto (§16.1).
Le task restano overlay interno, mai eventi Google (già così, da mantenere).

## Sotto-step (ordine per rischio)

### 2a — `CalendarEventForm` unico 🟢
Estrarre `EventEditorModal` in `components/calendario/CalendarEventForm.tsx` condiviso.
Campi §8.2: titolo, data, ora inizio/fine, tutto-il-giorno, **timezone** (UI, oggi hardcoded
`Europe/Rome`), descrizione, luogo, partecipanti, Google Meet, **cliente/progetto** (nuovo),
promemoria/ricorrenza (vedi domanda Q3), colore. Sostituisce il form in `CalendarioClient` e
in `AppuntamentiTab`. Nessuna migration. Sistema anche i colori hardcoded di AppuntamentiTab.

### 2b — Persistenza + write-through (migration 102) 🟠
Tabella `calendar_events` (mirror locale): `id, profile_id, external_event_id, calendar_id,
client_id, project_id, title, description, location, start_at, end_at, all_day, timezone,
attendees jsonb, meet_link, color, sync_status ('synced'|'pending'|'error'|'local'),
last_synced_at, created_at`. RLS: proprietario + staff-read (come agende, "Occupato" per gli altrui).
- Le scritture (create/update/delete) vanno a Google **e** aggiornano `calendar_events` (write-through).
- **Token refresh persistito** in `google_credentials` (oggi il refresh in-memory non viene salvato → expiry stale).
- Beneficio collaterale: §16 Appuntamenti usa il link reale `project_id`, non più string-match.

### 2c — Webhook push real-time (Google push channels) 🔴 infra-dipendente
Endpoint `/api/google/webhook` (POST) che riceve le notifiche di Google e ri-sincronizza gli
eventi cambiati nel mirror. Registrazione `watch` sul calendario dell'utente (channel con
scadenza ~7gg → **rinnovo** via cron/on-access). Colonne canale: `channel_id, resource_id,
channel_expiry` (su `google_credentials` o tabella dedicata). Gestione: token scaduto, retry,
conflitti (vedi Q2), audit. **Richiede dominio HTTPS pubblico** (Q1) — in locale non scatta.

### 2d — Form evento da progetto (§16.1) 🟢
Tab Appuntamenti: bottone "Nuovo appuntamento" apre `CalendarEventForm` precompilato
(cliente, progetto, titolo/descrizione suggeriti; AI opzionale per titolo/descrizione, editabile
prima di salvare). Evento salvato → write-through (2b) + link progetto reale.

## Output §37
- **Migration**: `102_calendar_events.sql` (tabella + RLS + colonne canale su google_credentials).
- **File creati**: `components/calendario/CalendarEventForm.tsx`, `app/api/google/webhook/route.ts`, `app/actions/calendar-events.ts` (write-through create/update/delete).
- **File modificati**: `CalendarioClient.tsx` (usa il form condiviso + legge mirror), `AppuntamentiTab.tsx` (form condiviso + link reale), `app/api/google/events/route.ts` (persisti token refresh + write-through), `app/api/google/callback` (registra watch channel).
- **Tabelle/RLS**: `calendar_events` (nuova), `google_credentials` (colonne canale).
- **Componenti riusati**: `CalendarioClient`, `lib/calendar-colors`.
- **Componenti eliminati dalla UX**: i due form evento duplicati.
- **Route**: `/api/google/*`, `/calendario`, `/workspace/calendario`, tab Appuntamenti.
- **Test manuali per ruolo**: crea/modifica/elimina evento → riflesso su Google e nel mirror;
  modifica su Google → riflessa nel tool (refresh, e real-time se webhook attivo); non-@twobee.it bloccato (Fase 0); task NON create come eventi.
- **Rischi**: webhook richiede dominio pubblico + rinnovo channel; conflitti di sync; timezone;
  refresh token race su Promise.all multi-profilo. Rollback: migration additiva (drop `calendar_events`), form riaccorpabile, webhook disattivabile lasciando il live-read attuale.

## Percorso consigliato
2a + 2b + 2d danno subito valore (form unico, link reale cliente/progetto, sync write-through +
live-read già riflette Google al refresh). **2c (webhook real-time) dipende dall'infra** e può
essere l'ultimo tassello quando il dominio pubblico è pronto — senza bloccare il resto.

## Domande bloccanti (Fase 2)
- **Q1 (infra webhook)**: c'è un **dominio HTTPS pubblico stabile** già deployato (`NEXT_PUBLIC_APP_URL`)
  su cui Google possa chiamare il webhook? Se non ancora, faccio 2a+2b+2d ora e 2c quando il dominio è pronto.
- **Q2 (conflitti)**: se un evento è modificato **sia** nel tool **sia** su Google, chi vince?
  Google-wins (semplice, l'esterno è la fonte) / tool-wins / last-write-timestamp?
- **Q3 (ricorrenza/promemoria)**: nel form v1 li gestiamo (persistiti+passthrough Google) o li
  rimando (solo campi base + Meet ora, ricorrenza/promemoria in un secondo giro)?
- **Q4 (calendari)**: solo `primary` (come oggi) o multi-calendario? (definisce `calendar_id`).

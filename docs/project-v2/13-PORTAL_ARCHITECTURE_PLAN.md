# 13 — Portal Architecture Plan

## Tre esperienze, un dominio
```
1. Portale Admin     (/dashboard)  — esistente, si estende
2. Portale Risorsa   (/workspace)  — esistente, è il Workspace (confermato)
3. Portale Cliente   (/portale)    — da costruire
```
Tutte leggono le stesse entità. Le differenze sono solo: dati visibili, permessi,
azioni, navigazione, linguaggio, UI, RLS. **Nessuna** `resource_projects`,
`client_tasks`, ecc.

## Gate a due livelli
1. **middleware.ts** — routing per ruolo (già: admin→/dashboard, workspace-roles→
   /workspace, client/guest→profilo). Aggiungere: `client` → `/portale`.
2. **Layout + RLS** — ogni layout ricontrolla il ruolo; la RLS è la barriera vera.

## Mappa ruolo → portale (da `coarseRole`)
| app_role | Portale |
|---|---|
| super_admin, founder, admin | Admin `/dashboard` (+ preview /portale) |
| manager, senior, junior, stage, freelance, partner | Workspace `/workspace` |
| client | Cliente `/portale` |
| guest (risorsa esterna) | da ridisegnare (accesso clienti caduto) |

## Linguaggio per portale
- Admin/Workspace: termini tecnici ("Sottoprogetto", "Milestone", "Task").
- Cliente: "Sottoprogetto" confermato (nessuna traduzione dinamica), linguaggio
  più sintetico, niente termini operativi interni.

## Ordine di costruzione
Admin (dominio progetto) → Workspace (riattiva sezioni) → Cliente (nuovo). Il
Portale Cliente arriva **dopo** che il motore è stabile lato interno (doc 12).

## Sicurezza (pre-requisito ai nuovi portali)
Definire prima ruoli, middleware, layout, route autorizzate, Server Action, API,
RLS, visibilità, ownership. Regola minima:
```
Admin    → tutto secondo ruolo
Risorsa  → solo dati assegnati/autorizzati
Cliente  → solo dati del proprio client_id, solo visibility='client_visible'
```
Mai inviare al frontend dati che l'utente non può vedere (non basta nascondere il
componente).

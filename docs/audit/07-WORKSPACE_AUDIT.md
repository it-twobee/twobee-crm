# 07 — Audit Portale Operativo (Workspace)

> `/workspace/**` per manager…partner + viewer. È anche la white-label dei
> collaboratori. Filtri: RLS + scoping per utente/assegnazione.

| Sezione | Filtro dato | Util. | Azione | Nota |
|---|---|:--:|---|---|
| Dashboard risorsa | task/HR/scadenze proprie | 4 | KEEP | banner doc in scadenza |
| Le mie attività | assegnate a me | 5 | KEEP | bacheca dnd + timeline |
| Calendario | miei eventi + colleghi | 4 | KEEP | task personali off di default |
| Progetti | dove sono assegnato | 4 | KEEP | scoped |
| Portfolio | progetti assegnati | 3 | KEEP | **no dati economici** ✅ |
| Workload | miei progetti (PM/admin: tutti) | 5 | KEEP | editing gated al PM |
| Documenti | per visibility | 3 | KEEP | 1 doc nel DB |
| Clienti attivi | lettura (092) | 3 | KEEP | senza dati economici |
| Customer Care / Ticket | supporto | 3 | KEEP | |
| Richieste HR | ferie/permessi/spese | 4 | KEEP | 0 richieste |
| Buste Paga | solo le proprie | 5 | KEEP | signed URL, owner-only ✅ |
| Documenti Personali | scadenze proprie | 4 | KEEP | owner-only ✅ |
| Cronologia | mie attività | 3 | KEEP | activity_log filtrato |
| Profilo | dati/Google/tema | 4 | KEEP | ha ThemeToggle ✅ |
| Ricerca ⌘K | naviga il workspace | 4 | KEEP | **nuovo**, scoped `/workspace/*` |
| Chat / Task globale | — | — | HIDE ✅ | già disattivate + redirect |

### Sicurezza (verificata)
- Nessun dato economico esposto (portfolio ristretto, no MRR per cliente).
- Buste paga e documenti personali: owner-only via RLS + signed URL.
- ⚠️ Le falle `USING(true)` (04) toccano anche il workspace: `project_appointments`
  e `project_comments` leggibili oltre lo scope. Da chiudere (SEC-01).

### Workspace vs Portale Risorsa esterna — raccomandazione
Oggi il **Workspace è nettamente più completo** del Portale Risorsa. Le funzioni
del Risorsa (attività, progetti, documenti, timesheet) sono un **sottoinsieme** del
Workspace. Un `guest` con `resource_profile` potrebbe essere servito dal Workspace
con permessi ridotti, evitando di mantenere due portali.
→ **Proposta (P2, decisione di prodotto):** consolidare Risorsa dentro Workspace
con un flag di capability, oppure dichiarare il Risorsa esplicitamente "read-only
minimale". Vedi `09` e `13` (item CONS-01).

### Gap
1. **Nessun PM sui progetti** → gli utenti workspace non possono modificare le task
   dal Workload (editing riservato al PM). Blocca il valore della sezione.
2. Timesheet non presente nel workspace (voce nascosta): decidere se serve qui.

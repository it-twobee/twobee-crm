# 08 — Audit Portale Cliente

> `/portale` → `ClientPortalView` a tab. Un solo `page.tsx`, dati filtrati per
> `client_assignments` + RLS. Obiettivo: l'imprenditore capisce in <30s stato,
> risultati, cosa serve da lui.

## 🔴 Blocco d'ingresso
**`client_assignments` = 0 nel DB.** Il portale filtra il cliente da questa tabella;
con 0 righe, ogni cliente reale vede **"Nessun account collegato"**. Il super admin
entra solo in anteprima (scegliendo `?client=`). → Nessun cliente può usarlo oggi.
Fonte canonica del legame cliente↔utente da confermare (esistono anche
`user_client_assignments`, `client_accounts`). **P0 per andare live coi clienti.**

## Tab (dati e giudizio)
| Tab | Dato | Filtro | Util. | Nota |
|---|---|---|:--:|---|
| Panoramica | stato servizi, sintesi | client_id | 5 | prima cosa che vede |
| Progetti | i suoi progetti | client_id | 4 | |
| Da fare | task cliente (`is_client_task`) | client_id | 4 | 9 task client nel DB |
| Aggiornamenti | `project_comments` | project_id | 4 | ⚠️ RLS `USING(true)` (04) |
| Chat | customer care del progetto | channel | 4 | separata dall'interna ✅ |
| Documenti | `documents` visibili | client_id | 3 | 1 doc |
| Report/KPI | `client_kpis` | client_id | 4 | 1 kpi |
| Fatture | `invoices` | client_id | 4 | 0 fatture |

## Confini di sicurezza (verificati concettualmente)
Il cliente non deve vedere: costi interni, marginalità, note private, dati altri
clienti. La struttura filtra per `client_id`, ma **le falle `USING(true)`
(project_appointments/comments/kpi_config) permetterebbero query cross-tenant**:
va chiuso prima del go-live clienti.

## UX per non-tecnici
- ✅ Light mode dedicata, layout a tab semplice.
- 🔴 **Manca il selettore di tema** (nessun `ThemeToggle` in `ClientPortalView`).
- ⚠️ Empty state da curare: con 0 fatture / pochi update il portale sembra vuoto;
  servono messaggi rassicuranti ("nessuna fattura in sospeso ✓").
- Valutare una **CTA chiara** ("hai bisogno? apri un ticket / scrivici").

## Azioni
- **P0**: popolare `client_assignments` (o confermare la tabella canonica) →
  senza, il portale è irraggiungibile per i clienti.
- **P1**: `ThemeToggle` nell'header del portale cliente.
- **P1**: chiudere le RLS `USING(true)` che toccano dati progetto/cliente.
- **P2**: empty state + CTA orientati all'imprenditore.

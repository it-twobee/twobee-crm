# 14 — Resource Portal Plan (Workspace)

Il Portale Risorsa **è** il Workspace esistente (`/workspace`, confermato): si
estende col dominio progetto, non si crea `/risorsa`.

## Destinatari
manager, senior, junior, stage, freelance, partner (`WORKSPACE_ROLES`). Freelance e
partner: scoped ai soli progetti propri.

## Sezioni (riattivare `workspace_sections`)
- **Le mie attività** (`mie_attivita`) — task assegnate (progetto + Ad Hoc), oggi/
  settimana/scadute, ricorrenti incluse.
- **Progetti** (`progetti`) — progetti/sottoprogetti dove la risorsa è nel team.
- **Calendario** — già presente; task con `due_date` + eventi.
- **Clienti** — già presente (con visibilità da ridisegnare).

## Cosa vede
progetti/sottoprogetti/milestone/task assegnati o condivisi, task ricorrenti come
normali attività, scadenze, commenti, documenti autorizzati, notifiche, dati
cliente minimi, richieste di supporto, cronologia personale.

## Cosa NON vede
costi, marginalità, compensi altrui, fatture, preventivi, MRR, dati economici,
note riservate, HR di altri, progetti non assegnati (salvo permesso).

## Azioni (per ruolo)
aprire/aggiornare stato, commentare, checklist, caricare/collegare documenti,
completare, modificare date (se autorizzato), richiedere supporto (`richiesta_supporto`),
creare task (se autorizzato), vedere ricorrenze future, segnalare blocco.
Non modifica i template globali (solo super_admin).

## Drawer Task unico (`<TaskDetailDrawer>`)
**Un solo** componente in: progetto, Le mie attività, dashboard, calendario,
workspace, ricerca globale. Campi: titolo, descrizione, progetto/sottoprogetto/
milestone (o "Ad Hoc"), owner, collaboratori, stato, priorità, start/due, ore
stimate, commenti, link documenti, checklist, ricorrenza, visibilità, cronologia.
Le modifiche si riflettono ovunque (Realtime dove opportuno). **Niente form task
alternativi**.

## Task ricorrenti lato risorsa
Appaiono come normali attività: Cliente / Progetto / Sottoprogetto / Attività /
Scadenza / Frequenza / Owner / Priorità. La risorsa completa/commenta/segnala/
chiede supporto; modifica la singola occorrenza se autorizzata; non tocca il template.

## RLS
Vedi doc 10. Scrittura assegnatari e generazione ricorrenze via service role.

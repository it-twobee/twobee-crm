# 09 — CTA Map

Ogni CTA rispetta la gerarchia: non si crea un livello senza il padre. Gli unici
task senza padre sono gli **Ad Hoc**, che nascono dalla loro sezione dedicata.

## Dominio Cliente (`/clienti/[id]` e workspace equiv.)
- **Nuovo progetto** → wizard (cliente precompilato).
- **Nuova task Ad Hoc** → drawer task in modalità `ad_hoc` (no progetto/milestone),
  assegnabile a risorsa interna o al cliente.
- ❌ Nessuna CTA che crei task di progetto senza progetto.

## Sezione globale `/progetti`
- **Nuovo progetto** → wizard (step Cliente obbligatorio).

## Dominio Progetto (`/clienti/[id]/progetti/[projectId]` o `/progetti/[id]`)
- **Nuovo sottoprogetto**
- **Nuova milestone** → richiede la scelta del **sottoprogetto** (obbligatorio).
- **Nuova task** → richiede **sottoprogetto + milestone** (obbligatori).
- **Nuova task ricorrente** → crea `recurring_task_templates`.

## Dominio Sottoprogetto
- **Nuova milestone**
- **Nuova task** (milestone obbligatoria; default = "Operatività continua")
- **Nuova task ricorrente**

## Dominio Milestone
- **Nuova task**
- **Nuova task ricorrente**

## Regole di abilitazione (per ruolo, vedi doc 10)
| CTA | Chi |
|---|---|
| Nuovo progetto | admin, manager |
| Nuovo sottoprogetto / milestone | admin, manager, PM del progetto |
| Nuova task (progetto) | admin, manager, PM, risorsa assegnata (scoped) |
| Nuova task ricorrente (istanza) | admin, manager, PM |
| Nuova task Ad Hoc | admin, manager, PM, risorsa (secondo permesso) |
| Modifica template globale | solo super_admin |

## Coerenza deep-link
Ogni CTA che apre un task usa lo **stesso** drawer (doc 14): stesso componente in
progetto, Le mie attività, dashboard, calendario, workspace, ricerca globale.

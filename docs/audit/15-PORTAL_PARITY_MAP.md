# 15 — Mappa di parità Admin ↔ Workspace

Due domini perimetrali paralleli, **connessi ma con viste separate**. Il Workspace
non è un portale ridotto “a caso”: esclude di proposito ciò che è economico o
strategico/direzionale. I dati economici restano **nascosti** (`hideEconomics`).

## Regola di routing (fondazione)
`lib/portal-routes.ts` → `usePortalRoutes()` deduce il perimetro dal `usePathname()`:

| Entità | Admin | Workspace |
|---|---|---|
| Progetto | `/clienti/<cid>/progetto/<pid>` | `/workspace/progetti/<pid>` |
| Cliente | `/clienti/<cid>` | `/workspace/clienti/<cid>` |

I componenti condivisi devono usare `projectHref/clientHref` (o il prop `backHref`/
`hideEconomics` dove già presente), **mai** un path assoluto `/clienti/...` hardcoded.

## Stato link cross-dominio (audit completo)

| Componente condiviso | Reso in workspace | Meccanismo dominio | Stato |
|---|---|---|---|
| `MieAttivitaClient` | `/workspace/attivita` | `usePortalRoutes()` | ✅ **fixato** |
| `WorkloadClient` | `/workspace/workload` | `usePortalRoutes()` | ✅ **fixato** |
| `ClientiList` | `/workspace/clienti` | `hideEconomics` | ✅ già ok |
| `PanoramicaTab` (client tabs) | via `ClientPageClient` | `hideEconomics` | ✅ già ok |
| `ClientPageClient` | `/workspace/clienti/[id]` | `backHref` + `hideEconomics` | ✅ già ok |
| `ProjectPageClient` | `/workspace/progetti/[id]` | `backHref` | ✅ già ok |
| `GlobalSearch` (`workspaceSearch`) | header workspace | href `/workspace/*` | ✅ già ok |
| `LostSection` (in ClientiList) | — | reso solo se `!hideEconomics` | ✅ mai in workspace |
| `CalendarioClient` / `CustomerCareClient` / `DocumentiClient` / `TicketSystem` | vari | nessun link progetto | ✅ nessun leak |

**Conclusione link**: dopo i due fix non restano salti di dominio. Navigazione
bidirezionale contenuta dentro ogni perimetro.

## Parità di sezioni

### Speculari (stessa cosa, vista adattata)
| Admin | Workspace | Note |
|---|---|---|
| `le-mie-attivita` | `attivita` | stesso `MieAttivitaClient` |
| `clienti` / `clienti/[id]` | `clienti` / `clienti/[id]` | `hideEconomics` |
| `progetti` / `progetto/[id]` | `progetti` / `progetti/[id]` | `WorkspaceProjectsClient` + `ProjectPageClient` |
| `workload` | `workload` | stesso `WorkloadClient` |
| `calendario` | `calendario` | — |
| `documenti` | `documenti` | — |
| `customer-care` (+`/tickets`) | `customer-care` (+`/tickets`) | — |
| `hr` | `hr` | vista ridotta |
| `portfolio` | `portfolio` | — |
| `feedback` | `feedback` | — |
| `impostazioni/profilo` + `impostazioni/cronologia` | `profilo` + `cronologia` | — |
| `dashboard` | `page.tsx` (home workspace) | home diverse per ruolo |
| `chat` | → redirect `customer-care` | chat disattivata nel workspace by design |
| `task` | → redirect `attivita` | vista task globale disattivata |

### Solo Admin (esclusi dal Workspace — economico/direzionale)
`commerciale`, `controllo-gestione`, `fatturazione`, `soldi/costi-risorse`,
`strategia`, `direzione/decision-center`, `direzione/roadmap`, `operativa`,
`timeline`, `reparti`, `portale-cliente`, `twobee-os`, `impostazioni`.

→ **Nessuno di questi va portato in Workspace** con la scelta “economici nascosti”.
Eventuali candidati non-economici da valutare in futuro: `reparti` (operatività per
reparto) e `timeline` (roadmap progetti) — ma solo se il backlog lo richiede.

### Solo Workspace (personali, by design)
`buste-paga`, `documenti-personali` — RLS owner-only, non hanno senso in Admin.

## Esito
- Codice: fix link completato (2 componenti). Nessuna sezione nuova da costruire con
  la scelta corrente.
- Se in futuro si vuole portare `reparti`/`timeline` nel Workspace: aggiungere le
  rotte `/workspace/reparti` e `/workspace/timeline` riusando i componenti con un
  prop `hideEconomics`, e i link continueranno a passare da `usePortalRoutes()`.

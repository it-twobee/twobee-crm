# 09 — Audit Portale Risorsa esterna

> `/risorsa/**` per `guest` con `resource_profiles.can_access_resource_portal`.
> Rotte reali: `/risorsa`, `/attivita`, `/progetti`, `/documenti`, `/timesheet`.

## Cosa c'è
| Sezione | Util. | Nota |
|---|:--:|---|
| Dashboard | 3 | vista sintetica |
| Attività | 4 | le proprie task |
| Progetti | 3 | dove è assegnato |
| Documenti | 3 | condivisi con lui |
| Timesheet | 3 | log ore (task_time_logs 0) |

## Cosa manca rispetto al Workspace
- ❌ Profilo dedicato · ❌ Documenti personali · ❌ Buste paga · ❌ Cronologia
- ❌ Selettore tema (`ThemeToggle` assente in `RisorsaNav`)
- ❌ Calendario / HR / Chat strutturata

## Cosa NON deve vedere (confini)
Marginalità, costi altrui, MRR, strategia, fatture, dati di altri clienti. Degli
eventi calendario altrui: solo "Occupato".

## Valutazione strategica: separare o consolidare?
Il Portale Risorsa è un **sottoinsieme stretto** del Workspace. Mantenerne due
raddoppia la manutenzione (layout, sidebar, RLS, temi) senza valore aggiunto
evidente.

**Due strade (decisione di prodotto, P2):**
1. **Consolidare** — servire i `guest`-risorsa dal Workspace con un profilo di
   capability ridotto (niente clienti/economia/HR interna). Un solo portale
   operativo dinamico. Meno codice, coerenza UX, il tema è già risolto lì.
2. **Mantenere separato ma minimale** — dichiarare esplicitamente il Risorsa come
   "portale esterno essenziale", allinearlo almeno su tema e profilo, e non farlo
   crescere.

**Raccomandazione:** opzione 1 (consolidamento) se i partner/freelance esterni
devono diventare operativi come il team; opzione 2 se restano collaboratori
occasionali. Da decidere in base al modello di collaborazione reale.

## Azioni
- **P1**: `ThemeToggle` in `RisorsaNav` (allineamento minimo).
- **P2**: decidere consolidamento vs separazione (CONS-01 nel backlog).

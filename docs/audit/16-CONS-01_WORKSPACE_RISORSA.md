# 16 — CONS-01: consolidare Portale Risorsa nel Workspace?

> Proposta (decisione di prodotto). **Nessuna implementazione** senza ok.
> Vedi 09-RESOURCE_PORTAL_AUDIT.md.

## Stato dei fatti (verificato nel codice)

**Portale Risorsa** (`/risorsa/**`, per `guest` con `resource_profiles.can_access_resource_portal`):
- 5 rotte: home, `attivita`, `progetti`, `documenti`, `timesheet`.
- Layout + nav dedicati (`RisorsaNav`), 3 componenti custom (`RisorsaTasks`,
  `RisorsaTimesheet`, `RisorsaNav`). `ThemeToggle` già aggiunto (UX-02).
- Gate in `middleware.ts`: `role='guest'` + `can_access_resource_portal` → `/risorsa`.

**Workspace** (`/workspace/**`): stesse funzioni ma più ricche, e soprattutto ha
già un **sistema di visibilità sezioni per ruolo**:
`workspace_sections` + `workspace_section_permissions.can_view` (letto in
`app/(workspace)/layout.tsx` e reso da `WorkspaceSidebar`).

## Perché questo cambia la decisione
Il Risorsa è un **sottoinsieme stretto** del Workspace (attività, progetti,
documenti, timesheet — tutte già presenti nel Workspace). E il Workspace **sa già
nascondere sezioni per ruolo via dato** (nessun deploy per cambiare capability).
Quindi "servire le risorse dal Workspace con capability ridotte" **non è un
rewrite**: è aggiungere un profilo di permessi + estendere il gate.

## Raccomandazione: **Opzione 1 — consolidare** (con riserva sul modello)
Consolidare il Risorsa dentro il Workspace, con un capability-profile "risorsa
esterna" che espone solo: `attivita`, `progetti` (sola lettura dove assegnato),
`documenti`, `workload` personale?, `timesheet`, `profilo`. Nasconde: clienti,
economia, HR interna, feedback, buste-paga.

**Condizione**: vale la pena se partner/freelance diventano operativi come il
team. Se restano collaboratori occasionali sporadici → **Opzione 2** (tenerlo
separato ma minimale, già quasi a posto: manca solo l'allineamento profilo).

## Confini di sicurezza (invarianti, in entrambe le opzioni)
La risorsa NON deve vedere: marginalità, costi altrui, MRR, strategia, fatture,
dati di altri clienti; degli eventi calendario altrui solo "Occupato". Oggi questi
confini sono garantiti dal fatto che il Risorsa è un portale a parte. Consolidando,
i confini si spostano su **RLS + capability-profile**, che devono essere blindati
prima di esporre qualsiasi sezione in più. Questo è il vero rischio del consolidamento.

## Percorso di migrazione proposto (SE si sceglie l'Opzione 1)
Fasi additive, ognuna verificabile, nessun big-bang:

1. **Capability layer** — introdurre un `capability_profile` (es. valore
   `resource` su `resource_profiles` o una colonna su `profiles`) e far leggere al
   `WorkspaceSidebar`/layout un set di sezioni ridotto per quel profilo. Riusa
   `workspace_section_permissions`. *Solo dato + lettura, nessuna UI nuova.*
2. **Gate** — in `middleware.ts` consentire ai `guest`-risorsa `/workspace/**`
   limitato alle sezioni del loro profilo; redirect additivo da `/risorsa/*` →
   equivalente `/workspace/*`. *Il portale `/risorsa` resta vivo come alias.*
3. **RLS hardening** — verificare che ogni tabella esposta nel Workspace neghi
   alle risorse i dati fuori perimetro (già staff-only molte; le risorse sono
   `guest`, non `is_staff()`, quindi molte sono già chiuse — ma va **auditato tabella per tabella**).
4. **Dismissione** — quando il traffico `/risorsa` è a zero, rimuovere layout/nav
   custom e i 3 componenti (o farli redirect). *Con ok esplicito.*

**Non** iniziare dalla UI: iniziare da capability + RLS. La UI è già pronta nel Workspace.

## Effort & rischio
- Opzione 1: **M/L**. Codice modesto (capability + gate), ma **audit RLS accurato**
  obbligatorio (è il grosso del lavoro e del rischio). Guadagno: un solo portale
  operativo, meno manutenzione (layout/sidebar/temi/RLS non più duplicati).
- Opzione 2: **XS**. Solo allineare profilo/tema (tema già fatto). Zero rischio,
  zero guadagno strutturale.

## Decisione richiesta
Le risorse esterne sono **operative come il team** (→ Opzione 1) o **collaboratori
occasionali** (→ Opzione 2)? Da questo dipende tutto. Nessun codice finché non è deciso.

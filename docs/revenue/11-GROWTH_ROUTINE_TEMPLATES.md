# 11 — Template routine Growth (proposta, modificabile)

Generato come bozza su richiesta. **Non è cablato nel codice**: diventerà il seed
di `task_templates` → `growth_routines`, e ogni riga sarà modificabile dalla UI
(titolo, frequenza, owner, ore, attiva/disattiva) per singolo cliente.

Principio: il template è il **default aziendale**; la routine su un cliente è una
copia che si può divergere senza toccare gli altri.

---

## Le 9 routine proposte

| # | Routine | Frequenza | Ore | Cosa produce |
|---|---|---|---|---|
| R1 | Controllo campagne ads | settimanale | 1,0 | check spesa/performance, stop agli annunci in perdita |
| R2 | Ottimizzazione budget | settimanale | 1,0 | riallocazione fra campagne |
| R3 | Analisi lead e qualità | settimanale | 1,0 | verifica volume e qualità dei lead consegnati |
| R4 | Verifica tracking | mensile | 1,0 | pixel, conversioni, GA4, integrità dei dati |
| R5 | Refresh creatività | mensile | 1,0 | nuovi asset per contrastare l'ad fatigue |
| R6 | Controllo automazioni | mensile | 1,0 | flussi email/CRM, sequenze attive |
| R7 | Report mensile cliente | mensile | 1,0 | documento consegnato al cliente |
| R8 | Meeting periodico cliente | mensile | 1,0 | call di allineamento |
| R9 | Review strategica e KPI | trimestrale | 1,0 | analisi profonda, ricalibrazione obiettivi |

**Default basso e uniforme: 1,0 h per ogni routine** (decisione round 4).

Motivo: `lib/workload.ts` applica `DEFAULT_TASK_HOURS = 4` alle task senza stima.
Lasciare `estimated_hours` vuoto non significa "peso zero" ma "peso 4 ore", che su
~127 task/mese produrrebbe 508 h/mese e renderebbe il Workload inutilizzabile.
Un default esplicito basso evita il problema senza fingere precisione.

`growth_routines.default_estimated_hours` è modificabile per singola routine e
per singolo cliente: le stime si affinano guardando i dati reali di
`time_entries`, non decidendole a tavolino adesso.

### Carico generato

Su **1 cliente Growth**: 12,9 h (settimanali) + 5 h (mensili) + 0,3 h
(trimestrali) ≈ **18,2 h/mese**.

Su **7 clienti Growth attivi** (esclusi Industrial S&F e AV Gioielli, cessati):
≈ **127 h/mese**, cioè **~0,8 FTE** di sole routine, prima di qualsiasi
iniziativa o progetto.

Nota: il flat 1h atterra a **127 h/mese** contro le **128 h/mese** della stima
differenziata iniziale. L'aggregato è praticamente identico — è la
*distribuzione* a essere piatta (il report mensile pesa quanto un check
settimanale). Per il dimensionamento del team il numero è già utile; per la
pianificazione della singola settimana andrà affinato.

### Task generate al mese

| Frequenza | Routine | × 7 clienti | Task/mese |
|---|---|---|---|
| settimanale | R1, R2, R3 | 3 × 4,3 sett. | ~90 |
| mensile | R4–R8 | 5 × 1 | 35 |
| trimestrale | R9 | 1 / 3 mesi | ~2 |
| | | **totale** | **~127** |

---

## Owner (Q20)

Proposta: **owner per cliente, con fallback sul template.**

- `growth_routines.default_owner_id` — chi la fa **su quel cliente**
- `task_templates` porta un ruolo suggerito (es. "media buyer"), non una persona

Motivo: le persone cambiano cliente più spesso di quanto cambi il processo. Un
owner cablato nel template aziendale va riscritto a ogni riassegnazione; un owner
sul cliente si cambia in un punto solo.

Se non valorizzato: la task nasce **non assegnata** e compare in una coda "Routine
senza owner" nella Panoramica Growth. Meglio visibile e vuota che assegnata a caso.

---

## Idempotenza

Ogni occorrenza è una `tasks` reale con `routine_id` + `period_key`:

| Frequenza | `period_key` | Esempio |
|---|---|---|
| settimanale | `YYYY-Www` | `2026-W30` |
| quindicinale | `YYYY-Www` (settimane pari) | `2026-W30` |
| mensile | `YYYY-MM` | `2026-07` |
| trimestrale | `YYYY-Qn` | `2026-Q3` |

`UNIQUE(routine_id, period_key)` + `ON CONFLICT DO NOTHING`: il generatore può
girare ogni notte, a mano, due volte in parallelo — non duplica mai. È il §20.11
garantito dal database, non dal codice.

---

## Rollout consigliato

1. Seed dei 9 template + attivazione su **un solo cliente pilota**
   (Petito Costruzioni o Plus Vending)
2. Due settimane di uso reale → si vede il carico vero e cosa nessuno esegue
3. Correzione della lista
4. Estensione ai restanti 6 clienti Growth

Costo di un errore in fase 1: ~18 task da cancellare. In fase 4: ~127.

---

## Da confermare

- Quali righe togliere o aggiungere
- Le frequenze (R5 "refresh creatività" mensile è la più incerta: dipende dalla
  spesa ads del cliente)
- Le ore stimate — servono al Workload, se sono sbagliate il carico è sbagliato
- Q21: una routine non eseguita si riporta al ciclo successivo, resta scaduta, o
  si chiude come "non svolta"?

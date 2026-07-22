# 02 — Classificazione dei progetti esistenti

## Ci sono due progetti

Il §29 del brief chiede dry run, backup, backfill assistito e categorie di
confidenza. Su **due righe** non serve un processo: serve che tu confermi due
scelte.

| Progetto | Cliente | Oggi | Servizio suggerito | Linea | Motore | Ricavo | Confidenza |
|---|---|---|---|---|---|---|---|
| `Growth Fatima Leo` | Fatima Leo Salon & Academy | `service_line=growth`, `project_type=lead_gen`, `delivery_model=recurring_operations` | **Growth Lead Generation** | growth | growth_program | recurring | **alta** — creato oggi con questa intenzione |
| `Test` | — | `service_line=digital` | nessuno | — | — | — | **da cancellare** |

## Il progetto `Test`

31 task, `service_line=digital`, nome `Test`. Non è un progetto reale: è una
prova fatta durante lo sviluppo. Va cancellato, non classificato.

Da confermare prima di procedere.

## Task

| Gruppo | Righe | Azione |
|---|---|---|
| Routine di Fatima | 27 | **tenere** — dati veri, generate dal motore |
| Task del progetto `Test` | 31 | cancellare con il progetto |
| Task di prova senza progetto | 7 | cancellare (`Test 1`, `tewst`, `Bello 2`…) |
| Lead di prova | 3 | cancellare (`giulia@esempio.it`, `marco@esempio.it`, Anna Verdi) |

## Conclusione

Non serve UI di backfill, non servono categorie di confidenza, non serve
rollback. La riclassificazione è una `UPDATE` su una riga e tre `DELETE` di
pulizia. Il vero lavoro di classificazione è **davanti**, non dietro: sta nel
wizard che classificherà i progetti dal primo giorno.

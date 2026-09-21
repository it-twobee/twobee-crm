/**
 * §391 — lo scheletro che nasce dentro un periodo.
 *
 * Un periodo vuoto non fa risparmiare tempo a nessuno: il contenitore c'è,
 * e le stesse cinque tappe le riscrive qualcuno ogni trimestre — finché ha
 * fretta, e allora ne dimentica una.
 *
 * Lo scheletro non è un sistema nuovo: è un **template**, con `kind` a
 * `period` invece che a `project`. Stesse tabelle, stesso albero, stesso
 * modo di seminarlo. Un sistema parallelo avrebbe voluto dire due editor,
 * due formati e due posti dove dimenticarsi di aggiornare le stesse cose.
 *
 * **La differenza sta in cosa vuol dire `relative_due_days`.** Su un
 * template di progetto sono i giorni dall'avvio; qui sono i giorni dal
 * primo del periodo — e possono essere **negativi**, cioè contati dalla
 * fine: `-1` è l'ultimo giorno.
 *
 * Non è un vezzo: i periodi non durano tutti uguale. Q3 sono due mesi, Q4
 * sono quattro, e un mese di febbraio ne ha ventotto. Lo stesso scheletro
 * deve stare in tutti e due senza che il report di fine trimestre finisca a
 * metà, o due settimane dopo la fine.
 *
 * Gate: `npx tsx lib/scheletro-periodo.check.ts`.
 */

import type { Periodo } from './periodi'

export type NodoScheletro = {
  id: string
  parent_id: string | null
  node_type: 'milestone' | 'task'
  name: string
  description?: string | null
  /** dal primo giorno del periodo; negativo = dall'ultimo, `-1` è l'ultimo */
  relative_due_days: number | null
  suggested_owner_role?: string | null
  priority?: string | null
  visibility?: string | null
  estimated_hours?: number | null
  sort_order: number
}

const giorniDi = (p: Periodo) =>
  Math.round((Date.parse(p.al) - Date.parse(p.dal)) / 86400000) + 1

/**
 * La scadenza di un nodo dentro questo periodo.
 *
 * Positivo conta dall'inizio, negativo dalla fine, e il risultato non esce
 * mai dal periodo: uno scheletro tarato su un trimestre da quattro mesi,
 * applicato a Q3 che ne ha due, metterebbe il report a settembre — dentro
 * il trimestre dopo, dove nessuno lo cerca. Si schiaccia sull'ultimo
 * giorno, che è tardi ma è dentro.
 */
export function scadenza(p: Periodo, relativi: number | null): string | null {
  if (relativi === null || relativi === undefined) return null
  const durata = giorniDi(p)
  /* `-1` è l'ultimo giorno, non il penultimo: contare da zero all'indietro
     avrebbe voluto dire che `-0` è l'ultimo, e `-0` non esiste. */
  const offset = relativi >= 0 ? relativi : durata + relativi
  const dentro = Math.min(Math.max(offset, 0), durata - 1)
  const d = new Date(`${p.dal}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dentro)
  return d.toISOString().slice(0, 10)
}

export type RigaTappa = {
  chiaveNodo: string
  title: string
  description: string | null
  due_date: string | null
  visibility: string
  sort_order: number
}

export type RigaTask = {
  chiaveNodo: string
  /** la tappa a cui appartiene, per chiave del nodo; `null` = attaccata al periodo */
  dentro: string | null
  title: string
  description: string | null
  due_date: string | null
  priority: string | null
  estimated_hours: number | null
  sort_order: number
}

/**
 * Da albero di nodi a righe da scrivere.
 *
 * Non scrive niente e non conosce il database: è la stessa separazione di
 * §389, e per la stessa ragione — le date sono la parte che sbaglia, e va
 * potuta provare su un periodo da due mesi e su uno da quattro senza
 * toccare dei progetti veri.
 *
 * Su una **tappa** (i mesi del Marketing) il periodo *è* già la milestone:
 * i nodi milestone non hanno dove stare, e i loro task si attaccano
 * direttamente. Su un **trimestre** il periodo è una corsia, e le tappe ci
 * stanno dentro.
 */
export function scheletro(nodi: NodoScheletro[], p: Periodo, forma: 'quarter' | 'month'): {
  tappe: RigaTappa[]
  task: RigaTask[]
} {
  const ordinati = [...nodi].sort((a, b) => a.sort_order - b.sort_order)
  const tappe: RigaTappa[] = []
  const task: RigaTask[] = []

  for (const n of ordinati) {
    if (n.node_type === 'milestone') {
      /* Su un mese la milestone del template non ha dove stare: il periodo
         è già una tappa, e annidarne un'altra vorrebbe dire una tappa
         dentro una tappa, che il modello non ha. I suoi task si appiattiscono
         sul periodo. */
      if (forma === 'quarter') {
        tappe.push({
          chiaveNodo: n.id,
          title: n.name,
          description: n.description ?? null,
          due_date: scadenza(p, n.relative_due_days),
          visibility: n.visibility ?? 'internal',
          sort_order: n.sort_order,
        })
      }
      continue
    }
    const padre = n.parent_id
      ? ordinati.find(x => x.id === n.parent_id && x.node_type === 'milestone')
      : null
    task.push({
      chiaveNodo: n.id,
      dentro: forma === 'quarter' && padre ? padre.id : null,
      title: n.name,
      description: n.description ?? null,
      due_date: scadenza(p, n.relative_due_days),
      priority: n.priority ?? null,
      estimated_hours: n.estimated_hours ?? null,
      sort_order: n.sort_order,
    })
  }
  return { tappe, task }
}

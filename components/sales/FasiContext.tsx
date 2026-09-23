'use client'

/**
 * §424 — le fasi arrivano dal server una volta e restano a disposizione di
 * tutta la sezione.
 *
 * Prima erano una costante importata da otto componenti. Adesso sono una
 * tabella che un amministratore cambia mentre il tool gira, quindi devono
 * scendere dal server — e passarle di proprietà in proprietà attraverso sei
 * livelli (`SalesPage` → `CrmTable` → riga → cella → menu) avrebbe messo la
 * stessa cosa in trenta firme, dove prima o poi una si dimentica.
 *
 * Il contesto espone le funzioni **con i nomi che avevano da costanti**, già
 * legate all'elenco: nei componenti cambia la riga dell'import, non il corpo.
 *
 * Non c'è stato condiviso sul server: qui dentro si entra solo dal browser, e
 * ogni richiesta porta il suo elenco.
 */

import { createContext, useContext, useMemo } from 'react'
import {
  FASI_SEME, attive, classiFase as classi, etichettaFase as etichetta, faseConRuolo,
  faseDi as trova, fasiDelGruppo as delGruppo, ordinate, rangoFase as rango, ruoloDi as ruolo,
  type Fase, type Gruppo, type Ruolo,
} from '@/lib/sales-stages'

type Valore = {
  /** tutte, anche le spente: una riga vecchia può puntare a una fase ritirata */
  TUTTE: Fase[]
  /** quelle che si possono scegliere adesso, in ordine */
  FASI: Fase[]
  faseDi: (chiave: string | null | undefined) => Fase | null
  etichettaFase: (chiave: string | null | undefined) => string
  classiFase: (chiave: string | null | undefined) => string
  ruoloDi: (chiave: string | null | undefined) => Ruolo | null
  rangoFase: (chiave: string | null | undefined) => number
  fasiDelGruppo: (g: Gruppo) => Fase[]
  faseConRuolo: (r: Ruolo) => Fase | null
}

const Ctx = createContext<Valore | null>(null)

export function FasiProvider({ fasi, children }: { fasi: Fase[]; children: React.ReactNode }) {
  const valore = useMemo<Valore>(() => {
    /* Se l'elenco non è arrivato si usa il seme invece di mostrare una pagina
       senza stati: trentasei righe senza fase somigliano a un archivio vuoto,
       e chi la vede pensa che si siano persi i dati. */
    const tutte = fasi.length ? ordinate(fasi) : FASI_SEME
    return {
      TUTTE: tutte,
      FASI: attive(tutte),
      faseDi: (k) => trova(tutte, k),
      etichettaFase: (k) => etichetta(tutte, k),
      classiFase: (k) => classi(tutte, k),
      ruoloDi: (k) => ruolo(tutte, k),
      rangoFase: (k) => rango(tutte, k),
      fasiDelGruppo: (g) => delGruppo(tutte, g),
      faseConRuolo: (r) => faseConRuolo(tutte, r),
    }
  }, [fasi])
  return <Ctx.Provider value={valore}>{children}</Ctx.Provider>
}

export function useFasi(): Valore {
  const v = useContext(Ctx)
  if (!v) throw new Error('useFasi va usato dentro FasiProvider')
  return v
}

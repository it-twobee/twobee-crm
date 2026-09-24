/**
 * §434 — il ritorno: quello che il tool sa di un lead torna sul foglio.
 *
 * Il foglio resta l'ingresso (§370, «il foglio crea, il tool governa»), ma chi
 * lo apre — per abitudine, o perché lavora da lì — vedeva lo stato di quando il
 * lead era entrato, e da quel momento più niente. Adesso a ogni giro il tool
 * scrive a che punto è ogni lead.
 *
 * **Scrive solo in colonne sue**, in fondo, col suffisso « OS». `STATUS` e
 * `Note` sono di chi le compila a mano e non si toccano mai: il tool governa i
 * suoi dati, non quelli degli altri. Le colonne che mancano si aggiungono dopo
 * l'ultima, così l'ingresso — che legge per nome, non per posizione — non se ne
 * accorge.
 *
 * **Scrive solo quello che è cambiato.** Un giro che riscrive trecento celle
 * uguali ogni notte riempie la cronologia del foglio di modifiche che non
 * dicono niente, e il giorno in cui serve capire chi ha cambiato cosa non si
 * trova più. E una riga del foglio che nel tool non c'è più (eliminata, §378)
 * resta com'è: svuotarla direbbe «non ne sappiamo niente», che non è vero.
 *
 * Qui dentro non c'è rete: si entra con le celle del foglio e i lead, si esce
 * con le celle da scrivere. Gate: `npx tsx lib/sales-foglio-ritorno.check.ts`.
 */

export const COLONNE_OS = ['Fase OS', 'Qualifica OS', 'Owner OS', 'Ultimo contatto OS', 'Motivo perso OS'] as const
export type ColonnaOs = (typeof COLONNE_OS)[number]

/** un lead come lo si scrive sul foglio: già in parole, non in chiavi */
export type LeadRitorno = { sheetRowId: string } & Record<ColonnaOs, string>

export type Cella = { riga: number; colonna: number; valore: string }

/** `0` → `A`, `26` → `AA`: il nome di colonna che usa il foglio */
export function lettera(colonna: number): string {
  let n = colonna + 1
  let s = ''
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s
}

/** riga e colonna da zero → `Foglio!C12`. Il nome del foglio va fra apici, sempre */
export const rif = (foglio: string, c: Cella) =>
  `'${foglio.replace(/'/g, "''")}'!${lettera(c.colonna)}${c.riga + 1}`

/** l'id Meta senza prefisso: lo stesso confronto che fa l'ingresso (`l:1036…` → `1036…`) */
const idDi = (v: string | undefined) => (v ?? '').replace(/^[a-z]+:/i, '').trim()

export function pianoRitorno(valori: string[][], lead: LeadRitorno[]): {
  celle: Cella[]
  /** le intestazioni aggiunte in questo giro, per dirlo nel riepilogo */
  nuoveColonne: string[]
  /** righe del foglio che hanno un lead nel tool */
  abbinate: number
} {
  const testa = (valori[0] ?? []).map(h => (h ?? '').trim())
  const colId = testa.indexOf('id')
  if (colId < 0) throw new Error('Il foglio non ha la colonna «id»: non si sa a quale lead corrisponde una riga')

  const celle: Cella[] = []
  const nuoveColonne: string[] = []
  const posto = new Map<ColonnaOs, number>()
  let prossima = testa.length
  for (const nome of COLONNE_OS) {
    const i = testa.indexOf(nome)
    if (i >= 0) { posto.set(nome, i); continue }
    posto.set(nome, prossima)
    celle.push({ riga: 0, colonna: prossima, valore: nome })
    nuoveColonne.push(nome)
    prossima++
  }

  const perId = new Map(lead.map(l => [l.sheetRowId, l]))
  let abbinate = 0
  valori.slice(1).forEach((riga, k) => {
    const l = perId.get(idDi(riga[colId]))
    if (!l) return
    abbinate++
    for (const nome of COLONNE_OS) {
      const colonna = posto.get(nome)!
      const ora = (riga[colonna] ?? '').trim()
      const vuole = (l[nome] ?? '').trim()
      if (ora !== vuole) celle.push({ riga: k + 1, colonna, valore: vuole })
    }
  })
  return { celle, nuoveColonne, abbinate }
}

/** una data come la legge una persona sul foglio: `2026-09-22`, a Roma */
export function giornoRoma(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

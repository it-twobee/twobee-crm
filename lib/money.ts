/**
 * Un importo scritto in italiano — funzione pura, nessuna dipendenza. (§231)
 *
 * Esisteva in nove copie, una per ogni motore, e ognuna sbagliava a modo suo:
 * chi metteva l'euro davanti (`€2.673`) e chi dietro (`2.673 €`), chi
 * raggruppava le migliaia e chi no. Il risultato si vedeva sulla stessa
 * schermata — «nel mese 0 € contro 2673 € a patto» accanto a «2.673 €» in
 * colonna — e due notazioni per lo stesso numero fanno dubitare del totale
 * prima ancora di leggerlo.
 *
 * **Il punto delle migliaia si mette a mano**, e non è pedanteria: l'italiano
 * di CLDR raggruppa solo da cinque cifre (`minimumGroupingDigits: 2`), quindi
 * 2673 resta «2673» e 12673 diventa «12.673». In una colonna di importi sembra
 * un errore di battitura. `Intl` lo risolve con `useGrouping: 'always'`, ma
 * dipende dai dati ICU con cui è compilato Node: un motore puro che scrive un
 * messaggio diverso fra il gate e la pagina non è verificabile. Qui la regola è
 * scritta, quindi è la stessa ovunque.
 */

const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** `2673` → `2.673 €`. L'euro sta **dopo**, come in tutta l'interfaccia. */
export function eur(n: number): string {
  const v = Math.round(n)
  return `${v < 0 ? '−' : ''}${group(String(Math.abs(v)))} €`
}

/** Con i centesimi, dove servono: su una riga di costo 2.672,22 non è 2.672. */
export function eur2(n: number): string {
  const v = Math.round(n * 100) / 100
  const [i, d = ''] = Math.abs(v).toFixed(2).split('.')
  return `${v < 0 ? '−' : ''}${group(i)},${d} €`
}

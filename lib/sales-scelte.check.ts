/* Priorità e membership come elenchi del database (§436).
   Esegui: npx tsx lib/sales-scelte.check.ts */

import { SCELTE_SEME, etichettaScelta, vociPer, ammesse, ordini, eLista, type Scelte } from '@/lib/sales-scelte'
import { validaCella } from '@/lib/sales-table'
import { ordina } from '@/lib/sales-filtri'
import { FASI_SEME } from '@/lib/sales-stages'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Il seme è lo stesso di prima —')
/* Prima che la migration sia applicata il tool deve comportarsi esattamente
   come prima: stesse voci, stesso ordine. */
is('priorità', SCELTE_SEME.priority.map(v => v.chiave), ['High', 'Medium', 'Low'])
is('membership', SCELTE_SEME.membership.map(v => v.chiave), ['Member', 'Potential', 'Not Member'])
is('le etichette nascono uguali alle chiavi', SCELTE_SEME.priority.map(v => v.etichetta), ['High', 'Medium', 'Low'])

const conf: Scelte = {
  priority: [
    { chiave: 'High', etichetta: 'Alta', ordine: 20, attivo: true },
    { chiave: 'urgente', etichetta: 'Urgente', ordine: 10, attivo: true },
    { chiave: 'Medium', etichetta: 'Media', ordine: 30, attivo: true },
    { chiave: 'Low', etichetta: 'Bassa', ordine: 40, attivo: false },
  ],
  membership: SCELTE_SEME.membership,
}

console.log('\n— Si legge l\'etichetta, si salva la chiave —')
is('High si legge Alta', etichettaScelta(conf, 'priority', 'High'), 'Alta')
is('un valore sconosciuto si mostra com\'è', etichettaScelta(conf, 'priority', 'Boh'), 'Boh')
is('un campo che non è un elenco resta com\'è', etichettaScelta(conf, 'source', 'Sito'), 'Sito')
is('solo priorità e membership sono elenchi', [eLista('priority'), eLista('membership'), eLista('qualifica')], [true, true, false])

console.log('\n— Il menu offre quelle in uso, più quella che la riga ha già —')
is('in ordine, senza le ritirate', vociPer(conf, 'priority').map(v => v.chiave), ['urgente', 'High', 'Medium'])
is('la ritirata resta se è il valore della riga', vociPer(conf, 'priority', 'Low').map(v => v.chiave), ['urgente', 'High', 'Medium', 'Low'])

console.log('\n— La cella accetta l\'elenco del database —')
const amm = ammesse(conf)
is('una voce nuova si salva', validaCella('priority', 'urgente', FASI_SEME, amm), { ok: true, valore: 'urgente' })
is('una ritirata resta valida sulle righe vecchie', validaCella('priority', 'Low', FASI_SEME, amm).ok, true)
is('una inventata no', validaCella('priority', 'Altissima', FASI_SEME, amm).ok, false)
is('senza elenco si torna alla costante di sempre', validaCella('priority', 'urgente', FASI_SEME).ok, false)
is('la qualifica non cambia regola', validaCella('qualifica', 'in_target', FASI_SEME, amm).ok, true)

console.log('\n— Si ordina per l\'ordine dell\'elenco —')
const righe = [{ company_name: 'M', priority: 'Medium' }, { company_name: 'U', priority: 'urgente' }, { company_name: 'H', priority: 'High' }, { company_name: 'V' }]
is('urgente prima di High, i vuoti in fondo', ordina(FASI_SEME, righe, 'priority', 'su', ordini(conf)).map(r => r.company_name), ['U', 'H', 'M', 'V'])
is('senza elenco, l\'ordine di sempre', ordina(FASI_SEME, righe.slice(0, 1).concat(righe.slice(2)), 'priority', 'su').map(r => r.company_name), ['H', 'M', 'V'])

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)

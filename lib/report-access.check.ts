/* §344 — Verifica della porta del foglio riservato.
   Esegui: npx tsx lib/report-access.check.ts

   Il permesso è del **documento** e **scade**: sono le due frasi che, sbagliate,
   non si vedono guardando la pagina — si vedono il mese dopo, quando qualcuno
   apre un foglio che non aveva chiesto. Qui si provano senza database. */
import {
  checkNames, normName, fullName, grantEnd, monthParam, newToken, scopeLabel, viewState,
  GRANT_DAYS, type AccessRow,
} from '@/lib/report-access'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const ORA = '2026-09-16T10:00:00.000Z'
const row = (p: Partial<AccessRow>): AccessRow => ({
  id: 'r1', token: 't', resource: 'compensi', scope: '2026-08-01',
  first_name: 'Mario', last_name: 'Rossi', requester_email: null,
  status: 'pending', created_at: ORA, decided_at: null, expires_at: null, ...p,
})

console.log('\n— Cosa vede chi bussa —')
is('senza richiesta, il modulo', viewState(null, ORA), 'nuovo')
is('chiesto, l\'attesa', viewState(row({}), ORA), 'attesa')
is('approvato e valido, il foglio',
  viewState(row({ status: 'approved', expires_at: '2026-09-30T10:00:00Z' }), ORA), 'aperto')
/* Scaduto **non** è negato: la scadenza è nostra, non una decisione contro chi
   ha chiesto, quindi si torna al modulo. Confonderli chiuderebbe la porta a chi
   ha solo aspettato troppo. */
is('scaduto torna al modulo',
  viewState(row({ status: 'approved', expires_at: '2026-09-01T10:00:00Z' }), ORA), 'scaduto')
is('rifiutato resta rifiutato',
  viewState(row({ status: 'denied', decided_at: ORA }), ORA), 'negato')
/* Un'ora prima e un'ora dopo la stessa scadenza: il confronto è fra date, non
   fra stringhe — `...+00:00` di Postgres e `...Z` di JavaScript si ordinano al
   contrario del tempo che rappresentano. */
is('un minuto prima della scadenza è aperto',
  viewState(row({ status: 'approved', expires_at: '2026-09-16T10:01:00+00:00' }), ORA), 'aperto')
is('un minuto dopo è scaduto',
  viewState(row({ status: 'approved', expires_at: '2026-09-16T09:59:00+00:00' }), ORA), 'scaduto')

console.log('\n— Il permesso dura quindici giorni, non per sempre —')
is('scade dopo GRANT_DAYS', grantEnd(ORA), new Date(
  new Date(ORA).getTime() + GRANT_DAYS * 86_400_000).toISOString())
is('la finestra è di due settimane scarse', GRANT_DAYS <= 31, true)

console.log('\n— Nome e cognome sono obbligatori —')
is('vuoti', checkNames('', '') !== null, true)
is('solo il nome', checkNames('Mario', '') !== null, true)
is('un\'iniziale non è un cognome', checkNames('Mario', 'R') !== null, true)
is('nome e cognome veri', checkNames('Mario', 'Rossi'), null)
is('gli apostrofi sono nomi', checkNames('Maria', "D'Angelo"), null)
is('i doppi cognomi pure', checkNames('Anna', 'De Luca'), null)
is('gli accenti pure', checkNames('Nguyễn', 'Trần'), null)
/* Chi incolla un link o un numero nel campo del nome non sta scrivendo il
   proprio nome, e quel testo finisce davanti a chi deve decidere. */
is('un indirizzo non è un nome', checkNames('http://x.it', 'Rossi') !== null, true)
is('le cifre no', checkNames('Mario1', 'Rossi') !== null, true)
is('il markup no', checkNames('<b>Mario', 'Rossi') !== null, true)

console.log('\n— Il nome si normalizza una volta sola —')
is('spazi doppi', normName('  Mario   Carlo '), 'Mario Carlo')
is('non supera i 40 caratteri', normName('a'.repeat(80)).length, 40)
is('nome intero', fullName({ first_name: ' Mario ', last_name: 'Rossi ' }), 'Mario Rossi')

console.log('\n— Il mese chiesto non si inventa —')
is('formato pieno', monthParam('2026-08-01'), '2026-08-01')
is('anno-mese', monthParam('2026-08'), '2026-08-01')
is('assente', monthParam(null), null)
/* `new Date('domani')` fa Invalid Date e `monthKey` ne cava «NaN-NaN-01», che
   sarebbe finito in tabella come `scope` di una richiesta vera. */
is('spazzatura', monthParam('domani'), null)
is('mese inesistente', monthParam('2026-13'), null)
is('mese in chiaro', scopeLabel('2026-08-01'), 'agosto 2026')

console.log('\n— La chiave del browser non è indovinabile —')
const t1 = newToken()
is('48 caratteri esadecimali', /^[0-9a-f]{48}$/.test(t1), true)
is('due chiavi non coincidono', newToken() === t1, false)

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)

/* Verifica del calendario delle versioni. Esegui: npx tsx lib/os-version.check.ts */
import {
  cycleOf, cycleAt, daysLeftInCycle, parseVersion, formatVersion,
  compareVersions, versionForCycle, nextVersion, countByKind, CYCLE_EPOCH,
  type ChangeKind,
} from '@/lib/os-version'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(52)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Cicli di 15 giorni —')
is('il giorno zero apre il ciclo 0', cycleOf(CYCLE_EPOCH).index, 0)
is('ciclo 0: 1→15 agosto', [cycleAt(0).start, cycleAt(0).end], ['2026-08-01', '2026-08-15'])
is('il 15 agosto è ancora il ciclo 0', cycleOf('2026-08-15').index, 0)
is('il 16 agosto apre il ciclo 1', cycleOf('2026-08-16').index, 1)
is('ciclo 1: 16→30 agosto', [cycleAt(1).start, cycleAt(1).end], ['2026-08-16', '2026-08-30'])
is('i cicli non si sovrappongono', cycleAt(2).start, '2026-08-31')
is('prima dell\'epoca resta il ciclo 0', cycleOf('2026-07-01').index, 0)
is('l\'ora del giorno non sposta il ciclo', cycleOf(new Date('2026-08-15T23:59:00Z')).index, 0)

console.log('\n— Quanto manca alla chiusura —')
is('il primo giorno mancano 14 giorni', daysLeftInCycle('2026-08-01'), 14)
is('l\'ultimo giorno manca zero', daysLeftInCycle('2026-08-15'), 0)

console.log('\n— Numeri —')
is('parsing con la v davanti', parseVersion('v2.3.4'), { major: 2, minor: 3, patch: 4 })
is('un numero storto non passa', parseVersion('1.2'), null)
is('formattazione', formatVersion({ major: 1, minor: 10, patch: 2 }), '1.10.2')
is('1.10.0 è più nuova di 1.9.0', compareVersions({ major: 1, minor: 10, patch: 0 }, { major: 1, minor: 9, patch: 0 }) < 0, true)
is('il ciclo 3 vale la 1.3.0', formatVersion(versionForCycle(3)), '1.3.0')

console.log('\n— Il prossimo numero —')
const v100 = { major: 1, minor: 0, patch: 0 }
is('senza registro si parte dalla 1.0.0', formatVersion(nextVersion(null, 'ciclo', '2026-09-10')), '1.0.0')
is('chiudere un ciclo alza la minore', formatVersion(nextVersion(v100, 'ciclo', '2026-08-16')), '1.1.0')
is('una modifica sostanziale alza la patch', formatVersion(nextVersion(v100, 'sostanziale', '2026-08-05')), '1.0.1')
is('la maggiore la decide una persona', formatVersion(nextVersion(v100, 'major', '2026-08-05')), '2.0.0')
/* Se il registro resta indietro di più cicli, il numero deve saltare al ciclo
   di oggi: altrimenti la v1.1.0 uscirebbe a novembre parlando di agosto. */
is('registro indietro: si salta al ciclo di oggi', formatVersion(nextVersion(v100, 'ciclo', '2026-10-01')), '1.4.0')
is('la patch resta indietro se il ciclo è lo stesso', formatVersion(nextVersion({ major: 1, minor: 4, patch: 0 }, 'ciclo', '2026-10-01')), '1.5.0')

console.log('\n— Sintesi di una release —')
const changes = [{ kind: 'novita' }, { kind: 'novita' }, { kind: 'correzione' }] as { kind: ChangeKind }[]
is('conteggio per tipo', countByKind(changes), { novita: 2, miglioramento: 0, correzione: 1, rimozione: 0, sicurezza: 0 })

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)

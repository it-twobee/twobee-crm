/* Verifica della misura di utilizzo. Esegui: npx tsx lib/presenza.check.ts */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  INTERVALLO_BEAT_MS, GAP_SESSIONE_MIN, ONLINE_MS, SESSIONI_MOSTRATE,
  attivoMs, durataMs, sezionePrincipale, vistaSessione, statoDi, assenteMs,
  durataTesto, assenzaTesto, sezioniTop, componiUtilizzo, ordinaPerPresenza, portaleDi,
  modificheParziali, etichettaStato, CRONOLOGIA_COMPLETA_DA,
  type SessioneRow, type TotaliRow,
} from '@/lib/presenza'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const ORA = Date.parse('2026-09-23T10:00:00Z')
const t = (min: number) => new Date(ORA - min * 60_000).toISOString()

const sess = (o: Partial<SessioneRow> & { id: string; profile_id: string }): SessioneRow => ({
  portale: 'admin', started_at: t(60), last_beat_at: t(30), beats: 10, interactions: 40,
  last_route: '/dashboard', sezioni: { dashboard: 10 }, ...o,
})

console.log('\n— Il tempo è fatto di battiti, non di tab aperti —')
is('dieci battiti = dieci minuti', attivoMs(10), 600_000)
is('nessun battito = niente', attivoMs(0), 0)
is('un numero negativo non regala tempo', attivoMs(-5), 0)
/* La sessione di un solo battito non dura zero: quel battito rappresenta il
   minuto in cui si è fatto qualcosa, ed è l'unico minuto che c'è stato. */
is('sessione lampo: un minuto, non zero', durataMs({ started_at: t(10), last_beat_at: t(10) }), 60_000)
is('mezz\'ora di finestra', durataMs({ started_at: t(40), last_beat_at: t(11) }), 30 * 60_000)
/* Il punto di tutto l'impianto: due ore di scheda aperta con dieci minuti di
   lavoro dentro valgono dieci minuti. */
const pigra = sess({ id: 's', profile_id: 'p', started_at: t(129), last_beat_at: t(10), beats: 10 })
is('attivo ≪ durata quando si sta fermi', [attivoMs(pigra.beats), durataMs(pigra)], [600_000, 120 * 60_000])
is('attivo non supera mai la durata', attivoMs(pigra.beats) <= durataMs(pigra), true)

console.log('\n— Online, offline, mai entrato —')
is('battito di un minuto fa: online', statoDi(t(1), ORA), 'online')
is('sul filo dei cinque minuti: online', statoDi(t(5), ORA), 'online')
is('sei minuti: offline', statoDi(t(6), ORA), 'offline')
is('nessun battito: mai', statoDi(null, ORA), 'mai')
is('assenza di venti minuti', assenteMs(t(20), ORA), 20 * 60_000)
is('assenza di chi non è mai entrato', assenteMs(null, ORA), null)
/* Un orologio che va indietro (un battito arrivato «dal futuro» per lo sfasamento
   fra client e server) non deve produrre un'assenza negativa. */
is('battito dal futuro: assenza zero', assenteMs(t(-3), ORA), 0)

console.log('\n— Le parole —')
is('niente da dire', durataTesto(0), '—')
is('quarantacinque minuti', durataTesto(45 * 60_000), '45 min')
is('un\'ora tonda', durataTesto(60 * 60_000), '1h')
is('un\'ora e venti', durataTesto(80 * 60_000), '1h 20m')
is('adesso', assenzaTesto(30_000), 'adesso')
is('dodici minuti', assenzaTesto(12 * 60_000), '12 min fa')
is('un\'ora', assenzaTesto(60 * 60_000), '1 ora fa')
is('cinque ore', assenzaTesto(5 * 60 * 60_000), '5 ore fa')
is('ieri', assenzaTesto(26 * 60 * 60_000), 'ieri')
is('quattro giorni', assenzaTesto(4 * 24 * 60 * 60_000), '4 giorni fa')
is('due mesi', assenzaTesto(70 * 24 * 60 * 60_000), '2 mesi fa')
is('mai', assenzaTesto(null), 'mai entrato')

console.log('\n— Dove è finito il tempo —')
is('la sezione più battuta', sezionePrincipale({ clienti: 3, economics: 9, dashboard: 1 }), 'economics')
is('mappa vuota', sezionePrincipale({}), null)
is('mappa assente', sezionePrincipale(null), null)
is('somma su più sessioni', sezioniTop([
  sess({ id: 'a', profile_id: 'p', sezioni: { clienti: 4, dashboard: 2 } }),
  sess({ id: 'b', profile_id: 'p', sezioni: { clienti: 1, economics: 6 } }),
]), [
  { sezione: 'economics', battiti: 6 },
  { sezione: 'clienti', battiti: 5 },
  { sezione: 'dashboard', battiti: 2 },
])

console.log('\n— La riga di una persona —')
const righe: SessioneRow[] = [
  sess({ id: '1', profile_id: 'marco', started_at: t(200), last_beat_at: t(180), beats: 15, interactions: 90, sezioni: { clienti: 15 } }),
  sess({ id: '2', profile_id: 'marco', started_at: t(50), last_beat_at: t(2), beats: 30, interactions: 210, sezioni: { economics: 30 } }),
  sess({ id: '3', profile_id: 'anna', started_at: t(6000), last_beat_at: t(5900), beats: 8, interactions: 12, sezioni: { workspace: 8 } }),
]
const totali: TotaliRow[] = [
  { profile_id: 'marco', sessioni: 12, battiti: 300, interazioni: 2400, azioni: 87, ultima_azione: t(4) },
  { profile_id: 'anna', sessioni: 2, battiti: 8, interazioni: 12, azioni: 0, ultima_azione: null },
]
const vista = componiUtilizzo(['marco', 'anna', 'nuovo'], righe, totali, ORA)
is('tre persone, anche chi non c\'è mai stato', vista.map(p => p.profileId), ['marco', 'anna', 'nuovo'])
is('marco è online', vista[0].stato, 'online')
is('la più recente per prima', vista[0].sessioni.map(s => s.id), ['2', '1'])
is('attivo delle ultime sessioni', vista[0].attivoUltimeMs, 45 * 60_000)
is('interazioni delle ultime sessioni', vista[0].interazioniUltime, 300)
is('i totali della finestra arrivano dal DB', [vista[0].attivoFinestraMs, vista[0].azioni], [300 * 60_000, 87])
/* Due ore dentro e nessuna riga toccata è un'informazione, non un buco: la
   colonna «azioni» a zero è esattamente ciò che si viene a vedere. */
is('anna è entrata e non ha scritto niente', [vista[1].stato, vista[1].azioni], ['offline', 0])
is('chi non è mai entrato non ha sessioni', [vista[2].stato, vista[2].sessioni.length, vista[2].assenteMs], ['mai', 0, null])
is('più di cinque sessioni si tagliano', componiUtilizzo(['p'],
  Array.from({ length: 9 }, (_, i) => sess({ id: `s${i}`, profile_id: 'p', last_beat_at: t(i + 1) })),
  [], ORA).at(0)?.sessioni.length, SESSIONI_MOSTRATE)

console.log('\n— L\'ordine risponde a «chi manca» —')
is('online, poi assenti dal più recente, poi mai', [...vista].sort(ordinaPerPresenza).map(p => p.profileId), ['marco', 'anna', 'nuovo'])

console.log('\n— Da quale porta è entrato —')
is('workspace', portaleDi('/workspace/clienti/1'), 'workspace')
is('portale cliente', portaleDi('/portale'), 'portale')
is('risorsa esterna', portaleDi('/risorsa/task'), 'risorsa')
is('tutto il resto è il tool admin', portaleDi('/economics/prospetto'), 'admin')

console.log('\n— La colonna delle modifiche dichiara quando non sa —')
/* §412 — la finestra che scavalca il giorno in cui la cronologia è tornata
   completa conta solo una parte: uno zero lì dentro non è «non ha fatto
   niente», ed è la categoria di errore che nessuno va a controllare. */
is('trenta giorni indietro: parziale', modificheParziali(new Date(Date.parse(CRONOLOGIA_COMPLETA_DA) - 30 * 86_400_000).toISOString(), 90, ORA), true)
is('il giorno stesso: parziale', modificheParziali(CRONOLOGIA_COMPLETA_DA, 90, ORA), false)
is('un\'ora dopo: completa', modificheParziali(new Date(Date.parse(CRONOLOGIA_COMPLETA_DA) + 3_600_000).toISOString(), 90, ORA), false)
/* Oltre la conservazione non c'è «zero modifiche»: non c'è niente. */
const fraUnAnno = Date.parse(CRONOLOGIA_COMPLETA_DA) + 365 * 86_400_000
is('finestra più lunga della conservazione', modificheParziali(new Date(fraUnAnno - 40 * 86_400_000).toISOString(), 20, fraUnAnno), true)
is('finestra dentro la conservazione', modificheParziali(new Date(fraUnAnno - 10 * 86_400_000).toISOString(), 20, fraUnAnno), false)
is('conservazione infinita: conta solo la data', modificheParziali(new Date(fraUnAnno - 300 * 86_400_000).toISOString(), 0, fraUnAnno), false)
is('data illeggibile: parziale', modificheParziali('non una data', 90, ORA), true)

console.log('\n— «Mai entrato» non è la frase giusta —')
/* La misura è cominciata ieri, non la sua assenza: la riga dice che sessioni
   non ce ne sono, e da quando si misura lo dichiara l'intestazione. */
is('online', etichettaStato('online', 0, true), { testo: 'online', tono: 'online' })
is('assente', etichettaStato('offline', 3 * 60 * 60_000, true), { testo: '3 ore fa', tono: 'assente' })
is('senza sessioni, ma si misura', etichettaStato('mai', null, true), { testo: 'nessuna sessione', tono: 'senza' })
is('senza sessioni perché non si misura ancora', etichettaStato('mai', null, false), { testo: 'misura non attiva', tono: 'senza' })

console.log('\n— La stessa soglia in TypeScript e in SQL —')
/* §410 — il gap che chiude una sessione vive in due posti: qui e nella
   migration, che è il solo a poterlo applicare. Scritto due volte, prima o poi
   sono due numeri diversi — e il sintomo (sessioni troppo lunghe o troppe
   sessioni) non assomiglia a una causa. Quindi il controllo legge il file. */
const sql = readFileSync(join(process.cwd(), 'supabase/migrations/252_presenza_risorse.sql'), 'utf8')
is('la migration usa il gap di lib/presenza.ts', sql.includes(`interval '${GAP_SESSIONE_MIN} minutes'`), true)
is('il gap è più largo della soglia di online', GAP_SESSIONE_MIN * 60_000 > ONLINE_MS, true)
is('la soglia di online è più larga di un battito', ONLINE_MS > INTERVALLO_BEAT_MS, true)

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)

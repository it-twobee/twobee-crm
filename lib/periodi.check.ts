/* §388 — i periodi di un progetto. Esegui: npx tsx lib/periodi.check.ts

   Gli errori di questo modulo hanno tutti la stessa forma: si vedono a
   novembre, quando il periodo sbagliato è già aperto su venti progetti.
   Per questo le prove sono sui bordi — il passaggio d'anno, il 29 febbraio,
   il trimestre corto — e non sul caso normale, che non sbaglia nessuno. */
import {
  TRIMESTRI, trimestre, mese, trimestreDelMese, periodoDi, dopo,
  periodiDaAprire, dataEvento, pasqua, inizioLavoro, ultimoGiorno,
} from '@/lib/periodi'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(56)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Il calendario è quello della stagione, non del calendario —')
{
  /* La ragione per cui questo file esiste: settembre è Q4, non Q3. Con i
     trimestri solari la stagione più importante dell'anno sarebbe spezzata
     in due, e le nove corsie in archivio si chiamano «Set-Dic» proprio
     perché nessuno ha mai ragionato in trimestri solari. */
  is('settembre è Q4', trimestreDelMese(9), 4)
  is('e dicembre pure', trimestreDelMese(12), 4)
  is('luglio e agosto sono Q3, da soli', [trimestreDelMese(7), trimestreDelMese(8)], [3, 3])
  is('giugno chiude Q2', trimestreDelMese(6), 2)
  is('i quattro blocchi coprono dodici mesi',
    TRIMESTRI.reduce((n, [a, b]) => n + (b - a + 1), 0), 12)
  is('e non si sovrappongono',
    TRIMESTRI.every(([a], i) => i === 0 || a === TRIMESTRI[i - 1][1] + 1), true)

  is('Q4 2026 va dal 1 settembre al 31 dicembre',
    [trimestre(2026, 4).dal, trimestre(2026, 4).al], ['2026-09-01', '2026-12-31'])
  is('Q3 2026 è corto: luglio e agosto',
    [trimestre(2026, 3).dal, trimestre(2026, 3).al], ['2026-07-01', '2026-08-31'])
  is('la chiave è quella con cui si riconosce un periodo già aperto',
    trimestre(2026, 4).chiave, '2026-Q4')
  is('e l\'etichetta è quella che legge una persona', trimestre(2026, 4).etichetta, 'Q4 2026')
}

console.log('\n— I bordi: il 29 febbraio e il passaggio d\'anno —')
{
  /* Un ultimo giorno preso da una tabella scritta a mano sbaglia un anno su
     quattro, e lo sbaglia il 29 febbraio: una data che nel 2028 esiste. */
  is('febbraio 2028 finisce il 29', mese(2028, 2).al, '2028-02-29')
  is('febbraio 2026 il 28', mese(2026, 2).al, '2026-02-28')
  is('e il 2100 non è bisestile', ultimoGiorno(2100, 2), 28)

  is('dopo dicembre viene gennaio dell\'anno dopo', dopo(mese(2026, 12), 'month').chiave, '2027-01')
  is('dopo Q4 viene Q1 dell\'anno dopo', dopo(trimestre(2026, 4), 'quarter').chiave, '2027-Q1')
  is('dopo Q2 viene Q3', dopo(trimestre(2026, 2), 'quarter').chiave, '2026-Q3')
}

console.log('\n— Quali periodi aprire, e quando —')
{
  /* Il caso vero del 21 settembre 2026: siamo dentro Q4, che finisce il 31
     dicembre. Con 45 giorni di orizzonte si arriva al 5 novembre, che sta
     ancora dentro Q4: non si apre niente di nuovo. */
  is('a settembre, con 45 giorni, c\'è solo il trimestre in corso',
    periodiDaAprire('2026-09-21', 'quarter', 45).map(p => p.chiave), ['2026-Q4'])
  /* A metà novembre l'orizzonte entra in gennaio, e Q1 2027 va aperto: è il
     giorno in cui il generatore comincia a fare qualcosa. */
  is('a metà novembre entra Q1 2027',
    periodiDaAprire('2026-11-20', 'quarter', 45).map(p => p.chiave), ['2026-Q4', '2027-Q1'])
  is('i mesi con 90 giorni di anticipo sono quattro',
    periodiDaAprire('2026-09-21', 'month', 90).map(p => p.chiave),
    ['2026-09', '2026-10', '2026-11', '2026-12'])
  /* Un periodo che **comincia** dentro la finestra si apre intero: aprirne
     metà vorrebbe dire un trimestre che compare a pezzi. */
  is('e a dicembre si vede già oltre l\'anno',
    periodiDaAprire('2026-12-20', 'month', 90).map(p => p.chiave),
    ['2026-12', '2027-01', '2027-02', '2027-03'])
  is('il periodo in corso c\'è sempre, anche con orizzonte zero',
    periodiDaAprire('2026-09-21', 'quarter', 0).map(p => p.chiave), ['2026-Q4'])
  is('con forma «none» non si apre niente', periodiDaAprire('2026-09-21', 'none', 365), [])
  is('e il periodo di una data lo sa dire', periodoDi('2026-09-21', 'quarter')?.chiave, '2026-Q4')
}

console.log('\n— Le ricorrenze commerciali —')
{
  is('Natale è fisso', dataEvento('fisso:12-25', 2026), '2026-12-25')
  /* Black Friday: ultimo venerdì di novembre. Nel 2026 è il 27, nel 2027 il
     26 — una data scritta a mano sarebbe sbagliata dall'anno dopo. */
  is('Black Friday 2026 è il 27 novembre', dataEvento('ultimo:5:11', 2026), '2026-11-27')
  is('e nel 2027 il 26', dataEvento('ultimo:5:11', 2027), '2027-11-26')
  /* Il 2025 è il caso che smaschera l'errore classico: `getDay()` mette la
     domenica a zero, e chi non lo corregge trova l'ultimo giovedì. */
  is('e nel 2025 il 28', dataEvento('ultimo:5:11', 2025), '2025-11-28')
  /* Il Cyber Monday è il Black Friday più tre giorni, e nel 2026 quel salto
     cambia mese: dal 27 novembre al 30. Lo scostamento vale per tutte le
     regole, non solo per la Pasqua. */
  is('Cyber Monday 2026 è il 30 novembre', dataEvento('ultimo:5:11+3', 2026), '2026-11-30')
  is('e nel 2025 il 1 dicembre, cambiando mese', dataEvento('ultimo:5:11+3', 2025), '2025-12-01')
  /* Il quinto lunedì di un mese che ne ha quattro non esiste: meglio niente
     che il quarto, che sarebbe una data buona che nessuno ha chiesto. */
  is('un nesimo che non esiste dà niente', dataEvento('nesimo:1:5:2', 2026), null)

  is('la seconda domenica di maggio 2026 è il 10', dataEvento('nesimo:7:2:5', 2026), '2026-05-10')
  is('la prima domenica di maggio 2026 è il 3', dataEvento('nesimo:7:1:5', 2026), '2026-05-03')

  is('Pasqua 2026 è il 5 aprile', pasqua(2026), '2026-04-05')
  is('Pasqua 2027 è il 28 marzo', pasqua(2027), '2027-03-28')
  is('Pasqua 2025 era il 20 aprile', pasqua(2025), '2025-04-20')
  is('e Pasquetta è il giorno dopo', dataEvento('pasqua+1', 2026), '2026-04-06')
  /* Pasqua 2027 cade il 28 marzo: meno sette giorni si va a febbraio, e un
     calcolo che somma solo i giorni del mese finirebbe al 21 marzo. */
  is('sette giorni prima di Pasqua 2027 si cambia mese', dataEvento('pasqua-7', 2027), '2027-03-21')

  /* I saldi non si calcolano: le date le fissano le Regioni e cambiano ogni
     anno. `null` diventa «data da confermare», che è vero; una formula
     sarebbe sbagliata senza dirlo. */
  is('i saldi non si inventano', dataEvento('manuale', 2026), null)
  let errore = ''
  try { dataEvento('secondo martedì di maiale', 2026) } catch (e) { errore = (e as Error).message }
  is('una regola sconosciuta si ferma invece di indovinare', errore.includes('non riconosciuta'), true)
}

console.log('\n— Quando si comincia a lavorarci —')
{
  /* Il Black Friday non si prepara il Black Friday: è l'unico numero che
     distingue una corsia utile da una che si apre già in ritardo. */
  is('con 60 giorni il Black Friday 2026 parte il 28 settembre',
    inizioLavoro('2026-11-27', 60), '2026-09-28')
  is('e a cavallo dell\'anno il conto tiene', inizioLavoro('2027-01-05', 30), '2026-12-06')
  is('anticipo zero vuol dire il giorno stesso', inizioLavoro('2026-12-25', 0), '2026-12-25')
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)

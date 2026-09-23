/* §424 — le fasi commerciali. Esegui: npx tsx lib/sales-stages.check.ts

   Non verifica più **quali** fasi esistono: adesso le decide un amministratore
   mentre il tool gira, e un gate che elenca otto nomi fallirebbe il giorno dopo
   la prima configurazione. Verifica le regole che devono valere su qualunque
   elenco — le stesse che l'editor controlla prima di salvare, perché sono la
   stessa funzione. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLASSI_TINTA, ETICHETTA_GRUPPO, ETICHETTA_RUOLO, FASI_SEME, RUOLI, TINTE,
  attive, chiaveIngresso, chiaviAperte, classiFase, eAperta, etichettaFase,
  faseConRuolo, faseDi, fasiDelGruppo, gruppoDi, ordinate, problemiFasi, rangoFase, ruoloDi,
  type Fase, type Ruolo, type Tinta,
} from '@/lib/sales-stages'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const f = (chiave: string, ruolo: Ruolo, tinta: Tinta, ordine: number, attiva = true): Fase =>
  ({ chiave, etichetta: chiave.replace(/_/g, ' '), ruolo, tinta, ordine, attiva })

console.log('\n— Il seme è un elenco valido —')
/* Se il seme non passasse le sue stesse regole, il database nascerebbe già
   rotto e l'editor si rifiuterebbe di salvare quello che ha trovato dentro. */
is('nessun problema', problemiFasi(FASI_SEME), [])
is('otto fasi', FASI_SEME.length, 8)
is('una porta d’ingresso', FASI_SEME.filter(x => x.ruolo === 'nuovo').length, 1)
is('una sola vinta', FASI_SEME.filter(x => x.ruolo === 'vinto').length, 1)

console.log('\n— Gli invarianti, provati al contrario —')
is('senza ingresso non si salva',
  problemiFasi([f('a', 'in_corso', 'info', 1), f('b', 'vinto', 'success', 2), f('c', 'perso', 'error', 3)]).length, 1)
is('due ingressi nemmeno',
  problemiFasi([f('a', 'nuovo', 'info', 1), f('b', 'nuovo', 'orange', 2), f('c', 'vinto', 'success', 3), f('d', 'perso', 'error', 4)]).length, 1)
is('due vinte nemmeno',
  problemiFasi([f('a', 'nuovo', 'info', 1), f('b', 'vinto', 'success', 2), f('c', 'vinto', 'gold', 3), f('d', 'perso', 'error', 4)]).length, 1)
is('senza una persa nemmeno',
  problemiFasi([f('a', 'nuovo', 'info', 1), f('b', 'vinto', 'success', 2)]).length, 1)
is('elenco vuoto: un problema solo, e chiaro', problemiFasi([]).length, 1)
/* Una fase spenta non conta negli invarianti: si ritira una fase vecchia
   proprio per smettere di sceglierla, e se contasse non si potrebbe farlo. */
is('una vinta spenta non fa numero',
  problemiFasi([f('a', 'nuovo', 'info', 1), f('b', 'vinto', 'success', 2), f('vecchia', 'vinto', 'gold', 3, false), f('c', 'perso', 'error', 4)]), [])

console.log('\n— Due fasi vicine non hanno lo stesso colore —')
/* Chi guarda la bacheca legge il colore prima dell'etichetta: due colonne
   accanto dello stesso colore si scambiano. Lontane va bene — i token sono
   sette e le fasi possono essere di più. */
is('adiacenti uguali: rifiutato',
  problemiFasi([f('a', 'nuovo', 'info', 1), f('b', 'in_corso', 'info', 2), f('c', 'vinto', 'success', 3), f('d', 'perso', 'error', 4)]).length, 1)
is('lontane uguali: va bene',
  problemiFasi([f('a', 'nuovo', 'info', 1), f('b', 'in_corso', 'orange', 2), f('c', 'in_corso', 'info', 3), f('d', 'vinto', 'success', 4), f('e', 'perso', 'error', 5)]), [])
is('nel seme non ce ne sono',
  attive(FASI_SEME).filter((x, i, a) => i > 0 && x.tinta === a[i - 1].tinta).map(x => x.chiave), [])

console.log('\n— Il ruolo, non la chiave —')
const rinominato = FASI_SEME.map(x => x.chiave === 'cliente_acquisito' ? { ...x, chiave: 'chiuso_vinto' } : x)
is('la fase che vince si trova anche se la rinomini', faseConRuolo(rinominato, 'vinto')?.chiave, 'chiuso_vinto')
is('e la porta d’ingresso pure', chiaveIngresso(rinominato), 'nuovo_lead')
is('una fase che non c’è non ha ruolo', ruoloDi(FASI_SEME, 'mai_vista'), null)
is('né etichetta inventata: torna la chiave', etichettaFase(FASI_SEME, 'mai_vista'), 'mai_vista')
is('e senza chiave, un trattino', etichettaFase(FASI_SEME, null), '—')

console.log('\n— Aperte e chiuse —')
is('sospeso è ancora aperta', eAperta(FASI_SEME, 'pending'), true)
is('vinta non lo è', eAperta(FASI_SEME, 'cliente_acquisito'), false)
is('persa nemmeno', eAperta(FASI_SEME, 'perso'), false)
is('le aperte sono sei', chiaviAperte(FASI_SEME).length, 6)

console.log('\n— Quanto è avanti una trattativa —')
/* Non è la posizione nell'elenco: «Perso» può stare in cima e un lead nuovo non
   è più avanti di un preventivo inviato solo perché lo si mostra più in alto. */
const r = (k: string) => rangoFase(FASI_SEME, k)
is('vinta batte tutto', r('cliente_acquisito') > r('contratto_inviato'), true)
is('persa sta sotto a tutto', r('perso') < r('nuovo_lead'), true)
is('preventivo batte contatto', r('preventivo_inviato') > r('in_contatto'), true)
is('sospesa sta sopra la persa ma sotto il percorso', r('perso') < r('pending') && r('pending') < r('nuovo_lead'), true)

console.log('\n— I gruppi li dice il ruolo —')
is('l’ingresso apre', gruppoDi(FASI_SEME[0]), 'apertura')
is('le trattative vive sono lavorazione', fasiDelGruppo(FASI_SEME, 'lavorazione').length, 4)
is('vinta, persa e sospesa sono uscite', fasiDelGruppo(FASI_SEME, 'uscita').map(x => x.chiave), ['cliente_acquisito', 'pending', 'perso'])
is('ogni gruppo ha la sua etichetta', Object.keys(ETICHETTA_GRUPPO).length, 3)
is('ogni ruolo pure', Object.keys(ETICHETTA_RUOLO).sort(), [...RUOLI].sort())

console.log('\n— I colori vengono dai token, mai da un hex —')
is('ogni tinta ha le sue classi', TINTE.filter(t => !CLASSI_TINTA[t]), [])
is('nessun hex fra le classi', Object.values(CLASSI_TINTA).filter(c => /#[0-9a-f]{3,6}/i.test(c)), [])
is('una fase sconosciuta resta neutra', classiFase(FASI_SEME, 'mai_vista'), CLASSI_TINTA.neutro)

console.log('\n— L’ordine è quello dichiarato, non quello di arrivo —')
const mescolate = [...FASI_SEME].reverse()
is('si riordina da sé', ordinate(mescolate).map(x => x.ordine), FASI_SEME.map(x => x.ordine))
is('le spente escono dalle scelte', attive([...FASI_SEME, f('vecchia', 'in_corso', 'gold', 99, false)]).length, 8)
is('ma restano leggibili', faseDi([...FASI_SEME, f('vecchia', 'in_corso', 'gold', 99, false)], 'vecchia')?.chiave, 'vecchia')

console.log('\n— Il seme e la migration dicono la stessa cosa —')
/* Il seme popola il database la prima volta: se i due elenchi divergono, una
   installazione nuova parte con fasi diverse da quelle di qui, e il sintomo
   arriva mesi dopo su un ambiente che nessuno sta guardando. */
const sql = readFileSync(join(process.cwd(), 'supabase/migrations/258_fasi_commerciali.sql'), 'utf8')
for (const x of FASI_SEME) {
  is(`la migration semina «${x.chiave}»`, sql.includes(`('${x.chiave}',`), true)
}
is('e non semina fasi che il seme non conosce',
  Array.from(sql.matchAll(/^\s*\('([a-z_]+)',\s+'[^']+',\s+'(nuovo|in_corso|vinto|perso|sospeso)'/gm))
    .map(m => m[1]).filter(k => !FASI_SEME.some(x => x.chiave === k)), [])

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)

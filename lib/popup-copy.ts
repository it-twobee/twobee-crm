/**
 * §366 — i messaggi che compaiono in alto a destra, all'apertura e ogni venti
 * minuti.
 *
 * **Il serbatoio è finito, ed è la decisione che tiene in piedi la funzione.**
 * Venti minuti su otto ore fanno ventiquattro interruzioni al giorno, e non ci
 * sono ventiquattro cose da dire: dalla terza in poi sarebbe riempitivo, e il
 * riempitivo che interrompe è la cosa che fa disattivare le notifiche. Qui i
 * messaggi del giorno sono dieci, non si ripetono mai, e quando finiscono il
 * popup **tace** invece di riciclare. Accompagna le prime ore e poi sparisce.
 * Se un giorno lo si vuole più lungo, la leva è `MOMENTI`, non l'intervallo.
 *
 * **Il popup non conta le task.** È la regola che rende tutto il resto
 * corretto: i conteggi si muovono durante la giornata, e un messaggio scritto
 * stanotte che dice «quattro scadute» alle cinque del pomeriggio è il numero
 * plausibile e sbagliato che nessuno va a controllare. I numeri stanno nelle
 * pagine che li mostrano. Qui restano solo i fatti **fermi** — un collega, le
 * ferie, il prossimo festivo, da quanto sei con noi — e per il resto la voce
 * vive di quello che ha di suo: i drammi minori, una pausa vera, la
 * solidarietà. Roba che alle nove e alle sei è ugualmente vera.
 *
 * Gate: `npx tsx lib/popup-copy.check.ts`.
 */

import { CHIAVI, valori, nomiCitabili, type Chiave, type FattiPersona, type Vocabolario } from './person-copy'
import { drammaDelGiorno } from './voce-twobee'
import { sistemaPer } from './person-copy-prompt'

/** quanti messaggi al giorno, a persona: dieci, e a un'ora l'uno coprono la giornata */
export const MOMENTI = 10

/**
 * Ogni quanto **può** ricomparire, in minuti. È una distanza minima fra due
 * messaggi, non una sveglia: l'orologio corre anche quando il portale è
 * chiuso. Chi apre alle nove ne vede uno, chi riapre alle nove e mezza non
 * vede niente, chi torna a mezzogiorno ne vede **uno** — non i tre che
 * avrebbe «perso». Le ore saltate non si recuperano, e non è una rinuncia:
 * un arretrato di battute è il modo più veloce di trasformare una cosa
 * simpatica in una coda da smaltire.
 */
export const OGNI_MINUTI = 60

/**
 * Le chiavi che **non si muovono durante il giorno**.
 *
 * Fuori restano tutti i contatori delle task: `late`, `aperte`, `oggi`,
 * `chiuseOggi`, `chiuseSettimana`. Non perché siano poco interessanti — perché
 * sono gli unici che possono diventare falsi fra quando il messaggio è stato
 * scritto e quando lo si legge.
 */
const FERME: Chiave[] = [
  'nome', 'progetti', 'anzianitaMesi', 'anniversario', 'compleanno',
  'twobeeAnni', 'twobeeGiorni', 'ferieGiorni', 'ferieDurata',
  'festivo', 'festivoGiorni', 'collega1', 'collega1Task', 'collega2', 'collega2Task',
]

export function vocabolarioPopup(f: FattiPersona, rosa: string[] = []): Vocabolario {
  const tutti = valori(f)
  const valoriFermi = Object.fromEntries(
    CHIAVI.map(k => [k, FERME.includes(k) ? tutti[k] : null]),
  ) as Record<string, string | number | null>
  return {
    dichiarate: [...FERME],
    valori: valoriFermi,
    numeriche: ['progetti', 'anzianitaMesi', 'anniversario', 'compleanno', 'twobeeAnni',
      'twobeeGiorni', 'ferieGiorni', 'ferieDurata', 'festivoGiorni', 'collega1Task', 'collega2Task'],
    contatori: ['progetti', 'collega1Task', 'collega2Task'],
    citabili: nomiCitabili(f),
    rosa,
  }
}

/**
 * Gli **angoli**: di cosa parla ciascuno dei dieci.
 *
 * Non è decorazione, è quello che impedisce dieci variazioni della stessa
 * battuta. Ogni messaggio riceve un angolo diverso, e l'ordine è pensato per
 * la giornata: si comincia leggeri, si passa dal corpo verso metà, si finisce
 * lasciando andare.
 */
export const ANGOLI: { chiave: string; istruzione: string }[] = [
  { chiave: 'momento-1', istruzione: 'Un saluto breve, senza parlare di lavoro. Dì qualcosa che valga anche per chi ha appena aperto il portatile.' },
  { chiave: 'momento-2', istruzione: 'Prenditela con un dramma minore della giornata. Niente lavoro, solo la vita che fa la vita.' },
  { chiave: 'momento-3', istruzione: 'Una pausa vera e concreta: dieci minuti in piedi, un bicchiere d\'acqua, due passi. Senza farne una predica.' },
  { chiave: 'momento-4', istruzione: 'Solidarietà: qui dentro nessuno sa perfettamente cosa sta facendo, e questo è normale. Parla al plurale — di noi, mai di chi legge.' },
  { chiave: 'momento-5', istruzione: 'Nomina un collega con cui condivide lavoro, se ce n\'è uno. Altrimenti parla della squadra come fatto, non come slogan.' },
  { chiave: 'momento-6', istruzione: 'Il prossimo stacco: le ferie o il festivo in arrivo, se ci sono. Altrimenti il fatto che la giornata finirà comunque.' },
  { chiave: 'momento-7', istruzione: 'Un altro dramma minore, diverso dal primo. Il tono è quello di chi lo sta subendo insieme a te.' },
  { chiave: 'momento-8', istruzione: 'Il corpo: acqua, schiena, occhi, aria. Una cosa sola e concreta, senza vocabolario da medico né da guru.' },
  { chiave: 'momento-9', istruzione: 'Una giornata storta è una giornata storta. Dillo senza risolverla e senza ordinare un umore.' },
  { chiave: 'momento-10', istruzione: 'Ultimo della giornata: lascia andare. Quello che non è finito oggi non finisce oggi, e va bene.' },
]

export const SISTEMA_POPUP = sistemaPer([
  'Scrivi UNA riga che comparirà in un riquadro in alto a destra nel gestionale interno di TwoBee,',
  'mentre la persona sta lavorando. È un\'interruzione: deve valere il secondo che costa.',
  'Non parlare di quante task ha — quei numeri qui non ci sono e non si inventano.',
  'Non chiedere niente e non dare compiti: questo riquadro si chiude, non si esegue.',
], [
  'Il traffico stamattina era una dichiarazione di intenti. Sei arrivato: il resto è bonus.',
  'Dieci minuti in piedi adesso valgono più di un\'ora tirata. Anche la schiena vota sì.',
  'Qui dentro non ha capito niente nessuno, {nome}. Siamo in tanti, si sta comodi.',
  'Tu e {collega1} state tirando la stessa carretta. Almeno la carretta è in buona compagnia.',
  'Fra {ferieGiorni} {ferieGiorni|giorno|giorni} stacchi. Da qui in giù è tutta discesa.',
  'Bevi qualcosa. Non è un consiglio di benessere, è che sei fatto per lo più di quello.',
  'Giornata di quelle. Non si aggiusta a parole: si arriva a stasera e si vede.',
  'Quello che non finisce oggi non finisce oggi. Domani è letteralmente fatto apposta.',
])

export function utentePopup(
  angolo: { chiave: string; istruzione: string },
  f: FattiPersona,
  v: Vocabolario,
  usabili: string[],
  seme: number,
): string {
  const righe = [
    `Persona: ${f.nome}${f.ruolo ? `, ruolo ${f.ruolo}` : ''}.`,
    `Angolo di oggi: ${angolo.istruzione}`,
  ]
  if (/dramma minore/.test(angolo.istruzione)) {
    righe.push(`Il dramma di oggi, se ti serve un appiglio: ${drammaDelGiorno(seme)}.`)
  }
  righe.push('')
  righe.push(usabili.length
    ? 'Segnaposto disponibili (usali solo se servono davvero):'
    : 'Nessun segnaposto disponibile oggi: scrivi una riga che non ne ha bisogno.')
  for (const k of usabili) righe.push(`  {${k}} — ${v.valori[k]}`)
  righe.push('', 'Scrivi la riga.')
  return righe.join('\n')
}

// ── il lato lettura ──────────────────────────────────────────────────────────

export type Momento = { chiave: string; testo: string }

/**
 * I messaggi di oggi, resi e verificati, nell'ordine degli angoli.
 *
 * I fatti arrivano dalla riga del **saluto**, non da una copia su ciascun
 * momento: sono gli stessi dieci volte, e duplicarli vorrebbe dire dieci
 * fotografie che possono divergere fra loro senza che nessuno se ne accorga.
 * Se quella riga manca, i momenti non si rendono — e va bene: il popup è la
 * cosa che può mancare senza che nessuno se ne accorga.
 *
 * Ogni riga ripassa dal validatore prima di comparire. Non è pignoleria: fra
 * stanotte e adesso un collega può essere uscito dall'elenco, e `{collega1}`
 * non avrebbe più un valore. Meglio un messaggio in meno.
 */
export function momentiDiOggi(
  righe: { chiave: string; template: string }[],
  f: FattiPersona,
  rosa: string[],
  regole: { valida: (t: string, v: Vocabolario) => { ok: true; testo: string } | { ok: false; motivo: string } },
): Momento[] {
  const v = vocabolarioPopup(f, rosa)
  const ordine = new Map(ANGOLI.map((a, i) => [a.chiave, i]))
  return righe
    .filter(r => ordine.has(r.chiave))
    .sort((a, b) => (ordine.get(a.chiave) ?? 0) - (ordine.get(b.chiave) ?? 0))
    .map(r => {
      const esito = regole.valida(r.template, v)
      return esito.ok ? { chiave: r.chiave, testo: esito.testo } : null
    })
    .filter((m): m is Momento => m !== null)
}

/**
 * §366 — quale messaggio mostrare adesso, o `null`.
 *
 * È la regola dell'orologio, estratta dal componente perché è l'unica cosa
 * qui dentro che si può sbagliare in silenzio — e dentro un `useEffect` non
 * la proverebbe nessuno.
 *
 * Due proprietà, e la seconda è quella che chi la usa ha chiesto per nome:
 *
 * - **la distanza è fra due messaggi, non fra due aperture.** Aprire il
 *   portale dieci volte in mezz'ora non ne mostra dieci: ne mostra zero, e il
 *   primo torna quando l'ora è passata;
 * - **le ore saltate si bruciano.** Chi torna dopo tre ore trova **un**
 *   messaggio, non tre: il secondo e il terzo non sono in coda da qualche
 *   parte, non sono mai esistiti. Un arretrato di battute è il modo più
 *   veloce di trasformare una cosa simpatica in una cosa da smaltire.
 */
export function prossimoMomento(
  momenti: Momento[],
  stato: { viste: string[]; ultimo: number },
  adesso: number,
  ogniMinuti: number,
): Momento | null {
  if (adesso - stato.ultimo < ogniMinuti * 60_000) return null
  return momenti.find(m => !stato.viste.includes(m.chiave)) ?? null
}

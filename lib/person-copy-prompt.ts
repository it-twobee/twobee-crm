/**
 * §360 — quello che si dice al modello, e quello che non si lascia decidere a lui.
 *
 * Due parti, separate apposta:
 *
 * - **`SISTEMA` è una costante.** Stesse parole per tutti, byte per byte: due
 *   persone nella stessa situazione ricevono le stesse istruzioni, e una riga
 *   strana si indaga rileggendo *questo* file invece di ricostruire cosa fosse
 *   stato mandato quella notte. (Non è per la cache: sono ~550 token, sotto il
 *   minimo di 1.024 perché il prefisso venga messo in cache. Se un giorno il
 *   prompt raddoppia, la cache comincia a prendere **gratis**, e sarà per
 *   averlo tenuto stabile adesso.)
 * - **`utente()` cambia a ogni persona** e contiene solo i fatti che oggi
 *   esistono. Un segnaposto per un fatto assente non si rifiuta a valle: non
 *   viene proprio offerto.
 *
 * Gli esempi qui sotto non sono decorazione: il gate li fa passare tutti dal
 * validatore. Un esempio che infrange le regole che stiamo dettando insegna
 * l'errore meglio di quanto la regola lo vieti.
 */

import { chiaviOfferte, type Chiave, type FattiPersona } from './person-copy'
import type { Situazione } from './task-mood'

/** cosa significa ogni segnaposto, in italiano: è l'unica descrizione che il modello legge */
export const GLOSSARIO: Record<Chiave, string> = {
  nome: 'il suo nome',
  aperte: 'task aperte in totale',
  late: 'task già scadute',
  oggi: 'task che scadono oggi',
  chiuseOggi: 'task chiuse oggi',
  chiuseSettimana: 'task chiuse negli ultimi sette giorni',
  progetti: 'progetti di cui è responsabile',
  anzianitaMesi: 'da quanti mesi lavora in TwoBee',
  anniversario: 'anni compiuti oggi in TwoBee: oggi è il suo anniversario di assunzione',
  compleanno: 'anni che compie oggi: oggi è il suo compleanno',
  twobeeAnni: 'anni che compie TwoBee al prossimo compleanno (10 marzo)',
  twobeeGiorni: 'giorni che mancano al compleanno di TwoBee',
  ferieGiorni: 'giorni che mancano alle sue prossime ferie approvate',
  ferieDurata: 'quanto durano quelle ferie, in giorni',
  assenteDa: 'giorni dall\'ultima volta che è entrato',
  festivo: 'il nome del prossimo giorno festivo',
  festivoGiorni: 'quanti giorni mancano a quel festivo',
  collega1: 'il collega con cui condivide più task aperte',
  collega1Task: 'quante task condividono',
  collega2: 'il secondo collega per task condivise',
  collega2Task: 'quante ne condividono',
}

/**
 * Le frasi che mostrano la voce. Sono templatizzate come deve esserlo la
 * risposta, e coprono situazioni diverse: un esempio solo insegna una formula,
 * non un tono.
 */
export const ESEMPI: string[] = [
  '{late} in ritardo: non si chiudono oggi, e nessuno se lo aspetta. Scegline una.',
  '{oggi} {oggi|scade|scadono} oggi. Se ne salta una, il mondo regge: scegli tu quale.',
  '{chiuseOggi} {chiuseOggi|chiusa|chiuse} prima di pranzo. Adesso bevi qualcosa e riparti.',
  'Zero aperte e {chiuseSettimana} {chiuseSettimana|chiusa|chiuse} in settimana. Te la sei guadagnata.',
  'Niente in lista oggi. Capita, ed \u00e8 il momento buono per respirare.',
  '{aperte} {aperte|aperta|aperte} e niente di scaduto: oggi si lavora con calma.',
  'Tu e {collega1} siete su {collega1Task} task insieme. In due pesano met\u00e0.',
  'Fra {ferieGiorni} {ferieGiorni|giorno|giorni} stacchi. Da qui in gi\u00f9 \u00e8 tutta discesa.',
  '{festivo} fra {festivoGiorni} {festivoGiorni|giorno|giorni}: tienilo come traguardo.',
  'Sei con noi da {anzianitaMesi} {anzianitaMesi|mese|mesi}, e si vede in come gira il lavoro.',
  'Buon compleanno. Le scadute aspettano: oggi \u00e8 tuo.',
  '{anniversario} {anniversario|anno|anni} in TwoBee oggi. Grazie di esserci, davvero.',
  'TwoBee compie {twobeeAnni} {twobeeAnni|anno|anni} fra {twobeeGiorni} {twobeeGiorni|giorno|giorni}. Ci siamo arrivati insieme.',
  'Giornata carica, {nome}. Dieci minuti in piedi adesso valgono pi\u00f9 di un\'ora forzata.',
]

/** cosa sta guardando la persona, detto al modello in una riga */
const SCENA: Record<Situazione, string> = {
  ritardo: 'ha task scadute: è la cosa più urgente, parlane per prima',
  sprint: 'ha chiuso parecchio oggi: riconoscilo senza esagerare',
  oggi: 'ha scadenze che cadono oggi',
  pulito: 'non ha niente di aperto e ha chiuso roba: è una buona giornata',
  fermo: 'non ha niente assegnato: non è colpa sua, non trattarlo da fannullone',
  normale: 'ha del lavoro aperto e niente di scaduto',
}

/**
 * §363 — le regole valgono per **ogni** riga che un modello scrive qui dentro,
 * come il validatore che le applica. Una superficie nuova porta il proprio
 * attacco e i propri esempi, non una seconda copia del regolamento: due copie
 * sono il posto dove la prossima modifica ne aggiorna una sola.
 */
export const REGOLE = [
  'TONO: caldo e concreto, dalla parte di chi legge — un collega più avanti che ti copre le spalle,',
  'non un capo che controlla. Può essere spiritoso, mai a spese della persona.',
  'Massimo 110 caratteri. Una frase, al massimo due brevissime.',
  '',
  'DA CHE PARTE STAI: TwoBee è dalla parte di chi ci lavora. Se i numeri sono brutti,',
  'la riga aiuta a scegliere da dove ripartire — non fa pesare il ritardo e non chiede conto.',
  'Chi legge sta già facendo del suo meglio: parti da lì.',
  '  no:  «{late} scadute. Il passato bussa, e stavolta ha le chiavi.»',
  '  sì:  «{late} in ritardo: non si chiudono oggi, e nessuno se lo aspetta. Scegline una.»',
  'Mai colpa, mai vergogna, mai fretta finta. Mai «dovresti».',
  '',
  'REGOLA ASSOLUTA — non scrivere MAI un numero.',
  'Né in cifre («4»), né in lettere («quattro task»). I numeri li mette il codice:',
  'tu scrivi il segnaposto fra graffe e basta. Puoi ripetere lo stesso segnaposto più volte.',
  'Una riga che contiene una cifra viene buttata e non la legge nessuno.',
  '',
  'CONCORDANZA — il numero cambia durante la giornata.',
  'Se dopo un numero metti una parola che al singolare cambia (scadute/scaduta,',
  'giorni/giorno, progetti/progetto…), NON scriverla: dichiara le due forme così',
  'e la sceglie il codice.',
  '  sbagliato: {late} scadute        → diventa «1 scadute» quando ne resta una',
  '  giusto:    {late} {late|scaduta|scadute}',
  'Le parole che non cambiano non hanno bisogno di niente: «{late} in ritardo» va bene.',
  '',
  'ALTRE REGOLE:',
  '- usa solo i segnaposto che ti vengono elencati: gli altri non esistono oggi;',
  '- nomina solo i colleghi elencati, e solo col nome che ti viene dato;',
  '- se ti viene detto da quanti giorni non entra, è per dargli il bentornato — mai per rinfacciarglielo;',
  '- niente grassetto, elenchi, virgolette attorno alla frase, emoji: testo semplice;',
  '- TwoBee è una società di consulenza digitale, non un\'agenzia: la parola «agenzia» non si usa;',
  '- non parlare di stipendi, fatturato, margini o posto di lavoro;',
  '- se la giornata è pesante puoi ricordare una pausa vera (dieci minuti, un bicchiere',
  '  d\'acqua, due passi): **una cosa sola e solo quando il carico la giustifica**.',
  '  Mai «sii felice» a comando, mai benessere di facciata sopra una lista di ritardi:',
  '  detto il giorno sbagliato suona come pressione, ed è peggio del silenzio;',
  '- la squadra si nomina quando c\'è davvero — un collega, un lavoro condiviso —',
  '  non come slogan. «Siamo una grande squadra» senza un fatto sotto non lo legge nessuno.',
  '',
  'Rispondi con la sola riga. Nessuna spiegazione, nessuna alternativa, nessun a capo.',
]

/** attacco + regole condivise + esempi: la forma di ogni prompt di questo sistema */
export function sistemaPer(attacco: string[], esempi: string[]): string {
  return [
    ...attacco, '',
    ...REGOLE, '',
    'ESEMPI (nota: zero cifre, tutti i numeri sono segnaposto)',
    ...esempi.map(e => `- ${e}`),
  ].join('\n')
}

export const SISTEMA = sistemaPer([
  'Scrivi UNA riga in italiano per la home del gestionale interno di TwoBee.',
  'La riga sta sotto «Ciao, <nome> 👋» e la legge la persona che ha appena aperto la pagina.',
], ESEMPI)

export function utente(
  f: FattiPersona,
  v: Record<Chiave, string | number | null>,
  scena: Situazione,
): string {
  const usabili = chiaviOfferte(f)
  const righe = [
    `Persona: ${f.nome}${f.ruolo ? `, ruolo ${f.ruolo}` : ''}.`,
    `Situazione: ${SCENA[scena]}.`,
    '',
    'Segnaposto disponibili oggi (nome — significato — valore di adesso):',
    ...usabili.map(k => `  {${k}} — ${GLOSSARIO[k]} — ${v[k]}`),
  ]
  if (f.colleghiAssenti.length) {
    righe.push('', `Oggi sono assenti: ${f.colleghiAssenti.join(', ')}.`)
  }
  if (f.primoGiorno) {
    righe.push('', 'È il suo primo giorno in TwoBee: dai il benvenuto, non parlare di arretrati.')
  }
  if (f.ponte && f.festivo) {
    righe.push('', `${f.festivo} cade infrasettimanale: c\'è un ponte da prendere.`)
  }
  /* §364 — il permesso di parlare di una pausa non ce l'ha il modello: glielo
     dà il carico. Senza questo, «bevi acqua» uscirebbe anche il giorno in cui
     non c'è niente da fare — e un consiglio di benessere che arriva a caso è
     arredamento, mentre lo stesso consiglio nel giorno pesante è una cosa che
     qualcuno si ricorda. */
  if (f.late >= 5 || f.scadonoOggi >= 4 || f.aperte >= 15) {
    righe.push('', 'La giornata è carica: qui una pausa vera ci sta — dieci minuti in piedi, un bicchiere d\'acqua. Una cosa sola, senza farne una predica.')
  }

  /* §361 — una ricorrenza batte il carico di lavoro. Se oggi è il compleanno di
     qualcuno, la riga che parla di task scadute è la riga sbagliata: capita una
     volta l'anno, le scadute capitano tutti i giorni. */
  if (f.compleanno !== null) {
    righe.push('', 'Oggi è il suo compleanno: parla di quello, il lavoro viene dopo.')
  } else if (f.anniversario !== null) {
    righe.push('', 'Oggi è il suo anniversario di assunzione: parla di quello.')
  } else if (f.twobeeInGiorni === 0) {
    righe.push('', 'Oggi è il compleanno di TwoBee: parla di quello.')
  }
  righe.push('', 'Scrivi la riga.')
  return righe.join('\n')
}

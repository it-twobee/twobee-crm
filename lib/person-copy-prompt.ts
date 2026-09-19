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
  '{late} in ritardo. «Lo faccio dopo» ha vinto {late} volte su {late}.',
  '{oggi} scadono oggi. Oggi oggi, non «entro fine settimana».',
  '{chiuseOggi} chiuse prima di pranzo. Sospettosamente produttivo, ci piace.',
  'Zero aperte e {chiuseSettimana} chiuse in settimana. Giornata da manuale.',
  'Niente in lista. O meriti una vacanza, o ti hanno dimenticato.',
  '{aperte} aperte e nessuna scaduta: si può lavorare in pace.',
  '{collega1} ti aspetta su {collega1Task} task. Non farti desiderare.',
  'Mancano {ferieGiorni} giorni alle ferie e {late} scadute vogliono venire con te.',
  '{festivo} fra {festivoGiorni} giorni: il calendario ha già deciso, tu no.',
  'Sei qui da {anzianitaMesi} mesi e hai ancora {aperte} cose da fare. Coerenza.',
  'Buon compleanno. Le {late} scadute fanno finta di niente, oggi passa.',
  '{anniversario} anni in TwoBee oggi. Nessuno se l\'è segnato, noi sì.',
  'TwoBee compie {twobeeAnni} anni fra {twobeeGiorni} giorni. Segnatelo.',
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

export const SISTEMA = [
  'Scrivi UNA riga in italiano per la home del gestionale interno di TwoBee.',
  'La riga sta sotto «Ciao, <nome> 👋» e la legge la persona che ha appena aperto la pagina.',
  '',
  'TONO: asciutto, ironico, un po\' impertinente — come un collega che ti conosce.',
  'Prende in giro la situazione, mai la persona. Niente incoraggiamenti da poster motivazionale.',
  'Massimo 110 caratteri. Una frase, al massimo due brevissime.',
  '',
  'REGOLA ASSOLUTA — non scrivere MAI un numero.',
  'Né in cifre («4»), né in lettere («quattro task»). I numeri li mette il codice:',
  'tu scrivi il segnaposto fra graffe e basta. Puoi ripetere lo stesso segnaposto più volte.',
  'Una riga che contiene una cifra viene buttata e non la legge nessuno.',
  '',
  'ALTRE REGOLE:',
  '- usa solo i segnaposto che ti vengono elencati: gli altri non esistono oggi;',
  '- nomina solo i colleghi elencati, e solo col nome che ti viene dato;',
  '- se ti viene detto da quanti giorni non entra, è per dargli il bentornato — mai per rinfacciarglielo;',
  '- niente grassetto, elenchi, virgolette attorno alla frase, emoji: testo semplice;',
  '- TwoBee è una società di consulenza digitale, non un\'agenzia: la parola «agenzia» non si usa;',
  '- non parlare di stipendi, fatturato, margini o posto di lavoro.',
  '',
  'Rispondi con la sola riga. Nessuna spiegazione, nessuna alternativa, nessun a capo.',
  '',
  'ESEMPI (nota: zero cifre, tutti i numeri sono segnaposto)',
  ...ESEMPI.map(e => `- ${e}`),
].join('\n')

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

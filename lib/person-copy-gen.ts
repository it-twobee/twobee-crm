/**
 * §360 — il generatore notturno: legge i fatti, chiede la riga, la verifica,
 * e la butta se non passa.
 *
 * Gira una volta al giorno, prima che qualcuno apra il gestionale. Non gira a
 * ogni apertura di pagina per tre ragioni, in ordine di gravità: `SalutoDinamico`
 * sta in un server component e una chiamata a un modello davanti al render la
 * pagherebbe chi guarda; §351 ha già stabilito che il testo non deve cambiare
 * a ogni tasto; e una frase che cambia a ogni refresh smette di essere letta
 * esattamente come quella che non cambia mai.
 *
 * **La riga si può sempre buttare.** `validaTemplate` è l'unico giudice, e
 * quando dice di no si riprova dicendo al modello cosa ha sbagliato — tre
 * volte, poi si lascia perdere e per quella persona resta il testo
 * deterministico di `task-mood.ts`. Nessun percorso qui dentro può far
 * comparire un numero che non viene dal database: i numeri non passano dal
 * modello, passano da `rendi()`.
 *
 * Il modello non si scrive nel codice — stessa lezione di `lib/ai/model.ts`,
 * dove un identificativo dismesso copiato in cinque file le ha uccise tutte
 * insieme. Qui sta in `PERSON_COPY_MODEL`.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { chatWithTools, activeModel, activeProvider } from './ai/provider'
import { ADMIN_ROLES, WORKSPACE_ROLES } from './permissions'
import { normalize, type RawLeave, type RawRequest } from './leave-calendar'
import type { Ruolo } from './task-mood'
import {
  fattiPersona, valida, nomiCitabili, scenaDi, vocabolarioSaluto, offerte, valori,
  type FattiPersona, type RigaAssegnazione, type RigaAssenza, type RigaProfilo, type RigaTask,
  type Vocabolario,
} from './person-copy'
import { SISTEMA, utente } from './person-copy-prompt'
import {
  osserva, vocabolarioAttivita, utenteAttivita, SISTEMA_ATTIVITA,
  type IngressoAttivita, type Osservazione,
} from './attivita-copy'

type Admin = SupabaseClient

/**
 * **Quale motore scrive la riga.** Il default è quello che l'app ha già acceso
 * — Groq, la stessa chiave dell'assistente Ctrl+J — e non per risparmiare:
 * perché qui la domanda «basta un modello più piccolo?» non è un'opinione, è
 * una **misura**. Il validatore boccia tutto quello che non rispetta il patto,
 * `tentativi` conta quanto spesso succede, e `scartate` quanto spesso non ce la
 * fa in tre giri. Se quei due numeri restano bassi, un modello più caro
 * comprerebbe niente.
 *
 * `PERSON_COPY_PROVIDER=anthropic` sposta tutto sull'SDK Anthropic senza
 * toccare il resto: stesso prompt, stesso validatore, stessa tabella. Così il
 * confronto si fa sullo stesso carico, come si è fatto per scegliere Qwen
 * (`lib/ai/model.ts`), e non a impressioni.
 */
export type Motore = 'groq' | 'anthropic'

export const MOTORE: Motore =
  (process.env.PERSON_COPY_PROVIDER ?? '').toLowerCase() === 'anthropic' ? 'anthropic' : 'groq'

export const MODELLO = MOTORE === 'anthropic'
  ? (process.env.PERSON_COPY_MODEL ?? 'claude-opus-5')
  : activeModel()

/** oltre il terzo tentativo non è sfortuna, è il prompt: si smette e si registra */
const MAX_TENTATIVI = 3

/** le righe più vecchie non servono a niente: restano un mese per poter indagare una frase strana */
const GIORNI_DI_STORIA = 30

// ── la chiamata ──────────────────────────────────────────────────────────────

/**
 * Una chiave assente non è un errore: è lo stato normale finché quel motore
 * non è acceso. Il giro si fa lo stesso, non scrive niente, e lo dice — così
 * il cron si può accendere prima della chiave e il workspace non se ne accorge.
 */
export const chiaveConfigurata = () => Boolean(
  MOTORE === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.GROQ_API_KEY,
)

/* Tetto largo di proposito, in entrambi i casi. Qwen 3.6 e Opus 5 ragionano
   tutti e due, e i token di ragionamento escono da qui: un budget stretto su
   un modello che ragiona non accorcia la risposta, la **svuota** — lezione già
   pagata in questo progetto (`lib/ai/model.ts`). La riga costa trenta token. */
const TETTO = 3000

/* Più alta di quella dell'assistente (0.2), che deve essere preciso. Qui il
   difetto da evitare è l'opposto: sette persone che ricevono la stessa frase
   con un nome diverso dentro. */
const TEMPERATURA = 0.8

async function chiedi(sistema: string, messaggio: string): Promise<string> {
  if (MOTORE === 'anthropic') {
    const res = await new Anthropic().messages.create({
      model: MODELLO,
      max_tokens: TETTO,
      // una riga di saluto non è un problema difficile, e l'effort basso costa meno
      output_config: { effort: 'low' },
      system: sistema,
      messages: [{ role: 'user', content: messaggio }],
    })
    if (res.stop_reason === 'refusal') throw new Error('rifiutata dal modello')
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
  }

  /* Lo stesso adattatore dell'assistente: gestisce chiave, modello e il 429
     con una riprova. Non ci sono strumenti da esporre — qui si chiede una
     frase, non un'azione. */
  const r = await chatWithTools({
    messages: [{ role: 'system', content: sistema }, { role: 'user', content: messaggio }],
    maxTokens: TETTO,
    temperature: TEMPERATURA,
  })
  return r.content ?? ''
}

/**
 * Toglie solo l'involucro: il ragionamento di un reasoning model, le virgolette
 * attorno alla frase, il trattino d'elenco, le righe in più.
 *
 * **Sbucciare non è correggere.** Una cifra resta una cifra e il validatore la
 * boccia: se questa funzione cominciasse a sistemare il contenuto, il gate
 * smetterebbe di misurare il modello e comincerebbe a misurare noi.
 */
export function ripulisci(grezzo: string): string {
  /* Qwen 3.6 ragiona, e il pensiero esce in `content` dentro <think>. Se il
     tag non si chiude, il modello **non ha finito di pensare**: si è fermato
     sul tetto dei token e una risposta non c'è. Restituire la prima riga
     darebbe «<think>» — ed è successo davvero, in produzione, a un collega.
     Stringa vuota: il validatore la boccia e si riprova, che è la cosa giusta
     da fare quando non c'è una risposta. */
  const fine = grezzo.toLowerCase().lastIndexOf('</think>')
  // chiuso: quello che conta viene **dopo** l'ultima chiusura, anche se l'apertura manca
  // aperto e mai chiuso: il modello si è fermato sul tetto dei token e una risposta non c'è
  if (fine < 0 && /<think>/i.test(grezzo)) return ''
  const senzaPensiero = fine >= 0 ? grezzo.slice(fine + '</think>'.length) : grezzo
  let t = senzaPensiero.trim().split('\n').map(r => r.trim()).filter(Boolean)[0] ?? ''
  t = t.replace(/^[-*•]\s+/, '')
  const coppie: [string, string][] = [['"', '"'], ['“', '”'], ['«', '»'], ["'", "'"]]
  for (const [a, b] of coppie) {
    if (t.length > 1 && t.startsWith(a) && t.endsWith(b)) { t = t.slice(1, -1).trim(); break }
  }
  return t
}

export type Esito =
  | { ok: true; template: string; situazione: string; tentativi: number }
  | { ok: false; motivo: string; tentativi: number }

/**
 * Chiede la riga e la verifica. A ogni scarto il motivo torna al modello:
 * «hai scritto una cifra» è un'informazione che un secondo tentativo usa, e
 * senza di quella il secondo tentativo sbaglia uguale.
 */
export async function scriviRiga(o: {
  sistema: string
  messaggio: string
  vocab: Vocabolario
  situazione: string
}): Promise<Esito> {
  let ultimo = ''
  for (let i = 1; i <= MAX_TENTATIVI; i++) {
    const messaggio = ultimo
      ? `${o.messaggio}\n\nIl tentativo precedente è stato scartato: ${ultimo}. Riscrivi rispettando la regola.`
      : o.messaggio
    let grezzo: string
    try {
      grezzo = ripulisci(await chiedi(o.sistema, messaggio))
    } catch (e) {
      return { ok: false, motivo: e instanceof Error ? e.message : 'chiamata fallita', tentativi: i }
    }
    const r = valida(grezzo, o.vocab)
    if (r.ok) return { ok: true, template: grezzo, situazione: o.situazione, tentativi: i }
    ultimo = r.motivo
  }
  return { ok: false, motivo: ultimo, tentativi: MAX_TENTATIVI }
}

/** il saluto: primo chiamante delle regole condivise */
export const scrivi = (f: FattiPersona) => scriviRiga({
  sistema: SISTEMA,
  messaggio: utente(f, valori(f), scenaDi(f)),
  vocab: vocabolarioSaluto(f, nomiCitabili(f)),
  situazione: scenaDi(f),
})

/** «Le mie attività»: c'è solo quando `osserva` ha trovato qualcosa */
export const scriviAttivita = (o: Osservazione, nome: string, rosa: string[]) => {
  const vocab = vocabolarioAttivita(o, nome, rosa)
  return scriviRiga({
    sistema: SISTEMA_ATTIVITA,
    messaggio: utenteAttivita(o, nome, vocab, offerte(vocab)),
    vocab,
    situazione: o.tipo,
  })
}

// ── i fatti, dal database ────────────────────────────────────────────────────

const GENERO_PER: string[] = [...ADMIN_ROLES, ...WORKSPACE_ROLES]

/**
 * Un giro solo per tutti, non uno a testa: le stesse task servono a chi le ha
 * e ai colleghi che le condividono, e chiederle quindici volte vorrebbe dire
 * quindici volte la stessa risposta.
 */
export type Bundle = { fatti: FattiPersona; attivita: IngressoAttivita }

export async function caricaTutto(admin: Admin, oggi: string): Promise<Bundle[]> {
  const sessantaGiorniFa = new Date(Date.parse(`${oggi}T00:00:00Z`) - 60 * 864e5).toISOString()

  const [profiliRes, taskRes, assegnRes, richiesteRes, registroRes, progettiRes, msRes] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, app_role, hire_date, birth_date, last_seen_at')
      .eq('is_active', true).in('app_role', GENERO_PER),
    admin.from('tasks')
      .select('id, status, due_date, completed_at, assignee_id, created_at, updated_at')
      .is('deleted_at', null)
      .or(`status.neq.completato,completed_at.gte.${sessantaGiorniFa}`),
    admin.from('task_assignees').select('task_id, profile_id'),
    admin.from('hr_requests').select('id, profile_id, type, status, start_date, end_date, notes'),
    admin.from('team_leaves').select('id, user_id, type, status, start_date, end_date, notes, days_count'),
    admin.from('projects').select('id, manager_id').is('deleted_at', null).eq('status', 'active'),
    admin.from('milestones').select('id, status, due_date, owner_id').not('owner_id', 'is', null),
  ])

  type Profilo = { id: string; full_name: string | null; app_role: string | null; hire_date: string | null; birth_date: string | null; last_seen_at: string | null }
  const profili = (profiliRes.data ?? []) as Profilo[]
  const tasks = (taskRes.data ?? []) as (RigaTask & { assignee_id: string | null; created_at: string; updated_at: string | null })[]
  const assegn = (assegnRes.data ?? []) as RigaAssegnazione[]
  const progetti = (progettiRes.data ?? []) as { id: string; manager_id: string | null }[]

  /* `task_assignees` è la sorgente canonica, ma `tasks.assignee_id` resta il
     primario e molte viste leggono quello: una task assegnata solo lì
     sparirebbe dal conteggio di chi ce l'ha davvero in mano. */
  const perPersona = new Map<string, Set<string>>()
  const aggiungi = (pid: string | null, tid: string) => {
    if (!pid) return
    const s = perPersona.get(pid) ?? new Set<string>()
    s.add(tid); perPersona.set(pid, s)
  }
  tasks.forEach(t => aggiungi(t.assignee_id, t.id))
  assegn.forEach(a => aggiungi(a.profile_id, a.task_id))

  // le assegnazioni complete, per sapere con chi si condivide: unione delle due sorgenti
  const assegnTotali: RigaAssegnazione[] = [
    ...assegn,
    ...tasks.filter(t => t.assignee_id).map(t => ({ task_id: t.id, profile_id: t.assignee_id as string })),
  ]

  const { spans } = normalize(
    (richiesteRes.data ?? []) as RawRequest[],
    (registroRes.data ?? []) as RawLeave[],
  )
  const assenze: RigaAssenza[] = spans
    .filter(s => s.status === 'approvata' && s.to >= oggi)
    .map(s => ({ profileId: s.profileId, from: s.from, to: s.to }))

  const anagrafica: RigaProfilo[] = profili.map(p => ({ id: p.id, full_name: p.full_name }))
  const perTask = new Map(tasks.map(t => [t.id, t]))

  const milestone = (msRes.data ?? []) as { id: string; status: string; due_date: string | null; owner_id: string | null }[]

  return profili.map(p => {
    const mie = Array.from(perPersona.get(p.id) ?? [])
      .map(id => perTask.get(id))
      .filter((t): t is (RigaTask & { assignee_id: string | null; created_at: string; updated_at: string | null }) => Boolean(t))
    const fatti = fattiPersona({
    profilo: {
      id: p.id, full_name: p.full_name, app_role: (p.app_role ?? null) as Ruolo,
      hire_date: p.hire_date, birth_date: p.birth_date, last_seen_at: p.last_seen_at,
    },
      oggi,
      tasks: mie,
      assegnazioni: assegnTotali,
      profili: anagrafica,
      assenze,
      progetti: progetti.filter(x => x.manager_id === p.id).length,
    })

    /* §363 — per «Le mie attività» servono due cose che il saluto non guarda:
       **quando** un collega parte (non solo se è via oggi) e le milestone di
       cui la persona è responsabile. Le righe ci sono già tutte: è un taglio
       diverso degli stessi dati, non un secondo giro sul database. */
    const attivita: IngressoAttivita = {
      oggi,
      nome: fatti.nome,
      tasks: mie.map(t => ({
        id: t.id, status: t.status, due_date: t.due_date,
        created_at: t.created_at, updated_at: t.updated_at,
      })),
      milestone: milestone.filter(m => m.owner_id === p.id),
      colleghi: fatti.colleghi.map(c => {
        const sua = assenze
          .filter(a => a.profileId === c.id && a.to >= oggi)
          .sort((x, y) => x.from.localeCompare(y.from))[0]
        return { nome: c.nome, task: c.task, assenteDa: sua?.from ?? null, assenteA: sua?.to ?? null }
      }),
    }
    return { fatti, attivita }
  })
}

// ── il giro ──────────────────────────────────────────────────────────────────

export type Riepilogo = {
  giorno: string
  motore: Motore
  modello: string
  persone: number
  scritte: number
  scartate: number
  /** quante volte il validatore ha respinto prima di una riga buona: se sale, il prompt sbaglia */
  ritentate: number
  /** §363 — quante volte non c'era niente da segnalare. Non è un errore: è la risposta normale */
  taciute: number
  motivi: string[]
  saltato?: string
}

export async function generaTutti(admin: Admin, oggi: string): Promise<Riepilogo> {
  const bundle = await caricaTutto(admin, oggi)
  const base: Riepilogo = {
    giorno: oggi, motore: MOTORE, modello: MODELLO, persone: bundle.length,
    scritte: 0, scartate: 0, ritentate: 0, taciute: 0, motivi: [],
  }
  if (!chiaveConfigurata()) {
    return { ...base, saltato: `Chiave mancante per ${MOTORE} (${activeProvider()}): nessuna riga scritta, resta il testo deterministico` }
  }

  const rosa = bundle.map(b => b.fatti.nome).filter(Boolean)

  const salva = async (profileId: string, chiave: string, e: Esito, fatti: unknown, nome: string) => {
    if (!e.ok) {
      base.scartate++
      if (base.motivi.length < 10) base.motivi.push(`${nome}/${chiave}: ${e.motivo}`)
      return
    }
    /* `upsert` e non `insert`: rilanciare il giro a metà mattina deve
       riscrivere la riga del giorno, non fallire sulla chiave primaria. Chi lo
       rilancia lo fa perché la prima volta è andata storta. */
    const { error } = await admin.from('person_copy').upsert({
      profile_id: profileId, giorno: oggi, chiave,
      template: e.template, situazione: e.situazione,
      fatti: fatti as Record<string, unknown>,
      modello: MODELLO, tentativi: e.tentativi,
      creato_il: new Date().toISOString(),
    }, { onConflict: 'profile_id,giorno,chiave' })
    if (error) {
      base.scartate++
      if (base.motivi.length < 10) base.motivi.push(`${nome}/${chiave}: scrittura fallita — ${error.message}`)
      return
    }
    base.scritte++
    base.ritentate += e.tentativi - 1
  }

  for (const { fatti, attivita } of bundle) {
    await salva(fatti.profileId, 'saluto', await scrivi(fatti), fatti, fatti.nome)

    /* §363 — qui il silenzio è un esito, non un guasto: se non c'è niente da
       segnalare non si chiama il modello e non si scrive niente. La riga vecchia
       va via, o resterebbe a dire una cosa di ieri. */
    const o = osserva(attivita)
    if (!o) {
      base.taciute++
      await admin.from('person_copy').delete()
        .eq('profile_id', fatti.profileId).eq('giorno', oggi).eq('chiave', 'attivita')
      continue
    }
    await salva(fatti.profileId, 'attivita', await scriviAttivita(o, fatti.nome, rosa), o, fatti.nome)
  }

  /* La storia serve a indagare una frase strana, non ad accumulare: oltre il
     mese non l'aprirebbe nessuno, e sono righe che parlano delle persone. */
  const limite = new Date(Date.parse(`${oggi}T00:00:00Z`) - GIORNI_DI_STORIA * 864e5)
    .toISOString().slice(0, 10)
  await admin.from('person_copy').delete().lt('giorno', limite)

  return base
}

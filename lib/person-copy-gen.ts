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
import { ADMIN_ROLES, WORKSPACE_ROLES } from './permissions'
import { normalize, type RawLeave, type RawRequest } from './leave-calendar'
import type { Ruolo } from './task-mood'
import {
  fattiPersona, validaTemplate, nomiCitabili, scenaDi,
  type FattiPersona, type RigaAssegnazione, type RigaAssenza, type RigaProfilo, type RigaTask,
} from './person-copy'
import { SISTEMA, utente } from './person-copy-prompt'
import { valori } from './person-copy'

type Admin = SupabaseClient

export const MODELLO = process.env.PERSON_COPY_MODEL ?? 'claude-opus-5'

/** oltre il terzo tentativo non è sfortuna, è il prompt: si smette e si registra */
const MAX_TENTATIVI = 3

/** le righe più vecchie non servono a niente: restano un mese per poter indagare una frase strana */
const GIORNI_DI_STORIA = 30

// ── la chiamata ──────────────────────────────────────────────────────────────

/**
 * `ANTHROPIC_API_KEY` assente non è un errore: è lo stato normale finché
 * l'organizzazione su console.anthropic.com non esiste. Il giro si fa lo
 * stesso, non scrive niente, e lo dice — così il cron si può accendere prima
 * della chiave e il workspace non se ne accorge.
 */
export const chiaveConfigurata = () => Boolean(process.env.ANTHROPIC_API_KEY)

async function chiedi(messaggio: string): Promise<string> {
  const client = new Anthropic()
  const res = await client.messages.create({
    model: MODELLO,
    /* Largo apposta. Opus 5 ragiona di suo, e un tetto stretto su un modello
       che ragiona non accorcia la risposta: la **svuota** — è già successo in
       questo progetto con Qwen (`lib/ai/model.ts`). La riga costa trenta
       token; il resto è il ragionamento, che non paghiamo in lunghezza. */
    max_tokens: 2000,
    // una riga di saluto non è un problema difficile, e l'effort basso costa meno
    output_config: { effort: 'low' },
    system: SISTEMA,
    messages: [{ role: 'user', content: messaggio }],
  })
  if (res.stop_reason === 'refusal') throw new Error('rifiutata dal modello')
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
}

/** toglie solo l'involucro: virgolette attorno alla frase, trattini d'elenco, righe vuote */
export function ripulisci(grezzo: string): string {
  let t = grezzo.trim().split('\n').map(r => r.trim()).filter(Boolean)[0] ?? ''
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
export async function scrivi(f: FattiPersona): Promise<Esito> {
  const ctx = { rosa: nomiCitabili(f) }
  const base = utente(f, valori(f), scenaDi(f))
  let ultimo = ''
  for (let i = 1; i <= MAX_TENTATIVI; i++) {
    const messaggio = ultimo
      ? `${base}\n\nIl tentativo precedente è stato scartato: ${ultimo}. Riscrivi rispettando la regola.`
      : base
    let grezzo: string
    try {
      grezzo = ripulisci(await chiedi(messaggio))
    } catch (e) {
      return { ok: false, motivo: e instanceof Error ? e.message : 'chiamata fallita', tentativi: i }
    }
    const r = validaTemplate(grezzo, f, ctx)
    if (r.ok) return { ok: true, template: grezzo, situazione: scenaDi(f), tentativi: i }
    ultimo = r.motivo
  }
  return { ok: false, motivo: ultimo, tentativi: MAX_TENTATIVI }
}

// ── i fatti, dal database ────────────────────────────────────────────────────

const GENERO_PER: string[] = [...ADMIN_ROLES, ...WORKSPACE_ROLES]

/**
 * Un giro solo per tutti, non uno a testa: le stesse task servono a chi le ha
 * e ai colleghi che le condividono, e chiederle quindici volte vorrebbe dire
 * quindici volte la stessa risposta.
 */
export async function caricaFatti(admin: Admin, oggi: string): Promise<FattiPersona[]> {
  const sessantaGiorniFa = new Date(Date.parse(`${oggi}T00:00:00Z`) - 60 * 864e5).toISOString()

  const [profiliRes, taskRes, assegnRes, richiesteRes, registroRes, progettiRes] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, app_role, hire_date, birth_date, last_seen_at')
      .eq('is_active', true).in('app_role', GENERO_PER),
    admin.from('tasks')
      .select('id, status, due_date, completed_at, assignee_id')
      .is('deleted_at', null)
      .or(`status.neq.completato,completed_at.gte.${sessantaGiorniFa}`),
    admin.from('task_assignees').select('task_id, profile_id'),
    admin.from('hr_requests').select('id, profile_id, type, status, start_date, end_date, notes'),
    admin.from('team_leaves').select('id, user_id, type, status, start_date, end_date, notes, days_count'),
    admin.from('projects').select('id, manager_id').is('deleted_at', null).eq('status', 'active'),
  ])

  type Profilo = { id: string; full_name: string | null; app_role: string | null; hire_date: string | null; birth_date: string | null; last_seen_at: string | null }
  const profili = (profiliRes.data ?? []) as Profilo[]
  const tasks = (taskRes.data ?? []) as (RigaTask & { assignee_id: string | null })[]
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

  return profili.map(p => fattiPersona({
    profilo: {
      id: p.id, full_name: p.full_name, app_role: (p.app_role ?? null) as Ruolo,
      hire_date: p.hire_date, birth_date: p.birth_date, last_seen_at: p.last_seen_at,
    },
    oggi,
    tasks: Array.from(perPersona.get(p.id) ?? []).map(id => perTask.get(id)).filter((t): t is RigaTask & { assignee_id: string | null } => Boolean(t)),
    assegnazioni: assegnTotali,
    profili: anagrafica,
    assenze,
    progetti: progetti.filter(x => x.manager_id === p.id).length,
  }))
}

// ── il giro ──────────────────────────────────────────────────────────────────

export type Riepilogo = {
  giorno: string
  modello: string
  persone: number
  scritte: number
  scartate: number
  /** quante volte il validatore ha respinto prima di una riga buona: se sale, il prompt sbaglia */
  ritentate: number
  motivi: string[]
  saltato?: string
}

export async function generaTutti(admin: Admin, oggi: string): Promise<Riepilogo> {
  const fatti = await caricaFatti(admin, oggi)
  const base: Riepilogo = {
    giorno: oggi, modello: MODELLO, persone: fatti.length,
    scritte: 0, scartate: 0, ritentate: 0, motivi: [],
  }
  if (!chiaveConfigurata()) {
    return { ...base, saltato: 'ANTHROPIC_API_KEY non configurata: nessuna riga scritta, resta il testo deterministico' }
  }

  for (const f of fatti) {
    const e = await scrivi(f)
    if (!e.ok) {
      base.scartate++
      if (base.motivi.length < 10) base.motivi.push(`${f.nome}: ${e.motivo}`)
      continue
    }
    /* `upsert` e non `insert`: rilanciare il giro a metà mattina deve
       riscrivere la riga del giorno, non fallire sulla chiave primaria. Chi lo
       rilancia lo fa perché la prima volta è andata storta. */
    const { error } = await admin.from('person_copy').upsert({
      profile_id: f.profileId,
      giorno: oggi,
      chiave: 'saluto',
      template: e.template,
      situazione: e.situazione,
      fatti: f as unknown as Record<string, unknown>,
      modello: MODELLO,
      tentativi: e.tentativi,
      creato_il: new Date().toISOString(),
    }, { onConflict: 'profile_id,giorno,chiave' })
    if (error) {
      base.scartate++
      if (base.motivi.length < 10) base.motivi.push(`${f.nome}: scrittura fallita — ${error.message}`)
      continue
    }
    base.scritte++
    base.ritentate += e.tentativi - 1
  }

  /* La storia serve a indagare una frase strana, non ad accumulare: oltre il
     mese non l'aprirebbe nessuno, e sono righe che parlano delle persone. */
  const limite = new Date(Date.parse(`${oggi}T00:00:00Z`) - GIORNI_DI_STORIA * 864e5)
    .toISOString().slice(0, 10)
  await admin.from('person_copy').delete().lt('giorno', limite)

  return base
}

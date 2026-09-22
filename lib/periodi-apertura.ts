/**
 * §392 — aprire i periodi di un progetto: il cuore, fuori dalle azioni.
 *
 * Sta qui e non in `app/actions/periodi.ts` per una ragione precisa: un
 * file `'use server'` **esporta endpoint** (§329), e questa funzione la
 * chiamano in due — il bottone e il giro notturno. Esportandola da lì
 * sarebbe diventata una porta in più senza guardia, e il gate delle azioni
 * l'ha vista subito passare da sedici a diciassette.
 *
 * Che bottone e cron passino dalla **stessa** funzione non è eleganza:
 * §288 è già successo una volta, quando l'impronta dell'import esisteva in
 * due copie e una era rimasta indietro. Se a mano e in automatico facessero
 * due cose leggermente diverse, il giorno in cui il cron sbaglia nessuno
 * riuscirebbe a riprodurlo premendo il bottone.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { decidi, riassumi, type CorsiaEsistente } from './generatore-periodi'
import { scheletro, type NodoScheletro } from './scheletro-periodo'
import { formaDiServizio, type Forma, type Periodo } from './periodi'

type Admin = ReturnType<typeof createAdminClient>

export type EsitoPeriodi = {
  /** la frase da mostrare: dice anche cosa **non** ha fatto */
  riepilogo: string
  creati: { chiave: string; etichetta: string }[]
  saltati: { etichetta: string; perche: string; corsia?: string }[]
  /** la corsia che ha dovuto creare per contenere i mesi, se non c'era */
  contenitoreCreato: string | null
  /** §391 — quante tappe e task sono nate dentro i periodi */
  tappe: number
  task: number
  /** nessuno scheletro per questo servizio: i periodi nascono vuoti */
  senzaScheletro: boolean
}

/**
 * Il contenitore dei mesi.
 *
 * Un mese è una **tappa**, e una tappa vuole una corsia: `milestones`
 * richiede `workstream_id` e ha ragione — una milestone senza corsia non
 * comparirebbe da nessuna parte. Si usa la continuativa del progetto se
 * c'è; se non c'è si crea «Piano editoriale», che è il nome con cui quel
 * contenitore viene chiamato quando qualcuno lo fa a mano.
 */
async function contenitoreMesi(
  admin: Admin, projectId: string, uid: string | null,
): Promise<{ id: string; creato: string | null }> {
  const { data } = await admin.from('project_workstreams')
    .select('id, name').eq('project_id', projectId).eq('workstream_type', 'recurring')
    .order('sort_order').limit(1)
  const trovata = (data ?? [])[0] as { id: string; name: string } | undefined
  if (trovata) return { id: trovata.id, creato: null }

  const { data: nuova, error } = await admin.from('project_workstreams').insert({
    project_id: projectId,
    name: 'Piano editoriale',
    workstream_type: 'recurring',
    status: 'active',
    visibility: 'internal',
    created_by: uid,
  }).select('id').single()
  if (error) throw new Error(`Non riesco a creare il contenitore dei mesi: ${error.message}`)
  return { id: (nuova as { id: string }).id, creato: 'Piano editoriale' }
}

export async function apriPerProgetto(
  admin: Admin,
  /** chi sta aprendo. `null` dal cron: «Sistema» è la verità, e attribuire
   *  a un admin di passaggio una corsia che non ha aperto è peggio */
  uid: string | null,
  projectId: string,
  /** §400 — dal wizard: le corsie appena scritte non sono periodi da coprire */
  opzioni: { allaCreazione?: boolean } = {},
): Promise<EsitoPeriodi> {
  const { data: prog } = await admin.from('projects')
    .select('id, name, service_type, service_subtype, status').eq('id', projectId).maybeSingle()
  if (!prog) throw new Error('Questo progetto non esiste più')
  const p = prog as { service_type: string | null; service_subtype: string | null }

  /* La forma si cerca per tipo **e** sottotipo: la Digitalizzazione ha tre
     righe di catalogo, e potrebbero non volere la stessa forma. */
  const { data: cat } = await admin.from('service_catalog')
    .select('service_type, service_subtype, period_shape').eq('service_type', p.service_type ?? '')
  const righe = (cat ?? []) as { service_subtype: string | null; period_shape: Forma }[]
  const forma: Forma = formaDiServizio(righe, p.service_subtype ?? null)

  const vuoto: EsitoPeriodi = {
    riepilogo: 'Questo servizio non ha periodi', creati: [], saltati: [],
    contenitoreCreato: null, tappe: 0, task: 0, senzaScheletro: false,
  }
  if (forma === 'none') return vuoto

  const [{ data: ws }, { data: pp }] = await Promise.all([
    admin.from('project_workstreams').select('id, name, start_date, end_date, workstream_type').eq('project_id', projectId),
    admin.from('project_periods').select('period_key').eq('project_id', projectId),
  ])
  const corsie: CorsiaEsistente[] = ((ws ?? []) as { id: string; name: string; start_date: string | null; end_date: string | null; workstream_type: string }[])
    .filter(w => w.workstream_type === 'project')
    .map(w => ({ id: w.id, name: w.name, dal: w.start_date, al: w.end_date }))
  const chiaviAperte = ((pp ?? []) as { period_key: string }[]).map(x => x.period_key)

  const oggi = new Date().toISOString().slice(0, 10)
  const decisioni = decidi({ oggi, forma, chiaviAperte, corsie, coperture: !opzioni.allaCreazione })
  const daFare = decisioni.filter(d => d.fare === 'crea')

  const esito: EsitoPeriodi = {
    riepilogo: riassumi(decisioni),
    creati: [],
    saltati: decisioni.flatMap(d => d.fare === 'salta'
      ? [{ etichetta: d.periodo.etichetta, perche: d.perche, corsia: d.corsia }] : []),
    contenitoreCreato: null, tappe: 0, task: 0, senzaScheletro: false,
  }
  if (!daFare.length) return esito

  /* §391 — lo scheletro si legge **una volta**, prima del giro: è lo stesso
     per tutti i periodi che si stanno aprendo, e rileggerlo per ognuno
     vorrebbe dire quattro query identiche per aprire quattro mesi. */
  const nodi = await scheletroDi(admin, p.service_type, p.service_subtype, forma)
  esito.senzaScheletro = nodi.length === 0

  /* Il contenitore si cerca una volta sola e solo se serve: cercarlo per
     ogni mese vorrebbe dire crearne quattro il primo giro. */
  let dentro: string | null = null
  if (forma === 'month') {
    const c = await contenitoreMesi(admin, projectId, uid)
    dentro = c.id
    esito.contenitoreCreato = c.creato
  }

  for (const d of daFare) {
    if (d.fare !== 'crea') continue
    const { periodo } = d
    let workstreamId: string | null = null
    let milestoneId: string | null = null

    if (forma === 'quarter') {
      const { data, error } = await admin.from('project_workstreams').insert({
        project_id: projectId,
        name: periodo.etichetta,
        workstream_type: 'project',
        status: 'active',
        start_date: periodo.dal,
        end_date: periodo.al,
        /* §388 — il cliente vede i cicli, non i check settimanali. */
        visibility: 'client_visible',
        created_by: uid,
      }).select('id').single()
      if (error) throw new Error(`«${periodo.etichetta}»: ${error.message}`)
      workstreamId = (data as { id: string }).id
    } else {
      const { data, error } = await admin.from('milestones').insert({
        project_id: projectId,
        workstream_id: dentro,
        title: periodo.etichetta,
        milestone_type: 'delivery',
        /* La tappa scade alla fine del mese: è quando il piano di quel mese
           deve essere consegnato, non quando comincia. */
        due_date: periodo.al,
        visibility: 'client_visible',
      }).select('id').single()
      if (error) throw new Error(`«${periodo.etichetta}»: ${error.message}`)
      milestoneId = (data as { id: string }).id
    }

    /* Subito dopo, non alla fine: se il giro si interrompe a metà, quello
       che è stato creato risulta creato — e domani non lo si rifà. */
    const { error: eReg } = await admin.from('project_periods').insert({
      project_id: projectId,
      period_key: periodo.chiave,
      shape: forma,
      starts_on: periodo.dal,
      ends_on: periodo.al,
      workstream_id: workstreamId,
      milestone_id: milestoneId,
    })
    if (eReg) {
      if (['42P01', 'PGRST205'].includes(eReg.code ?? '')) {
        throw new Error('Manca la migration 247: senza il registro, domani il periodo verrebbe riaperto.')
      }
      throw new Error(`Registro di «${periodo.etichetta}»: ${eReg.message}`)
    }
    esito.creati.push({ chiave: periodo.chiave, etichetta: periodo.etichetta })

    if (nodi.length) {
      const n = await riempi(admin, {
        projectId, nodi, periodo, forma,
        workstreamId: forma === 'quarter' ? workstreamId! : dentro!,
        milestoneId,
      })
      esito.tappe += n.tappe
      esito.task += n.task
    }
  }

  return esito
}

/**
 * Lo scheletro del servizio, o niente.
 *
 * Si cerca per tipo **e** sottotipo, con il tipo come ripiego: la
 * Digitalizzazione ha tre righe di catalogo e potrebbe averne uno solo.
 * Se non c'è, il periodo nasce vuoto e l'esito lo dice — un contenitore
 * vuoto è una risposta legittima, ma silenziosa sembra uno scheletro che
 * non ha funzionato.
 */
async function scheletroDi(
  admin: Admin,
  serviceType: string | null, serviceSubtype: string | null, forma: Forma,
): Promise<NodoScheletro[]> {
  if (forma === 'none' || !serviceType) return []
  const { data: tpl, error } = await admin.from('project_templates')
    .select('id, service_subtype')
    .eq('kind', 'period').eq('period_shape', forma).eq('service_type', serviceType)
  /* Senza la 248 non c'è la colonna `kind`: i periodi nascono vuoti, che è
     esattamente come nascevano prima. Non è un errore da fermare tutto. */
  if (error) return []
  const righe = (tpl ?? []) as { id: string; service_subtype: string | null }[]
  const scelto = righe.find(r => (r.service_subtype ?? null) === (serviceSubtype ?? null)) ?? righe[0]
  if (!scelto) return []

  const { data } = await admin.from('project_template_nodes')
    .select('id, parent_id, node_type, name, description, relative_due_days, suggested_owner_role, priority, visibility, estimated_hours, sort_order')
    .eq('template_id', scelto.id).order('sort_order')
  return ((data ?? []) as NodoScheletro[]).filter(n => n.node_type === 'milestone' || n.node_type === 'task')
}

/**
 * Le tappe e i task dentro un periodo appena nato.
 *
 * `tasks_hierarchy_chk` vuole tutti e tre i legami — progetto, corsia e
 * **tappa** — su una task di progetto: una task senza tappa non è una task
 * incompleta, è una riga che il database rifiuta. Quindi un task il cui
 * nodo padre non c'è finisce nella prima tappa creata, e se non ce n'è
 * nessuna non si scrive: meglio una task in meno che un giro che si ferma
 * a metà lasciando il periodo mezzo pieno.
 */
async function riempi(
  admin: Admin,
  x: {
    projectId: string; nodi: NodoScheletro[]; periodo: Periodo; forma: Forma
    workstreamId: string; milestoneId: string | null
  },
): Promise<{ tappe: number; task: number }> {
  const forma = x.forma === 'quarter' ? 'quarter' : 'month'
  const { tappe, task } = scheletro(x.nodi, x.periodo, forma)

  /** dal nodo del template alla tappa vera */
  const idDi = new Map<string, string>()
  for (const t of tappe) {
    const { data, error } = await admin.from('milestones').insert({
      project_id: x.projectId,
      workstream_id: x.workstreamId,
      title: t.title,
      description: t.description,
      milestone_type: 'delivery',
      due_date: t.due_date,
      visibility: t.visibility,
      sort_order: t.sort_order,
    }).select('id').single()
    if (error) throw new Error(`Tappa «${t.title}»: ${error.message}`)
    idDi.set(t.chiaveNodo, (data as { id: string }).id)
  }

  const primaTappa = tappe.length ? idDi.get(tappe[0].chiaveNodo)! : null
  const righe = task.map(t => ({
    project_id: x.projectId,
    workstream_id: x.workstreamId,
    milestone_id: t.dentro ? (idDi.get(t.dentro) ?? primaTappa) : (x.milestoneId ?? primaTappa),
    title: t.title,
    description: t.description,
    task_type: 'project',
    status: 'da_fare',
    priority: t.priority ?? 'media',
    due_date: t.due_date,
    estimated_hours: t.estimated_hours,
  })).filter(r => r.milestone_id)

  if (righe.length) {
    const { error } = await admin.from('tasks').insert(righe)
    if (error) throw new Error(`Task di «${x.periodo.etichetta}»: ${error.message}`)
  }
  return { tappe: tappe.length, task: righe.length }
}

'use server'

/**
 * §390 — aprire i periodi di un progetto.
 *
 * La decisione sta in `lib/generatore-periodi.ts` e qui non si ripete: qui
 * si scrive quello che quella ha deciso. Tenerle separate serve a una cosa
 * sola e importante — la parte che può sbagliare in modo costoso si prova
 * senza un database, e questa si limita a eseguire.
 *
 * **Il periodo nasce vuoto.** Lo scheletro dal template arriva dopo: se il
 * contenitore sbaglia si cancella senza portarsi via task di nessuno, e il
 * primo giro si guarda per quello che è — dei contenitori.
 *
 * **La riga in `project_periods` si scrive subito dopo la corsia.** Se si
 * scrivesse solo la corsia, domani il generatore non saprebbe di averla
 * già aperta e ne farebbe un'altra: il registro non è un accessorio, è la
 * memoria che rende ripetibile il giro.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decidi, riassumi, type CorsiaEsistente } from '@/lib/generatore-periodi'
import type { Forma } from '@/lib/periodi'

async function requireStaff(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin' && p?.role !== 'team') throw new Error('Permesso negato')
  return user.id
}

export type EsitoPeriodi = {
  /** la frase da mostrare: dice anche cosa **non** ha fatto */
  riepilogo: string
  creati: { chiave: string; etichetta: string }[]
  saltati: { etichetta: string; perche: string; corsia?: string }[]
  /** la corsia che ha dovuto creare per contenere i mesi, se non c'era */
  contenitoreCreato: string | null
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
  admin: ReturnType<typeof createAdminClient>, projectId: string, uid: string,
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

export async function apriPeriodi(projectId: string): Promise<EsitoPeriodi> {
  const uid = await requireStaff()
  const admin = createAdminClient()

  const { data: prog } = await admin.from('projects')
    .select('id, name, service_type, service_subtype, status').eq('id', projectId).maybeSingle()
  if (!prog) throw new Error('Questo progetto non esiste più')
  const p = prog as { service_type: string | null; service_subtype: string | null }

  /* La forma si cerca per tipo **e** sottotipo: la Digitalizzazione ha tre
     righe di catalogo, e potrebbero non volere la stessa forma. */
  const { data: cat } = await admin.from('service_catalog')
    .select('service_type, service_subtype, period_shape').eq('service_type', p.service_type ?? '')
  const righe = (cat ?? []) as { service_subtype: string | null; period_shape: Forma }[]
  const forma: Forma = (righe.find(r => (r.service_subtype ?? null) === (p.service_subtype ?? null))
    ?? righe[0])?.period_shape ?? 'none'

  const vuoto: EsitoPeriodi = { riepilogo: 'Questo servizio non ha periodi', creati: [], saltati: [], contenitoreCreato: null }
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
  const decisioni = decidi({ oggi, forma, chiaviAperte, corsie })
  const daFare = decisioni.filter(d => d.fare === 'crea')

  const esito: EsitoPeriodi = {
    riepilogo: riassumi(decisioni),
    creati: [],
    saltati: decisioni.flatMap(d => d.fare === 'salta'
      ? [{ etichetta: d.periodo.etichetta, perche: d.perche, corsia: d.corsia }] : []),
    contenitoreCreato: null,
  }
  if (!daFare.length) return esito

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
  }

  revalidatePath(`/progetti/${projectId}`)
  revalidatePath('/progetti')
  revalidatePath(`/workspace/progetti/${projectId}`)
  return esito
}

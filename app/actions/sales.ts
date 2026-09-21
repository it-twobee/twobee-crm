'use server'

import { revalidatePath } from 'next/cache'
import { createActorClient, createAdminClient } from '@/lib/supabase/admin'
import { sincronizzaLead } from '@/lib/sales-sync'
import { requireSalesAccess } from '@/lib/sales-guard'
import { OUTCOMES, canReadDeal, uuid, validDate, validateDeal, type DealInput, type Delivery, type SalesData, type SalesDeal, type SalesOutcome, type SalesActivity } from '@/lib/sales'
import { isWorkspaceRole } from '@/lib/permissions'
import { validaCella } from '@/lib/sales-table'
import { CHIAVI_FASE, FASE_INGRESSO } from '@/lib/sales-stages'
import { somiglianze, spiegaSomiglianza, type Candidato } from '@/lib/sales-dedup'
import { generaSubito } from '@/lib/recurrence-kick'

const DEAL_FIELDS = 'id,title,company_name,client_id,contact_id,assigned_to,stage,source,need,blocker,next_action,next_action_on,resume_on,monthly_value,setup_value,one_off_value,proposal_ref,loss_reason,created_at,updated_at,closed_at,last_interaction_at,revision,delivery,delivery_project_id,delivery_completed_at,delivery_owner_id'

function refreshSales() {
  revalidatePath('/commerciale')
  revalidatePath('/workspace/commerciale')
}
function dbError(error: { code?: string; message: string }): never {
  if (['PGRST202', 'PGRST204', '42703', '42P01'].includes(error.code ?? '')) throw new Error('Area commerciale da attivare: manca la migration 223 sul database.')
  if (error.code === 'P0001') throw new Error(error.message)
  console.error('Commerciale', error.code, error.message)
  throw new Error('Operazione non riuscita. I dati inseriti restano disponibili; riprova.')
}

export async function setSalesPermission(profileId: string, enabled: boolean) {
  const { actor, access } = await requireSalesAccess()
  if (access !== 'admin') throw new Error('Solo gli admin possono abilitare l’area commerciale')
  uuid(profileId)
  if (typeof enabled !== 'boolean') throw new Error('Permesso non valido')
  const db = createActorClient(actor)
  const { data: target, error } = await db.from('profiles').select('app_role,is_active').eq('id', profileId).single()
  if (error || !target || !isWorkspaceRole(target.app_role) || target.is_active === false) throw new Error('Scegli una persona attiva del workspace')
  const result = await db.from('profile_permissions').upsert({
    profile_id: profileId, permission: 'can_view_deals', granted: enabled, granted_by: actor,
  }, { onConflict: 'profile_id,permission' })
  if (result.error) dbError(result.error)
  refreshSales()
  revalidatePath('/workspace', 'layout')
}

/**
 * §368 — «Lead convertito»: lega la riga commerciale all'anagrafica appena
 * creata e la porta in fondo alla pipeline.
 *
 * Si chiama **dopo** che il cliente esiste, non prima: il modale di anagrafica
 * è già la porta buona — chiede ragione sociale, tipo, settore, referenti — e
 * duplicarne una versione ridotta qui dentro avrebbe prodotto due modi di
 * creare un cliente, che è il modo di ottenerne due con lo stesso nome. Il
 * commerciale precompila quello che sa (azienda, referente, telefono, mail) e
 * chi converte controlla: è spesso il momento in cui si scopre che la ragione
 * sociale vera è un'altra.
 *
 * **Non tocca i numeri.** Una conversione non crea contratti, rate, MRR o
 * fatture: quelli nascono in Economics dal primo contratto venduto, e restano
 * l'unica scrittura di valore del prodotto. Qui si dice solo «questa
 * trattativa adesso è quel cliente».
 *
 * Idempotente: se la riga è già collegata a quel cliente non fa niente e non
 * si lamenta — un doppio clic sulla CTA è un doppio clic, non un errore.
 */
export async function collegaLeadACliente(dealId: string, clientId: string) {
  const { actor } = await requireSalesAccess()
  const db = createActorClient(actor)

  const { data: riga, error: eLettura } = await db
    .from('deals').select('id,client_id,stage').eq('id', dealId).maybeSingle()
  if (eLettura) dbError(eLettura)
  if (!riga) throw new Error('Questa opportunità non esiste più')

  const attuale = riga as { id: string; client_id: string | null; stage: string }
  if (attuale.client_id && attuale.client_id !== clientId) {
    throw new Error('Questa opportunità è già collegata a un altro cliente')
  }
  if (attuale.client_id === clientId && attuale.stage === 'active_client') {
    refreshSales()
    return { collegato: true as const }
  }

  const { error } = await db.from('deals').update({
    client_id: clientId,
    stage: 'active_client',
    closed_at: new Date().toISOString(),
  }).eq('id', dealId)
  if (error) dbError(error)

  /* L'anagrafica nuova cambia gli elenchi di entrambi i portali, e chi
     converte di solito ci va subito dopo: senza questo troverebbe la lista
     di prima e penserebbe che non abbia funzionato. */
  refreshSales()
  revalidatePath('/clienti')
  revalidatePath('/workspace/clienti')
  return { collegato: true as const }
}

/**
 * §371 — salva **una** cella.
 *
 * Il campo non arriva libero: passa da `validaCella`, che conosce le colonne
 * e i loro tipi e rifiuta tutto il resto. Non è pignoleria di forma — un file
 * `'use server'` esporta un endpoint, e chi ha il codice davanti conosce i
 * nomi delle colonne di `deals` (§329). Senza quel controllo si potrebbe
 * scrivere su `client_id`, `revision` o `sheet_row_id` mandando il campo
 * giusto nel corpo della richiesta, e nascondere una cella nella tabella non
 * è una barriera.
 *
 * Una cella per volta e nessuna revisione da confrontare: due persone che
 * modificano la **stessa** cella dello **stesso** lead nello stesso minuto
 * sono un caso che in sette non capita, e chiedere una conferma di versione a
 * ogni tasto renderebbe l'editing in cella più lento che aprire una scheda.
 * Chi scrive per ultimo vince, e lo vede subito perché la tabella si aggiorna.
 */
export async function salvaCellaDeal(dealId: string, campo: string, valore: unknown) {
  const { actor } = await requireSalesAccess()
  const esito = validaCella(campo, valore)
  if (!esito.ok) throw new Error(esito.motivo)

  const { error } = await createActorClient(actor)
    .from('deals')
    .update({ [campo]: esito.valore, updated_at: new Date().toISOString() })
    .eq('id', dealId)
  if (error) dbError(error)

  refreshSales()
  return { valore: esito.valore }
}

/**
 * §371 — chi segue la trattativa: zero, uno o due persone.
 *
 * Sostituisce l'elenco invece di aggiungere e togliere: su Notion è un campo
 * multi-persona che si sceglie da un menu, e replicare quel gesto con due
 * azioni separate vorrebbe dire una finestra in cui la riga ha zero owner.
 */
export async function impostaOwnerDeal(dealId: string, profileIds: string[]) {
  const { actor } = await requireSalesAccess()
  const db = createActorClient(actor)
  const unici = Array.from(new Set(profileIds.filter(Boolean)))

  const { error: eCancella } = await db.from('deal_owners').delete().eq('deal_id', dealId)
  if (eCancella) dbError(eCancella)

  if (unici.length) {
    const { error } = await db.from('deal_owners')
      .insert(unici.map(profile_id => ({ deal_id: dealId, profile_id })))
    if (error) dbError(error)
  }
  refreshSales()
  return { owner: unici }
}

/**
 * §372 — «Aggiorna dal foglio», premuto da una persona.
 *
 * Stessa funzione del cron notturno, non una sua copia: se la sincronizzazione
 * a mano e quella automatica facessero due cose leggermente diverse, il giorno
 * in cui il cron sbaglia nessuno riuscirebbe a riprodurlo premendo il bottone.
 *
 * Il riepilogo torna a chi ha premuto — quanti nuovi, quanti già c'erano,
 * quanti scartati — perché «fatto» non è una risposta: chi preme quel bottone
 * lo preme dopo aver aggiunto una riga al foglio, e vuole sapere se quella
 * riga è arrivata. Zero nuovi con ventotto già presenti è un esito sano; zero
 * nuovi e zero letti vuol dire che il foglio non si apre.
 */
export async function aggiornaDaFoglio() {
  const { access } = await requireSalesAccess()
  if (access !== 'admin' && access !== 'manager') {
    throw new Error('Solo admin e manager possono aggiornare dal foglio')
  }
  const esito = await sincronizzaLead(createAdminClient())
  refreshSales()
  return esito
}

// ── §377 · aggiungere un lead, a mano o da un CSV ───────────────────────────

export type NuovoLead = {
  companyName: string
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  stage?: string
  source?: string | null
  priority?: string | null
  notes?: string | null
}

export type EsitoCreazione =
  | { ok: true; id: string }
  | { ok: false; doppioni: { id: string; testo: string; certo: boolean }[] }

/** i campi su cui si cerca un doppione: sono pochi e bastano tutti e tre */
const CAMPI_DEDUP = 'id,company_name,contact_phone,contact_email,sheet_row_id,stage'

/**
 * Crea un lead, **dopo** aver guardato se c'è già.
 *
 * Non unisce e non decide: se trova qualcosa di simile si ferma e restituisce
 * cosa ha trovato e perché. È la regola dei clienti (§326) applicata qui, e
 * vale per lo stesso motivo — solo chi sta inserendo sa se «Rossi Srl» e
 * «Rossi S.r.l.» sono la stessa azienda o due fratelli in due capannoni.
 *
 * `forza` esiste ed è esplicito: chi ha letto l'elenco dei somiglianti e sa
 * che sono aziende diverse deve poter procedere, o il controllo diventa un
 * muro e si smette di usare la funzione.
 */
export async function creaLead(input: NuovoLead, forza = false): Promise<EsitoCreazione> {
  const { actor } = await requireSalesAccess()
  const db = createActorClient(actor)

  const nome = input.companyName.trim()
  if (!nome) throw new Error('Il nome azienda è obbligatorio')

  if (!forza) {
    /* Si leggono solo i candidati plausibili, non tutta la tabella: con
       cinquantacinque righe sarebbe uguale, con cinquemila no. */
    const { data, error } = await db.from('deals').select(CAMPI_DEDUP)
    if (error) dbError(error)
    const trovati = somiglianze(
      {
        companyName: nome,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
      },
      (data ?? []) as unknown as Candidato[],
    )
    if (trovati.length) {
      return {
        ok: false,
        doppioni: trovati.map(s => ({
          id: s.esistente.id,
          testo: spiegaSomiglianza(s),
          certo: s.certo,
        })),
      }
    }
  }

  const { data, error } = await db.from('deals').insert({
    title: nome,
    company_name: nome,
    contact_name: input.contactName?.trim() || null,
    contact_email: input.contactEmail?.trim() || null,
    contact_phone: input.contactPhone?.trim() || null,
    stage: input.stage && CHIAVI_FASE.includes(input.stage) ? input.stage : FASE_INGRESSO,
    source: input.source?.trim() || null,
    priority: input.priority || null,
    notes: input.notes?.trim() || null,
    created_by: actor,
  }).select('id').single()
  if (error) dbError(error)

  refreshSales()
  return { ok: true, id: (data as { id: string }).id }
}

export type RigaCsv = Record<string, string>

export type EsitoImport = {
  letti: number
  nuovi: number
  doppioni: { riga: number; azienda: string; testo: string }[]
  scartati: number
  errore?: string
}

/**
 * Importa un CSV esterno: inserisce **solo** le righe che non somigliano a
 * niente, e restituisce l'elenco di quelle saltate con il motivo.
 *
 * Non c'è un «forza» qui, ed è voluto: su una riga sola chi inserisce legge
 * e decide, su duecento righe non legge — e un «importa tutto lo stesso»
 * riempirebbe la tabella di doppioni in un clic, che è esattamente la cosa
 * che questa funzione dovrebbe impedire. Le righe saltate si guardano nel
 * riepilogo e si aggiungono a mano, una per una, con la decisione davanti.
 */
export async function importaLeadCsv(righe: NuovoLead[]): Promise<EsitoImport> {
  const { access, actor } = await requireSalesAccess()
  if (access !== 'admin' && access !== 'manager') {
    throw new Error('Solo admin e manager possono importare un CSV')
  }
  const db = createActorClient(actor)

  const { data, error } = await db.from('deals').select(CAMPI_DEDUP)
  if (error) dbError(error)
  const esistenti = (data ?? []) as unknown as Candidato[]

  const esito: EsitoImport = { letti: righe.length, nuovi: 0, doppioni: [], scartati: 0 }
  const daInserire: NuovoLead[] = []

  righe.forEach((r, i) => {
    const nome = (r.companyName ?? '').trim()
    if (!nome) { esito.scartati++; return }
    /* Si confronta anche con quelle già accettate in **questo** giro: un CSV
       che contiene due volte la stessa azienda le inserirebbe entrambe, e il
       controllo avrebbe guardato solo il passato. */
    const contro = [...esistenti, ...daInserire.map((d, k) => ({
      id: `nuovo-${k}`,
      company_name: d.companyName,
      contact_phone: d.contactPhone ?? null,
      contact_email: d.contactEmail ?? null,
    }))]
    const trovati = somiglianze(
      { companyName: nome, contactPhone: r.contactPhone, contactEmail: r.contactEmail },
      contro,
    )
    if (trovati.length) {
      esito.doppioni.push({ riga: i + 2, azienda: nome, testo: spiegaSomiglianza(trovati[0]) })
      return
    }
    daInserire.push({ ...r, companyName: nome })
  })

  if (daInserire.length) {
    const { error: eIns } = await db.from('deals').insert(daInserire.map(d => ({
      title: d.companyName,
      company_name: d.companyName,
      contact_name: d.contactName?.trim() || null,
      contact_email: d.contactEmail?.trim() || null,
      contact_phone: d.contactPhone?.trim() || null,
      stage: d.stage && CHIAVI_FASE.includes(d.stage) ? d.stage : FASE_INGRESSO,
      source: d.source?.trim() || 'CSV',
      notes: d.notes?.trim() || null,
      created_by: actor,
    })))
    if (eIns) return { ...esito, errore: `Inserimento fallito: ${eIns.message}` }
    esito.nuovi = daInserire.length
  }

  refreshSales()
  return esito
}

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createHash } from 'node:crypto'
import { requireEconomicsAdmin } from '@/lib/economics-guard'
import { requireLabAdmin } from '@/lib/lab-guard'
import { createActorClient } from '@/lib/supabase/admin'
import { romeToday } from '@/lib/lab-bank'
import { loadLabReconciliations } from '@/lib/lab-reconciliations-load'
import { matchingPlan } from '@/lib/lab-matching'
export const dynamic = 'force-dynamic'
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v)
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
async function authorize() { await requireEconomicsAdmin(); return requireLabAdmin() }
export async function GET(request: Request) {
  try { await authorize() } catch { return json({ message: 'Accesso non consentito.' }, 403) }
  const p = new URL(request.url).searchParams, edit = p.get('edit') ?? undefined, adopt = p.get('adopt') ?? undefined, movement = p.get('movement') ?? undefined
  if (edit && !uuid(edit) || adopt && !uuid(adopt) || movement && !uuid(movement)) return json({ message: 'Riferimento non valido.' }, 400)
  try { return json(await loadLabReconciliations(romeToday(), edit, adopt, movement)) }
  catch (error) { return json({ message: error instanceof Error ? error.message : 'Fonti non disponibili.' }, 503) }
}
export async function POST(request: Request) {
  let actor: string
  try { actor = await authorize() } catch { return json({ message: 'Accesso non consentito.' }, 403) }
  try {
    const reader = request.body?.getReader(); if (!reader) return json({ message: 'Richiesta vuota.' }, 400)
    const chunks: Uint8Array[] = []; let size = 0
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 16000) { await reader.cancel(); return json({ message: 'Richiesta troppo grande.' }, 413) } chunks.push(part.value) }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const input = JSON.parse(new TextDecoder().decode(bytes))
    if (!uuid(input.command) || input.id != null && !uuid(input.id) || !Number.isInteger(input.version) || input.version < 0 || !['save', 'verify', 'cancel', 'unlink_legacy'].includes(input.operation) || typeof input.note !== 'string' || input.note.length > 1000 || input.adoptMovement != null && !uuid(input.adoptMovement)) return json({ message: 'Richiesta non valida.' }, 400)
    const intent = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const client = createActorClient(actor)
    const { data: prior, error: replayError } = await client.from('bank_invoice_reconciliation_events').select('actor_id,request,after_snapshot').eq('id', input.command).maybeSingle()
    if (replayError) return json({ message: 'Il registro raccordi non è attivo o non è disponibile. Nessun salvataggio eseguito.' }, 503)
    if (prior) return prior.actor_id === actor && prior.request?.intent === intent ? json({ saved: prior.after_snapshot }) : json({ message: 'Richiesta già usata con contenuto diverso.' }, 409)
    const data = await loadLabReconciliations(romeToday(), input.version > 0 ? input.id : undefined, input.adoptMovement ?? undefined)
    if (!data.ready) return json({ message: data.setupMessage }, 503)
    if (data.basis !== input.basis) return json({ message: 'I dati sono cambiati. Ricarica le fonti e controlla le quote prima di confermare.' }, 409)
    if (input.version > 0 && data.version !== input.version) return json({ message: 'Il raccordo è stato aggiornato. Ricarica il registro.' }, 409)
    let pairs: ReturnType<typeof matchingPlan>['pairs'] = []
    if (input.operation === 'save') {
      if (!Array.isArray(input.movements) || !Array.isArray(input.invoices) || !input.movements.every(uuid) || !input.invoices.every(uuid) || input.movements.length > 50 || input.invoices.length > 50) return json({ message: 'Selezione non valida.' }, 400)
      const plan = matchingPlan(data.movements, data.invoices, input.movements, input.invoices)
      if (plan.issues.length) return json({ message: plan.issues[0] }, 400)
      pairs = plan.pairs
    } else if (input.operation !== 'unlink_legacy' && (!input.id || input.version < 1)) return json({ message: 'Raccordo non selezionato.' }, 400)
    const payload = { movements: input.movements ?? [], invoices: input.invoices ?? [], pairs, note: input.note, adoptMovement: data.adoptMovement, adoptInvoice: data.adoptInvoice, intent }
    const { data: saved, error } = await createActorClient(actor).rpc('save_bank_invoice_reconciliation', { p_id: input.id ?? input.command, p_version: input.version, p_command: input.command, p_operation: input.operation, p_payload: payload })
    if (error) return json({ message: error.code === 'PGRST202' ? 'Attivazione del registro raccordi da completare sul database.' : error.message }, error.code === 'PGRST202' ? 503 : 409)
    for (const path of ['/lab', '/lab/banca', '/lab/fatturazione', '/lab/verifiche', '/lab/raccordi', '/lab/abbina', '/lab/conto-economico', '/lab/iva']) revalidatePath(path)
    return json({ saved })
  } catch { return json({ message: 'Salvataggio non completato. Nessuna modifica parziale: ricarica e riprova.' }, 400) }
}

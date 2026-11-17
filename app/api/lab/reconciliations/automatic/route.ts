import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin } from '@/lib/economics-guard'
import { requireLabAdmin } from '@/lib/lab-guard'
import { createActorClient } from '@/lib/supabase/admin'
import { loadLabReconciliations } from '@/lib/lab-reconciliations-load'
import { certainReconciliationPairs } from '@/lib/lab-match-suggestions'
import { romeToday } from '@/lib/lab-bank'
export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v)
const pairCommand = (batch: string, movement: string, invoice: string) => { const h = createHash('sha256').update(`${batch}:${movement}:${invoice}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}` }
export async function POST(request: Request) {
  let actor: string
  try { await requireEconomicsAdmin(); actor = await requireLabAdmin() } catch { return json({ message: 'Accesso non consentito.' }, 403) }
  try {
    const reader = request.body?.getReader(); if (!reader) return json({ message: 'Richiesta vuota.' }, 400)
    const pieces: Uint8Array[] = []; let size = 0
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 2000) { await reader.cancel(); return json({ message: 'Richiesta troppo grande.' }, 413) } pieces.push(value) }
    const bytes = new Uint8Array(size); let pos = 0; for (const part of pieces) { bytes.set(part, pos); pos += part.length }
    const input = JSON.parse(new TextDecoder().decode(bytes))
    if (!uuid(input.command) || typeof input.basis !== 'string' || !/^[a-f0-9]{64}$/.test(input.basis)) return json({ message: 'Richiesta non valida.' }, 400)
    const first = await loadLabReconciliations(romeToday())
    if (!first.ready) return json({ message: first.setupMessage, saved: 0 }, 503)
    const client = createActorClient(actor), intent = createHash('sha256').update(`${input.command}:${input.basis}`).digest('hex')
    const { data: prior, error: priorError } = await client.from('bank_invoice_reconciliation_events').select('actor_id,request').contains('request', { batch: input.command })
    if (priorError) return json({ message: 'Storico non disponibile. Nessun raccordo automatico avviato.' }, 503)
    if (prior?.length) return prior.every(p => p.actor_id === actor && p.request?.batchIntent === intent) ? json({ saved: prior.length, skipped: 0, replay: true, message: 'Raccordi del tentativo precedente già registrati; fonti ricaricate.' }) : json({ message: 'Richiesta già usata con contenuto diverso.' }, 409)
    if (first.basis !== input.basis) return json({ message: 'Le fonti sono cambiate. Ricarica e controlla le proposte aggiornate.' }, 409)
    const planned = certainReconciliationPairs(first.movements, first.invoices), selected = planned.slice(0, 20)
    let saved = 0, skipped = 0, failure: string | null = null
    for (const pair of selected) {
      try {
        const fresh = await loadLabReconciliations(romeToday())
        const still = certainReconciliationPairs(fresh.movements, fresh.invoices).find(p => p.movementId === pair.movementId && p.documentId === pair.documentId && p.amount === pair.amount)
        if (!fresh.ready || !still) { skipped++; continue }
        const command = pairCommand(input.command, pair.movementId, pair.documentId)
        const note = 'Raccordo automatico univoco: importo intero, soggetto riconosciuto, stessa valuta e verso, data entro 14 giorni; nessuna alternativa ammissibile. Da verificare sulle fonti.'
        const payload = { movements: [pair.movementId], invoices: [pair.documentId], pairs: [{ movementId: pair.movementId, documentId: pair.documentId, amount: pair.amount }], note, batch: input.command, batchIntent: intent }
        const { error } = await client.rpc('save_bank_invoice_reconciliation', { p_id: command, p_version: 0, p_command: command, p_operation: 'save', p_payload: payload })
        if (error) { failure = error.message; break }
        saved++
      } catch { failure = 'Una fonte non è più disponibile. Gli altri raccordi non sono stati avviati.'; break }
    }
    for (const path of ['/lab/raccordi', '/lab/banca', '/lab/fatturazione', '/lab/verifiche', '/lab/conto-economico', '/lab/iva']) revalidatePath(path)
    return json({ saved, skipped, remaining: Math.max(0, planned.length - saved - skipped), failure, message: `${saved} raccordi salvati · ${skipped} non più univoci. Ogni raccordo è atomico; l’intero gruppo non è una singola transazione.${failure ? ' Operazione interrotta: controlla il registro prima di continuare.' : ''}` })
  } catch { return json({ message: 'Controllo non completato. Ricarica il registro prima di riprovare.' }, 503) }
}

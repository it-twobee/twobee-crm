import { requireLabAdmin } from '@/lib/lab-guard'
import { requireEconomicsAdmin } from '@/lib/economics-guard'
import { archiveUuid } from '@/lib/archived-invoice'
import { readArchivedInvoicePdf } from '@/lib/lab-invoice-archive'
import { GROQ_DOCUMENT_MODEL } from '@/lib/ai/model'
import { invoiceExtractionPrompt, verifyInvoiceExtraction } from '@/lib/invoice-extraction'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const active = new Set<string>()

/** Il testo lo estrae il browser dall'originale (pdfjs, lo stesso della lettura locale): sul server non serve nessun parser PDF nativo. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let actor: string
  try { actor = await requireLabAdmin(); await requireEconomicsAdmin() }
  catch { return Response.json({ message: 'Accesso non consentito.' }, { status: 403, headers }) }
  if (!archiveUuid.test(params.id)) return Response.json({ message: 'Documento non valido.' }, { status: 400, headers })
  if (!process.env.GROQ_API_KEY) return Response.json({ message: 'Lettura AI non configurata. La lettura locale e la verifica sul PDF restano disponibili.' }, { status: 503, headers })
  if (active.has(actor)) return Response.json({ message: 'Una lettura AI è già in corso. Attendi il risultato.' }, { status: 429, headers })
  active.add(actor)
  try {
    let body: { text?: unknown; pages?: unknown }
    try { body = await request.json() } catch { return Response.json({ message: 'Richiesta non valida.' }, { status: 400, headers }) }
    const text = typeof body.text === 'string' ? body.text : ''
    const pages = Number.isInteger(body.pages) ? Number(body.pages) : 0
    if (pages < 1 || pages > 20) return Response.json({ message: 'Il PDF supera 20 pagine: separa i documenti prima della lettura, senza perdere pagine.' }, { status: 422, headers })
    if (text.trim().length < 60) return Response.json({ message: 'PDF scansionato o senza testo: la lettura AI richiede un PDF con testo. Compila singolarmente dal documento.' }, { status: 422, headers })
    if (text.length > 20000) return Response.json({ message: 'Documento troppo esteso per una lettura unica: separalo prima di acquisire.' }, { status: 422, headers })
    const file = await readArchivedInvoicePdf(params.id)
    if (!file) return Response.json({ message: 'PDF non disponibile.' }, { status: 404, headers })
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.any([request.signal, AbortSignal.timeout(60000)]),
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GROQ_DOCUMENT_MODEL, temperature: 0, max_completion_tokens: 4000,
        response_format: { type: 'json_object' }, messages: [{ role: 'system', content: invoiceExtractionPrompt }, { role: 'user', content: text }] }),
    })
    if (!response.ok) return Response.json({ message: response.status === 429 ? 'AI temporaneamente occupata: riprova fra poco. Nessun dato acquisito.' : 'Lettura AI non disponibile. Nessun dato acquisito.' }, { status: 503, headers })
    const result = await response.json()
    if (result.choices?.[0]?.finish_reason !== 'stop') return Response.json({ message: 'Lettura AI incompleta: riprova o controlla il documento singolarmente.' }, { status: 422, headers })
    const verified = verifyInvoiceExtraction(JSON.parse(result.choices[0].message.content), text)
    return Response.json({ ...verified, pages, method: 'AI sul testo estratto dall’originale nel browser', needsReview: true }, { headers })
  } catch {
    return Response.json({ message: 'Il documento non è leggibile o la risposta AI non è valida. Nessun dato acquisito.' }, { status: 422, headers })
  } finally { active.delete(actor) }
}

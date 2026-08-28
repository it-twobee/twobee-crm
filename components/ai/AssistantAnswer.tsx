'use client'

import { parseAnswer, type Span } from '@/lib/ai/format'

/**
 * La risposta dell'assistente, resa leggibile in una colonna stretta.
 *
 * Il modello risponde in Markdown e prima qui c'era un `whitespace-pre-wrap`:
 * la prima domanda vera è tornata con una tabella a cinque colonne e a schermo
 * si leggeva `|--------|-------|`. Una tabella in 420px non si può salvare
 * mettendola in `overflow-x`: si legge scorrendo, cioè non si legge. Quindi la
 * si ribalta — una riga per cosa, il titolo sopra e il resto sotto in piccolo.
 */
function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) =>
        s.bold
          ? <strong key={i} className="font-semibold text-text-primary">{s.text}</strong>
          : <span key={i}>{s.text}</span>,
      )}
    </>
  )
}

export function AssistantAnswer({ text }: { text: string }) {
  const blocks = parseAnswer(text)

  // Se non c'è niente da formattare non si inventa un blocco vuoto: meglio il
  // testo così com'è che una risposta che sparisce.
  if (!blocks.length) {
    return <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{text}</p>
  }

  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (b.kind === 'p') {
          return (
            <p key={i} className="text-sm text-text-secondary leading-relaxed">
              <Spans spans={b.spans} />
            </p>
          )
        }
        if (b.kind === 'ul') {
          return (
            <ul key={i} className="space-y-1">
              {b.items.map((item, j) => (
                <li key={j} className="text-sm text-text-secondary leading-relaxed flex gap-2">
                  <span className="text-gold-text shrink-0" aria-hidden="true">·</span>
                  <span className="min-w-0"><Spans spans={item} /></span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <div key={i} className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            {b.rows.map((r, j) => (
              <div key={j} className="px-3 py-2">
                <div className="text-2xs font-semibold text-text-primary leading-snug break-words">
                  <Spans spans={r.title} />
                </div>
                {!!r.meta.length && (
                  <div className="mt-0.5 text-2xs text-text-tertiary leading-snug break-words">
                    {r.meta.join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

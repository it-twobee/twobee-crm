'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Globe, ChevronDown, ChevronUp } from 'lucide-react'
import { runSiteCheck, getCheckHistory, type SiteCheckOutcome } from '@/app/actions/tracking'
import { statusByValue, CHANNELS, GSC_CHANNEL } from '@/lib/tracking/vocab'
import type { TrackingCheck, TrackingChange } from '@/lib/types/database'
import { Card, Chip, GoldButton, Notice, fmtDate } from './ui'

const FIELD_LABEL: Record<string, string> = Object.fromEntries(
  [...CHANNELS, GSC_CHANNEL].map(c => [`status_${c.key}`, c.label]),
)

function ChangeLine({ c }: { c: TrackingChange }) {
  const from = statusByValue(c.from), to = statusByValue(c.to)
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-text-primary">{FIELD_LABEL[c.field] ?? c.field}</span>
      {from && <Chip tone={from.tone}>{from.label}</Chip>}
      <span className="text-text-tertiary">→</span>
      {to && <Chip tone={to.tone}>{to.label}</Chip>}
      <span className="text-2xs text-text-tertiary">{c.reason}</span>
    </li>
  )
}

/**
 * «Verifica ora» legge l'HTML della homepage: GTM sta sempre nel sorgente,
 * gli altri tag spesso no (li inietta GTM). Quindi GTM può salire e scendere,
 * gli altri solo salire; il resto sono note, non modifiche.
 */
export function SiteCheckSection({ clientId, website, onChanged }: { clientId: string; website: string; onChanged: () => void }) {
  const [outcome, setOutcome] = useState<SiteCheckOutcome | null>(null)
  const [history, setHistory] = useState<TrackingCheck[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [pending, start] = useTransition()

  const reloadHistory = useCallback(async () => {
    const res = await getCheckHistory(clientId, 10)
    if (res.ok) setHistory(res.data)
  }, [clientId])

  useEffect(() => { reloadHistory() }, [reloadHistory])

  const verify = () => start(async () => {
    const res = await runSiteCheck(clientId)
    if (!res.ok) { toast.error(res.error); return }
    setOutcome(res.data)
    reloadHistory()
    if (res.data.changes.length) onChanged()
    toast.success(res.data.ok ? 'Verifica completata' : 'Sito non raggiungibile')
  })

  const last = history[0]

  return (
    <Card title="Verifica automatica" hint="Scarica la homepage e cerca gli snippet nel sorgente. Serve solo l'URL, nessuna credenziale."
      aside={<GoldButton small onClick={verify} pending={pending} disabled={!website}><Globe className="w-3.5 h-3.5" /> Verifica ora</GoldButton>}>
      {!website && <Notice tone="warning">Inserisci l&apos;URL del sito nella configurazione qui sopra.</Notice>}

      {outcome && (
        <div className="space-y-3 mb-4">
          <div className="flex flex-wrap items-center gap-2 text-2xs text-text-tertiary">
            <Chip tone={outcome.ok ? 'success' : 'error'}>{outcome.ok ? `HTTP ${outcome.httpStatus}` : 'non raggiungibile'}</Chip>
            <span className="font-mono truncate max-w-full">{outcome.url}</span>
            {outcome.ok && <span>{Math.round(outcome.bytes / 1024)} KB · {outcome.durationMs} ms</span>}
          </div>
          {outcome.error && <Notice tone="error">{outcome.error}</Notice>}
          {outcome.ok && (
            <div className="flex flex-wrap gap-2">
              <Found label="GTM" ids={outcome.found.gtmIds} />
              <Found label="GA4" ids={outcome.found.ga4Ids} extra={outcome.found.gtagLoaded ? 'gtag.js' : null} />
              <Found label="Meta Pixel" ids={outcome.found.metaIds} extra={outcome.found.fbevents ? 'fbevents.js' : null} />
              <Found label="Klaviyo" ids={outcome.found.klaviyo ? ['script'] : []} />
            </div>
          )}
          {outcome.changes.length > 0 && (
            <div>
              <p className="text-2xs font-semibold text-text-secondary mb-1">Stati aggiornati</p>
              <ul className="space-y-1">{outcome.changes.map((c, i) => <ChangeLine key={i} c={c} />)}</ul>
            </div>
          )}
          {outcome.ok && outcome.changes.length === 0 && <p className="text-2xs text-text-tertiary">Nessuno stato da cambiare.</p>}
          {outcome.notes.length > 0 && (
            <ul className="space-y-1">{outcome.notes.map((n, i) => <li key={i}><Notice tone="muted">{n}</Notice></li>)}</ul>
          )}
        </div>
      )}

      {!outcome && last && (
        <p className="text-2xs text-text-tertiary mb-2">
          Ultima verifica {fmtDate(last.checked_at)}: {last.ok ? `HTTP ${last.http_status}` : last.error ?? 'errore'}
          {last.changes.length ? ` · ${last.changes.length} stati aggiornati` : ''}
        </p>
      )}
      {!outcome && !last && <p className="text-2xs text-text-tertiary mb-2">Mai verificato.</p>}

      {history.length > 0 && (
        <div>
          <button onClick={() => setShowHistory(v => !v)} className="text-2xs font-semibold text-text-secondary hover:text-text-primary inline-flex items-center gap-1">
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Storico ({history.length})
          </button>
          {showHistory && (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-2xs">
                <thead><tr className="text-text-tertiary text-left">
                  <th className="py-1 pr-3 font-semibold">Quando</th><th className="py-1 pr-3 font-semibold">Esito</th>
                  <th className="py-1 pr-3 font-semibold">GTM</th><th className="py-1 pr-3 font-semibold">GA4</th>
                  <th className="py-1 pr-3 font-semibold">Meta</th><th className="py-1 pr-3 font-semibold">Klaviyo</th><th className="py-1 font-semibold">Modifiche</th>
                </tr></thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} className="border-t border-border text-text-secondary">
                      <td className="py-1 pr-3 whitespace-nowrap">{fmtDate(h.checked_at)}</td>
                      <td className="py-1 pr-3">{h.ok ? h.http_status : <span className="text-error">{h.error ?? 'errore'}</span>}</td>
                      <td className="py-1 pr-3 font-mono">{h.gtm_ids.join(', ') || '—'}</td>
                      <td className="py-1 pr-3 font-mono">{h.ga4_ids.join(', ') || '—'}</td>
                      <td className="py-1 pr-3 font-mono">{h.meta_ids.join(', ') || '—'}</td>
                      <td className="py-1 pr-3">{h.klaviyo ? 'sì' : '—'}</td>
                      <td className="py-1">{h.changes.length || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function Found({ label, ids, extra }: { label: string; ids: string[]; extra?: string | null }) {
  const hit = ids.length > 0 || !!extra
  return (
    <Chip tone={hit ? 'success' : 'muted'} title={ids.join(', ')}>
      {label}: {ids.length ? ids.join(', ') : extra ?? 'non trovato'}
    </Chip>
  )
}

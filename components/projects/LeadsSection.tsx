'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Copy, RefreshCw, Check, Link2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  listLeads, listIntegrations, ensureWebFormIntegration, updateLeadStatus,
  type LeadRow, type Integration,
} from '@/app/actions/integrations'

/**
 * Raccolta lead di un progetto Growth con focus lead generation (§ richiesta
 * utente): i contatti da form del sito, landing page, Meta Ads e Google Ads
 * confluiscono tutti in `lead_contacts` e si vedono qui, distinti per fonte.
 *
 * Oggi è collegato il form web. Meta e Google si innestano sulla stessa lista
 * quando le rispettive integrazioni saranno attive: nessuna schermata nuova,
 * cambia solo il valore di `source`.
 */

const SOURCE_LABEL: Record<string, string> = {
  meta_ads: 'Meta Ads', google_ads: 'Google Ads', website: 'Sito / Landing',
  organic: 'Organico', whatsapp: 'WhatsApp', email: 'Email',
  referral: 'Passaparola', other: 'Altro',
}

const SOURCE_STYLE: Record<string, string> = {
  meta_ads: 'bg-info-dim text-info',
  google_ads: 'bg-warning-dim text-warning',
  website: 'bg-success-dim text-success',
}

const STATUS: { value: string; label: string }[] = [
  { value: 'nuovo', label: 'Nuovo' },
  { value: 'contattato', label: 'Contattato' },
  { value: 'qualificato', label: 'Qualificato' },
  { value: 'in_trattativa', label: 'In trattativa' },
  { value: 'convertito', label: 'Convertito' },
  { value: 'perso', label: 'Perso' },
]

const PROVIDER_LABEL: Record<string, string> = {
  web_form: 'Form sito / landing', meta_ads: 'Meta Ads',
  google_ads: 'Google Ads', shopify: 'Shopify',
}

export function LeadsSection({ clientId, projectId, canEdit }: {
  clientId: string; projectId: string; canEdit: boolean
}) {
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('tutte')

  const load = useCallback(async () => {
    setLoading(true)
    const [l, i] = await Promise.all([
      listLeads(clientId, projectId),
      listIntegrations(clientId, projectId),
    ])
    if (!l.ok) toast.error(l.error ?? 'Errore lead')
    setLeads(l.leads)
    setIntegrations(i.integrations)
    setLoading(false)
  }, [clientId, projectId])

  useEffect(() => { load() }, [load])

  const webForm = integrations.find(i => i.provider === 'web_form')

  const connect = async (rotate = false) => {
    setBusy(true)
    const res = await ensureWebFormIntegration(clientId, projectId, { rotate })
    setBusy(false)
    if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
    setUrl(res.url)
    toast.success(rotate ? 'Nuovo indirizzo generato: il precedente non funziona più' : 'Collegamento pronto')
    load()
  }

  const copy = async () => {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const visible = sourceFilter === 'tutte' ? leads : leads.filter(l => l.source === sourceFilter)
  const sources = Array.from(new Set(leads.map(l => l.source).filter(Boolean))) as string[]
  const nuovi = leads.filter(l => l.status === 'nuovo').length
  const convertiti = leads.filter(l => l.status === 'convertito').length
  const convRate = leads.length > 0 ? Math.round((convertiti / leads.length) * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary py-10 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Lead totali" value={String(leads.length)} hint="Ultimi 200" />
        <Stat label="Da contattare" value={String(nuovi)} hint="Stato «nuovo»"
          accent={nuovi > 0 ? 'text-warning' : undefined} />
        <Stat label="Convertiti" value={String(convertiti)} hint="Diventati clienti" accent="text-success" />
        <Stat label="Tasso conversione" value={`${convRate}%`} hint="Su tutti i lead" />
      </div>

      {/* Collegamenti */}
      <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-bold text-text-primary">Raccolta lead</p>
            <p className="text-2xs text-text-tertiary mt-0.5">
              Form del sito e landing page scrivono qui. Meta Ads e Google Ads si
              aggiungeranno alla stessa lista.
            </p>
          </div>
          {canEdit && (
            <button onClick={() => connect(false)} disabled={busy}
              className="flex items-center gap-1.5 bg-gold text-on-gold text-sm font-semibold px-3 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              {webForm ? 'Mostra indirizzo' : 'Collega il form'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {(['web_form', 'meta_ads', 'google_ads'] as const).map(p => {
            const it = integrations.find(i => i.provider === p)
            const ok = it?.status === 'attiva' && it.is_active
            return (
              <span key={p} className={`text-2xs font-semibold px-2 py-1 rounded-lg border ${
                ok ? 'border-success/30 bg-success-dim text-success'
                   : it ? 'border-border bg-background text-text-secondary'
                        : 'border-border bg-background text-text-tertiary'
              }`}>
                {PROVIDER_LABEL[p]} · {ok ? 'attivo' : it ? (it.status === 'errore' ? 'errore' : 'da configurare') : 'non collegato'}
              </span>
            )
          })}
        </div>

        {webForm?.last_error && (
          <p className="text-2xs text-error flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" /> {webForm.last_error}
          </p>
        )}

        {url && (
          <div className="space-y-2">
            <p className="text-2xs text-text-tertiary">
              Indirizzo a cui il form deve inviare i dati (metodo POST). Campi riconosciuti:
              <span className="font-mono"> nome, email, telefono</span> — il resto viene conservato comunque.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 text-2xs bg-background border border-border rounded-lg px-3 py-2 text-text-secondary overflow-x-auto whitespace-nowrap">
                {url}
              </code>
              <button onClick={copy} aria-label="Copia indirizzo"
                className="p-2 rounded-lg border border-border text-text-secondary hover:text-text-primary transition-colors shrink-0">
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </button>
              {canEdit && (
                <button onClick={() => connect(true)} disabled={busy} aria-label="Genera un nuovo indirizzo"
                  className="p-2 rounded-lg border border-border text-text-secondary hover:text-warning transition-colors shrink-0">
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-2xs text-text-tertiary">
              Chi ha questo indirizzo può registrare lead su questo cliente. Se finisce
              dove non doveva, rigeneralo: il precedente smette di funzionare subito.
            </p>
          </div>
        )}
      </div>

      {/* Filtri fonte */}
      {sources.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {['tutte', ...sources].map(s => (
            <button key={s} onClick={() => setSourceFilter(s)}
              className={`text-2xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                sourceFilter === s ? 'bg-surface-active text-text-primary border-border-strong'
                  : 'bg-transparent text-text-secondary border-border hover:text-text-primary'
              }`}>
              {s === 'tutte' ? 'Tutte le fonti' : (SOURCE_LABEL[s] ?? s)}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <p className="text-sm text-text-secondary">Nessun lead.</p>
          <p className="text-2xs text-text-tertiary mt-1">
            {webForm ? 'Collega il form alla landing e i contatti compariranno qui.' : 'Collega il form per iniziare a raccoglierli.'}
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-2xs text-text-tertiary">
                <th className="text-left font-semibold px-4 py-3">Contatto</th>
                <th className="text-left font-semibold px-4 py-3">Fonte</th>
                <th className="text-left font-semibold px-4 py-3">Ricevuto</th>
                <th className="text-left font-semibold px-4 py-3">Stato</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(l => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="text-text-primary">{l.full_name ?? '—'}</p>
                    <p className="text-2xs text-text-tertiary">
                      {[l.email, l.phone].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded ${
                      SOURCE_STYLE[l.source ?? ''] ?? 'bg-surface-active text-text-secondary'
                    }`}>
                      {SOURCE_LABEL[l.source ?? ''] ?? l.source ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-2xs text-text-secondary whitespace-nowrap">
                    {new Date(l.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <select value={l.status}
                        onChange={async e => {
                          const res = await updateLeadStatus(l.id, clientId, e.target.value)
                          if (!res.ok) { toast.error(res.error ?? 'Errore'); return }
                          load()
                        }}
                        aria-label={`Stato di ${l.full_name ?? 'lead'}`}
                        className="text-2xs bg-background border border-border rounded-lg px-2 py-1 text-text-secondary">
                        {STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    ) : (
                      <span className="text-2xs text-text-secondary">
                        {STATUS.find(s => s.value === l.status)?.label ?? l.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, hint, accent = 'text-text-primary' }: {
  label: string; value: string; hint: string; accent?: string
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <p className="text-2xs text-text-tertiary">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${accent}`}>{value}</p>
      <p className="text-2xs text-text-tertiary mt-0.5">{hint}</p>
    </div>
  )
}

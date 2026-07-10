'use client'

import { useState } from 'react'
import { Sparkles, Loader2, Check, X, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

export interface PrefillField { key: string; label: string }

// Componente riutilizzabile per l'AI Prefill (addendum §16):
// l'AI suggerisce → l'utente vede/modifica → applica → il form padre salva.
// Non salva mai da sé: chiama onApply(valori) col solo dei campi confermati.
export function AIPrefillPanel({ entityType, entityId, fields, context, onApply, label = 'Compila con AI' }: {
  entityType: string
  entityId?: string
  fields: PrefillField[]
  context?: Record<string, unknown>
  onApply: (values: Record<string, string>) => void
  label?: string
}) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [draft, setDraft]     = useState<Record<string, string> | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [sources, setSources] = useState<string[]>([])

  const generate = async () => {
    setLoading(true); setDraft(null)
    try {
      const res = await fetch('/api/ai/prefill', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, mode: 'suggest', context, fieldsRequested: fields.map(f => f.key) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore AI')
      const s = data.suggestions ?? {}
      // Tiene solo i campi richiesti e non vuoti
      const values: Record<string, string> = {}
      for (const f of fields) if (s[f.key]?.toString().trim()) values[f.key] = String(s[f.key])
      if (Object.keys(values).length === 0) { toast.error('L\'AI non ha trovato dati sufficienti'); setLoading(false); return }
      setDraft(values); setMissing(data.missing_data ?? []); setSources(data.sources_used ?? []); setOpen(true)
    } catch (e) { toast.error((e as Error).message) } finally { setLoading(false) }
  }

  const apply = () => {
    if (draft) onApply(draft)
    setOpen(false); setDraft(null)
    toast.success('Suggerimenti applicati — controlla e salva')
  }

  return (
    <>
      <button type="button" onClick={generate} disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-gold-text bg-gold/10 hover:bg-gold/20 disabled:opacity-50 transition-colors">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {label}
      </button>

      {open && draft && (
        <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border sticky top-0 bg-surface">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-gold-text" />
                <span className="text-sm font-bold text-text-primary">Suggerimenti AI</span>
                {sources.length > 0 && <span className="text-2xs text-text-tertiary">da {sources.join(', ')}</span>}
              </div>
              <button onClick={() => setOpen(false)}><X className="w-4 h-4 text-text-secondary" /></button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-2xs text-text-tertiary">Rivedi e modifica prima di applicare. Nulla viene salvato finché non confermi il form.</p>

              {missing.length > 0 && (
                <div className="flex items-start gap-2 bg-warning/10 border border-warning/25 rounded-lg px-3 py-2 text-2xs text-warning">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Dati non trovati: {missing.join(', ')}</span>
                </div>
              )}

              {fields.filter(f => draft[f.key] !== undefined).map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-text-secondary mb-1">{f.label}</label>
                  <textarea value={draft[f.key]} onChange={e => setDraft(d => ({ ...(d ?? {}), [f.key]: e.target.value }))}
                    rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold resize-none" />
                </div>
              ))}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setOpen(false)} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary">Annulla</button>
                <button onClick={apply} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gold text-on-gold font-bold rounded-lg text-sm">
                  <Check className="w-4 h-4" /> Applica al form
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

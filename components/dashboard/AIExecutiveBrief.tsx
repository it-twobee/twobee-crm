'use client'
import { useState, useCallback } from 'react'
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react'
import { generateExecutiveBrief } from '@/app/actions/executive-brief'

export function AIExecutiveBrief() {
  const [brief, setBrief]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await generateExecutiveBrief()
      if (result.error) throw new Error(result.error)
      setBrief(result.brief)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="p-3 h-full flex flex-col gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-gold-text" />
        <p className="text-2xs flex-1 text-text-tertiary">Brief esecutivo AI — 3 righe, dati reali dal DB</p>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs font-bold transition-all bg-gold-dim border border-gold/25 text-gold-text hover:bg-gold/15 disabled:opacity-60">
          {loading
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <RefreshCw className="w-3 h-3" />}
          {brief ? 'Aggiorna' : 'Genera brief'}
        </button>
      </div>

      {error && (
        <p className="text-2xs px-2 text-error">{error}</p>
      )}

      {!brief && !loading && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <Sparkles className="w-7 h-7 text-text-tertiary opacity-50" />
          <p className="text-2xs text-text-tertiary">
            Clicca &quot;Genera brief&quot; per l&apos;analisi AI dell&apos;azienda
          </p>
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-text-tertiary">
            <Loader2 className="w-4 h-4 animate-spin" />
            <p className="text-2xs">Analisi dati reali in corso...</p>
          </div>
        </div>
      )}

      {brief && !loading && (
        <div className="flex-1 overflow-auto">
          <pre className="text-2xs leading-relaxed whitespace-pre-wrap font-sans text-text-secondary">
            {brief}
          </pre>
        </div>
      )}
    </div>
  )
}

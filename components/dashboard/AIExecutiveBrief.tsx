'use client'
import { useState, useCallback } from 'react'
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react'
import type { AIContext } from './AIDashboardChat'
import type { FinancialSummary } from './FinancialControl'

interface Props {
  context: AIContext
  financialSummary: FinancialSummary
  pulseRaw: {
    dealsTotal: number; dealsActive: number; dealsWon: number
    tasksTotal: number; tasksDone: number
    ticketsOpen: number; ticketsResolved: number
    okrProgress: number
  }
}

export function AIExecutiveBrief({ context, financialSummary, pulseRaw }: Props) {
  const [brief, setBrief]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/executive-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, financialSummary, pulseRaw }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore API')
      setBrief(data.brief)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [context, financialSummary, pulseRaw])

  return (
    <div className="p-3 h-full flex flex-col gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <Sparkles className="w-3.5 h-3.5" style={{ color: '#F5C800' }} />
        <p className="text-[10px] flex-1" style={{ color: '#333' }}>Brief narrativo generato da AI — sintetico e azionabile</p>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
          style={{
            background: 'rgba(245,200,0,0.08)',
            border: '1px solid rgba(245,200,0,0.2)',
            color: '#F5C800',
            opacity: loading ? 0.6 : 1,
          }}>
          {loading
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <RefreshCw className="w-3 h-3" />}
          {brief ? 'Aggiorna' : 'Genera brief'}
        </button>
      </div>

      {error && (
        <p className="text-[10px] px-2" style={{ color: '#EF4444' }}>{error}</p>
      )}

      {!brief && !loading && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <Sparkles className="w-7 h-7" style={{ color: '#1A1A1A' }} />
          <p className="text-[10px]" style={{ color: '#2A2A2A' }}>
            Clicca &quot;Genera brief&quot; per l&apos;analisi AI dell&apos;azienda
          </p>
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2" style={{ color: '#333' }}>
            <Loader2 className="w-4 h-4 animate-spin" />
            <p className="text-[10px]">Analisi in corso...</p>
          </div>
        </div>
      )}

      {brief && !loading && (
        <div className="flex-1 overflow-auto">
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-sans" style={{ color: '#888' }}>
            {brief}
          </pre>
        </div>
      )}
    </div>
  )
}

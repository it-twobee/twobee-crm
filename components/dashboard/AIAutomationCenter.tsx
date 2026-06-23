'use client'

import { useEffect, useState } from 'react'
import { Cpu, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface AiLog {
  id: string
  created_at: string
  call_type: string
  latency_ms: number | null
  success: boolean
  tokens_used: number | null
}

const CALL_LABELS: Record<string, string> = {
  'extract-project':  'Estrai Progetto',
  'extract-meeting':  'Estrai Riunione',
  'sprint-plan':      'Sprint Plan',
  'kpi-precompile':   'KPI Precompile',
  'executive-brief':  'Executive Brief',
  'project-summary':  'Project Summary',
  'generate-plan':    'Generate Plan',
  'sprint-report':    'Sprint Report',
  'dashboard-chat':   'AI Chat',
}

const CALL_COLORS: Record<string, string> = {
  'extract-project': '#3B82F6',
  'extract-meeting': '#8B5CF6',
  'sprint-plan':     '#F59E0B',
  'kpi-precompile':  '#22C55E',
  'executive-brief': '#F5C800',
  'project-summary': '#14B8A6',
  'generate-plan':   '#EF4444',
  'sprint-report':   '#F59E0B',
  'dashboard-chat':  '#A855F7',
}

const HOURS_SAVED: Record<string, number> = {
  'extract-project': 0.5,
  'extract-meeting': 0.33,
  'sprint-plan':     0.75,
  'kpi-precompile':  0.25,
  'executive-brief': 0.5,
  'project-summary': 0.25,
  'generate-plan':   0.5,
  'sprint-report':   0.33,
  'dashboard-chat':  0.1,
}

const AUTOMATIONS = [
  'Estrazione dati progetto da briefing/trascrizione',
  'Riassunto riunione con azioni e decisioni',
  'Sprint planning AI con selezione task',
  'KPI precompilati per settore e ambizione',
  'Executive brief narrativo per direzione',
  'Sommario progetto per report cliente',
]

export function AIAutomationCenter() {
  const [logs, setLogs] = useState<AiLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    createClient()
      .from('ai_logs')
      .select('id,created_at,call_type,latency_ms,success,tokens_used')
      .order('created_at', { ascending: false })
      .limit(25)
      .then(({ data }) => { setLogs((data ?? []) as AiLog[]); setLoading(false) })
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const todayCount = logs.filter(l => l.created_at.startsWith(today)).length
  const successes  = logs.filter(l => l.success)
  const avgLatency = successes.length
    ? Math.round(successes.reduce((s, l) => s + (l.latency_ms ?? 0), 0) / successes.length)
    : 0
  const successRate = logs.length ? Math.round((successes.length / logs.length) * 100) : 100
  const hoursSaved  = Math.round(logs.reduce((s, l) => s + (HOURS_SAVED[l.call_type] ?? 0.2), 0) * 10) / 10

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-[#1A1A1A]">
        <Cpu className="w-4 h-4 text-[#A855F7]" />
        <span className="text-xs font-black text-white uppercase tracking-widest">AI & Automation Center</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-4 gap-2 p-3">
          {([
            { label: 'Oggi',       value: todayCount,   unit: 'call', color: '#F5C800' },
            { label: 'Latenza',    value: avgLatency,   unit: 'ms',   color: '#22C55E' },
            { label: 'Successo',   value: successRate,  unit: '%',    color: '#3B82F6' },
            { label: 'Risparmio',  value: hoursSaved,   unit: 'h',    color: '#A855F7' },
          ] as const).map(s => (
            <div key={s.label} className="bg-[#0D0D0D] rounded-xl p-2 text-center border border-[#1A1A1A]">
              <p className="text-[9px] text-[#444] uppercase tracking-wider mb-0.5">{s.label}</p>
              <p className="text-lg font-black leading-none" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[9px] text-[#333] mt-0.5">{s.unit}</p>
            </div>
          ))}
        </div>

        <div className="px-3 pb-3">
          <p className="text-[9px] font-bold text-[#333] uppercase tracking-widest mb-2">Ultime chiamate Groq</p>
          {loading ? (
            <div className="text-center py-8 text-[11px] text-[#333]">Caricamento…</div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2 bg-[#0D0D0D] rounded-xl border border-[#1A1A1A]">
              <Cpu className="w-6 h-6 text-[#2A2A2A]" />
              <p className="text-[11px] text-[#444]">Nessun log ancora</p>
              <p className="text-[10px] text-[#333]">Appariranno dopo la prima chiamata AI</p>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map(log => {
                const color = CALL_COLORS[log.call_type] ?? '#888'
                const label = CALL_LABELS[log.call_type] ?? log.call_type
                const dt = new Date(log.created_at)
                const stamp = dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) +
                  ' ' + dt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={log.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#0D0D0D] border border-[#1A1A1A]">
                    {log.success
                      ? <CheckCircle2 className="w-3 h-3 shrink-0 text-[#22C55E]" />
                      : <XCircle     className="w-3 h-3 shrink-0 text-[#EF4444]" />}
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: color + '18', color }}>
                      {label}
                    </span>
                    <span className="flex-1" />
                    {log.latency_ms != null && (
                      <span className="flex items-center gap-0.5 text-[9px] text-[#555] shrink-0">
                        <Clock className="w-2.5 h-2.5" />{log.latency_ms}ms
                      </span>
                    )}
                    <span className="text-[9px] text-[#2A2A2A] shrink-0">{stamp}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-3 pb-4">
          <p className="text-[9px] font-bold text-[#333] uppercase tracking-widest mb-2">Automazioni attive</p>
          <div className="space-y-1">
            {AUTOMATIONS.map(label => (
              <div key={label}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#0D0D0D] border border-[#1A1A1A]">
                <Zap className="w-3 h-3 shrink-0 text-[#22C55E]" />
                <span className="text-[10px] text-[#666] flex-1">{label}</span>
                <span className="text-[9px] font-bold text-[#22C55E]">ON</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

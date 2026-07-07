'use client'

import { useState, useEffect } from 'react'
import { ArrowRightLeft, Check, X, Loader2, Sparkles, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface BridgeEvent {
  id: string
  source_message_id: string
  source_channel_id: string
  target_channel_id: string
  status: 'pending' | 'accepted' | 'declined'
  ai_summary: string | null
  created_at: string
  message?: { content: string; sender?: { full_name: string } | null }
}

type BridgeMessage = {
  id: string
  content: string
  sender: { full_name: string } | null
}

export function ChatBridgeWidget({ internalChannelId, customerCareChannelId }: {
  internalChannelId: string
  customerCareChannelId: string
}) {
  const [events, setEvents] = useState<BridgeEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    loadEvents()
    const sb = createClient()
    const sub = sb.channel(`bridge-${internalChannelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_bridge_events',
        filter: `target_channel_id=eq.${internalChannelId}`,
      }, () => loadEvents())
      .subscribe()
    return () => { sb.removeChannel(sub) }
  }, [internalChannelId])

  const loadEvents = async () => {
    const sb = createClient()
    const { data } = await sb.from('chat_bridge_events')
      .select('*')
      .eq('target_channel_id', internalChannelId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20)

    const bridgeEvents = (data ?? []) as unknown as BridgeEvent[]
    if (!bridgeEvents.length) { setEvents([]); setLoading(false); return }

    const msgIds = bridgeEvents.map(e => e.source_message_id)
    const { data: msgs } = await sb.from('chat_messages')
      .select('id, content, sender:profiles!chat_messages_sender_id_fkey(full_name)')
      .in('id', msgIds)

    const messages = (msgs ?? []) as unknown as BridgeMessage[]
    const msgMap = new Map(messages.map(m => [m.id, m]))
    const enriched = bridgeEvents.map(e => ({
      ...e,
      message: msgMap.get(e.source_message_id) ?? undefined,
    }))
    setEvents(enriched)
    setLoading(false)
  }

  const handleAction = async (eventId: string, action: 'accepted' | 'declined') => {
    setActing(eventId)
    const sb = createClient()

    if (action === 'accepted') {
      const ev = events.find(e => e.id === eventId)
      if (ev?.message) {
        let summary = ev.message.content
        try {
          const res = await fetch('/api/ai/prefill', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entityType: 'chat_summary', mode: 'summarize',
              context: { message: ev.message.content, sender: ev.message.sender?.full_name ?? 'Cliente' },
            }),
          })
          const data = await res.json()
          if (res.ok && data.suggestions?.summary) summary = data.suggestions.summary
        } catch { /* fallback to original content */ }

        await sb.from('chat_messages').insert({
          channel_id: internalChannelId,
          content: `📨 **Messaggio dal cliente** (${ev.message.sender?.full_name ?? 'Cliente'}):\n${summary}`,
          sender_id: (await sb.auth.getUser()).data.user?.id,
        })

        await sb.from('chat_bridge_events')
          .update({ status: 'accepted', ai_summary: summary, handled_by: (await sb.auth.getUser()).data.user?.id, handled_at: new Date().toISOString() })
          .eq('id', eventId)
      }
    } else {
      await sb.from('chat_bridge_events')
        .update({ status: 'declined', handled_by: (await sb.auth.getUser()).data.user?.id, handled_at: new Date().toISOString() })
        .eq('id', eventId)
    }

    setActing(null)
    setEvents(p => p.filter(e => e.id !== eventId))
    toast.success(action === 'accepted' ? 'Messaggio condiviso nel canale' : 'Messaggio rifiutato')
  }

  if (loading || events.length === 0) return null

  return (
    <div className="mx-3 mb-3">
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl overflow-hidden">
        <button onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-blue-400">
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span>{events.length} messaggi dal cliente in attesa</span>
          <MessageSquare className="w-3 h-3 ml-auto" />
        </button>

        {!collapsed && (
          <div className="px-3 pb-3 space-y-2">
            {events.map(ev => (
              <div key={ev.id} className="bg-[#111] border border-[#2A2A2A] rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[9px] font-bold text-blue-400 shrink-0 mt-0.5">
                    {(ev.message?.sender?.full_name ?? 'C')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-blue-400 font-semibold">{ev.message?.sender?.full_name ?? 'Cliente'}</p>
                    <p className="text-xs text-white mt-0.5 line-clamp-3">{ev.message?.content ?? '(messaggio)'}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAction(ev.id, 'accepted')} disabled={acting === ev.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-500/10 text-green-400 text-[10px] font-bold rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50">
                    {acting === ev.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Condividi <Sparkles className="w-2.5 h-2.5" />
                  </button>
                  <button onClick={() => handleAction(ev.id, 'declined')} disabled={acting === ev.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 text-red-400 text-[10px] font-bold rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50">
                    <X className="w-3 h-3" /> Ignora
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

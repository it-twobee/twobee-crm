'use client'

import Link from 'next/link'
import { timeAgo, getInitials } from '@/lib/utils'
import type { ChatMessageWithSender, ChatChannel } from '@/lib/types/database'

interface RecentMessage extends ChatMessageWithSender {
  channel: Pick<ChatChannel, 'id' | 'name' | 'type'> | null
}

interface RecentMessagesProps {
  messages: RecentMessage[]
}

export function RecentMessages({ messages }: RecentMessagesProps) {
  return (
    <div className="bg-surface border border-[#2A2A2A] rounded-card">
      <div className="px-5 py-4 border-b border-[#2A2A2A] flex items-center justify-between">
        <h2 className="font-bold text-white">Ultimi Messaggi</h2>
        <Link href="/chat" className="text-xs text-gold hover:underline">
          Apri chat →
        </Link>
      </div>
      <div className="divide-y divide-[#2A2A2A]">
        {messages.length === 0 && (
          <div className="px-5 py-8 text-center text-text-secondary text-sm">
            Nessun messaggio non letto
          </div>
        )}
        {messages.slice(0, 5).map((msg) => (
          <Link
            key={msg.id}
            href={`/chat?channel=${msg.channel_id}`}
            className="flex items-start gap-3 px-5 py-3.5 hover:bg-white/3 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold text-xs font-bold shrink-0 mt-0.5">
              {msg.sender ? getInitials(msg.sender.full_name) : '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-white">
                  {msg.sender?.full_name ?? 'Utente'}
                </span>
                {msg.channel && (
                  <span className="text-xs text-text-secondary">
                    #{msg.channel.name}
                  </span>
                )}
                <span className="text-xs text-text-secondary ml-auto">
                  {timeAgo(msg.created_at)}
                </span>
              </div>
              <p className="text-xs text-text-secondary truncate">{msg.content}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

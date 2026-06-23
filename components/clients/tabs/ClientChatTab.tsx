'use client'

import { useState, useEffect } from 'react'
import { Loader2, Headphones, Lock, Archive } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SlackChat } from '@/components/chat/SlackChat'
import { isSuperAdmin } from '@/lib/permissions'
import type { Client, Profile } from '@/lib/types/database'

interface Props {
  client: Client
  currentProfile: Profile
  allProfiles: Profile[]
}

function toSlug(s: string) {
  return s.toLowerCase()
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export function ClientChatTab({ client, currentProfile, allProfiles }: Props) {
  const [ccChannelId, setCcChannelId] = useState<string | null>(null)
  const [internalChannelId, setInternalChannelId] = useState<string | null>(null)
  const [activeChat, setActiveChat] = useState<'cc' | 'internal'>('cc')
  const [loading, setLoading] = useState(true)
  const isPerso = client.client_label === 'perso'
  const isAdmin = isSuperAdmin(currentProfile)

  useEffect(() => { initChannels() }, [client.id])

  const initChannels = async () => {
    setLoading(true)
    const sb = createClient()
    const base = toSlug(client.company_name)

    const { data: existing } = await sb
      .from('chat_channels')
      .select('id, type')
      .eq('client_id', client.id)
      .in('type', ['customer_care', 'cliente', 'cliente_interno'])

    let ccId = existing?.find(c => c.type === 'customer_care' || c.type === 'cliente')?.id ?? null
    let internalId = existing?.find(c => c.type === 'cliente_interno')?.id ?? null

    if (!isPerso) {
      if (!ccId) {
        const { data } = await sb.from('chat_channels')
          .insert({ name: `cc-${base}`, type: 'customer_care', client_id: client.id, created_by: currentProfile.id })
          .select('id').single()
        if (data) {
          ccId = data.id
          await sb.from('channel_members').insert({ channel_id: ccId, profile_id: currentProfile.id })
        }
      }
      if (!internalId) {
        const { data } = await sb.from('chat_channels')
          .insert({ name: `team-${base}`, type: 'cliente_interno', client_id: client.id, created_by: currentProfile.id })
          .select('id').single()
        if (data) {
          internalId = data.id
          await sb.from('channel_members').insert({ channel_id: internalId, profile_id: currentProfile.id })
        }
      }

      // Assicura membership
      for (const chId of [ccId, internalId].filter(Boolean) as string[]) {
        await sb.from('channel_members').upsert(
          { channel_id: chId, profile_id: currentProfile.id, last_read_at: new Date().toISOString() },
          { onConflict: 'channel_id,profile_id', ignoreDuplicates: true }
        )
      }
    }

    setCcChannelId(ccId)
    setInternalChannelId(internalId)
    setLoading(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-gold animate-spin" />
    </div>
  )

  const activeChannelId = activeChat === 'cc' ? ccChannelId : internalChannelId
  const activeType = activeChat === 'cc' ? 'customer_care' : 'cliente_interno'

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[520px]">

      {/* Banner archiviato */}
      {isPerso && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-error/10 border-b border-error/20 shrink-0">
          <Archive className="w-4 h-4 text-error shrink-0" />
          <span className="text-sm text-error font-semibold">Cliente perso</span>
          <span className="text-xs text-text-secondary">— canali archiviati, solo lettura</span>
        </div>
      )}

      {/* Toggle interno / customer care */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 shrink-0">
        <button
          onClick={() => setActiveChat('cc')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-sm font-semibold border-b-2 transition-colors
            ${activeChat === 'cc'
              ? 'text-gold border-gold bg-gold/5'
              : 'text-text-secondary border-transparent hover:text-white hover:bg-white/[0.03]'}`}
        >
          <Headphones className="w-3.5 h-3.5" />
          Customer Care
          <span className="text-[10px] font-normal opacity-60">team + cliente</span>
        </button>
        <button
          onClick={() => setActiveChat('internal')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-sm font-semibold border-b-2 transition-colors
            ${activeChat === 'internal'
              ? 'text-white border-white/30 bg-white/[0.03]'
              : 'text-text-secondary border-transparent hover:text-white hover:bg-white/[0.03]'}`}
        >
          <Lock className="w-3.5 h-3.5" />
          Interno team
          <span className="text-[10px] font-normal opacity-60">solo team + sub</span>
        </button>
      </div>

      {/* Chat */}
      <div className="flex-1 min-h-0 border-t border-[#2A2A2A]">
        {activeChannelId ? (
          <SlackChat
            key={activeChannelId}
            channelId={activeChannelId}
            channelName={activeChat === 'cc' ? `cc-${toSlug(client.company_name)}` : `team-${toSlug(client.company_name)}`}
            channelType={activeType}
            currentProfile={currentProfile}
            allProfiles={allProfiles}
            isAdmin={isAdmin}
            isArchived={isPerso}
            isReadOnly={isPerso && !isAdmin}
            clientId={client.id}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            Canale non disponibile
          </div>
        )}
      </div>
    </div>
  )
}

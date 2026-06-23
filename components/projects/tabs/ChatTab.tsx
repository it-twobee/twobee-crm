'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import { SlackChat } from '@/components/chat/SlackChat'
import { ensureProjectChannels } from '@/app/actions/project-channels'

export function ProjectChatSection({ projectId, clientId, projectName, currentProfile, allProfiles, isAdmin, accent }: {
  projectId: string; clientId: string; projectName: string
  currentProfile: Profile; allProfiles: Profile[]; isAdmin: boolean; accent: string
}) {
  const [chatTab, setChatTab] = useState<'customer_care' | 'cliente_interno'>('cliente_interno')
  const [channels, setChannels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ensureProjectChannels(projectId, clientId, projectName)
      .then(map => { setChannels(map); setLoading(false) })
      .catch(() => setLoading(false))
  }, [projectId])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-text-secondary">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Caricamento chat…
    </div>
  )

  const channelId = channels[chatTab]

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      <div className="flex gap-1 mb-3 bg-[#0C0C0C] border border-[#2A2A2A] rounded-xl p-1 w-fit">
        {(['cliente_interno', 'customer_care'] as const).map(t => (
          <button key={t} onClick={() => setChatTab(t)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${chatTab === t
              ? t === 'cliente_interno' ? 'text-black' : 'bg-blue-500 text-white'
              : 'text-text-secondary hover:text-white'}`}
            style={chatTab === t && t === 'cliente_interno' ? { background: accent } : undefined}>
            {t === 'cliente_interno' ? '🔒 Team interno' : '👤 Cliente'}
          </button>
        ))}
      </div>
      {channelId ? (
        <div className="flex-1 min-h-0 border border-[#2A2A2A] rounded-xl overflow-hidden">
          <SlackChat
            key={channelId}
            channelId={channelId}
            channelName={chatTab === 'cliente_interno' ? `${projectName} — Team` : `${projectName} — Cliente`}
            channelType={chatTab}
            currentProfile={currentProfile}
            allProfiles={allProfiles}
            isAdmin={isAdmin}
            clientId={clientId}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center h-40 text-text-secondary text-sm">Canale non disponibile</div>
      )}
    </div>
  )
}

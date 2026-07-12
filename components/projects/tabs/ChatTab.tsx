'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import { SlackChat } from '@/components/chat/SlackChat'
import { ensureProjectChannels } from '@/app/actions/project-channels'

// §21 (v1.0): l'unica chat è quella del Customer Care, cioè il canale col cliente.
// La chat interna di progetto (`cliente_interno`) non ha più una superficie: il canale
// e i messaggi restano nel DB — deprecati, non cancellati. Niente DM, niente #best-ideas.
export function ProjectChatSection({ projectId, clientId, projectName, currentProfile, allProfiles, isAdmin }: {
  projectId: string; clientId: string; projectName: string
  currentProfile: Profile; allProfiles: Profile[]; isAdmin: boolean; accent: string
}) {
  const [channels, setChannels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ensureProjectChannels(projectId, clientId, projectName)
      .then(map => { setChannels(map); setLoading(false) })
      .catch(() => setLoading(false))
  }, [projectId, clientId, projectName])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-text-secondary">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Caricamento chat…
    </div>
  )

  const channelId = channels['customer_care']

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      {channelId ? (
        <div className="flex-1 min-h-0 border border-border rounded-xl overflow-hidden">
          <SlackChat
            key={channelId}
            channelId={channelId}
            channelName={`${projectName} — Cliente`}
            channelType="customer_care"
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

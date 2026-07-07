import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FolderOpen, FileText, ExternalLink } from 'lucide-react'
import { isDriveUrl } from '@/lib/drive'
import type { Document } from '@/lib/types/database'

export const revalidate = 0

export default async function RisorsaDocumentiPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  // RLS documents_resource_own: documenti dei progetti dove ho task, o caricati da me
  const { data } = await sb.from('documents').select('*').order('created_at', { ascending: false })
  const docs = (data ?? []) as Document[]

  return (
    <div className="max-w-4xl mx-auto px-5 py-6 space-y-4">
      <h1 className="text-xl font-black text-white">Documenti</h1>
      <p className="text-[#444] text-xs -mt-2">Materiali dei progetti su cui lavori e file che hai caricato.</p>

      {docs.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[#1A1A1A] rounded-2xl">
          <FolderOpen className="w-8 h-8 text-[#1A1A1A] mx-auto mb-3" />
          <p className="text-[#555] text-sm">Nessun documento disponibile.</p>
          <p className="text-[#333] text-xs mt-1">Qui troverai i materiali condivisi per i tuoi progetti.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(d => (
            <div key={d.id} className="flex items-center gap-3 bg-[#0D0D0D] border border-[#1A1A1A] rounded-xl px-4 py-3">
              <FileText className="w-4 h-4 text-[#444] shrink-0" />
              <span className="flex-1 text-sm text-white truncate">{d.name}</span>
              <span className="text-[9px] text-[#444] shrink-0">{new Date(d.created_at).toLocaleDateString('it-IT')}</span>
              <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] font-bold text-[#F5C800] hover:text-yellow-400 shrink-0">
                {isDriveUrl(d.file_url) ? 'Apri in Drive' : 'Apri'} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

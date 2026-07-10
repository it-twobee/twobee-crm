'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Check, AlertCircle, ChevronDown, Loader2, Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface AsanaWorkspace {
  gid: string
  name: string
}

interface AsanaProject {
  gid: string
  name: string
}

interface LocalProject {
  id: string
  name: string
  client_id: string
  clients?: { company_name: string }
}

export function AsanaSync() {
  const [workspaces, setWorkspaces] = useState<AsanaWorkspace[]>([])
  const [projects, setProjects] = useState<AsanaProject[]>([])
  const [localProjects, setLocalProjects] = useState<LocalProject[]>([])
  const [selectedWorkspace, setSelectedWorkspace] = useState('')
  const [selectedAsanaProject, setSelectedAsanaProject] = useState('')
  const [selectedLocalProject, setSelectedLocalProject] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true)
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; total: number } | null>(null)

  // Load Asana workspaces
  useEffect(() => {
    fetch('/api/asana/workspaces')
      .then((r) => r.json())
      .then(({ workspaces: ws, error }) => {
        if (error) { toast.error('Asana: ' + error); return }
        setWorkspaces(ws ?? [])
        if (ws?.length === 1) setSelectedWorkspace(ws[0].gid)
      })
      .finally(() => setLoadingWorkspaces(false))
  }, [])

  // Load local projects
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('projects')
        .select('id, name, client_id, clients(company_name)')
        .order('name')
      setLocalProjects((data ?? []) as unknown as LocalProject[])
    }
    load()
  }, [])

  // Load Asana projects when workspace changes
  useEffect(() => {
    if (!selectedWorkspace) return
    fetch(`/api/asana/projects?workspace=${selectedWorkspace}`)
      .then((r) => r.json())
      .then(({ projects: ps, error }) => {
        if (error) { toast.error('Asana: ' + error); return }
        setProjects(ps ?? [])
      })
  }, [selectedWorkspace])

  const runSync = async () => {
    if (!selectedAsanaProject || !selectedLocalProject) {
      toast.error('Seleziona un progetto Asana e un progetto locale')
      return
    }
    setLoading(true)
    setSyncResult(null)
    const res = await fetch('/api/asana/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectGid: selectedAsanaProject, localProjectId: selectedLocalProject }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.error) { toast.error('Errore sync: ' + data.error); return }
    setSyncResult(data)
    toast.success(`Sync completata! ${data.created} nuove, ${data.updated} aggiornate`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 bg-[#F06A35]/20 border border-[#F06A35]/40 rounded-lg flex items-center justify-center">
          <Link2 className="w-5 h-5 text-[#F06A35]" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-text-primary">Asana Sync</h3>
          <p className="text-xs text-text-secondary">Importa e sincronizza task da Asana nel gestionale</p>
        </div>
        <span className="ml-auto text-xs bg-success/20 text-success px-2 py-0.5 rounded font-semibold">Connesso</span>
      </div>

      {loadingWorkspaces ? (
        <div className="flex items-center gap-2 text-text-secondary text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Caricamento workspace Asana...
        </div>
      ) : workspaces.length === 0 ? (
        <div className="flex items-center gap-2 text-error text-sm">
          <AlertCircle className="w-4 h-4" /> Nessun workspace trovato. Verifica il token Asana.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Step 1: Workspace */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">1. Workspace Asana</label>
            <select
              value={selectedWorkspace}
              onChange={(e) => { setSelectedWorkspace(e.target.value); setProjects([]); setSelectedAsanaProject('') }}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold"
            >
              <option value="">Seleziona workspace...</option>
              {workspaces.map((w) => <option key={w.gid} value={w.gid}>{w.name}</option>)}
            </select>
          </div>

          {/* Step 2: Asana project */}
          {selectedWorkspace && (
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">2. Progetto Asana da sincronizzare</label>
              <select
                value={selectedAsanaProject}
                onChange={(e) => setSelectedAsanaProject(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold"
              >
                <option value="">Seleziona progetto Asana...</option>
                {projects.map((p) => <option key={p.gid} value={p.gid}>{p.name}</option>)}
              </select>
            </div>
          )}

          {/* Step 3: Local project */}
          {selectedAsanaProject && (
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">3. Progetto locale destinazione</label>
              <select
                value={selectedLocalProject}
                onChange={(e) => setSelectedLocalProject(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold"
              >
                <option value="">Seleziona progetto locale...</option>
                {localProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.clients as { company_name: string } | undefined)?.company_name} — {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sync button */}
          {selectedAsanaProject && selectedLocalProject && (
            <button
              onClick={runSync}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-gold text-on-gold font-bold rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loading ? 'Sincronizzazione...' : 'Sincronizza Task'}
            </button>
          )}

          {/* Result */}
          {syncResult && (
            <div className="bg-success/10 border border-success/30 rounded-lg p-4 flex items-start gap-3">
              <Check className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-text-primary">Sync completata con successo</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {syncResult.total} task totali · {syncResult.created} nuove importate · {syncResult.updated} aggiornate
                </p>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="bg-background border border-border rounded-lg p-3 text-xs text-text-secondary space-y-1">
            <p className="font-semibold text-text-primary mb-1">Come funziona la sync:</p>
            <p>• I task Asana vengono importati nel progetto locale selezionato</p>
            <p>• Le sync successive aggiornano i task esistenti (non duplicano)</p>
            <p>• Il collegamento avviene tramite ID Asana (asana_gid)</p>
            <p>• I task completati in Asana vengono marcati "completato" qui</p>
          </div>
        </div>
      )}
    </div>
  )
}

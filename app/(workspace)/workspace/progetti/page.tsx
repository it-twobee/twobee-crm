import { redirect } from 'next/navigation'

// Fase 3a (§9): "Progetti attivi" è confluito nel Workload (vista centrale dei
// progetti in parallelo). La lista vive in WorkloadClient (vista Progetti).
// Redirect additivo: il dettaglio /workspace/progetti/[projectId] resta attivo.
// WorkspaceProjectsClient è mantenuto nel repo per eventuale rollback.
export default function WorkspaceProgettiPage() {
  redirect('/workspace/workload')
}

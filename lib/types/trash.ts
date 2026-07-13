// Tipo condiviso per il Cestino task. Fuori dal file 'use server' (che può
// esportare solo funzioni async).
export interface TrashedTask {
  id: string
  title: string | null
  status: string | null
  deleted_at: string | null
  project_name: string | null
  deleted_by_name: string | null
}

const ASANA_BASE = 'https://app.asana.com/api/1.0'
const PAT = process.env.ASANA_PAT

function headers() {
  return {
    Authorization: `Bearer ${PAT}`,
    'Content-Type': 'application/json',
  }
}

export interface AsanaWorkspace {
  gid: string
  name: string
}

export interface AsanaProject {
  gid: string
  name: string
  workspace: { gid: string }
  color?: string
}

export interface AsanaTask {
  gid: string
  name: string
  notes: string
  completed: boolean
  due_on: string | null
  assignee: { gid: string; name: string } | null
  memberships: { project: { gid: string; name: string } }[]
  created_at: string
  modified_at: string
}

export async function getWorkspaces(): Promise<AsanaWorkspace[]> {
  const res = await fetch(`${ASANA_BASE}/workspaces`, { headers: headers() })
  if (!res.ok) throw new Error(`Asana error: ${res.status}`)
  const { data } = await res.json()
  return data
}

export async function getProjects(workspaceGid: string): Promise<AsanaProject[]> {
  const res = await fetch(`${ASANA_BASE}/workspaces/${workspaceGid}/projects?opt_fields=gid,name,color`, { headers: headers() })
  if (!res.ok) throw new Error(`Asana error: ${res.status}`)
  const { data } = await res.json()
  return data
}

export async function getTasksForProject(projectGid: string): Promise<AsanaTask[]> {
  const fields = 'gid,name,notes,completed,due_on,assignee.name,memberships.project.name,created_at,modified_at'
  const res = await fetch(`${ASANA_BASE}/projects/${projectGid}/tasks?opt_fields=${fields}&limit=100`, { headers: headers() })
  if (!res.ok) throw new Error(`Asana error: ${res.status}`)
  const { data } = await res.json()
  return data
}

export async function createAsanaTask(projectGid: string, task: {
  name: string
  notes?: string
  due_on?: string | null
}): Promise<AsanaTask> {
  const res = await fetch(`${ASANA_BASE}/tasks`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      data: {
        name: task.name,
        notes: task.notes ?? '',
        due_on: task.due_on ?? null,
        projects: [projectGid],
      },
    }),
  })
  if (!res.ok) throw new Error(`Asana error: ${res.status}`)
  const { data } = await res.json()
  return data
}

export async function updateAsanaTask(taskGid: string, fields: {
  name?: string
  notes?: string
  completed?: boolean
  due_on?: string | null
}): Promise<void> {
  await fetch(`${ASANA_BASE}/tasks/${taskGid}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ data: fields }),
  })
}

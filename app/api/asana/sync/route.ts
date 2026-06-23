import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTasksForProject } from '@/lib/asana'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function asanaStatusToLocal(completed: boolean): string {
  return completed ? 'completato' : 'da_fare'
}

export async function POST(req: Request) {
  try {
    const { projectGid, localProjectId } = await req.json()
    if (!projectGid || !localProjectId) {
      return NextResponse.json({ error: 'projectGid e localProjectId richiesti' }, { status: 400 })
    }

    const asanaTasks = await getTasksForProject(projectGid)

    let created = 0
    let updated = 0

    for (const at of asanaTasks) {
      // Check if task already linked via asana_gid in metadata
      const { data: existing } = await supabaseAdmin
        .from('tasks')
        .select('id, title, status')
        .eq('project_id', localProjectId)
        .eq('asana_gid', at.gid)
        .maybeSingle()

      if (existing) {
        // Update if changed
        await supabaseAdmin.from('tasks').update({
          title: at.name,
          description: at.notes || null,
          status: asanaStatusToLocal(at.completed),
          due_date: at.due_on ?? null,
        }).eq('id', existing.id)
        updated++
      } else {
        await supabaseAdmin.from('tasks').insert({
          title: at.name,
          description: at.notes || null,
          status: asanaStatusToLocal(at.completed),
          due_date: at.due_on ?? null,
          project_id: localProjectId,
          priority: 'media',
          asana_gid: at.gid,
        })
        created++
      }
    }

    return NextResponse.json({ ok: true, created, updated, total: asanaTasks.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

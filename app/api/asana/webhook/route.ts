import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Asana sends a handshake with X-Hook-Secret on first call
export async function POST(req: NextRequest) {
  const hookSecret = req.headers.get('x-hook-secret')
  if (hookSecret) {
    // Handshake: echo back the secret
    return new NextResponse(null, {
      status: 200,
      headers: { 'X-Hook-Secret': hookSecret },
    })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await req.json()
  const events = body.events ?? []

  for (const event of events) {
    if (event.resource?.resource_type !== 'task') continue
    const gid = event.resource?.gid
    if (!gid) continue

    if (event.action === 'deleted') {
      await supabase.from('tasks').delete().eq('asana_gid', gid)
      continue
    }

    // Fetch latest task data from Asana
    const taskRes = await fetch(`https://app.asana.com/api/1.0/tasks/${gid}?opt_fields=name,completed,due_on,notes`, {
      headers: { Authorization: `Bearer ${process.env.ASANA_PAT}` },
    })
    if (!taskRes.ok) continue
    const { data: asanaTask } = await taskRes.json()

    const STATUS = asanaTask.completed ? 'completato' : 'in_corso'

    await supabase.from('tasks').update({
      title: asanaTask.name,
      status: STATUS,
      due_date: asanaTask.due_on ?? null,
      notes: asanaTask.notes ?? null,
    }).eq('asana_gid', gid)
  }

  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { getProjects } from '@/lib/asana'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const workspace = searchParams.get('workspace')
  if (!workspace) return NextResponse.json({ error: 'workspace param required' }, { status: 400 })
  try {
    const projects = await getProjects(workspace)
    return NextResponse.json({ projects })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

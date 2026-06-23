import { NextResponse } from 'next/server'
import { getWorkspaces } from '@/lib/asana'

export async function GET() {
  try {
    const workspaces = await getWorkspaces()
    return NextResponse.json({ workspaces })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

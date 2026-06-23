import { NextRequest, NextResponse } from 'next/server'
import { syncTaskToAsana } from '@/lib/sync'

export async function POST(req: NextRequest) {
  const body = await req.json()
  await syncTaskToAsana(body)
  return NextResponse.json({ ok: true })
}

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSessionProfile } from '@/lib/auth'
import { zipStore } from '@/lib/zip-store'

export const dynamic = 'force-dynamic'

/* §477 — l'estensione della sfida LinkedIn, zippata al volo dalla cartella in
   `public/`: una copia sola dei sorgenti, niente zip committato che invecchia. */
export async function GET() {
  const profile = await getSessionProfile()
  if (!profile || (profile.role !== 'admin' && profile.role !== 'team')) return new Response('Non autorizzato', { status: 401 })
  const dir = join(process.cwd(), 'public', 'estensione-linkedin')
  const file = readdirSync(dir).filter(f => !f.startsWith('.')).sort()
    .map(f => ({ name: `twobee-sfida-linkedin/${f}`, data: new Uint8Array(readFileSync(join(dir, f))) }))
  return new Response(zipStore(file), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="twobee-sfida-linkedin.zip"',
      'Cache-Control': 'no-store',
    },
  })
}

import { NextResponse, type NextRequest } from 'next/server'
import { basePubblica, metadatiRisorsa } from '@/lib/mcp/risorsa'

/* §493 — servita anche a `/.well-known/oauth-protected-resource[/api/mcp]`
   (rewrite in next.config.mjs). Pubblica di proposito: è la prima cosa che
   Claude legge, prima di avere un token, e non contiene dati. */
export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  return NextResponse.json(
    metadatiRisorsa(basePubblica(req.nextUrl.origin), process.env.NEXT_PUBLIC_SUPABASE_URL!),
    { headers: { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' } },
  )
}

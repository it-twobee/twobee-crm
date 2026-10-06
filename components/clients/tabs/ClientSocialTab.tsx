'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { getSocialBoard } from '@/app/actions/social'
import { SocialBoard, type SocialViewer } from '@/components/social/SocialBoard'
import { meseDi } from '@/lib/social'
import { oggiLocale } from '@/lib/calendario-lavorativo'
import type { SocialBoardData } from '@/lib/social-types'

/* §467 — La tab Social della scheda cliente: lo stesso calendario della
   sezione, su un'azienda sola. I dati arrivano da un'azione, come Tracking:
   una scheda che non si guarda non pesa sul primo carico. */
export function ClientSocialTab({ clientId, me, socialHref }: { clientId: string; me: SocialViewer; socialHref: string }) {
  const [mese, setMese] = useState(() => meseDi(oggiLocale()))
  const [data, setData] = useState<SocialBoardData | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const carica = useCallback(async (m: string) => {
    setLoading(true)
    const r = await getSocialBoard({ mese: m, clientId })
    setLoading(false)
    if (!r.ok) { setErrore(r.error); return }
    setErrore(null)
    setData(r.data)
  }, [clientId])

  useEffect(() => { carica(mese) }, [carica, mese])

  if (errore) return <p role="alert" className="rounded-lg bg-error-dim px-4 py-3 text-sm text-error">{errore}</p>
  if (!data) return <p className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" />Carico il calendario…</p>
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link href={socialHref} className="flex items-center gap-1 text-2xs font-semibold text-text-secondary hover:text-gold-text">
          Tutti i progetti social <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <SocialBoard key={clientId} data={data} me={me} fixedClientId={clientId} loading={loading}
        onMese={setMese} onChanged={() => carica(mese)} />
    </div>
  )
}

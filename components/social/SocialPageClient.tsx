'use client'

import { useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SocialBoard, type SocialViewer } from './SocialBoard'
import type { SocialBoardData } from '@/lib/social-types'

/** La pagina Social: il mese sta nell'indirizzo, così un link porta al mese giusto. */
export function SocialPageClient({ data, me }: { data: SocialBoardData; me: SocialViewer }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, start] = useTransition()
  return (
    <SocialBoard data={data} me={me} loading={pending}
      onMese={mese => start(() => router.push(`${pathname}?mese=${mese}`))}
      onChanged={() => start(() => router.refresh())} />
  )
}

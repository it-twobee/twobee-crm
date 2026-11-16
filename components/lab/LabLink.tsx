'use client'
import NextLink from 'next/link'
import type { ComponentProps } from 'react'
import { journeyHref } from '@/lib/lab-experience'
import { useLabJourney, useLabOriginAnchor } from '@/components/lab/LabJourney'

export default function LabLink({ href, originAnchor, ...props }: ComponentProps<typeof NextLink> & { originAnchor?: string }) {
  const journey = useLabJourney(), anchor = useLabOriginAnchor()
  const destination = journey && typeof href === 'string' ? journeyHref(href, journey.source, journey.origin, journey.month, originAnchor ?? anchor, journey.root) : href
  return <NextLink {...props} href={destination} />
}

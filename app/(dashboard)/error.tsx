'use client'

import { ErroreCaricamento } from '@/components/shared/ErroreCaricamento'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErroreCaricamento error={error} reset={reset} />
}

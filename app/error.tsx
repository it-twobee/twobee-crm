'use client'

import { ErroreCaricamento } from '@/components/shared/ErroreCaricamento'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErroreCaricamento error={error} reset={reset} title="Qualcosa è andato storto" />
}

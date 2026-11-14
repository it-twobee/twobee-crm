'use client'

import { useEffect } from 'react'
import { isChunkLoadError, recoverChunkOnce } from '@/lib/chunk-recovery'

function recover(error: unknown) {
  try {
    recoverChunkOnce(error, {
      version: process.env.BUILD_TIME || 'development',
      online: navigator.onLine !== false,
      storage: window.sessionStorage,
      reload: () => window.location.reload(),
    })
  } catch {
    // Alcuni browser negano anche l'accesso alla proprietà sessionStorage.
  }
}

export function useChunkRecovery(error: unknown): boolean {
  const chunk = isChunkLoadError(error)
  useEffect(() => { if (chunk) recover(error) }, [chunk, error])
  return chunk
}

export function RecuperoChunk() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => recover(event.error)
    const onRejection = (event: PromiseRejectionEvent) => recover(event.reason)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}

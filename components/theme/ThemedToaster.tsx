'use client'

import { Toaster } from 'sonner'
import { useTheme } from './ThemeProvider'

export function ThemedToaster() {
  const { theme } = useTheme()

  return (
    <Toaster
      theme={theme}
      toastOptions={{
        style: {
          background: 'var(--color-surface-hover)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--color-border-strong)',
          color: 'var(--color-text-primary)',
        },
      }}
    />
  )
}

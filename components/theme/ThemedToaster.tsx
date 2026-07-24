'use client'

import { Toaster } from 'sonner'
import { useTheme } from './ThemeProvider'

export function ThemedToaster() {
  const { theme } = useTheme()

  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--color-surface-hover)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--color-border-strong)',
          color: 'var(--color-text-primary)',
        },
        actionButtonStyle: {
          background: 'var(--color-gold)',
          color: 'var(--color-on-gold)',
          fontWeight: '600',
          borderRadius: '8px',
        },
      }}
    />
  )
}

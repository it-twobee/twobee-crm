'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className, collapsed = false }: { className?: string; collapsed?: boolean }) {
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'

  return (
    <button
      onClick={toggleTheme}
      title={isLight ? 'Passa al tema scuro' : 'Passa al tema chiaro'}
      className={cn(
        'flex items-center gap-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors rounded-lg',
        collapsed ? 'p-2 justify-center' : 'px-2.5 py-1.5',
        className,
      )}
    >
      {isLight ? <Moon className="w-4 h-4 shrink-0" /> : <Sun className="w-4 h-4 shrink-0" />}
      {!collapsed && <span className="text-xs font-medium">{isLight ? 'Tema scuro' : 'Tema chiaro'}</span>}
    </button>
  )
}

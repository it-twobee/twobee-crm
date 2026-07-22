'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ProjectWizard } from './ProjectWizard'

/**
 * Punto d'ingresso al wizard dove non c'è un "+ Crea" contestuale: dashboard,
 * "Le mie attività", pagina Progetti.
 *
 * Esiste per non riscrivere il flusso in ogni pagina: il wizard è uno solo (§6),
 * cambiano solo il pulsante e il cliente precompilato.
 */
export function NewProjectButton({
  clients, profiles, isAdmin, defaultClientId, label = 'Nuovo progetto', variant = 'primary',
}: {
  clients: { id: string; company_name: string }[]
  profiles: { id: string; full_name: string | null }[]
  isAdmin: boolean
  defaultClientId?: string
  label?: string
  variant?: 'primary' | 'ghost'
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)}
        className={
          variant === 'primary'
            ? 'flex items-center gap-1.5 px-3 py-2 bg-gold text-on-gold text-sm font-bold rounded-lg hover:opacity-90 transition-opacity'
            : 'flex items-center gap-1.5 px-3 py-2 border border-border text-text-secondary text-sm font-semibold rounded-lg hover:text-text-primary hover:border-border-strong transition-colors'
        }>
        <Plus className="w-4 h-4" aria-hidden="true" /> {label}
      </button>

      <ProjectWizard
        open={open}
        onClose={() => setOpen(false)}
        clients={clients}
        profiles={profiles}
        isAdmin={isAdmin}
        defaultClientId={defaultClientId}
      />
    </>
  )
}

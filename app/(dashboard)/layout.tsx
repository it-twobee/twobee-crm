import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getViewer } from '@/lib/auth'
import { Sidebar } from '@/components/shared/Sidebar'
import { Header } from '@/components/shared/Header'
import { AssistantLauncher } from '@/components/ai/AssistantLauncher'
import type { Profile } from '@/lib/types/database'
import { Suspense } from 'react'
import { NavMemory } from '@/components/shared/BackLink'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Identità e profilo in una lettura sola, riusata dalla pagina figlia.
  // `select('*')` portava anche monthly_cost fino all'Header, che è un client
  // component: il costo di una risorsa finiva nel browser di chi apriva il tool.
  const { user, profile, isWorkspace } = await getViewer()
  if (!user) redirect('/login')

  // Il gate non sta solo nel middleware: lì il ruolo è tenuto in memoria per
  // mezzo minuto, qui si rilegge dal database a ogni caricamento. Chi viene
  // retrocesso a workspace non entra nel tool admin nemmeno in quella finestra.
  // Il proprio profilo resta raggiungibile: è l'unica pagina di questo gruppo
  // che la sidebar del workspace linka, e il middleware la lascia passare.
  const pathname = (await headers()).get('x-pathname') ?? ''
  if (isWorkspace && pathname !== '/impostazioni/profilo') redirect('/workspace')

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header profile={profile as Profile | null} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <Suspense fallback={null}><NavMemory /></Suspense>
          {children}
        </main>
      </div>
      <AssistantLauncher surface="dashboard" userName={(profile as Profile | null)?.full_name ?? null} />
    </div>
  )
}

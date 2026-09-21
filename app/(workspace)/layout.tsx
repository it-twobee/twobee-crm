import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/auth'
import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar'
import { WorkspaceMobileNav } from '@/components/workspace/WorkspaceMobileNav'
import { Logo } from '@/components/shared/Logo'
import { PortalSwitcher } from '@/components/shared/PortalSwitcher'
import { QuickCreate } from '@/components/shared/QuickCreate'
import { HeaderActions } from '@/components/shared/HeaderActions'
import Link from 'next/link'
import { GlobalSearch } from '@/components/shared/GlobalSearch'
import { workspaceSearch } from '@/app/actions/global-search'
import { isAdminRole, isWorkspaceRole, canPreviewClientPortal } from '@/lib/permissions'
import { Suspense } from 'react'
import { NavMemory } from '@/components/shared/BackLink'
import { AssistantLauncher } from '@/components/ai/AssistantLauncher'
import { MessaggiTwoBee } from '@/components/workspace/MessaggiTwoBee'
import { giornoAzienda, leggiFatti, valida } from '@/lib/person-copy'
import { momentiDiOggi, OGNI_MINUTI } from '@/lib/popup-copy'
import { getSalesAccess } from '@/lib/sales-guard'
import type { AppRole } from '@/lib/types/database'
import { isPortalRole } from '@/lib/portal/model'

// group_key/group_order arrivano dalla migration 087: opzionali finché non è
// applicata, la sidebar ha un fallback per chiave.
type WorkspaceSectionRow = {
  id: string; key: string; label: string; route: string; icon: string; sort_order: number
  group_key?: string | null; group_order?: number | null
}

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  // getViewer è memoizzato per richiesta: la pagina figlia ricicla questa
  // lettura invece di richiedere identità e profilo una seconda volta.
  const { user, profile, isSuperAdmin } = await getViewer()
  if (!user) redirect('/login')
  if (isPortalRole(profile)) redirect('/portale')

  const isAdminLevel = isSuperAdmin || isAdminRole(profile?.app_role)
  const isWorkspaceUser = isWorkspaceRole(profile?.app_role)

  if (!profile || (!isWorkspaceUser && !isAdminLevel)) {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const oggiRoma = giornoAzienda()
  const [sectionsRes, permsRes, momentiRes, rosaRes] = await Promise.all([
    // `*` di proposito: group_key/group_order arrivano dalla 087 e un elenco
    // esplicito fallirebbe dove non fosse applicata. Sono quindici righe.
    supabase.from('workspace_sections').select('*').eq('is_active', true).order('sort_order'),
    isAdminLevel
      ? supabase.from('workspace_section_permissions').select('section_id, can_view').eq('can_view', true)
      : supabase.from('workspace_section_permissions').select('section_id, can_view').eq('app_role', profile.app_role),
    /* §366 — le righe di oggi: il saluto porta la fotografia dei fatti, i
       momenti portano i template. Una lettura sola, sulla chiave primaria, e
       la RLS lascia passare solo le proprie. */
    supabase.from('person_copy').select('chiave, template, fatti')
      .eq('profile_id', user.id).eq('giorno', oggiRoma),
    supabase.from('profiles').select('full_name').eq('is_active', true),
  ])

  /* I nomi di tutta l'azienda: servono al validatore per riconoscere un
     collega citato che con chi legge non condivide niente. */
  const rosa = ((rosaRes.data ?? []) as { full_name: string | null }[])
    .map(r => (r.full_name ?? '').split(' ')[0]).filter(Boolean)
  const righeCopy = (momentiRes.data ?? []) as { chiave: string; template: string; fatti: unknown }[]
  const fattiOggi = leggiFatti(righeCopy.find(r => r.chiave === 'saluto')?.fatti)
  const momenti = fattiOggi ? momentiDiOggi(righeCopy, fattiOggi, rosa, { valida }) : []

  let visibleSections: typeof sectionsRes.data
  if (isAdminLevel) {
    // Admin/super_admin vede tutte le sezioni attive
    visibleSections = sectionsRes.data ?? []
  } else {
    const permMap = new Map((permsRes.data ?? []).map((p: { section_id: string; can_view: boolean }) => [p.section_id, p.can_view]))
    visibleSections = (sectionsRes.data ?? []).filter((s: { id: string }) => permMap.get(s.id) === true)

    /* §211 — le sezioni personali non passano dai permessi.
       La 079 ha seminato i permessi per manager, senior, junior, stage e
       freelance: `partner` è arrivato dopo e `viewer` non c'è mai stato, quindi
       entravano nel portale e trovavano una sola voce — Profilo — con tutto il
       resto invisibile. Ogni sezione qui sotto mostra **soltanto i dati di chi
       guarda**, e a garantirlo è la RLS, non il menu: buste paga e documenti
       personali sono owner-only in tabella, le richieste HR e la cronologia
       sono le proprie, le attività sono quelle assegnate.
       Nascondere la voce non avrebbe protetto niente — avrebbe solo reso il
       portale inutilizzabile a chi non era nella lista giusta.
       Restano ai permessi le sezioni che parlano di **altri**: clienti,
       progetti, customer care, ticket, documenti condivisi, task ad hoc. */
    const PERSONAL_KEYS = [
      'dashboard', 'mie_attivita', 'profilo', 'hr', 'calendario',
      'buste_paga', 'documenti_personali', 'cronologia', 'feedback',
    ]
    const present = new Set((visibleSections ?? []).map((s: { key: string }) => s.key))
    const universal = (sectionsRes.data ?? []).filter((s: { key: string }) => PERSONAL_KEYS.includes(s.key) && !present.has(s.key))
    visibleSections = [...(visibleSections ?? []), ...universal]
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
  }

  /* Sezioni senza pagina dopo il reset del dominio progetto: la 146 le disattiva
     in tabella, qui restano filtrate anche se qualcuno le riattiva a mano.
     §346 — `task` non è più in elenco perché **la riga non c'è più** (230): era
     il fantasma di questa stessa sezione, che vive in `ad_hoc` e una pagina ce
     l'ha. Le altre sono funzioni tolte che possono tornare, e la loro riga
     conserva ordine, gruppo e permessi. */
  const HIDDEN_WORKSPACE_KEYS = ['chat', 'portfolio', 'workload', 'cestino']
  visibleSections = (visibleSections ?? []).filter((s: { key: string }) => !HIDDEN_WORKSPACE_KEYS.includes(s.key))
  visibleSections = visibleSections.filter((s: { key: string }) => s.key !== 'commerciale')
  if (await getSalesAccess()) visibleSections.push({
    id: 'commerciale', key: 'commerciale', label: 'Commerciale', route: '/workspace/commerciale',
    icon: 'TrendingUp', sort_order: 25, group_key: 'clienti', group_order: 2,
  })

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <WorkspaceSidebar
        sections={(visibleSections ?? []) as WorkspaceSectionRow[]}
        isSuperAdmin={isSuperAdmin}
        profile={{
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          app_role: profile.app_role as AppRole | null,
        }}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header con ricerca, come nel portale admin — scoped al workspace */}
        <header className="h-14 bg-surface backdrop-blur-xl border-b border-border flex items-center px-4 lg:px-6 gap-2 lg:gap-4 sticky top-0 z-40 shrink-0 pt-safe">
          <WorkspaceMobileNav
            sections={(visibleSections ?? []) as WorkspaceSectionRow[]}
            profile={{ full_name: profile.full_name, avatar_url: profile.avatar_url, app_role: profile.app_role as AppRole | null }}
          />
          <Link href="/workspace" aria-label="TwoBee — workspace" className="lg:hidden flex items-center">
            <Logo variant="mark" className="w-6 h-6" priority />
          </Link>
          {(isAdminLevel || canPreviewClientPortal(profile)) && <PortalSwitcher canPreviewClient={canPreviewClientPortal(profile)} canAccessAdmin={isAdminLevel} />}
          <div className="flex-1 max-w-md">
            <GlobalSearch
              search={workspaceSearch}
              types={['cliente', 'documento']}
              placeholder="Cerca clienti, documenti…"
            />
          </div>
          {/* §350 — **le stesse azioni del portale admin.** Qui c'era il solo
              «crea»: niente notifiche (quindi un'assegnazione la si scopriva
              ricaricando), niente profilo da cui uscire, e il tema si cambiava
              solo dalla barra laterale — che sotto i 1024px non esiste, quindi
              da telefono non si poteva cambiare affatto. Non era una scelta: era
              una testata scritta a parte, e quello che nasce a parte resta
              indietro. */}
          <div className="flex items-center gap-1.5 lg:gap-3 ml-auto">
            <QuickCreate context="workspace" />
            <HeaderActions profile={profile} portal="workspace" />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {/* §234 — la memoria del percorso c'era solo nel portale admin, quindi
              qui ogni «indietro» cadeva sul fallback. Adesso c'è anche qui, e
              `samePortal` garantisce che quello che registra resti dentro. */}
          <Suspense fallback={null}><NavMemory /></Suspense>
          {children}
        </main>
      </div>
      <AssistantLauncher surface="workspace" userName={profile.full_name} />
      {momenti.length > 0 && (
        <MessaggiTwoBee momenti={momenti} giorno={oggiRoma} ogniMinuti={OGNI_MINUTI} />
      )}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { GlobalSearch } from '@/components/shared/GlobalSearch'
import type { Profile } from '@/lib/types/database'
import { SUPER_ADMIN_EMAILS, isAdminRole } from '@/lib/permissions'
import { MobileNav } from '@/components/shared/MobileNav'
import { Logo } from '@/components/shared/Logo'
import { PortalSwitcher } from '@/components/shared/PortalSwitcher'
import { QuickCreate } from '@/components/shared/QuickCreate'
import { HeaderActions } from '@/components/shared/HeaderActions'

interface HeaderProps { profile: Profile | null }

export function Header({ profile }: HeaderProps) {
  const isGod = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '')
  /* §234 — fra i due portali si muovono **admin e super admin**, e nessun
     altro: chi è confinato al workspace non vedrebbe comunque passare il
     middleware, e un selettore che rimbalza è peggio di un selettore assente. */
  const canSwitchPortal = isGod || isAdminRole(profile?.app_role)

  return (
    <header className="h-14 bg-surface backdrop-blur-xl border-b border-border flex items-center px-4 lg:px-6 gap-2 lg:gap-4 sticky top-0 z-40 pt-safe">
      <MobileNav />
      <Link href="/dashboard" aria-label="TwoBee — dashboard" className="lg:hidden flex items-center">
        <Logo variant="mark" className="w-6 h-6" priority />
      </Link>
      {canSwitchPortal && <PortalSwitcher />}

      <div className="flex-1 max-w-md">
        <GlobalSearch />
      </div>

      {/* §350 — notifiche, profilo e tema stanno in `HeaderActions`: erano solo
          qui, e il workspace è rimasto per mesi senza. Quello che nasce a parte
          resta indietro. */}
      <div className="flex items-center gap-1.5 lg:gap-3 ml-auto">
        <QuickCreate />
        <HeaderActions profile={profile} portal="admin" />
      </div>
    </header>
  )
}

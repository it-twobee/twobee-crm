'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutGrid, CheckSquare, Clock, MessageSquare, User, LogOut, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { Profile } from '@/lib/types/database'

const NAV = [
  { href: '/risorsa',           icon: LayoutGrid,   label: 'Oggi' },
  { href: '/risorsa/attivita',  icon: CheckSquare,  label: 'Attività' },
  { href: '/risorsa/timesheet', icon: Clock,        label: 'Timesheet' },
  { href: '/chat',              icon: MessageSquare, label: 'Chat' },
  { href: '/impostazioni/profilo', icon: User,      label: 'Profilo' },
]

export function RisorsaNav({ profile }: { profile: Profile | null }) {
  const pathname = usePathname()
  const router = useRouter()
  // Lo staff interno può tornare all'area admin; le risorse esterne (Fase 3) no
  const isStaff = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || ['admin', 'manager'].includes(profile?.app_role ?? '')

  const logout = async () => {
    await createClient().auth.signOut()
    router.push('/login'); router.refresh()
  }

  return (
    <header className="h-14 bg-[#0D0D0D] border-b border-[#1A1A1A] flex items-center px-4 gap-1 sticky top-0 z-40">
      <span className="text-sm font-black text-white mr-3">
        two bee<span className="text-[#F5C800]">.</span>
        <span className="text-[10px] text-[#444] font-bold ml-1.5 uppercase tracking-wider">Portale Risorsa</span>
      </span>

      <nav className="flex items-center gap-0.5">
        {NAV.map(item => {
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                active ? 'bg-[#F5C800]/10 text-[#F5C800]' : 'text-[#666] hover:text-white hover:bg-white/5'
              }`}>
              <item.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {isStaff && (
          <Link href="/dashboard" className="flex items-center gap-1.5 text-[10px] text-[#555] hover:text-white px-2 py-1">
            <ArrowLeft className="w-3 h-3" /> Area admin
          </Link>
        )}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#F5C800]/20 border border-[#F5C800]/30 flex items-center justify-center text-[10px] font-bold text-[#F5C800]">
            {profile?.avatar_url ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" /> : profile ? getInitials(profile.full_name) : 'U'}
          </div>
          <button onClick={logout} className="p-1.5 text-[#555] hover:text-error transition-colors" title="Esci">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  )
}

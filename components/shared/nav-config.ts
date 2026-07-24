import {
  LayoutDashboard, Users, FolderOpen, Settings, CalendarDays, Headphones,
  Ticket, UserCircle2, History, Lightbulb, FolderKanban, Briefcase,
} from 'lucide-react'

export interface NavItem {
  href: string
  icon: typeof LayoutDashboard
  label: string
  superAdminOnly?: boolean
  adminOnly?: boolean
}
export interface NavSection {
  label: string
  items: NavItem[]
}

// Fonte unica della navigazione admin: usata da Sidebar (desktop) e MobileNav.
export const navSections: NavSection[] = [
  {
    label: 'Dashboard',
    items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' }],
  },
  {
    label: 'Clienti',
    items: [
      { href: '/clienti', icon: Users, label: 'Clienti' },
      { href: '/progetti', icon: Briefcase, label: 'Progetti' },
      { href: '/customer-care', icon: Headphones, label: 'Customer Care' },
      { href: '/customer-care/tickets', icon: Ticket, label: 'Ticket' },
    ],
  },
  {
    label: 'Lavori',
    items: [
      { href: '/calendario', icon: CalendarDays, label: 'Calendario' },
      { href: '/documenti', icon: FolderOpen, label: 'Documenti' },
    ],
  },
  {
    label: 'Team',
    items: [{ href: '/hr', icon: UserCircle2, label: 'HR & Team' }],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/feedback', icon: Lightbulb, label: 'Feedback', adminOnly: true },
      { href: '/impostazioni/catalogo', icon: FolderKanban, label: 'Catalogo progetti', superAdminOnly: true },
      { href: '/impostazioni/cronologia', icon: History, label: 'Cronologia', adminOnly: true },
      { href: '/impostazioni', icon: Settings, label: 'Impostazioni', adminOnly: true },
    ],
  },
]

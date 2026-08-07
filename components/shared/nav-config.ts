import {
  LayoutDashboard, Users, FolderOpen, Settings, CalendarDays, Headphones,
  Ticket, UserCircle2, History, Lightbulb, FolderKanban, Briefcase, ListChecks, ListTodo,
  Wallet, Target, Landmark, Users2, Banknote, FileText,
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
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/le-mie-attivita', icon: ListChecks, label: 'Le mie attività' },
    ],
  },
  {
    label: 'Clienti',
    items: [
      { href: '/clienti', icon: Users, label: 'Clienti' },
      { href: '/progetti', icon: Briefcase, label: 'Progetti' },
      { href: '/ad-hoc', icon: ListTodo, label: 'Task Ad Hoc' },
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
    label: 'Economics',
    // dati economici: la pagina rimbalza chi non è admin, la voce non si mostra
    items: [
      { href: '/economics', icon: Wallet, label: 'Conto economico', adminOnly: true },
      /* §211 — fra il conto economico e la banca, perché è quello che sta in
         mezzo: il conto economico dice di chi è un ricavo e a quale mese
         appartiene, la banca quando i soldi si sono mossi, la fattura è il
         documento che lega le due cose e l'unico che vale davanti all'erario. */
      { href: '/economics/fatturazione', icon: FileText, label: 'Fatturazione', adminOnly: true },
      // subito sotto: è la stessa materia vista dalla cassa
      { href: '/economics/banca', icon: Banknote, label: 'Banca', adminOnly: true },
      { href: '/economics/costi', icon: Target, label: 'Costi e budget', adminOnly: true },
      { href: '/economics/personale', icon: Users2, label: 'Personale', adminOnly: true },
      { href: '/economics/fiscale', icon: Landmark, label: 'Fiscale & tasse', adminOnly: true },
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

import {
  LayoutDashboard, Users, FolderOpen, Settings, CalendarDays, Headphones,
  Ticket, UserCircle2, History, Lightbulb, FolderKanban, Briefcase, ListChecks, ListTodo,
  Wallet, Target, Landmark, Users2, Banknote, FileText, Share2, Table2, Radar, KeyRound,
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
      // §316 — stato tracking e QA giornaliero, per tutti i clienti
      { href: '/tracking', icon: Radar, label: 'Tracking' },
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
      /* §239 — subito sotto il conto economico: è la stessa materia con la lente
         allargata. Il conto dice com'è andato **questo** mese riga per riga, il
         prospetto dove vanno i soldi per macro categoria e come cambia la
         proporzione — e mette accanto quello che la banca ha davvero mosso. */
      { href: '/economics/prospetto', icon: Table2, label: 'Prospetto', adminOnly: true },
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
    /* §215 — sezione TEMPORANEA per il travaso da Asana. Va tolta, con la
       pagina e `lib/asana.ts`, quando il lavoro è dentro: una voce di menu che
       resta dopo che è servita diventa una cosa che nessuno sa più cosa fa. */
    label: 'Migrazione',
    items: [
      { href: '/asana', icon: Share2, label: 'Asana', adminOnly: true },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/feedback', icon: Lightbulb, label: 'Feedback', adminOnly: true },
      { href: '/impostazioni/catalogo', icon: FolderKanban, label: 'Catalogo progetti', superAdminOnly: true },
      { href: '/impostazioni/cronologia', icon: History, label: 'Cronologia', adminOnly: true },
      { href: '/impostazioni', icon: Settings, label: 'Impostazioni', adminOnly: true },
      { href: '/impostazioni/tracking', icon: KeyRound, label: 'Chiavi tracking', adminOnly: true },
    ],
  },
]

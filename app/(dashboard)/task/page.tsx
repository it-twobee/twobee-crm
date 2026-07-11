import { redirect } from 'next/navigation'

// NAV-01: vista consolidata. Il task board globale (TaskHub) si sovrapponeva a
// /le-mie-attivita (personale) e /workload (globale). Canonica: /le-mie-attivita.
// Rotta legacy mantenuta come redirect additivo.
export default function TaskPage() {
  redirect('/le-mie-attivita')
}

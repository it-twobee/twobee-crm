import { redirect } from 'next/navigation'

// NAV-01: vista consolidata. La timeline vive dentro /workload (view Timeline).
// Rotta legacy mantenuta come redirect additivo — nessun link puntava più qui.
export default function TimelinePage() {
  redirect('/workload')
}

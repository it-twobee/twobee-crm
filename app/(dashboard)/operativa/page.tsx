import { redirect } from 'next/navigation'

// NAV-01: vista consolidata verso /workload (ops globale admin/manager, stesso gate).
// I task_templates che Operativa usava restano gestiti da ClientPlanTab/reparti.
// Rotta legacy mantenuta come redirect additivo — non era più in sidebar.
export default function OperativaPage() {
  redirect('/workload')
}

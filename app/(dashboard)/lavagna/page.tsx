import { PaginaLavagna } from '@/components/lavagna/PaginaLavagna'

export const dynamic = 'force-dynamic'

/* La lavagna del team (docs/lavagna.md). */
export default function LavagnaPage() {
  return <PaginaLavagna fuori="/dashboard" />
}

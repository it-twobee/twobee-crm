'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireStaff } from '@/lib/tracking/guards'
import { run } from '@/lib/tracking/action-result'
import { runQa, runQaForClient, resultsFor, lastRun, type QaCheckView, type QaRunSummary } from '@/lib/tracking/qa'
import type { TrackingQaRun } from '@/lib/types/database'

function revalidateAll() {
  revalidatePath('/tracking')
  revalidatePath('/workspace/tracking')
}

export async function getQaForClient(clientId: string) {
  return run(async (): Promise<{ checks: QaCheckView[]; lastRun: TrackingQaRun | null }> => {
    await requireStaff()
    const admin = createAdminClient()
    const [checks, last] = await Promise.all([resultsFor(admin, clientId), lastRun(admin)])
    return { checks, lastRun: last }
  })
}

/** «Ricontrolla» nella scheda: rifà i tre controlli su quel solo cliente. */
export async function runQaClient(clientId: string) {
  return run(async (): Promise<{ checks: QaCheckView[]; problems: number }> => {
    await requireStaff()
    const result = await runQaForClient(createAdminClient(), clientId)
    revalidatePath(`/clienti/${clientId}`)
    revalidatePath(`/workspace/clienti/${clientId}`)
    revalidateAll()
    return result
  })
}

/** «Controlla ora» in cima all'elenco: tutto il portafoglio, in sequenza. */
export async function runQaAll() {
  return run(async (): Promise<QaRunSummary> => {
    await requireStaff()
    const result = await runQa(createAdminClient(), 'manuale')
    revalidateAll()
    return result
  })
}

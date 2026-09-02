import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import { AgencyKeysSettings } from '@/components/tracking/AgencyKeysSettings'
import { listDefinitions } from '@/lib/tracking/reporting'
import { listTemplates } from '@/lib/tracking/checklist'
import { isVaultConfigured } from '@/lib/tracking/crypto'

export const revalidate = 0

/** §316 — chiavi d'agenzia (GA4 service account, token Meta) e riepilogo di definizioni e checklist. */
export default async function TrackingSettingsPage() {
  const { profile, isAdmin } = await getViewer()
  if (!profile) redirect('/login')
  if (!isAdmin) redirect('/dashboard')

  const definitions = listDefinitions().map(d => ({
    archetype: d.archetype, title: d.title, version: d.version, note: d.note || null,
    breakdowns: d.breakdowns.length,
    funnels: d.breakdowns.filter(b => b.metrics.includes('utenti_visita')).length,
    eventParameters: d.breakdowns.filter(b => b.dimensions.some(x => x.startsWith('customEvent:'))).length,
  }))
  const templates = listTemplates().map(t => ({
    archetype: t.archetype, title: t.title, version: t.version, sections: t.sections.length, items: t.totalItems,
  }))

  return (
    <AgencyKeysSettings
      vaultConfigured={isVaultConfigured()}
      cronConfigured={!!process.env.TRACKING_CRON_SECRET}
      definitions={definitions}
      templates={templates}
    />
  )
}

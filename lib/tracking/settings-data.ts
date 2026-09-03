import { listDefinitions } from './reporting'
import { listTemplates } from './checklist'
import { isVaultConfigured } from './crypto'
import type { DefinitionSummary, TemplateSummary } from '@/components/tracking/AgencyKeysSettings'

/** Le stesse prop per la pagina admin e per quella del workspace. */
export function agencySettingsProps(): {
  vaultConfigured: boolean; cronConfigured: boolean; definitions: DefinitionSummary[]; templates: TemplateSummary[]
} {
  const definitions = listDefinitions().map(d => ({
    archetype: d.archetype, title: d.title, version: d.version, note: d.note || null,
    breakdowns: d.breakdowns.length,
    funnels: d.breakdowns.filter(b => b.metrics.includes('utenti_visita')).length,
    eventParameters: d.breakdowns.filter(b => b.dimensions.some(x => x.startsWith('customEvent:'))).length,
  }))
  const templates = listTemplates().map(t => ({
    archetype: t.archetype, title: t.title, version: t.version, sections: t.sections.length, items: t.totalItems,
  }))
  return {
    vaultConfigured: isVaultConfigured(),
    cronConfigured: !!process.env.TRACKING_CRON_SECRET,
    definitions, templates,
  }
}

import type { ClientPackage, ClientType, ClientLabel, PaymentStatus } from '@/lib/types/database'

/**
 * Sorgente unica delle tendine dell'anagrafica: creazione e scheda cliente
 * leggevano due liste diverse, così un canale scelto in creazione spariva
 * alla prima modifica e `growth_digital` veniva riscritto in `growth`.
 */

export const CLIENT_PACKAGES: ClientPackage[] = [
  'Worker Bee Start', 'Worker Bee Basic', 'Hive Basic', 'Hive Custom',
  'Royal Queen', 'IT Digital Partner', 'Partner Quota',
]

export const CLIENT_CHANNELS = [
  'Meta Ads', 'Google Ads', 'TikTok Ads', 'LinkedIn Ads', 'YouTube Ads',
  'SEO', 'Social Organic', 'Email Marketing', 'CRM', 'WhatsApp',
  'E-commerce', 'Copywriting', 'Web Design',
]

export const INDUSTRY_BENCHMARKS: Record<string, { roas: number; ctr: number; cpa: number; conv_rate: number }> = {
  'E-commerce Moda': { roas: 4.5, ctr: 1.8, cpa: 22, conv_rate: 2.1 },
  'E-commerce Casa & Arredo': { roas: 3.8, ctr: 1.5, cpa: 35, conv_rate: 1.8 },
  'E-commerce Alimentare': { roas: 3.2, ctr: 1.2, cpa: 18, conv_rate: 2.5 },
  'Servizi B2B': { roas: 5.0, ctr: 2.1, cpa: 85, conv_rate: 3.2 },
  'Immobiliare': { roas: 6.0, ctr: 1.4, cpa: 120, conv_rate: 1.2 },
  'Ristorazione': { roas: 3.5, ctr: 1.6, cpa: 12, conv_rate: 4.0 },
  'Salute & Benessere': { roas: 4.0, ctr: 1.9, cpa: 28, conv_rate: 2.8 },
  'Turismo & Hospitality': { roas: 5.5, ctr: 2.0, cpa: 45, conv_rate: 2.2 },
  'Automotive': { roas: 7.0, ctr: 1.3, cpa: 180, conv_rate: 0.8 },
  'Formazione & Corsi': { roas: 4.2, ctr: 2.5, cpa: 38, conv_rate: 3.5 },
  'Professionisti (avv/med/comm)': { roas: 5.5, ctr: 2.2, cpa: 65, conv_rate: 2.5 },
  'Tecnologia / SaaS': { roas: 4.8, ctr: 2.8, cpa: 95, conv_rate: 3.8 },
  'Altro': { roas: 4.0, ctr: 1.8, cpa: 40, conv_rate: 2.5 },
}

export const INDUSTRIES = Object.keys(INDUSTRY_BENCHMARKS)

export const CLIENT_TYPE_OPTIONS: { value: ClientType; label: string }[] = [
  { value: 'growth', label: 'Growth' },
  { value: 'digital', label: 'Digital' },
  { value: 'growth_digital', label: 'Growth + Digital' },
]

export const CLIENT_LABEL_OPTIONS: { value: ClientLabel; label: string }[] = [
  { value: 'stabile', label: 'Stabile' },
  { value: 'in_bilico', label: 'In bilico' },
  { value: 'perso', label: 'Perso' },
  { value: 'partner', label: 'Partner' },
]

export const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: 'pagato', label: 'Pagato' },
  { value: 'in_attesa', label: 'In attesa' },
  { value: 'scaduto', label: 'Scaduto' },
]

/** `growth_digital` deve vedere anche i target ADV, prima non vedeva nulla. */
export const hasGrowth = (t: ClientType) => t !== 'digital'

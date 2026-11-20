export const ARCHIVE_PAGE_SIZES = [20, 50, 100] as const
export const ARCHIVE_STATES = [
  { key: 'tutti', label: 'Tutti' },
  { key: 'non-associati', label: 'Non associati' },
  { key: 'associati', label: 'Associati' },
] as const
export type ArchiveState = typeof ARCHIVE_STATES[number]['key']
export const archiveState = (value: unknown): ArchiveState => ARCHIVE_STATES.find(s => s.key === value)?.key ?? 'tutti'

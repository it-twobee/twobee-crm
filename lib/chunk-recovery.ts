export function isChunkLoadError(error: unknown): boolean {
  if (!error || (typeof error !== 'object' && typeof error !== 'string')) return false
  const value = typeof error === 'string' ? { message: error } : error as { name?: unknown; message?: unknown }
  return value.name === 'ChunkLoadError' || (typeof value.message === 'string'
    && /Loading (?:CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(value.message))
}

export function recoverChunkOnce(error: unknown, options: {
  version: string
  online: boolean
  storage: Pick<Storage, 'getItem' | 'setItem'>
  reload: () => void
}): boolean {
  if (!isChunkLoadError(error) || !options.online) return false
  const key = `twobee:chunk-recovery:${options.version}`
  try {
    if (options.storage.getItem(key)) return false
    options.storage.setItem(key, 'attempted')
  } catch {
    // Senza una memoria persistente nella scheda non possiamo impedire un ciclo di reload.
    return false
  }
  options.reload()
  return true
}

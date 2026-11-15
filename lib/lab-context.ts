export function labContextMonth(value: string | null | undefined): string | undefined {
  const normalized = value && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value) ? `${value}-01` : value
  return normalized && /^(19|20)\d{2}-(0[1-9]|1[0-2])-01$/.test(normalized) ? normalized : undefined
}

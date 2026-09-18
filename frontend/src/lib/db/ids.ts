/** True when `value` is a canonical UUID (v4-style hex segments). */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  )
}

/** Return a UUID string or null when the input is not a valid UUID. */
export function coerceUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return isUuid(trimmed) ? trimmed : null
}

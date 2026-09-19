export function errorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return fallback
}

export function formatSupabaseApiError(context: string, err: unknown): string {
  const message = errorMessage(err)
  const hint =
    /ResourceNotFound|ValidationException|DYNAMODB_TABLE_NAME|not configured/i.test(message)
      ? ' Check DYNAMODB_TABLE_NAME and that HackPayStack is deployed.'
      : /ConditionalCheckFailed/i.test(message)
        ? ' A conflicting row already exists.'
        : ''
  return `${context}: ${message}.${hint}`
}

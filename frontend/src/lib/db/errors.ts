export function errorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return fallback
}

export function formatSupabaseApiError(context: string, err: unknown): string {
  const message = errorMessage(err)
  const hint =
    message.toLowerCase().includes('does not exist') || message.includes('42P01')
      ? ' Apply infra/sql migrations (npm run migrate:rds).'
      : message.toLowerCase().includes('foreign key') || message.includes('23503')
        ? ' A linked hackathon or escrow row is missing — sync the hackathon first.'
        : ''
  return `${context}: ${message}.${hint}`
}

/**
 * Strands / Bedrock env helpers.
 * Advisory AI only — never moves money or co-approves payouts.
 */

/** Default Nova Lite — widely available; override with BEDROCK_MODEL_ID. */
export const DEFAULT_BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0'

export function getBedrockModelId(): string {
  return process.env.BEDROCK_MODEL_ID?.trim() || DEFAULT_BEDROCK_MODEL_ID
}

export function getBedrockRegion(): string {
  return (
    process.env.BEDROCK_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    process.env.NEXT_PUBLIC_AWS_REGION?.trim() ||
    'ap-south-1'
  )
}

/**
 * Strands is on when explicitly enabled, or when a model id is set.
 * Set STRANDS_ENABLED=false to force off.
 */
export function isStrandsEnabled(): boolean {
  const flag = process.env.STRANDS_ENABLED?.trim().toLowerCase()
  if (flag === '0' || flag === 'false' || flag === 'off' || flag === 'no') return false
  if (flag === '1' || flag === 'true' || flag === 'on' || flag === 'yes') return true
  return Boolean(process.env.BEDROCK_MODEL_ID?.trim())
}

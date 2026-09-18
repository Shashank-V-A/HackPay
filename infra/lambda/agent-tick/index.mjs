/**
 * EventBridge-scheduled Lambda: invokes HackPay agent tick over HTTPS.
 * Set APP_URL + AGENT_CRON_SECRET (must match Amplify / App Runner env).
 */
export async function handler(event) {
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '')
  const secret = process.env.AGENT_CRON_SECRET || ''

  if (!appUrl) {
    console.error('APP_URL is not set')
    return { ok: false, error: 'APP_URL is not set' }
  }

  const url = `${appUrl}/api/agent/tick`
  console.log('Invoking agent tick', { url, detailType: event?.['detail-type'] })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-agent-cron-secret': secret } : {}),
    },
    body: JSON.stringify({ source: 'aws-eventbridge-lambda', at: new Date().toISOString() }),
  })

  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text }
  }

  console.log('Agent tick response', { status: res.status, body })

  if (!res.ok) {
    throw new Error(`Agent tick failed: HTTP ${res.status}`)
  }

  return { ok: true, status: res.status, body }
}

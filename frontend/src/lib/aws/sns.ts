import { PublishCommand, SNSClient, SubscribeCommand } from '@aws-sdk/client-sns'
import { getAwsRegion, getSnsTopicArn, isSnsConfigured } from '@/lib/aws/env'

let sns: SNSClient | null = null

function client(): SNSClient {
  if (!sns) sns = new SNSClient({ region: getAwsRegion() })
  return sns
}

export async function publishAlert(input: {
  subject: string
  message: string
  attributes?: Record<string, string>
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  if (!isSnsConfigured()) {
    return { ok: false, error: 'SNS is not configured' }
  }

  try {
    const attrs: Record<string, { DataType: string; StringValue: string }> = {}
    for (const [k, v] of Object.entries(input.attributes || {})) {
      attrs[k] = { DataType: 'String', StringValue: v }
    }

    const res = await client().send(
      new PublishCommand({
        TopicArn: getSnsTopicArn(),
        Subject: input.subject.slice(0, 100),
        Message: input.message,
        MessageAttributes: Object.keys(attrs).length ? attrs : undefined,
      }),
    )
    return { ok: true, messageId: res.MessageId }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'SNS publish failed',
    }
  }
}

/** Email subscribe for demo agent alerts. Caller must confirm the AWS email. */
export async function subscribeEmail(email: string): Promise<{
  ok: boolean
  subscriptionArn?: string
  pendingConfirm?: boolean
  error?: string
}> {
  if (!isSnsConfigured()) {
    return { ok: false, error: 'SNS is not configured' }
  }
  const trimmed = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: 'Enter a valid email address' }
  }

  try {
    const res = await client().send(
      new SubscribeCommand({
        TopicArn: getSnsTopicArn(),
        Protocol: 'email',
        Endpoint: trimmed,
        ReturnSubscriptionArn: true,
      }),
    )
    const arn = res.SubscriptionArn || ''
    const pending = !arn || arn === 'pending confirmation'
    return {
      ok: true,
      subscriptionArn: arn || undefined,
      pendingConfirm: pending,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'SNS subscribe failed',
    }
  }
}

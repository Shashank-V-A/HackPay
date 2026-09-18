import { PublishCommand, SNSClient } from '@aws-sdk/client-sns'
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

import type { AgentNotification, AgentTickResult } from '../types/hackathon'
import { authHeaders } from '../utils/authSession'

export type { AgentTickResult }

export async function tickAgent(): Promise<AgentTickResult | null> {
  try {
    const res = await fetch('/api/agent/tick', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
    })
    const data = (await res.json()) as Partial<AgentTickResult>
    if (!data || typeof data !== 'object') return null
    const source =
      data.source === 'dynamodb' || data.source === 'none'
        ? data.source
        : 'none'
    return {
      ok: Boolean(data.ok),
      ranAt: typeof data.ranAt === 'string' ? data.ranAt : new Date().toISOString(),
      source,
      actions: Array.isArray(data.actions) ? data.actions : [],
      summary: typeof data.summary === 'string' ? data.summary : '',
      error: typeof data.error === 'string' ? data.error : undefined,
    }
  } catch {
    return null
  }
}

export async function fetchAgentNotifications(wallet: string): Promise<AgentNotification[]> {
  if (!wallet.trim()) return []
  const params = new URLSearchParams({ wallet: wallet.trim() })
  const res = await fetch(`/api/agent/notifications?${params.toString()}`, {
    headers: authHeaders(),
  })
  const data = (await res.json()) as { notifications?: AgentNotification[] }
  return Array.isArray(data.notifications) ? data.notifications : []
}

export async function markAgentNotificationRead(wallet: string, id: string): Promise<void> {
  await fetch('/api/agent/notifications', {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ wallet, id }),
  })
}

/** On-demand Strands/Bedrock winner shortlist + timeline (advisory only). */
export async function fetchAgentAdvice(hackathonId: string) {
  try {
    const res = await fetch('/api/agent/advise', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ hackathonId }),
    })
    return (await res.json()) as {
      ok: boolean
      provider?: string
      timelineSummary?: string
      nextSteps?: string[]
      suggestions?: Array<{
        participantId: string
        name: string
        rank: number
        score: number
        rationale: string
        repoUrl?: string
        risks?: string[]
      }>
      error?: string
    }
  } catch {
    return null
  }
}

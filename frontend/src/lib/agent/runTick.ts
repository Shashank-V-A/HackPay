import type { AgentNotification, AgentStage, Hackathon, HackathonAgentState } from '@/client/types/hackathon'
import {
  deriveStatus,
  escrowBalanceXlm,
  isEscrowFullyFunded,
  payoutReceiptUrl,
  payoutStatusCopy,
} from '@/client/utils/format'
import { fundingGapXlm, canExecuteRelease, getPayoutWorkflowStage } from '@/client/utils/payoutWorkflow'
import { handleExecute } from '@/lib/backend/escrowHandlers'
import { appendAgentLog, summarizeAgentLog } from '@/lib/agent/summarize'
import {
  isStrandsEnabled,
  strandsAdviseWinners,
  strandsCraftNotice,
  strandsSummarizeTick,
} from '@/lib/agent/strands'
import { getActiveDataBackend, isDynamoConfigured } from '@/lib/aws/env'
import { buildReceiptKey, uploadAuditObject } from '@/lib/aws/s3'
import { publishAlert } from '@/lib/aws/sns'
import { rowToHackathon, rowToProposal } from '@/lib/db/mappers'
import { createSupabaseServerClient } from '@/lib/db/server'
import { syncExecutedPayouts } from '@/lib/db/syncExecutedPayouts'

export type AgentTickAction = {
  stage: AgentStage
  hackathonId: string
  hackathonName: string
  detail: string
  txHash?: string
}

export type AgentTickResult = {
  ok: boolean
  ranAt: string
  source: 'dynamodb' | 'none'
  actions: AgentTickAction[]
  summary: string
  error?: string
}

function isDataReady(): boolean {
  return isDynamoConfigured()
}

function dataSource(): AgentTickResult['source'] {
  return getActiveDataBackend()
}

function nowIso() {
  return new Date().toISOString()
}

function notifyId(stage: AgentStage, hackathonId: string, wallet: string) {
  return `agent_${stage}_${hackathonId}_${wallet.slice(-8)}_${Date.now()}`
}

function findProposal(hackathon: Hackathon & { dbId?: string }, proposals: Record<string, unknown>[]) {
  const keys = new Set([hackathon.id, hackathon.dbId].filter(Boolean).map((k) => String(k)))
  return proposals.find((p) => keys.has(String(p.hackathonId || '')) || keys.has(String(p.hackathonDbId || '')))
}

function pushNotice(
  inbox: AgentNotification[],
  notice: Omit<AgentNotification, 'id' | 'createdAt'>,
) {
  inbox.push({
    ...notice,
    id: notifyId(notice.stage, notice.hackathonId, notice.wallet),
    createdAt: nowIso(),
  })
}

async function saveAgentPayload(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  rowId: string,
  existingPayload: Record<string, unknown>,
  agent: HackathonAgentState,
  extra: Record<string, unknown> = {},
) {
  const { error } = await supabase
    .from('hackathons')
    .update({
      payload: {
        ...existingPayload,
        ...extra,
        agent,
      },
    })
    .eq('id', rowId)
  if (error) throw error
}

export async function runAgentTick(): Promise<AgentTickResult> {
  const ranAt = nowIso()
  if (!isDataReady()) {
    return {
      ok: true,
      ranAt,
      source: 'none',
      actions: [],
      summary: summarizeAgentLog([]),
      error: 'DYNAMODB_TABLE_NAME is not configured',
    }
  }

  const supabase = createSupabaseServerClient()
  const actions: AgentTickAction[] = []
  const source = dataSource()

  const { data: hackRows, error: hackError } = await supabase
    .from('hackathons')
    .select('*')
    .order('created_at', { ascending: false })
  if (hackError) {
    return { ok: false, ranAt, source, actions, summary: summarizeAgentLog([]), error: hackError.message }
  }

  const { data: proposalRows, error: proposalError } = await supabase.from('proposals').select('*')
  if (proposalError) {
    return { ok: false, ranAt, source, actions, summary: summarizeAgentLog([]), error: proposalError.message }
  }

  const proposals = (proposalRows || []).map((row: Parameters<typeof rowToProposal>[0]) =>
    rowToProposal(row),
  )

  for (const row of hackRows || []) {
    const hackathon = rowToHackathon(row)
    const payload = (row.payload || {}) as Record<string, unknown>
    const agent: HackathonAgentState = {
      notified: { ...(hackathon.agent?.notified || {}) },
      inbox: [...(hackathon.agent?.inbox || [])],
      log: [...(hackathon.agent?.log || [])],
      gates: hackathon.agent?.gates,
      lastReceipt: hackathon.agent?.lastReceipt,
      summary: hackathon.agent?.summary,
      compliance: hackathon.agent?.compliance,
      timelineSummary: hackathon.agent?.timelineSummary,
      nextSteps: hackathon.agent?.nextSteps,
      suggestions: hackathon.agent?.suggestions,
      adviceAt: hackathon.agent?.adviceAt,
      adviceProvider: hackathon.agent?.adviceProvider,
    }
    const proposal = findProposal(hackathon, proposals)
    const matchedProposal: Record<string, unknown> | undefined = proposal
      ? { ...proposal, hackathonId: hackathon.id }
      : undefined
    const workflow = getPayoutWorkflowStage(hackathon, matchedProposal ? [matchedProposal] : [])
    const ended = deriveStatus(hackathon) === 'completed'
    const liveOrEnded = deriveStatus(hackathon) === 'live' || ended
    let dirty = false

    if (
      liveOrEnded &&
      !isEscrowFullyFunded(hackathon) &&
      hackathon.sponsorAddress &&
      !agent.notified?.funding
    ) {
      const remaining = fundingGapXlm(hackathon)
      const notice = await strandsCraftNotice({
        stage: 'funding',
        hackathonName: hackathon.name,
        role: 'sponsor',
        fallbackTitle: 'HackPay vault still needs funding',
        fallbackBody: `${hackathon.name} needs ₹${remaining} more before winners can be paid. Fund it from the sponsor console.`,
        context: `remaining_inr=${remaining}`,
      })
      pushNotice(agent.inbox!, {
        wallet: hackathon.sponsorAddress,
        role: 'sponsor',
        hackathonId: hackathon.id,
        hackathonName: hackathon.name,
        stage: 'funding',
        title: notice.title,
        body: notice.body,
        href: '/verifier',
      })
      agent.notified!.funding = nowIso()
      dirty = true
      const action: AgentTickAction = {
        stage: 'funding',
        hackathonId: hackathon.id,
        hackathonName: hackathon.name,
        detail: `Notified sponsor: ₹${remaining} remaining to fully fund the vault`,
      }
      actions.push(action)
      agent.log = appendAgentLog(agent.log, action)
    }

    if (ended && !hackathon.winnersSelected && !agent.notified?.event_ended) {
      const orgNotice = await strandsCraftNotice({
        stage: 'event_ended',
        hackathonName: hackathon.name,
        role: 'organizer',
        fallbackTitle: 'Event ended — choose winners',
        fallbackBody: `${hackathon.name} has ended. Choose winners so the payout can be proposed.`,
      })
      const sponsorNotice = await strandsCraftNotice({
        stage: 'event_ended',
        hackathonName: hackathon.name,
        role: 'sponsor',
        fallbackTitle: 'Event ended — waiting on winners',
        fallbackBody: `${hackathon.name} has ended. The organizer needs to select winners before you can co-approve a payout.`,
      })
      if (hackathon.organizerAddress) {
        pushNotice(agent.inbox!, {
          wallet: hackathon.organizerAddress,
          role: 'organizer',
          hackathonId: hackathon.id,
          hackathonName: hackathon.name,
          stage: 'event_ended',
          title: orgNotice.title,
          body: orgNotice.body,
          href: '/issuer',
          view: 'winners',
        })
      }
      if (hackathon.sponsorAddress) {
        pushNotice(agent.inbox!, {
          wallet: hackathon.sponsorAddress,
          role: 'sponsor',
          hackathonId: hackathon.id,
          hackathonName: hackathon.name,
          stage: 'event_ended',
          title: sponsorNotice.title,
          body: sponsorNotice.body,
          href: '/verifier',
        })
      }
      agent.notified!.event_ended = nowIso()
      dirty = true
      const endedAction: AgentTickAction = {
        stage: 'event_ended',
        hackathonId: hackathon.id,
        hackathonName: hackathon.name,
        detail: 'Notified organizer and sponsor to choose winners',
      }
      actions.push(endedAction)
      agent.log = appendAgentLog(agent.log, endedAction)

      // Bedrock/Strands: analyze repos + timeline → advisory shortlist (organizer still confirms)
      if (isStrandsEnabled() && (hackathon.participants?.length || 0) > 0) {
        const advice = await strandsAdviseWinners(hackathon, workflow)
        if (advice.ok) {
          agent.timelineSummary = advice.timelineSummary
          agent.nextSteps = advice.nextSteps
          agent.suggestions = advice.suggestions
          agent.adviceAt = nowIso()
          agent.adviceProvider = 'strands-bedrock'
          dirty = true
          actions.push({
            stage: 'event_ended',
            hackathonId: hackathon.id,
            hackathonName: hackathon.name,
            detail: `Strands advice: ${(advice.suggestions || []).length} shortlisted projects`,
          })
        }
      }
    }

    if (workflow === 'winners_selected' && !agent.notified?.propose && hackathon.organizerAddress) {
      pushNotice(agent.inbox!, {
        wallet: hackathon.organizerAddress,
        role: 'organizer',
        hackathonId: hackathon.id,
        hackathonName: hackathon.name,
        stage: 'propose',
        title: 'Winners saved — propose the payout',
        body: `Winners for ${hackathon.name} are on file. Propose the INR payout so the sponsor can co-approve.`,
        href: '/issuer',
        view: 'payouts',
      })
      agent.notified!.propose = nowIso()
      dirty = true
      const proposeAction: AgentTickAction = {
        stage: 'propose',
        hackathonId: hackathon.id,
        hackathonName: hackathon.name,
        detail: 'Reminded organizer to propose the payout',
      }
      actions.push(proposeAction)
      agent.log = appendAgentLog(agent.log, proposeAction)
    }

    if (
      matchedProposal &&
      canExecuteRelease(matchedProposal) &&
      !hackathon.payoutExecuted &&
      !agent.notified?.released
    ) {
      const onChainId = matchedProposal.onChainProposalId ?? matchedProposal.onchain_proposal_id
      const winners = Array.isArray(matchedProposal.winners)
        ? (matchedProposal.winners as Array<{ payoutAddress?: string; prizeAmount?: number; project?: string; githubUrl?: string; name?: string }>)
        : []
      const executed = await handleExecute({
        proposal_id: onChainId as number | string,
        payouts: winners.map((w) => ({
          winner_address: w.payoutAddress,
          amount: w.prizeAmount,
        })),
        winners,
        vaultBalanceInr: escrowBalanceXlm(hackathon),
        hackathonId: hackathon.id,
      })
      if (!executed.success) {
        const failed: AgentTickAction = {
          stage: 'execute_failed',
          hackathonId: hackathon.id,
          hackathonName: hackathon.name,
          detail: executed.error,
        }
        actions.push(failed)
        agent.log = appendAgentLog(agent.log, failed)
        agent.summary = summarizeAgentLog(agent.log || [])
        dirty = true
      } else {
        const executedAt = nowIso()
        const txUrl = payoutReceiptUrl(executed.txHash)
        const moneyCopy = payoutStatusCopy(executed.txHash)
        agent.gates = Array.isArray(executed.gates) ? executed.gates : agent.gates
        agent.lastReceipt = executed.txHash
        agent.compliance = executed.compliance
        agent.summary = moneyCopy
        const updatedProposal = {
          ...matchedProposal,
          status: 'executed',
          txHash: executed.txHash,
          executedAt,
        }
        await supabase
          .from('proposals')
          .update({
            status: 'executed',
            executed_at: executedAt,
            payload: updatedProposal,
          })
          .eq('legacy_id', String(matchedProposal.id))

        if (matchedProposal.dbId) {
          await syncExecutedPayouts(supabase, String(matchedProposal.dbId), updatedProposal)
        }

        if (hackathon.organizerAddress) {
          pushNotice(agent.inbox!, {
            wallet: hackathon.organizerAddress,
            role: 'organizer',
            hackathonId: hackathon.id,
            hackathonName: hackathon.name,
            stage: 'released',
            title: 'Payout executed',
            body: `Both sides approved. ${moneyCopy}`,
            href: '/issuer',
            view: 'payouts',
            txHash: executed.txHash,
            txUrl,
          })
        }
        if (hackathon.sponsorAddress) {
          pushNotice(agent.inbox!, {
            wallet: hackathon.sponsorAddress,
            role: 'sponsor',
            hackathonId: hackathon.id,
            hackathonName: hackathon.name,
            stage: 'released',
            title: 'Payout executed',
            body: `${hackathon.name}: ${moneyCopy}`,
            href: '/verifier',
            txHash: executed.txHash,
            txUrl,
          })
        }
        agent.notified!.released = executedAt
        const releasedAction: AgentTickAction = {
          stage: 'released',
          hackathonId: hackathon.id,
          hackathonName: hackathon.name,
          detail: moneyCopy,
          txHash: executed.txHash,
        }
        actions.push(releasedAction)
        agent.log = appendAgentLog(agent.log, releasedAction)
        agent.lastTickAt = ranAt
        await saveAgentPayload(supabase, row.id, payload, agent, {
          payoutExecuted: true,
          payoutTxHash: executed.txHash,
        })

        await uploadAuditObject({
          key: buildReceiptKey(hackathon.id, 'execute', executed.txHash || String(Date.now())),
          body: JSON.stringify(
            {
              hackathonId: hackathon.id,
              receipt: executed.txHash,
              compliance: executed.compliance,
              gates: executed.gates,
              at: executedAt,
            },
            null,
            2,
          ),
        })

        await publishAlert({
          subject: `HackPay payout: ${hackathon.name}`,
          message: `${moneyCopy}\nReceipt: ${executed.txHash}`,
          attributes: {
            stage: 'released',
            hackathonId: hackathon.id,
          },
        })

        dirty = false
      }
    }

    if (dirty) {
      agent.lastTickAt = ranAt
      agent.summary = summarizeAgentLog(actions.filter((a) => a.hackathonId === hackathon.id))
      await saveAgentPayload(supabase, row.id, payload, agent)

      const last = actions[actions.length - 1]
      if (last && last.stage !== 'released') {
        await publishAlert({
          subject: `HackPay agent: ${last.stage} — ${hackathon.name}`,
          message: last.detail,
          attributes: { stage: last.stage, hackathonId: hackathon.id },
        })
      }
    }
  }

  const ruleSummary = summarizeAgentLog(actions)
  const aiSummary = await strandsSummarizeTick(actions)
  return { ok: true, ranAt, source, actions, summary: aiSummary || ruleSummary }
}

export async function listAgentNotifications(wallet: string): Promise<AgentNotification[]> {
  if (!wallet.trim() || !isDataReady()) return []
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.from('hackathons').select('payload, legacy_id, id')
  if (error || !data) return []

  const needle = wallet.trim().toLowerCase()
  const notices: AgentNotification[] = []
  for (const row of data as Array<{ payload?: Record<string, unknown> }>) {
    const payload = (row.payload || {}) as Record<string, unknown>
    const agent = payload.agent as HackathonAgentState | undefined
    for (const item of agent?.inbox || []) {
      if (item.wallet?.trim().toLowerCase() === needle) notices.push(item)
    }
  }
  return notices.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

export async function markAgentNotificationRead(wallet: string, noticeId: string): Promise<boolean> {
  if (!wallet.trim() || !noticeId || !isDataReady()) return false
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.from('hackathons').select('id, payload')
  if (error || !data) return false

  const needle = wallet.trim().toLowerCase()
  for (const row of data as Array<{ id: string; payload?: Record<string, unknown> }>) {
    const payload = (row.payload || {}) as Record<string, unknown>
    const agent = payload.agent as HackathonAgentState | undefined
    if (!agent?.inbox?.length) continue
    const next = agent.inbox.map((item) =>
      item.id === noticeId && item.wallet.trim().toLowerCase() === needle
        ? { ...item, readAt: nowIso() }
        : item,
    )
    if (JSON.stringify(next) === JSON.stringify(agent.inbox)) continue
    await saveAgentPayload(supabase, row.id, payload, { ...agent, inbox: next })
    return true
  }
  return false
}

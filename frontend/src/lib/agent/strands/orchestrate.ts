import { z } from 'zod'
import type { Hackathon, Participant } from '@/client/types/hackathon'
import { createHackPayStrandsAgent, fetchGithubReadmeTool, fetchGithubRepoTool, textFromAgentResult } from './client'
import { isStrandsEnabled } from './config'

export type WinnerSuggestion = {
  participantId: string
  name: string
  rank: number
  score: number
  rationale: string
  repoUrl?: string
  risks?: string[]
}

export type StrandsAdviceResult = {
  ok: boolean
  provider: 'strands-bedrock' | 'none'
  timelineSummary?: string
  nextSteps?: string[]
  suggestions?: WinnerSuggestion[]
  notificationDrafts?: Array<{ role: 'organizer' | 'sponsor'; title: string; body: string }>
  error?: string
}

const adviceSchema = z.object({
  timelineSummary: z.string().describe('2-4 sentence timeline / status narrative'),
  nextSteps: z.array(z.string()).max(6).describe('Concrete next actions for organizer/sponsor'),
  suggestions: z
    .array(
      z.object({
        participantId: z.string(),
        name: z.string(),
        rank: z.number().int().min(1),
        score: z.number().min(0).max(100),
        rationale: z.string(),
        repoUrl: z.string().optional(),
        risks: z.array(z.string()).optional(),
      }),
    )
    .max(10)
    .describe('Ranked winner shortlist — advisory only'),
  notificationDrafts: z
    .array(
      z.object({
        role: z.enum(['organizer', 'sponsor']),
        title: z.string(),
        body: z.string(),
      }),
    )
    .max(4)
    .optional(),
})

const tickSummarySchema = z.object({
  summary: z.string().describe('One short paragraph summarizing this orchestration tick'),
  highlights: z.array(z.string()).max(5).optional(),
})

const gitEnrichSchema = z.object({
  narrative: z.string(),
  scoreHint: z.number().min(0).max(100).optional(),
  flags: z.array(z.string()).max(8).optional(),
})

function hackathonContext(hackathon: Hackathon, workflowStage: string): string {
  const participants = (hackathon.participants || []).slice(0, 40).map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    project: p.project,
    track: p.track,
    status: p.status,
    payoutAddress: p.payoutAddress ? 'set' : 'missing',
  }))
  return JSON.stringify(
    {
      id: hackathon.id,
      name: hackathon.name,
      startDate: hackathon.startDate,
      endDate: hackathon.endDate,
      statusDerivedHint: workflowStage,
      prizePool: hackathon.prizePool,
      winnersSelected: hackathon.winnersSelected,
      payoutProposed: hackathon.payoutProposed,
      payoutExecuted: hackathon.payoutExecuted,
      sponsorFunded: hackathon.sponsorFunded,
      participantCount: hackathon.participantCount,
      participants,
      winners: hackathon.winners || [],
      agentLogTail: (hackathon.agent?.log || []).slice(-8),
      agentSummary: hackathon.agent?.summary,
    },
    null,
    2,
  )
}

/** Natural-language tick summary via Bedrock. Falls back to null on failure. */
export async function strandsSummarizeTick(
  actions: Array<{ stage: string; hackathonName: string; detail: string }>,
): Promise<string | null> {
  if (!isStrandsEnabled() || !actions.length) return null
  try {
    const agent = createHackPayStrandsAgent({
      tools: [],
      systemPrompt:
        'Summarize HackPay agent orchestration ticks for organizers. Dual-control payouts; you cannot move money.',
    })
    const result = await agent.invoke(
      `Summarize these agent actions for a product status line:\n${JSON.stringify(actions, null, 2)}`,
      { structuredOutputSchema: tickSummarySchema },
    )
    const out = result.structuredOutput as z.infer<typeof tickSummarySchema> | undefined
    if (out?.summary) {
      const highlights = out.highlights?.length ? ` Highlights: ${out.highlights.join('; ')}.` : ''
      return `${out.summary}${highlights}`.trim()
    }
    const text = textFromAgentResult(result)
    return text || null
  } catch (err) {
    console.warn('[strands] tick summary failed', err instanceof Error ? err.message : err)
    return null
  }
}

/** Improve notification body copy for a stage (optional). */
export async function strandsCraftNotice(input: {
  stage: string
  hackathonName: string
  role: 'organizer' | 'sponsor'
  fallbackTitle: string
  fallbackBody: string
  context?: string
}): Promise<{ title: string; body: string }> {
  if (!isStrandsEnabled()) {
    return { title: input.fallbackTitle, body: input.fallbackBody }
  }
  try {
    const agent = createHackPayStrandsAgent({ tools: [] })
    const schema = z.object({ title: z.string().max(80), body: z.string().max(400) })
    const result = await agent.invoke(
      `Rewrite this HackPay inbox notification. Keep facts accurate. Stage=${input.stage} role=${input.role} event=${input.hackathonName}.
Fallback title: ${input.fallbackTitle}
Fallback body: ${input.fallbackBody}
Extra: ${input.context || 'none'}
Tone: professional, urgent but calm, INR prize escrow.`,
      { structuredOutputSchema: schema },
    )
    const out = result.structuredOutput as { title?: string; body?: string } | undefined
    if (out?.title && out?.body) return { title: out.title, body: out.body }
  } catch (err) {
    console.warn('[strands] craft notice failed', err instanceof Error ? err.message : err)
  }
  return { title: input.fallbackTitle, body: input.fallbackBody }
}

/**
 * Advise on winner shortlist by inspecting participant repos via tools.
 * Advisory only — organizer still confirms winners in the UI.
 */
export async function strandsAdviseWinners(
  hackathon: Hackathon,
  workflowStage: string,
): Promise<StrandsAdviceResult> {
  if (!isStrandsEnabled()) {
    return { ok: false, provider: 'none', error: 'Strands/Bedrock is not enabled (set STRANDS_ENABLED=true)' }
  }

  const participants: Participant[] = hackathon.participants || []
  if (!participants.length) {
    return {
      ok: true,
      provider: 'strands-bedrock',
      timelineSummary: `${hackathon.name}: event context loaded but no participants are registered yet.`,
      nextSteps: ['Ask participants to register with payout UPI and project/GitHub links.'],
      suggestions: [],
    }
  }

  try {
    const agent = createHackPayStrandsAgent({
      tools: [fetchGithubRepoTool, fetchGithubReadmeTool],
    })
    const result = await agent.invoke(
      `Analyze this HackPay hackathon for timeline status and a ranked winner SHORTLIST.
Use fetch_github_repo / fetch_github_readme when participants have project GitHub URLs.
Only suggest participants who exist in the roster. Scores 0-100. Flag missing UPI/repo risks.
Do NOT claim winners are final — organizer must confirm.

Hackathon JSON:
${hackathonContext(hackathon, workflowStage)}`,
      { structuredOutputSchema: adviceSchema },
    )

    const out = result.structuredOutput as z.infer<typeof adviceSchema> | undefined
    if (!out) {
      return {
        ok: false,
        provider: 'strands-bedrock',
        error: 'Bedrock returned no structured advice',
      }
    }

    const idSet = new Set(participants.map((p) => p.id))
    const suggestions = (out.suggestions || [])
      .filter((s) => idSet.has(s.participantId) || participants.some((p) => p.name === s.name))
      .map((s, i) => {
        const match =
          participants.find((p) => p.id === s.participantId) ||
          participants.find((p) => p.name === s.name)
        return {
          ...s,
          participantId: match?.id || s.participantId,
          name: match?.name || s.name,
          rank: s.rank || i + 1,
          repoUrl: s.repoUrl || match?.project,
        } satisfies WinnerSuggestion
      })

    return {
      ok: true,
      provider: 'strands-bedrock',
      timelineSummary: out.timelineSummary,
      nextSteps: out.nextSteps,
      suggestions,
      notificationDrafts: out.notificationDrafts,
    }
  } catch (err) {
    return {
      ok: false,
      provider: 'strands-bedrock',
      error: err instanceof Error ? err.message : 'Strands advice failed',
    }
  }
}

/** Optional LLM narrative on top of the heuristic git gate. */
export async function strandsEnrichGitReview(repos: string[]): Promise<{
  narrative?: string
  scoreHint?: number
  flags?: string[]
} | null> {
  if (!isStrandsEnabled() || !repos.length) return null
  try {
    const agent = createHackPayStrandsAgent({
      tools: [fetchGithubRepoTool, fetchGithubReadmeTool],
    })
    const result = await agent.invoke(
      `Review these winner GitHub repos for hackathon payout readiness (license, activity, README substance).
Repos: ${repos.join(', ')}
Return a short narrative and optional scoreHint 0-100.`,
      { structuredOutputSchema: gitEnrichSchema },
    )
    return (result.structuredOutput as z.infer<typeof gitEnrichSchema>) || null
  } catch {
    return null
  }
}

import { isValidPayoutDestination } from '@/client/constants/escrow'
import type { GateResult } from '@/client/types/hackathon'

export type { GateResult }

export type WinnerLike = {
  payoutAddress?: string
  prizeAmount?: number | string
  project?: string
  githubUrl?: string
  name?: string
}

function parseGithubRepo(value: string): { owner: string; repo: string } | null {
  const text = value.trim()
  const match = text.match(/github\.com\/([^/\s]+)\/([^/\s?#]+)/i)
  if (match) return { owner: match[1], repo: match[2].replace(/\.git$/i, '') }
  if (/^[^/\s]+\/[^/\s]+$/.test(text)) {
    const [owner, repo] = text.split('/')
    return { owner, repo }
  }
  return null
}

export function evaluatePayment(winners: WinnerLike[], vaultBalanceInr: number): GateResult {
  if (!winners.length) {
    return { ok: false, code: 'PAYMENT_BLOCK', detail: 'No winners on the payout list.' }
  }

  let total = 0
  for (const winner of winners) {
    const dest = String(winner.payoutAddress || '').trim()
    const amount = Number(winner.prizeAmount)
    if (!isValidPayoutDestination(dest)) {
      return {
        ok: false,
        code: 'PAYMENT_BLOCK',
        detail: `${winner.name || dest || 'Winner'} has an invalid UPI / bank payout destination.`,
      }
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        ok: false,
        code: 'PAYMENT_BLOCK',
        detail: `${winner.name || dest} has an invalid prize amount.`,
      }
    }
    total += amount
  }

  if (vaultBalanceInr + 0.001 < total) {
    return {
      ok: false,
      code: 'PAYMENT_BLOCK',
      detail: `Vault holds ₹${vaultBalanceInr} but payouts total ₹${total}.`,
    }
  }

  return {
    ok: true,
    code: 'PAYMENT_OK',
    detail: `Math and destinations valid. ₹${total} against ₹${vaultBalanceInr} vault.`,
  }
}

export async function evaluateGit(winners: WinnerLike[]): Promise<GateResult> {
  const repos = winners
    .map((w) => parseGithubRepo(String(w.githubUrl || w.project || '')))
    .filter((r): r is { owner: string; repo: string } => Boolean(r))

  if (!repos.length) {
    return {
      ok: true,
      code: 'GIT_SKIP',
      detail: 'No GitHub repos on the winner list — git gate skipped (not blocking).',
      score: 0,
    }
  }

  let score = 0
  const notes: string[] = []
  for (const { owner, repo } of repos) {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'hackpay-agent' },
      })
      if (!res.ok) {
        notes.push(`${owner}/${repo}: GitHub ${res.status}`)
        continue
      }
      const data = (await res.json()) as {
        license?: { spdx_id?: string } | null
        stargazers_count?: number
        pushed_at?: string
        default_branch?: string
      }
      const hasLicense = Boolean(data.license?.spdx_id && data.license.spdx_id !== 'NOASSERTION')
      const recent =
        data.pushed_at && Date.now() - new Date(data.pushed_at).getTime() < 1000 * 60 * 60 * 24 * 180
      let local = 40
      if (hasLicense) local += 30
      if (recent) local += 20
      if ((data.stargazers_count || 0) > 0) local += 10
      score += local
      notes.push(
        `${owner}/${repo}: license=${data.license?.spdx_id || 'none'} stars=${data.stargazers_count || 0}`,
      )
    } catch (error) {
      notes.push(`${owner}/${repo}: ${error instanceof Error ? error.message : 'fetch failed'}`)
    }
  }

  const avg = Math.round(score / repos.length)

  let strandsNote = ''
  try {
    const { strandsEnrichGitReview, isStrandsEnabled } = await import('@/lib/agent/strands')
    if (isStrandsEnabled()) {
      const enrich = await strandsEnrichGitReview(
        repos.map((r) => `${r.owner}/${r.repo}`),
      )
      if (enrich?.narrative) {
        strandsNote = ` Strands: ${enrich.narrative}`
        if (enrich.flags?.length) strandsNote += ` Flags: ${enrich.flags.join('; ')}.`
      }
    }
  } catch {
    // Advisory only — never fail the gate on Bedrock errors
  }

  if (avg < 40) {
    return {
      ok: false,
      code: 'GIT_BLOCK',
      detail: `Git scorecard too low (${avg}/100). ${notes.join('; ')}.${strandsNote}`,
      score: avg,
    }
  }
  return {
    ok: true,
    code: 'GIT_OK',
    detail: `Git scorecard ${avg}/100. ${notes.join('; ')}.${strandsNote}`,
    score: avg,
  }
}

export function complianceRecord(entry: {
  at: string
  stage: string
  hackathonId: string
  detail: string
  receiptId?: string
  gates?: GateResult[]
}): Record<string, unknown> {
  return {
    ...entry,
    immutable: true,
    product: 'hackpay',
    rail: 'INR',
  }
}

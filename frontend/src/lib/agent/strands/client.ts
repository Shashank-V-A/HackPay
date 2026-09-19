import { Agent, BedrockModel, tool, type ToolList } from '@strands-agents/sdk'
import { z } from 'zod'
import { getBedrockModelId, getBedrockRegion } from './config'

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

async function fetchGithubJson(path: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'hackpay-strands',
      ...(process.env.GITHUB_TOKEN?.trim()
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN.trim()}` }
        : {}),
    },
  })
  if (!res.ok) {
    return { error: `GitHub ${res.status}`, path }
  }
  return res.json()
}

export const fetchGithubRepoTool = tool({
  name: 'fetch_github_repo',
  description:
    'Fetch public GitHub repository metadata (stars, license, description, last push, language).',
  inputSchema: z.object({
    repoUrlOrSlug: z
      .string()
      .describe('GitHub URL or owner/repo slug, e.g. https://github.com/acme/app or acme/app'),
  }),
  callback: async ({ repoUrlOrSlug }) => {
    const parsed = parseGithubRepo(repoUrlOrSlug)
    if (!parsed) return { error: 'Could not parse GitHub repo from input' }
    const data = (await fetchGithubJson(`/repos/${parsed.owner}/${parsed.repo}`)) as Record<
      string,
      unknown
    >
    if (data.error) return data
    return {
      fullName: data.full_name,
      description: data.description,
      stars: data.stargazers_count,
      forks: data.forks_count,
      openIssues: data.open_issues_count,
      language: data.language,
      license: (data.license as { spdx_id?: string } | null)?.spdx_id || null,
      pushedAt: data.pushed_at,
      createdAt: data.created_at,
      defaultBranch: data.default_branch,
      topics: data.topics || [],
      archived: data.archived,
      homepage: data.homepage,
    }
  },
})

export const fetchGithubReadmeTool = tool({
  name: 'fetch_github_readme',
  description: 'Fetch the README markdown (truncated) for a public GitHub repository.',
  inputSchema: z.object({
    repoUrlOrSlug: z.string().describe('GitHub URL or owner/repo slug'),
  }),
  callback: async ({ repoUrlOrSlug }) => {
    const parsed = parseGithubRepo(repoUrlOrSlug)
    if (!parsed) return { error: 'Could not parse GitHub repo from input' }
    const data = (await fetchGithubJson(
      `/repos/${parsed.owner}/${parsed.repo}/readme`,
    )) as Record<string, unknown>
    if (data.error) return data
    const content = typeof data.content === 'string' ? data.content : ''
    const encoding = String(data.encoding || 'base64')
    let text = ''
    try {
      text =
        encoding === 'base64'
          ? Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8')
          : content
    } catch {
      text = ''
    }
    return {
      name: data.name,
      path: data.path,
      htmlUrl: data.html_url,
      excerpt: text.slice(0, 6000),
    }
  },
})

export function createHackPayStrandsAgent(opts?: {
  systemPrompt?: string
  tools?: ToolList
}) {
  const model = new BedrockModel({
    region: getBedrockRegion(),
    modelId: getBedrockModelId(),
    temperature: 0.2,
    maxTokens: 2048,
  })

  return new Agent({
    model,
    systemPrompt:
      opts?.systemPrompt ||
      `You are HackPay's orchestration assistant for INR hackathon prize escrow.
You analyze timelines, craft clear notifications, and advise on repo quality for winner selection.
You NEVER move money, co-approve payouts, or claim funds were released.
Dual-control (organizer + sponsor) remains mandatory for any payout.
Be concise, concrete, and India/INR aware. Prefer actionable next steps.`,
    tools: opts?.tools ?? [fetchGithubRepoTool, fetchGithubReadmeTool],
    printer: false,
  })
}

export function textFromAgentResult(result: { toString(): string; lastMessage?: { content?: unknown } }): string {
  const raw = String(result)
  if (raw && raw !== '[object Object]') return raw.trim()
  return ''
}

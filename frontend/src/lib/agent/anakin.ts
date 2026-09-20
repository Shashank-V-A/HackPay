/**
 * Anakin — surf public GitHub repo pages → markdown (browser-capable scrape).
 * REST only (no SDK) so we avoid extra npm installs on tight disks.
 *
 * Docs: https://anakin.io/agent-onboarding/SKILL.md
 * Env: ANAKIN_API_KEY=ak-...
 */

const ANAKIN_BASE = 'https://api.anakin.io/v1'

function apiKey(): string {
  return process.env.ANAKIN_API_KEY?.trim() || ''
}

export function isAnakinConfigured(): boolean {
  return Boolean(apiKey())
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

/**
 * Scrape a URL to markdown via Anakin (optional stealth browser for JS pages).
 */
export async function anakinScrapeUrl(
  url: string,
  opts?: { useBrowser?: boolean; timeoutMs?: number },
): Promise<{ ok: boolean; markdown?: string; error?: string }> {
  const key = apiKey()
  if (!key) {
    return { ok: false, error: 'ANAKIN_API_KEY is not set' }
  }

  try {
    const start = await fetch(`${ANAKIN_BASE}/url-scraper`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key,
      },
      body: JSON.stringify({
        url,
        useBrowser: Boolean(opts?.useBrowser),
      }),
    })
    if (!start.ok) {
      const text = await start.text().catch(() => '')
      return { ok: false, error: text.slice(0, 200) || `Anakin start ${start.status}` }
    }
    const started = (await start.json()) as { jobId?: string; error?: string }
    const jobId = started.jobId
    if (!jobId) {
      return { ok: false, error: started.error || 'Anakin did not return jobId' }
    }

    const deadline = Date.now() + (opts?.timeoutMs ?? 90_000)
    while (Date.now() < deadline) {
      await sleep(3000)
      const poll = await fetch(`${ANAKIN_BASE}/url-scraper/${encodeURIComponent(jobId)}`, {
        headers: { 'X-API-Key': key },
      })
      if (!poll.ok) {
        const text = await poll.text().catch(() => '')
        return { ok: false, error: text.slice(0, 200) || `Anakin poll ${poll.status}` }
      }
      const body = (await poll.json()) as {
        status?: string
        markdown?: string
        error?: string
      }
      if (body.status === 'completed') {
        return { ok: true, markdown: body.markdown || '' }
      }
      if (body.status === 'failed') {
        return { ok: false, error: body.error || 'Anakin scrape failed' }
      }
    }
    return { ok: false, error: 'Anakin scrape timed out' }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Anakin request failed',
    }
  }
}

/**
 * Surf a public GitHub repo: repo home + README raw/html pages via Anakin.
 */
export async function anakinSurfGithubRepo(githubUrl: string): Promise<{
  ok: boolean
  repoMarkdown: string
  readmeMarkdown: string
  errors: string[]
}> {
  const base = githubUrl.replace(/\/$/, '')
  const errors: string[] = []
  let repoMarkdown = ''
  let readmeMarkdown = ''

  const home = await anakinScrapeUrl(base, { useBrowser: false })
  if (home.ok) repoMarkdown = home.markdown || ''
  else errors.push(`repo page: ${home.error}`)

  // Try common README locations (Anakin surfs the link; GitHub may serve HTML).
  for (const path of ['/blob/main/README.md', '/blob/master/README.md', '#readme']) {
    const url = path.startsWith('#') ? `${base}${path}` : `${base}${path}`
    const page = await anakinScrapeUrl(url, { useBrowser: path === '#readme' })
    if (page.ok && (page.markdown || '').length > 80) {
      readmeMarkdown = page.markdown || ''
      break
    }
    if (!page.ok) errors.push(`${path}: ${page.error}`)
  }

  return {
    ok: Boolean(repoMarkdown || readmeMarkdown),
    repoMarkdown,
    readmeMarkdown,
    errors,
  }
}

const MAX_FILES = Number(process.env.ANAKIN_DEEP_MAX_FILES || 24)
const MAX_FILE_BYTES = Number(process.env.ANAKIN_DEEP_MAX_FILE_BYTES || 48_000)
const MAX_TOTAL_CHARS = Number(process.env.ANAKIN_DEEP_MAX_TOTAL_CHARS || 120_000)

const PRIORITY_NAMES = new Set(
  [
    'readme.md',
    'package.json',
    'cargo.toml',
    'go.mod',
    'pyproject.toml',
    'requirements.txt',
    'dockerfile',
    'docker-compose.yml',
    'tsconfig.json',
    'next.config.ts',
    'next.config.js',
    'main.py',
    'main.ts',
    'server.js',
    'server.ts',
    'agentcard.json',
    'license',
    'contributing.md',
  ].map((s) => s.toLowerCase()),
)

const SKIP_DIR =
  /(?:^|\/)(?:node_modules|\.git|\.next|dist|build|coverage|vendor|__pycache__|\.turbo|\.cache|target)(?:\/|$)/i
const TEXT_EXT =
  /\.(md|mdx|txt|json|ya?ml|toml|js|jsx|ts|tsx|mjs|cjs|py|rs|go|java|css|scss|html|sh|sql)$/i

function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'hackpay-anakin-deep',
    ...(process.env.GITHUB_TOKEN?.trim()
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN.trim()}` }
      : {}),
  }
}

async function fetchGithubJson(path: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, { headers: githubHeaders() })
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`)
  return res.json()
}

function filePriority(path: string): number {
  const base = path.split('/').pop()?.toLowerCase() || ''
  let score = 0
  if (PRIORITY_NAMES.has(base)) score += 100
  if (/^readme/i.test(base)) score += 80
  if (/(^|\/)(src|app|lib|server|api|agents)\//i.test(path)) score += 40
  if (/(^|\/)(test|tests|__tests__|spec)\//i.test(path)) score += 25
  if (/\.(ts|tsx|js|jsx|py|rs|go)$/i.test(base)) score += 20
  score -= Math.min(30, path.split('/').length * 3)
  return score
}

function selectDeepPaths(treePaths: string[]): string[] {
  return treePaths
    .filter((p) => p && !SKIP_DIR.test(p))
    .filter((p) => {
      const base = p.split('/').pop() || ''
      return TEXT_EXT.test(base) || PRIORITY_NAMES.has(base.toLowerCase()) || /^readme/i.test(base)
    })
    .map((path) => ({ path, score: filePriority(path) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FILES)
    .map((c) => c.path)
}

async function fetchRawFile(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
): Promise<{ ok: boolean; text: string; error?: string }> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${filePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
  const res = await fetch(url, { headers: { 'User-Agent': 'hackpay-anakin-deep' } })
  if (!res.ok) return { ok: false, text: '', error: `raw ${res.status}` }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.includes(0)) return { ok: false, text: '', error: 'binary' }
  const text =
    buf.length > MAX_FILE_BYTES
      ? buf.subarray(0, MAX_FILE_BYTES).toString('utf8') + '\n…[truncated]'
      : buf.toString('utf8')
  return { ok: true, text }
}

export type DeepSurfResult = {
  ok: boolean
  files: Array<{ path: string; chars: number; source: string }>
  repoMarkdown: string
  readmeMarkdown: string
  corpus: string
  errors: string[]
  stats: { treeFiles: number; reviewed: number; chars: number; branch: string }
}

/** Deep pass: GitHub tree sample + raw files + Anakin repo overview. */
export async function anakinDeepSurfGithubRepo(githubUrl: string): Promise<DeepSurfResult> {
  const match = String(githubUrl || '').match(/github\.com\/([^/\s]+)\/([^/\s?#]+)/i)
  if (!match) {
    return {
      ok: false,
      files: [],
      repoMarkdown: '',
      readmeMarkdown: '',
      corpus: '',
      errors: ['invalid github url'],
      stats: { treeFiles: 0, reviewed: 0, chars: 0, branch: '' },
    }
  }
  const owner = match[1]
  const repo = match[2].replace(/\.git$/i, '')
  const base = `https://github.com/${owner}/${repo}`
  const errors: string[] = []
  const fileBodies: Array<{ path: string; chars: number; source: string; text: string }> = []

  let repoMarkdown = ''
  if (isAnakinConfigured()) {
    const home = await anakinScrapeUrl(base, { useBrowser: false, timeoutMs: 60_000 })
    if (home.ok) repoMarkdown = home.markdown || ''
    else errors.push(`anakin home: ${home.error}`)
  }

  let branch = 'main'
  let treePaths: string[] = []
  try {
    const meta = (await fetchGithubJson(`/repos/${owner}/${repo}`)) as { default_branch?: string }
    branch = meta.default_branch || 'main'
    const tree = (await fetchGithubJson(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    )) as { tree?: Array<{ type?: string; path?: string }> }
    treePaths = (tree.tree || [])
      .filter((n) => n.type === 'blob' && typeof n.path === 'string')
      .map((n) => n.path as string)
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'tree failed')
    const shallow = await anakinSurfGithubRepo(base)
    return {
      ok: shallow.ok,
      files: [],
      repoMarkdown: shallow.repoMarkdown || repoMarkdown,
      readmeMarkdown: shallow.readmeMarkdown,
      corpus: [shallow.repoMarkdown, shallow.readmeMarkdown].filter(Boolean).join('\n\n'),
      errors: [...errors, ...shallow.errors],
      stats: { treeFiles: 0, reviewed: 0, chars: shallow.readmeMarkdown.length, branch },
    }
  }

  const selected = selectDeepPaths(treePaths)
  let totalChars = 0
  let readmeMarkdown = ''

  for (const filePath of selected) {
    if (totalChars >= MAX_TOTAL_CHARS) break
    const fetched = await fetchRawFile(owner, repo, branch, filePath)
    if (!fetched.ok || !fetched.text.trim()) {
      errors.push(`${filePath}: ${fetched.error || 'empty'}`)
      continue
    }
    fileBodies.push({
      path: filePath,
      chars: fetched.text.length,
      source: 'raw',
      text: fetched.text,
    })
    totalChars += fetched.text.length
    const baseName = filePath.split('/').pop() || ''
    if (/^readme/i.test(baseName) && fetched.text.length > readmeMarkdown.length) {
      readmeMarkdown = fetched.text
    }
  }

  const parts: string[] = []
  if (repoMarkdown) parts.push(`## Repository overview (Anakin)\n\n${repoMarkdown.slice(0, 12_000)}`)
  let used = parts.join('\n').length
  for (const f of fileBodies) {
    if (used >= MAX_TOTAL_CHARS) break
    const chunk = `## File: ${f.path}\n\n${f.text}`
    const room = MAX_TOTAL_CHARS - used
    parts.push(chunk.slice(0, room))
    used += Math.min(chunk.length, room)
  }
  const corpus = parts.join('\n\n---\n\n')

  return {
    ok: fileBodies.length > 0 || Boolean(repoMarkdown || readmeMarkdown),
    files: fileBodies.map(({ path, chars, source }) => ({ path, chars, source })),
    repoMarkdown,
    readmeMarkdown,
    corpus,
    errors: errors.slice(0, 12),
    stats: {
      treeFiles: treePaths.length,
      reviewed: fileBodies.length,
      chars: corpus.length,
      branch,
    },
  }
}

export function buildDeepNarrative(input: {
  idea: string
  owner: string
  repo: string
  deep: DeepSurfResult
}): { markdown: string; ideaCoverage: number; flags: Record<string, boolean> } {
  const paths = input.deep.files.map((f) => f.path)
  const flags = {
    hasTests: paths.some((p) => /(^|\/)(test|tests|__tests__|spec)(\/|\.|$)/i.test(p)),
    hasCi: paths.some((p) => /\.github\/workflows\//i.test(p)),
    hasDocker: paths.some((p) => /dockerfile|docker-compose/i.test(p)),
    hasApi: paths.some((p) => /(^|\/)(api|routes|server|handlers)\//i.test(p)),
    hasFrontend: paths.some(
      (p) => /\.(tsx|jsx|vue|svelte)$/i.test(p) || /(^|\/)(app|pages|components)\//i.test(p),
    ),
    hasAgents: paths.some((p) => /(^|\/)agents\//i.test(p) || /agentcard/i.test(p)),
  }
  const ideaTokens = String(input.idea || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
  const corpusLower = input.deep.corpus.toLowerCase()
  const ideaHits = ideaTokens.filter((t) => corpusLower.includes(t))
  const ideaCoverage = ideaTokens.length
    ? Math.round((ideaHits.length / ideaTokens.length) * 100)
    : 0

  const lines = [
    `# Deep repository report — ${input.owner}/${input.repo}`,
    '',
    `Anakin + GitHub tree analysis reviewed **${input.deep.stats.reviewed}** text files (of **${input.deep.stats.treeFiles}** on \`${input.deep.stats.branch}\`), ~${Math.round(input.deep.stats.chars / 1000)}k characters.`,
    '',
    '## Idea alignment',
    ideaTokens.length
      ? `About **${ideaCoverage}%** of distinctive idea keywords appear in the sample${ideaHits.length ? ` (e.g. ${ideaHits.slice(0, 8).join(', ')})` : ''}.`
      : 'No detailed idea text provided.',
    '',
    '## Architecture signals',
    `Detected: ${
      Object.entries(flags)
        .filter(([, v]) => v)
        .map(([k]) => k.replace(/^has/, ''))
        .join(', ') || 'limited'
    }.`,
    '',
    '## Files reviewed',
    ...input.deep.files.slice(0, 30).map((f) => `- \`${f.path}\` (${f.chars} chars, ${f.source})`),
    '',
    '## Findings',
    flags.hasTests ? '- Tests present in sample.' : '- Little/no tests in sample.',
    flags.hasCi ? '- CI workflows found.' : '- No CI workflow spotted.',
    (input.deep.readmeMarkdown || '').length > 200
      ? '- README has meaningful depth.'
      : '- README thin or missing — expand setup + demo.',
    '',
    '## Overall',
    `Automated deep pass (capped at ${MAX_FILES} files). Advisory only — humans still approve payouts.`,
  ]

  return { markdown: lines.join('\n'), ideaCoverage, flags }
}

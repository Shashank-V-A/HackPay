import {
  parseGithubRepo,
  type SubmissionAssessment,
  type SubmissionScores,
} from '@/lib/db/repoSubmission'
import {
  anakinDeepSurfGithubRepo,
  anakinSurfGithubRepo,
  buildDeepNarrative,
  isAnakinConfigured,
} from '@/lib/agent/anakin'

type GithubRepoMeta = {
  full_name?: string
  description?: string | null
  stargazers_count?: number
  forks_count?: number
  open_issues_count?: number
  language?: string | null
  license?: { spdx_id?: string } | null
  pushed_at?: string | null
  created_at?: string | null
  default_branch?: string
  topics?: string[]
  archived?: boolean
  homepage?: string | null
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
}

function ideaFitScore(idea: string, meta: GithubRepoMeta, readmeText: string): number {
  const ideaTokens = new Set(tokenize(idea))
  if (!ideaTokens.size) return 40
  const corpus = tokenize(
    [meta.description || '', meta.full_name || '', ...(meta.topics || []), readmeText.slice(0, 4000)].join(
      ' ',
    ),
  )
  if (!corpus.length) return 35
  const corpusSet = new Set(corpus)
  let hits = 0
  for (const t of ideaTokens) {
    if (corpusSet.has(t)) hits += 1
  }
  const ratio = hits / ideaTokens.size
  return clamp(30 + ratio * 70)
}

async function fetchGithubJson(path: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'hackpay-submission-assess',
      ...(process.env.GITHUB_TOKEN?.trim()
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN.trim()}` }
        : {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} for ${path}`)
  }
  return res.json()
}

async function fetchReadmeText(owner: string, repo: string): Promise<string> {
  try {
    const data = (await fetchGithubJson(`/repos/${owner}/${repo}/readme`)) as {
      content?: string
      encoding?: string
    }
    if (!data.content) return ''
    if (data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf8')
    }
    return String(data.content)
  } catch {
    return ''
  }
}

function buildScores(input: {
  ideaFit: number
  meta: GithubRepoMeta
  hasReadme: boolean
  readmeLen: number
}): SubmissionScores {
  const licenseOk = Boolean(input.meta.license?.spdx_id && input.meta.license.spdx_id !== 'NOASSERTION')
  const recent =
    input.meta.pushed_at &&
    Date.now() - new Date(input.meta.pushed_at).getTime() < 1000 * 60 * 60 * 24 * 180

  let completeness = 35
  if (input.hasReadme) completeness += 25
  if (input.readmeLen > 400) completeness += 15
  if (licenseOk) completeness += 15
  if (input.meta.language) completeness += 10

  let activity = 30
  if (recent) activity += 35
  if ((input.meta.stargazers_count || 0) > 0) activity += 15
  if ((input.meta.forks_count || 0) > 0) activity += 10
  if (!input.meta.archived) activity += 10

  let docs = 25
  if (input.hasReadme) docs += 30
  if (input.readmeLen > 800) docs += 20
  if (input.meta.homepage) docs += 10
  if ((input.meta.topics || []).length) docs += 15

  const ideaFit = clamp(input.ideaFit)
  const completenessN = clamp(completeness)
  const activityN = clamp(activity)
  const docsN = clamp(docs)
  const overall = clamp(ideaFit * 0.35 + completenessN * 0.25 + activityN * 0.2 + docsN * 0.2)

  return {
    ideaFit,
    completeness: completenessN,
    activity: activityN,
    docs: docsN,
    overall,
  }
}

/**
 * Public-repo assessment (Accio-style).
 * - GitHub API for metadata
 * - Anakin scrapes the repo URL / README pages when ANAKIN_API_KEY is set
 * - Deploy the same logic as a Nasiko A2A agent under agents/git-eval/
 */
export async function assessPublicRepoSubmission(input: {
  idea: string
  githubUrl: string
}): Promise<SubmissionAssessment> {
  const parsed = parseGithubRepo(input.githubUrl)
  if (!parsed) {
    throw new Error('Invalid GitHub repository URL')
  }

  const meta = (await fetchGithubJson(`/repos/${parsed.owner}/${parsed.repo}`)) as GithubRepoMeta

  let readme = await fetchReadmeText(parsed.owner, parsed.repo)
  let anakinNote = ''
  let usedAnakin = false
  let deepReport = ''
  let filesReviewed: Array<{ path: string; chars: number; source: string }> = []
  let ideaCoverage = 0
  let deepFlags: Record<string, boolean> = {}
  let corpus = ''

  const deepEnabled = (process.env.ANAKIN_DEEP_SURF || 'true').toLowerCase() !== 'false'

  if (isAnakinConfigured() && deepEnabled) {
    usedAnakin = true
    const deep = await anakinDeepSurfGithubRepo(parsed.url)
    corpus = deep.corpus
    if (deep.readmeMarkdown && deep.readmeMarkdown.length > readme.length) readme = deep.readmeMarkdown
    else if (!readme && deep.repoMarkdown) readme = deep.repoMarkdown
    filesReviewed = deep.files
    const narrative = buildDeepNarrative({
      idea: input.idea,
      owner: parsed.owner,
      repo: parsed.repo,
      deep,
    })
    deepReport = narrative.markdown
    ideaCoverage = narrative.ideaCoverage
    deepFlags = narrative.flags
    anakinNote = deep.ok
      ? ` Deep pass: ${deep.stats.reviewed}/${deep.stats.treeFiles} files.`
      : ` Deep partial: ${deep.errors.slice(0, 2).join('; ')}.`
  } else if (isAnakinConfigured()) {
    const surf = await anakinSurfGithubRepo(parsed.url)
    usedAnakin = true
    if (surf.readmeMarkdown && surf.readmeMarkdown.length > readme.length) {
      readme = surf.readmeMarkdown
    } else if (!readme && surf.repoMarkdown) {
      readme = surf.repoMarkdown
    }
    if (surf.ok) {
      anakinNote = ' Anakin surfed the public GitHub pages for deeper README/context.'
    } else if (surf.errors.length) {
      anakinNote = ` Anakin surf partial: ${surf.errors.slice(0, 2).join('; ')}.`
    }
  }

  const hasReadme = readme.trim().length > 40
  let ideaFit = ideaFitScore(input.idea, meta, corpus || readme)
  if (ideaCoverage > 0) ideaFit = Math.max(0, Math.min(100, Math.round(25 + ideaCoverage * 0.7)))
  const scores = buildScores({
    ideaFit,
    meta,
    hasReadme,
    readmeLen: readme.length,
  })

  if (filesReviewed.length >= 8) scores.completeness = Math.min(100, scores.completeness + 10)
  if (deepFlags.hasTests) scores.docs = Math.min(100, scores.docs + 8)
  if (deepFlags.hasCi) scores.docs = Math.min(100, scores.docs + 6)
  scores.overall = Math.round(
    scores.ideaFit * 0.35 + scores.completeness * 0.25 + scores.activity * 0.2 + scores.docs * 0.2,
  )
  const license = meta.license?.spdx_id || null
  const strengths: string[] = []
  const improvements: string[] = []

  if (scores.ideaFit >= 70) strengths.push('Idea–repository alignment')
  else improvements.push('Tighten README/description so it mirrors the stated idea')

  if (hasReadme && readme.length > 400) strengths.push('Documentation / README depth')
  else improvements.push('Expand README with problem statement, setup, and demo')

  if (license && license !== 'NOASSERTION') strengths.push(`Clear license (${license})`)
  else improvements.push('Add an SPDX license to the repository')

  if (meta.language) strengths.push(`${meta.language} implementation present`)
  else improvements.push('Ensure primary language is detectable on GitHub')

  if (
    meta.pushed_at &&
    Date.now() - new Date(meta.pushed_at).getTime() < 1000 * 60 * 60 * 24 * 30
  ) {
    strengths.push('Recent commit activity')
  } else {
    improvements.push('Push updates during the hackathon window')
  }

  if ((meta.topics || []).length) strengths.push('Repository topics / discoverability')
  if (meta.archived) improvements.push('Repository is archived — unarchive or fork an active copy')
  if (usedAnakin && (anakinNote.includes('surfed') || anakinNote.includes('Deep'))) {
    strengths.push('Anakin deep repository surf')
  }
  if (filesReviewed.length >= 8) strengths.push(`Reviewed ${filesReviewed.length} source/docs files`)
  if (deepFlags.hasTests) strengths.push('Test layout detected')
  else if (usedAnakin) improvements.push('Add automated tests')

  while (strengths.length < 3) {
    const pad = 'Public repository is reachable for review'
    if (strengths.includes(pad)) break
    strengths.push(pad)
  }
  const improvementPads = [
    'Add tests, demo link, or architecture notes',
    'Add architecture notes or demo assets',
    'Document setup and run instructions',
  ]
  for (const pad of improvementPads) {
    if (improvements.length >= 3) break
    if (!improvements.includes(pad)) improvements.push(pad)
  }

  const signals: SubmissionAssessment['signals'] = [
    { label: 'License', value: license || 'None' },
    { label: 'Language', value: meta.language || 'Unknown' },
    { label: 'Stars', value: String(meta.stargazers_count || 0) },
    {
      label: 'Last push',
      value: meta.pushed_at ? new Date(meta.pushed_at).toLocaleDateString() : 'Unknown',
    },
    { label: 'README', value: hasReadme ? 'Yes' : 'Missing' },
    { label: 'Files reviewed', value: String(filesReviewed.length) },
    { label: 'Idea coverage', value: ideaCoverage ? `${ideaCoverage}%` : 'n/a' },
    { label: 'Archived', value: meta.archived ? 'Y' : 'N' },
    { label: 'Anakin', value: usedAnakin ? (deepReport ? 'Deep' : 'Used') : 'Off' },
  ]

  const overallFeedback = [
    scores.ideaFit >= 65
      ? 'Repository content reasonably matches the stated idea.'
      : 'Idea fit is weak — README and description should echo the problem statement more clearly.',
    hasReadme
      ? 'Documentation is present for reviewers.'
      : 'Missing README will block deeper evaluation.',
    `Overall submission score ${scores.overall}/100 across idea fit, completeness, activity, and docs.${anakinNote}`,
  ].join(' ')

  const aiFeedback = deepReport
    ? deepReport
    : [
        `Assessed public repo ${parsed.owner}/${parsed.repo}.`,
        meta.description ? `GitHub description: “${meta.description}”.` : 'No GitHub description set.',
        anakinNote.trim(),
        'Advisory only — payout still requires human dual approval and HackPay payment/git gates.',
      ]
        .filter(Boolean)
        .join(' ')

  return {
    assessedAt: new Date().toISOString(),
    provider: usedAnakin ? 'nasiko-anakin' : 'hackpay-heuristic',
    scores,
    evidence: {
      license,
      language: meta.language || null,
      stars: meta.stargazers_count || 0,
      lastPush: meta.pushed_at || null,
      description: meta.description || null,
      topics: meta.topics || [],
      hasReadme,
      filesReviewed: filesReviewed.length,
      treeSample: filesReviewed.slice(0, 24).map((f) => f.path),
      ideaCoverage,
      deepFlags,
    },
    signals,
    strengths: strengths.slice(0, 8),
    improvements: improvements.slice(0, 8),
    overallFeedback,
    aiFeedback,
    deepReport: deepReport || undefined,
    filesReviewed,
  }
}

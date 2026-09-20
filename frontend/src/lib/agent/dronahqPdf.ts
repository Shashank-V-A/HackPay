/**
 * DronaHQ PDF Creator integration for HackPay assessment reports.
 *
 * PDF generation itself runs inside DronaHQ (GetPDF / GetPDFURL in an Automation
 * or Action Flow) — see https://docs.dronahq.com/pdf-creator-generate-pdf/
 *
 * HackPay posts assessment fields to DRONAHQ_PDF_GENERATE_URL (Automation webhook).
 * The automation should bind those fields to a published Regular template and
 * return JSON with a PDF URL or Base64 payload.
 */

import type { RepoSubmission } from '@/lib/db/repoSubmission'

export type DronaHqPdfPayload = {
  event: 'assessment.pdf.generate'
  pdfName: string
  templateId?: string
  submissionId: string
  hackathonId: string
  hackathonName: string
  participantName: string
  idea: string
  githubUrl: string
  assessedAt: string
  provider: string
  scores: {
    overall: number
    ideaFit: number
    completeness: number
    activity: number
    docs: number
  }
  strengths: string
  improvements: string
  overallFeedback: string
  aiFeedback: string
  signals: string
  deepReport: string
}

export type DronaHqPdfResult = {
  ok: boolean
  skipped?: boolean
  error?: string
  pdfUrl?: string
  pdfBase64?: string
  pdfName?: string
}

function trimEnv(name: string): string {
  return process.env[name]?.trim() || ''
}

export function getDronaHqPdfGenerateUrl(): string {
  return trimEnv('DRONAHQ_PDF_GENERATE_URL')
}

export function getDronaHqPdfTemplateId(): string {
  return trimEnv('DRONAHQ_PDF_TEMPLATE_ID')
}

export function getDronaHqPdfApiKey(): string {
  return trimEnv('DRONAHQ_PDF_API_KEY') || trimEnv('DRONAHQ_WEBHOOK_API_KEY')
}

export function isDronaHqPdfConfigured(): boolean {
  return Boolean(getDronaHqPdfGenerateUrl())
}

export function buildDronaHqPdfPayload(submission: RepoSubmission): DronaHqPdfPayload | null {
  const a = submission.assessment
  if (!a) return null

  const safeName = (submission.participantName || 'participant')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 40)

  return {
    event: 'assessment.pdf.generate',
    pdfName: `HackPay-Assessment-${safeName}-${submission.hackathonId.slice(0, 12)}`,
    templateId: getDronaHqPdfTemplateId() || undefined,
    submissionId: submission.id,
    hackathonId: submission.hackathonId,
    hackathonName: submission.hackathonName,
    participantName: submission.participantName,
    idea: submission.idea,
    githubUrl: submission.githubUrl,
    assessedAt: a.assessedAt,
    provider: a.provider,
    scores: { ...a.scores },
    strengths: a.strengths.join('\n• '),
    improvements: a.improvements.join('\n• '),
    overallFeedback: a.overallFeedback,
    aiFeedback: a.aiFeedback || '',
    signals: a.signals.map((s) => `${s.label}: ${s.value}`).join('\n'),
    deepReport: a.deepReport || '',
  }
}

function pickPdfFromResponse(data: unknown): { pdfUrl?: string; pdfBase64?: string; pdfName?: string } {
  if (!data || typeof data !== 'object') return {}
  const root = data as Record<string, unknown>
  const nested =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : null

  const pdfUrl =
    (typeof root.pdfUrl === 'string' && root.pdfUrl) ||
    (typeof root.pdf_url === 'string' && root.pdf_url) ||
    (typeof root.pdfFile === 'string' && /^https?:\/\//i.test(root.pdfFile) && root.pdfFile) ||
    (typeof root.url === 'string' && root.url) ||
    (nested && typeof nested.pdfUrl === 'string' && nested.pdfUrl) ||
    (nested && typeof nested.pdfFile === 'string' && /^https?:\/\//i.test(nested.pdfFile) && nested.pdfFile) ||
    undefined

  const pdfBase64 =
    (typeof root.pdfBase64 === 'string' && root.pdfBase64) ||
    (typeof root.pdf_base64 === 'string' && root.pdf_base64) ||
    (typeof root.pdfFile === 'string' && !/^https?:\/\//i.test(root.pdfFile) && root.pdfFile) ||
    (nested && typeof nested.pdfFile === 'string' && !/^https?:\/\//i.test(nested.pdfFile) && nested.pdfFile) ||
    undefined

  const pdfName =
    (typeof root.pdfName === 'string' && root.pdfName) ||
    (typeof root.pdf_name === 'string' && root.pdf_name) ||
    undefined

  return { pdfUrl: pdfUrl || undefined, pdfBase64: pdfBase64 || undefined, pdfName }
}

/**
 * Ask DronaHQ Automation (PDF Creator GetPDF / GetPDFURL) to render the report.
 */
export async function generateAssessmentPdfViaDronaHq(
  submission: RepoSubmission,
): Promise<DronaHqPdfResult> {
  const url = getDronaHqPdfGenerateUrl()
  if (!url) {
    return {
      ok: false,
      skipped: true,
      error:
        'DronaHQ PDF not configured. Set DRONAHQ_PDF_GENERATE_URL to your Automation webhook that runs PDF Creator GetPDFURL.',
    }
  }

  const payload = buildDronaHqPdfPayload(submission)
  if (!payload) {
    return { ok: false, error: 'No assessment to render as PDF' }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const apiKey = getDronaHqPdfApiKey()
  if (apiKey) {
    headers['api-key'] = apiKey
    headers.Authorization = `Bearer ${apiKey}`
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    const text = await res.text().catch(() => '')
    let data: unknown
    try {
      data = text ? JSON.parse(text) : undefined
    } catch {
      data = undefined
    }

    if (!res.ok) {
      return {
        ok: false,
        error: text.slice(0, 240) || `DronaHQ PDF failed (${res.status})`,
      }
    }

    const picked = pickPdfFromResponse(data)
    if (!picked.pdfUrl && !picked.pdfBase64) {
      const preview =
        typeof data === 'object' && data
          ? JSON.stringify(data).slice(0, 180)
          : String(data ?? '').slice(0, 180)
      return {
        ok: false,
        error:
          `DronaHQ returned no PDF URL (got ${preview || 'empty'}). Add a Response block after GetPDFURL that returns {"pdfUrl":"{{hackpay.pdfFile}}"} (use your task name + pdfFile/pdfUrl output).`,
      }
    }

    return {
      ok: true,
      pdfUrl: picked.pdfUrl,
      pdfBase64: picked.pdfBase64,
      pdfName: picked.pdfName || payload.pdfName,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'DronaHQ PDF request failed',
    }
  }
}

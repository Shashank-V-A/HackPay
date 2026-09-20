import { NextResponse } from 'next/server'
import { AuthError, requireAuthIfConfigured } from '@/lib/aws/auth'
import { isDatabaseConfigured } from '@/lib/aws/dbReady'
import { getActiveDataBackend } from '@/lib/aws/env'
import {
  generateAssessmentPdfViaDronaHq,
  isDronaHqPdfConfigured,
} from '@/lib/agent/dronahqPdf'
import { createSupabaseServerClient } from '@/lib/db/server'
import { getSubmission } from '@/lib/db/repoSubmission'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Generate a professional assessment PDF via DronaHQ PDF Creator.
 * Body: { hackathonId, wallet? }
 *
 * Requires a DronaHQ Automation webhook (DRONAHQ_PDF_GENERATE_URL) that runs
 * GetPDF / GetPDFURL against a published report template.
 * @see https://docs.dronahq.com/pdf-creator-overview/
 */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: 'DYNAMODB_TABLE_NAME is not configured' },
      { status: 503 },
    )
  }

  if (!isDronaHqPdfConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Set DRONAHQ_PDF_GENERATE_URL to your DronaHQ Automation webhook that generates the assessment PDF.',
        docs: 'https://docs.dronahq.com/pdf-creator-generate-pdf/',
      },
      { status: 503 },
    )
  }

  try {
    const body = (await request.json()) as { hackathonId?: string; wallet?: string }

    let auth: Awaited<ReturnType<typeof requireAuthIfConfigured>> = null
    try {
      auth = await requireAuthIfConfigured(request)
    } catch (err) {
      if (!(err instanceof AuthError) || !body.wallet) throw err
    }

    const wallet = (auth?.email || body.wallet || '').trim().toLowerCase()
    const hackathonId = body.hackathonId?.trim() || ''
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 })
    }
    if (!hackathonId) {
      return NextResponse.json({ success: false, error: 'hackathonId is required' }, { status: 400 })
    }

    const db = createSupabaseServerClient()
    const submission = await getSubmission(db, hackathonId, wallet)
    if (!submission) {
      return NextResponse.json({ success: false, error: 'Submission not found' }, { status: 404 })
    }
    if (!submission.assessment) {
      return NextResponse.json(
        { success: false, error: 'Generate an assessment report before exporting PDF.' },
        { status: 400 },
      )
    }

    const pdf = await generateAssessmentPdfViaDronaHq(submission)
    if (!pdf.ok) {
      return NextResponse.json(
        { success: false, error: pdf.error || 'PDF generation failed' },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      pdfUrl: pdf.pdfUrl,
      pdfBase64: pdf.pdfBase64,
      pdfName: pdf.pdfName,
      provider: 'dronahq-pdf-creator',
      dataBackend: getActiveDataBackend(),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'PDF generation failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

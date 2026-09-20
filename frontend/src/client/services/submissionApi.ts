import { authHeaders } from '../utils/authSession'
import type { RepoSubmission } from '@/lib/db/repoSubmission'

export type { RepoSubmission }
export type { SubmissionAssessment, SubmissionScores } from '@/lib/db/repoSubmission'

export async function fetchMySubmissions(wallet: string): Promise<{
  success: boolean
  submissions?: RepoSubmission[]
  error?: string
}> {
  try {
    const qs = wallet ? `?wallet=${encodeURIComponent(wallet)}` : ''
    const res = await fetch(`/api/participants/submissions${qs}`, {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    })
    const data = (await res.json()) as {
      success?: boolean
      submissions?: RepoSubmission[]
      error?: string
    }
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `Load failed (${res.status})` }
    }
    return { success: true, submissions: data.submissions || [] }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Load failed',
    }
  }
}

export async function saveRepoSubmission(input: {
  wallet: string
  hackathonId: string
  idea: string
  githubUrl: string
  track?: string
  participantName?: string
}): Promise<{ success: boolean; submission?: RepoSubmission; error?: string }> {
  try {
    const res = await fetch('/api/participants/submissions', {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    })
    const data = (await res.json()) as {
      success?: boolean
      submission?: RepoSubmission
      error?: string
    }
    if (!res.ok || !data.success || !data.submission) {
      return { success: false, error: data.error || `Save failed (${res.status})` }
    }
    return { success: true, submission: data.submission }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Save failed',
    }
  }
}

export async function generateSubmissionAssessment(input: {
  wallet: string
  hackathonId: string
}): Promise<{ success: boolean; submission?: RepoSubmission; error?: string }> {
  try {
    const res = await fetch('/api/participants/submissions/assess', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    })
    const data = (await res.json()) as {
      success?: boolean
      submission?: RepoSubmission
      error?: string
    }
    if (!res.ok || !data.success || !data.submission) {
      return { success: false, error: data.error || `Assess failed (${res.status})` }
    }
    return { success: true, submission: data.submission }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Assess failed',
    }
  }
}

/** Generate professional PDF via DronaHQ PDF Creator Automation webhook. */
export async function downloadSubmissionAssessmentPdf(input: {
  wallet: string
  hackathonId: string
}): Promise<{
  success: boolean
  pdfUrl?: string
  pdfBase64?: string
  pdfName?: string
  error?: string
}> {
  try {
    const res = await fetch('/api/participants/submissions/pdf', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    })
    const data = (await res.json()) as {
      success?: boolean
      pdfUrl?: string
      pdfBase64?: string
      pdfName?: string
      error?: string
    }
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `PDF failed (${res.status})` }
    }
    return {
      success: true,
      pdfUrl: data.pdfUrl,
      pdfBase64: data.pdfBase64,
      pdfName: data.pdfName,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'PDF failed',
    }
  }
}

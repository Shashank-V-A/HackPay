'use client'

import { useState } from 'react'
import Icon from '../../components/Icon'
import {
  downloadSubmissionAssessmentPdf,
  type RepoSubmission,
} from '../../services/submissionApi'

function ScoreRing({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="pv-assess__score">
      <div
        className="pv-assess__ring"
        style={{
          background: `conic-gradient(var(--pv-accent, #0d9488) ${clamped * 3.6}deg, var(--pv-border, #e5e7eb) 0)`,
        }}
        aria-hidden
      >
        <span className="pv-assess__ring-inner">{clamped}%</span>
      </div>
      <span className="pv-assess__score-label">{label}</span>
    </div>
  )
}

interface SubmissionAssessmentReportProps {
  submission: RepoSubmission
  wallet?: string
  onBack?: () => void
  onRefresh?: () => void
  refreshing?: boolean
}

function triggerPdfDownload(opts: { pdfUrl?: string; pdfBase64?: string; pdfName?: string }) {
  const name = `${opts.pdfName || 'HackPay-Assessment'}.pdf`
  if (opts.pdfUrl) {
    window.open(opts.pdfUrl, '_blank', 'noopener,noreferrer')
    return
  }
  if (opts.pdfBase64) {
    const raw = opts.pdfBase64.includes(',')
      ? opts.pdfBase64.split(',')[1]
      : opts.pdfBase64
    const binary = atob(raw)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = name
    a.click()
    URL.revokeObjectURL(href)
  }
}

/**
 * Accio Matrix–inspired overall assessment report for a GitHub submission.
 * PDF export uses DronaHQ PDF Creator (Automation webhook).
 * @see https://docs.dronahq.com/pdf-creator-overview/
 */
export default function SubmissionAssessmentReport({
  submission,
  wallet,
  onBack,
  onRefresh,
  refreshing,
}: SubmissionAssessmentReportProps) {
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const a = submission.assessment
  if (!a) {
    return (
      <div className="pv-card">
        <div className="pv-empty">
          <h4 className="pv-empty__title">No assessment yet</h4>
          <p className="pv-empty__text">Generate a report after submitting your GitHub repo.</p>
          {onBack ? (
            <button type="button" className="pv-btn pv-btn--secondary" onClick={onBack}>
              Back
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="pv-assess">
      <div className="pv-assess__toolbar">
        {onBack ? (
          <button type="button" className="pv-btn pv-btn--ghost pv-btn--sm" onClick={onBack}>
            <Icon name="arrowLeft" size={14} />
            Back
          </button>
        ) : (
          <span />
        )}
        <div className="pv-assess__toolbar-actions" style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="pv-btn pv-btn--secondary pv-btn--sm"
            disabled={pdfBusy || typeof wallet !== 'string' || !wallet.trim()}
            title={
              typeof wallet !== 'string' || !wallet.trim()
                ? 'Sign in required for PDF export'
                : 'Export via DronaHQ PDF Creator'
            }
            onClick={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              const walletAddr = typeof wallet === 'string' ? wallet.trim() : ''
              if (!walletAddr) {
                setPdfError('Sign in required for PDF export')
                return
              }
              setPdfError(null)
              setPdfBusy(true)
              try {
                const res = await downloadSubmissionAssessmentPdf({
                  wallet: walletAddr,
                  hackathonId: String(submission.hackathonId || ''),
                })
                if (!res.success) {
                  setPdfError(res.error || 'PDF export failed')
                  return
                }
                triggerPdfDownload(res)
              } finally {
                setPdfBusy(false)
              }
            }}
          >
            {pdfBusy ? <span className="pv-btn__spinner" /> : <Icon name="download" size={14} />}
            Download PDF
          </button>
          {onRefresh ? (
            <button
              type="button"
              className="pv-btn pv-btn--secondary pv-btn--sm"
              onClick={onRefresh}
              disabled={refreshing}
            >
              {refreshing ? <span className="pv-btn__spinner" /> : <Icon name="refresh" size={14} />}
              Refresh report
            </button>
          ) : null}
        </div>
      </div>
      {pdfError ? (
        <p className="pv-assess__footnote" role="alert" style={{ color: 'var(--pv-danger, #b91c1c)' }}>
          {pdfError}
        </p>
      ) : null}

      <header className="pv-assess__hero">
        <p className="pv-assess__eyebrow">Overall Report</p>
        <h2 className="pv-assess__title">{submission.hackathonName || 'Hackathon submission'}</h2>
        <dl className="pv-assess__meta">
          <div>
            <dt>Candidate Name</dt>
            <dd>{submission.participantName}</dd>
          </div>
          <div>
            <dt>Repository</dt>
            <dd>
              <a href={submission.githubUrl} target="_blank" rel="noopener noreferrer">
                {submission.githubUrl.replace(/^https?:\/\//, '')}
              </a>
            </dd>
          </div>
          <div>
            <dt>Assessed</dt>
            <dd>{new Date(a.assessedAt).toLocaleString()}</dd>
          </div>
        </dl>
      </header>

      <section className="pv-assess__idea">
        <h3>Submitted idea</h3>
        <p>{submission.idea}</p>
      </section>

      <section className="pv-assess__scores" aria-label="Score summary">
        <ScoreRing value={a.scores.overall} label="Score percentage" />
        <ScoreRing value={a.scores.ideaFit} label="Idea fit" />
        <ScoreRing value={a.scores.completeness} label="Completeness" />
        <ScoreRing value={a.scores.activity} label="Activity" />
        <ScoreRing value={a.scores.docs} label="Docs" />
      </section>

      <section className="pv-assess__signals">
        <h3>Repository signals</h3>
        <div className="pv-assess__signal-grid">
          {a.signals.map((s) => (
            <div key={s.label} className="pv-assess__signal">
              <span className="pv-assess__signal-label">{s.label}</span>
              <span className="pv-assess__signal-value">{s.value}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="pv-assess__split">
        <section>
          <h3>Strong points</h3>
          <ul className="pv-assess__chips pv-assess__chips--ok">
            {[...new Set(a.strengths)].map((item, i) => (
              <li key={`strength-${i}`}>{item}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Areas of improvement</h3>
          <ul className="pv-assess__chips pv-assess__chips--warn">
            {[...new Set(a.improvements)].map((item, i) => (
              <li key={`improve-${i}`}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="pv-assess__feedback">
        <h3>Overall feedback</h3>
        <p>{a.overallFeedback}</p>
      </section>

      {a.aiFeedback ? (
        <section className="pv-assess__feedback pv-assess__feedback--ai">
          <h3>Deep AI assessment</h3>
          <pre
            className="pv-assess__deep"
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              fontSize: '0.92rem',
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {a.deepReport || a.aiFeedback}
          </pre>
        </section>
      ) : null}

      {a.evidence?.treeSample?.length ? (
        <section className="pv-assess__feedback">
          <h3>Files reviewed ({a.evidence.filesReviewed || a.evidence.treeSample.length})</h3>
          <ul className="pv-assess__chips">
            {a.evidence.treeSample.slice(0, 24).map((path) => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="pv-assess__footnote">
        Provider: {a.provider}. Advisory only — payout still needs dual human approval and HackPay
        payment/git gates.
      </p>
    </div>
  )
}

import React, { useEffect, useMemo, useState } from 'react'
import { GlobalWorkerOptions, getDocument, version as pdfjsVersion } from 'pdfjs-dist'
import Icon from '../../components/Icon'
import { appendIssuerAuditLog } from '../../utils/issuerAuditLog'
import { hackathonBelongsToOrganizerPortal } from '../../utils/organizerPortalFilter'
import { useHackathons } from '../../hooks/useHackathons'
import { formatDateRange } from '../../utils/format'
import {
  extractTimelineEventsFromText,
  textFromPdfContentItems,
} from '../../utils/timelinePdfParser'

import { HACK_PAY_TIMELINE_KEY } from '../../utils/hackathonSync'

const TIMELINE_STORAGE_KEY = HACK_PAY_TIMELINE_KEY

// CDN worker works under both Vite and Next (avoids Vite-only `?url` imports).
GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`

function getTimelineStore() {
  try {
    const raw = localStorage.getItem(TIMELINE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (_) {
    return {}
  }
}

function saveTimelineStore(store) {
  try {
    localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(store))
    return true
  } catch (_) {
    return false
  }
}

function newEvent() {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    time: '',
    title: '',
    details: '',
  }
}

export default function Timeline({ sessionWallet }) {
  const { hackathons } = useHackathons()
  const [selectedHackathonId, setSelectedHackathonId] = useState('')
  const [events, setEvents] = useState([])
  const [saveMessage, setSaveMessage] = useState('')
  const [isParsingPdf, setIsParsingPdf] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [dirty, setDirty] = useState(false)

  const auditWallet = sessionWallet || ''
  const myHackathons = useMemo(
    () => hackathons.filter((h) => hackathonBelongsToOrganizerPortal(h, sessionWallet)),
    [hackathons, sessionWallet],
  )

  useEffect(() => {
    if (!myHackathons.length) {
      setSelectedHackathonId('')
      return
    }
    if (!selectedHackathonId || !myHackathons.some((h) => h.id === selectedHackathonId)) {
      setSelectedHackathonId(myHackathons[0].id)
    }
  }, [myHackathons, selectedHackathonId])

  useEffect(() => {
    if (!selectedHackathonId) {
      setEvents([])
      return
    }
    const timeline = getTimelineStore()[selectedHackathonId] || []
    setEvents(
      timeline.map((evt) => ({
        id: evt.id || newEvent().id,
        time: evt.time || '',
        title: evt.title || '',
        details: evt.details || '',
      })),
    )
    setDirty(false)
    setPdfError('')
    setSaveMessage('')
  }, [selectedHackathonId])

  const selectedHackathon = myHackathons.find((h) => h.id === selectedHackathonId)

  const addEvent = () => {
    setEvents((prev) => [...prev, newEvent()])
    setDirty(true)
  }

  const removeEvent = (id) => {
    setEvents((prev) => prev.filter((evt) => evt.id !== id))
    setDirty(true)
  }

  const updateEventField = (id, field, value) => {
    setEvents((prev) => prev.map((evt) => (evt.id === id ? { ...evt, [field]: value } : evt)))
    setDirty(true)
  }

  const saveTimeline = () => {
    if (!selectedHackathonId) return
    const store = getTimelineStore()
    const previous = Array.isArray(store[selectedHackathonId]) ? store[selectedHackathonId] : []
    const cleaned = events
      .map((evt) => ({
        id: evt.id,
        time: (evt.time || '').trim(),
        title: (evt.title || '').trim(),
        details: (evt.details || '').trim(),
      }))
      .filter((evt) => evt.time || evt.title || evt.details)

    store[selectedHackathonId] = cleaned
    if (!saveTimelineStore(store)) {
      setPdfError('Could not save. Browser storage may be full or blocked.')
      return
    }
    setEvents(cleaned.length ? cleaned : events)
    setDirty(false)
    setSaveMessage(`Timeline saved with ${cleaned.length} event${cleaned.length === 1 ? '' : 's'}.`)
    // Audit only on save -- the original logged every add and remove, which
    // buried real actions under keystroke noise.
    appendIssuerAuditLog({
      action: 'update',
      user: 'Organizer',
      details: `Timeline saved for ${selectedHackathon?.name || 'selected hackathon'} (${cleaned.length} events, previously ${previous.length}).`,
      wallet: auditWallet,
      hackathonId: selectedHackathonId,
    })
    window.setTimeout(() => setSaveMessage(''), 2600)
  }

  const handlePdfUpload = async (file) => {
    if (!file) return
    setPdfError('')
    setSaveMessage('')
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setPdfError('Please upload a PDF file.')
      return
    }

    try {
      setIsParsingPdf(true)
      const data = new Uint8Array(await file.arrayBuffer())
      const pdf = await getDocument({ data }).promise
      let fullText = ''

      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
        const page = await pdf.getPage(pageNo)
        const content = await page.getTextContent()
        fullText += `${textFromPdfContentItems(content.items)}\n`
      }

      const parsedEvents = extractTimelineEventsFromText(fullText, () => newEvent().id)
      if (!parsedEvents.length) {
        setPdfError(
          'Could not detect timeline entries in this PDF. You can still add events manually.',
        )
        return
      }

      setEvents(parsedEvents)
      setDirty(true)
      setSaveMessage(`Loaded ${parsedEvents.length} events from PDF. Review, then save.`)
      appendIssuerAuditLog({
        action: 'update',
        user: 'Organizer',
        details: `Timeline PDF imported for ${selectedHackathon?.name || 'selected hackathon'} (${parsedEvents.length} extracted events).`,
        wallet: auditWallet,
        hackathonId: selectedHackathonId || null,
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to parse timeline PDF:', err)
      setPdfError('Unable to read this PDF. Please try another file or add events manually.')
    } finally {
      setIsParsingPdf(false)
    }
  }

  if (!myHackathons.length) {
    return (
      <div className="pv-card">
        <div className="pv-empty">
          <span className="pv-empty__icon">
            <Icon name="clock" size={20} />
          </span>
          <h3 className="pv-empty__title">No hackathons yet</h3>
          <p className="pv-empty__text">Create an event before building its timeline.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pv-stack pv-stack--lg">
      <div className="pv-card">
        <div className="pv-card__header">
          <div>
            <h3 className="pv-card__title">
              Event timeline · {selectedHackathon?.name || 'Select an event'}
            </h3>
            <p className="pv-card__subtitle">
              {selectedHackathon
                ? `${formatDateRange(selectedHackathon.startDate, selectedHackathon.endDate)} · Agenda for judges and participants — not the agent orchestration log on the Dashboard.`
                : 'Agenda for judges and participants — not the agent orchestration log.'}
            </p>
          </div>
          {myHackathons.length > 1 ? (
            <div className="pv-card__actions">
              <label className="pv-field" style={{ minWidth: 0, width: '100%', maxWidth: 320 }}>
                <span className="pv-sr-only">Choose hackathon</span>
                <select
                  className="pv-select"
                  value={selectedHackathonId}
                  onChange={(e) => setSelectedHackathonId(e.target.value)}
                >
                  {myHackathons.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>

        <div className="pv-card__body">
          <div className="pv-field">
            <label className="pv-field__label" htmlFor="timeline-pdf-upload">
              Import from event card PDF
            </label>
            <input
              id="timeline-pdf-upload"
              type="file"
              accept="application/pdf"
              className="pv-input"
              onChange={(e) => handlePdfUpload(e.target.files?.[0])}
              disabled={isParsingPdf}
              style={{ paddingBlock: 'var(--pv-space-3)' }}
            />
            <span className="pv-field__hint">
              Event Card format: Event #, TIME / SLOT, TITLE, DETAILS. Entries are editable before
              you save.
            </span>
          </div>

          {isParsingPdf ? (
            <div className="pv-alert" style={{ marginTop: 'var(--pv-space-6)' }}>
              <span className="pv-alert__icon">
                <span className="pv-btn__spinner" />
              </span>
              <div className="pv-alert__content">
                <p className="pv-alert__text">Reading PDF and extracting the timeline...</p>
              </div>
            </div>
          ) : null}

          {pdfError ? (
            <div
              className="pv-alert pv-alert--danger"
              role="alert"
              aria-live="polite"
              style={{ marginTop: 'var(--pv-space-6)' }}
            >
              <span className="pv-alert__icon">
                <Icon name="alert" size={16} />
              </span>
              <div className="pv-alert__content">
                <p className="pv-alert__text">{pdfError}</p>
              </div>
            </div>
          ) : null}

          {saveMessage ? (
            <div
              className="pv-alert pv-alert--success"
              role="status"
              aria-live="polite"
              style={{ marginTop: 'var(--pv-space-6)' }}
            >
              <span className="pv-alert__icon">
                <Icon name="checkCircle" size={16} />
              </span>
              <div className="pv-alert__content">
                <p className="pv-alert__text">{saveMessage}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="pv-card__footer" style={{ justifyContent: 'space-between' }}>
          <span className="pv-muted">
            {events.length} event{events.length === 1 ? '' : 's'}
            {dirty ? ' · unsaved changes' : ''}
          </span>
          <span className="pv-btn-group">
            <button type="button" className="pv-btn pv-btn--secondary pv-btn--sm" onClick={addEvent}>
              <Icon name="plus" size={14} />
              Add event
            </button>
            <button
              type="button"
              className="pv-btn pv-btn--primary pv-btn--sm"
              onClick={saveTimeline}
              disabled={!dirty}
            >
              Save timeline
            </button>
          </span>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="pv-card">
          <div className="pv-empty">
            <span className="pv-empty__icon">
              <Icon name="clock" size={20} />
            </span>
            <h4 className="pv-empty__title">No timeline events</h4>
            <p className="pv-empty__text">
              Add events by hand, or import an event card PDF to fill them automatically.
            </p>
            <button type="button" className="pv-btn pv-btn--primary pv-btn--sm" onClick={addEvent}>
              <Icon name="plus" size={14} />
              Add first event
            </button>
          </div>
        </div>
      ) : (
        <div className="pv-stack">
          {events.map((evt, index) => (
            <div className="pv-card" key={evt.id}>
              <div className="pv-card__header">
                <div>
                  <h4 className="pv-card__title" style={{ fontSize: 'var(--pv-text-md)' }}>
                    Event {index + 1}
                    {evt.title ? <span className="pv-muted"> — {evt.title}</span> : null}
                  </h4>
                </div>
                <div className="pv-card__actions">
                  <button
                    type="button"
                    className="pv-btn pv-btn--ghost pv-btn--xs pv-btn--icon"
                    onClick={() => removeEvent(evt.id)}
                    aria-label={`Remove event ${index + 1}`}
                    title="Remove event"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
              <div className="pv-card__body pv-card__body--tight">
                <div className="pv-form-stack">
                  <div className="pv-form-grid">
                    <div className="pv-field">
                      <label className="pv-field__label" htmlFor={`t-time-${evt.id}`}>
                        Time / slot
                      </label>
                      <input
                        id={`t-time-${evt.id}`}
                        type="text"
                        className="pv-input"
                        value={evt.time}
                        onChange={(e) => updateEventField(evt.id, 'time', e.target.value)}
                        placeholder="09:00 AM - 10:00 AM"
                      />
                    </div>
                    <div className="pv-field">
                      <label className="pv-field__label" htmlFor={`t-title-${evt.id}`}>
                        Title
                      </label>
                      <input
                        id={`t-title-${evt.id}`}
                        type="text"
                        className="pv-input"
                        value={evt.title}
                        onChange={(e) => updateEventField(evt.id, 'title', e.target.value)}
                        placeholder="Registration"
                      />
                    </div>
                  </div>
                  <div className="pv-field">
                    <label className="pv-field__label" htmlFor={`t-details-${evt.id}`}>
                      Details
                    </label>
                    <textarea
                      id={`t-details-${evt.id}`}
                      className="pv-textarea"
                      value={evt.details}
                      onChange={(e) => updateEventField(evt.id, 'details', e.target.value)}
                      rows={2}
                      placeholder="Optional details for this event"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import Icon from '../../components/Icon'
import {
  fetchMyProfile,
  formatJoined,
  linkHref,
  saveMyProfile,
  type ParticipantLinks,
  type ParticipantProfile,
} from '../../services/participantApi'

const LINK_META: {
  key: keyof ParticipantLinks
  label: string
  placeholder: string
}[] = [
  { key: 'github', label: 'GitHub', placeholder: 'username or https://…' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'username or https://…' },
  { key: 'x', label: 'X', placeholder: 'handle or https://…' },
  { key: 'portfolio', label: 'Portfolio', placeholder: 'yoursite.com or https://…' },
]

const SUGGESTED_STACK = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Go',
  'Rust',
  'React',
  'Next.js',
  'AWS',
  'PostgreSQL',
]

type FormState = {
  fullName: string
  username: string
  bio: string
  headline: string
  organization: string
  location: string
  avatarUrl: string
  links: ParticipantLinks
  stackText: string
}

function profileToForm(p: ParticipantProfile): FormState {
  return {
    fullName: p.fullName || '',
    username: p.username || '',
    bio: p.bio || '',
    headline: p.headline || '',
    organization: p.organization || '',
    location: p.location || '',
    avatarUrl: p.avatarUrl || '',
    links: { ...p.links },
    stackText: (p.stack || []).join(', '),
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

interface ParticipantProfileCardProps {
  userWallet: string
}

export default function ParticipantProfileCard({ userWallet }: ParticipantProfileCardProps) {
  const [profile, setProfile] = useState<ParticipantProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    const result = await fetchMyProfile(userWallet)
    if (result.success && result.profile) {
      setProfile(result.profile)
      setForm(profileToForm(result.profile))
    } else {
      setError(result.error || 'Could not load profile')
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      const result = await fetchMyProfile(userWallet)
      if (cancelled) return
      if (result.success && result.profile) {
        setProfile(result.profile)
        setForm(profileToForm(result.profile))
      } else {
        setError(result.error || 'Could not load profile')
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userWallet])

  const linkEntries = useMemo(() => {
    if (!profile) return []
    return LINK_META.map((meta) => {
      const value = profile.links[meta.key]
      if (!value) return null
      return { ...meta, value, href: linkHref(meta.key, value) }
    }).filter(Boolean) as Array<(typeof LINK_META)[number] & { value: string; href: string }>
  }, [profile])

  const openEdit = () => {
    if (!profile) return
    setForm(profileToForm(profile))
    setError('')
    setEditing(true)
  }

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    setError('')
    const stack = form.stackText
      .split(/[,|\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const result = await saveMyProfile({
      wallet: userWallet,
      fullName: form.fullName,
      username: form.username,
      bio: form.bio,
      headline: form.headline,
      organization: form.organization,
      location: form.location,
      avatarUrl: form.avatarUrl,
      links: form.links,
      stack,
    })
    setSaving(false)
    if (!result.success || !result.profile) {
      setError(result.error || 'Save failed')
      return
    }
    setProfile(result.profile)
    setForm(profileToForm(result.profile))
    setEditing(false)
  }

  if (loading) {
    return (
      <section className="pv-card pv-profile">
        <div className="pv-empty">
          <span className="pv-btn__spinner" style={{ width: 20, height: 20 }} />
          <p className="pv-empty__text">Loading profile…</p>
        </div>
      </section>
    )
  }

  if (!profile || !form) {
    return (
      <section className="pv-card pv-profile">
        <div className="pv-alert pv-alert--danger">
          <span className="pv-alert__icon">
            <Icon name="alert" size={16} />
          </span>
          <div className="pv-alert__content">
            <p className="pv-alert__text">{error || 'Profile unavailable'}</p>
          </div>
          <button type="button" className="pv-btn pv-btn--secondary pv-btn--sm" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="pv-card pv-profile">
      <div className="pv-profile__header">
        <div className="pv-profile__identity">
          <div className="pv-profile__avatar" aria-hidden>
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" />
            ) : (
              <span>{initials(profile.fullName)}</span>
            )}
          </div>
          <div className="pv-profile__intro">
            <span className="pv-profile__badge">Hacker</span>
            <h2 className="pv-profile__name">{profile.fullName}</h2>
            {profile.username ? (
              <p className="pv-profile__handle">@{profile.username}</p>
            ) : (
              <p className="pv-profile__handle pv-dim">{profile.email || userWallet}</p>
            )}
            {profile.bio ? <p className="pv-profile__bio">{profile.bio}</p> : null}
            <div className="pv-profile__meta">
              <span>
                <Icon name="calendar" size={12} />
                Joined {formatJoined(profile.createdAt)}
              </span>
              {profile.headline || profile.organization ? (
                <span>
                  <Icon name="users" size={12} />
                  {[profile.headline, profile.organization].filter(Boolean).join(' · ')}
                </span>
              ) : null}
              {profile.location ? (
                <span>
                  <Icon name="mapPin" size={12} />
                  {profile.location}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <button type="button" className="pv-btn pv-btn--secondary pv-btn--sm" onClick={openEdit}>
          <Icon name="settings" size={14} />
          Edit profile
        </button>
      </div>

      {linkEntries.length > 0 ? (
        <div className="pv-profile__section">
          <h3 className="pv-profile__section-title">Socials</h3>
          <div className="pv-profile__links">
            {linkEntries.map((link) => (
              <a
                key={link.key}
                className="pv-profile__link"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>{link.label}</span>
                <strong>{link.value.replace(/^https?:\/\//, '')}</strong>
                <Icon name="external" size={14} />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {profile.stack.length > 0 ? (
        <div className="pv-profile__section">
          <h3 className="pv-profile__section-title">Stack</h3>
          <div className="pv-profile__stack">
            {profile.stack.map((item) => (
              <span key={item} className="pv-profile__chip">
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="pv-dim" style={{ marginTop: 12, fontSize: 13 }}>
          Add links and your stack via Edit profile.
        </p>
      )}

      {editing ? (
        <div className="pv-profile__modal" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
          <div className="pv-profile__modal-card">
            <div className="pv-profile__modal-head">
              <h3 id="edit-profile-title">Edit profile</h3>
              <button
                type="button"
                className="pv-btn pv-btn--ghost pv-btn--icon"
                onClick={() => setEditing(false)}
                aria-label="Close"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            {error ? (
              <div className="pv-alert pv-alert--danger" role="alert">
                <span className="pv-alert__icon">
                  <Icon name="alert" size={16} />
                </span>
                <div className="pv-alert__content">
                  <p className="pv-alert__text">{error}</p>
                </div>
              </div>
            ) : null}

            <div className="pv-form-stack">
              <div className="pv-form-grid">
                <div className="pv-field">
                  <label className="pv-field__label" htmlFor="pf-name">
                    Name
                  </label>
                  <input
                    id="pf-name"
                    className="pv-input"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    maxLength={120}
                  />
                </div>
                <div className="pv-field">
                  <label className="pv-field__label" htmlFor="pf-username">
                    Username
                  </label>
                  <input
                    id="pf-username"
                    className="pv-input"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="karthik13"
                    maxLength={32}
                  />
                </div>
              </div>

              <div className="pv-field">
                <label className="pv-field__label" htmlFor="pf-bio">
                  Bio
                </label>
                <input
                  id="pf-bio"
                  className="pv-input"
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="indie hacker"
                  maxLength={200}
                />
              </div>

              <div className="pv-form-grid">
                <div className="pv-field">
                  <label className="pv-field__label" htmlFor="pf-headline">
                    Headline
                  </label>
                  <input
                    id="pf-headline"
                    className="pv-input"
                    value={form.headline}
                    onChange={(e) => setForm({ ...form, headline: e.target.value })}
                    placeholder="Full stack developer"
                    maxLength={120}
                  />
                </div>
                <div className="pv-field">
                  <label className="pv-field__label" htmlFor="pf-org">
                    Organization
                  </label>
                  <input
                    id="pf-org"
                    className="pv-input"
                    value={form.organization}
                    onChange={(e) => setForm({ ...form, organization: e.target.value })}
                    placeholder="MVJ College of Engineering"
                    maxLength={160}
                  />
                </div>
              </div>

              <div className="pv-form-grid">
                <div className="pv-field">
                  <label className="pv-field__label" htmlFor="pf-location">
                    Location
                  </label>
                  <input
                    id="pf-location"
                    className="pv-input"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="India"
                    maxLength={80}
                  />
                </div>
                <div className="pv-field">
                  <label className="pv-field__label" htmlFor="pf-avatar">
                    Avatar URL
                  </label>
                  <input
                    id="pf-avatar"
                    className="pv-input"
                    value={form.avatarUrl}
                    onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
                    placeholder="https://…"
                    maxLength={240}
                  />
                </div>
              </div>

              <div className="pv-profile__section">
                <h4 className="pv-profile__section-title">Socials</h4>
                <div className="pv-form-stack">
                  {LINK_META.map((meta) => (
                    <div key={meta.key} className="pv-field">
                      <label className="pv-field__label" htmlFor={`pf-link-${meta.key}`}>
                        {meta.label}
                      </label>
                      <input
                        id={`pf-link-${meta.key}`}
                        className="pv-input"
                        value={form.links[meta.key] || ''}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            links: { ...form.links, [meta.key]: e.target.value },
                          })
                        }
                        placeholder={meta.placeholder}
                        maxLength={240}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pv-field">
                <label className="pv-field__label" htmlFor="pf-stack">
                  Stack (comma-separated)
                </label>
                <input
                  id="pf-stack"
                  className="pv-input"
                  value={form.stackText}
                  onChange={(e) => setForm({ ...form, stackText: e.target.value })}
                  placeholder="TypeScript, AWS, Go"
                  maxLength={400}
                />
                <div className="pv-profile__stack" style={{ marginTop: 8 }}>
                  {SUGGESTED_STACK.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="pv-profile__chip pv-profile__chip--btn"
                      onClick={() => {
                        const current = form.stackText
                          .split(/[,|\n]/)
                          .map((s) => s.trim())
                          .filter(Boolean)
                        if (current.map((c) => c.toLowerCase()).includes(item.toLowerCase())) return
                        setForm({
                          ...form,
                          stackText: [...current, item].join(', '),
                        })
                      }}
                    >
                      + {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pv-profile__modal-actions">
              <button
                type="button"
                className="pv-btn pv-btn--ghost"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pv-btn pv-btn--primary"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

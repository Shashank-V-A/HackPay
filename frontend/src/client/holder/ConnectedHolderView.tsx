import { useEffect } from 'react'
import { HolderProvider } from './context/HolderContext'
import Icon from '../components/Icon'
import SponsorDashboard from './components/SponsorDashboard'
import ParticipantDashboard from './components/ParticipantDashboard'
import ParticipantProfileCard from './components/ParticipantProfileCard'
import HackathonList from './components/HackathonList'
import EventDetail from './components/EventDetail'
import { UserRole } from '../types/holder'

export type HolderView = 'list' | 'sponsor' | 'participant' | 'organizer' | 'event'

export interface ConnectedHolderViewProps {
  userWallet: string
  userRole: UserRole
  activeView: HolderView
  activeEventId?: string | null
  setActiveView: (v: HolderView) => void
  onDisconnect: () => void
  onNavigate: (view: string, params?: unknown) => void
}

export default function ConnectedHolderView({
  userWallet,
  userRole,
  activeView,
  activeEventId = null,
  setActiveView,
  onNavigate,
}: ConnectedHolderViewProps) {
  // Sponsors land on their own view. `event` is a drill-in, so never override it.
  useEffect(() => {
    if (userRole === 'sponsor' && activeView !== 'sponsor' && activeView !== 'event') {
      setActiveView('sponsor')
    }
  }, [userRole, activeView, setActiveView])

  const tabs: { id: HolderView; label: string }[] = [{ id: 'list', label: 'Events' }]
  if (userRole === 'participant') tabs.push({ id: 'participant', label: 'My hackathons' })
  if (userRole === 'sponsor') tabs.push({ id: 'sponsor', label: 'Sponsorships' })
  if (userRole === 'organizer') tabs.push({ id: 'organizer', label: 'Organizer' })

  const showParticipantChrome = userRole === 'participant' && activeView !== 'event'

  return (
    <HolderProvider>
      <div className="pv-stack pv-stack--lg">
        {showParticipantChrome ? <ParticipantProfileCard userWallet={userWallet} /> : null}

        {!showParticipantChrome && activeView !== 'event' ? (
          <div className="pv-row pv-row--between" style={{ alignItems: 'center', gap: 'var(--pv-space-4)' }}>
            <nav className="pv-tabs" aria-label="Wallet sections">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className="pv-tab"
                  aria-selected={activeView === tab.id}
                  role="tab"
                  onClick={() => setActiveView(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        ) : null}

        {showParticipantChrome ? (
          <nav className="pv-tabs" aria-label="Hackathon sections">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="pv-tab"
                aria-selected={activeView === tab.id}
                role="tab"
                onClick={() => setActiveView(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        ) : null}

        {activeView === 'event' ? (
          <EventDetail
            hackathonId={activeEventId}
            userWallet={userWallet}
            userRole={userRole}
            onBack={() => setActiveView(userRole === 'participant' ? 'participant' : 'list')}
          />
        ) : null}

        {activeView === 'list' ? (
          <HackathonList userWallet={userWallet} userRole={userRole} onNavigate={onNavigate} />
        ) : null}

        {activeView === 'sponsor' && userRole === 'sponsor' ? (
          <SponsorDashboard userWallet={userWallet} onNavigate={onNavigate} />
        ) : null}

        {activeView === 'participant' && userRole === 'participant' ? (
          <ParticipantDashboard userWallet={userWallet} onNavigate={onNavigate} />
        ) : null}

        {activeView === 'organizer' && userRole === 'organizer' ? (
          <div className="pv-card">
            <div className="pv-empty">
              <span className="pv-empty__icon">
                <Icon name="calendar" size={20} />
              </span>
              <h3 className="pv-empty__title">Organizer tools live in their own console</h3>
              <p className="pv-empty__text">
                Manage hackathons, select winners and create payout proposals there.
              </p>
              <a href="/issuer" className="pv-btn pv-btn--primary pv-btn--sm">
                Open organizer console
                <Icon name="arrowRight" size={14} />
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </HolderProvider>
  )
}

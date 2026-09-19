import React, { useEffect, useMemo, useState } from 'react'
import { hackathonBelongsToOrganizerPortal } from '../utils/organizerPortalFilter'
import { clearActiveSession, hasRequiredRole, requireManualConnect } from '../utils/authSession'
import { resolveSessionWithQrBootstrap } from '../utils/qrSession'
import { disconnectWallet } from '../wallet'
import { prizeTotal } from '../utils/format'
import { useHackathons } from '../hooks/useHackathons'
import { broadcastHackathonsDatasetChanged, HACK_PAY_HACKATHONS_KEY } from '../utils/hackathonSync'
import { saveHackathonsToStorage } from '../holder/utils/roleDetection'
import { dropLegacyStellarHackathons } from '../utils/legacyWeb3Data'
import { syncWalletSession } from '../services/sessionApi'
import { getIssuerAuditLogs } from '../utils/issuerAuditLog'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import OrganizerDashboard from './components/OrganizerDashboard'
import ParticipantManager from './components/ParticipantManager'
import WinnerSelection from './components/WinnerSelection'
import PayoutProposal from './components/PayoutProposal'
import OrganizerHackathonList from './components/OrganizerHackathonList'
import CreateHackathonForm from './components/CreateHackathonForm'
import AuditLogPage from './components/AuditLogPage'
import TwoFASetup from './components/TwoFASetup'
import Timeline from './components/Timeline'

const HACKATHON_STORAGE_KEY = HACK_PAY_HACKATHONS_KEY

/**
 * One-time normalisation of the stored dataset. Must run in an effect, not in
 * the render body -- it writes localStorage and posts to a BroadcastChannel, so
 * calling it per render clobbered concurrent writes from other tabs.
 */
function initHackathonData() {
  try {
    const existing = localStorage.getItem(HACKATHON_STORAGE_KEY)
    if (!existing) {
      saveHackathonsToStorage([], { broadcast: false })
      return
    }
    const parsed = JSON.parse(existing)
    if (!Array.isArray(parsed)) return

    const fixed = dropLegacyStellarHackathons(
      parsed.map((h) => ({
        ...h,
        participants: h.participants || [],
        participantCount: h.participants?.length || 0,
      })),
    )

    // Only write when something actually changed, so a mount is not a mutation.
    if (JSON.stringify(fixed) !== existing) {
      localStorage.setItem(HACKATHON_STORAGE_KEY, JSON.stringify(fixed))
      broadcastHackathonsDatasetChanged()
    }
  } catch (_) {
    // Corrupt storage must not block the console from loading.
  }
}

const VIEW_META = {
  dashboard: { title: 'Dashboard', desc: 'Everything that needs your attention right now.' },
  hackathons: { title: 'My Hackathons', desc: 'Every event you organize.' },
  participants: { title: 'Participants', desc: 'Registrations, shortlists and payout addresses.' },
  timeline: { title: 'Event Timeline', desc: 'Hackathon schedule only (agenda). Not the agent orchestration log — that lives on the Dashboard.' },
  winners: { title: 'Select Winners', desc: 'Assign prize tiers and amounts before proposing a payout. Optional AI shortlist is advisory.' },
  payouts: { title: 'Payout Proposals', desc: 'Propose, track sponsor approval, and execute INR payouts.' },
  audit: { title: 'Audit Logs', desc: 'Every organizer action, exportable as CSV.' },
  settings: { title: 'Settings', desc: 'Two-factor authentication and demo alert email for this console.' },
  'create-hackathon': { title: 'Create Hackathon', desc: 'Set up a new event and its prize pool.' },
}

export default function IssuerApp() {
  // Session must live in state: resolveSessionWithQrBootstrap() writes it during
  // the first effect, and children need to re-render once the real wallet lands.
  const [session, setSession] = useState(null)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    initHackathonData()
    const resolved = resolveSessionWithQrBootstrap()
    setSession(resolved)
    setSessionReady(true)
    if (resolved?.wallet && resolved?.role === 'organizer') {
      void syncWalletSession({ wallet: resolved.wallet, role: 'organizer' })
    }
  }, [])

  useEffect(() => {
    if (!sessionReady) return
    if (!hasRequiredRole('organizer')) {
      window.location.href = '/holder?role=organizer'
    }
  }, [sessionReady])

  const [activeView, setActiveView] = useState('dashboard')
  const [navigateParam, setNavigateParam] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])

  const sessionWallet = session?.wallet ?? null
  const organizerDisplayAddress = sessionWallet || ''

  const { hackathons: myHackathons } = useHackathons((h) =>
    hackathonBelongsToOrganizerPortal(h, sessionWallet),
  )

  const stats = useMemo(
    () => ({
      hackathons: myHackathons.length,
      participants: myHackathons.reduce((sum, h) => sum + (h.participants?.length || 0), 0),
      prizeLocked: myHackathons.reduce((sum, h) => sum + prizeTotal(h), 0),
      pendingPayouts: myHackathons.filter((h) => h.winnersSelected && !h.payoutProposed).length,
    }),
    [myHackathons],
  )

  useEffect(() => {
    const refreshLogs = () => setAuditLogs(getIssuerAuditLogs())
    refreshLogs()
    window.addEventListener('hack_pay_audit_logs_updated', refreshLogs)
    window.addEventListener('twin_lock_audit_logs_updated', refreshLogs)
    window.addEventListener('prize_vault_audit_logs_updated', refreshLogs)
    return () => {
      window.removeEventListener('hack_pay_audit_logs_updated', refreshLogs)
      window.removeEventListener('twin_lock_audit_logs_updated', refreshLogs)
      window.removeEventListener('prize_vault_audit_logs_updated', refreshLogs)
    }
  }, [])

  const handleNavigate = (view, param) => {
    setActiveView(view)
    setNavigateParam(param ?? null)
  }

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <OrganizerDashboard sessionWallet={sessionWallet} onNavigate={handleNavigate} />
      case 'participants':
        return (
          <ParticipantManager
            hackathonId={navigateParam}
            sessionWallet={sessionWallet}
            onNavigate={handleNavigate}
          />
        )
      case 'winners':
        return (
          <WinnerSelection
            hackathonId={navigateParam}
            sessionWallet={sessionWallet}
            onSave={(id) => handleNavigate('payouts', id)}
          />
        )
      case 'payouts':
        return <PayoutProposal hackathonId={navigateParam} sessionWallet={sessionWallet} />
      case 'hackathons':
        return <OrganizerHackathonList sessionWallet={sessionWallet} onNavigate={handleNavigate} />
      case 'create-hackathon':
        return (
          <CreateHackathonForm
            userWallet={sessionWallet}
            onSave={() => handleNavigate('hackathons')}
            onCancel={() => handleNavigate('hackathons')}
          />
        )
      case 'timeline':
        return <Timeline sessionWallet={sessionWallet} />
      case 'audit':
        return <AuditLogPage logs={auditLogs} />
      case 'settings':
        return <TwoFASetup />
      default:
        return <OrganizerDashboard sessionWallet={sessionWallet} onNavigate={handleNavigate} />
    }
  }

  const meta = VIEW_META[activeView] || VIEW_META.dashboard

  const handleDisconnect = () => {
    void disconnectWallet()
    clearActiveSession()
    requireManualConnect()
    window.location.href = '/holder?role=organizer'
  }

  return (
    <div className="pv-shell pv-app">
      <a className="pv-skip-link" href="#console">
        Skip to content
      </a>

      <Header
        organizerName="Organizer"
        walletAddress={organizerDisplayAddress}
        stats={stats}
        onDisconnect={handleDisconnect}
      />

      <div className="pv-layout">
        <Sidebar
          activeView={activeView}
          onViewChange={(view) => {
            setActiveView(view)
            setNavigateParam(null)
          }}
          badges={{ pendingPayouts: stats.pendingPayouts }}
        />
        <main className="pv-content" id="console">
          <div className="pv-page-header">
            <div className="pv-page-header__text">
              <h2 className="pv-page-header__title">{meta.title}</h2>
              <p className="pv-page-header__desc">{meta.desc}</p>
            </div>
          </div>
          {renderView()}
        </main>
      </div>
    </div>
  )
}

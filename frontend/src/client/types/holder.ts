// Holder wallet state and context types

import { Hackathon } from './hackathon'

export type UserRole = 'sponsor' | 'organizer' | 'participant' | null

export interface UserProfile {
  name: string
  email: string
  college?: string
  usn?: string
  upi?: string
  role: UserRole
  /** Cognito password when AWS auth is enabled */
  password?: string
  /** Sign in existing Cognito user vs register */
  authMode?: 'signup' | 'signin'
}

export interface HolderState {
  walletConnected: boolean
  userWallet: string | null
  userRole: UserRole
  hackathons: Hackathon[]
  // Keep existing credential state for now (can be removed later)
  didProfiles: any[]
  activeDidId: string | null
  inbox: any[]
  credentials: any[]
  documents: any[]
  proofs: any[]
  requests: any[]
  auditLog: any[]
  settings: {
    ipfs: {
      endpoint: string
      token: string
      mode: string
    }
    security: {
      passphraseSet: boolean
      autoLockMinutes: number
      biometric: boolean
    }
  }
}

export interface HolderContextValue {
  state: HolderState
  connectStellarWallet: () => Promise<string | null>
  disconnectStellarWallet: () => Promise<void>
  setUserRole: (role: UserRole) => void
  loadHackathons: () => Hackathon[]
  createHackathon: (hackathon: Hackathon) => void
  updateHackathon: (id: string, updates: Partial<Hackathon>) => void
  registerParticipant: (hackathonId: string, participant: any) => void
  selectWinners: (hackathonId: string, winners: any[]) => void
  createPayoutProposal: (hackathonId: string) => void
  // ... existing holder context methods
}

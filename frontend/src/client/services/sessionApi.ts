import type { UserRole } from '../types/holder'
import { authHeaders } from '../utils/authSession'

export type SyncWalletSessionInput = {
  wallet: string
  role: Exclude<UserRole, null>
  name?: string
  email?: string
}

/** Upsert organizer / sponsor / participant row when a user signs in. */
export async function syncWalletSession(
  input: SyncWalletSessionInput,
): Promise<{ success: boolean; error?: string }> {
  const wallet = input.wallet?.trim()
  if (!wallet || !input.role) {
    return { success: false, error: 'wallet and role are required' }
  }

  try {
    const res = await fetch('/api/session/sync', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        wallet,
        role: input.role,
        name: input.name?.trim() || undefined,
        email: input.email?.trim() || undefined,
      }),
    })

    const data = (await res.json()) as { success?: boolean; error?: string }
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `Session sync failed (${res.status})` }
    }
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Session sync failed',
    }
  }
}

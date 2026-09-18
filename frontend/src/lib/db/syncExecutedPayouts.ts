type SupabaseClient = ReturnType<typeof import('./server').createSupabaseServerClient>

type WinnerRow = {
  payoutAddress?: string
  prizeAmount?: number | string
}

function inrToPaise(amountInr: number): number {
  if (!Number.isFinite(amountInr) || amountInr <= 0) return 0
  return Math.round(amountInr * 100)
}

function isExecutedProposal(proposal: Record<string, unknown>): boolean {
  return proposal.status === 'executed' || proposal.executed === true
}

async function lookupParticipantId(
  supabase: SupabaseClient,
  wallet: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('participants')
    .select('id')
    .eq('payout_wallet_address', wallet)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

/**
 * Mirror executed proposal winners into the relational `payouts` table.
 * amount_stroops column stores paise (INR * 100) after the Web2 migration.
 */
export async function syncExecutedPayouts(
  supabase: SupabaseClient,
  proposalDbId: string,
  proposal: Record<string, unknown>,
): Promise<void> {
  if (!isExecutedProposal(proposal)) return

  const winners = (proposal.winners as WinnerRow[]) || []
  const txHash = typeof proposal.txHash === 'string' ? proposal.txHash : null
  const completedAt =
    typeof proposal.executedAt === 'string'
      ? proposal.executedAt
      : new Date().toISOString()

  for (const winner of winners) {
    const wallet = winner.payoutAddress?.trim()
    const amountPaise = inrToPaise(Number(winner.prizeAmount))
    if (!wallet || amountPaise <= 0) continue

    const participantId = await lookupParticipantId(supabase, wallet)

    const { data: existing } = await supabase
      .from('payouts')
      .select('id')
      .eq('proposal_id', proposalDbId)
      .eq('winner_wallet', wallet)
      .maybeSingle()

    const row = {
      proposal_id: proposalDbId,
      participant_id: participantId,
      winner_wallet: wallet,
      amount_stroops: amountPaise,
      status: 'success' as const,
      transaction_hash: txHash,
      completed_at: completedAt,
    }

    if (existing?.id) {
      const { error } = await supabase.from('payouts').update(row).eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('payouts').insert(row)
      if (error) throw error
    }
  }

  const { error: proposalError } = await supabase
    .from('proposals')
    .update({ executed_at: completedAt, status: 'executed' })
    .eq('id', proposalDbId)

  if (proposalError) throw proposalError
}

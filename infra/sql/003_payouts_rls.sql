-- Payouts: RLS on, no anon access. Winner rows are written by the API
-- (service role) after dual-approval execute.
-- Run in Supabase Dashboard → SQL Editor after 001 and 002

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payouts_anon_all ON payouts;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_proposal_winner
  ON payouts(proposal_id, winner_wallet);

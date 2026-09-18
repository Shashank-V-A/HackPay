-- Tighten RLS on an existing PrizeVault database that already ran 001–003
-- with open USING (true) WITH CHECK (true) policies.
-- Safe to re-run. Apply in Supabase SQL Editor after 001–003.
--
-- After this, the publishable (anon) key can only SELECT hackathons.
-- All writes must use SUPABASE_SERVICE_ROLE_KEY in Next.js API routes.

ALTER TABLE hackathons ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hackathon_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hackathons_anon_all ON hackathons;
DROP POLICY IF EXISTS hackathons_public_read ON hackathons;
DROP POLICY IF EXISTS proposals_anon_all ON proposals;
DROP POLICY IF EXISTS escrows_anon_all ON escrows;
DROP POLICY IF EXISTS organizers_anon_all ON organizers;
DROP POLICY IF EXISTS sponsors_anon_all ON sponsors;
DROP POLICY IF EXISTS participants_anon_all ON participants;
DROP POLICY IF EXISTS payouts_anon_all ON payouts;
DROP POLICY IF EXISTS audit_logs_anon_all ON audit_logs;
DROP POLICY IF EXISTS hackathon_registrations_anon_all ON hackathon_registrations;

CREATE POLICY hackathons_public_read ON hackathons
  FOR SELECT TO anon, authenticated
  USING (true);

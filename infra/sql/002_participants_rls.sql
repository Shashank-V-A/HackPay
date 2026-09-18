-- Participants + registrations: RLS on, no anon write/read of PII.
-- Profiles are created by /api/session/sync and /api/hackathons/[id]/register
-- using SUPABASE_SERVICE_ROLE_KEY.
-- Run in Supabase Dashboard → SQL Editor after 001_prizevault_schema.sql

ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS participants_anon_all ON participants;

-- One profile row per payout wallet (required for upsert lookups)
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_wallet_unique
  ON participants(payout_wallet_address);

-- Optional: relational view of hackathon sign-ups (easier to inspect than JSON payload)
CREATE TABLE IF NOT EXISTS hackathon_registrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id     UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  participant_id   UUID REFERENCES participants(id) ON DELETE SET NULL,
  wallet_address   TEXT NOT NULL,
  display_name     TEXT,
  status           TEXT NOT NULL DEFAULT 'registered',
  registered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hackathon_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_hackathon_registrations_hackathon
  ON hackathon_registrations(hackathon_id);

CREATE INDEX IF NOT EXISTS idx_hackathon_registrations_wallet
  ON hackathon_registrations(wallet_address);

ALTER TABLE hackathon_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hackathon_registrations_anon_all ON hackathon_registrations;

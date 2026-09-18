-- PrizeVault schema (PostgreSQL / Supabase)
-- Run in Supabase Dashboard → SQL Editor for project mjlbcskcsrxkjycjpdyh

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
DO $$ BEGIN
  CREATE TYPE hackathon_status AS ENUM ('upcoming', 'live', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE escrow_status AS ENUM ('pending_deploy', 'awaiting_funds', 'funded', 'depleted', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE proposal_status AS ENUM ('proposed', 'sponsor_approved', 'executed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM ('pending', 'success', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE chain_tx_kind AS ENUM ('deploy', 'init', 'fund', 'propose', 'approve', 'execute');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE chain_tx_status AS ENUM ('pending', 'submitted', 'success', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE idempotency_state AS ENUM ('locked', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Organizers & sponsors (wallet-centric for Stellar)
CREATE TABLE IF NOT EXISTS organizers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT,
  email                TEXT,
  admin_wallet_address TEXT NOT NULL UNIQUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sponsors (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name            TEXT,
  contact_email           TEXT,
  funding_wallet_address  TEXT NOT NULL UNIQUE,
  tax_id                  TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name             TEXT NOT NULL,
  email                 TEXT,
  github_handle         TEXT,
  payout_wallet_address TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participants_wallet ON participants(payout_wallet_address);

-- Hackathons (payload JSONB holds participants, winners, UI flags)
CREATE TABLE IF NOT EXISTS hackathons (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id            TEXT UNIQUE,
  organizer_id         UUID REFERENCES organizers(id) ON DELETE SET NULL,
  name                 TEXT NOT NULL,
  description          TEXT,
  metadata_ipfs_cid    TEXT,
  start_date           DATE,
  end_date             DATE,
  status               hackathon_status NOT NULL DEFAULT 'upcoming',
  organizer_wallet     TEXT NOT NULL,
  sponsor_wallet       TEXT,
  contract_id          TEXT,
  prize_pool_total     NUMERIC NOT NULL DEFAULT 0,
  prize_pool_currency  TEXT NOT NULL DEFAULT 'XLM',
  sponsor_funding_xlm  NUMERIC NOT NULL DEFAULT 0,
  on_chain_balance_xlm NUMERIC,
  payload              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hackathons_organizer_wallet ON hackathons(organizer_wallet);
CREATE INDEX IF NOT EXISTS idx_hackathons_sponsor_wallet ON hackathons(sponsor_wallet);
CREATE INDEX IF NOT EXISTS idx_hackathons_legacy_id ON hackathons(legacy_id);

CREATE TABLE IF NOT EXISTS escrows (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id           UUID NOT NULL UNIQUE REFERENCES hackathons(id) ON DELETE CASCADE,
  sponsor_id             UUID REFERENCES sponsors(id) ON DELETE SET NULL,
  contract_id            TEXT,
  network_passphrase     TEXT NOT NULL DEFAULT 'Test SDF Network ; September 2015',
  token_contract_id      TEXT NOT NULL DEFAULT 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  organizer_wallet       TEXT NOT NULL,
  sponsor_wallet         TEXT,
  total_funded_stroops   BIGINT NOT NULL DEFAULT 0,
  total_released_stroops BIGINT NOT NULL DEFAULT 0,
  on_chain_balance_stroops BIGINT,
  balance_synced_at      TIMESTAMPTZ,
  status                 escrow_status NOT NULL DEFAULT 'awaiting_funds',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proposals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id           TEXT UNIQUE,
  escrow_id           UUID REFERENCES escrows(id) ON DELETE CASCADE,
  hackathon_id        UUID REFERENCES hackathons(id) ON DELETE CASCADE,
  onchain_proposal_id BIGINT,
  status              proposal_status NOT NULL DEFAULT 'proposed',
  created_by_wallet   TEXT,
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_proposals_hackathon ON proposals(hackathon_id);

CREATE TABLE IF NOT EXISTS payouts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  participant_id   UUID REFERENCES participants(id) ON DELETE SET NULL,
  winner_wallet    TEXT NOT NULL,
  amount_stroops   BIGINT NOT NULL CHECK (amount_stroops > 0),
  status           payout_status NOT NULL DEFAULT 'pending',
  transaction_hash TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS chain_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id     UUID REFERENCES escrows(id) ON DELETE CASCADE,
  hackathon_id  UUID REFERENCES hackathons(id) ON DELETE CASCADE,
  proposal_id   UUID REFERENCES proposals(id) ON DELETE SET NULL,
  kind          chain_tx_kind NOT NULL,
  tx_hash       TEXT UNIQUE,
  status        chain_tx_status NOT NULL DEFAULT 'pending',
  signer_wallet TEXT,
  error_message TEXT,
  raw_response  JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  action_type     TEXT NOT NULL,
  state           idempotency_state NOT NULL DEFAULT 'locked',
  hackathon_id    UUID REFERENCES hackathons(id) ON DELETE SET NULL,
  proposal_id     UUID REFERENCES proposals(id) ON DELETE SET NULL,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_wallet TEXT,
  hackathon_id UUID REFERENCES hackathons(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hackathons_updated_at ON hackathons;
CREATE TRIGGER hackathons_updated_at
  BEFORE UPDATE ON hackathons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS escrows_updated_at ON escrows;
CREATE TRIGGER escrows_updated_at
  BEFORE UPDATE ON escrows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: the browser publishable key can only read the public event catalog.
-- Inserts/updates/deletes go through Next.js API routes using SUPABASE_SERVICE_ROLE_KEY
-- (service_role bypasses RLS). Never grant USING (true) WITH CHECK (true) to anon.
ALTER TABLE hackathons ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hackathons_anon_all ON hackathons;
DROP POLICY IF EXISTS hackathons_public_read ON hackathons;
CREATE POLICY hackathons_public_read ON hackathons
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS proposals_anon_all ON proposals;
DROP POLICY IF EXISTS escrows_anon_all ON escrows;
DROP POLICY IF EXISTS organizers_anon_all ON organizers;
DROP POLICY IF EXISTS sponsors_anon_all ON sponsors;
DROP POLICY IF EXISTS audit_logs_anon_all ON audit_logs;

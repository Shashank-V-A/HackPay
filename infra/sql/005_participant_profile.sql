-- Participant profile fields (dashboard + edit profile)
ALTER TABLE participants ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS headline TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS organization TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS stack TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE participants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_username_unique
  ON participants (lower(username))
  WHERE username IS NOT NULL AND length(trim(username)) > 0;

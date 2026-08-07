-- ============================================================
-- KIBBISAVE — profile extras + group messages (safe to re-run)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Payment methods (MTN MoMo / Airtel / bank)
CREATE TABLE IF NOT EXISTS payment_methods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,          -- mtn_momo | airtel | bank
  label         TEXT,
  account_ref   TEXT NOT NULL,          -- phone or account number
  is_default    BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pm_user ON payment_methods(user_id);

-- Per-user app settings (JSONB blob)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Group chat messages (members only)
CREATE TABLE IF NOT EXISTS group_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gm_msg_group ON group_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gm_msg_user  ON group_messages(user_id);

-- Per-member last-read for unread dots on home My groups cards
ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS messages_last_read_at TIMESTAMPTZ;

-- Ensure phone column exists on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

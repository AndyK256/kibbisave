-- ============================================================
-- KIBBISAVE — Community Admin (cash collectors / KYC / PIN)
-- Safe to re-run. Run after communities-v2.sql + auth-registration.sql
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
  ON users (lower(username))
  WHERE username IS NOT NULL AND username <> '';

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS daily_rate BIGINT DEFAULT 0;

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS registered_by UUID REFERENCES users(id);

CREATE TABLE IF NOT EXISTS community_admins (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  address         TEXT,
  photo_scan_url  TEXT,
  pin_hash        TEXT,
  kyc_complete    BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_deposit_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           UUID NOT NULL REFERENCES users(id),
  admin_id            UUID NOT NULL REFERENCES users(id),
  community_id        UUID REFERENCES communities(id),
  group_id            UUID REFERENCES groups(id),
  amount              BIGINT NOT NULL,
  amount_on_track_gap BIGINT DEFAULT 0,
  payment_method      TEXT NOT NULL DEFAULT 'cash'
                      CHECK (payment_method IN ('cash', 'mtn_momo', 'airtel', 'bank', 'manual')),
  phone               TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
  source              TEXT NOT NULL DEFAULT 'consumer'
                      CHECK (source IN ('consumer', 'manual')),
  pair_id             UUID,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  approved_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_adr_admin_status
  ON admin_deposit_requests (admin_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_adr_member
  ON admin_deposit_requests (member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID NOT NULL REFERENCES users(id),
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  data         JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin
  ON admin_audit_log (admin_id, created_at DESC);

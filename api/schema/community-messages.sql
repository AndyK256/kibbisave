-- ============================================================
-- KIBBISAVE — community channel messages (members only)
-- Safe to re-run.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS community_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cm_msg_community
  ON community_messages(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_msg_user
  ON community_messages(user_id);

-- ============================================================
-- KIBBISAVE — community creator privileges (safe to re-run)
-- DM threads between community creator and a member, plus
-- group_id on standings for optional group-chat deep links.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Soften FK so deleting a community removes memberships
ALTER TABLE community_members DROP CONSTRAINT IF EXISTS community_members_community_id_fkey;
ALTER TABLE community_members
  ADD CONSTRAINT community_members_community_id_fkey
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE;

ALTER TABLE community_members DROP CONSTRAINT IF EXISTS community_members_user_id_fkey;
ALTER TABLE community_members
  ADD CONSTRAINT community_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Creator ↔ member messages scoped to a community
CREATE TABLE IF NOT EXISTS community_member_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  from_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cmm_thread
  ON community_member_messages(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmm_users
  ON community_member_messages(community_id, from_user_id, to_user_id);

-- Standings: include member's latest active group id (for Message → group chat)
DROP VIEW IF EXISTS community_standings;
CREATE VIEW community_standings AS
SELECT
  cm.community_id,
  cm.user_id,
  cm.joined_at,
  u.display_name,
  u.avatar_url,
  COALESCE(s.total_savings, 0) AS total_savings,
  COALESCE(s.total_goal, 0)    AS total_goal,
  COALESCE(s.pct_reached, 0)   AS pct_reached,
  COALESCE(s.avg_lead, 0)      AS avg_lead,
  COALESCE(s.active_groups, 0) AS active_groups,
  (SELECT g.id FROM group_members gm
     JOIN groups g ON g.id = gm.group_id
   WHERE gm.user_id = cm.user_id AND gm.status = 'active'
   ORDER BY gm.joined_at DESC LIMIT 1) AS group_id,
  (SELECT COALESCE(g.name, g.code) FROM group_members gm
     JOIN groups g ON g.id = gm.group_id
   WHERE gm.user_id = cm.user_id AND gm.status = 'active'
   ORDER BY gm.joined_at DESC LIMIT 1) AS group_name
FROM community_members cm
JOIN users u ON u.id = cm.user_id
LEFT JOIN user_home_summary s ON s.user_id = cm.user_id;

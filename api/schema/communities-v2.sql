-- ============================================================
-- KIBBISAVE — COMMUNITIES (run once in Neon SQL Editor,
-- after groups-home.sql). Safe to re-run.
-- Spec: a community groups individuals from different savings
-- groups who share something in common ("men", "Baganda", ...).
-- Public = open to all. Private = needs link/code to join.
-- Start date only, no end date. No member limit.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS communities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    UUID REFERENCES users(id),
  name          TEXT NOT NULL,
  about         TEXT,                          -- max 150 chars (enforced in API)
  country       TEXT DEFAULT 'Uganda',
  city          TEXT,
  icon          TEXT DEFAULT '👥',             -- creator-chosen emoji shown on cards
  is_public     BOOLEAN DEFAULT TRUE,
  join_code     TEXT UNIQUE,                   -- private communities: code/link to join
  created_at    TIMESTAMPTZ DEFAULT NOW()      -- start date (no end date)
);

-- Safe re-run: add icon if an older communities table already exists
ALTER TABLE communities ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '👥';

CREATE TABLE IF NOT EXISTS community_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID REFERENCES communities(id),
  user_id       UUID REFERENCES users(id),
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cm_community ON community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_cm_user      ON community_members(user_id);

-- join code for private communities, e.g. KBC-7F3A9
CREATE OR REPLACE FUNCTION generate_community_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_public = FALSE AND NEW.join_code IS NULL THEN
    NEW.join_code := 'KBC-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT,'-',''), 1, 5));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_code ON communities;
CREATE TRIGGER trg_community_code
BEFORE INSERT ON communities FOR EACH ROW
EXECUTE FUNCTION generate_community_code();

-- ------------------------------------------------------------
-- Member standings ("Race to the top"): every member ranked by
-- their average lead across all their active groups.
-- Card shows: name, amount saving towards, progress, group name.
-- ------------------------------------------------------------
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
  (SELECT COALESCE(g.name, g.code) FROM group_members gm
     JOIN groups g ON g.id = gm.group_id
   WHERE gm.user_id = cm.user_id AND gm.status = 'active'
   ORDER BY gm.joined_at DESC LIMIT 1) AS group_name
FROM community_members cm
JOIN users u ON u.id = cm.user_id
LEFT JOIN user_home_summary s ON s.user_id = cm.user_id;

-- Community totals (cause total savings progress — recalculates
-- automatically because it reads live member data)
DROP VIEW IF EXISTS community_totals;
CREATE VIEW community_totals AS
SELECT
  c.id AS community_id,
  COUNT(cm.id)                       AS total_members,
  COALESCE(SUM(s.total_savings), 0)  AS total_saved,
  COALESCE(SUM(s.total_goal), 0)     AS total_goal,
  CASE WHEN COALESCE(SUM(s.total_goal), 0) > 0
    THEN ROUND(SUM(s.total_savings)::DECIMAL / SUM(s.total_goal) * 100, 2)
    ELSE 0 END                       AS pct_reached
FROM communities c
LEFT JOIN community_members cm ON cm.community_id = c.id
LEFT JOIN user_home_summary s  ON s.user_id = cm.user_id
GROUP BY c.id;

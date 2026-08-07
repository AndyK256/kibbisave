-- ============================================================
-- KIBBISAVE — GROUPS + HOME PAGE
--
-- Fresh DB: run google-auth.sql first, then this file.
-- Existing Neon with foundation v1 schema: run migrate-home-from-v1.sql
--   instead (or: node scripts/apply-home-migration.js).
-- Safe to re-run: IF NOT EXISTS / OR REPLACE everywhere.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- users: phone becomes the account number later (OTP login feature)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT UNIQUE;

-- ------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      UUID REFERENCES users(id),

  name            TEXT,                       -- first joiner suggests it (<=10 chars)
  code            TEXT UNIQUE,
  is_private      BOOLEAN DEFAULT FALSE,
  is_system       BOOLEAN DEFAULT FALSE,      -- the 5 auto-generated open groups

  period_months   INTEGER,                    -- 2 / 3 / 5 / 8 / 12
  tier            TEXT CHECK (tier IN ('upto_3m','above_3m')),  -- legacy; new catalog is untiered

  target_amount   BIGINT DEFAULT 0,           -- sum of member goals
  total_saved     BIGINT DEFAULT 0,
  target_pct      DECIMAL(5,2) DEFAULT 0,

  status          TEXT DEFAULT 'open'
                  CHECK (status IN ('open','locked','active','completed','expired')),
  max_members     INTEGER DEFAULT 7,
  current_members INTEGER DEFAULT 0,

  first_member_at TIMESTAMPTZ,                -- start date = first member joins
  name_locked     BOOLEAN DEFAULT FALSE,
  starts_at       TIMESTAMPTZ DEFAULT NOW(),
  closes_at       TIMESTAMPTZ,

  leaderboard_rank      INTEGER,
  leaderboard_prev_rank INTEGER,
  avg_member_lead       DECIMAL(6,2) DEFAULT 0,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID REFERENCES groups(id),
  user_id         UUID REFERENCES users(id),
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','left','removed')),

  goal_amount     BIGINT DEFAULT 0,           -- their own promised amount
  saving_for      TEXT,                       -- "what are you saving for"
  ends_at         TIMESTAMPTZ,                -- joined_at + period

  total_deposited BIGINT DEFAULT 0,
  target_pct      DECIMAL(5,2) DEFAULT 0,
  avg_lead        DECIMAL(6,2) DEFAULT 0,     -- % ahead(+) / behind(-)
  rank_in_group   INTEGER,
  prev_rank       INTEGER,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  messages_last_read_at TIMESTAMPTZ,
  UNIQUE (group_id, user_id)
);

-- double-entry ledger: every deposit = one debit + one credit row
CREATE TABLE IF NOT EXISTS transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID REFERENCES groups(id),
  user_id         UUID REFERENCES users(id),
  group_member_id UUID REFERENCES group_members(id),
  entry_type      TEXT NOT NULL CHECK (entry_type IN ('debit','credit')),
  pair_id         UUID NOT NULL,
  amount          BIGINT NOT NULL,
  tx_type         TEXT NOT NULL CHECK (tx_type IN ('deposit','refund','fee')),
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed')),
  provider        TEXT,
  provider_ref    TEXT,
  phone_used      TEXT,
  initiated_at    TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  failure_reason  TEXT,
  note            TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  data        JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_status   ON groups(status);
CREATE INDEX IF NOT EXISTS idx_members_group   ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_members_user    ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_pair         ON transactions(pair_id);
CREATE INDEX IF NOT EXISTS idx_notif_user      ON notifications(user_id);

-- group code, e.g. KBS-8M-4821
CREATE OR REPLACE FUNCTION generate_group_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW.code := 'KBS-' || COALESCE(NEW.period_months, 0) || 'M-' ||
              LPAD(FLOOR(RANDOM() * 9999)::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_group_code ON groups;
CREATE TRIGGER trg_group_code
BEFORE INSERT ON groups FOR EACH ROW
WHEN (NEW.code IS NULL)
EXECUTE FUNCTION generate_group_code();

-- ------------------------------------------------------------
-- 2. ALWAYS 5 OPEN SYSTEM GROUPS (2m / 3m / 5m / 8m / 12m)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_open_groups()
RETURNS VOID AS $$
DECLARE
  slot RECORD;
BEGIN
  -- Midnight / day-rollover: empty open system groups get today's start + period close.
  -- Groups with members keep their original dates.
  UPDATE groups
  SET starts_at = CURRENT_DATE::timestamptz,
      closes_at = (CURRENT_DATE + (period_months || ' months')::INTERVAL)::timestamptz,
      updated_at = NOW()
  WHERE is_system = TRUE
    AND status = 'open'
    AND COALESCE(current_members, 0) = 0
    AND first_member_at IS NULL
    AND starts_at::date < CURRENT_DATE;

  FOR slot IN
    SELECT * FROM (VALUES
      (2, NULL::TEXT), (3, NULL::TEXT), (5, NULL::TEXT), (8, NULL::TEXT), (12, NULL::TEXT)
    ) AS s(months, slot_tier)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM groups
      WHERE is_system = TRUE AND status = 'open'
        AND period_months = slot.months
        AND (tier IS NULL AND slot.slot_tier IS NULL OR tier = slot.slot_tier)
    ) THEN
      INSERT INTO groups (is_system, period_months, tier, max_members, starts_at, closes_at, status)
      VALUES (TRUE, slot.months, slot.slot_tier, 7,
              CURRENT_DATE::timestamptz,
              (CURRENT_DATE + (slot.months || ' months')::INTERVAL)::timestamptz,
              'open');
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- close at 7 days after first member (>=2 keeps going, <2 expires);
-- empty groups refresh dates at day rollover (via ensure_open_groups); always top back up to 5
CREATE OR REPLACE FUNCTION close_due_groups()
RETURNS VOID AS $$
BEGIN
  UPDATE groups
  SET status = CASE WHEN current_members >= 2 THEN 'active' ELSE 'expired' END,
      updated_at = NOW()
  WHERE is_system = TRUE AND status = 'open'
    AND first_member_at IS NOT NULL
    AND first_member_at + INTERVAL '7 days' < NOW();

  -- Empty open groups: refresh dates instead of expiring (day rollover)
  UPDATE groups
  SET starts_at = CURRENT_DATE::timestamptz,
      closes_at = (CURRENT_DATE + (period_months || ' months')::INTERVAL)::timestamptz,
      updated_at = NOW()
  WHERE is_system = TRUE AND status = 'open'
    AND COALESCE(current_members, 0) = 0
    AND first_member_at IS NULL
    AND starts_at::date < CURRENT_DATE;

  PERFORM ensure_open_groups();
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 3. JOIN AN OPEN GROUP
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_open_group(
  p_user_id UUID, p_group_id UUID, p_goal_amount BIGINT,
  p_saving_for TEXT, p_suggest_name TEXT
)
RETURNS UUID AS $$
DECLARE
  v_group RECORD;
  v_member_id UUID;
BEGIN
  SELECT * INTO v_group FROM groups WHERE id = p_group_id FOR UPDATE;

  IF v_group.id IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;
  IF v_group.status != 'open' THEN RAISE EXCEPTION 'Group is not open for joining'; END IF;
  IF v_group.current_members >= v_group.max_members THEN RAISE EXCEPTION 'Group is full'; END IF;
  IF p_goal_amount IS NULL OR p_goal_amount <= 0 THEN
    RAISE EXCEPTION 'Goal amount must be greater than zero';
  END IF;
  IF EXISTS (SELECT 1 FROM group_members
             WHERE user_id = p_user_id AND group_id = p_group_id AND status = 'active') THEN
    RAISE EXCEPTION 'You are already in this group';
  END IF;
  IF v_group.tier = 'upto_3m'  AND p_goal_amount >  3000000 THEN
    RAISE EXCEPTION 'This group is for goals up to UGX 3,000,000';
  END IF;
  IF v_group.tier = 'above_3m' AND p_goal_amount <= 3000000 THEN
    RAISE EXCEPTION 'This group is for goals above UGX 3,000,000';
  END IF;

  IF v_group.first_member_at IS NULL THEN
    UPDATE groups
    SET first_member_at = NOW(), starts_at = NOW(),
        closes_at = NOW() + (period_months || ' months')::INTERVAL
    WHERE id = p_group_id;
  END IF;

  IF p_suggest_name IS NOT NULL AND LENGTH(TRIM(p_suggest_name)) > 0
     AND v_group.name_locked = FALSE THEN
    UPDATE groups SET name = LEFT(TRIM(p_suggest_name), 10), name_locked = TRUE
    WHERE id = p_group_id;
  END IF;

  INSERT INTO group_members (group_id, user_id, goal_amount, saving_for, ends_at)
  VALUES (p_group_id, p_user_id, p_goal_amount, p_saving_for,
          NOW() + (v_group.period_months || ' months')::INTERVAL)
  RETURNING id INTO v_member_id;

  UPDATE groups
  SET current_members = current_members + 1,
      target_amount   = target_amount + p_goal_amount,
      status = CASE WHEN current_members + 1 >= max_members THEN 'active' ELSE status END,
      updated_at = NOW()
  WHERE id = p_group_id;

  PERFORM ensure_open_groups();
  RETURN v_member_id;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 4. DOUBLE-ENTRY DEPOSIT
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_deposit(
  p_user_id UUID, p_group_id UUID, p_amount BIGINT,
  p_provider TEXT, p_provider_ref TEXT, p_phone TEXT
)
RETURNS UUID AS $$
DECLARE
  v_pair_id UUID := gen_random_uuid();
  v_member_id UUID;
BEGIN
  SELECT id INTO v_member_id FROM group_members
  WHERE user_id = p_user_id AND group_id = p_group_id AND status = 'active';
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this group';
  END IF;

  INSERT INTO transactions (group_id, user_id, group_member_id, entry_type, pair_id,
                            amount, tx_type, status, provider, provider_ref, phone_used)
  VALUES (p_group_id, p_user_id, v_member_id, 'debit',  v_pair_id, p_amount, 'deposit',
          'pending', p_provider, p_provider_ref, p_phone),
         (p_group_id, p_user_id, v_member_id, 'credit', v_pair_id, p_amount, 'deposit',
          'pending', p_provider, p_provider_ref, p_phone);
  RETURN v_pair_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION confirm_deposit(p_pair_id UUID)
RETURNS VOID AS $$
DECLARE
  v_amount BIGINT; v_user_id UUID; v_group_id UUID; v_member_id UUID;
BEGIN
  SELECT amount, user_id, group_id, group_member_id
  INTO v_amount, v_user_id, v_group_id, v_member_id
  FROM transactions
  WHERE pair_id = p_pair_id AND entry_type = 'credit' LIMIT 1;

  IF v_amount IS NULL THEN RAISE EXCEPTION 'No transaction found for this deposit'; END IF;

  UPDATE transactions SET status = 'confirmed', confirmed_at = NOW() WHERE pair_id = p_pair_id;
  UPDATE group_members SET total_deposited = total_deposited + v_amount, updated_at = NOW()
  WHERE id = v_member_id;
  UPDATE groups SET total_saved = total_saved + v_amount, updated_at = NOW()
  WHERE id = v_group_id;

  PERFORM recalculate_rankings(v_group_id);
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 5. RANKINGS — vs each member's OWN goal + OWN clock
-- lead % = (deposited / goal)% - (time elapsed / period)%
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_rankings(p_group_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE group_members gm
  SET
    target_pct = CASE WHEN gm.goal_amount > 0
      THEN ROUND(LEAST(999.99, (gm.total_deposited::DECIMAL / gm.goal_amount) * 100), 2)
      ELSE 0 END,
    avg_lead = CASE WHEN gm.goal_amount > 0 AND gm.ends_at IS NOT NULL
      THEN ROUND(
        ((gm.total_deposited::DECIMAL / gm.goal_amount) * 100)
        - LEAST(100, GREATEST(0,
            EXTRACT(EPOCH FROM (NOW() - gm.joined_at))
            / NULLIF(EXTRACT(EPOCH FROM (gm.ends_at - gm.joined_at)), 0) * 100)),
      2)
      ELSE 0 END,
    updated_at = NOW()
  WHERE gm.group_id = p_group_id AND gm.status = 'active';

  UPDATE group_members SET prev_rank = rank_in_group WHERE group_id = p_group_id;

  UPDATE group_members gm
  SET rank_in_group = ranks.new_rank
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY avg_lead DESC, total_deposited DESC, joined_at ASC) AS new_rank
    FROM group_members WHERE group_id = p_group_id AND status = 'active'
  ) ranks
  WHERE gm.id = ranks.id;

  UPDATE groups
  SET
    target_pct = CASE WHEN target_amount > 0
      THEN ROUND(LEAST(999.99, (total_saved::DECIMAL / target_amount) * 100), 2) ELSE 0 END,
    avg_member_lead = COALESCE((SELECT ROUND(AVG(avg_lead), 2) FROM group_members
                                WHERE group_id = p_group_id AND status = 'active'), 0),
    leaderboard_prev_rank = leaderboard_rank,
    updated_at = NOW()
  WHERE id = p_group_id;

  -- only closed groups (full or week done) are ranked on the leaderboard
  UPDATE groups g
  SET leaderboard_rank = ranks.new_rank
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY avg_member_lead DESC) AS new_rank
    FROM groups WHERE status IN ('active','locked','completed')
  ) ranks
  WHERE g.id = ranks.id;
END;
$$ LANGUAGE plpgsql;

-- every-30-minutes refresh (spec) — call from Vercel Cron: GET /api/cron
CREATE OR REPLACE FUNCTION recalc_all_groups()
RETURNS VOID AS $$
DECLARE g RECORD;
BEGIN
  FOR g IN SELECT id FROM groups WHERE status IN ('open','active','locked') LOOP
    PERFORM recalculate_rankings(g.id);
  END LOOP;
  PERFORM close_due_groups();
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 6. VIEWS
-- ------------------------------------------------------------
DROP VIEW IF EXISTS user_home_summary;
CREATE VIEW user_home_summary AS
SELECT
  gm.user_id,
  SUM(gm.total_deposited) AS total_savings,
  COUNT(*)                AS active_groups,
  SUM(gm.goal_amount)     AS total_goal,
  CASE WHEN SUM(gm.goal_amount) > 0
    THEN ROUND(SUM(gm.total_deposited)::DECIMAL / SUM(gm.goal_amount) * 100, 2)
    ELSE 0 END            AS pct_reached,
  ROUND(AVG(gm.avg_lead), 2) AS avg_lead,
  MIN(gm.ends_at)         AS next_end_date
FROM group_members gm
JOIN groups g ON g.id = gm.group_id
WHERE gm.status = 'active' AND g.status IN ('open','active','locked')
GROUP BY gm.user_id;

DROP VIEW IF EXISTS user_group_standings;
CREATE VIEW user_group_standings AS
SELECT
  gm.user_id, gm.group_id, gm.total_deposited, gm.goal_amount, gm.saving_for,
  gm.ends_at, gm.target_pct, gm.avg_lead, gm.rank_in_group, gm.prev_rank,
  g.name AS group_name, g.code AS group_code, g.period_months, g.tier,
  g.current_members, g.max_members, g.target_amount, g.total_saved,
  g.leaderboard_rank, g.leaderboard_prev_rank, g.closes_at, g.starts_at,
  g.status, g.is_private
FROM group_members gm
JOIN groups g ON g.id = gm.group_id
WHERE gm.status = 'active';

-- ------------------------------------------------------------
-- 7. PRIVATE GROUPS (create private group, spec)
-- anyone_can_join ON  = anyone with the link joins directly
-- anyone_can_join OFF = the joining code (group code) is required
-- ------------------------------------------------------------
ALTER TABLE groups ADD COLUMN IF NOT EXISTS anyone_can_join BOOLEAN DEFAULT TRUE;

-- ------------------------------------------------------------
-- 8. SEED THE FIRST 5 OPEN GROUPS
-- ------------------------------------------------------------
SELECT ensure_open_groups();

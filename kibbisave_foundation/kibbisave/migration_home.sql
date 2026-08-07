-- ============================================================
-- KIBBISAVE MIGRATION 2 — HOME PAGE + OPEN GROUPS + CALCULATIONS
-- Run AFTER schema.sql and ledger.sql
-- Supabase Dashboard > SQL Editor > paste > Run
-- ============================================================

-- ------------------------------------------------------------
-- 1. NEW COLUMNS
-- ------------------------------------------------------------

-- Groups: system-generated open groups (2, 3, 5, 8, 12 months)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS period_months   INTEGER;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS tier            TEXT
  CHECK (tier IN ('upto_3m','above_3m'));          -- only for 8-month groups
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_system       BOOLEAN DEFAULT FALSE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS first_member_at TIMESTAMPTZ;  -- start date = first member
ALTER TABLE groups ADD COLUMN IF NOT EXISTS name_locked     BOOLEAN DEFAULT FALSE;

-- Groups: system groups have no fixed target until members set goals
ALTER TABLE groups ALTER COLUMN saving_range_min DROP NOT NULL;
ALTER TABLE groups ALTER COLUMN saving_range_max DROP NOT NULL;
ALTER TABLE groups ALTER COLUMN daily_rate       DROP NOT NULL;
ALTER TABLE groups ALTER COLUMN target_amount    SET DEFAULT 0;

-- Members: each member saves their OWN amount over the group period
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS goal_amount BIGINT  DEFAULT 0;  -- what they promised
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS saving_for  TEXT;               -- "what are you saving for"
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS ends_at     TIMESTAMPTZ;        -- join date + period
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW(); -- used by confirm_deposit

-- NB (from spec): no interest — interest_rate stays in schema but is never
-- used in calculations or shown in the UI.

-- ------------------------------------------------------------
-- 2. ENSURE 5 OPEN SYSTEM GROUPS
-- Slots: 2m / 3m / 5m / 8m / 12m (close at 7 members)
-- Called on every read of open groups — cheap when nothing to do
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_open_groups()
RETURNS VOID AS $$
DECLARE
  slot RECORD;
BEGIN
  -- Day rollover: refresh start/close for empty open system groups only
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
      (2,  NULL::TEXT),
      (3,  NULL::TEXT),
      (5,  NULL::TEXT),
      (8,  NULL::TEXT),
      (12, NULL::TEXT)
    ) AS s(months, slot_tier)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM groups
      WHERE is_system = TRUE AND status = 'open'
        AND period_months = slot.months
        AND (tier IS NULL AND slot.slot_tier IS NULL OR tier = slot.slot_tier)
    ) THEN
      INSERT INTO groups (
        is_system, period_months, tier,
        duration_type, duration_days, max_members,
        target_amount, starts_at, closes_at, status
      ) VALUES (
        TRUE, slot.months, slot.slot_tier,
        slot.months || 'M', slot.months * 30, 7,
        0,
        CURRENT_DATE::timestamptz,
        (CURRENT_DATE + (slot.months || ' months')::INTERVAL)::timestamptz,
        'open'
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 3. CLOSE / REGENERATE OPEN GROUPS
-- Rules from spec:
--  * a group closes when it reaches 7 members (handled in join), OR
--  * 7 days after the first person joined (>=2 members closes with
--    whoever is in; fewer than 2 members -> expire and regenerate)
--  * empty groups (0 members): start/close dates refresh at day rollover
-- Call this before reading open groups (and from a cron later)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION close_due_groups()
RETURNS VOID AS $$
BEGIN
  -- 7 days after first member: close (>=2 members) or expire (<2)
  UPDATE groups
  SET status = CASE WHEN current_members >= 2 THEN 'active' ELSE 'expired' END,
      updated_at = NOW()
  WHERE is_system = TRUE AND status = 'open'
    AND first_member_at IS NOT NULL
    AND first_member_at + INTERVAL '7 days' < NOW();

  -- Empty open groups: refresh dates on day rollover (do not expire)
  UPDATE groups
  SET starts_at = CURRENT_DATE::timestamptz,
      closes_at = (CURRENT_DATE + (period_months || ' months')::INTERVAL)::timestamptz,
      updated_at = NOW()
  WHERE is_system = TRUE AND status = 'open'
    AND COALESCE(current_members, 0) = 0
    AND first_member_at IS NULL
    AND starts_at::date < CURRENT_DATE;

  -- top back up to 5 open groups
  PERFORM ensure_open_groups();
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 4. JOIN AN OPEN GROUP (with goal, saving-for, suggested name)
-- First member sets start date; end date = start + period.
-- First suggested name sticks (max 10 chars) until group closes.
-- Group locks (closes to new joiners) at 7 members.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_open_group(
  p_user_id      UUID,
  p_group_id     UUID,
  p_goal_amount  BIGINT,
  p_saving_for   TEXT,
  p_suggest_name TEXT
)
RETURNS UUID AS $$
DECLARE
  v_group     RECORD;
  v_member_id UUID;
BEGIN
  SELECT * INTO v_group FROM groups WHERE id = p_group_id FOR UPDATE;

  IF v_group.id IS NULL THEN
    RAISE EXCEPTION 'Group not found';
  END IF;
  IF v_group.status != 'open' THEN
    RAISE EXCEPTION 'Group is not open for joining';
  END IF;
  IF v_group.current_members >= v_group.max_members THEN
    RAISE EXCEPTION 'Group is full';
  END IF;
  IF p_goal_amount IS NULL OR p_goal_amount <= 0 THEN
    RAISE EXCEPTION 'Goal amount must be greater than zero';
  END IF;
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE user_id = p_user_id AND group_id = p_group_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'User is already in this group';
  END IF;
  -- 8-month tiers: enforce the 3,000,000 boundary
  IF v_group.tier = 'upto_3m'  AND p_goal_amount >  3000000 THEN
    RAISE EXCEPTION 'This group is for goals up to UGX 3,000,000';
  END IF;
  IF v_group.tier = 'above_3m' AND p_goal_amount <= 3000000 THEN
    RAISE EXCEPTION 'This group is for goals above UGX 3,000,000';
  END IF;

  -- first member starts the clock
  IF v_group.first_member_at IS NULL THEN
    UPDATE groups
    SET first_member_at = NOW(),
        starts_at = NOW(),
        closes_at = NOW() + (period_months || ' months')::INTERVAL
    WHERE id = p_group_id;
  END IF;

  -- first suggested name sticks (max 10 chars)
  IF p_suggest_name IS NOT NULL AND LENGTH(TRIM(p_suggest_name)) > 0
     AND v_group.name_locked = FALSE THEN
    UPDATE groups
    SET name = LEFT(TRIM(p_suggest_name), 10), name_locked = TRUE
    WHERE id = p_group_id;
  END IF;

  INSERT INTO group_members (group_id, user_id, goal_amount, saving_for, ends_at)
  VALUES (
    p_group_id, p_user_id, p_goal_amount, p_saving_for,
    NOW() + (v_group.period_months || ' months')::INTERVAL
  )
  RETURNING id INTO v_member_id;

  UPDATE groups
  SET current_members = current_members + 1,
      target_amount   = target_amount + p_goal_amount,  -- group goal = sum of member goals
      status = CASE WHEN current_members + 1 >= max_members THEN 'active' ELSE status END,
      updated_at = NOW()
  WHERE id = p_group_id;

  -- keep 5 groups open if this one just filled
  PERFORM ensure_open_groups();

  RETURN v_member_id;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 5. RANKINGS — recalculated per MEMBER GOAL (not group target)
-- ahead/behind % = (deposited / own goal)% - (time elapsed / own period)%
-- Recalculate on every confirmed deposit + every 30 min (cron)
-- Replaces the version in ledger.sql
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_rankings(p_group_id UUID)
RETURNS VOID AS $$
BEGIN
  -- each member measured against their OWN goal and OWN clock
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
            / NULLIF(EXTRACT(EPOCH FROM (gm.ends_at - gm.joined_at)), 0) * 100
          )),
      2)
      ELSE 0 END,
    updated_at = NOW()
  WHERE gm.group_id = p_group_id AND gm.status = 'active';

  -- save previous ranks
  UPDATE group_members SET prev_rank = rank_in_group
  WHERE group_id = p_group_id;

  -- rank members 1..10 by their average lead
  UPDATE group_members gm
  SET rank_in_group = ranks.new_rank
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY avg_lead DESC, total_deposited DESC, joined_at ASC) AS new_rank
    FROM group_members
    WHERE group_id = p_group_id AND status = 'active'
  ) ranks
  WHERE gm.id = ranks.id;

  -- group aggregates: avg of member leads ("average of the averages")
  UPDATE groups
  SET
    target_pct = CASE WHEN target_amount > 0
      THEN ROUND(LEAST(999.99, (total_saved::DECIMAL / target_amount) * 100), 2)
      ELSE 0 END,
    avg_member_lead = COALESCE((
      SELECT ROUND(AVG(avg_lead), 2) FROM group_members
      WHERE group_id = p_group_id AND status = 'active'
    ), 0),
    leaderboard_prev_rank = leaderboard_rank,
    updated_at = NOW()
  WHERE id = p_group_id;

  -- leaderboard rule: only CLOSED groups (full or 7-day week done) are ranked
  UPDATE groups g
  SET leaderboard_rank = ranks.new_rank
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY avg_member_lead DESC) AS new_rank
    FROM groups
    WHERE status IN ('active','locked','completed')
  ) ranks
  WHERE g.id = ranks.id;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 6. 30-MINUTE RECALCULATION (spec: number reduces every 30 min)
-- Schedule with Supabase pg_cron:
--   SELECT cron.schedule('kibbi-recalc', '*/30 * * * *',
--     'SELECT recalc_all_groups(); SELECT close_due_groups();');
-- (Enable the pg_cron extension in Supabase: Database > Extensions)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalc_all_groups()
RETURNS VOID AS $$
DECLARE
  g RECORD;
BEGIN
  FOR g IN SELECT id FROM groups WHERE status IN ('open','active','locked') LOOP
    PERFORM recalculate_rankings(g.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 7. HOME SUMMARY VIEW — one row per user
-- "My total savings", active groups count, % reached, goal, avg lead
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW user_home_summary AS
SELECT
  gm.user_id,
  SUM(gm.total_deposited)                                  AS total_savings,
  COUNT(*)                                                 AS active_groups,
  SUM(gm.goal_amount)                                      AS total_goal,
  CASE WHEN SUM(gm.goal_amount) > 0
    THEN ROUND(SUM(gm.total_deposited)::DECIMAL / SUM(gm.goal_amount) * 100, 2)
    ELSE 0 END                                             AS pct_reached,
  ROUND(AVG(gm.avg_lead), 2)                               AS avg_lead,
  MIN(gm.ends_at)                                          AS next_end_date
FROM group_members gm
JOIN groups g ON g.id = gm.group_id
WHERE gm.status = 'active' AND g.status IN ('open','active','locked')
GROUP BY gm.user_id;

-- ------------------------------------------------------------
-- 8. REBUILD user_group_standings
-- Old view INNER JOINed causes — system groups have no cause, so a
-- user's open-group memberships would never show. Also adds the
-- member's own goal + the new group fields the home page needs.
-- (DROP first: Postgres cannot change a view's columns in-place.)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS user_group_standings;
CREATE VIEW user_group_standings AS
SELECT
  gm.user_id,
  gm.group_id,
  gm.total_deposited,
  gm.goal_amount,
  gm.saving_for,
  gm.ends_at,
  gm.target_pct,
  gm.avg_lead,
  gm.rank_in_group,
  gm.prev_rank,
  g.name            AS group_name,
  g.code            AS group_code,
  g.period_months,
  g.tier,
  g.current_members,
  g.max_members,
  g.target_amount,
  g.total_saved,
  g.leaderboard_rank,
  g.leaderboard_prev_rank,
  g.closes_at,
  g.starts_at,
  g.status,
  g.is_private,
  c.title           AS cause_title,
  c.category
FROM group_members gm
JOIN groups g ON g.id = gm.group_id
LEFT JOIN causes c ON c.id = g.cause_id
WHERE gm.status = 'active';

-- ------------------------------------------------------------
-- 9. SEED THE FIRST 5 OPEN GROUPS NOW
-- ------------------------------------------------------------
SELECT ensure_open_groups();

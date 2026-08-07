-- ============================================================
-- KIBBISAVE — open groups catalog v2 + message unread tracking
-- Safe to re-run.
--
-- Catalog: 2m / 3m / 5m / 8m (no UGX tier) / 12m
-- Close at 7 members (was 10). Dropped above_3m + extra 8m tier.
-- ============================================================

-- Unread: last time the member opened the group messages tab
ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS messages_last_read_at TIMESTAMPTZ;

-- Default max for new groups
ALTER TABLE groups ALTER COLUMN max_members SET DEFAULT 7;

-- Open system groups still recruiting: use 7-member close
UPDATE groups
SET max_members = 7, updated_at = NOW()
WHERE is_system = TRUE
  AND status = 'open'
  AND COALESCE(max_members, 10) <> 7;

-- Retire empty obsolete catalog slots (tiered 8m / above 3M)
UPDATE groups
SET status = 'expired', updated_at = NOW()
WHERE is_system = TRUE
  AND status = 'open'
  AND COALESCE(current_members, 0) = 0
  AND (
    tier = 'above_3m'
    OR (period_months = 8 AND tier IS NOT NULL)
  );

-- New catalog: 2 / 3 / 5 / 8 (untiered) / 12 — always 5 open
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
        AND (tier IS NULL AND slot.slot_tier IS NULL
             OR tier = slot.slot_tier)
    ) THEN
      INSERT INTO groups (
        is_system, period_months, tier,
        max_members, target_amount,
        starts_at, closes_at, status
      ) VALUES (
        TRUE, slot.months, slot.slot_tier,
        7, 0,
        CURRENT_DATE::timestamptz,
        (CURRENT_DATE + (slot.months || ' months')::INTERVAL)::timestamptz,
        'open'
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT ensure_open_groups();

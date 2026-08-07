-- Open groups: at day rollover, refresh start/close for empty groups only.
-- Groups with members keep their original dates.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION ensure_open_groups()
RETURNS VOID AS $$
DECLARE
  slot RECORD;
BEGIN
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
      VALUES (
        TRUE, slot.months, slot.slot_tier, 7,
        CURRENT_DATE::timestamptz,
        (CURRENT_DATE + (slot.months || ' months')::INTERVAL)::timestamptz,
        'open'
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION close_due_groups()
RETURNS VOID AS $$
BEGIN
  UPDATE groups
  SET status = CASE WHEN current_members >= 2 THEN 'active' ELSE 'expired' END,
      updated_at = NOW()
  WHERE is_system = TRUE AND status = 'open'
    AND first_member_at IS NOT NULL
    AND first_member_at + INTERVAL '7 days' < NOW();

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

SELECT ensure_open_groups();

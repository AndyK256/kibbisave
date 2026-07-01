-- ============================================================
-- DOUBLE-ENTRY LEDGER FUNCTIONS
-- These run inside your database — no external service needed
-- ============================================================

-- FUNCTION: record_deposit
-- Call this every time a user makes a deposit
-- It creates TWO transaction records atomically (both succeed or both fail)
-- ============================================================
CREATE OR REPLACE FUNCTION record_deposit(
  p_user_id       UUID,
  p_group_id      UUID,
  p_amount        BIGINT,
  p_provider      TEXT,
  p_provider_ref  TEXT,
  p_phone         TEXT
)
RETURNS UUID AS $$
DECLARE
  v_pair_id       UUID := uuid_generate_v4();
  v_member_id     UUID;
BEGIN
  -- Get the group_member id
  SELECT id INTO v_member_id
  FROM group_members
  WHERE user_id = p_user_id AND group_id = p_group_id AND status = 'active';

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'User % is not a member of group %', p_user_id, p_group_id;
  END IF;

  -- Entry 1: DEBIT — money leaves user's mobile money wallet
  INSERT INTO transactions (
    group_id, user_id, group_member_id,
    entry_type, pair_id, amount, tx_type,
    status, provider, provider_ref, phone_used
  ) VALUES (
    p_group_id, p_user_id, v_member_id,
    'debit', v_pair_id, p_amount, 'deposit',
    'pending', p_provider, p_provider_ref, p_phone
  );

  -- Entry 2: CREDIT — money arrives in group's holding balance
  INSERT INTO transactions (
    group_id, user_id, group_member_id,
    entry_type, pair_id, amount, tx_type,
    status, provider, provider_ref, phone_used
  ) VALUES (
    p_group_id, p_user_id, v_member_id,
    'credit', v_pair_id, p_amount, 'deposit',
    'pending', p_provider, p_provider_ref, p_phone
  );

  RETURN v_pair_id;  -- return pair_id so you can confirm later
END;
$$ LANGUAGE plpgsql;


-- FUNCTION: confirm_deposit
-- Call this when Flutterwave webhook confirms the payment succeeded
-- Updates balances and triggers ranking recalculation
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_deposit(p_pair_id UUID)
RETURNS VOID AS $$
DECLARE
  v_amount        BIGINT;
  v_user_id       UUID;
  v_group_id      UUID;
  v_member_id     UUID;
  v_group_target  BIGINT;
BEGIN
  -- Get deposit details
  SELECT amount, user_id, group_id, group_member_id
  INTO v_amount, v_user_id, v_group_id, v_member_id
  FROM transactions
  WHERE pair_id = p_pair_id AND entry_type = 'credit'
  LIMIT 1;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'No transaction found for pair_id %', p_pair_id;
  END IF;

  -- Mark both entries as confirmed
  UPDATE transactions
  SET status = 'confirmed', confirmed_at = NOW()
  WHERE pair_id = p_pair_id;

  -- Update member's total
  UPDATE group_members
  SET total_deposited = total_deposited + v_amount,
      updated_at = NOW()  -- add this column if needed
  WHERE id = v_member_id;

  -- Update group's total
  UPDATE groups
  SET total_saved = total_saved + v_amount,
      updated_at = NOW()
  WHERE id = v_group_id;

  -- Recalculate all percentages and rankings for this group
  PERFORM recalculate_rankings(v_group_id);

END;
$$ LANGUAGE plpgsql;


-- FUNCTION: recalculate_rankings
-- Called after every confirmed deposit in a group
-- Updates each member's % ahead/behind and their rank
-- Updates the group's avg_member_lead for the global leaderboard
-- ============================================================
CREATE OR REPLACE FUNCTION recalculate_rankings(p_group_id UUID)
RETURNS VOID AS $$
DECLARE
  v_group         RECORD;
  v_days_elapsed  DECIMAL;
  v_days_total    DECIMAL;
  v_expected_pct  DECIMAL;
BEGIN
  SELECT * INTO v_group FROM groups WHERE id = p_group_id;

  -- How far through the saving period are we?
  v_days_total   := v_group.duration_days;
  v_days_elapsed := GREATEST(1, EXTRACT(EPOCH FROM (NOW() - v_group.starts_at)) / 86400);
  v_expected_pct := LEAST(100, (v_days_elapsed / v_days_total) * 100);

  -- Update each member's % of target and % ahead/behind
  UPDATE group_members gm
  SET
    target_pct = ROUND((gm.total_deposited::DECIMAL / v_group.target_amount) * 100, 2),
    avg_lead   = ROUND(
                   ((gm.total_deposited::DECIMAL / v_group.target_amount) * 100)
                   - v_expected_pct,
                 2)
  WHERE gm.group_id = p_group_id AND gm.status = 'active';

  -- Save previous ranks before updating
  UPDATE group_members
  SET prev_rank = rank_in_group
  WHERE group_id = p_group_id;

  -- Assign new ranks based on total_deposited descending
  UPDATE group_members gm
  SET rank_in_group = ranks.new_rank
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY group_id
             ORDER BY total_deposited DESC, joined_at ASC
           ) AS new_rank
    FROM group_members
    WHERE group_id = p_group_id AND status = 'active'
  ) ranks
  WHERE gm.id = ranks.id;

  -- Update group's aggregate stats for the leaderboard
  UPDATE groups
  SET
    target_pct       = ROUND((total_saved::DECIMAL / target_amount) * 100, 2),
    avg_member_lead  = (
      SELECT ROUND(AVG(avg_lead), 2)
      FROM group_members
      WHERE group_id = p_group_id AND status = 'active'
    ),
    leaderboard_prev_rank = leaderboard_rank
  WHERE id = p_group_id;

  -- Refresh global leaderboard ranks
  UPDATE groups g
  SET leaderboard_rank = ranks.new_rank
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY avg_member_lead DESC) AS new_rank
    FROM groups
    WHERE status IN ('active','locked')
  ) ranks
  WHERE g.id = ranks.id;

END;
$$ LANGUAGE plpgsql;


-- FUNCTION: join_group
-- Adds a user to a group if there is space
-- ============================================================
CREATE OR REPLACE FUNCTION join_group(p_user_id UUID, p_group_id UUID)
RETURNS UUID AS $$
DECLARE
  v_group       RECORD;
  v_member_id   UUID;
BEGIN
  SELECT * INTO v_group FROM groups WHERE id = p_group_id;

  IF v_group.status != 'open' THEN
    RAISE EXCEPTION 'Group is not open for joining';
  END IF;

  IF v_group.current_members >= v_group.max_members THEN
    RAISE EXCEPTION 'Group is full';
  END IF;

  -- Check not already a member
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE user_id = p_user_id AND group_id = p_group_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'User is already in this group';
  END IF;

  -- Add member
  INSERT INTO group_members (group_id, user_id)
  VALUES (p_group_id, p_user_id)
  RETURNING id INTO v_member_id;

  -- Update group member count
  UPDATE groups
  SET current_members = current_members + 1,
      status = CASE
        WHEN current_members + 1 >= max_members THEN 'locked'
        ELSE status
      END
  WHERE id = p_group_id;

  -- Also update cause member count
  UPDATE causes
  SET total_members = total_members + 1
  WHERE id = v_group.cause_id;

  RETURN v_member_id;
END;
$$ LANGUAGE plpgsql;


-- FUNCTION: auto_generate_group_code
-- Trigger: creates a unique code when a group is inserted
-- ============================================================
CREATE OR REPLACE FUNCTION generate_group_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW.code := 'KBS-' || NEW.duration_type || '-' ||
              LPAD(FLOOR(RANDOM() * 9999)::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_group_code
BEFORE INSERT ON groups
FOR EACH ROW
WHEN (NEW.code IS NULL)
EXECUTE FUNCTION generate_group_code();


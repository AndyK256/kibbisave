-- ============================================================
-- KIBBISAVE DATABASE SCHEMA
-- Platform: Supabase (PostgreSQL)
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone           TEXT UNIQUE NOT NULL,           -- +256771234567
  display_name    TEXT,
  avatar_url      TEXT,
  location        TEXT DEFAULT 'Uganda',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  is_active       BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- 2. CAUSES
-- A cause is the "what" - Land in Wakiso, Car, Business etc
-- Many groups can belong to one cause
-- ============================================================
CREATE TABLE causes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by      UUID REFERENCES users(id),
  title           TEXT NOT NULL,                  -- "Land in Wakiso"
  description     TEXT,                           -- creator's description
  category        TEXT NOT NULL,                  -- land / car / business / rent / travel / education / other
  location        TEXT,                           -- "Wakiso District, Uganda"
  is_public       BOOLEAN DEFAULT TRUE,
  total_raised    BIGINT DEFAULT 0,               -- UGX, sum of all group savings
  total_members   INTEGER DEFAULT 0,
  total_groups    INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. GROUPS
-- A group is the "who" - 10 people saving together
-- Every group belongs to a cause
-- ============================================================
CREATE TABLE groups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cause_id        UUID REFERENCES causes(id),
  created_by      UUID REFERENCES users(id),

  -- Identity
  name            TEXT,                           -- NULL until members agree on a name
  code            TEXT UNIQUE,                    -- auto-generated e.g. KBS-2W-041
  is_private      BOOLEAN DEFAULT FALSE,

  -- Saving parameters
  saving_range_min  BIGINT NOT NULL,              -- UGX e.g. 100000
  saving_range_max  BIGINT NOT NULL,              -- UGX e.g. 200000
  target_amount   BIGINT NOT NULL,                -- total group target UGX
  duration_type   TEXT NOT NULL,                  -- 2W / 4W / 6W / 2M / 3M / 6M / 12M
  duration_days   INTEGER NOT NULL,               -- actual number of days
  daily_rate      BIGINT NOT NULL,                -- calculated: saving_range_max / duration_days
  interest_rate   DECIMAL(5,2) DEFAULT 5.60,     -- % per annum

  -- Dates
  starts_at       TIMESTAMPTZ NOT NULL,
  closes_at       TIMESTAMPTZ NOT NULL,

  -- State machine
  -- open → locked → active → completed / expired
  status          TEXT DEFAULT 'open'
                  CHECK (status IN ('open','locked','active','completed','expired')),

  -- Members
  max_members     INTEGER DEFAULT 10,
  current_members INTEGER DEFAULT 0,

  -- Financials
  total_saved     BIGINT DEFAULT 0,               -- sum of all confirmed deposits
  target_pct      DECIMAL(5,2) DEFAULT 0,         -- total_saved / target_amount * 100

  -- Leaderboard
  leaderboard_rank      INTEGER,
  leaderboard_prev_rank INTEGER,                  -- to calculate ▲▼
  avg_member_lead       DECIMAL(6,2) DEFAULT 0,   -- avg % ahead of their daily target

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. GROUP MEMBERS
-- Junction table: one user can be in many groups
-- ============================================================
CREATE TABLE group_members (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        UUID REFERENCES groups(id),
  user_id         UUID REFERENCES users(id),

  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  status          TEXT DEFAULT 'active'
                  CHECK (status IN ('active','left','removed')),

  -- Individual progress within group
  total_deposited BIGINT DEFAULT 0,               -- their personal total in this group
  target_pct      DECIMAL(5,2) DEFAULT 0,         -- their % of group target reached
  avg_lead        DECIMAL(6,2) DEFAULT 0,         -- their % ahead / behind daily pace
  rank_in_group   INTEGER,                         -- their position in this group
  prev_rank       INTEGER,                         -- for movement arrows

  UNIQUE (group_id, user_id)
);

-- ============================================================
-- 5. TRANSACTIONS (THE LEDGER)
-- Every deposit creates TWO records here (double-entry)
-- Entry 1: DEBIT  - money leaves user's mobile money
-- Entry 2: CREDIT - money arrives in group's holding balance
-- ============================================================
CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id          UUID REFERENCES groups(id),
  user_id           UUID REFERENCES users(id),
  group_member_id   UUID REFERENCES group_members(id),

  -- Double-entry fields
  entry_type        TEXT NOT NULL
                    CHECK (entry_type IN ('debit','credit')),
  pair_id           UUID NOT NULL,                -- both entries of one deposit share this ID

  -- Amount
  amount            BIGINT NOT NULL,              -- UGX, always positive

  -- What kind of transaction
  tx_type           TEXT NOT NULL
                    CHECK (tx_type IN (
                      'deposit',       -- user depositing savings
                      'interest',      -- interest credited at completion
                      'refund',        -- money returned if group expires
                      'fee'            -- platform fee if any
                    )),

  -- Payment provider details
  status            TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','failed')),
  provider          TEXT,                         -- mtn_momo / airtel / bank
  provider_ref      TEXT,                         -- the reference number from Flutterwave
  phone_used        TEXT,                         -- which number was charged

  -- Timestamps
  initiated_at      TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at      TIMESTAMPTZ,
  failed_at         TIMESTAMPTZ,
  failure_reason    TEXT,

  -- Metadata
  note              TEXT
);

-- ============================================================
-- 6. NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  type        TEXT NOT NULL,
                -- rank_up / rank_down / deposit_confirmed /
                -- group_locked / group_completed / group_expired /
                -- new_member / target_reached
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  data        JSONB,                              -- extra data e.g. {group_id, new_rank}
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. PAYMENT METHODS (saved by user)
-- ============================================================
CREATE TABLE payment_methods (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  type        TEXT NOT NULL CHECK (type IN ('mtn_momo','airtel','bank')),
  phone       TEXT,
  bank_name   TEXT,
  account_ref TEXT,                               -- masked reference
  is_default  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES (speed up common queries)
-- ============================================================
CREATE INDEX idx_groups_cause     ON groups(cause_id);
CREATE INDEX idx_groups_status    ON groups(status);
CREATE INDEX idx_members_group    ON group_members(group_id);
CREATE INDEX idx_members_user     ON group_members(user_id);
CREATE INDEX idx_tx_group         ON transactions(group_id);
CREATE INDEX idx_tx_user          ON transactions(user_id);
CREATE INDEX idx_tx_pair          ON transactions(pair_id);
CREATE INDEX idx_tx_status        ON transactions(status);
CREATE INDEX idx_notif_user       ON notifications(user_id);

-- ============================================================
-- VIEWS (easy data access)
-- ============================================================

-- View: leaderboard
CREATE VIEW leaderboard_view AS
SELECT
  g.id,
  g.code,
  g.name,
  g.total_saved,
  g.target_amount,
  g.target_pct,
  g.avg_member_lead,
  g.leaderboard_rank,
  g.leaderboard_prev_rank,
  g.current_members,
  g.status,
  g.starts_at,
  g.closes_at,
  c.title AS cause_title,
  c.category AS cause_category
FROM groups g
JOIN causes c ON c.id = g.cause_id
WHERE g.status IN ('active','locked')
ORDER BY g.avg_member_lead DESC;

-- View: user's groups with their personal standing
CREATE VIEW user_group_standings AS
SELECT
  gm.user_id,
  gm.group_id,
  gm.total_deposited,
  gm.target_pct,
  gm.avg_lead,
  gm.rank_in_group,
  gm.prev_rank,
  g.name AS group_name,
  g.code AS group_code,
  g.target_amount,
  g.total_saved,
  g.leaderboard_rank,
  g.leaderboard_prev_rank,
  g.closes_at,
  g.starts_at,
  g.status,
  g.is_private,
  g.daily_rate,
  c.title AS cause_title,
  c.category
FROM group_members gm
JOIN groups g ON g.id = gm.group_id
JOIN causes c ON c.id = g.cause_id
WHERE gm.status = 'active';


-- ============================================================
-- KIBBISAVE — registration / password auth columns (safe to re-run)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Phone-only Join Now accounts may not have an email
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT 'Ugandan';
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN DEFAULT FALSE;

-- Backfill display helpers from existing Google names where possible
UPDATE users
SET first_name = COALESCE(first_name, NULLIF(split_part(display_name, ' ', 1), '')),
    last_name = COALESCE(
      last_name,
      NULLIF(trim(substring(display_name from position(' ' in display_name) + 1)), '')
    )
WHERE display_name IS NOT NULL
  AND (first_name IS NULL OR last_name IS NULL);

-- District mirrors location when location looks like a district name
UPDATE users
SET district = COALESCE(district, location)
WHERE district IS NULL AND location IS NOT NULL AND location <> 'Uganda';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
  ON users (phone)
  WHERE phone IS NOT NULL AND phone <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nin_unique
  ON users (nin)
  WHERE nin IS NOT NULL AND nin <> '';

CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);

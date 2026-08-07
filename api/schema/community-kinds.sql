-- Community kinds: public | private | organisation | donating
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'public';

UPDATE communities
SET kind = CASE WHEN is_public THEN 'public' ELSE 'private' END
WHERE kind IS NULL OR kind = '';

ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_kind_check;
ALTER TABLE communities
  ADD CONSTRAINT communities_kind_check
  CHECK (kind IN ('public', 'private', 'organisation', 'donating'));

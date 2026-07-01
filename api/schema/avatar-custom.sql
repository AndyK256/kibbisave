-- Run once if users table already exists (keeps custom uploads on Google sign-in)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_custom BOOLEAN DEFAULT FALSE;
